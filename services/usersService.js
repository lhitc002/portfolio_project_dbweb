const db = require('../utils/queryBuilder');

const usersService = {
    async getUserById(userId) {
        return db.table('users')
            .select(['id', 'username', 'email', 'created_at'])
            .whereField('id', userId)
            .first();
    },

    async getUserByUsername(username) {
        return db.table('users')
            .select(['id', 'username', 'email', 'created_at'])
            .whereField('username', username)
            .first();
    },

    async getUserStories(userId) {
        return db.table('stories as s')
            .select([
                's.id',
                's.title',
                's.synopsis',
                's.vanity',
                's.created_at',
                's.updated_at',
                'COUNT(DISTINCT ch.id) as chapter_count',
                'AVG(r.rating) as avg_rating',
                'COUNT(DISTINCT r.user_id) as rating_count',
                'COUNT(DISTINCT f.user_id) as favorite_count'
            ])
            .leftJoin('chapters as ch', 's.id = ch.story_id')
            .leftJoin('ratings as r', 's.id = r.story_id')
            .leftJoin('favorites as f', 's.id = f.story_id')
            .whereField('s.user_id', userId)
            .groupBy([
                's.id', 's.title', 's.synopsis', 's.vanity', 's.created_at', 's.updated_at'
            ])
            .orderBy('s.updated_at', 'DESC')
            .get();
    },

    async getUserCollections(userId) {
        return db.table('collections as c')
            .select([
                'c.id',
                'c.title',
                'c.description',
                'c.created_at',
                'COUNT(DISTINCT sc.story_id) as story_count'
            ])
            .leftJoin('story_collections as sc', 'c.id = sc.collection_id')
            .whereField('c.user_id', userId)
            .groupBy(['c.id', 'c.title', 'c.description', 'c.created_at'])
            .orderBy('c.created_at', 'DESC')
            .get();
    }
};

module.exports = usersService;