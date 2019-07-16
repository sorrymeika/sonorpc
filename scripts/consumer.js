const { registerConsumer } = require('../lib');

const consumer = registerConsumer({
    port: 3006
});

consumer.invoke('test.test', []);