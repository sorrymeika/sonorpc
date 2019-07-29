const net = require('net');

const { parseInvoker } = require('./data/parser');
const { formatInvoker, formatData } = require('./data/formater');

class Provider {
    constructor({
        logger,
        port,
        name,
        serviceClasses,
        ctx,
        registry
    }) {
        this.ctx = { ...ctx };
        Object.defineProperty(this.ctx, 'service', {
            writable: false,
            value: {}
        });

        this.logger = logger || console;
        this.port = port;
        this.services = {};
        this.serviceClasses = serviceClasses.reduce((classes, serviceClass) => {
            const className = serviceClass.name.replace(/Service$/, '')
                .replace(/^[A-Z]/, (match) => {
                    return match.toLowerCase();
                });
            classes[className] = serviceClass;

            Object.defineProperty(this.ctx.service, className, {
                get: () => {
                    return this._getService(className);
                }
            });
            return classes;
        }, {});

        this.clients = [];

        const server = net.createServer((socket) => {
            socket.on('timeout', () => {
                this.logger.info('socket timeout');
                socket.end();
            });

            socket.on('data', (buf) => {
                // console.log(buf);
                if (buf.length == 1 && buf.readUInt8() === 0) {
                    socket.write(Buffer.from([0]));
                    return;
                }

                const invoker = parseInvoker(buf);
                // 写入serviceId
                const serviceIdBuf = Buffer.alloc(4);
                serviceIdBuf.writeUInt32BE(invoker.serviceId);

                const index = invoker.serviceName.indexOf('.');
                const className = invoker.serviceName.slice(0, index);
                const methodName = invoker.serviceName.slice(index + 1);

                // 获取服务类
                let result;
                const service = this._getService(className);
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
                            console.log(invoker, 'result:', result);
                            socket.write(Buffer.concat([serviceIdBuf, formatData(res)]));
                        })
                        .catch(e => {
                            console.error(e);
                            socket.write(Buffer.concat([serviceIdBuf, formatData({ __typeof: 'ERROR', success: false, code: "INVOKE_METHOD_ERROR", message: e.message, stack: e.stack })]));
                        });
                } else {
                    console.log(invoker, 'result:', result);
                    socket.write(Buffer.concat([serviceIdBuf, formatData(result)]));
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
            });
        this.server = server;
        this.name = name;
        this.registry = registry;
    }

    start(cb) {
        this.server.listen(this.port, () => {
            this.logger.info('opened server on', this.server.address());
            this._registerProvider(() => {
                this._heartbeat();
            });
            cb && cb();
        });
        return this;
    }

    stop(callback) {
        this.server.close(callback);
    }

    _getService(className) {
        let service = this.services[className];
        if (!service) {
            const ServiceClass = this.serviceClasses[className];
            return (this.services[className] = new ServiceClass({
                logger: this.logger,
                ctx: this.ctx
            }));
        }
        return service;
    }

    _registerProvider(cb) {
        const { registry } = this;
        if (!registry) throw new Error('必须传入注册中心配置`registry`');

        const client = net.createConnection({
            host: registry.host,
            port: registry.port,
            timeout: registry.timeout || 1000
        }, () => {
            const info = formatInvoker('registerProvider', [{
                name: this.name,
                host: this.server.address().address,
                port: this.port
            }]);
            // console.log(info);
            client.write(info.content);
        })
            .on('error', (err) => {
                cb && cb(err);
            })
            .on('timeout', () => {
                cb && cb(new Error('TIMEOUT'));
                client.end();
            })
            .on('data', (buf) => {
                if (buf.length == 1 && buf.readUInt8() === 0) {
                    cb && cb(null);
                } else {
                    cb && cb(new Error('UNKNOW_ERROR'));
                }
                client.end();
            });
    }

    _heartbeat() {
        if (this.hbTimeout) clearTimeout(this.hbTimeout);
        const hbCallback = () => {
            this._heartbeat();
        };
        this.hbTimeout = setTimeout(() => {
            this.hbTimeout = null;
            this._registerProvider(hbCallback);
        }, 5000);
    }
}

exports.createProvider = function createProvider(options) {
    return new Provider(options);
};

exports.checkProvider = function (providerCfg, cb) {
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
};