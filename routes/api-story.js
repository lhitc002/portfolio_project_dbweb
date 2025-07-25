const { body, validationResult } = require('express-validator');
const logger = require('../logger');
const storyService = require('../services/storyService');

const loggingPrefix = "[API-STORY]";

// Helper function for consistent error responses
const handleError = (res, status, message, error = null) => {
    if (error) {
        logger.error(`${loggingPrefix} ${message}`, {
            error: error.message,
            stack: error.stack
        });
    }
    return res.status(status).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === 'development' && { details: error?.message })
    });
};

// GET: List all stories
exports.index = async (req, res) => {
    try {
        const stories = await storyService.getAllStories();
        return res.json({
            success: true,
            count: stories.length,
            stories
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to fetch stories', err);
    }
};

// GET: Story details
exports.storyDetail = async (req, res) => {
    const { username, vanity } = req.params;

    if (!username || !vanity) {
        return handleError(res, 400, 'Missing username or story identifier');
    }

    try {
        const story = await storyService.getStoryByUsernameAndVanity(username, vanity);
        if (!story) {
            return handleError(res, 404, 'Story not found');
        }

        const chapters = await storyService.getChaptersByStoryId(story.id);
        let userRating = null;

        if (req.session.userId && req.session.userId !== story.user_id) {
            userRating = await storyService.getUserRatingForStory(req.session.userId, story.id);
        }

        return res.json({
            success: true,
            story: {
                ...story,
                chapter_count: chapters.length
            },
            chapters,
            userRating
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to fetch story details', err);
    }
};

// GET: Chapter details
exports.chapterDetail = async (req, res) => {
    const { username, vanity, chapternum } = req.params;
    const chapterNum = parseInt(chapternum, 10);

    if (!username || !vanity || isNaN(chapterNum)) {
        return handleError(res, 400, 'Invalid parameters');
    }

    try {
        const story = await storyService.getStoryWithUser(username, vanity);
        if (!story) {
            return handleError(res, 404, 'Story not found');
        }

        const chapter = await storyService.getChapterByStoryIdAndNumber(story.id, chapterNum);
        if (!chapter) {
            return handleError(res, 404, 'Chapter not found');
        }

        const { prevChapter, nextChapter } = await storyService.getChapterNavigation(story.id, chapterNum);
        const comments = await storyService.getCommentsForChapter(chapter.id);

        return res.json({
            success: true,
            story,
            chapter,
            navigation: { prevChapter, nextChapter },
            comments
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to fetch chapter', err);
    }
};

// POST: Create new story
exports.createStory = async (req, res) => {
    if (!req.session.userId) {
        return handleError(res, 401, 'Authentication required');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array().map(e => e.msg)
        });
    }

    try {
        const titleTaken = await storyService.isTitleTaken(req.session.userId, req.body.title);
        if (titleTaken) {
            return handleError(res, 409, 'You already have a story with that title');
        }

        const { title, synopsis } = req.body;
        const { createdStory, username } = await storyService.createStory(req.session.userId, title, synopsis);

        return res.status(201).json({
            success: true,
            message: 'Story created successfully',
            story: createdStory,
            url: `/story/${username}/${createdStory.vanity}`
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to create story', err);
    }
};

// POST: Update story
exports.updateStory = async (req, res) => {
    const { username, vanity } = req.params;
    const userId = req.session.userId;

    if (!userId) {
        return handleError(res, 401, 'Authentication required');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array().map(e => e.msg)
        });
    }

    try {
        const story = await storyService.getStoryByUserIdAndVanity(userId, vanity);
        if (!story) {
            return handleError(res, 404, 'Story not found');
        }

        await storyService.updateStoryById(story.id, req.body.title, req.body.synopsis);
        const updatedStory = await storyService.getStoryById(story.id);

        return res.json({
            success: true,
            message: 'Story updated successfully',
            story: updatedStory
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to update story', err);
    }
};

// POST: Delete story
exports.deleteStory = async (req, res) => {
    const { username, vanity } = req.params;
    const userId = req.session.userId;

    if (!userId) {
        return handleError(res, 401, 'Authentication required');
    }

    try {
        const story = await storyService.getStoryByUserIdAndVanity(userId, vanity);
        if (!story) {
            return handleError(res, 404, 'Story not found');
        }

        await storyService.deleteStoryById(story.id);
        return res.json({
            success: true,
            message: 'Story deleted successfully'
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to delete story', err);
    }
};

// POST: Add comment
exports.addComment = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return handleError(res, 401, 'Authentication required');
    }

    const { content, parent_id } = req.body;
    const { username, vanity, chapternum } = req.params;
    const chapterNum = parseInt(chapternum, 10);

    if (!content || isNaN(chapterNum)) {
        return handleError(res, 400, 'Invalid comment data');
    }

    try {
        const story = await storyService.getStorySummaryByUsernameAndVanity(username, vanity);
        if (!story) {
            return handleError(res, 404, 'Story not found');
        }

        const chapter = await storyService.getChapterByStoryIdAndNumber(story.id, chapterNum);
        if (!chapter) {
            return handleError(res, 404, 'Chapter not found');
        }

        const comment = await storyService.addComment({
            userId,
            chapterId: chapter.id,
            parentId: parent_id || null,
            content
        });

        return res.status(201).json({
            success: true,
            message: 'Comment added successfully',
            comment
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to add comment', err);
    }
};

// POST: Edit comment
exports.editComment = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return handleError(res, 401, 'Authentication required');
    }

    const { content } = req.body;
    const commentId = parseInt(req.params.commentId, 10);
    const chapterNum = parseInt(req.params.chapternum, 10);

    if (!content || isNaN(commentId) || isNaN(chapterNum)) {
        return handleError(res, 400, 'Invalid comment data');
    }

    try {
        const comment = await storyService.getCommentByIdAndUser(commentId, userId);
        if (!comment) {
            return handleError(res, 404, 'Comment not found or unauthorized');
        }

        const updatedComment = await storyService.updateCommentByIdAndUser(commentId, userId, content);
        return res.json({
            success: true,
            message: 'Comment updated successfully',
            comment: updatedComment
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to update comment', err);
    }
};

// POST: Delete comment
exports.deleteComment = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return handleError(res, 401, 'Authentication required');
    }

    const commentId = parseInt(req.params.commentId, 10);
    const chapterNum = parseInt(req.params.chapternum, 10);

    if (isNaN(commentId) || isNaN(chapterNum)) {
        return handleError(res, 400, 'Invalid comment ID');
    }

    try {
        const comment = await storyService.getCommentByIdAndUser(commentId, userId);
        if (!comment) {
            return handleError(res, 404, 'Comment not found or unauthorized');
        }

        const replyCount = await storyService.getReplyCountForComment(commentId);
        let deleteMethod = 'hard';

        if (replyCount > 0) {
            await storyService.softDeleteComment(commentId, userId);
            deleteMethod = 'soft';
        } else {
            await storyService.hardDeleteComment(commentId, userId);
        }

        return res.json({
            success: true,
            message: 'Comment deleted successfully',
            deleteMethod
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to delete comment', err);
    }
};

// POST: Create chapter
exports.createChapter = async (req, res) => {
    const { username, vanity } = req.params;
    const userId = req.session.userId;

    if (!userId) {
        return handleError(res, 401, 'Authentication required');
    }

    const chapNum = parseInt(req.body.chapter_num, 10);
    const errors = validationResult(req);

    if (!errors.isEmpty() || isNaN(chapNum)) {
        const errorMessages = errors.array().map(e => e.msg);
        if (isNaN(chapNum)) errorMessages.push('Invalid chapter number');
        return res.status(400).json({
            success: false,
            errors: errorMessages
        });
    }

    try {
        const story = await storyService.getStorySummaryByUserAndVanity(username, vanity);
        if (!story || story.user_id !== userId) {
            return handleError(res, 403, 'Forbidden');
        }

        const existingChapter = await storyService.chapterExists(story.id, chapNum);
        if (existingChapter) {
            return handleError(res, 409, 'Chapter number already exists for this story');
        }

        const chapter = await storyService.createChapter(
            story.id,
            chapNum,
            req.body.title,
            req.body.content
        );

        return res.status(201).json({
            success: true,
            message: 'Chapter created successfully',
            chapter,
            url: `/story/${username}/${vanity}/chapter/${chapNum}`
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to create chapter', err);
    }
};

// POST: Update chapter
exports.updateChapter = async (req, res) => {
    const { username, vanity, chapternum } = req.params;
    const userId = req.session.userId;

    if (!userId) {
        return handleError(res, 401, 'Authentication required');
    }

    const chapNum = parseInt(chapternum, 10);
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array().map(e => e.msg)
        });
    }

    try {
        const story = await storyService.getStorySummaryByUserAndVanity(username, vanity);
        if (!story || story.user_id !== userId) {
            return handleError(res, 403, 'Forbidden');
        }

        const updated = await storyService.updateChapter(story.id, chapNum, req.body);
        if (!updated) {
            return handleError(res, 404, 'Chapter not found');
        }

        return res.json({
            success: true,
            message: 'Chapter updated successfully'
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to update chapter', err);
    }
};

// POST: Delete chapter
exports.deleteChapter = async (req, res) => {
    const { username, vanity, chapternum } = req.params;
    const userId = req.session.userId;

    if (!userId) {
        return handleError(res, 401, 'Authentication required');
    }

    const chapNum = parseInt(chapternum, 10);

    try {
        const story = await storyService.getStorySummaryByUserAndVanity(username, vanity);
        if (!story || story.user_id !== userId) {
            return handleError(res, 403, 'Forbidden');
        }

        const deleted = await storyService.deleteChapter(story.id, chapNum);
        if (!deleted) {
            return handleError(res, 404, 'Chapter not found');
        }

        return res.json({
            success: true,
            message: 'Chapter deleted successfully'
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to delete chapter', err);
    }
};

// POST: Rate story
exports.rateStory = async (req, res) => {
    const { username, vanity } = req.params;
    const userId = req.session.userId;

    if (!userId) {
        return handleError(res, 401, 'Authentication required');
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array().map(e => e.msg)
        });
    }

    const ratingValue = parseInt(req.body.rating);

    try {
        const story = await storyService.getStoryByUsernameAndVanity(username, vanity);
        if (!story) {
            return handleError(res, 404, 'Story not found');
        }

        if (story.user_id === userId) {
            return handleError(res, 403, "You can't rate your own story");
        }

        const existingRating = await storyService.getRating(userId, story.id);

        if (isNaN(ratingValue)) {
            if (existingRating) {
                await storyService.deleteRating(userId, story.id);
                return res.json({
                    success: true,
                    message: 'Rating cleared successfully'
                });
            }
            return handleError(res, 400, 'No rating to clear');
        }

        let action = 'updated';
        if (existingRating) {
            await storyService.updateRating(userId, story.id, ratingValue);
        } else {
            await storyService.insertRating(userId, story.id, ratingValue);
            action = 'created';
        }

        return res.json({
            success: true,
            message: `Rating ${action} successfully`,
            rating: ratingValue
        });
    } catch (err) {
        return handleError(res, 500, 'Failed to submit rating', err);
    }
};

// API-specific validation chains
exports.validateCreateStory = [
    body('title')
        .trim()
        .isLength({ min: 3 }).withMessage('Title must be at least 3 characters')
        .isLength({ max: 150 }).withMessage('Title must be less than 150 characters'),
    body('synopsis')
        .trim()
        .isLength({ min: 10 }).withMessage('Synopsis must be at least 10 characters')
];

exports.validateUpdateStory = exports.validateCreateStory;

exports.validateCreateChapter = [
    body('title')
        .trim()
        .isLength({ min: 1 }).withMessage('Chapter title is required')
        .isLength({ max: 100 }).withMessage('Title must be under 100 characters'),
    body('content')
        .trim()
        .isLength({ min: 10 }).withMessage('Content must be at least 10 characters')
];

exports.validateUpdateChapter = exports.validateCreateChapter;

exports.validateRating = [
    body('rating')
        .optional({ checkFalsy: true })
        .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5')
];

exports.routes = {
    'GET /': 'index',
    'GET /:username/:vanity': 'storyDetail',
    'GET /:username/:vanity/chapter/:chapternum': 'chapterDetail',
    'POST /create': ['validateCreateStory', 'createStory'],
    'POST /:username/:vanity/edit': ['validateUpdateStory', 'updateStory'],
    'POST /:username/:vanity/delete': 'deleteStory',
    'POST /:username/:vanity/chapter/add': ['validateCreateChapter', 'createChapter'],
    'POST /:username/:vanity/chapter/:chapternum/edit': ['validateUpdateChapter', 'updateChapter'],
    'POST /:username/:vanity/chapter/:chapternum/delete': 'deleteChapter',
    'POST /:username/:vanity/chapter/:chapternum/comments': 'addComment',
    'POST /:username/:vanity/chapter/:chapternum/comments/:commentId/edit': 'editComment',
    'POST /:username/:vanity/chapter/:chapternum/comments/:commentId/delete': 'deleteComment',
    'POST /:username/:vanity/rate': ['validateRating', 'rateStory']
};