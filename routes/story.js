const db = require('../utils/queryBuilder');
const { body, validationResult } = require('express-validator');
const logger = require('../logger');

const loggingPrefix = "[STORY]";

exports.index = async (req, res) => {
    logger.info(`${loggingPrefix} Index route hit`);
    try {
        const stories = await db.table('story_summary')
            .orderBy('updated_at', 'DESC')
            .get();

        logger.info(`${loggingPrefix} Fetched ${stories.length} stories`);
        res.render('story/index', { stories, title: 'Stories' });
    } catch (err) {
        logger.error(`${loggingPrefix} Database error`, { error: err.message, stack: err.stack });
        res.status(500).render('error', { message: 'Database error' });
    }
};

exports.storyDetail = async (req, res) => {
    const username = req.params.username;
    const storyVanity = req.params.vanity;

    logger.info(`${loggingPrefix} Detail route hit`, { username, storyVanity });

    if (!username || !storyVanity) {
        return res.status(400).render('error', { message: 'Invalid username or story vanity' });
    }

    try {
        // 1) fetch story + ratings using username and story vanity
        const story = await db.table('story_summary')
            .whereField('username', username)
            .whereField('vanity', storyVanity)
            .first();

        if (!story) {
            logger.warn(`${loggingPrefix} Not found`, { username, storyVanity });
            return res.status(404).render('error', {
                message: 'Story not found'
            });
        }

        // 2) fetch chapters
        const chapters = await db
            .table('chapters')
            .whereField('story_id', story.id)
            .orderBy('chapter_num', 'ASC')
            .get();

        logger.info(`${loggingPrefix} Chapter count`, { count: chapters.length });

        res.render('story/detail', {
            story, chapters, title: story.title
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
        // verify story exists and get story details using username and vanity
        const story = await db
            .table('story_summary')
            .join('users', 'story_summary.user_id', '=', 'users.id')
            .select('story_summary.*', 'users.username')
            .whereField('users.username', username)
            .whereField('story_summary.vanity', storyVanity)
            .first();

        if (!story) {
            logger.warn(`${loggingPrefix} Story not found`, { username, storyVanity });
            return res.status(404).render('error', { message: 'Story not found' });
        }

        // fetch chapter
        const chapter = await db
            .table('chapters')
            .whereField('story_id', story.id)
            .whereField('chapter_num', chapterNum)
            .first();

        if (!chapter) {
            logger.warn(`${loggingPrefix} Chapter not found`, { storyId: story.id, chapterNum });
            return res.status(404).render('error', { message: 'Chapter not found' });
        }

        // format content
        const formattedContent = chapter.content
            .split('\n')
            .filter(line => line.trim())
            .map(line => `<p>${line}</p>`)
            .join('');

        // prev/next nav
        const nav = await db
            .table('chapters')
            .select(['chapter_num', 'title'])
            .whereRaw('story_id = ? AND chapter_num IN (?, ?)', [
                story.id, chapterNum - 1, chapterNum + 1
            ])
            .orderBy('chapter_num', 'ASC')
            .get();

        const prevChapter = nav.find(c => c.chapter_num === chapterNum - 1) || null;
        const nextChapter = nav.find(c => c.chapter_num === chapterNum + 1) || null;

        // comments
        const comments = await db
            .table('comments_with_users')
            .whereField('chapter_id', chapter.id)
            .orderBy('created_at', 'ASC')
            .get();

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
        .isLength({ max: 150 }).withMessage('Title must be less than 150 characters.')
        .custom(async (value, { req }) => {
            const userId = req.session.userId;
            if (!userId) return true;
            const existing = await db
                .table('stories')
                .select('id')
                .whereField('user_id', userId)
                .whereField('title', value)
                .first();
            if (existing) {
                throw new Error('You already have a story with that title.');
            }
            return true;
        }),
    body('synopsis')
        .trim()
        .isLength({ min: 10 }).withMessage('Synopsis must be at least 10 characters long.')
];

// ---- Create Story ----
exports.createForm = (req, res) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    logger.info(`${loggingPrefix} Create form accessed`, { userId: req.session.userId });
    res.render('story/create', { title: 'Create New Story', errors: null, formData: {} });
};

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

    try {
        const userId = req.session.userId;
        const { title, synopsis } = req.body;
        const storyData = {
            user_id: userId,
            title: title.trim(),
            synopsis: synopsis.trim()
        };
        const result = await db.table('stories').insertAsync(storyData);
        const storyId = result.insertId || result[0];
        const createdStory = await db.table('stories').whereField('id', storyId).first();

        logger.info(`${loggingPrefix} Story created successfully`, {
            userId,
            storyId,
            title: title.substring(0, 50),
            vanity: createdStory.vanity
        });

        const user = await db.table('users').whereField('id', userId).first();
        res.redirect(`/story/${user.username}/${createdStory.vanity}`);
    } catch (err) {
        logger.error(`${loggingPrefix} Story creation error`, { error: err.message, stack: err.stack });
        res.render('story/create', {
            title: 'Create New Story',
            errors: ['An error occurred while creating your story. Please try again.'],
            formData: req.body
        });
    }
};

// validators (near validateCreateStory)
exports.validateUpdateStory = [
    body('title')
        .trim()
        .isLength({ min: 3 }).withMessage('Title must be at least 3 characters long.')
        .isLength({ max: 150 }).withMessage('Title must be less than 150 characters.'),
    body('synopsis')
        .trim()
        .isLength({ min: 10 }).withMessage('Synopsis must be at least 10 characters long.')
];

// GET form
exports.editStoryForm = async (req, res) => {
    const { username, vanity } = req.params;
    const userId = req.session.userId;
    const story = await db.table('story_summary')
        .whereField('username', username)
        .whereField('vanity', vanity)
        .first();

    if (!story || story.user_id !== userId) return res.status(403).render('error', { message: 'Forbidden' });
    res.render('story/edit', { title: 'Edit Story', formData: story, errors: null });
};

// POST update
exports.updateStory = async (req, res) => {
    const { username, vanity } = req.params;
    const userId = req.session.userId;
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const formData = {
            ...req.body,
            username,
            vanity
        };
        return res.render('story/edit', {
            title: 'Edit Story',
            errors: errors.array().map(e => e.msg),
            formData
        });
    }

    const story = await db.table('stories')
        .whereField('vanity', vanity)
        .whereField('user_id', userId)
        .first();
    if (!story) return res.status(404).render('error', { message: 'Not found' });

    // Update title & synopsis (trigger will auto-update vanity if title changed)
    await db.table('stories')
        .whereField('id', story.id)
        .update({
            title: req.body.title.trim(),
            synopsis: req.body.synopsis.trim()
        });

    // Re-fetch updated story to get the possibly changed vanity
    const updatedStory = await db.table('stories')
        .whereField('id', story.id)
        .first();

    res.redirect(`/story/${username}/${updatedStory.vanity}`);
};

