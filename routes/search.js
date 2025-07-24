const db = require('../utils/queryBuilder');
const realDb = require('../config/db');

// Escape % and _ for safe LIKE queries
const escapeLike = (str) =>
    str.replace(/[%_\\]/g, (ch) => `\\${ch}`);

exports.index = (req, res) => {
    res.render('search/index', {
        q: req.query.q || '',
        types: req.query.types || ['users', 'stories', 'collections', 'comments', 'chapters']
    });
};

exports.results = async (req, res) => {
    const rawQ = req.query.q || '';
    const likeQ = `%${escapeLike(rawQ)}%`;
    let types = Array.isArray(req.query.types) ? req.query.types : [];
    if (!types.length) {
        types = ['users', 'stories', 'collections', 'comments', 'chapters'];
    }

    console.log('[SEARCH] Running search for:', rawQ, 'types:', types);

    try {
        const tasks = [];

        // USERS
        if (types.includes('users')) {
            console.log('[SEARCH] Querying users...');
            tasks.push(
                db.table('users')
                    .select(['id', 'username'])
                    .whereRaw('username LIKE ?', [likeQ])
                    .get()
                    .then(rows => ({ users: rows }))
            );
        }

        // STORIES
        if (types.includes('stories')) {
            console.log('[SEARCH] Querying stories...');
            tasks.push(
                db.table('stories')
                    .select(['id', 'title', 'user_id'])
                    .whereRaw('(title LIKE ? OR synopsis LIKE ?)', [likeQ, likeQ])
                    .get()
                    .then(rows => ({ stories: rows }))
            );
        }

        // COLLECTIONS
        if (types.includes('collections')) {
            console.log('[SEARCH] Querying collections...');
            tasks.push(
                db.table('collections')
                    .select(['id', 'title', 'user_id'])
                    .whereRaw('title LIKE ?', [likeQ])
                    .get()
                    .then(rows => ({ collections: rows }))
            );
        }

        // COMMENTS
        if (types.includes('comments')) {
            console.log('[SEARCH] Querying comments...');
            tasks.push(
                db.table('comments as c')
                    .select([
                        'c.id',
                        'c.chapter_id',
                        'c.content',
                        'ch.story_id',
                        's.user_id',
                        'ch.chapter_num'
                    ])
                    .join('chapters as ch', 'c.chapter_id = ch.id')
                    .join('stories as s', 'ch.story_id   = s.id')
                    .whereRaw('c.content LIKE ?', [likeQ])
                    .get()
                    .then(rows => ({ comments: rows }))
            );
        }

        // CHAPTERS
        if (types.includes('chapters')) {
            console.log('[SEARCH] Querying chapters...');
            tasks.push(
                db.table('chapters as ch')
                    .select([
                        'ch.id',
                        'ch.story_id',
                        'ch.title',
                        'ch.chapter_num',
                        's.user_id'
                    ])
                    .join('stories as s', 'ch.story_id = s.id')
                    .whereRaw('(ch.title LIKE ? OR ch.content LIKE ?)', [likeQ, likeQ])
                    .get()
                    .then(rows => ({ chapters: rows }))
            );
        }

        // Await all
        const parts = await Promise.all(tasks);
        const results = parts.reduce((acc, part) => Object.assign(acc, part), {});

        // Ensure all categories exist
        ['users', 'stories', 'collections', 'comments', 'chapters']
            .forEach(cat => { if (!results[cat]) results[cat] = []; });

        // AJAX/JSON response?
        if (req.xhr || (req.get('Accept') || '').includes('json')) {
            return res.json({ results });
        }

        // Render page
        res.render('search/index', {
            q: rawQ,
            types,
            results
        });
    }
    catch (err) {
        console.error('[SEARCH] Error running results:', err);
        if (req.xhr || (req.get('Accept') || '').includes('json')) {
            return res.status(500).json({ error: 'Search failed' });
        }
        res.status(500).send('Search failed');
    }
};

exports.routes = {
    'GET /': 'index',
    'GET /results': 'results'
};