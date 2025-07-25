const logger = require('../logger');
const mainService = require('../services/mainService');

const logPrefix = '[API-MAIN]';

exports.index = async (req, res) => {
    try {
        logger.info(`${logPrefix} Fetching stories with metadata for API`);
        const stories = await mainService.getStoriesWithMetadata();
        logger.info(`${logPrefix} Retrieved ${stories.length} stories`);

        res.json({
            success: true,
            count: stories.length,
            stories: stories.map(story => ({
                id: story.id,
                title: story.title,
                user_id: story.user_id,
                vanity: story.vanity,
                username: story.username,
                // Add any other relevant fields from the service
                // Include only necessary data for API consumers
            }))
        });
    } catch (error) {
        logger.error(`${logPrefix} Error fetching stories`, {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve stories',
            // Include detailed error only in development
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

exports.routes = {
    'GET /': 'index'
};