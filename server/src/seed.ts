import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, all, run } from './db';

/**
 * Populates the database with sample content.
 *
 *   npm run seed                  # 50 posts, quick smoke data
 *   npm run seed -- --posts=100000  # benchmark dataset
 *   npm run seed -- --fresh       # truncate first
 */

const arg = (name: string, fallback: number): number => {
    const match = process.argv.find((a) => a.startsWith(`--${name}=`));
    return match ? Number(match.split('=')[1]) : fallback;
};

const POSTS = arg('posts', 50);
const USERS = arg('users', 8);
const FRESH = process.argv.includes('--fresh');
const BATCH = 1000;

const CATEGORIES = ['Technology', 'Databases', 'Frontend', 'DevOps', 'Career', 'Security', 'Finance', 'Language'];

const NOUNS = ['index', 'query', 'cache', 'schema', 'migration', 'pipeline', 'container', 'cluster', 'token', 'session', 'pointer', 'buffer', 'thread', 'socket', 'compiler', 'runtime', 'daemon', 'replica', 'shard', 'transaction', 'deadlock', 'checksum', 'gateway', 'payload', 'latency', 'throughput', 'namespace', 'closure', 'promise', 'stream'];
const VERBS = ['scaling', 'debugging', 'profiling', 'refactoring', 'benchmarking', 'migrating', 'caching', 'testing', 'deploying', 'monitoring', 'optimising', 'securing'];
const ADJS = ['distributed', 'immutable', 'concurrent', 'idempotent', 'atomic', 'lazy', 'eventual', 'strict', 'nested', 'ephemeral', 'durable', 'partial'];
const FILLER = ['the', 'a', 'when', 'because', 'after', 'before', 'while', 'through', 'without', 'against', 'across', 'between', 'during', 'under', 'within'];

let seed = 42;
const rand = (): number => {
    // Deterministic LCG so a given --posts value always produces the same corpus.
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
};
const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

const title = (): string => {
    const shape = Math.floor(rand() * 3);
    if (shape === 0) return `${pick(VERBS)} ${pick(ADJS)} ${pick(NOUNS)}s in production`;
    if (shape === 1) return `Why your ${pick(NOUNS)} is ${pick(ADJS)}`;
    return `A practical guide to ${pick(ADJS)} ${pick(NOUNS)}s`;
};

const sentence = (): string => {
    const len = 8 + Math.floor(rand() * 12);
    const words = Array.from({ length: len }, () => pick([...NOUNS, ...VERBS, ...ADJS, ...FILLER]));
    return `${words.join(' ').replace(/^./, (c) => c.toUpperCase())}.`;
};

const body = (): string => {
    const paras = 2 + Math.floor(rand() * 4);
    return Array.from({ length: paras }, () => Array.from({ length: 3 + Math.floor(rand() * 4) }, sentence).join(' ')).join('\n\n');
};

async function main(): Promise<void> {
    if (FRESH) {
        console.log('Truncating existing data…');
        await run('TRUNCATE likes, comments, password_resets, posts, categories, users RESTART IDENTITY CASCADE');
    }

    // One hash reused across seed users; real registration hashes per user.
    const password = bcrypt.hashSync('password123', 10);
    const usernames = Array.from({ length: USERS }, (_, i) => `author${i + 1}`);

    await run(
        `INSERT INTO users (username, password, bio)
         SELECT u, $1, 'Seeded account for local development.'
           FROM unnest($2::text[]) AS u
         ON CONFLICT (username) DO NOTHING`,
        [password, usernames]
    );
    await run(
        `INSERT INTO categories (name) SELECT c FROM unnest($1::text[]) AS c ON CONFLICT (name) DO NOTHING`,
        [CATEGORIES]
    );

    const userIds = (await all<{ id: number }>('SELECT id FROM users ORDER BY id')).map((r) => r.id);
    const categoryIds = (await all<{ id: number }>('SELECT id FROM categories ORDER BY id')).map((r) => r.id);
    console.log(`${userIds.length} users, ${categoryIds.length} categories ready.`);

    const started = Date.now();
    let written = 0;

    while (written < POSTS) {
        const size = Math.min(BATCH, POSTS - written);
        const titles: string[] = [];
        const bodies: string[] = [];
        const cats: number[] = [];
        const owners: number[] = [];
        const ages: number[] = [];

        for (let i = 0; i < size; i++) {
            titles.push(title());
            bodies.push(body());
            cats.push(pick(categoryIds));
            owners.push(pick(userIds));
            ages.push(Math.floor(rand() * 720));
        }

        await run(
            `INSERT INTO posts (title, content, category_id, user_id, created_at, updated_at)
             SELECT t, b, c, u, NOW() - (age || ' days')::interval, NOW()
               FROM unnest($1::text[], $2::text[], $3::int[], $4::int[], $5::int[]) AS x(t, b, c, u, age)`,
            [titles, bodies, cats, owners, ages]
        );

        written += size;
        if (written % 10000 === 0 || written === POSTS) {
            console.log(`  ${written.toLocaleString()} / ${POSTS.toLocaleString()} posts`);
        }
    }

    // Engagement only on the newest slice, so small seeds still look alive.
    const recent = (await all<{ id: number }>('SELECT id FROM posts ORDER BY created_at DESC LIMIT 200')).map((r) => r.id);

    for (const postId of recent) {
        const commentCount = Math.floor(rand() * 4);
        for (let i = 0; i < commentCount; i++) {
            await run('INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3)', [
                postId,
                pick(userIds),
                sentence(),
            ]);
        }
        for (const userId of userIds) {
            if (rand() < 0.3) {
                await run('INSERT INTO likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [postId, userId]);
            }
        }
    }

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\nSeeded ${POSTS.toLocaleString()} posts in ${seconds}s.`);
    console.log('Log in with any of author1…author%d / password123', userIds.length);
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
