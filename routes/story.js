const { body, validationResult } = require('express-validator');
const logger = require('../logger');
const storyService = require('../services/storyService');

const loggingPrefix = "[STORY]";

// GET: Render the homepage listing all stories
exports.index = async (req, res) => {
    logger.info(`${loggingPrefix} Index route hit`);
    try {
        const stories = await storyService.getAllStories();
        logger.info(`${loggingPrefix} Fetched ${stories.length} stories`);
        res.render('story/index', { stories, title: 'Stories' });
    } catch (err) {
        logger.error(`${loggingPrefix} Database error`, { error: err.message, stack: err.stack });
        res.status(500).render('error', { message: 'Database error' });
    }
};

// GET: Show detailed view of a specific chapter including navigation and comments and rating
exports.storyDetail = async (req, res) => {
    const { username, vanity: storyVanity } = req.params;
    logger.info(`${loggingPrefix} Detail route hit`, { username, storyVanity });

    if (!username || !storyVanity) {
        return res.status(400).render('error', { message: 'Invalid username or story vanity' });
    }

    try {
        const story = await storyService.getStoryByUsernameAndVanity(username, storyVanity);
        if (!story) {
            logger.warn(`${loggingPrefix} Not found`, { username, storyVanity });
            return res.status(404).render('error', { message: 'Story not found' });
        }

        const chapters = await storyService.getChaptersByStoryId(story.id);

        let userRating = null;
        if (req.session.userId && req.session.userId !== story.user_id) {
            userRating = await storyService.getUserRatingForStory(req.session.userId, story.id);
        }

        logger.info(`${loggingPrefix} Chapter count`, { count: chapters.length });

        res.render('story/detail', {
            story, chapters, userRating, title: story.title
        });
    } catch (err) {
        logger.error(`${loggingPrefix} Database error`, { error: err.message, stack: err.stack });
        res.status(500).render('error', { message: 'Database error' });
    }
};

exports.chapterDetail = async (req, res) => {
    const username = req.params.username;
    const storyVanity = req.params.vanity;
    const chapterNum = parseInt(req.params.chapternum, 10);

    logger.info(`${loggingPrefix} Chapter route hit`, { username, storyVanity, chapterNum });

    if (!username || !storyVanity || isNaN(chapterNum)) {
        return res.status(400).render('error', { message: 'Invalid parameters' });
    }

    try {
        const story = await storyService.getStoryWithUser(username, storyVanity);
        if (!story) {
            logger.warn(`${loggingPrefix} Story not found`, { username, storyVanity });
            return res.status(404).render('error', { message: 'Story not found' });
        }

        const chapter = await storyService.getChapterByStoryIdAndNumber(story.id, chapterNum);
        if (!chapter) {
            logger.warn(`${loggingPrefix} Chapter not found`, { storyId: story.id, chapterNum });
            return res.status(404).render('error', { message: 'Chapter not found' });
        }

        const formattedContent = chapter.content
            .split('\n')
            .filter(line => line.trim())
            .map(line => `<p>${line}</p>`)
            .join('');

        const { prevChapter, nextChapter } = await storyService.getChapterNavigation(story.id, chapterNum);
        const comments = await storyService.getCommentsForChapter(chapter.id);

        res.render('story/chapter', {
            story,
            chapter: { ...chapter, formattedContent },
            prevChapter,
            nextChapter,
            comments,
            title: `${story.title} - Chapter ${chapterNum}`,
            userId: req.session.userId,
        });
    } catch (err) {
        logger.error(`${loggingPrefix} Database error`, { error: err.message, stack: err.stack });
        res.status(500).render('error', { message: 'Database error' });
    }
};

// ---- Validators ----
exports.validateCreateStory = [
    body('title')
        .trim()
        .isLength({ min: 3 }).withMessage('Title must be at least 3 characters long.')
        .isLength({ max: 150 }).withMessage('Title must be less than 150 characters.'),
    body('synopsis')
        .trim()
        .isLength({ min: 10 }).withMessage('Synopsis must be at least 10 characters long.')
];

