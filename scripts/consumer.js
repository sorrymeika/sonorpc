const { registerConsumer } = require('../lib');

const consumer = registerConsumer({
    registry: {
        port: 3006
    }
});

consumer.invoke('test.test', [1, 12345667891234, false, null, undefined, { name: 'asdf' }, 'asdf', ['日']]);