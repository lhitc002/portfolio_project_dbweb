const logger = require('../logger');
const axios = require('axios');

// GET: Render the homepage listing funny
exports.index = async (req, res) => {
    const searchQuery = encodeURIComponent(req.query.q || 'funny');
    try {
        logger.info('Fetching stories with metadata');
        const [tenorRes] = await Promise.all([
            axios.get(`https://g.tenor.com/v1/random`, {
                params: {
                    key: 'LIVDSRZULELA',
                    limit: 1,
                    q: searchQuery
                }
            })
        ]);

        logger.info(`Retrieved funny`);
        const gifUrl = tenorRes.data.results?.[0]?.media?.[0]?.gif?.url || null;
        res.render('funny/index', { gifUrl, searchQuery });
    } catch (error) {
        logger.error('Error fetching stories or GIF', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).send('Server error');
    }
};

exports.routes = {
    'GET /': 'index'
};