const searchService = require('../services/searchService');
const logger = require('../logger');

const logPrefix = '[SEARCH]';

exports.index = (req, res) => {
    res.render('search/index', {
        q: req.query.q || '',
        types: req.query.types || ['users', 'stories', 'collections', 'comments', 'chapters']
    });
};

exports.results = async (req, res) => {
    const rawQ = req.query.q || '';
    const likeQ = `%${searchService.escapeLike(rawQ)}%`;
    let types = Array.isArray(req.query.types) ? req.query.types : [];
    if (!types.length) {
        types = ['users', 'stories', 'collections', 'comments', 'chapters'];
    }

    logger.info(`${logPrefix} Running search for: ${rawQ} 'types: ${types}`);

    try {
        const tasks = [];
        const searchMap = {
            users: searchService.searchUsers,
            stories: searchService.searchStories,
            collections: searchService.searchCollections,
            comments: searchService.searchComments,
            chapters: searchService.searchChapters
        };

        types.forEach(type => {
            if (searchMap[type]) {
                logger.info(`${logPrefix} Querying ${type}...`);
                tasks.push(
                    searchMap[type](likeQ)
                        .then(results => ({ [type]: results }))
                );
            }
        });

        // Await all
        const parts = await Promise.all(tasks);
        const results = parts.reduce((acc, part) => Object.assign(acc, part), {});

        // Ensure all categories exist
        ['users', 'stories', 'collections', 'comments', 'chapters']
            .forEach(cat => { if (!results[cat]) results[cat] = []; });

        // AJAX/JSON response?
        if (req.xhr || (req.get('Accept') || '').includes('json')) {
            return res.json({ results });
        }

        // Render page
        res.render('search/index', {
            q: rawQ,
            types,
            results
        });
    }
    catch (err) {
        logger.error(`${logPrefix} Error running results:`, { error: err });
        if (req.xhr || (req.get('Accept') || '').includes('json')) {
            return res.status(500).json({ error: 'Search failed' });
        }
        res.status(500).send('Search failed');
    }
};

exports.routes = {
    'GET /': 'index',
    'GET /results': 'results'
};