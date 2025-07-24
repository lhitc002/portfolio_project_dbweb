const db = require('../utils/queryBuilder');
const { body, validationResult } = require('express-validator');
const logger = require('../logger');

const loggingPrefix = '[COLLECTION]';

// Reusable validators
exports.validateCreateCollection = [
  body('title').trim().isLength({ min: 3, max: 150 })
    .withMessage('Title must be 3–150 characters long.'),
  body('description').optional().trim().isLength({ min: 10 })
    .withMessage('Description must be at least 10 characters long.')
];

// Helper: fetch stories for current user
async function loadStories(userId) {
  return db.table('stories')
    .select(['stories.id', 'stories.title', 'stories.vanity', 'users.username'])
    .join('users', 'stories.user_id=users.id')
    .where('stories.user_id', userId)
    .get();
}

// Helper: render form views
async function renderForm(res, view, opts = {}) {
  const { userId, errors = [], formData = {}, selected = [] } = opts;
  const stories = await loadStories(userId);
  return res.render(`collections/${view}`, {
    title: opts.title,
    errors,
    formData,
    stories,
    selectedStories: selected
  });
}

exports.index = async (req, res) => {
  try {
    const collections = await db.table('collection_summary')
      .select(['id', 'title', 'description', 'user_id', 'username', 'story_count', 'avg_rating', 'rating_count'])
      .orderBy('created_at', 'DESC').get();
    logger.info(`Fetched ${collections.length} collections`);
    res.render('collections/index', { collections });
  } catch (err) {
    logger.error('Error fetching collections', err);
    res.status(500).send('Database error');
  }
};

// Show create form
exports.createForm = (req, res) => {
  if (!req.session.userId) return res.redirect('/auth/login');
  return renderForm(res, 'create', { userId: req.session.userId, title: 'Create Collection' });
};

// Handle creation
exports.createCollection = async (req, res) => {
  if (!req.session.userId) return res.redirect('/auth/login');
  const errors = validationResult(req).array().map(e => e.msg);
  const storyIds = [].concat(req.body.stories || []);
  if (errors.length) {
    return renderForm(res, 'create', {
      userId: req.session.userId,
      title: 'Create Collection',
      errors,
      formData: req.body,
      selected: storyIds
    });
  }

  try {
    const { title, description } = req.body;
    const { insertId } = await db.table('collections')
      .insertAsync({
        user_id: req.session.userId,
        title: title.trim(),
        description: description?.trim() || null
      });

    if (storyIds.length) {
      // insert each link individually
      await Promise.all(
        storyIds.map(id =>
          db.table('story_collections')
            .insertAsync({ collection_id: insertId, story_id: id })
        )
      );
    }

    logger.info(`${loggingPrefix} Created ${insertId}`);
    return res.redirect(`/collections/${req.session.userId}/${insertId}`);
  } catch (err) {
    logger.error(`${loggingPrefix} Creation error`, err);
    return renderForm(res, 'create', {
      userId: req.session.userId,
      title: 'Create Collection',
      errors: ['An error occurred. Please try again.'],
      formData: req.body,
      selected: storyIds
    });
  }
};

// List a collection
exports.list = async (req, res) => {
  try {
    const { userId, collectionId } = req.params;
    const collection = await db.table('collection_summary')
      .whereField('id', collectionId)
      .whereField('user_id', userId)
      .first();
    if (!collection) return res.status(404).render('error', { message: 'Collection not found' });

    const stories = await db.table('stories')
      .select(['stories.*', 'users.username as author_username', 'stories.vanity as story_vanity'])
      .join('story_collections as sc', 'stories.id=sc.story_id')
      .join('users', 'stories.user_id=users.id')
      .whereRaw('sc.collection_id=?', [collectionId])
      .orderBy('stories.created_at', 'DESC').get();

    logger.info(`Fetched ${stories.length} stories`);
    res.render('collections/list', { title: collection.title, collection, stories, userId, session: req.session });
  } catch (err) {
    logger.error(`${loggingPrefix} List error`, err);
    res.status(500).render('error', { message: 'Database error' });
  }
};

