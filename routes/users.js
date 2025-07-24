const db = require('../utils/queryBuilder');
const logger = require('../logger');

const loggingPrefix = '[USERS]';

exports.index = (req, res) => {
    logger.info(`${loggingPrefix} Index route hit - /users/`);

    if (req.session?.userId) {
        logger.info(`${loggingPrefix} Session found, redirecting to profile`);
        return res.redirect(`/users/profile/${req.session.userId}`);
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
        logger.info(`${loggingPrefix} Querying user details...`);
        const user = await db
            .table('users')
            .select(['id', 'username', 'email', 'created_at'])
            .whereField('username', username)
            .first();

        if (!user) {
            logger.warn(`${loggingPrefix} User not found for username:`, username);
            return res.status(404).send('User not found');
        }

        logger.info(`${loggingPrefix} Found user:`, user.username);
        logger.info(`${loggingPrefix} Querying user stories + stats...`);
        const stories = await db
            .table('stories as s')
            .select([
                's.id',
                's.title',
                's.synopsis',
                's.vanity',
                's.created_at',
                's.updated_at',
                'COUNT(DISTINCT ch.id)          as chapter_count',
                'AVG(r.rating)                 as avg_rating',
                'COUNT(DISTINCT r.user_id)     as rating_count',
                'COUNT(DISTINCT f.user_id)     as favorite_count'
            ])
            .leftJoin('chapters as ch', 's.id = ch.story_id')
            .leftJoin('ratings  as r', 's.id = r.story_id')
            .leftJoin('favorites as f', 's.id = f.story_id')
            .whereField('s.user_id', user.id)
            .groupBy([
                's.id', 's.title', 's.synopsis', 's.vanity', 's.created_at', 's.updated_at'
            ])
            .orderBy('s.updated_at', 'DESC')
            .get();

        logger.info(`${loggingPrefix} Stories fetched:`, stories.length);
        logger.info(`${loggingPrefix} Querying user collections + counts...`);
        const collections = await db
            .table('collections as c')
            .select([
                'c.id',
                'c.title',
                'c.description',
                'c.created_at',
                'COUNT(DISTINCT sc.story_id) as story_count'
            ])
            .leftJoin('story_collections as sc', 'c.id = sc.collection_id')
            .whereField('c.user_id', user.id)
            .groupBy(['c.id', 'c.title', 'c.description', 'c.created_at'])
            .orderBy('c.created_at', 'DESC')
            .get();

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