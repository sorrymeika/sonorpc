const net = require('net');

const { parseResult, parseData } = require('./data/parser');
const { formatInvoker } = require('./data/formater');
const socketUtils = require('./socket-utils');

function callbackOnce(callback) {
    return (err, data) => {
        if (callback) {
            callback(err, data);
            callback = null;
        }
    };
}

class Connection {
    constructor(options) {
        this.options = {
            expire: options.expire || 60 * 1000,
            ...options
        };

        this.logger = options.logger;
        this.busy = -1;
        this.services = {};
        this.destroyListeners = [];
        this.isDestroyed = false;
    }

    connect(callback) {
        const cb = callbackOnce(callback);
        const {
            host,
            port
        } = this.options;

        const client = net.createConnection({ host, port }, () => {
            this.busy++;
            cb(null, this);
            console.log('connected to provider!');
        });

        socketUtils.onReceiveBlock(client, (type, buf) => {
            if (type == 0) return;

            // 获取返回结果
            const [serviceId, data] = parseResult(buf);
            let invokeCallback;
            if (invokeCallback = this.services[serviceId]) {
                delete this.services[serviceId];
                if (data && data.__typeof === 'ERROR') {
                    invokeCallback(data);
                } else {
                    invokeCallback(null, (data && data.value) || undefined);
                }
            }
            this.busy--;
            if (this.busy < 0) this.busy = 0;
        });

        client.on('error', (err) => {
            this.destroy();
            cb(err);
        })
            .on('close', () => {
                console.log('close connection');
                this.destroy();
            });

        this.client = client;
    }

    invoke(serviceName, args, cb) {
        this.busy++;

        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => {
            this.end();
        }, this.options.expire);

        const invoker = formatInvoker(serviceName, args);
        const { serviceId } = invoker;

        if (cb) {
            this.services[serviceId] = cb;
        }
        return socketUtils.sendBlock(this.client, invoker.content, (err) => {
            if (err) {
                delete this.services[serviceId];
                this.busy--;
                cb && cb(err);
            }
        });
    }

    end() {
        this.destroy();
        this.client.end();
    }

    onDestroy(callback) {
        this.destroyListeners.push(callback);
    }

    destroy() {
        if (!this.isDestroyed) {
            this.isDestroyed = true;
            this.destroyListeners.forEach((destroy) => destroy());
        }
    }
}

function createConnection(options, callback) {
    const connection = new Connection(options);
    connection.connect(callback);
}

class Consumer {
    constructor(options) {
        this.options = {
            maxConnections: options.maxConnections || 4,
            expire: options.expire || 60 * 1000,
        };
        this.registry = options.registry;
        this.providerName = options.providerName;
        this.connections = [];
        this.logger = options.logger || console;
    }

    invoke(serviceName, args, callback) {
        if (!callback) {
            return new Promise((resolve, reject) => {
                this.invoke(serviceName, args, (err, data) => {
                    err ? reject(err) : resolve(data);
                });
            });
        }
        const cb = (err, data) => {
            this.logger.info('invoke:', serviceName, args, ' \nresult:', err, data);
            callback(err, data);
        };
        const idleConn = this.connections.find((conn) => conn.busy === 0 && !conn.isDestroyed);
        if (idleConn) {
            idleConn.invoke(serviceName, args, cb);
        } else {
            this.getConnection((err, connection) => {
                if (err) {
                    cb(err);
                    return;
                }
                this.connections.push(connection);

                connection.onDestroy(() => {
                    this.removeConnection(connection);
                });
                connection.invoke(serviceName, args, (err, data) => {
                    if (this.connections.length >= this.options.maxConnections) {
                        connection.end();
                    }
                    cb(err, data);
                });
            });
        }
    }

    getProvider(cb) {
        const callback = callbackOnce(cb);
        const { registry } = this;
        const registryClient = net.createConnection({
            host: registry.host,
            port: registry.port,
            timeout: 1000
        }, () => {
            this.logger.info('connected to registry!');
            socketUtils.sendBlock(registryClient, formatInvoker('getProvider', [this.providerName]).content);
        })
            .on('error', (err) => {
                callback(err);
            })
            .on('timeout', () => {
                callback(new Error('TIMEOUT'));
                registryClient.end();
            });

        socketUtils.onReceiveBlock(registryClient, (type, buf) => {
            registryClient.end();
            if (type == 0) return;

            const provider = parseData(buf);
            if (!provider || !provider.value) {
                callback(new Error('PROVIDER_NOT_EXISTS:' + this.providerName));
                return;
            }
            callback(null, provider.value);
        });
    }

    getConnection(callback) {
        this.getProvider((err, providerOptions) => {
            if (err) {
                callback(err);
                return;
            }

            createConnection({
                ...providerOptions,
                expire: this.options.expire,
                logger: this.logger
            }, callback);
        });
    }

    removeConnection(connection) {
        for (let i = this.connections.length; i >= 0; i--) {
            if (this.connections[i] == connection) {
                this.connections.splice(i, 1);
                break;
            }
        }
    }
}

exports.registerConsumer = function registerConsumer(options) {
    const consumer = new Consumer(options);
    return {
        invoke: consumer.invoke.bind(consumer)
    };
};