import 'dotenv/config';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import { pool } from './db';
import postRoutes from './routes/posts';
import authRoutes from './routes/auth';
import categoryRoutes from './routes/categories';
import uploadRoutes from './routes/upload';
import { apiLimiter } from './middleware/rateLimit';
import './types';

const app = express();
const PORT = Number(process.env.PORT) || 5000;

if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

app.get('/', (_req: Request, res: Response) => {
    res.json({ message: 'DevBlog API running' });
});

app.get('/api/health', async (_req: Request, res: Response) => {
    try {
        await pool.query('SELECT 1');
        res.json({ success: true, status: 'ok', database: 'connected' });
    } catch {
        res.status(503).json({ success: false, status: 'degraded', database: 'unreachable' });
    }
});

app.use('/api', apiLimiter);
app.use('/api/posts', postRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/upload', uploadRoutes);

app.use((req: Request, res: Response) => {
    res.status(404).json({ success: false, error: `${req.method} ${req.url} not found` });
});

interface HttpError extends Error {
    statusCode?: number;
}

app.use((err: HttpError, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Internal Server Error',
    });
});

const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        console.log(`\n${signal} received, shutting down.`);
        server.close(() => {
            pool.end().finally(() => process.exit(0));
        });
    });
}

export default app;
