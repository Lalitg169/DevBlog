require('dotenv').config();

const express = require('express');
const cors = require('cors');

// Import routers
const postRoutes = require('./routes/posts');
// const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// ── ROUTES ──
app.get('/', (req, res) => {
    res.json({ message: 'DevBlog API running ✅' });
});

app.use('/api/posts', postRoutes);
// app.use('/api/auth', authRoutes);

// ── 404 HANDLER ──
app.use((req, res) => {
    res.status(404).json({ error: `${req.method} ${req.url} not found` });
});

// ── ERROR HANDLER ──
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Internal Server Error',
    });
});

// ── START SERVER ──
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
