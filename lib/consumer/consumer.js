const net = require('net');

const { parseData } = require('../data/parser');
const { formatInvoker } = require('../data/formater');
const socketUtils = require('../socket-utils');
const { callbackOnce } = require('../util');
const Connection = require('./Connection');

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
            const connection = new Connection({
                ...providerOptions,
                expire: this.options.expire,
                logger: this.logger
            });
            connection.connect(callback);
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

exports.createConsumer = function createConsumer(options) {
    const consumer = new Consumer(options);
    return {
        invoke: consumer.invoke.bind(consumer)
    };
};