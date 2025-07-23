const { createLogger, format, transports } = require('winston');

const logFormat = format.printf(({ timestamp, level, message, ...meta }) => {
    const msg = typeof message === 'string' ? message : JSON.stringify(message, null, 2);
    const metaStr = Object.keys(meta).length ? '\n' + JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level.toUpperCase()}] ${msg}${metaStr}`;
});

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp(),
        logFormat
    ),
    transports: [
        new transports.Console(),
    ],
});

module.exports = logger;
