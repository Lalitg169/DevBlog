export interface AuthUser {
    id: number;
    username: string;
}

export interface UserRow {
    id: number;
    username: string;
    password: string;
    bio: string;
    avatar_url: string;
    created_at: Date;
}

export interface PostRow {
    id: number;
    title: string;
    content: string;
    cover_image: string;
    category_id: number | null;
    user_id: number;
    created_at: Date;
    updated_at: Date;
}

export interface PostView extends Omit<PostRow, 'category_id'> {
    author: string;
    category: string | null;
    category_id: number | null;
    comment_count: number;
    like_count: number;
    liked: boolean;
}

export interface CommentRow {
    id: number;
    post_id: number;
    user_id: number;
    content: string;
    created_at: Date;
}

export interface CommentView {
    id: number;
    content: string;
    created_at: Date;
    user_id: number;
    author: string;
}

export interface CategoryRow {
    id: number;
    name: string;
}

export interface PasswordResetRow {
    id: number;
    user_id: number;
    token: string;
    expires_at: Date;
}

export interface CountRow {
    count: number;
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}
