const { createProvider, Service } = require('..');

class TestService extends Service {
    test() {
    }
}

createProvider({
    port: 3005,
    serviceClasses: [TestService],
    registry: {
        port: 3006
    }
}).start();