// ---- Create Story ----
// GET: Show form for creating a new story (auth required)
exports.createForm = (req, res) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    logger.info(`${loggingPrefix} Create form accessed`, { userId: req.session.userId });
    res.render('story/create', { title: 'Create New Story', errors: null, formData: {} });
};

// POST: Validate and create a new story if data is valid and title unused
exports.createStory = async (req, res) => {
    if (!req.session.userId) return res.redirect('/auth/login');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const msgs = errors.array().map(e => e.msg);
        return res.render('story/create', {
            title: 'Create New Story',
            errors: msgs,
            formData: req.body
        });
    }

    const titleTaken = await storyService.isTitleTaken(req.session.userId, req.body.title);
    if (titleTaken) {
        return res.render('story/create', {
            title: 'Create New Story',
            errors: ['You already have a story with that title.'],
            formData: req.body
        });
    }

    try {
        const { title, synopsis } = req.body;
        const { createdStory, username } = await storyService.createStory(req.session.userId, title, synopsis);

        logger.info(`${loggingPrefix} Story created successfully`, {
            userId: req.session.userId,
            storyId: createdStory.id,
            title: title.substring(0, 50),
            vanity: createdStory.vanity
        });

        res.redirect(`/story/${username}/${createdStory.vanity}`);
    } catch (err) {
        logger.error(`${loggingPrefix} Story creation error`, { error: err.message, stack: err.stack });
        res.render('story/create', {
            title: 'Create New Story',
            errors: ['An error occurred while creating your story. Please try again.'],
            formData: req.body
        });
    }
};

// ---- Validators ----
exports.validateUpdateStory = [
    body('title')
        .trim()
        .isLength({ min: 3 }).withMessage('Title must be at least 3 characters long.')
        .isLength({ max: 150 }).withMessage('Title must be less than 150 characters.'),
    body('synopsis')
        .trim()
        .isLength({ min: 10 }).withMessage('Synopsis must be at least 10 characters long.')
];

// GET: Show form to edit an existing story if authorized
exports.editStoryForm = async (req, res) => {
    const { username, vanity } = req.params;
    const userId = req.session.userId;

    const story = await storyService.getStoryByUsernameAndVanity(username, vanity);
    if (!story || story.user_id !== userId) {
        return res.status(403).render('error', { message: 'Forbidden' });
    }
    res.render('story/edit', { title: 'Edit Story', formData: story, errors: null });
};

// POST: Validate and update an existing story, then redirect to its detail
exports.updateStory = async (req, res) => {
    const { username, vanity } = req.params;
    const userId = req.session.userId;
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const formData = { ...req.body, username, vanity };
        return res.render('story/edit', {
            title: 'Edit Story',
            errors: errors.array().map(e => e.msg),
            formData
        });
    }

    const story = await storyService.getStoryByUserIdAndVanity(userId, vanity);
    if (!story) {
        return res.status(404).render('error', { message: 'Not found' });
    }

    await storyService.updateStoryById(story.id, req.body.title, req.body.synopsis);

    const updatedStory = await storyService.getStoryById(story.id);

    res.redirect(`/story/${username}/${updatedStory.vanity}`);
};

// POST: Delete an existing story if authorized
exports.deleteStory = async (req, res) => {
    const { username, vanity } = req.params;
    const userId = req.session.userId;

    const story = await storyService.getStoryByUserIdAndVanity(userId, vanity);
    if (!story) return res.status(404).render('error', { message: 'Not found' });

    await storyService.deleteStoryById(story.id);

    res.redirect('/users/');
};

