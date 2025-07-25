// api-auth.js controller
const { body, validationResult } = require('express-validator');
const logger = require('../logger');
const authService = require('../services/authService');

const logPrefix = '[API-AUTH]';

// ---- Validation Rules ----
exports.validateRegister = [
    body('username').notEmpty().withMessage('Username is required.'),
    body('email').isEmail().withMessage('Invalid email.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Passwords do not match.');
        }
        return true;
    })
];

exports.validateLogin = [
    body('email').isEmail().withMessage('A valid email is required.'),
    body('password').notEmpty().withMessage('Password is required.')
];

// ---- API Handlers ----
exports.login = async (req, res) => {
    logger.info(`${logPrefix} POST /api/login - Handling API login`);

    const errors = validationResult(req);
    const email = req.sanitize(req.body.email);
    const password = req.sanitize(req.body.password);

    if (!errors.isEmpty()) {
        const errorMsg = errors.array().map(e => e.msg).join(' ');
        logger.warn(`${logPrefix} Validation failed: ${errorMsg}`);
        return res.status(400).json({ error: errorMsg });
    }

    try {
        const user = await authService.getUserByEmail(email);

        if (!user) {
            logger.warn(`${logPrefix} Invalid login attempt for email: ${email}`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = await authService.comparePasswords(password, user.password_hash);
        if (!valid) {
            logger.warn(`${logPrefix} Password mismatch for user: ${user.id}`);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        logger.info(`${logPrefix} API login successful for user: ${user.id}`);
        return res.json({
            success: true,
            user: { id: user.id, username: user.username }
        });
    } catch (err) {
        logger.error(`${logPrefix} Login error: ${err.message}`, { stack: err.stack });
        return res.status(500).json({ error: 'Internal server error' });
    }
};

exports.register = async (req, res) => {
    logger.info(`${logPrefix} POST /api/register - Handling API registration`);
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const errorMsg = errors.array().map(e => e.msg).join(' ');
        logger.warn(`${logPrefix} Validation errors: ${errorMsg}`);
        return res.status(400).json({ error: errorMsg });
    }

    const { username, email, password } = req.body;

    try {
        const emailExists = await authService.emailExists(email);
        if (emailExists) {
            logger.warn(`${logPrefix} Email conflict: ${email}`);
            return res.status(409).json({ error: 'Email already in use' });
        }

        const hash = await authService.hashPassword(password);
        const user = await authService.createUser({
            username,
            email,
            password_hash: hash
        });

        if (!user || !user.id) {
            throw new Error('User creation failed');
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        logger.info(`${logPrefix} API registration success: ${user.id}`);
        return res.status(201).json({
            success: true,
            user: { id: user.id, username: user.username }
        });
    } catch (err) {
        logger.error(`${logPrefix} Registration error: ${err.message}`, { stack: err.stack });

        const status = err.code === '23505' ? 409 : 500;
        const message = err.code === '23505'
            ? 'Username or email already exists'
            : 'Internal server error';

        return res.status(status).json({ error: message });
    }
};

exports.logout = (req, res) => {
    logger.info(`${logPrefix} POST /api/logout - Handling API logout`);
    req.session.destroy((err) => {
        if (err) {
            logger.error(`${logPrefix} Logout error: ${err.message}`, { stack: err.stack });
            return res.status(500).json({ error: 'Logout failed' });
        }

        res.clearCookie('connect.sid', { path: '/' });
        logger.info(`${logPrefix} API logout successful`);
        return res.json({ success: true });
    });
};

// Route configuration
exports.routes = {
    'POST /login': ['validateLogin', 'login'],
    'POST /register': ['validateRegister', 'register'],
    'POST /logout': 'logout'
};