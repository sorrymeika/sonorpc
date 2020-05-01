const Connection = require('./connection');
const BaseClass = require('../../base-class');

class Dao extends BaseClass {
    constructor(app, connection) {
        super(app);
        this.connection = new Connection(connection || app.mysql);
    }
}

module.exports = Dao;