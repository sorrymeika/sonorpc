module.exports = class Service {
    constructor({ logger, ctx }) {
        this.ctx = ctx;
        this.logger = logger;
    }
};