module.exports = class Service {
    constructor({ logger, ctx, app }) {
        this.app = app;
        this.ctx = ctx;
        this.logger = logger;
    }
};