const { body, validationResult } = require('express-validator');
const logger = require('../logger');
const collectionsService = require('../services/collectionsService');

const loggingPrefix = '[COLLECTION]';

// Reusable validators
exports.validateCreateCollection = [
  body('title').trim().isLength({ min: 3, max: 150 })
    .withMessage('Title must be 3–150 characters long.'),
  body('description').optional().trim().isLength({ min: 10 })
    .withMessage('Description must be at least 10 characters long.')
];

// Helper: render form views
async function renderForm(res, view, opts = {}) {
  const { userId, errors = [], formData = {}, selected = [] } = opts;
  try {
    const stories = await collectionsService.getStoriesForUser(userId);
    return res.render(`collections/${view}`, {
      title: opts.title,
      errors,
      formData,
      stories,
      selectedStories: selected
    });
  } catch (err) {
    logger.error(`${loggingPrefix} Error in renderForm`, err);
    return res.status(500).render('error', { message: 'Error loading form data' });
  }
}

exports.index = async (req, res) => {
  try {
    const collections = await collectionsService.getAllCollections();
    logger.info(`Fetched ${collections.length} collections`);
    res.render('collections/index', { collections });
  } catch (err) {
    logger.error('Error fetching collections', err);
    res.status(500).render('error', { message: 'Database error' });
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
    const collectionId = await collectionsService.createCollection(
      req.session.userId,
      title,
      description
    );

    if (storyIds.length) {
      await collectionsService.addStoriesToCollection(collectionId, storyIds);
    }

    logger.info(`${loggingPrefix} Created ${collectionId}`);
    return res.redirect(`../collections/${req.session.userId}/${collectionId}`);
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
    const collection = await collectionsService.getCollectionByIdAndUserId(collectionId, userId);
    if (!collection) return res.status(404).render('error', { message: 'Collection not found' });

    const stories = await collectionsService.getStoriesByCollectionId(collectionId);
    logger.info(`Fetched ${stories.length} stories`);

    res.render('collections/list', {
      title: collection.title,
      collection,
      stories,
      userId,
      session: req.session
    });
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
    const collection = await collectionsService.getCollectionByIdAndUserId(collectionId, userId);
    if (!collection) return res.status(403).render('error', { message: 'Forbidden' });

    const selected = await collectionsService.getSelectedStoriesForCollection(collectionId);
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
    const existing = await collectionsService.getCollectionByIdAndUserId(collectionId, userId);
    if (!existing) return res.status(404).render('error', { message: 'Collection not found' });

    await collectionsService.updateCollection(collectionId, req.body);
    await collectionsService.deleteCollectionLinks(collectionId);

    if (storyIds.length) {
      await collectionsService.addStoriesToCollection(collectionId, storyIds);
    }

    logger.info(`${loggingPrefix} Updated ${collectionId}`);
    return res.redirect(`../collections/${userId}/${collectionId}`);
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
    const coll = await collectionsService.getCollectionByIdAndUserId(
      collectionId,
      req.session.userId
    );
    if (!coll) return res.status(404).render('error', { message: 'Collection not found' });

    await collectionsService.deleteCollectionLinks(collectionId);
    await collectionsService.deleteCollection(collectionId);

    logger.info(`${loggingPrefix} Deleted ${collectionId}`);
    res.redirect(`../users/${req.session.username}`);
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