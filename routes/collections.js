const db = require('../utils/queryBuilder');
const logger = require('../logger');

exports.index = async (req, res) => {
  try {
    const collections = await db.table('collections')
      .select([
        'collections.id',
        'collections.title',
        'collections.description',
        'collections.user_id',
        'COUNT(sc.story_id) as count'
      ])
      .leftJoin('story_collections as sc', 'collections.id = sc.collection_id')
      .groupBy('collections.id, collections.title, collections.description, collections.user_id')
      .orderBy('collections.created_at', 'DESC')
      .get();

    logger.info(`Fetched ${collections.length} collections`);
    res.render('collections/index', { collections });
  } catch (error) {
    logger.error('Error fetching collections index', { error: error.message, stack: error.stack });
    res.status(500).send('Database error');
  }
};

exports.list = async (req, res) => {
  const { userId, collectionId } = req.params;

  try {
    // Get collection (using my test linq imitation)
    const literalId = JSON.stringify(Number(collectionId));
    const collection = await db.get('collections', eval(`m => m.id == ${literalId}`));

    if (!collection || collection.user_id != userId) {
      return res.status(404).send('Collection not found');
    }

    // Get stories in collection
    const stories = await db.table('stories')
      .join('story_collections as sc', 'stories.id = sc.story_id')
      .whereRaw('sc.collection_id = ?', [collectionId])
      .orderBy('stories.created_at', 'DESC')
      .get();

    logger.info(`Fetched ${stories.length} stories for collection ${collectionId}`);
    res.render('collections/list', { collection, stories, userId });
  } catch (error) {
    logger.error('Error fetching collection details', { error: error.message, stack: error.stack });
    res.status(500).send('Database error');
  }
};

exports.routes = {
  'GET /': 'index',
  'GET /:userId/:collectionId': 'list'
};