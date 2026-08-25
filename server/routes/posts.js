const express = require('express');
const router = express.Router();
const pool = require('../db');
const requireAuth = require('../middleware/auth');

// GET /api/posts — return all posts
router.get('/', async (req, res, next) => {
    try {
        const result = await pool.query('SELECT * FROM posts ORDER BY created_at DESC');
        return res.json({ success: true, count: result.rows.length, posts: result.rows });
    } catch (err) {
        next(err);
    }
});

// GET /api/posts/:id — return a single post by id
router.get('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const result = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: `Post with ID ${id} not found` });
        }
        return res.json({ success: true, post: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// POST /api/posts — create a new post (requires auth)
router.post('/', requireAuth, async (req, res, next) => {
    try {
        const { title, category } = req.body;
        const author = req.user.username;

        if (!title || !category) {
            return res.status(400).json({ success: false, error: 'Title and category are required.' });
        }

        const result = await pool.query(
            'INSERT INTO posts (title, category, author, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [title, category, author, req.user.id]
        );
        return res.status(201).json({ success: true, post: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/posts/:id — delete a post by id (requires auth; only the author may delete)
router.delete('/:id', requireAuth, async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const postResult = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);

        if (postResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Post not found.' });
        }
        if (postResult.rows[0].user_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'You can only delete your own posts.' });
        }

        await pool.query('DELETE FROM posts WHERE id = $1', [id]);
        return res.status(200).json({ success: true, message: 'Post Deleted.' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
