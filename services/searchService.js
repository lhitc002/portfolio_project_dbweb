const db = require('../utils/queryBuilder');

// Escape % and _ for safe LIKE queries
const escapeLike = (str) => str.replace(/[%_\\]/g, (ch) => `\\${ch}`);

const searchService = {
    escapeLike,

    async searchUsers(likeQ) {
        return db.table('users')
            .select(['id', 'username'])
            .whereRaw('username LIKE ?', [likeQ])
            .get();
    },

    async searchStories(likeQ) {
        return db.table('stories as s')
            .select([
                's.id',
                's.title',
                's.user_id',
                's.vanity as story_vanity',
                'u.username as author_username'
            ])
            .join('users as u', 's.user_id = u.id')
            .whereRaw('(s.title LIKE ? OR s.synopsis LIKE ?)', [likeQ, likeQ])
            .get();
    },

    async searchCollections(likeQ) {
        return db.table('collections as col')
            .select([
                'col.id',
                'col.title',
                'col.user_id',
                'u.username as owner_username'
            ])
            .join('users as u', 'col.user_id = u.id')
            .whereRaw('col.title LIKE ?', [likeQ])
            .get();
    },

    async searchComments(likeQ) {
        return db.table('comments as c')
            .select([
                'c.id',
                'c.chapter_id',
                'c.content',
                'ch.story_id',
                's.user_id',
                'ch.chapter_num',
                's.vanity as story_vanity',
                'u.username as story_author_username'
            ])
            .join('chapters as ch', 'c.chapter_id = ch.id')
            .join('stories as s', 'ch.story_id = s.id')
            .join('users as u', 'c.user_id = u.id')
            .whereRaw('c.content LIKE ?', [likeQ])
            .get();
    },

    async searchChapters(likeQ) {
        return db.table('chapters as ch')
            .select([
                'ch.id',
                'ch.story_id',
                'ch.title',
                'ch.chapter_num',
                's.user_id',
                's.vanity as story_vanity',
                'u.username as story_author_username'
            ])
            .join('stories as s', 'ch.story_id = s.id')
            .join('users as u', 's.user_id = u.id')
            .whereRaw('(ch.title LIKE ? OR ch.content LIKE ?)', [likeQ, likeQ])
            .get();
    }
};

module.exports = searchService;