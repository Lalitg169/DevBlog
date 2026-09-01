import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

/** Turns express-validator failures into a consistent 400 response. */
export function validate(req: Request, res: Response, next: NextFunction): void {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const list = errors.array();
        res.status(400).json({ success: false, error: list[0].msg, errors: list });
        return;
    }
    next();
}

export default validate;
