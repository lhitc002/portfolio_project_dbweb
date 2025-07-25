const searchService = require('../services/searchService');
const logger = require('../logger');

const logPrefix = '[API-SEARCH]';

exports.results = async (req, res) => {
    const rawQ = req.query.q || '';
    const likeQ = `%${searchService.escapeLike(rawQ)}%`;
    let types = Array.isArray(req.query.types) ? req.query.types : [];

    if (!types.length) {
        types = ['users', 'stories', 'collections', 'comments', 'chapters'];
    }

    logger.info(`${logPrefix} API search for: "${rawQ}" types: ${types}`);

    try {
        const searchTasks = [];
        const searchMap = {
            users: searchService.searchUsers,
            stories: searchService.searchStories,
            collections: searchService.searchCollections,
            comments: searchService.searchComments,
            chapters: searchService.searchChapters
        };

        types.forEach(type => {
            if (searchMap[type]) {
                logger.debug(`${logPrefix} Querying ${type}...`);
                searchTasks.push(
                    searchMap[type](likeQ)
                        .then(results => ({ [type]: results }))
                );
            }
        });

        const resultsParts = await Promise.all(searchTasks);
        const results = Object.assign({}, ...resultsParts);

        // Ensure consistent response structure with empty arrays
        const allCategories = ['users', 'stories', 'collections', 'comments', 'chapters'];
        allCategories.forEach(cat => {
            results[cat] = results[cat] || [];
        });

        return res.json({
            success: true,
            query: rawQ,
            types,
            results
        });
    }
    catch (err) {
        logger.error(`${logPrefix} Search error:`, {
            error: err.message,
            query: rawQ,
            stack: err.stack
        });

        return res.status(500).json({
            success: false,
            error: 'Search operation failed',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
};

exports.routes = {
    'GET /': 'results'
};