// POST delete
exports.deleteStory = async (req, res) => {
    const { username, vanity } = req.params;
    const userId = req.session.userId;
    const story = await db.table('stories')
        .whereField('vanity', vanity)
        .whereField('user_id', userId)
        .first();
    if (!story) return res.status(404).render('error', { message: 'Not found' });
    await db.table('stories').whereField('id', story.id).delete();
    res.redirect('/users/');
};

exports.addComment = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        // redirect or error out here
        return res.redirect('/auth/login');
    }

    const { content, parent_id } = req.body;
    const username = req.params.username;
    const vanity = req.params.vanity;
    const chapterNum = parseInt(req.params.chapternum, 10);

    if (!content || isNaN(chapterNum)) {
        return res.status(400).render('error', { message: 'Invalid comment data' });
    }

    try {
        // 1) fetch story & verify it exists
        const story = await db
            .table('story_summary')
            .join('users', 'story_summary.user_id', '=', 'users.id')
            .select('story_summary.*', 'users.username')
            .whereField('users.username', username)
            .whereField('story_summary.vanity', vanity)
            .first();

        if (!story) {
            logger.warn(`${loggingPrefix} Story not found in addComment`, { username, vanity });
            return res.status(404).render('error', { message: 'Story not found' });
        }

        // 2) fetch the chapter
        const chapter = await db
            .table('chapters')
            .whereField('story_id', story.id)
            .whereField('chapter_num', chapterNum)
            .first();

        if (!chapter) {
            logger.warn(`${loggingPrefix} Chapter not found in addComment`, { storyId: story.id, chapterNum });
            return res.status(404).render('error', { message: 'Chapter not found' });
        }

        // 3) insert the comment
        await db.table('comments').insertAsync({
            user_id: userId,
            chapter_id: chapter.id,
            parent_id: parent_id || null,
            content
        });

        return res.redirect('back');
    } catch (err) {
        logger.error(`${loggingPrefix} Comment insert error`, { error: err.message, stack: err.stack });
        return res.status(500).render('error', { message: 'Database error' });
    }
};

