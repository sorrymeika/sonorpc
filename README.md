# sonorpc
nodejs rpc


## 简介

sonorpc是一个轻量级、高性能的node rpc框架，由Registry(注册中心)、Provider(服务提供者)、Consumer(服务消费者)组成，提供远程方法调用、负载均衡、服务自动注册和发现功能。

## 如何使用

`npm install sonorpc`

```javascript
import { createProvider } from "sonorpc"
```

## Provider服务提供者

### 创建服务

DemoService.js

```javascript
const { Service } = requie("sonorpc");

class DemoService extends Service {
    async sayHello(arg1, arg2) {
        const result = await this.app.mysql.query('select * from user');
        return {
            success: true,
            data: result
        }
    }
}
```

### 启动Provider服务

scripts/start.js

```javascript
const { createProvider } = requie("sonorpc");
const provider = createProvider({
    // 注册服务提供者名称
    name: 'user',
    // 日志类示例
    logger: console,
    // 上下文
    app: {
        mysql: mysql.createPool(config.mysql)
    },
    // 监听端口
    port: 3005,
    // 服务类
    services: [DemoService],
    // 注册中心配置
    registry: {
        // 注册中心地址
        host: '127.0.0.1',
        // 注册中心端口
        port: 3006
    }
});

provider.start(() => {
    console.log('服务已启动');
});
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

DemoService.js

```javascript
const consumer = require('../consumer');

class DemoService {
    testMe(...args) {
        return new Promise((resolve, reject) => consumer.invoke('demo.testMe', args, (err, data) => {
            err ? reject(err) : resolve(data);
        }));
    }
}
```