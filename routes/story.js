const db = require('../utils/queryBuilder');
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
            title: `${story.title} - Chapter ${chapterNum}`
        });
    } catch (err) {
        logger.error(`${loggingPrefix} Database error`, { error: err.message, stack: err.stack });
        res.status(500).render('error', { message: 'Database error' });
    }
};

exports.routes = {
    'GET /': 'index',
    'GET /:username/:vanity': 'storyDetail',
    'GET /:username/:vanity/chapter/:chapternum': 'chapterDetail'
};