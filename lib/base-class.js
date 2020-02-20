module.exports = class BaseClass {
    constructor(app) {
        this.app = app;
        this.logger = app.logger;
        this.schema = app.schema;
    }
};