import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthUser } from '../types';

function readToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return authHeader.slice('Bearer '.length).trim() || null;
}

function verify(token: string): AuthUser {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured.');
    return jwt.verify(token, secret) as AuthUser;
}

export function signToken(user: AuthUser): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured.');
    return jwt.sign({ id: user.id, username: user.username }, secret, { expiresIn: '7d' });
}

/** Rejects the request unless a valid bearer token is present. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const token = readToken(req);

    if (!token) {
        res.status(401).json({ success: false, error: 'Authentication token required.' });
        return;
    }

    try {
        req.user = verify(token);
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Invalid or expired token.' });
    }
}

/** Attaches req.user when a valid token is present, but never blocks the request. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
    const token = readToken(req);
    if (!token) return next();

    try {
        req.user = verify(token);
    } catch {
        // Ignore invalid tokens on optional routes — the request proceeds unauthenticated.
    }
    next();
}
