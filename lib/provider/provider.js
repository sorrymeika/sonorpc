/* eslint-disable line-comment-position */
/* eslint-disable new-cap */
const net = require('net');
const fs = require('fs');
const path = require('path');

const { formatInvoker } = require('../data/formater');
const socketUtils = require('../socket-utils');
const { copyProperties } = require('../util');
const App = require('./app');
const { createServer } = require('./server');

const symbolInstanceCache = Symbol('sonorpc#instanceCache');

class Provider {
    constructor(config) {
        if (!config.registry) throw new Error('必须传入注册中心配置`registry`');

        this.baseDir = process.cwd();
        this.config = { ...config };
        this.clients = [];
        this.logger = console;
        this.app = new App({
            logger: this.logger,
            config: this.config
        });
        this._retryRegister = this._retryRegister.bind(this);
    }

    start(cb) {
        if (!this.started) {
            this.started = true;

            this.loadInternalExtentions();
            this.loadExtentions(['./app/extend']);
            this.loadToApp('helper', ['./app/helper']);
            this.loadToApp('service', ['./app/service']);
            this.loadToApp('schema', ['./app/schema']);
            this.loadDaoToApp(['./app/dao']);

            const server = this.server = createServer(this.app);
            server.listen(this.config.provider.port, () => {
                this.logger.info('opened server on', server.address());
                this.register();
                cb && cb();
            });
        }
    }

    loadInternalExtentions() {
        const { config } = this;
        if (config.mysql) {
            copyProperties(this.app, require('./mysql/extention')(this.app, this));
        }

        if (config.redis) {
            let redis;
            Object.defineProperty(this.app, 'redis', {
                configurable: true,
                get() {
                    if (!redis) {
                        const Redis = require('ioredis');
                        redis = new Redis(config.redis);
                    }
                    return redis;
                }
            });
        }

        if (config.redlock || (config.redis && (config.redlock = { clients: [config.redis] }))) {
            let distributedLock;
            Object.defineProperty(this.app, 'distributedLock', {
                configurable: true,
                get() {
                    if (!distributedLock) {
                        const Redis = require('ioredis');
                        const Redlock = require('redlock');
                        const { clients, ...options } = config.redlock;
                        distributedLock = new Redlock(clients.map(cfg => new Redis(cfg)), {
                            // the expected clock drift; for more details
                            // see http://redis.io/topics/distlock
                            driftFactor: 0.01, // time in ms

                            // the max number of times Redlock will attempt
                            // to lock a resource before erroring
                            retryCount: 10,

                            // the time in ms between attempts
                            retryDelay: 200, // time in ms

                            // the max time in ms randomly added to retries
                            // to improve performance under high contention
                            // see https://www.awsarchitectureblog.com/2015/03/backoff.html
                            retryJitter: 200, // time in ms
                            ...options
                        });
                    }
                    return distributedLock;
                }
            });
        }
    }

    loadExtentions(directories, cb) {
        let count = directories.length;
        const checkend = () => {
            count--;
            if (count == 0) {
                cb && cb();
            }
        };
        directories.forEach((dir) => {
            dir = path.join(this.baseDir, dir);
            fs.readdir(dir, { withFileTypes: true }, (err, files) => {
                if (!err) {
                    for (let i = 0; i < files.length; i++) {
                        const fileName = files[i].name;
                        const fullpath = path.join(dir, fileName);
                        if (files[i].isFile() && path.extname(fullpath) === '.js') {
                            copyProperties(this.app, require(fullpath));
                        }
                    }
                }
                checkend();
            });
        });
    }

    loadToApp(name, directories, cb) {
        this.loadModules(directories, (modules) => {
            this.defineModules(this.app, name, modules);
            cb && cb();
        });
    }

    loadDaoToApp(directories, cb) {
        this.loadModules(directories, (modules) => {
            this.daoModules = modules;
            this.defineModules(this.app, 'dao', modules);
            cb && cb();
        });
    }

    defineModules(context, name, modules, args) {
        const properties = this.fromModules(context, modules, args);
        Object.defineProperty(context, name, {
            writable: false,
            value: properties
        });
        return context;
    }

