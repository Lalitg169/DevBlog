import express, { Request, Response, NextFunction } from 'express';
import { body, query } from 'express-validator';
import { all, get, run } from '../db';
import { requireAuth, optionalAuth } from '../middleware/auth';
import validate from '../middleware/validate';
import { PostRow, PostView, CommentRow, CommentView, CategoryRow, CountRow } from '../types';

const router = express.Router();

const numericId = (label: string) => (req: Request, res: Response, next: NextFunction, value: string) => {
    if (!/^\d+$/.test(value)) {
        res.status(404).json({ success: false, error: `${label} not found.` });
        return;
    }
    next();
};

router.param('id', numericId('Post'));
router.param('commentId', numericId('Comment'));

// $1 is always the viewing user's id (-1 when anonymous), so `liked` can be
// resolved in the same round trip as the post itself.
const POST_SELECT = `
    SELECT
        p.id, p.title, p.content, p.cover_image, p.created_at, p.updated_at,
        u.id AS user_id, u.username AS author,
        c.id AS category_id, c.name AS category,
        (SELECT COUNT(*)::int FROM comments WHERE comments.post_id = p.id) AS comment_count,
        (SELECT COUNT(*)::int FROM likes WHERE likes.post_id = p.id) AS like_count,
        EXISTS(SELECT 1 FROM likes WHERE likes.post_id = p.id AND likes.user_id = $1) AS liked
    FROM posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN categories c ON c.id = p.category_id
`;

const COMMENT_SELECT = `
    SELECT cm.id, cm.content, cm.created_at, u.id AS user_id, u.username AS author
    FROM comments cm
    JOIN users u ON u.id = cm.user_id
`;

const viewerId = (req: Request): number => req.user?.id ?? -1;

/** Resolves a category name to an id, creating the category when it is new. */
async function resolveCategoryByName(name: string): Promise<number> {
    const existing = await get<CategoryRow>('SELECT id FROM categories WHERE name = $1', [name]);
    if (existing) return existing.id;

    const created = await get<CategoryRow>(
        'INSERT INTO categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
        [name]
    );
    return created!.id;
}

/**
 * Accepts either `category_id` (number) or `category` (name, created on demand)
 * so older clients that post a category name keep working.
 */
async function categoryIdFromBody(reqBody: Record<string, unknown>): Promise<number | null | undefined> {
    if (reqBody.category_id !== undefined) {
        return reqBody.category_id === null ? null : Number(reqBody.category_id);
    }
    if (typeof reqBody.category === 'string' && reqBody.category.trim()) {
        return resolveCategoryByName(reqBody.category.trim());
    }
    return undefined;
}

// GET /api/posts — pagination, full-text-ish search, category filter, sorting
router.get(
    '/',
    optionalAuth,
    [
        query('page').optional().isInt({ min: 1 }),
        query('limit').optional().isInt({ min: 1, max: 50 }),
        query('sort').optional().isIn(['latest', 'popular']),
    ],
    validate,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
            const limit = parseInt(String(req.query.limit ?? '10'), 10) || 10;
            const offset = (page - 1) * limit;
            const orderBy = req.query.sort === 'popular' ? 'like_count DESC, p.created_at DESC' : 'p.created_at DESC';

            const where: string[] = [];
            const filterParams: unknown[] = [];
            // $1 is reserved for the viewer id in POST_SELECT.
            let n = 1;

            if (req.query.q) {
                where.push(`(p.title ILIKE $${++n} OR p.content ILIKE $${n})`);
                filterParams.push(`%${req.query.q}%`);
            }
            if (req.query.category) {
                const raw = String(req.query.category);
                if (/^\d+$/.test(raw)) {
                    where.push(`c.id = $${++n}`);
                    filterParams.push(Number(raw));
                } else {
                    where.push(`c.name = $${++n}`);
                    filterParams.push(raw);
                }
            }

            const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

            const posts = await all<PostView>(
                `${POST_SELECT} ${whereClause} ORDER BY ${orderBy} LIMIT $${n + 1} OFFSET $${n + 2}`,
                [viewerId(req), ...filterParams, limit, offset]
            );

            // The count query has no viewer param, so its placeholders start at $1.
            const countWhere = whereClause.replace(/\$(\d+)/g, (_m, d) => `$${Number(d) - 1}`);
            const countRow = await get<{ total: number }>(
                `SELECT COUNT(*)::int AS total
                   FROM posts p
                   LEFT JOIN categories c ON c.id = p.category_id
                   ${countWhere}`,
                filterParams
            );

            const total = countRow?.total ?? 0;

            return res.json({
                success: true,
                count: posts.length,
                posts,
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            });
        } catch (err) {
            next(err);
        }
    }
);

// GET /api/posts/:id
router.get('/:id', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const post = await get<PostView>(`${POST_SELECT} WHERE p.id = $2`, [viewerId(req), req.params.id]);
        if (!post) {
            return res.status(404).json({ success: false, error: `Post with ID ${req.params.id} not found` });
        }
        return res.json({ success: true, post });
    } catch (err) {
        next(err);
    }
});

