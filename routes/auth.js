const bcrypt = require('bcrypt');
const db = require('../utils/queryBuilder');
const { body, validationResult } = require('express-validator');
const logger = require('../logger');

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
    // Sanitize input fields
    const email = req.sanitize(req.body.email);
    const password = req.sanitize(req.body.password);

    logger.info(`${logPrefix} Login attempt: email=${email}, hasPassword=${!!password}`);

    if (!errors.isEmpty()) {
        const errorMsg = errors.array().map(e => e.msg).join(' ');
        logger.warn(`${logPrefix} Validation failed: ${errorMsg}`);
        if (req.accepts('json')) {
            return res.status(400).json({ error: errorMsg });
        }
        return res.status(400).render('auth/login', {
            error: errorMsg,
            formData: { email }
        });
    }

    try {
        logger.info(`${logPrefix} Querying database for user with email: ${email}`);
        const user = await db
            .table('users')
            .select(['id', 'username', 'email', 'password_hash'])
            .whereField('email', email)
            .first();

        if (!user) {
            logger.warn(`${logPrefix} No user found with email: ${email}`);
            const msg = 'Invalid email or password.';
            return req.accepts('json')
                ? res.status(401).json({ error: msg })
                : res.status(401).render('auth/login', {
                    error: msg,
                    formData: { email }
                });
        }

        logger.info(`${logPrefix} User found: ID=${user.id}, Username=${user.username}`);
        logger.info(`${logPrefix} Comparing provided password with stored hash...`);
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            logger.warn(`${logPrefix} Password mismatch for user: ${user.username}`);
            const msg = 'Invalid email or password.';
            return req.accepts('json')
                ? res.status(401).json({ error: msg })
                : res.status(401).render('auth/login', {
                    error: msg,
                    formData: { email }
                });
        }

        req.session.userId = user.id;
        req.session.username = user.username;
        logger.info(`${logPrefix} User logged in successfully: ${user.username} (ID: ${user.id})`);

        if (req.accepts('json')) {
            return res.json({ success: true, redirect: `/users/${user.id}` });
        }
        res.redirect(`/users/${user.id}`);
    } catch (err) {
        logger.error(`${logPrefix} ERROR during login: ${err.message}`, { stack: err.stack });
        const msg = 'Server error. Please try again later.';
        return req.accepts('json')
            ? res.status(500).json({ error: msg })
            : res.status(500).render('auth/login', {
                error: msg,
                formData: { email }
            });
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
        const mappedErrors = errors.array().map(e => e.msg).join(' ');
        logger.warn(`${logPrefix} Validation errors: ${mappedErrors}`);
        return res.status(400).render('auth/register', {
            error: mappedErrors,
            formData: req.body
        });
    }

    // Sanitize inputs
    const username = req.sanitize(req.body.username);
    const email = req.sanitize(req.body.email);
    const password = req.sanitize(req.body.password);

    logger.info(`${logPrefix} Proceeding with registration: username=${username}, email=${email}`);

    try {
        logger.info(`${logPrefix} Checking if email already exists in database...`);
        const existing = await db
            .table('users')
            .select(['id', 'email'])
            .whereField('email', email)
            .first();

        if (existing) {
            logger.warn(`${logPrefix} Registration failed: Email already in use: ${email}`);
            return res.status(400).render('auth/register', {
                error: 'Email already in use.',
                formData: { username, email }
            });
        }

        logger.info(`${logPrefix} Email is unique. Proceeding to hash password...`);
        const saltRounds = 12;
        logger.info(`${logPrefix} Hashing password with bcrypt salt rounds: ${saltRounds}`);
        const hash = await bcrypt.hash(password, saltRounds);
        logger.info(`${logPrefix} Password successfully hashed: ${hash.substring(0, 10)}...`);

        const insertData = {
            username,
            email,
            password_hash: hash,
            created_at: new Date()
        };

        logger.info(`${logPrefix} Inserting new user into database...`);
        logger.debug(`${logPrefix} Insert data: ${JSON.stringify(insertData, null, 2)}`);

        const result = await db
            .table('users')
            .insert(insertData)
            .insertAndGet();

        if (!result || !result.id) {
            throw new Error('Failed to retrieve inserted user ID');
        }

        const userId = result.id;
        logger.info(`${logPrefix} New user created successfully: ID=${userId}, Username=${username}`);

        req.session.userId = userId;
        req.session.username = username;
        logger.info(`${logPrefix} Session set: userId=${userId}, username=${username}`);

        res.redirect(`/users/${userId}`);
    } catch (err) {
        logger.error(`${logPrefix} CRITICAL ERROR during registration: ${err.message}`, { stack: err.stack });

        if (err.code === '23505') {
            logger.warn(`${logPrefix} Database unique constraint violation`);
            return res.status(400).render('auth/register', {
                error: 'Email or username already in use.',
                formData: { username, email }
            });
        }

        res.status(500).render('auth/register', {
            error: 'Server error. Please try again later.',
            formData: req.body
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

exports.routes = {
    'GET /login': 'loginForm',
    'POST /login': ['validateLogin', 'loginPost'],
    'GET /register': 'registerForm',
    'POST /register': ['validateRegister', 'registerPost'],
    'POST /logout': 'logout'
};