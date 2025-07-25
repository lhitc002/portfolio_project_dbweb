// api-auth.js
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

// ---- Core Authentication Logic ----
exports.coreLogin = async (req) => {
    const errors = validationResult(req);
    const email = req.sanitize(req.body.email);
    const password = req.sanitize(req.body.password);

    if (!errors.isEmpty()) {
        return {
            status: 400,
            error: errors.array().map(e => e.msg).join(' ')
        };
    }

    try {
        const user = await authService.getUserByEmail(email);
        if (!user) {
            return { status: 401, error: 'Invalid email or password.' };
        }

        const valid = await authService.comparePasswords(password, user.password_hash);
        if (!valid) {
            return { status: 401, error: 'Invalid email or password.' };
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        return {
            status: 200,
            success: true,
            user: { id: user.id, username: user.username }
        };
    } catch (err) {
        logger.error(`${logPrefix} Login error: ${err.message}`, { stack: err.stack });
        return { status: 500, error: 'Server error. Please try again later.' };
    }
};

exports.coreRegister = async (req) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return {
            status: 400,
            error: errors.array().map(e => e.msg).join(' ')
        };
    }

    const username = req.sanitize(req.body.username);
    const email = req.sanitize(req.body.email);
    const password = req.sanitize(req.body.password);

    try {
        const emailExists = await authService.emailExists(email);
        if (emailExists) {
            return { status: 400, error: 'Email already in use.' };
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

        return {
            status: 201,
            success: true,
            user: { id: user.id, username: user.username }
        };
    } catch (err) {
        logger.error(`${logPrefix} Registration error: ${err.message}`, { stack: err.stack });

        const errorMsg = err.code === '23505'
            ? 'Email or username already in use.'
            : 'Server error. Please try again later.';

        return { status: 500, error: errorMsg };
    }
};

exports.coreLogout = (req) => {
    return new Promise((resolve) => {
        req.session.destroy((err) => {
            if (err) {
                logger.error(`${logPrefix} Logout error: ${err.message}`, { stack: err.stack });
                resolve({ status: 500, error: 'Logout failed' });
            } else {
                resolve({ status: 200, success: true });
            }
        });
    });
};

// ---- API Endpoint Handlers ----
exports.login = async (req, res) => {
    const result = await this.coreLogin(req);
    res.status(result.status).json(result);
};

exports.register = async (req, res) => {
    const result = await this.coreRegister(req);
    res.status(result.status).json(result);
};

exports.logout = async (req, res) => {
    const result = await this.coreLogout(req);
    if (result.success) {
        res.clearCookie('connect.sid', { path: '/' });
    }
    res.status(result.status).json(result);
};

exports.routes = {
    'POST /login': [...this.validateLogin, this.login],
    'POST /register': [...this.validateRegister, this.register],
    'POST /logout': this.logout
};