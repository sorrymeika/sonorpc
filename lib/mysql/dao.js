const Connection = require('./connection');
const BaseClass = require('../base-class');

class Dao extends BaseClass {
    constructor(app) {
        super(app);
        this.connection = new Connection(app);
    }
}

module.exports = Dao;