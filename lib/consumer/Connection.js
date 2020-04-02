const net = require('net');
const { parseResult } = require('../data/parser');
const { formatInvoker } = require('../data/formater');
const socketUtils = require('../socket-utils');
const { callbackOnce } = require('../util');

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

module.exports = Connection;