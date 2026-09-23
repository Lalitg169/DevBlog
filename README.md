# DevBlog

A full stack blogging app — write, browse and discuss posts.

The backend is an Express API written in TypeScript, backed by PostgreSQL. The
frontend is plain HTML, CSS and JavaScript with no build step and no framework.

## Stack

- **Backend:** Node.js, Express 5, TypeScript, PostgreSQL (`pg`)
- **Auth:** JWT bearer tokens, bcrypt password hashing
- **Frontend:** static HTML/CSS/JS (`index.html`, `post.html`, `login.html`, `write.html`)

## Getting started

Needs Node 20+ and Docker. The database runs in a container on host port
**5433**, so it will not collide with a Postgres already listening on 5432.

```bash
cd server
npm install
cp .env.example .env       # then set JWT_SECRET
npm run db:up              # starts Postgres and applies schema.sql
npm run seed               # 50 sample posts, users author1..author8 / password123
npm run dev
```

No Docker? A helper script runs Postgres in userspace instead — no container,
no root, its own cluster on the same port 5433:

```bash
./scripts/dev-db.sh start     # initialises, starts, applies schema
./scripts/dev-db.sh psql      # open a shell against it
./scripts/dev-db.sh destroy   # remove it entirely
```

The API is then on `http://localhost:5000`. Serve the project root with any
static server for the frontend:

```bash
python3 -m http.server 8000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the API in watch mode via `tsx` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server |
| `npm run typecheck` | Type check without emitting |
| `npm run db:up` | Start the Postgres container |
| `npm run db:down` | Stop it, keeping the data volume |
| `npm run db:reset` | Destroy the volume and start clean |
| `npm run db:schema` | Apply `schema.sql` to `$DATABASE_URL` |
| `npm run seed` | Populate sample data (`-- --posts=100000 --fresh`) |

### Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `DATABASE_SSL` | `true` for hosted Postgres (Neon, Supabase, Render) |
| `JWT_SECRET` | Token signing key — `openssl rand -hex 32` |
| `PORT` | API port, defaults to 5000 |
| `TRUST_PROXY` | Reverse-proxy hop count so rate limiting sees the real client IP |

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

## Frontend

Serve the HTML files with any static server. They call the API at
`http://localhost:5000/api`, set once as `API_BASE` in `script.js`.

| Page | What it does |
| --- | --- |
| `index.html` | Post feed from `GET /api/posts` — search, category filter, sort, pagination |
| `post.html?id=<id>` | A single post |
| `login.html` | Login and registration, in one form |
| `write.html` | Publish a post, then redirect to it |

`script.js` is shared by every page: it holds `API_BASE`, the `api()` fetch
wrapper, token storage, and the nav's logged-in state.

## Notes

- Rate limiting: 300 requests / 15 min across `/api`, 20 / 15 min on auth routes.
- Password reset has no mail transport configured, so the token is returned in
  the response and logged to the console.
- Uploaded images are written to `server/uploads/` and served from `/uploads`.
