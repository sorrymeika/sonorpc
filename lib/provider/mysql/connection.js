const mysql = require('mysql2/promise');

class Connection {
    constructor(connection) {
        this._connection = connection;
    }

    async query(sql, values, reutrnFields = false) {
        sql = this.queryFormat(sql, values);
        const result = await this._connection.query(sql);
        return reutrnFields ? result : result[0];
    }

    select(columns, tableName, {
        where,
        orderBy,
        limit
    } = {}) {
        let whereSql = this.where(where);
        let limitSql = '';

        if (typeof limit === 'number') {
            limitSql = " limit " + limit;
        } else if (Array.isArray(limit) && limit.length <= 2 && limit.every(num => typeof num === 'number')) {
            limitSql = " limit " + limit.join(',');
        }
        let orderBySql = this.orderBy(orderBy);

        return this.query(
            'select ' + mysql.escapeId(columns) +
            ' from ' + mysql.escapeId(tableName) +
            (whereSql ? ' where ' + whereSql : '') +
            orderBySql +
            limitSql
        );
    }

    async selectPage(columns, tableName, {
        where,
        orderBy,
        pageIndex = 1,
        pageSize = 10
    } = {}) {
        let whereSql = this.where(where);
        let limitSql = ` limit ${(pageIndex - 1) * pageSize},${pageSize}`;

        tableName = mysql.escapeId(tableName);
        let orderBySql = this.orderBy(orderBy);

        const [[{ total }], data] = await Promise.all([
            this.query('select count(1) as total from ' + tableName + (whereSql ? ' where ' + whereSql : '')),
            this.query('select ' + mysql.escapeId(columns) + ' from ' + tableName + (whereSql ? ' where ' + whereSql : '') + orderBySql + limitSql)
        ]);

        return { total, data };
    }

    insert(tableName, values) {
        const keys = Object.keys(values);
        const cols = [];
        const vals = [];
        keys.forEach((key) => {
            cols.push(mysql.escapeId(key));
            vals.push(mysql.escape(values[key]));
        });
        return this.query('insert into ' + mysql.escapeId(tableName) + '(' + cols.join(',') + ') values (' + vals.join(',') + ')');
    }

    batchInsert(tableName, values) {
        const keys = {};
        const columns = [];
        values.forEach((value) => {
            Object.keys(value)
                .forEach((key) => {
                    if (!keys[key]) {
                        keys[key] = true;
                        columns.push(key);
                    }
                });
        });

        const cols = [];
        const vals = [];
        columns.forEach((key) => {
            cols.push(mysql.escapeId(key));
        });
        values.forEach((value) => {
            const row = [];
            columns.forEach((colName) => {
                row.push(mysql.escape(value[colName]));
            });
            vals.push('(' + row.join(',') + ')');
        });
        return this.query('insert into ' + mysql.escapeId(tableName) + '(' + cols.join(',') + ') values ' + vals.join(','));
    }

    update(tableName, values, where) {
        let whereSql = this.where(where);

        return this.query(
            'update ' + mysql.escapeId(tableName) +
            ' set ' + mysql.escape(values) +
            (whereSql ? ' where ' + whereSql : '')
        );
    }

    delete(tableName, where) {
        let whereSql = this.where(where);
        return this.query('delete from ' + mysql.escapeId(tableName) + (whereSql ? ' where ' + whereSql : ''));
    }

    where(where, isAnd = true) {
        const whereSql = [];
        const whereKeys = Object.keys(where);

        whereKeys.forEach((key) => {
            const value = where[key];
            if (value !== undefined) {
                if (key == 'or') {
                    const orWhere = this.where(value, false);
                    orWhere && whereSql.push('(' + orWhere + ')');
                } else if (key == 'and') {
                    const andWhere = this.where(value, true);
                    andWhere && whereSql.push('(' + andWhere + ')');
                } else if (key.includes('?')) {
                    whereSql.push(this.queryFormat(key, Array.isArray(value) ? value : [value]));
                } else if (Array.isArray(value)) {
                    whereSql.push(mysql.escapeId(key) + ' in (' + mysql.escape(value) + ')');
                } else {
                    whereSql.push(mysql.escapeId(key) + '=' + mysql.escape(value));
                }
            }
        });

        return whereSql.join(isAnd ? ' and ' : ' or ');
    }

    orderBy(orderBy) {
        let orderBys = [];
        if (orderBy && Object.getPrototypeOf(orderBy) === Object.prototype) {
            for (let key in orderBy) {
                orderBys.push(mysql.escapeId(key) + (orderBy[key] == true || orderBy[key] == 'asc' ? ' asc' : ' desc'));
            }
        }
        return orderBys.length == 0 ? '' : ` order by ${orderBys.join(',')}`;
    }

    queryFormat(query, values) {
        if (!values) return query;
        let sql = '';

        if (query.indexOf('?') !== -1) {
            let index = 0;
            const escapeIdParts = query.split('??');

            for (let i = 0; i < escapeIdParts.length; i++) {
                const escapeIdPart = escapeIdParts[i];
                let after = "";

                if (i !== escapeIdParts.length - 1) {
                    after += mysql.escapeId(values[index]);
                    index++;
                }

                const escapeParts = escapeIdPart.split('?');

                for (let j = 0; j < escapeParts.length; j++) {
                    sql += escapeParts[j];

                    if (j !== escapeParts.length - 1) {
                        sql += mysql.escape(values[index]);
                        index++;
                    }
                }

                sql += after;
            }
        } else {
            let r = Array.isArray(values) ? /@p(\d+)/g : /\{([\w_]+)\}/g;
            let m;
            let start = 0;

            while (m = r.exec(query)) {
                sql += query.slice(start, m.index);
                start = m.index + m[0].length;
                sql += mysql.escape(values[m[1]]);
            }

            sql += query.slice(start);
        }
        return sql;
    }
}

module.exports = Connection;