// POST: Add a comment to a chapter if authorized
exports.addComment = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/auth/login');

    const { content, parent_id } = req.body;
    const { username, vanity, chapternum } = req.params;
    const chapterNum = parseInt(chapternum, 10);

    if (!content || isNaN(chapterNum)) {
        return res.status(400).render('error', { message: 'Invalid comment data' });
    }

    try {
        const story = await storyService.getStorySummaryByUsernameAndVanity(username, vanity);
        if (!story) {
            logger.warn(`${loggingPrefix} Story not found in addComment`, { username, vanity });
            return res.status(404).render('error', { message: 'Story not found' });
        }

        const chapter = await storyService.getChapterByStoryIdAndNumber(story.id, chapterNum);
        if (!chapter) {
            logger.warn(`${loggingPrefix} Chapter not found in addComment`, { storyId: story.id, chapterNum });
            return res.status(404).render('error', { message: 'Chapter not found' });
        }

        await storyService.addComment({
            userId,
            chapterId: chapter.id,
            parentId: parent_id || null,
            content
        });

        res.redirect('back');
    } catch (err) {
        logger.error(`${loggingPrefix} Comment insert error`, { error: err.message, stack: err.stack });
        res.status(500).render('error', { message: 'Database error' });
    }
};

// POST: Edit an existing comment
exports.editComment = async (req, res) => {
    if (req.body._method === 'DELETE' || req.query._method === 'DELETE') {
        return exports.deleteComment(req, res);
    }

    const userId = req.session.userId;
    if (!userId) return res.redirect('/auth/login');

    const { content } = req.body;
    const commentId = parseInt(req.params.commentId, 10);
    const chapterNum = parseInt(req.params.chapternum, 10);

    if (!content || isNaN(commentId) || isNaN(chapterNum)) {
        return res.status(400).render('error', { message: 'Invalid comment data' });
    }

    try {
        const comment = await storyService.getCommentByIdAndUser(commentId, userId);
        if (!comment) {
            logger.warn(`${loggingPrefix} Comment not found or unauthorized in editComment`, { commentId, userId });
            return res.status(404).render('error', { message: 'Comment not found or unauthorized' });
        }

        await storyService.updateCommentByIdAndUser(commentId, userId, content);

        logger.info(`${loggingPrefix} Comment updated`, { commentId, userId, content: content.substring(0, 50) + '...' });
        return res.redirect('back');
    } catch (err) {
        logger.error(`${loggingPrefix} Comment update error`, { error: err.message, stack: err.stack });
        return res.status(500).render('error', { message: 'Database error' });
    }
};

// POST: Delete (soft or hard) a comment if authorized
exports.deleteComment = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) return res.redirect('/auth/login');

    const commentId = parseInt(req.params.commentId, 10);
    const chapterNum = parseInt(req.params.chapternum, 10);

    if (isNaN(commentId) || isNaN(chapterNum)) {
        return res.status(400).render('error', { message: 'Invalid comment ID' });
    }

    try {
        const comment = await storyService.getCommentByIdAndUser(commentId, userId);
        if (!comment) {
            logger.warn(`${loggingPrefix} Comment not found or unauthorized in deleteComment`, { commentId, userId });
            return res.status(404).render('error', { message: 'Comment not found or unauthorized' });
        }

        const replyCount = await storyService.getReplyCountForComment(commentId);

        if (replyCount > 0) {
            await storyService.softDeleteComment(commentId, userId);
        } else {
            await storyService.hardDeleteComment(commentId, userId);
        }

        logger.info(`${loggingPrefix} Comment deleted`, { commentId, userId, hadReplies: replyCount > 0 });
        return res.redirect('back');
    } catch (err) {
        logger.error(`${loggingPrefix} Comment delete error`, { error: err.message, stack: err.stack });
        return res.status(500).render('error', { message: 'Database error' });
    }
};

// ---- Chapter Validators ----
exports.validateCreateChapter = [
    body('title')
        .trim()
        .isLength({ min: 1 }).withMessage('Chapter title is required.')
        .isLength({ max: 100 }).withMessage('Title must be under 100 characters.'),
    body('content')
        .trim()
        .isLength({ min: 10 }).withMessage('Content must be at least 10 characters.')
];

exports.validateUpdateChapter = exports.validateCreateChapter;

