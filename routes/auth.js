const { body, validationResult } = require('express-validator');
const logger = require('../logger');
const authService = require('../services/authService');

const logPrefix = '[AUTH]';

// ---- Registration Form Validator ----
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

// ---- Login Form Validator ----
exports.validateLogin = [
    body('email').isEmail().withMessage('A valid email is required.'),
    body('password').notEmpty().withMessage('Password is required.')
];

// ---- Login ----
exports.loginForm = (req, res) => {
    logger.info(`${logPrefix} GET /login - Rendering login form`);
    res.render('auth/login', { error: null, formData: {} });
};

exports.loginPost = async (req, res) => {
    logger.info(`${logPrefix} POST /login - Handling login request`);

    const errors = validationResult(req);
    const email = req.sanitize(req.body.email);
    const password = req.sanitize(req.body.password);

    logger.info(`${logPrefix} Login attempt: email=${email}, hasPassword=${!!password}`);

    if (!errors.isEmpty()) {
        const errorMsg = errors.array().map(e => e.msg).join(' ');
        logger.warn(`${logPrefix} Validation failed: ${errorMsg}`);
        return handleAuthError(req, res, 'auth/login', 400, errorMsg, { email });
    }

    try {
        logger.info(`${logPrefix} Querying for user with email: ${email}`);
        const user = await authService.getUserByEmail(email);

        if (!user) {
            logger.warn(`${logPrefix} No user found for email: ${email}`);
            return handleAuthError(req, res, 'auth/login', 401, 'Invalid email or password.', { email });
        }

        logger.info(`${logPrefix} User found: ID=${user.id}, Username=${user.username}`);
        logger.info(`${logPrefix} Comparing passwords...`);
        const valid = await authService.comparePasswords(password, user.password_hash);

        if (!valid) {
            logger.warn(`${logPrefix} Password mismatch for user: ${user.username}`);
            return handleAuthError(req, res, 'auth/login', 401, 'Invalid email or password.', { email });
        }

        req.session.userId = user.id;
        req.session.username = user.username;
        logger.info(`${logPrefix} Login successful: ${user.username} (ID: ${user.id})`);

        return handleAuthSuccess(req, res, `/users/${user.username}`);
    } catch (err) {
        logger.error(`${logPrefix} ERROR during login: ${err.message}`, { stack: err.stack });
        return handleAuthError(req, res, 'auth/login', 500, 'Server error. Please try again later.', { email });
    }
};

// ---- Registration ----
exports.registerForm = (req, res) => {
    logger.info(`${logPrefix} GET /register - Rendering registration form`);
    res.render('auth/register', { error: null, formData: {} });
};

exports.registerPost = async (req, res) => {
    logger.info(`${logPrefix} POST /register - Received registration request`);
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const errorMsg = errors.array().map(e => e.msg).join(' ');
        logger.warn(`${logPrefix} Validation errors: ${errorMsg}`);
        return res.status(400).render('auth/register', {
            error: errorMsg,
            formData: req.body
        });
    }

    const username = req.sanitize(req.body.username);
    const email = req.sanitize(req.body.email);
    const password = req.sanitize(req.body.password);

    logger.info(`${logPrefix} Registration attempt: username=${username}, email=${email}`);

    try {
        logger.info(`${logPrefix} Checking email uniqueness: ${email}`);
        const emailExists = await authService.emailExists(email);

        if (emailExists) {
            logger.warn(`${logPrefix} Email already in use: ${email}`);
            return res.status(400).render('auth/register', {
                error: 'Email already in use.',
                formData: { username, email }
            });
        }

        logger.info(`${logPrefix} Hashing password...`);
        const hash = await authService.hashPassword(password);
        logger.info(`${logPrefix} Password hashed successfully`);

        logger.info(`${logPrefix} Creating user: ${username}`);
        const result = await authService.createUser({ username, email, password_hash: hash });

        if (!result || !result.id) {
            throw new Error('Failed to create user');
        }

        req.session.userId = result.id;
        req.session.username = username;
        logger.info(`${logPrefix} User created: ID=${result.id}, Username=${username}`);

        res.redirect(`/users/${username}`);
    } catch (err) {
        logger.error(`${logPrefix} ERROR during registration: ${err.message}`, { stack: err.stack });

        const errorMsg = err.code === '23505'
            ? 'Email or username already in use.'
            : 'Server error. Please try again later.';

        res.status(500).render('auth/register', {
            error: errorMsg,
            formData: { username, email }
        });
    }
};

exports.logout = (req, res) => {
    logger.info(`${logPrefix} POST /logout - Handling logout`);
    req.session.destroy((err) => {
        if (err) {
            logger.error(`${logPrefix} ERROR destroying session: ${err.message}`, { stack: err.stack });
            return res.status(500).send('Server error.');
        }
        res.clearCookie('connect.sid', { path: '/' });
        logger.info(`${logPrefix} Session destroyed and cookie cleared`);
        res.redirect('login');
    });
};

// Helper functions
function handleAuthError(req, res, view, status, error, formData = {}) {
    if (req.accepts('json')) {
        return res.status(status).json({ error });
    }
    return res.status(status).render(view, { error, formData });
}

function handleAuthSuccess(req, res, redirectPath) {
    if (req.accepts('json')) {
        return res.json({ success: true, redirect: redirectPath });
    }
    return res.redirect(redirectPath);
}

exports.routes = {
    'GET /login': 'loginForm',
    'POST /login': ['validateLogin', 'loginPost'],
    'GET /register': 'registerForm',
    'POST /register': ['validateRegister', 'registerPost'],
    'POST /logout': 'logout'
};