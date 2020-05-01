const Connection = require('./connection');

module.exports = (app, provider) => {
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
        async useDaoTransaction(fn) {
            let result;
            const connection = await this.pool.getConnection();
            const transactionConnection = new Connection(connection);
            const dao = provider.fromModules(app, provider.daoModules, [transactionConnection]);

            try {
                result = await fn(transactionConnection, dao);
                await connection.commit();
            } catch (e) {
                await connection.rollback();
            }

            connection.release();
            return result;
        }
    };
};