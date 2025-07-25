// auth.js
const logger = require('../logger');
const apiAuth = require('./api-auth');
const { baseUrl } = require('../config/appSettings');

const logPrefix = '[AUTH]';

// ---- Validation Rules ----
exports.validateRegister = apiAuth.validateRegister;
exports.validateLogin = apiAuth.validateLogin;

// ---- Login ----
exports.loginForm = (req, res) => {
    logger.info(`${logPrefix} GET /login - Rendering login form`);
    res.render(`${baseUrl}/auth/login`, { error: null, formData: {} });
};

exports.loginPost = async (req, res) => {
    logger.info(`${logPrefix} POST /login - Handling login request`);

    const result = await apiAuth.coreLogin(req);

    if (result.success) {
        logger.info(`${logPrefix} Login successful: ${req.session.username} (ID: ${req.session.userId})`);
        return res.redirect(`${baseUrl}/users/${req.session.username}`);
    }

    logger.warn(`${logPrefix} Login failed: ${result.error}`);
    return res.status(result.status).render('auth/login', {
        error: result.error,
        formData: { email: req.body.email }
    });
};

// ---- Registration ----
exports.registerForm = (req, res) => {
    logger.info(`${logPrefix} GET /register - Rendering registration form`);
    res.render('auth/register', { error: null, formData: {} });
};

exports.registerPost = async (req, res) => {
    logger.info(`${logPrefix} POST /register - Received registration request`);

    const result = await apiAuth.coreRegister(req);

    if (result.success) {
        logger.info(`${logPrefix} Registration successful: ${req.session.username} (ID: ${req.session.userId})`);
        return res.redirect(`${baseUrl}/users/${req.session.username}`);
    }

    logger.warn(`${logPrefix} Registration failed: ${result.error}`);
    return res.status(result.status).render('auth/register', {
        error: result.error,
        formData: {
            username: req.body.username,
            email: req.body.email
        }
    });
};

exports.logout = async (req, res) => {
    logger.info(`${logPrefix} POST /logout - Handling logout`);

    const result = await apiAuth.coreLogout(req);

    if (result.success) {
        res.clearCookie('connect.sid', { path: '/' });
        logger.info(`${logPrefix} Session destroyed and cookie cleared`);
        return res.redirect(`${baseUrl}/auth/login`);
    }

    logger.error(`${logPrefix} Logout failed: ${result.error}`);
    return res.status(result.status).send('Logout failed');
};

// FIXED: Use function references instead of strings
exports.routes = {
    'GET /login': this.loginForm,
    'POST /login': [...this.validateLogin, this.loginPost],
    'GET /register': this.registerForm,
    'POST /register': [...this.validateRegister, this.registerPost],
    'POST /logout': this.logout
};