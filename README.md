# sonorpc
nodejs rpc


## 简介

sonorpc是一个轻量级、高性能的node rpc框架，由Registry(注册中心)、Provider(服务提供者)、Consumer(服务消费者)组成，提供远程方法调用、负载均衡、服务自动注册和发现功能。

## 如何使用

`npm install sonorpc`

## Provider服务提供者

### 创建服务

app/config.js

```javascript
exports.mysql = {
    host: '',
    user: '',
    password: '',
    database: '',
};
```

app/service/demo.js

```javascript
const { Service } = requie("sonorpc");

class DemoService extends Service {
    async sayHello(arg1, arg2) {
        const result = await this.app.mysql.query('select * from user');
        return {
            success: true,
            data: result
        };
    }
}
```

### 启动Provider服务

scripts/start.js

```javascript
require('sonorpc').startProvider();
```


## Registry注册中心

scripts/registry.js

```javascript
const { startRegistry } = require('sonorpc');

startRegistry({
    port: 3006
});
```


## Consumer服务消费者

### 创建消费者

consumer.js

```javascript
const { registerConsumer } = require('sonorpc');

const consumer = registerConsumer({
    // 服务提供者名称
    providerName: 'user',
    registry: {
        port: 3006
    }
});

module.exports = consumer;
```

### 调用服务

service/DemoService.js

```javascript
const consumer = require('../consumer');

class DemoService {
    testMe(...args) {
        return consumer.invoke('demo.testMe', args);
    }
}
```