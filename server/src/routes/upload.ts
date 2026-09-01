import express, { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import upload from '../middleware/upload';

const router = express.Router();

// POST /api/upload — multipart field "image", returns a URL served from /uploads
router.post('/', requireAuth, (req: Request, res: Response) => {
    upload.single('image')(req, res, (err: unknown) => {
        if (err) {
            const message = err instanceof Error ? err.message : 'Upload failed.';
            return res.status(400).json({ success: false, error: message });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image file provided.' });
        }
        return res.status(201).json({ success: true, url: `/uploads/${req.file.filename}` });
    });
});

export default router;
