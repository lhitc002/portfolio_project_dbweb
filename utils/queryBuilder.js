const { query } = require('../config/db');
const logger = require('../logger');

class QueryBuilder {
    constructor(table) {
        this.table = table;
        this.selectFields = '*';
        this.whereConditions = [];
        this.whereParams = [];
        this.orderByField = null;
        this.orderDirection = 'ASC';
        this.limitCount = null;
        this.joinClauses = [];
        this.groupByFields = [];
    }

    // SELECT clause
    select(fields) {
        this.selectFields = Array.isArray(fields) ? fields.join(', ') : fields;
        return this;
    }

    // INSERT clause
    insert(data) {
        this.insertData = data;
        return this;
    }

    // New method for dynamic field equality
    whereField(field, value) {
        this.whereConditions.push(`${field} = ?`);
        this.whereParams.push(value);
        return this;
    }

    // test trying to replicate c# linq syntax for personal convenience
    where(conditionFn) {
        const fnStr = conditionFn.toString();
        const match = fnStr.match(/m\s*=>\s*m\.([a-zA-Z_][a-zA-Z0-9_]*)\s*={2,3}\s*(.*)/);
        if (match) {
            const field = match[1];
            let value = match[2].trim();

            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            } else if (!isNaN(value)) {
                value = Number(value);
            } else {
                // skip variables or unsupported expressions
                return this;
            }

            this.whereConditions.push(`${field} = ?`);
            this.whereParams.push(value);
        }
        return this;
    }

    whereRaw(sql, params = []) {
        this.whereConditions.push(sql);
        this.whereParams.push(...params);
        return this;
    }

    orderBy(field, direction = 'ASC') {
        this.orderByField = field;
        this.orderDirection = direction.toUpperCase();
        return this;
    }

    limit(count) {
        this.limitCount = count;
        return this;
    }

    join(table, condition) {
        this.joinClauses.push(`JOIN ${table} ON ${condition}`);
        return this;
    }

    leftJoin(table, condition) {
        this.joinClauses.push(`LEFT JOIN ${table} ON ${condition}`);
        return this;
    }

    groupBy(fields) {
        this.groupByFields = Array.isArray(fields) ? fields : [fields];
        return this;
    }

    // Build and execute 
    async get() {
        const sql = [
            `SELECT ${this.selectFields} FROM ${this.table}`,
            ...this.joinClauses,                                         // JOINs
            this.whereConditions.length && `WHERE ${this.whereConditions.join(' AND ')}`,
            this.groupByFields.length && `GROUP BY ${this.groupByFields.join(', ')}`,
            this.orderByField && `ORDER BY ${this.orderByField} ${this.orderDirection}`,
            this.limitCount != null && `LIMIT ${this.limitCount}`
        ].filter(Boolean).join(' ');

        logger.debug('QueryBuilder.get()', { sql, params: this.whereParams });
        return query(sql, this.whereParams);
    }

    async insertAndGet() {
        if (!this.insertData) {
            throw new Error('No data provided to insert');
        }
        const keys = Object.keys(this.insertData);
        const values = Object.values(this.insertData);
        const columns = keys.join(', ');
        const placeholders = keys.map(() => '?').join(', ');
        const sql = `INSERT INTO ${this.table} (${columns}) VALUES (${placeholders})`;

        logger.debug('QueryBuilder.insertAndGet()', { sql, values });
        try {
            const result = await query(sql, values);
            // MySQL returns { insertId: ... } on INSERT
            return { id: result.insertId }; // Assuming the primary key is 'id'
        } catch (err) {
            logger.error('QueryBuilder.insertAndGet() failed', {
                sql,
                values,
                error: err.message
            });
            err.message = `Query failed: ${sql} | Params: ${values} | Error: ${err.message}`;
            throw err;
        }
    }

    async first() {
        const rows = await this.limit(1).get();
        return rows[0] || null;
    }

    async count() {
        const builder = new QueryBuilder(this.table);
        builder.select('COUNT(*) as count');
        builder.whereConditions = [...this.whereConditions];
        builder.whereParams = [...this.whereParams];
        builder.joinClauses = [...this.joinClauses];

        const result = await builder.get();
        return result[0]?.count || 0;
    }
}

const db = {
    table: (tableName) => new QueryBuilder(tableName),

    get: async (tableName, conditionFnOrField, value) => {
        const builder = db.table(tableName);
        if (typeof conditionFnOrField === 'function') {
            return await builder.where(conditionFnOrField).first();
        } else {
            return await builder.whereField(conditionFnOrField, value).first();
        }
    },

    find: async (tableName, ...args) => {
        const builder = db.table(tableName);
        if (typeof args[0] === 'function') {
            return await builder.where(args[0]).get();
        } else {
            return await builder.whereField(args[0], args[1]).get();
        }
    },

    all: async (tableName) => {
        return await db.table(tableName).get();
    }
};

module.exports = db;
