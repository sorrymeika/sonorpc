const net = require('net');
const { parseInvoker } = require('./data/parser');
const { formatData } = require('./data/formater');

class Registry {
    constructor({
        logger,
        port,
        timeout = 3000
    }) {
        this.port = port;
        this.logger = logger || console;
        this.providers = [];

        // 启动注册监听服务
        const server = net.createServer((socket) => {
            socket.setTimeout(timeout);
            socket.on('timeout', () => {
                this.logger.info('socket timeout');
                socket.end();
            });

            socket.on('data', (buf) => {
                // console.log(buf);

                // 调用执行方法
                const invoker = parseInvoker(buf);
                switch (invoker.serviceName) {
                    case 'registerProvider':
                        this.registerProvider(invoker.args[0]);
                        socket.write(Buffer.from([0]));
                        break;
                    case 'getProvider':
                        socket.write(formatData(this.getProvider()));
                        break;
                }
            });
        });
        this.server = server;
    }

    start(cb) {
        this.server.listen(this.port, () => {
            this.logger.info('opened registry on', this.server.address());
            cb && cb();
        });
        return this;
    }

    registerProvider({ host, port }) {
        let provider = this.providers.find((provider) => (provider.host === host && provider.port === port));
        if (!provider) {
            provider = {
                host,
                port
            };
            this.providers.push(provider);
        }
        provider.r_expireAt = Date.now() + 10000;
    }

    getProvider() {
        return this.providers.find((provider) => (provider.r_expireAt > Date.now()));
    }
}

exports.startRegistry = function startRegistry(options, cb) {
    new Registry(options)
        .start(cb);
};