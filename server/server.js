require('dotenv').config();

const express = require('express');
const cors = require('cors');

// Import routers
const postRoutes = require('./routes/posts');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

app.get('/', (req, res) => {
    res.json({ message: 'DevBlog API running' });
});

app.use('/api/posts', postRoutes);
app.use('/api/auth', authRoutes);

app.use((req, res) => {
    res.status(404).json({ error: `${req.method} ${req.url} not found` });
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Internal Server Error',
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
