const logger = require('../logger');
const usersService = require('../services/usersService');

const loggingPrefix = '[API-USERS]';

exports.index = async (req, res) => {
    logger.info(`${loggingPrefix} API Index route hit - /api/users/`);

    try {
        if (!req.session?.userId) {
            logger.warn(`${loggingPrefix} Unauthorized access attempt`);
            return res.status(401).json({ error: 'Unauthorized' });
        }

        logger.info(`${loggingPrefix} Fetching current user data for ID:`, req.session.userId);
        const user = await usersService.getUserById(req.session.userId);

        if (!user) {
            logger.warn(`${loggingPrefix} User not found for ID:`, req.session.userId);
            return res.status(404).json({ error: 'User not found' });
        }

        logger.info(`${loggingPrefix} Fetching stories and collections for user:`, user.username);
        const [stories, collections] = await Promise.all([
            usersService.getUserStories(user.id),
            usersService.getUserCollections(user.id)
        ]);

        res.json({
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                createdAt: user.createdAt
                // Add other public fields as needed
            },
            stories: stories.map(story => ({
                id: story.id,
                title: story.title,
                createdAt: story.createdAt
                // Add other story fields
            })),
            collections: collections.map(collection => ({
                id: collection.id,
                name: collection.name,
                storyCount: collection.storyCount
                // Add other collection fields
            }))
        });
    } catch (err) {
        logger.error(`${loggingPrefix} ERROR in index:`, { message: err.message, stack: err.stack });
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.profile = async (req, res) => {
    const username = req.params.username;
    logger.info(`${loggingPrefix} API Profile route hit - /api/users/profile/${username}`);

    if (!username) {
        logger.warn(`${loggingPrefix} Missing username parameter`);
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        logger.info(`${loggingPrefix} Fetching user data for:`, username);
        const user = await usersService.getUserByUsername(username);

        if (!user) {
            logger.warn(`${loggingPrefix} User not found:`, username);
            return res.status(404).json({ error: 'User not found' });
        }

        logger.info(`${loggingPrefix} Fetching stories and collections for:`, username);
        const [stories, collections] = await Promise.all([
            usersService.getUserStories(user.id),
            usersService.getUserCollections(user.id)
        ]);

        res.json({
            user: {
                id: user.id,
                username: user.username,
                createdAt: user.createdAt
                // Public profile fields only
            },
            meta: {
                storyCount: stories.length,
                collectionCount: collections.length
            },
            stories: stories.map(story => ({
                id: story.id,
                title: story.title,
                excerpt: story.excerpt,
                createdAt: story.createdAt
            })),
            collections: collections.map(collection => ({
                id: collection.id,
                name: collection.name,
                description: collection.description,
                storyCount: collection.storyCount
            }))
        });
    } catch (err) {
        logger.error(`${loggingPrefix} ERROR in profile:`, { message: err.message, stack: err.stack });
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.view = (req, res) => {
    logger.info(`${loggingPrefix} API View route hit - /api/users/${req.params.username}`);
    return exports.profile(req, res);
};

exports.routes = {
    'GET /': 'index',
    'GET /profile/:username': 'profile',
    'GET /:username': 'view'
};