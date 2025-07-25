const { createLogger, format, transports } = require('winston');

// Circular reference replacer for JSON
const circularReplacer = () => {
    const seen = new WeakSet();
    return (key, value) => {
        if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);
        }
        return value;
    };
};

const logFormat = format.printf(({ timestamp, level, message, ...meta }) => {
    const msg = typeof message === 'string' ? message : JSON.stringify(message, circularReplacer(), 2);

    // Handle circular references in meta
    const metaStr = Object.keys(meta).length
        ? '\n' + JSON.stringify(meta, circularReplacer(), 2)
        : '';

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