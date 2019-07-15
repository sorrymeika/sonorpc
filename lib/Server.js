const net = require('net');

class Server {
    constructor() {
    }

    parse(data) {
        //name.action(234,456,789)\n
    }

    run(port) {
        const server = net.createServer((socket) => {
            socket.setTimeout(3000);
            socket.on('timeout', () => {
                console.log('socket timeout');
                socket.end('goodbye\n');
            });

            socket.on('data', (buf) => {
                console.log(buf);

            });
        }).on('error', (err) => {
            // handle errors here
            if (e.code === 'EADDRINUSE') {
                console.log('Address in use');
            }
            throw err;
        });

        // grab an arbitrary unused port.
        server.listen(port, () => {
            console.log('opened server on', server.address());
        });
    }
}

module.exports = exports = Server;