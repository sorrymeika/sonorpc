/* eslint-disable new-cap */
const net = require('net');
const fs = require('fs');
const path = require('path');

const { parseInvoker } = require('../data/parser');
const { formatInvoker, formatData } = require('../data/formater');
const socketUtils = require('../socket-utils');
const { copyProperties } = require('../util');
const App = require('./app');

function at(data, paths) {
    for (let i = 0, len = paths.length; i < len; i++) {
        if (data == null)
            return undefined;
        data = data[paths[i]];
    }
    return data;
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

class Provider {
    constructor(config) {
        if (!config.registry) throw new Error('必须传入注册中心配置`registry`');

        this.baseDir = process.cwd();
        this.config = { ...config };
        this.clients = [];
        this.logger = console;
        this.app = new App({
            logger: this.logger
        });
        this._handleRegisterError = this._handleRegisterError.bind(this);

        this.loadInternalExtentions();
        this.loadExtentions(['./app/extend']);
        this.loadToApp('helper', ['./app/helper']);
        this.loadToApp('service', ['./app/service']);
        this.loadToApp('dao', ['./app/dao']);
        this.loadToApp('schema', ['./app/schema']);
    }

    loadInternalExtentions() {
        const { config } = this;
        if (config.mysql) {
            let mysqlPool;
            Object.defineProperty(this.app, 'mysql', {
                configurable: true,
                get() {
                    if (!mysqlPool) {
                        mysqlPool = require('mysql2/promise').createPool(config.mysql);
                    }
                    return mysqlPool;
                }
            });
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
        const properties = {};
        const classesCache = {};

        Object.defineProperty(this.app, name, {
            writable: false,
            value: properties
        });

        let count = directories.length;
        const checkend = () => {
            count--;
            if (count == 0) {
                cb && cb(properties);
            }
        };

        directories.forEach((dir) => {
            dir = path.join(this.baseDir, dir);
            deepreaddir(dir, (err, files) => {
                if (!err) {
                    files.forEach((fullpath) => {
                        const id = path.relative(dir, fullpath).replace(/\.js$/, '');
                        const mapPaths = id.split(path.sep);
                        const moduleName = mapPaths.pop();

                        let props = properties;
                        for (let j = 0; j < mapPaths.length; j++) {
                            const key = mapPaths[j];
                            props = props[key] || (props[key] = {});
                        }

                        Object.defineProperty(props, moduleName, {
                            enumerable: true,
                            get: () => {
                                if (!classesCache[id]) {
                                    const Module = require(fullpath);
                                    classesCache[id] = typeof Module === 'function' && Module.prototype
                                        ? new Module(this.app)
                                        : Module;
                                }
                                return classesCache[id];
                            }
                        });
                    });
                }
                return checkend();
            });
        });
    }

    start(cb) {
        if (!this.started) {
            this.started = true;
            this._initServer();
            this.server.listen(this.config.provider.port, () => {
                this.logger.info('opened server on', this.server.address());
                this.register();
                cb && cb();
            });
        }
    }

    _initServer() {
        const server = net.createServer((socket) => {
            socket.on('timeout', () => {
                this.logger.info('socket timeout');
                socket.end();
            });

            socketUtils.onReceiveBlock(socket, (type, buf) => {
                if (type == 0) {
                    // 心跳检测
                    socketUtils.sendHeartbeat(socket);
                    return;
                }

                const invoker = parseInvoker(buf);
                // 写入serviceId
                const serviceIdBuf = Buffer.alloc(4);
                serviceIdBuf.writeUInt32BE(invoker.serviceId);

                const keys = invoker.serviceName.split('.');
                const methodName = keys.pop();

                // 获取服务类
                let result;
                const service = at(this.app.service, keys);
                if (!service) {
                    result = { __typeof: 'ERROR', success: false, code: 'SERVICE_NOT_EXISTS', message: invoker.serviceName };
                } else {
                    // 获取服务执行方法
                    const method = service[methodName];
                    if (!method) {
                        result = { __typeof: 'ERROR', success: false, code: "METHOD_NOT_EXISTS", message: invoker.serviceName };
                    } else {
                        try {
                            result = invoker.args && invoker.args.length
                                ? method.apply(service, invoker.args)
                                : method.call(service);
                        } catch (e) {
                            result = { __typeof: 'ERROR', success: false, code: "INVOKE_METHOD_ERROR", message: e.message, stack: e.stack };
                        }
                    }
                }

                // 将结果返回给client
                if (result && typeof result.then === 'function') {
                    result
                        .then((res) => {
                            this.logger.info(invoker, 'result:', result);
                            socketUtils.sendBlock(socket, Buffer.concat([serviceIdBuf, formatData(res)]));
                        })
                        .catch(e => {
                            this.logger.error(e);
                            socketUtils.sendBlock(socket, Buffer.concat([serviceIdBuf, formatData({
                                __typeof: 'ERROR',
                                success: false,
                                code: "INVOKE_METHOD_ERROR",
                                message: e.message,
                                stack: e.stack
                            })]));
                        });
                } else {
                    this.logger.info(invoker, 'result:', result);
                    socketUtils.sendBlock(socket, Buffer.concat([serviceIdBuf, formatData(result)]));
                }
            });
        })
            .on('error', (err) => {
                // 错误处理
                if (err.code === 'EADDRINUSE') {
                    this.logger.error('Address in use', err);
                } else {
                    this.logger.error(err);
                }
                throw err;
            });
        this.server = server;
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
                .on('error', this._handleRegisterError)
                .on('close', this._handleRegisterError)
                .on('end', this._handleRegisterError)
                .on('timeout', () => {
                    client.end();
                });

            socketUtils.onReceiveBlock(client, (type) => {
                let timeout;
                if (type == 1) {
                    // 注册成功
                    timeout = 5000;
                } else {
                    timeout = 3000;
                }

                this.hbTimeout = setTimeout(() => {
                    this.hbTimeout = null;
                    this.register();
                }, timeout);
            });

            this.registryClient = client;
        } else {
            socketUtils.sendBlock(this.registryClient, info.content);
        }
    }

    _handleRegisterError() {
        this.registryClient = null;
        if (!this.hbTimeout) {
            this.hbTimeout = setTimeout(() => {
                this.register();
            }, 5000);
        }
    }
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