exports.editComment = async (req, res) => {
    // Check if this is actually a delete request disguised as edit
    if (req.body._method === 'DELETE' || req.query._method === 'DELETE') {
        return exports.deleteComment(req, res);
    }

    const userId = req.session.userId;
    if (!userId) {
        return res.redirect('/auth/login');
    }

    const { content } = req.body;
    const commentId = parseInt(req.params.commentId, 10);
    const username = req.params.username;
    const vanity = req.params.vanity;
    const chapterNum = parseInt(req.params.chapternum, 10);

    if (!content || isNaN(commentId) || isNaN(chapterNum)) {
        return res.status(400).render('error', { message: 'Invalid comment data' });
    }

    try {
        // 1) Verify the comment exists and belongs to the user
        const comment = await db
            .table('comments')
            .join('users', 'comments.user_id', '=', 'users.id')
            .select('comments.*', 'users.username')
            .whereField('comments.id', commentId)
            .whereField('comments.user_id', userId)
            .first();

        if (!comment) {
            logger.warn(`${loggingPrefix} Comment not found or unauthorized in editComment`, { commentId, userId });
            return res.status(404).render('error', { message: 'Comment not found or unauthorized' });
        }

        // 2) Update the comment
        await db.table('comments')
            .whereField('id', commentId)
            .whereField('user_id', userId)
            .update({ content });

        logger.info(`${loggingPrefix} Comment updated`, { commentId, userId, content: content.substring(0, 50) + '...' });
        return res.redirect('back');
    } catch (err) {
        logger.error(`${loggingPrefix} Comment update error`, { error: err.message, stack: err.stack });
        return res.status(500).render('error', { message: 'Database error' });
    }
};

