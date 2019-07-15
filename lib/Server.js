const net = require('net');

const { parseInvoker } = require('./data/parser');
const { formatData } = require('./data/formater');

class Server {
    constructor({
        logger,
        timeout = 3000,
        serviceClasses,
        reigstry
    }) {
        this.logger = logger || console;
        this.services = {};
        this.serviceClasses = serviceClasses.reduce((classes, serviceClass) => {
            const className = serviceClass.name.replace(/Service$/, '')
                .replace(/^[A-Z]/, (match) => {
                    return match.toLowerCase();
                });
            classes[className] = serviceClass;
            return classes;
        }, {});

        const server = net.createServer((socket) => {
            socket.setTimeout(timeout);
            socket.on('timeout', () => {
                this.logger.info('socket timeout');
                socket.end();
            });

            socket.on('data', (buf) => {
                console.log(buf);

                const invoker = parseInvoker(buf);
                console.log(invoker);

                const index = invoker.serviceName.indexOf('.');
                const className = invoker.serviceName.slice(0, index);
                const methodName = invoker.serviceName.slice(index);

                const service = this._getService(className);
                const method = service[methodName];

                const result = invoker.args && invoker.args.length
                    ? method.apply(service, invoker.args)
                    : method.call(service);

                console.log(result);

                // 写入serviceId
                const serviceIdBuf = Buffer.alloc(4);
                serviceIdBuf.writeUInt32LE(invoker.serviceId);

                // 将结果返回给client
                if (result == null) {
                    socket.write(serviceIdBuf);
                } else if (result && typeof result.then === 'function') {
                    result.then((res) => {
                        socket.write(Buffer.concat([serviceIdBuf, formatData(res)]));
                    });
                } else {
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

        reigstry && this._registerServer(reigstry);
    }

    listen(port, cb) {
        // grab an arbitrary unused port.
        this.server.listen(port, () => {
            this.logger.info('opened server on', this.server.address());
            cb && cb();
        });
    }

    close(callback) {
        this.server.close(callback);
    }

    _getService(className) {
        let service = this.services[className];
        if (!service) {
            const Service = this.serviceClasses[className];
            return (this.services[className] = new Service({
                logger: this.logger
            }));
        }
        return service;
    }

    _registerServer(registry) {
        console.log(registry);
    }
}

module.exports = exports = function createServer(options) {
    return new Server(options);
};