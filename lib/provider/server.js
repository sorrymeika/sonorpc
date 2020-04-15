
const net = require('net');

const { parseInvoker } = require('../data/parser');
const { formatData } = require('../data/formater');
const socketUtils = require('../socket-utils');

function createServer(app) {
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
            const service = at(app.service, keys);
            if (!service) {
                result = { __typeof: 'ERROR', success: false, code: 'SERVICE_NOT_EXISTS', message: invoker.serviceName + '服务未定义' };
            } else {
                // 获取服务执行方法
                const method = service[methodName];
                if (!method) {
                    result = { __typeof: 'ERROR', success: false, code: "METHOD_NOT_EXISTS", message: invoker.serviceName + '服务未定义' };
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
                        app.logger.info(invoker, 'result:', result);
                        socketUtils.sendBlock(socket, Buffer.concat([serviceIdBuf, formatData(res)]));
                    })
                    .catch(e => {
                        app.logger.error(e);
                        socketUtils.sendBlock(socket, Buffer.concat([serviceIdBuf, formatData({
                            __typeof: 'ERROR',
                            success: false,
                            code: "INVOKE_METHOD_ERROR",
                            message: e.message,
                            stack: e.stack
                        })]));
                    });
            } else {
                app.logger.info(invoker, 'result:', result);
                socketUtils.sendBlock(socket, Buffer.concat([serviceIdBuf, formatData(result)]));
            }
        });
    })
        .on('error', (err) => {
            // 错误处理
            if (err.code === 'EADDRINUSE') {
                app.logger.error('Address in use', err);
            } else {
                app.logger.error(err);
            }
            throw err;
        });

    return server;
}

exports.createServer = createServer;

function at(data, paths) {
    for (let i = 0, len = paths.length; i < len; i++) {
        if (data == null)
            return undefined;
        data = data[paths[i]];
    }
    return data;
}