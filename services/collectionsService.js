const db = require('../utils/queryBuilder');

const collectionsService = {
    async getAllCollections() {
        return db.table('collection_summary')
            .select(['id', 'title', 'description', 'user_id', 'username', 'story_count', 'avg_rating', 'rating_count'])
            .orderBy('created_at', 'DESC')
            .get();
    },

    async getCollectionByIdAndUserId(collectionId, userId) {
        return db.table('collection_summary')
            .whereField('id', collectionId)
            .whereField('user_id', userId)
            .first();
    },

    async getStoriesByCollectionId(collectionId) {
        return db.table('stories')
            .select(['stories.*', 'users.username as author_username', 'stories.vanity as story_vanity'])
            .join('story_collections as sc', 'stories.id=sc.story_id')
            .join('users', 'stories.user_id=users.id')
            .whereRaw('sc.collection_id=?', [collectionId])
            .orderBy('stories.created_at', 'DESC')
            .get();
    },

    async createCollection(userId, title, description) {
        const result = await db.table('collections')
            .insertAsync({
                user_id: userId,
                title: title.trim(),
                description: description?.trim() || null
            });
        return result.insertId || result[0];
    },

    async addStoriesToCollection(collectionId, storyIds) {
        if (storyIds.length === 0) return;

        for (const id of storyIds) {
            await db.table('story_collections')
                .insertAsync({
                    collection_id: Number(collectionId),
                    story_id: Number(id)
                });
        }
    },

    async getStoriesForUser(userId) {
        return db.table('stories')
            .select(['stories.id', 'stories.title', 'stories.vanity', 'users.username'])
            .join('users', 'stories.user_id=users.id')
            .where('stories.user_id', userId)
            .get();
    },

    async getSelectedStoriesForCollection(collectionId) {
        const records = await db.table('story_collections')
            .select('story_id')
            .whereField('collection_id', collectionId)
            .get();
        return records.map(r => Number(r.story_id));
    },

    async updateCollection(collectionId, data) {
        return db.table('collections')
            .whereField('id', collectionId)
            .update({
                title: data.title.trim(),
                description: data.description?.trim() || null,
                updated_at: new Date()
            });
    },

    async deleteCollectionLinks(collectionId) {
        return db.table('story_collections')
            .whereField('collection_id', collectionId)
            .delete();
    },

    async deleteCollection(collectionId) {
        return db.table('collections')
            .whereField('id', collectionId)
            .delete();
    }
};

module.exports = collectionsService;