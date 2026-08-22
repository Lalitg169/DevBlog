const express = require('express');
const router = express.Router();

// Temporary mock data — we replace this with PostgreSQL later
const posts = [
    { id: 1, title: 'Learn Node.js & Express', category: 'Technology', author: 'Lalit' },
    { id: 2, title: 'Mastering CSS Grid', category: 'Design', author: 'Lalit' },
    { id: 3, title: 'JavaScript Closures Explained', category: 'Technology', author: 'Lalit' }
];

// GET /api/posts — return all posts
router.get('/', (req, res) => {
    return res.json({ success: true, count: posts.length, posts: posts });
});

// GET /api/posts/:id — return a single post by id
router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const post = posts.find(p => p.id === id);

    if (!post) {
        return res.status(404).json({ success: false, error: `Post with ID ${id} not found` });
    }
    return res.json({ success: true, post: post });
});

// POST /api/posts — create a new post
router.post('/', (req, res) => {
    const { title, category, author } = req.body;

    if (!title || !category || !author) {
        return res.status(400).json({ success: false, error: 'Title, category, and author are required.' });
    }

    const newPost = {
        id: posts.length > 0 ? posts[posts.length - 1].id + 1 : 1,
        title,
        category,
        author
    };

    posts.push(newPost);
    return res.status(201).json({ success: true, post: newPost });
});

// DELETE /api/posts/:id — delete a post by id
router.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const index = posts.findIndex(p => p.id === id);

    if (index === -1) {
        return res.status(404).json({ success: false, error: 'Post not found.' });
    }

    posts.splice(index, 1);
    return res.status(200).json({ success: true, message: 'Post Deleted.' });
});

module.exports = router;
