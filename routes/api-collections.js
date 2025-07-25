const { body, validationResult } = require('express-validator');
const logger = require('../logger');
const collectionsService = require('../services/collectionsService');

const loggingPrefix = '[API-COLLECTIONS]';

// Validation rules
const collectionValidator = [
    body('title').trim().isLength({ min: 3, max: 150 })
        .withMessage('Title must be 3–150 characters'),
    body('description').optional().trim().isLength({ min: 10 })
        .withMessage('Description must be at least 10 characters'),
    body('stories').optional().isArray().withMessage('Stories must be an array')
];

// Helper function for API responses
const apiResponse = (res, status, data) => {
    return res.status(status).json({
        success: status >= 200 && status < 300,
        ...data
    });
};

// Get all collections
exports.index = async (req, res) => {
    try {
        const collections = await collectionsService.getAllCollections();
        logger.info(`${loggingPrefix} Fetched ${collections.length} collections`);
        return apiResponse(res, 200, { collections });
    } catch (err) {
        logger.error(`${loggingPrefix} Index error: ${err.message}`);
        return apiResponse(res, 500, { error: 'Database error' });
    }
};

// Create a collection
exports.createCollection = async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return apiResponse(res, 400, {
            error: 'Validation failed',
            details: errors.array()
        });
    }

    // Check authentication
    if (!req.session.userId) {
        return apiResponse(res, 401, { error: 'Authentication required' });
    }

    try {
        const { title, description } = req.body;
        const storyIds = req.body.stories || [];

        // Create collection
        const collectionId = await collectionsService.createCollection(
            req.session.userId,
            title,
            description
        );

        // Add stories if provided
        if (storyIds.length) {
            await collectionsService.addStoriesToCollection(collectionId, storyIds);
        }

        // Get full collection details
        const collection = await collectionsService.getCollectionById(collectionId);
        const stories = await collectionsService.getStoriesByCollectionId(collectionId);

        logger.info(`${loggingPrefix} Created collection ${collectionId}`);
        return apiResponse(res, 201, {
            message: 'Collection created',
            collection: { ...collection, stories }
        });
    } catch (err) {
        logger.error(`${loggingPrefix} Creation error: ${err.message}`);
        return apiResponse(res, 500, { error: 'Collection creation failed' });
    }
};

// Get a single collection
exports.getCollection = async (req, res) => {
    try {
        const { userId, collectionId } = req.params;
        const collection = await collectionsService.getCollectionByIdAndUserId(collectionId, userId);

        if (!collection) {
            return apiResponse(res, 404, { error: 'Collection not found' });
        }

        const stories = await collectionsService.getStoriesByCollectionId(collectionId);
        logger.info(`${loggingPrefix} Fetched collection ${collectionId}`);

        return apiResponse(res, 200, {
            collection: { ...collection, stories }
        });
    } catch (err) {
        logger.error(`${loggingPrefix} Get error: ${err.message}`);
        return apiResponse(res, 500, { error: 'Failed to fetch collection' });
    }
};

// Update a collection
exports.updateCollection = async (req, res) => {
    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return apiResponse(res, 400, {
            error: 'Validation failed',
            details: errors.array()
        });
    }

    // Check authentication
    if (!req.session.userId) {
        return apiResponse(res, 401, { error: 'Authentication required' });
    }

    const { userId, collectionId } = req.params;
    const storyIds = req.body.stories || [];

    try {
        // Verify ownership
        const existing = await collectionsService.getCollectionByIdAndUserId(
            collectionId,
            userId
        );

        if (!existing) {
            return apiResponse(res, 404, { error: 'Collection not found' });
        }

        // Check authorization
        if (existing.user_id !== req.session.userId) {
            return apiResponse(res, 403, { error: 'Unauthorized to update this collection' });
        }

        // Update collection
        await collectionsService.updateCollection(collectionId, req.body);

        // Update stories
        await collectionsService.deleteCollectionLinks(collectionId);
        if (storyIds.length) {
            await collectionsService.addStoriesToCollection(collectionId, storyIds);
        }

        // Get updated collection
        const collection = await collectionsService.getCollectionById(collectionId);
        const stories = await collectionsService.getStoriesByCollectionId(collectionId);

        logger.info(`${loggingPrefix} Updated collection ${collectionId}`);
        return apiResponse(res, 200, {
            message: 'Collection updated',
            collection: { ...collection, stories }
        });
    } catch (err) {
        logger.error(`${loggingPrefix} Update error: ${err.message}`);
        return apiResponse(res, 500, { error: 'Update failed' });
    }
};

// Delete a collection
exports.deleteCollection = async (req, res) => {
    // Check authentication
    if (!req.session.userId) {
        return apiResponse(res, 401, { error: 'Authentication required' });
    }

    const { userId, collectionId } = req.params;

    try {
        // Verify ownership
        const collection = await collectionsService.getCollectionByIdAndUserId(
            collectionId,
            userId
        );

        if (!collection) {
            return apiResponse(res, 404, { error: 'Collection not found' });
        }

        // Check authorization
        if (collection.user_id !== req.session.userId) {
            return apiResponse(res, 403, { error: 'Unauthorized to delete this collection' });
        }

        // Delete collection
        await collectionsService.deleteCollectionLinks(collectionId);
        await collectionsService.deleteCollection(collectionId);

        logger.info(`${loggingPrefix} Deleted collection ${collectionId}`);
        return apiResponse(res, 200, { message: 'Collection deleted' });
    } catch (err) {
        logger.error(`${loggingPrefix} Delete error: ${err.message}`);
        return apiResponse(res, 500, { error: 'Delete failed' });
    }
};

exports.routes = {
    'GET /': 'index',
    'POST /': [collectionValidator, 'createCollection'],
    'GET /:userId/:collectionId': 'getCollection',
    'PUT /:userId/:collectionId': [collectionValidator, 'updateCollection'],
    'DELETE /:userId/:collectionId': 'deleteCollection'
};