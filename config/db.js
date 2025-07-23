const mysql = require('mysql2');

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'continuum_reader_app',
    password: process.env.DB_PASS || 'qwertyuiop',
    database: process.env.DB_NAME || 'continuum_reader',
});

db.connect((err) => {
    if (err) throw err;
    console.log('Connected to database');
});

// Promisify the query method
const query = (sql, params) => {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
};

module.exports = { query, db };