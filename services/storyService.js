const db = require('../utils/queryBuilder');

const storyService = {
    async getAllStories() {
        return db.table('story_summary')
            .orderBy('updated_at', 'DESC')
            .get();
    },

    async getStoryByUsernameAndVanity(username, vanity) {
        return db.table('story_summary')
            .whereField('username', username)
            .whereField('vanity', vanity)
            .first();
    },

    async getChaptersByStoryId(storyId) {
        return db.table('chapters')
            .whereField('story_id', storyId)
            .orderBy('chapter_num', 'ASC')
            .get();
    },

    async getUserRatingForStory(userId, storyId) {
        const record = await db.table('ratings')
            .whereField('user_id', userId)
            .whereField('story_id', storyId)
            .first();

        return record ? record.rating : null;
    },

    async getStoryWithUser(username, vanity) {
        return db.table('story_summary')
            .join('users', 'story_summary.user_id', '=', 'users.id')
            .select('story_summary.*', 'users.username')
            .whereField('users.username', username)
            .whereField('story_summary.vanity', vanity)
            .first();
    },

    async getChapterNavigation(storyId, chapterNum) {
        const nav = await db.table('chapters')
            .select(['chapter_num', 'title'])
            .whereRaw('story_id = ? AND chapter_num IN (?, ?)', [
                storyId, chapterNum - 1, chapterNum + 1
            ])
            .orderBy('chapter_num', 'ASC')
            .get();

        return {
            prevChapter: nav.find(c => c.chapter_num === chapterNum - 1) || null,
            nextChapter: nav.find(c => c.chapter_num === chapterNum + 1) || null,
        };
    },

    async getCommentsForChapter(chapterId) {
        return db.table('comments_with_users')
            .whereField('chapter_id', chapterId)
            .orderBy('created_at', 'ASC')
            .get();
    },

    async createStory(userId, title, synopsis) {
        const storyData = {
            user_id: userId,
            title: title.trim(),
            synopsis: synopsis.trim()
        };

        const result = await db.table('stories').insertAsync(storyData);
        const storyId = result.insertId || result[0];

        if (!storyId) throw new Error('Failed to create story');

        const createdStory = await db.table('stories').whereField('id', storyId).first();
        if (!createdStory) throw new Error('Failed to retrieve created story');

        const user = await db.table('users').whereField('id', userId).first();
        if (!user) throw new Error('User not found');

        return { createdStory, username: user.username };
    },

    async getStoryByUsernameAndVanity(username, vanity) {
        return db.table('story_summary')
            .whereField('username', username)
            .whereField('vanity', vanity)
            .first();
    },

    async getStoryByUserIdAndVanity(userId, vanity) {
        return db.table('stories')
            .whereField('user_id', userId)
            .whereField('vanity', vanity)
            .first();
    },

    async updateStoryById(id, title, synopsis) {
        return db.table('stories')
            .whereField('id', id)
            .update({
                title: title.trim(),
                synopsis: synopsis.trim()
            });
    },

    async getStoryById(id) {
        return db.table('stories')
            .whereField('id', id)
            .first();
    },

    async deleteStoryById(id) {
        return db.table('stories')
            .whereField('id', id)
            .delete();
    },

    async getStorySummaryByUsernameAndVanity(username, vanity) {
        return db.table('story_summary')
            .join('users', 'story_summary.user_id', '=', 'users.id')
            .select('story_summary.*', 'users.username')
            .whereField('users.username', username)
            .whereField('story_summary.vanity', vanity)
            .first();
    },

    async getChapterByStoryIdAndNumber(storyId, chapterNum) {
        return db.table('chapters')
            .whereField('story_id', storyId)
            .whereField('chapter_num', chapterNum)
            .first();
    },

    async addComment({ userId, chapterId, parentId = null, content }) {
        return db.table('comments').insert({
            user_id: userId,
            chapter_id: chapterId,
            parent_id: parentId,
            content
        }).insertAndGet();
    },

    async getCommentByIdAndUser(commentId, userId) {
        return db.table('comments')
            .join('users', 'comments.user_id', '=', 'users.id')
            .select('comments.*', 'users.username')
            .whereField('comments.id', commentId)
            .whereField('comments.user_id', userId)
            .first();
    },

    async updateCommentByIdAndUser(commentId, userId, content) {
        return db.table('comments')
            .whereField('id', commentId)
            .whereField('user_id', userId)
            .update({ content });
    },

    async getCommentByIdAndUser(commentId, userId) {
        return db.table('comments')
            .join('users', 'comments.user_id', '=', 'users.id')
            .select('comments.*', 'users.username')
            .whereField('comments.id', commentId)
            .whereField('comments.user_id', userId)
            .first();
    },

    async getReplyCountForComment(commentId) {
        return await db.table('comments')
            .whereField('parent_id', commentId)
            .count();
    },

    async softDeleteComment(commentId, userId) {
        return db.table('comments')
            .whereField('id', commentId)
            .whereField('user_id', userId)
            .update({
                content: '[deleted]',
                is_deleted: true
            });
    },

    async hardDeleteComment(commentId, userId) {
        this.cleanupOrphanSoftDeletedComments();
        return db.table('comments')
            .whereField('id', commentId)
            .whereField('user_id', userId)
            .delete();
    },

    async cleanupOrphanSoftDeletedComments() {
        // 1. Get all soft-deleted comments
        const softDeletedComments = await db.table('comments').whereField('is_deleted', true).select('id').get();

        // 2. For each, check if it has replies
        for (const comment of softDeletedComments) {
            const replyCount = await storyService.getReplyCountForComment(comment.id);
            if (replyCount === 0) {
                await db.table('comments').whereField('id', comment.id).delete();
            }
        }
    },

    async chapterExists(storyId, chapterNum) {
        return db.table('chapters')
            .whereField('story_id', storyId)
            .whereField('chapter_num', chapterNum)
            .first();
    },

    async createChapter(storyId, chapterNum, title, content) {
        return db.table('chapters').insertAsync({
            story_id: storyId,
            chapter_num: chapterNum,
            title: title.trim(),
            content: content.trim()
        });
    },

    async updateChapter(storyId, chapterNum, data) {
        return db.table('chapters')
            .whereField('story_id', storyId)
            .whereField('chapter_num', chapterNum)
            .update({
                title: data.title.trim(),
                content: data.content.trim()
            });
    },

    async deleteChapter(storyId, chapterNum) {
        return db.table('chapters')
            .whereField('story_id', storyId)
            .whereField('chapter_num', chapterNum)
            .delete();
    },

    async getStoryByUsernameAndVanity(username, vanity) {
        return db.table('story_summary')
            .whereField('username', username)
            .whereField('vanity', vanity)
            .first();
    },

    async getRating(userId, storyId) {
        return db.table('ratings')
            .whereField('user_id', userId)
            .whereField('story_id', storyId)
            .first();
    },

    async updateRating(userId, storyId, ratingValue) {
        return db.table('ratings')
            .whereField('user_id', userId)
            .whereField('story_id', storyId)
            .update({
                rating: ratingValue,
                rated_at: new Date()
            });
    },

    async insertRating(userId, storyId, ratingValue) {
        return db.table('ratings').insert({
            user_id: userId,
            story_id: storyId,
            rating: ratingValue
        }).insertAndGet();
    },

    async deleteRating(userId, storyId) {
        return db.table('ratings')
            .whereField('user_id', userId)
            .whereField('story_id', storyId)
            .delete();
    },

    async isTitleTaken(userId, title) {
        const existing = await db.table('stories')
            .select('id')
            .whereField('user_id', userId)
            .whereField('title', title)
            .first();
        return !!existing;
    }
};

module.exports = storyService;
