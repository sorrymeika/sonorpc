const Connection = require('./connection');

module.exports = () => {
    let mysqlPool;

    return {
        get mysql() {
            if (!mysqlPool) {
                mysqlPool = require('mysql2/promise').createPool({
                    decimalNumbers: true,
                    supportBigNumbers: true,
                    ...this.config.mysql,
                });
            }
            return mysqlPool;
        },
        async transaction(fn) {
            if (this.transactionConnection) {
                return fn(this.transactionConnection);
            }

            let result;
            const connection = await this.pool.getConnection();
            const transactionConnection = new Connection(this);
            this.transactionConnection = transactionConnection;

            try {
                result = await fn(transactionConnection);
                await connection.commit();
            } catch (e) {
                await connection.rollback();
            }

            this.transactionConnection = null;
            connection.release();
            return result;
        }
    };
};