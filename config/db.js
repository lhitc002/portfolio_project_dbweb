const mysql = require('mysql2');
const logger = require('../logger');

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'continuum_reader_app',
    password: process.env.DB_PASS || 'qwertyuiop',
    database: process.env.DB_NAME || 'continuum_reader',
});

db.connect((err) => {
    if (err) {
        logger.error('DB Connection error', { error: err });
        throw err;
    }
    logger.info('DB Connected');
});

const query = (sql, params = []) => {
    logger.debug('DB Executing', { sql, params });
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) {
                logger.error('DB Query error', {
                    code: err.code,
                    message: err.sqlMessage,
                    sql,
                    params
                });
                return reject(err);
            }
            resolve(results);
        });
    });
};

module.exports = { query, db };