// Show edit form
exports.editForm = async (req, res) => {
  if (!req.session.userId) return res.redirect('/auth/login');
  const { userId, collectionId } = req.params;

  try {
    const collection = await db.table('collection_summary')
      .whereField('id', collectionId)
      .whereField('user_id', userId)
      .first();
    if (!collection) return res.status(403).render('error', { message: 'Forbidden' });

    // <-- normalize to numbers here:
    const selected = (await db.table('story_collections')
      .select('story_id')
      .whereField('collection_id', collectionId)
      .get()
    ).map(r => Number(r.story_id));

    return renderForm(res, 'edit', {
      userId,
      title: 'Edit Collection',
      formData: collection,
      selected
    });
  } catch (err) {
    logger.error(`${loggingPrefix} Edit form error`, err);
    res.status(500).render('error', { message: 'Database error' });
  }
};

// Update collection
exports.updateCollection = async (req, res) => {
  if (!req.session.userId) return res.redirect('/auth/login');
  const errors = validationResult(req).array().map(e => e.msg);
  const { userId, collectionId } = req.params;
  const storyIds = [].concat(req.body.stories || []);
  if (errors.length) {
    return renderForm(res, 'edit', {
      userId,
      title: 'Edit Collection',
      errors,
      formData: { ...req.body, id: collectionId },
      selected: storyIds
    });
  }

  try {
    const existing = await db.table('collection_summary')
      .whereField('id', collectionId)
      .whereField('user_id', userId)
      .first();
    if (!existing) return res.status(404).render('error', { message: 'Collection not found' });

    await db.table('collections')
      .whereField('id', collectionId)
      .update({
        title: req.body.title.trim(),
        description: req.body.description?.trim() || null,
        updated_at: new Date()
      });

    // remove old links
    await db.table('story_collections')
      .whereField('collection_id', collectionId)
      .delete();

    if (storyIds.length) {
      // insert each new link individually
      await Promise.all(
        storyIds.map(id =>
          db.table('story_collections')
            .insertAsync({ collection_id: collectionId, story_id: id })
        )
      );
    }

    logger.info(`${loggingPrefix} Updated ${collectionId}`);
    return res.redirect(`/collections/${userId}/${collectionId}`);
  } catch (err) {
    logger.error(`${loggingPrefix} Update error`, err);
    return renderForm(res, 'edit', {
      userId,
      title: 'Edit Collection',
      errors: ['An error occurred. Please try again.'],
      formData: { ...req.body, id: collectionId },
      selected: storyIds
    });
  }
};

// Delete
exports.deleteCollection = async (req, res) => {
  if (!req.session.userId) return res.redirect('/auth/login');
  const { collectionId } = req.params;
  try {
    const coll = await db.table('collection_summary')
      .whereField('id', collectionId)
      .whereField('user_id', req.session.userId).first();
    if (!coll) return res.status(404).render('error', { message: 'Collection not found' });

    await Promise.all([
      db.table('story_collections').whereField('collection_id', collectionId).delete(),
      db.table('collections').whereField('id', collectionId).delete()
    ]);

    logger.info(`${loggingPrefix} Deleted ${collectionId}`);
    res.redirect(`/users/${req.session.username}`);
  } catch (err) {
    logger.error(`${loggingPrefix} Delete error`, err);
    res.status(500).render('error', { message: 'Error deleting collection' });
  }
};

exports.routes = {
  'GET /': 'index',
  'GET /create': 'createForm',
  'POST /create': ['validateCreateCollection', 'createCollection'],
  'GET /:userId/:collectionId': 'list',
  'GET /:userId/:collectionId/edit': 'editForm',
  'POST /:userId/:collectionId/edit': ['validateCreateCollection', 'updateCollection'],
  'POST /:userId/:collectionId/delete': 'deleteCollection'
};