exports.deleteComment = async (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.redirect('/auth/login');
    }

    const commentId = parseInt(req.params.commentId, 10);
    const username = req.params.username;
    const vanity = req.params.vanity;
    const chapterNum = parseInt(req.params.chapternum, 10);

    if (isNaN(commentId) || isNaN(chapterNum)) {
        return res.status(400).render('error', { message: 'Invalid comment ID' });
    }

    try {
        // 1) Verify the comment exists and belongs to the user
        const comment = await db
            .table('comments')
            .join('users', 'comments.user_id', '=', 'users.id')
            .select('comments.*', 'users.username')
            .whereField('comments.id', commentId)
            .whereField('comments.user_id', userId)
            .first();

        if (!comment) {
            logger.warn(`${loggingPrefix} Comment not found or unauthorized in deleteComment`, { commentId, userId });
            return res.status(404).render('error', { message: 'Comment not found or unauthorized' });
        }

        // 2) Check if comment has replies - you might want to handle this differently
        const replyCount = await db.table('comments')
            .whereField('parent_id', commentId)
            .count();

        if (replyCount > 0) {
            // Option 1: Soft delete - mark as deleted but keep structure
            await db.table('comments')
                .whereField('id', commentId)
                .whereField('user_id', userId)
                .update({
                    content: '[deleted]',
                    is_deleted: true
                });
        } else {
            // Option 2: Hard delete if no replies
            await db.table('comments')
                .whereField('id', commentId)
                .whereField('user_id', userId)
                .delete();
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

// GET: show form to add chapter
exports.createChapterForm = async (req, res) => {
    const { username, vanity } = req.params;
    const story = await db.table('story_summary')
        .whereField('username', username)
        .whereField('vanity', vanity)
        .first();
    if (!story || story.user_id !== req.session.userId) {
        return res.status(403).render('error', { message: 'Forbidden' });
    }
    res.render('chapter/create', { title: 'Add Chapter', errors: null, formData: { username, vanity, chapter_num: '', title: '', content: '' } });
};

// POST: create chapter
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
        const story = await db.table('story_summary')
            .whereField('username', username)
            .whereField('vanity', vanity)
            .first();
        if (!story || story.user_id !== req.session.userId) {
            return res.status(403).render('error', { message: 'Forbidden' });
        }

        // Check for duplicate chapter number
        const existingChapter = await db.table('chapters')
            .whereField('story_id', story.id)
            .whereField('chapter_num', chapNum)
            .first();

        if (existingChapter) {
            return res.render('chapter/create', {
                title: 'Add Chapter',
                errors: ['Chapter number already exists for this story.'],
                formData: { username, vanity, chapter_num: req.body.chapter_num, title: req.body.title, content: req.body.content }
            });
        }

        await db.table('chapters').insertAsync({
            story_id: story.id,
            chapter_num: chapNum,
            title: req.body.title.trim(),
            content: req.body.content.trim()
        });
        res.redirect(`/story/${username}/${vanity}`);
    } catch (err) {
        logger.error(`${loggingPrefix} Chapter create error`, { error: err.message, stack: err.stack });
        res.render('chapter/create', { title: 'Add Chapter', errors: ['Error creating chapter'], formData: req.body });
    }
};

// GET: edit chapter form
exports.editChapterForm = async (req, res) => {
    const { username, vanity, chapternum } = req.params;
    const story = await db.table('story_summary')
        .whereField('username', username)
        .whereField('vanity', vanity)
        .first();
    const chapNum = parseInt(chapternum, 10);
    if (!story || story.user_id !== req.session.userId) {
        return res.status(403).render('error', { message: 'Forbidden' });
    }
    const chapter = await db.table('chapters')
        .whereField('story_id', story.id)
        .whereField('chapter_num', chapNum)
        .first();
    if (!chapter) return res.status(404).render('error', { message: 'Chapter not found' });
    res.render('chapter/edit', { title: 'Edit Chapter', errors: null, formData: { username, vanity, chapter_num: chapNum, title: chapter.title, content: chapter.content } });
};

// POST: update chapter
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
    try {
        const story = await db.table('story_summary')
            .whereField('username', username)
            .whereField('vanity', vanity)
            .first();
        if (!story || story.user_id !== req.session.userId) {
            return res.status(403).render('error', { message: 'Forbidden' });
        }
        await db.table('chapters')
            .whereField('story_id', story.id)
            .whereField('chapter_num', chapNum)
            .update({ title: req.body.title.trim(), content: req.body.content.trim() });
        res.redirect(`/story/${username}/${vanity}/chapter/${chapNum}`);
    } catch (err) {
        logger.error(`${loggingPrefix} Chapter update error`, { error: err.message, stack: err.stack });
        res.render('chapter/edit', { title: 'Edit Chapter', errors: ['Error updating chapter'], formData: req.body });
    }
};

// POST: delete chapter
exports.deleteChapter = async (req, res) => {
    const { username, vanity, chapternum } = req.params;
    const chapNum = parseInt(chapternum, 10);
    try {
        const story = await db.table('story_summary')
            .whereField('username', username)
            .whereField('vanity', vanity)
            .first();
        if (!story || story.user_id !== req.session.userId) {
            return res.status(403).render('error', { message: 'Forbidden' });
        }
        await db.table('chapters')
            .whereField('story_id', story.id)
            .whereField('chapter_num', chapNum)
            .delete();
        res.redirect(`/story/${username}/${vanity}`);
    } catch (err) {
        logger.error(`${loggingPrefix} Chapter delete error`, { error: err.message, stack: err.stack });
        res.status(500).render('error', { message: 'Error deleting chapter' });
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
};
