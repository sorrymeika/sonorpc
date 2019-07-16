const net = require('net');

const { parseResult, parseData } = require('./data/parser');
const { formatInvoker } = require('./data/formater');

class Connection {
    constructor({ port, timeout }) {
        const client = net.createConnection({ port, timeout }, () => {
            this.busy++;
        });

        client
            .on('data', (buf) => {
                console.log(buf);
                // 验证是否断连
                if ((buf.length == 1 && buf.readUInt8() === 0) || buf.length <= 4) {
                    return;
                }
                // 获取返回结果
                const [serviceId, data] = parseResult(buf);
                let cb;
                if (cb = this.services[serviceId]) {
                    delete this.services[serviceId];
                    cb(data);
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

    destroy() {
        if (!this.isDestroyed) {
            this.isDestroyed = true;
            this.onDestroy.forEach((onDestroy) => onDestroy());
        }
    }

    end() {
        this.destroy();
        this.client.end();
    }

    addOnDestroyListener(callback) {
        this.onDestroy.push(callback);
    }

    invoke(serviceName, args, cb) {
        this.busy++;

        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(() => {
            this.end();
        });

        const invoker = formatInvoker(serviceName, args);
        console.log(invoker);
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
}

function createConnection(provider, callback) {
    const connection = new Connection(Object.assign({ timeout: this.options.timeout }, provider), callback);
    const client = connection.getClient();
    client
        .on('connect', () => {
            if (callback) {
                callback(null, connection);
                callback = null;
            }
        })
        .on('timeout', () => {
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
        this.options = Object.assign({
            maxConnections: 4,
            timeout: 10000
        }, options);
        this.connections = [];
    }

    getProviderConfig(callback) {
        const { options } = this;
        const client = net.createConnection({
            host: options.host,
            port: options.port,
            timeout: 1000
        }, () => {
            console.log('connected to registry!');
            client.write(formatInvoker('registerProvider').content);
        })
            .on('error', (err) => {
                callback(err);
            })
            .on('timeout', () => {
                callback(new Error('TIMEOUT'));
                client.end();
            })
            .on('data', (buf) => {
                client.end();

                const provider = parseData(buf);
                if (!provider) {
                    callback(new Error('PROVIDER_NOT_EXISTS'));
                    return;
                }
                callback(null, provider);
            });
    }

    getConnection(callback) {
        this.getProviderConfig((err, provider) => {
            if (err) {
                callback(err);
                return;
            }
            createConnection(provider, callback);
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

    invoke(serviceName, args, cb) {
        const idleConn = this.connections.find((conn) => conn.busy === 0);
        if (idleConn) {
            idleConn.invoke(serviceName, args, cb);
        } else if (this.connections.length >= this.options.maxConnections) {
            const connection = this.connections.sort((a, b) => a.busy - b.busy)[0];
            connection.invoke(serviceName, args, cb);
        } else {
            this.getConnection((err, connection) => {
                if (err) {
                    cb && cb(err);
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
}

exports.registerConsumer = function registerConsumer(options) {
    return new Consumer(options);
};