// POST /api/posts
router.post(
    '/',
    requireAuth,
    [
        body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required (max 200 characters).'),
        body('content').optional().isString(),
        body('category_id').optional({ values: 'null' }).isInt().withMessage('category_id must be an integer.'),
        body('category').optional().isString(),
        body('cover_image').optional({ values: 'null' }).isString(),
    ],
    validate,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { title, content, cover_image } = req.body as {
                title: string;
                content?: string;
                cover_image?: string;
            };
            const categoryId = await categoryIdFromBody(req.body);

            const created = await get<PostRow>(
                `INSERT INTO posts (title, content, category_id, cover_image, user_id)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [title, content ?? '', categoryId ?? null, cover_image ?? '', req.user!.id]
            );

            const post = await get<PostView>(`${POST_SELECT} WHERE p.id = $2`, [req.user!.id, created!.id]);
            return res.status(201).json({ success: true, post });
        } catch (err) {
            next(err);
        }
    }
);

// PUT /api/posts/:id — author only
router.put(
    '/:id',
    requireAuth,
    [
        body('title').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters.'),
        body('content').optional().isString(),
        body('category_id').optional({ values: 'null' }).isInt().withMessage('category_id must be an integer.'),
        body('category').optional().isString(),
        body('cover_image').optional({ values: 'null' }).isString(),
    ],
    validate,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const existing = await get<PostRow>('SELECT * FROM posts WHERE id = $1', [req.params.id]);
            if (!existing) {
                return res.status(404).json({ success: false, error: 'Post not found.' });
            }
            if (existing.user_id !== req.user!.id) {
                return res.status(403).json({ success: false, error: 'You can only edit your own posts.' });
            }

            const { title, content, cover_image } = req.body as {
                title?: string;
                content?: string;
                cover_image?: string;
            };
            const categoryId = await categoryIdFromBody(req.body);

            await run(
                `UPDATE posts
                    SET title = $1, content = $2, category_id = $3, cover_image = $4, updated_at = NOW()
                  WHERE id = $5`,
                [
                    title ?? existing.title,
                    content ?? existing.content,
                    categoryId === undefined ? existing.category_id : categoryId,
                    cover_image ?? existing.cover_image,
                    req.params.id,
                ]
            );

            const post = await get<PostView>(`${POST_SELECT} WHERE p.id = $2`, [req.user!.id, req.params.id]);
            return res.json({ success: true, post });
        } catch (err) {
            next(err);
        }
    }
);

// DELETE /api/posts/:id — author only
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const existing = await get<PostRow>('SELECT * FROM posts WHERE id = $1', [req.params.id]);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Post not found.' });
        }
        if (existing.user_id !== req.user!.id) {
            return res.status(403).json({ success: false, error: 'You can only delete your own posts.' });
        }

        await run('DELETE FROM posts WHERE id = $1', [req.params.id]);
        return res.json({ success: true, message: 'Post deleted.' });
    } catch (err) {
        next(err);
    }
});

// GET /api/posts/:id/comments
router.get('/:id/comments', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const comments = await all<CommentView>(
            `${COMMENT_SELECT} WHERE cm.post_id = $1 ORDER BY cm.created_at ASC`,
            [req.params.id]
        );
        return res.json({ success: true, count: comments.length, comments });
    } catch (err) {
        next(err);
    }
});

// POST /api/posts/:id/comments
router.post(
    '/:id/comments',
    requireAuth,
    [body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('Comment must be 1-1000 characters.')],
    validate,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const post = await get<PostRow>('SELECT id FROM posts WHERE id = $1', [req.params.id]);
            if (!post) {
                return res.status(404).json({ success: false, error: 'Post not found.' });
            }

            const created = await get<CommentRow>(
                'INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING id',
                [req.params.id, req.user!.id, req.body.content]
            );

            const comment = await get<CommentView>(`${COMMENT_SELECT} WHERE cm.id = $1`, [created!.id]);
            return res.status(201).json({ success: true, comment });
        } catch (err) {
            next(err);
        }
    }
);

// DELETE /api/posts/:id/comments/:commentId — comment author only
router.delete('/:id/comments/:commentId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const comment = await get<CommentRow>('SELECT * FROM comments WHERE id = $1 AND post_id = $2', [
            req.params.commentId,
            req.params.id,
        ]);
        if (!comment) {
            return res.status(404).json({ success: false, error: 'Comment not found.' });
        }
        if (comment.user_id !== req.user!.id) {
            return res.status(403).json({ success: false, error: 'You can only delete your own comments.' });
        }

        await run('DELETE FROM comments WHERE id = $1', [req.params.commentId]);
        return res.json({ success: true, message: 'Comment deleted.' });
    } catch (err) {
        next(err);
    }
});

// POST /api/posts/:id/like — toggles the current user's like
router.post('/:id/like', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const post = await get<PostRow>('SELECT id FROM posts WHERE id = $1', [req.params.id]);
        if (!post) {
            return res.status(404).json({ success: false, error: 'Post not found.' });
        }

        const removed = await run('DELETE FROM likes WHERE post_id = $1 AND user_id = $2', [
            req.params.id,
            req.user!.id,
        ]);

        if (removed === 0) {
            await run('INSERT INTO likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
                req.params.id,
                req.user!.id,
            ]);
        }

        const likeCount = await get<CountRow>('SELECT COUNT(*)::int AS count FROM likes WHERE post_id = $1', [
            req.params.id,
        ]);

        return res.json({ success: true, liked: removed === 0, like_count: likeCount?.count ?? 0 });
    } catch (err) {
        next(err);
    }
});

export default router;
