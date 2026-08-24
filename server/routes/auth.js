const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    const hashed = bcrypt.hashSync(password, 10);

    db.run(
        'INSERT INTO users (username, password) VALUES (?, ?)',
        [username, hashed],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(409).json({ success: false, error: 'Username already taken.' });
                }
                return res.status(500).json({ success: false, error: 'Could not register user.' });
            }

            const token = jwt.sign({ id: this.lastID, username }, process.env.JWT_SECRET, { expiresIn: '7d' });
            return res.status(201).json({ success: true, token, user: { id: this.lastID, username } });
        }
    );
});

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Login failed.' });
        }

        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ success: false, error: 'Invalid username or password.' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        return res.json({ success: true, token, user: { id: user.id, username: user.username } });
    });
});

module.exports = router;
