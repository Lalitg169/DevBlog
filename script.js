const API_BASE = 'http://localhost:5000/api';

const auth = {
    get token() {
        return localStorage.getItem('token');
    },
    get user() {
        try {
            return JSON.parse(localStorage.getItem('user'));
        } catch {
            return null;
        }
    },
    save(token, user) {
        localStorage.setItem('token', token);
        if (user) localStorage.setItem('user', JSON.stringify(user));
    },
    clear() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    },
};

async function api(path, { method = 'GET', body, withAuth = false } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (withAuth && auth.token) headers.Authorization = `Bearer ${auth.token}`;

    let res;
    try {
        res = await fetch(`${API_BASE}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new Error('Could not reach the server.');
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.success) {
        const err = new Error((data && data.error) || `Request failed (${res.status}).`);
        err.status = res.status;
        throw err;
    }
    return data;
}

function escapeHtml(value) {
    const chars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, (c) => chars[c]);
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function coverFor(post) {
    return post.cover_image || `https://picsum.photos/seed/devblog-${post.id}/400/250`;
}

/* NAV */
const menuBtn = document.querySelector('#menu-btn');
const nav = document.querySelector('header nav');

if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
        nav.classList.toggle('nav-open');
    });
}

function renderAuthNav() {
    const slot = document.querySelector('#nav-auth');
    if (!slot) return;

    const user = auth.user;
    if (!auth.token || !user) {
        slot.innerHTML = '<a href="login.html">Login</a>';
        return;
    }

    slot.innerHTML = `<a href="#" id="logout-btn">Logout (${escapeHtml(user.username)})</a>`;
    slot.querySelector('#logout-btn').addEventListener('click', (e) => {
        e.preventDefault();
        auth.clear();
        renderAuthNav();
        window.location.href = 'index.html';
    });
}

// Confirms the stored token is still valid; a token is only discarded when the
// server actually rejects it, not when it is simply unreachable.
async function syncAuthNav() {
    renderAuthNav();
    if (!auth.token) return;

    try {
        const { user } = await api('/auth/me', { withAuth: true });
        auth.save(auth.token, user);
    } catch (err) {
        if (err.status === 401) auth.clear();
    }
    renderAuthNav();
}

syncAuthNav();

/* POST LIST (index) */
const postList = document.querySelector('#post-list');

if (postList) {
    const statusEl = document.querySelector('#post-status');
    const pagination = document.querySelector('#pagination');
    const pageInfo = document.querySelector('#page-info');
    const prevBtn = document.querySelector('#prev-page');
    const nextBtn = document.querySelector('#next-page');
    const searchInput = document.querySelector('#search-input');
    const sortSelect = document.querySelector('#sort-select');
    const categorySelect = document.querySelector('#category-select');

    const state = { page: 1, q: '', sort: 'latest', category: '', totalPages: 1 };

    function cardHtml(post) {
        const excerpt = post.content ? `${post.content.slice(0, 140)}${post.content.length > 140 ? '…' : ''}` : '';
        const category = post.category ? `<span class="category">${escapeHtml(post.category)}</span>` : '';
        return `
            <a class="post-card" href="post.html?id=${encodeURIComponent(post.id)}">
                <img src="${escapeHtml(coverFor(post))}" alt="">
                ${category}
                <h3>${escapeHtml(post.title)}</h3>
                <p>${escapeHtml(excerpt)}</p>
                <div class="post-meta">
                    <span class="author">${escapeHtml(post.author)}</span>
                    <time datetime="${escapeHtml(post.created_at)}">${formatDate(post.created_at)}</time>
                </div>
            </a>`;
    }

    function selectedCategoryName() {
        if (!state.category || !categorySelect) return '';
        const option = categorySelect.querySelector(`option[value="${state.category}"]`);
        return option ? option.dataset.name || '' : '';
    }

    function emptyMessage() {
        const name = selectedCategoryName();
        if (state.q && name) return `No posts in ${name} match \u201c${state.q}\u201d.`;
        if (state.q) return `No posts match \u201c${state.q}\u201d.`;
        if (name) return `No posts filed under ${name} yet.`;
        return 'No posts yet. Be the first to write one.';
    }

    // The filter is a progressive enhancement: if the categories request fails
    // the select simply stays disabled on "All categories" and the list works on.
    async function loadCategories() {
        if (!categorySelect) return;

        try {
            const { categories } = await api('/categories');
            const options = categories
                .filter((category) => category.post_count > 0)
                .map(
                    (category) =>
                        `<option value="${escapeHtml(category.id)}" data-name="${escapeHtml(category.name)}">` +
                        `${escapeHtml(category.name)} (${category.post_count})</option>`
                )
                .join('');
            categorySelect.insertAdjacentHTML('beforeend', options);
        } catch {
            categorySelect.disabled = true;
        }
    }

    async function loadPosts() {
        statusEl.hidden = false;
        statusEl.textContent = 'Loading posts…';
        pagination.hidden = true;

        const params = new URLSearchParams({ page: String(state.page), limit: '9', sort: state.sort });
        if (state.q) params.set('q', state.q);
        if (state.category) params.set('category', state.category);

        try {
            const data = await api(`/posts?${params}`, { withAuth: true });
            postList.innerHTML = data.posts.map(cardHtml).join('');
            state.totalPages = Math.max(data.pagination.totalPages, 1);

            if (data.posts.length === 0) {
                statusEl.textContent = emptyMessage();
            } else {
                statusEl.hidden = true;
            }

            pagination.hidden = state.totalPages <= 1;
            pageInfo.textContent = `Page ${state.page} of ${state.totalPages}`;
            prevBtn.disabled = state.page <= 1;
            nextBtn.disabled = state.page >= state.totalPages;
        } catch (err) {
            postList.innerHTML = '';
            statusEl.hidden = false;
            statusEl.textContent = err.message;
        }
    }

    if (searchInput) {
        let debounce;
        searchInput.addEventListener('input', (e) => {
            const value = e.target.value.trim();
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                state.q = value;
                state.page = 1;
                loadPosts();
            }, 300);
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            state.sort = sortSelect.value;
            state.page = 1;
            loadPosts();
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            state.category = categorySelect.value;
            state.page = 1;
            loadPosts();
        });
    }

    prevBtn.addEventListener('click', () => {
        if (state.page > 1) {
            state.page -= 1;
            loadPosts();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (state.page < state.totalPages) {
            state.page += 1;
            loadPosts();
        }
    });

    loadCategories();
    loadPosts();
}

/* SCROLL TO TOP */
const scrollBtn = document.querySelector('#scroll-top-btn');

if (scrollBtn) {
    window.addEventListener('scroll', () => {
        scrollBtn.classList.toggle('visible', window.scrollY > 300);
    });

    scrollBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}
