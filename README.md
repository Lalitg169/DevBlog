# DevBlog

A full stack PERN blogging app — write, browse and discuss posts.

The backend is an Express API written in TypeScript, backed by PostgreSQL.

## Stack

- **Backend:** Node.js, Express 5, TypeScript, PostgreSQL (`pg`)
- **Auth:** JWT bearer tokens, bcrypt password hashing
- **Frontend:** static HTML/CSS/JS (`index.html`, `login.html`, `write.html`)

## Getting started

```bash
cd server
npm install
cp .env.example .env      # then fill in DATABASE_URL and JWT_SECRET
psql "$DATABASE_URL" -f schema.sql
npm run dev               # or: npm run build && npm start
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the API in watch mode via `tsx` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run typecheck` | Type check without emitting |

## API

All responses are JSON and carry a `success` flag. Protected routes expect an
`Authorization: Bearer <token>` header.

### Auth

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | — | Create an account, returns a token |
| POST | `/api/auth/login` | — | Sign in, returns a token |
| GET | `/api/auth/me` | ✔ | Current user's profile |
| PUT | `/api/auth/me` | ✔ | Update bio / avatar |
| POST | `/api/auth/forgot-password` | — | Issue a reset token |
| POST | `/api/auth/reset-password` | — | Redeem a reset token |
| GET | `/api/auth/users/:username` | — | Public profile and that user's posts |

### Posts

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/posts` | optional | List posts — `?page`, `?limit`, `?q`, `?category`, `?sort=latest\|popular` |
| GET | `/api/posts/:id` | optional | A single post |
| POST | `/api/posts` | ✔ | Create a post |
| PUT | `/api/posts/:id` | ✔ (author) | Update a post |
| DELETE | `/api/posts/:id` | ✔ (author) | Delete a post |
| GET | `/api/posts/:id/comments` | — | Comments on a post |
| POST | `/api/posts/:id/comments` | ✔ | Add a comment |
| DELETE | `/api/posts/:id/comments/:commentId` | ✔ (author) | Delete a comment |
| POST | `/api/posts/:id/like` | ✔ | Toggle a like |

### Categories and uploads

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/categories` | — | Categories with post counts |
| POST | `/api/categories` | ✔ | Create a category |
| DELETE | `/api/categories/:id` | ✔ | Delete a category |
| POST | `/api/upload` | ✔ | Upload an image (field `image`, max 5 MB) |
| GET | `/api/health` | — | Liveness and database connectivity |

Posts accept either `category_id` or a `category` name, which is created on
demand if it does not exist yet.

## Notes

- Rate limiting: 300 requests / 15 min across `/api`, 20 / 15 min on auth routes.
- Password reset has no mail transport configured, so the token is returned in
  the response and logged to the console.
- Uploaded images are written to `server/uploads/` and served from `/uploads`.
