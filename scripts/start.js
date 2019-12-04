const net = require('net');
const { parseInvoker } = require('../lib/data/parser');
const socketUtils = require('../lib/socket-utils');
const port = 3005;

const server = net.createServer((socket) => {
    console.log(socket.remoteAddress);

    // socket.setTimeout(3000);
    socket.on('timeout', () => {
        console.log('socket timeout');
        socket.end('goodbye\n');
    });

    socketUtils.onReceiveBlock(socket, (type, buf) => {
        console.log(buf);
        const invoker = parseInvoker(buf);

        console.log(invoker);

        socket.write('disconnect client');
    });
}).on('error', (err) => {
    // handle errors here
    if (err.code === 'EADDRINUSE') {
        console.log('Address in use', err);
    }
    throw err;
});

// grab an arbitrary unused port.
server.listen(port, () => {
    console.log('opened server on', server.address());
});
