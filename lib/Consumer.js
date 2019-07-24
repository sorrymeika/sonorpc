const net = require('net');

const { parseResult, parseData } = require('./data/parser');
const { formatInvoker } = require('./data/formater');

class Connection {
    constructor(options) {
        this.options = {
            expire: options.expire || 60 * 1000,
            ...options
        };

        const { port } = this.options;
        const client = net.createConnection({ port }, () => {
            this.busy++;
            console.log('connected to provider!');
        });

        client
            .on('data', (buf) => {
                // console.log(buf);
                // 验证是否断连
                if ((buf.length == 1 && buf.readUInt8() === 0) || buf.length <= 4) {
                    return;
                }
                // 获取返回结果
                const [serviceId, data] = parseResult(buf);
                let cb;
                if (cb = this.services[serviceId]) {
                    delete this.services[serviceId];
                    if (data && data.__typeof === 'ERROR') {
                        cb(data);
                    } else {
                        cb(null, (data && data.value) || undefined);
                    }
                }
                this.busy--;
                if (this.busy < 0) this.busy = 0;
            })
            .on('close', () => {
                console.log('close connection');
                this.destroy();
            });

        this.busy = -1;
        this.client = client;
        this.services = {};
        this.onDestroy = [];
        this.isDestroyed = false;
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
        return this.client.write(invoker.content, (err) => {
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

    addOnDestroyListener(callback) {
        this.onDestroy.push(callback);
    }

    destroy() {
        if (!this.isDestroyed) {
            this.isDestroyed = true;
            this.onDestroy.forEach((onDestroy) => onDestroy());
        }
    }
}

function createConnection(options, callback) {
    const connection = new Connection(options);
    const client = connection.client;
    client
        .once('connect', () => {
            if (callback) {
                callback(null, connection);
                callback = null;
            }
        })
        .once('timeout', () => {
            if (callback) {
                callback(new Error('TIMEOUT'));
                callback = null;
            }
            connection.end();
        })
        .on('error', (err) => {
            if (callback) {
                callback(err);
                callback = null;
            }
        });
    return connection;
}

class Consumer {
    constructor(options) {
        this.options = {
            host: options.host,
            port: options.port,
            maxConnections: options.maxConnections || 4,
            expire: options.expire || 60 * 1000,
        };
        this.name = options.name;
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
        const idleConn = this.connections.find((conn) => conn.busy === 0);
        if (idleConn) {
            idleConn.invoke(serviceName, args, cb);
        } else if (this.connections.length >= this.options.maxConnections) {
            const connection = this.connections.sort((a, b) => a.busy - b.busy)[0];
            connection.invoke(serviceName, args, cb);
        } else {
            this.getConnection((err, connection) => {
                if (err) {
                    cb(err);
                    return;
                }
                connection.addOnDestroyListener(() => {
                    this.removeConnection(connection);
                });
                this.connections.push(connection);
                connection.invoke(serviceName, args, cb);
            });
        }
    }

    getProviderConfig(callback) {
        const { options } = this;
        const registryClient = net.createConnection({
            host: options.host,
            port: options.port,
            timeout: 1000
        }, () => {
            console.log('connected to registry!');
            registryClient.write(formatInvoker('getProvider', [this.name]).content);
        })
            .on('error', (err) => {
                callback(err);
            })
            .on('timeout', () => {
                callback(new Error('TIMEOUT'));
                registryClient.end();
            })
            .on('data', (buf) => {
                registryClient.end();

                const provider = parseData(buf);
                if (!provider || !provider.value) {
                    callback(new Error('PROVIDER_NOT_EXISTS'));
                    return;
                }
                callback(null, provider.value);
            });
    }

    getConnection(callback) {
        this.getProviderConfig((err, providerOptions) => {
            if (err) {
                callback(err);
                return;
            }

            createConnection({
                expire: this.options.expire,
                ...providerOptions
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
    return new Consumer(options);
};