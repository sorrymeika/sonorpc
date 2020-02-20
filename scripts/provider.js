const { createProvider, Service } = require('..');

class TestService extends Service {
    test() {
    }
}

createProvider({
    serviceClasses: [TestService],
    provider: {
        port: 3005,
    },
    registry: {
        port: 3006
    }
}).start();