    fromModules(context, modules, args) {
        const properties = {};
        modules.forEach((moduleInfo) => {
            const { file, paths } = moduleInfo;
            const mapPaths = paths.slice(0, -1);
            const moduleName = paths[paths.length - 1];

            let props = properties;
            for (let j = 0; j < mapPaths.length; j++) {
                const key = mapPaths[j];
                props = props[key] || (props[key] = {});
            }

            Object.defineProperty(props, moduleName, {
                enumerable: true,
                get() {
                    const cache = context[symbolInstanceCache] || (context[symbolInstanceCache] = {});
                    if (!cache[file]) {
                        const Module = require(file);
                        cache[file] = typeof Module === 'function' && Module.prototype
                            ? args
                                ? new Module(context, ...args)
                                : new Module(context)
                            : Module;
                    }
                    return cache[file];
                }
            });
        });
        return properties;
    }

    loadModules(directories, cb) {
        const modules = [];

        let count = directories.length;
        const checkend = () => {
            count--;
            if (count == 0) {
                cb && cb(modules);
            }
        };

        directories.forEach((dir) => {
            dir = path.join(this.baseDir, dir);
            deepreaddir(dir, (err, files) => {
                if (!err) {
                    files.forEach((fullpath) => {
                        const id = path.relative(dir, fullpath).replace(/\.js$/, '');
                        modules.push({
                            file: fullpath,
                            paths: id.split(path.sep)
                        });
                    });
                }
                checkend();
            });
        });
    }

    stop(callback) {
        if (this.hbTimeout) clearTimeout(this.hbTimeout);
        this.server.close(callback);
        this.server = null;
        this.started = false;
    }

    register() {
        if (this.hbTimeout) {
            clearTimeout(this.hbTimeout);
            this.hbTimeout = null;
        }

        const info = formatInvoker('registerProvider', [this.config.provider]);

        if (!this.registryClient) {
            const client = net.createConnection(this.config.registry, () => {
                socketUtils.sendBlock(client, info.content);
            })
                .on('error', this._retryRegister)
                .on('close', this._retryRegister)
                .on('end', this._retryRegister)
                .on('timeout', () => {
                    client.end();
                });
            this.registryClient = client;
            socketUtils.onReceiveBlock(client, (type) => {
                // 注册成功每5s发送心跳，注册失败每3s重试
                const timeout = type == 1
                    ? 5000
                    : 3000;
                this.hbTimeout = setTimeout(() => {
                    this.hbTimeout = null;
                    this.register();
                }, timeout);
            });
        } else {
            socketUtils.sendBlock(this.registryClient, info.content);
        }
    }

    _retryRegister() {
        this.registryClient = null;
        if (!this.hbTimeout) {
            this.hbTimeout = setTimeout(() => {
                this.register();
            }, 5000);
        }
    }
}

function deepreaddir(dir, cb) {
    fs.readdir(dir, { withFileTypes: true }, (err, files) => {
        if (err) return cb(err);

        const result = [];
        let error = null;
        let count = files.length;
        const checkend = function () {
            count--;
            if (count == 0) {
                cb(error, result);
            }
        };

        for (let i = 0; i < files.length; i++) {
            const fullpath = path.join(dir, files[i].name);
            if (files[i].isDirectory()) {
                deepreaddir(fullpath, (err, paths) => {
                    for (let j = 0; j < paths.length; j++) {
                        result.push(paths[j]);
                    }
                    !error && (error = err);
                    checkend();
                });
            } else {
                if (path.extname(fullpath) == '.js') {
                    result.push(fullpath);
                }
                checkend();
            }
        }
    });
}

function createProvider(options) {
    const provider = new Provider(options);
    return {
        start: provider.start.bind(provider),
        stop: provider.stop.bind(provider)
    };
}
exports.createProvider = createProvider;

function startProvider() {
    const baseDir = process.cwd();
    const config = require(path.join(baseDir, './app/config.js'));
    const provider = new Provider(config);
    provider.start();
}
exports.startProvider = startProvider;

function checkProvider(providerCfg, cb) {
    const client = net.createConnection({
        host: providerCfg.host,
        port: providerCfg.port,
        timeout: providerCfg.timeout || 1000
    }, () => {
        console.log('connected to provider!');
        client.write(Buffer.from([0]));
    })
        .on('error', (err) => {
            cb && cb(err);
        })
        .on('timeout', () => {
            cb && cb(new Error('TIMEOUT'));
        })
        .on('data', (buf) => {
            if (buf.length == 1 && buf.readUInt8() === 0) {
                client.end();
                cb && cb(null);
            } else {
                cb && cb(new Error('UNKNOW_ERROR'));
            }
        });
}

exports.checkProvider = checkProvider;