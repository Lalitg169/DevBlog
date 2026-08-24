const express = require('express');
const router = express.Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');

// GET /api/posts — return all posts
router.get('/', (req, res) => {
    db.all('SELECT * FROM posts ORDER BY created_at DESC', (err, posts) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Could not fetch posts.' });
        }
        return res.json({ success: true, count: posts.length, posts });
    });
});

// GET /api/posts/:id — return a single post by id
router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id);

    db.get('SELECT * FROM posts WHERE id = ?', [id], (err, post) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Could not fetch post.' });
        }
        if (!post) {
            return res.status(404).json({ success: false, error: `Post with ID ${id} not found` });
        }
        return res.json({ success: true, post });
    });
});

// POST /api/posts — create a new post (requires auth)
router.post('/', requireAuth, (req, res) => {
    const { title, category } = req.body;
    const author = req.user.username;

    if (!title || !category) {
        return res.status(400).json({ success: false, error: 'Title and category are required.' });
    }

    db.run(
        'INSERT INTO posts (title, category, author, user_id) VALUES (?, ?, ?, ?)',
        [title, category, author, req.user.id],
        function (err) {
            if (err) {
                return res.status(500).json({ success: false, error: 'Could not create post.' });
            }
            return res.status(201).json({
                success: true,
                post: { id: this.lastID, title, category, author, user_id: req.user.id }
            });
        }
    );
});

// DELETE /api/posts/:id — delete a post by id (requires auth; only the author may delete)
router.delete('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);

    db.get('SELECT * FROM posts WHERE id = ?', [id], (err, post) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Could not delete post.' });
        }
        if (!post) {
            return res.status(404).json({ success: false, error: 'Post not found.' });
        }
        if (post.user_id !== req.user.id) {
            return res.status(403).json({ success: false, error: 'You can only delete your own posts.' });
        }

        db.run('DELETE FROM posts WHERE id = ?', [id], (err) => {
            if (err) {
                return res.status(500).json({ success: false, error: 'Could not delete post.' });
            }
            return res.status(200).json({ success: true, message: 'Post Deleted.' });
        });
    });
});

module.exports = router;
