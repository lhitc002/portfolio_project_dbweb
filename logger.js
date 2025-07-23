const { createLogger, format, transports } = require('winston');

const logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp(),
        format.printf(({ timestamp, level, message, ...meta }) =>
            `${timestamp} [${level.toUpperCase()}] ${message}` +
            (Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '')
        )
    ),
    transports: [
        new transports.Console(),
    ],
});

module.exports = logger;
