const mysql = require('mysql2');
const logger = require('../logger');

const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'continuum_reader_app',
    password: process.env.DB_PASS || 'qwertyuiop',
    database: process.env.DB_NAME || 'continuum_reader',
};

let db;

/**
 * (Re)create the connection and wire up automatic reconnect on loss.
 */
function ensureConnection() {
    db = mysql.createConnection(config);

    db.connect(err => {
        if (err) {
            logger.error('DB Connection error', { error: err });
            return;
        }
        logger.info('DB Connected');
    });

    db.on('error', err => {
        logger.error('DB error event', { code: err.code, message: err.message });
        // If connection lost, recursively reconnect
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.fatal) {
            ensureConnection();
        } else {
            throw err;
        }
    });
}

// initialize first connection
ensureConnection();

const query = (sql, params = []) => {
    // if the socket is closed, mysql2 sets state to 'disconnected'
    if (db.state === 'disconnected') {
        logger.warn('DB was disconnected; reconnecting before query');
        ensureConnection();
    }

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

/**
 * Forcefully close the DB connection
 * (Used for testing)
 */
const destroy = () => {
    if (db && db.state !== 'disconnected') {
        db.destroy();
    }
};

module.exports = { query, destroy, db };