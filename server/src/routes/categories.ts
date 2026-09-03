import express, { Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { all, get, run, isUniqueViolation } from '../db';
import { requireAuth } from '../middleware/auth';
import validate from '../middleware/validate';
import { CategoryRow } from '../types';

const router = express.Router();

router.param('id', (req: Request, res: Response, next: NextFunction, value: string) => {
    if (!/^\d+$/.test(value)) {
        res.status(404).json({ success: false, error: 'Category not found.' });
        return;
    }
    next();
});

// GET /api/categories — every category with how many posts use it
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const categories = await all<CategoryRow & { post_count: number }>(`
            SELECT c.id, c.name, COUNT(p.id)::int AS post_count
            FROM categories c
            LEFT JOIN posts p ON p.category_id = c.id
            GROUP BY c.id, c.name
            ORDER BY c.name ASC
        `);
        return res.json({ success: true, count: categories.length, categories });
    } catch (err) {
        next(err);
    }
});

// POST /api/categories
router.post(
    '/',
    requireAuth,
    [body('name').trim().isLength({ min: 1, max: 50 }).withMessage('Category name is required (max 50 characters).')],
    validate,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const category = await get<CategoryRow>('INSERT INTO categories (name) VALUES ($1) RETURNING id, name', [
                req.body.name,
            ]);
            return res.status(201).json({ success: true, category });
        } catch (err) {
            if (isUniqueViolation(err)) {
                return res.status(409).json({ success: false, error: 'Category already exists.' });
            }
            next(err);
        }
    }
);

// DELETE /api/categories/:id — posts in the category are kept, just uncategorised
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const removed = await run('DELETE FROM categories WHERE id = $1', [req.params.id]);
        if (removed === 0) {
            return res.status(404).json({ success: false, error: 'Category not found.' });
        }
        return res.json({ success: true, message: 'Category deleted.' });
    } catch (err) {
        next(err);
    }
});

export default router;