// GET: Show form to add a new chapter if authorized
exports.createChapterForm = async (req, res) => {
    const { username, vanity } = req.params;
    const story = await storyService.getStorySummaryByUsernameAndVanity(username, vanity);
    if (!story || story.user_id !== req.session.userId) {
        return res.status(403).render('error', { message: 'Forbidden' });
    }
    res.render('chapter/create', {
        title: 'Add Chapter',
        errors: null,
        formData: { username, vanity, chapter_num: '', title: '', content: '' }
    });
};

// POST: Validate and create a new chapter if authorized and chapter number unused
exports.createChapter = async (req, res) => {
    const { username, vanity } = req.params;
    const chapNum = parseInt(req.body.chapter_num, 10);
    const errors = validationResult(req);

    if (!errors.isEmpty() || isNaN(chapNum)) {
        const msgs = errors.array().map(e => e.msg);
        if (isNaN(chapNum)) msgs.push('Invalid chapter number');
        return res.render('chapter/create', {
            title: 'Add Chapter',
            errors: msgs,
            formData: { username, vanity, chapter_num: req.body.chapter_num, title: req.body.title, content: req.body.content }
        });
    }

    try {
        const story = await storyService.getStorySummaryByUsernameAndVanity(username, vanity);
        if (!story || story.user_id !== req.session.userId) {
            return res.status(403).render('error', { message: 'Forbidden' });
        }

        const existingChapter = await storyService.chapterExists(story.id, chapNum);
        if (existingChapter) {
            return res.render('chapter/create', {
                title: 'Add Chapter',
                errors: ['Chapter number already exists for this story.'],
                formData: { username, vanity, chapter_num: req.body.chapter_num, title: req.body.title, content: req.body.content }
            });
        }

        await storyService.createChapter(story.id, chapNum, req.body.title, req.body.content);
        res.redirect(`/story/${username}/${vanity}`);
    } catch (err) {
        logger.error(`${loggingPrefix} Chapter create error`, { error: err.message, stack: err.stack });
        res.render('chapter/create', {
            title: 'Add Chapter',
            errors: ['Error creating chapter'],
            formData: req.body
        });
    }
};

// GET: Show form to edit a chapter if authorized
exports.editChapterForm = async (req, res) => {
    const { username, vanity, chapternum } = req.params;
    const chapNum = parseInt(chapternum, 10);

    const story = await storyService.getStorySummaryByUsernameAndVanity(username, vanity);
    if (!story || story.user_id !== req.session.userId) {
        return res.status(403).render('error', { message: 'Forbidden' });
    }

    const chapter = await storyService.getChapterByStoryIdAndNumber(story.id, chapNum);
    if (!chapter) {
        return res.status(404).render('error', { message: 'Chapter not found' });
    }

    res.render('chapter/edit', {
        title: 'Edit Chapter',
        errors: null,
        formData: {
            username,
            vanity,
            chapter_num: chapNum,
            title: chapter.title,
            content: chapter.content
        }
    });
};

// POST: Validate and update a chapter if authorized
exports.updateChapter = async (req, res) => {
    const { username, vanity, chapternum } = req.params;
    const chapNum = parseInt(chapternum, 10);
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return res.render('chapter/edit', {
            title: 'Edit Chapter',
            errors: errors.array().map(e => e.msg),
            formData: { username, vanity, chapter_num: chapternum, title: req.body.title, content: req.body.content }
        });
    }

    const story = await storyService.getStorySummaryByUsernameAndVanity(username, vanity);
    if (!story || story.user_id !== req.session.userId) {
        return res.status(403).render('error', { message: 'Forbidden' });
    }

    try {
        await storyService.updateChapter(story.id, chapNum, req.body);
        res.redirect(`/story/${username}/${vanity}/chapter/${chapNum}`);
    } catch (err) {
        logger.error(`${loggingPrefix} Chapter update error`, { error: err.message, stack: err.stack });
        res.render('chapter/edit', { title: 'Edit Chapter', errors: ['Error updating chapter'], formData: req.body });
    }
};

