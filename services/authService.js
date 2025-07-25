const bcrypt = require('bcrypt');
const db = require('../utils/queryBuilder');

const authService = {
    async getUserByEmail(email) {
        return db.table('users')
            .select(['id', 'username', 'email', 'password_hash'])
            .whereField('email', email)
            .first();
    },

    async emailExists(email) {
        const user = await db.table('users')
            .select('id')
            .whereField('email', email)
            .first();
        return !!user;
    },

    async createUser(userData) {
        const result = await db.table('users')
            .insert({
                username: userData.username,
                email: userData.email,
                password_hash: userData.password_hash,
                created_at: new Date()
            }).insertAndGet();
        return result;
    },

    async comparePasswords(plainPassword, hashedPassword) {
        return bcrypt.compare(plainPassword, hashedPassword);
    },

    async hashPassword(password, saltRounds = 12) {
        return bcrypt.hash(password, saltRounds);
    }
};

module.exports = authService;