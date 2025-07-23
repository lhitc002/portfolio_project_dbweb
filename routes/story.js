const db = require('../utils/queryBuilder');
const logger = require('../logger');

const loggingPrefix = "[STORY]";

exports.index = async (req, res) => {
    logger.info(`${loggingPrefix} Index route hit`);
    try {
        const stories = await db
            .table('stories as s')
            .select([
                's.*',
                'u.username',
                'COUNT(DISTINCT c.id)     AS chapter_count',
                'AVG(r.rating)            AS avg_rating',
                'COUNT(DISTINCT r.user_id) AS rating_count'
            ])
            .join('users as u', 's.user_id = u.id')
            .leftJoin('chapters as c', 's.id = c.story_id')
            .leftJoin('ratings  as r', 's.id = r.story_id')
            .groupBy(['s.id'])
            .orderBy('s.updated_at', 'DESC')
            .get();

        logger.info(`${loggingPrefix} Fetched ${stories.length} stories`);
        res.render('story/index', { stories, title: 'Stories' });
    } catch (err) {
        logger.error(`${loggingPrefix} Database error`, { error: err.message, stack: err.stack });
        res.status(500).render('error', { message: 'Database error' });
    }
};

exports.storyDetail = async (req, res) => {
    const userId = parseInt(req.params.userid, 10);
    const storyId = parseInt(req.params.storyid, 10);

    logger.info(`${loggingPrefix} Detail route hit`, { userId, storyId });

    if (isNaN(userId) || isNaN(storyId)) {
        return res.status(400).render('error', { message: 'Invalid user or story ID' });
    }

    try {
        // 1) fetch story + ratings
        const story = await db
            .table('stories as s')
            .select([
                's.*',
                'u.username',
                'AVG(r.rating)            AS avg_rating',
                'COUNT(DISTINCT r.user_id) AS rating_count'
            ])
            .join('users as u', 's.user_id = u.id')
            .leftJoin('ratings as r', 's.id = r.story_id')
            .whereField('s.id', storyId)
            .whereField('s.user_id', userId)
            .groupBy(['s.id'])
            .first();

        if (!story) {
            logger.warn(`${loggingPrefix} Not found or unauthorized`, { userId, storyId });
            return res.status(404).render('error', {
                message: 'Story not found or does not belong to this user'
            });
        }

        // 2) fetch chapters
        const chapters = await db
            .table('chapters')
            .whereField('story_id', storyId)
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
    const userId = parseInt(req.params.userid, 10);
    const storyId = parseInt(req.params.storyid, 10);
    const chapterNum = parseInt(req.params.chapternum, 10);

    logger.info(`${loggingPrefix} Chapter route hit`, { userId, storyId, chapterNum });

    if ([userId, storyId, chapterNum].some(isNaN)) {
        return res.status(400).render('error', { message: 'Invalid parameters' });
    }

    try {
        // verify story ownership
        const story = await db
            .table('stories as s')
            .select(['s.*', 'u.username'])
            .join('users as u', 's.user_id = u.id')
            .whereField('s.id', storyId)
            .whereField('s.user_id', userId)
            .first();

        if (!story) {
            logger.warn(`${loggingPrefix} Story not found`, { userId, storyId });
            return res.status(404).render('error', { message: 'Story not found' });
        }

        // fetch chapter
        const chapter = await db
            .table('chapters')
            .whereField('story_id', storyId)
            .whereField('chapter_num', chapterNum)
            .first();

        if (!chapter) {
            logger.warn(`${loggingPrefix} Chapter not found`, { storyId, chapterNum });
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
                storyId, chapterNum - 1, chapterNum + 1
            ])
            .orderBy('chapter_num', 'ASC')
            .get();

        const prevChapter = nav.find(c => c.chapter_num === chapterNum - 1) || null;
        const nextChapter = nav.find(c => c.chapter_num === chapterNum + 1) || null;

        // comments
        const comments = await db
            .table('comments as c')
            .select(['c.*', 'u.username'])
            .join('users as u', 'c.user_id = u.id')
            .whereField('c.chapter_id', chapter.id)
            .orderBy('c.created_at', 'ASC')
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
    'GET /:userid/:storyid': 'storyDetail',
    'GET /:userid/:storyid/chapter/:chapternum': 'chapterDetail'
};