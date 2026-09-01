import crypto from 'crypto';
import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import { all, get, run, isUniqueViolation } from '../db';
import { requireAuth, signToken } from '../middleware/auth';
import validate from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimit';
import { UserRow, PasswordResetRow } from '../types';

const router = express.Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// POST /api/auth/register
router.post(
    '/register',
    authLimiter,
    [
        body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters.'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    ],
    validate,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { username, password } = req.body as { username: string; password: string };
            const hashed = bcrypt.hashSync(password, 10);

            const user = await get<Pick<UserRow, 'id' | 'username'>>(
                'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
                [username, hashed]
            );

            return res.status(201).json({ success: true, token: signToken(user!), user });
        } catch (err) {
            if (isUniqueViolation(err)) {
                return res.status(409).json({ success: false, error: 'Username already taken.' });
            }
            next(err);
        }
    }
);

// POST /api/auth/login
router.post(
    '/login',
    authLimiter,
    [body('username').notEmpty(), body('password').notEmpty()],
    validate,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { username, password } = req.body as { username: string; password: string };
            const user = await get<UserRow>('SELECT * FROM users WHERE username = $1', [username]);

            if (!user || !bcrypt.compareSync(password, user.password)) {
                return res.status(401).json({ success: false, error: 'Invalid username or password.' });
            }

            return res.json({
                success: true,
                token: signToken(user),
                user: { id: user.id, username: user.username, bio: user.bio, avatar_url: user.avatar_url },
            });
        } catch (err) {
            next(err);
        }
    }
);

// GET /api/auth/me
router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await get<Omit<UserRow, 'password'>>(
            'SELECT id, username, bio, avatar_url, created_at FROM users WHERE id = $1',
            [req.user!.id]
        );
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }
        return res.json({ success: true, user });
    } catch (err) {
        next(err);
    }
});

// PUT /api/auth/me — update the signed-in user's profile
router.put(
    '/me',
    requireAuth,
    [
        body('bio').optional().isLength({ max: 300 }).withMessage('Bio must be under 300 characters.'),
        body('avatar_url').optional().isURL().withMessage('Avatar must be a valid URL.'),
    ],
    validate,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { bio, avatar_url } = req.body as { bio?: string; avatar_url?: string };

            const updated = await get<Omit<UserRow, 'password' | 'created_at'>>(
                `UPDATE users
                    SET bio = COALESCE($1, bio),
                        avatar_url = COALESCE($2, avatar_url)
                  WHERE id = $3
                RETURNING id, username, bio, avatar_url`,
                [bio ?? null, avatar_url ?? null, req.user!.id]
            );

            return res.json({ success: true, user: updated });
        } catch (err) {
            next(err);
        }
    }
);

// POST /api/auth/forgot-password
// No email transport is configured, so the reset token is returned in the
// response and logged rather than mailed to the user.
router.post(
    '/forgot-password',
    authLimiter,
    [body('username').notEmpty()],
    validate,
    async (req: Request, res: Response, next: NextFunction) => {
        const genericMessage = 'If that account exists, a reset link has been issued.';
        try {
            const { username } = req.body as { username: string };
            const user = await get<UserRow>('SELECT * FROM users WHERE username = $1', [username]);

            // Respond identically whether or not the account exists, so the
            // endpoint cannot be used to enumerate usernames.
            if (!user) {
                return res.json({ success: true, message: genericMessage });
            }

            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

            await run('DELETE FROM password_resets WHERE user_id = $1', [user.id]);
            await run('INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)', [
                user.id,
                token,
                expiresAt,
            ]);

            console.log(`Password reset requested for "${username}". Reset token: ${token}`);

            return res.json({ success: true, message: genericMessage, resetToken: token });
        } catch (err) {
            next(err);
        }
    }
);

// POST /api/auth/reset-password
router.post(
    '/reset-password',
    authLimiter,
    [
        body('token').notEmpty(),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    ],
    validate,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { token, password } = req.body as { token: string; password: string };
            const reset = await get<PasswordResetRow>('SELECT * FROM password_resets WHERE token = $1', [token]);

            if (!reset || new Date(reset.expires_at) < new Date()) {
                return res.status(400).json({ success: false, error: 'Reset token is invalid or expired.' });
            }

            const hashed = bcrypt.hashSync(password, 10);
            await run('UPDATE users SET password = $1 WHERE id = $2', [hashed, reset.user_id]);
            await run('DELETE FROM password_resets WHERE user_id = $1', [reset.user_id]);

            return res.json({ success: true, message: 'Password updated. You can now log in.' });
        } catch (err) {
            next(err);
        }
    }
);

// GET /api/auth/users/:username — public profile plus that user's posts
router.get('/users/:username', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const user = await get<Omit<UserRow, 'password'>>(
            'SELECT id, username, bio, avatar_url, created_at FROM users WHERE username = $1',
            [req.params.username]
        );
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }

        const posts = await all(
            `SELECT p.id, p.title, p.cover_image, p.created_at, c.name AS category
               FROM posts p
               LEFT JOIN categories c ON c.id = p.category_id
              WHERE p.user_id = $1
              ORDER BY p.created_at DESC`,
            [user.id]
        );

        return res.json({ success: true, user, posts });
    } catch (err) {
        next(err);
    }
});

export default router;
