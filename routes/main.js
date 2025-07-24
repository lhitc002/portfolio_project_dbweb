const db = require('../utils/queryBuilder');
const logger = require('../logger');

exports.index = async (req, res) => {
  try {
    logger.info('Fetching stories with metadata');
    const stories = await db
      .table('stories as s')
      .select([
        's.id',
        's.title',
        's.synopsis',
        's.user_id',
        's.vanity as story_vanity',
        'u.username AS author',
        'u.username AS author_username',
        'COUNT(ch.id) AS chapterCount',
        `SUM(
          CHAR_LENGTH(ch.content)
          - CHAR_LENGTH(REPLACE(ch.content, ' ', ''))
          + 1
        ) AS totalWords`
      ])
      .join('users as u', 'u.id = s.user_id')
      .leftJoin('chapters as ch', 'ch.story_id = s.id')
      .groupBy(['s.id', 's.title', 's.synopsis', 's.vanity', 'u.username'])
      .orderBy('s.created_at', 'DESC')
      .get();
    logger.info(`Retrieved ${stories.length} stories`);
    res.render('main/index', { stories });
  } catch (error) {
    logger.error('Error fetching stories', { error: error.message, stack: error.stack });
    res.status(500).send('Database error');
  }
};

exports.routes = {
  'GET /': 'index'
};