// POST: Delete a chapter if authorized
exports.deleteChapter = async (req, res) => {
    const { username, vanity, chapternum } = req.params;
    const chapNum = parseInt(chapternum, 10);

    const story = await storyService.getStorySummaryByUsernameAndVanity(username, vanity);
    if (!story || story.user_id !== req.session.userId) {
        return res.status(403).render('error', { message: 'Forbidden' });
    }

    try {
        await storyService.deleteChapter(story.id, chapNum);
        res.redirect(`/story/${username}/${vanity}`);
    } catch (err) {
        logger.error(`${loggingPrefix} Chapter delete error`, { error: err.message, stack: err.stack });
        res.status(500).render('error', { message: 'Error deleting chapter' });
    }
};

// ---- Validators ----
exports.validateRating = [
    body('rating')
        .optional({ checkFalsy: true })  // Allow empty values
        .isInt({ min: 1, max: 5 })
        .withMessage('Rating must be between 1 and 5 stars')
];

// POST: Submit a rating for a story if valid and authorized
exports.rateStory = async (req, res) => {
    const errors = validationResult(req);
    const { username, vanity } = req.params;
    const userId = req.session.userId;
    const redirectUrl = `/story/${username}/${vanity}`;

    if (!errors.isEmpty()) {
        return res.redirect(`${redirectUrl}?error=${encodeURIComponent(errors.array()[0].msg)}`);
    }

    const ratingValue = parseInt(req.body.rating);

    try {
        const story = await storyService.getStoryByUsernameAndVanity(username, vanity);
        if (!story) return res.redirect(`${redirectUrl}?error=${encodeURIComponent('Story not found')}`);

        if (story.user_id === userId) {
            return res.redirect(`${redirectUrl}?error=${encodeURIComponent("You can't rate your own story")}`);
        }

        const existingRating = await storyService.getRating(userId, story.id);

        if (isNaN(ratingValue)) {
            if (existingRating) {
                await storyService.deleteRating(userId, story.id);
                return res.redirect(`${redirectUrl}?success=${encodeURIComponent('Rating cleared successfully!')}`);
            }
            return res.redirect(`${redirectUrl}?info=${encodeURIComponent('No rating to clear')}`);
        }

        if (existingRating) {
            await storyService.updateRating(userId, story.id, ratingValue);
        } else {
            await storyService.insertRating(userId, story.id, ratingValue);
        }

        return res.redirect(`${redirectUrl}?success=${encodeURIComponent('Rating submitted successfully!')}`);
    } catch (err) {
        logger.error(`${loggingPrefix} Rating error`, { error: err.message, stack: err.stack });
        return res.redirect(`${redirectUrl}?error=${encodeURIComponent('Error submitting rating')}`);
    }
};

exports.routes = {
    'GET /': 'index',
    'GET /create': 'createForm',
    'POST /create': ['validateCreateStory', 'createStory'],
    'GET /:username/:vanity': 'storyDetail',
    'GET /:username/:vanity/chapter/add': 'createChapterForm',
    'POST /:username/:vanity/chapter/add': ['validateCreateChapter', 'createChapter'],
    'GET /:username/:vanity/chapter/:chapternum/edit': 'editChapterForm',
    'POST /:username/:vanity/chapter/:chapternum/edit': ['validateUpdateChapter', 'updateChapter'],
    'POST /:username/:vanity/chapter/:chapternum/delete': 'deleteChapter',
    'GET /:username/:vanity/chapter/:chapternum': 'chapterDetail',
    'POST /:username/:vanity/chapter/:chapternum/comments': 'addComment',
    'POST /:username/:vanity/chapter/:chapternum/comments/:commentId/edit': 'editComment',
    'POST /:username/:vanity/chapter/:chapternum/comments/:commentId/delete': 'deleteComment',
    'GET /:username/:vanity/edit': 'editStoryForm',
    'POST /:username/:vanity/edit': ['validateUpdateStory', 'updateStory'],
    'POST /:username/:vanity/delete': 'deleteStory',
    'POST /:username/:vanity/rate': ['validateRating', 'rateStory']
};
