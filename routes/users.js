const logger = require('../logger');
const usersService = require('../services/usersService');

const loggingPrefix = '[USERS]';

exports.index = (req, res) => {
    logger.info(`${loggingPrefix} Index route hit - /users/`);

    if (req.session?.userId) {
        logger.info(`${loggingPrefix} Session found, redirecting to profile`);
        return res.redirect(`../users/profile/${req.session.username}`);
    }

    logger.info(`${loggingPrefix} No session, redirecting to login`);
    res.redirect('/auth/login');
};

exports.profile = async (req, res) => {
    logger.info(`${loggingPrefix} Profile route hit - /users/profile/:username`);
    const username = req.params.username;

    if (!username) {
        logger.warn(`${loggingPrefix} Missing username:`, req.params.username);
        return res.status(400).send('Username is required');
    }

    try {
        logger.info(`${loggingPrefix} Looking up username:`, username);
        const user = await usersService.getUserByUsername(username);

        if (!user) {
            logger.warn(`${loggingPrefix} User not found for username:`, username);
            return res.status(404).send('User not found');
        }

        logger.info(`${loggingPrefix} Found user:`, user.username);
        logger.info(`${loggingPrefix} Querying user stories + stats...`);
        const stories = await usersService.getUserStories(user.id);

        logger.info(`${loggingPrefix} Stories fetched:`, stories.length);
        logger.info(`${loggingPrefix} Querying user collections + counts...`);
        const collections = await usersService.getUserCollections(user.id);

        logger.info(`${loggingPrefix} Collections fetched:`, collections.length);
        logger.info(`${loggingPrefix} Rendering dashboard for:`, user);
        res.render('users/dashboard', { user, stories, collections });
        logger.info(`${loggingPrefix} Render complete`);
    } catch (err) {
        logger.error(`${loggingPrefix} ERROR in profile:`, { message: err.message, stack: err.stack });
        res.status(500).send('Server error: ' + err.message);
    }
};

exports.view = (req, res) => {
    logger.info(`${loggingPrefix} View route hit - /users/:username`);
    return exports.profile(req, res);
};

exports.routes = {
    'GET /': 'index',
    'GET /profile/:username': 'profile',
    'GET /:username': 'view'
};