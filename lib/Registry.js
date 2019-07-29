const net = require('net');
const { parseInvoker } = require('./data/parser');
const { formatData } = require('./data/formater');

class Registry {
    constructor({
        logger,
        port
    }) {
        this.port = port;
        this.logger = logger || console;
        this.providers = [];

        // 启动注册监听服务
        const server = net.createServer((socket) => {
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
                        socket.write(Buffer.from([1]));
                        break;
                    case 'getProvider':
                        socket.write(formatData(this.getProvider(invoker.args && invoker.args[0])));
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

    registerProvider({ name, host, port }) {
        let provider = this.providers.find((item) => (item.name === name && item.host === host && item.port === port));
        if (!provider) {
            provider = {
                name,
                host,
                port,
                connections: 0
            };
            this.providers.unshift(provider);
        }
        provider.r_expireAt = Date.now() + 10000;
    }

    getProvider(name) {
        const provider = this.providers.find((provider) => (provider.name === name && provider.r_expireAt > Date.now()));
        if (!provider) return null;

        provider.connections += 1;
        this.providers.sort((a, b) => a.connections - b.connections);
        return provider;
    }
}

exports.startRegistry = function startRegistry(options, cb) {
    new Registry(options)
        .start(cb);
};