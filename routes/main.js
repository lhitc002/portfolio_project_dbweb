const logger = require('../logger');
const mainService = require('../services/mainService');

exports.index = async (req, res) => {
  try {
    logger.info('Fetching stories with metadata');
    const stories = await mainService.getStoriesWithMetadata();
    logger.info(`Retrieved ${stories.length} stories`);
    res.render('main/index', { stories });
  } catch (error) {
    logger.error('Error fetching stories', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).send('Database error');
  }
};

exports.routes = {
  'GET /': 'index'
};