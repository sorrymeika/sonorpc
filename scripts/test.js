const net = require('net');
const { formatInvoker } = require('../lib/data/formater');
const socketUtils = require('../lib/socket-utils');

const port = 3005;

const client = net.createConnection({ port, timeout: 1000 }, () => {
    // 'connect' listener
    console.log('connected to server!');

    const invoker = formatInvoker('user.getUserInfo', ['中午', 2, { name: 1, values: "tt" }]);

    console.log(invoker);

    socketUtils.sendBlock(client, invoker.content);
});

socketUtils.onReceiveBlock(client, (type, data) => {
    console.log(data.toString());
    client.end();
});

client
    .on('end', () => {
        console.log('disconnected from server');
    })
    .on('error', (err) => {
        console.log('error:', err);
    })
    .on('close', () => {
        console.log('close connection');
    });
