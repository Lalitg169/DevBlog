// Resolved at runtime, since the frontend has no build step to bake a value in.
// In order of precedence: an explicit window.DEVBLOG_API_BASE set before this
// file loads, a <meta name="devblog-api-base"> in the page head, then a default
// of localhost while developing and same-origin /api once deployed.
const API_BASE = (() => {
    const trim = (value) => value.trim().replace(/\/+$/, '');

    if (typeof window.DEVBLOG_API_BASE === 'string' && window.DEVBLOG_API_BASE.trim()) {
        return trim(window.DEVBLOG_API_BASE);
    }

    const meta = document.querySelector('meta[name="devblog-api-base"]');
    if (meta && meta.content.trim()) {
        return trim(meta.content);
    }

    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
    return isLocal ? 'http://localhost:5000/api' : '/api';
})();

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

// Uploads come back as a server-relative path like /uploads/abc.png, which
// belongs to the API origin — not necessarily wherever this page is served
// from. Resolving here keeps the stored value host-free.
function assetUrl(value) {
    if (!value) return '';
    if (/^(https?:)?\/\//i.test(value)) return value;
    if (!value.startsWith('/')) return value;
    return new URL(API_BASE, window.location.origin).origin + value;
}

function coverFor(post) {
    return assetUrl(post.cover_image) || `https://picsum.photos/seed/devblog-${post.id}/400/250`;
}

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/**
 * Sends one image to POST /api/upload and returns its stored path. FormData is
 * posted with raw fetch rather than api(), which serialises bodies as JSON and
 * would also stomp the multipart boundary Content-Type.
 */
async function uploadImage(file) {
    if (file.size > COVER_MAX_BYTES) {
        throw new Error('Image must be 5 MB or smaller.');
    }
    if (!COVER_MIME_TYPES.includes(file.type)) {
        throw new Error('Image must be a PNG, JPEG, GIF or WebP.');
    }

    const body = new FormData();
    body.append('image', file);

    let res;
    try {
        res = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${auth.token}` },
            body,
        });
    } catch {
        throw new Error('Could not reach the server.');
    }

    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.success) {
        throw new Error((data && data.error) || `Upload failed (${res.status}).`);
    }
    return data.url;
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
        // hide profile btn if exists
        const pb = document.querySelector('#profile-dropdown-btn');
        if (pb) pb.hidden = true;
        return;
    }

    slot.innerHTML = '';
    const initial = user.username.charAt(0).toUpperCase();

    // Show the profile button in the header
    let profileBtn = document.querySelector('#profile-dropdown-btn');
    if (!profileBtn) {
        profileBtn = document.createElement('button');
        profileBtn.id = 'profile-dropdown-btn';
        profileBtn.className = 'profile-dropdown-btn';
        profileBtn.type = 'button';
        document.querySelector('header').appendChild(profileBtn);

        // Dropdown container
        const dropdown = document.createElement('div');
        dropdown.id = 'profile-dropdown';
        dropdown.className = 'profile-dropdown';
        dropdown.hidden = true;
        dropdown.innerHTML = `
            <div class="profile-dropdown-header">
                <div class="profile-dropdown-avatar">${initial}</div>
                <div>
                    <div class="profile-dropdown-name">${escapeHtml(user.username)}</div>
                    <div class="profile-dropdown-email">${escapeHtml(user.email || 'No email set')}</div>
                </div>
            </div>
            <div class="profile-dropdown-divider"></div>
            <button type="button" class="profile-dropdown-item" id="dropdown-settings-btn">⚙️ Settings</button>
            <button type="button" class="profile-dropdown-item profile-dropdown-logout" id="dropdown-logout-btn">🚪 Logout</button>
        `;
        document.querySelector('header').appendChild(dropdown);

        // Toggle
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.hidden = !dropdown.hidden;
        });

        // Close on outside click
        document.addEventListener('click', () => { dropdown.hidden = true; });
        dropdown.addEventListener('click', (e) => e.stopPropagation());

        // Logout
        dropdown.querySelector('#dropdown-logout-btn').addEventListener('click', () => {
            auth.clear();
            dropdown.hidden = true;
            renderAuthNav();
            window.location.href = 'index.html';
        });

        // Settings
        dropdown.querySelector('#dropdown-settings-btn').addEventListener('click', () => {
            dropdown.hidden = true;
            openSettingsModal();
        });
    }

    profileBtn.innerHTML = `<span class="profile-btn-avatar">${initial}</span><span class="profile-btn-bars">☰</span>`;
    profileBtn.hidden = false;

    // Update dropdown content
    const dd = document.querySelector('#profile-dropdown');
    if (dd) {
        dd.querySelector('.profile-dropdown-avatar').textContent = initial;
        dd.querySelector('.profile-dropdown-name').textContent = user.username;
        dd.querySelector('.profile-dropdown-email').textContent = user.email || 'No email set';
    }
}

// Settings modal
function openSettingsModal() {
    let modal = document.querySelector('#settings-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'settings-modal';
        modal.className = 'settings-modal-backdrop';
        modal.innerHTML = `
            <div class="settings-modal-box">
                <div class="settings-modal-header">
                    <h3>⚙️ Account Settings</h3>
                    <button type="button" class="settings-modal-close" id="settings-close-btn">&times;</button>
                </div>
                <form id="settings-form">
                    <label for="settings-email">Email Address</label>
                    <input type="email" id="settings-email" placeholder="you@example.com">

                    <label for="settings-current-pw" style="margin-top:16px;">Current Password</label>
                    <input type="password" id="settings-current-pw" placeholder="Required to change password">

                    <label for="settings-new-pw">New Password</label>
                    <input type="password" id="settings-new-pw" placeholder="Min 6 characters">

                    <button type="submit" class="btn" style="margin-top:20px; width:100%; cursor:pointer; border:none; font-family:inherit;">Save Changes</button>
                    <p class="form-message" id="settings-msg"></p>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        // Close
        modal.querySelector('#settings-close-btn').addEventListener('click', () => { modal.hidden = true; });
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

        // Submit
        modal.querySelector('#settings-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const msgEl = modal.querySelector('#settings-msg');
            const email = modal.querySelector('#settings-email').value.trim();
            const currentPassword = modal.querySelector('#settings-current-pw').value;
            const newPassword = modal.querySelector('#settings-new-pw').value;

            const payload = {};
            if (email) payload.email = email;
            if (newPassword) {
                payload.newPassword = newPassword;
                payload.currentPassword = currentPassword;
            }

            if (Object.keys(payload).length === 0) {
                msgEl.className = 'form-message error';
                msgEl.textContent = 'Nothing to update.';
                return;
            }

            msgEl.className = 'form-message';
            msgEl.textContent = 'Saving…';

            try {
                const data = await api('/auth/settings', { method: 'PUT', body: payload, withAuth: true });
                auth.save(auth.token, data.user);
                renderAuthNav();
                msgEl.className = 'form-message success';
                msgEl.textContent = 'Settings updated!';
                modal.querySelector('#settings-current-pw').value = '';
                modal.querySelector('#settings-new-pw').value = '';
            } catch (err) {
                msgEl.className = 'form-message error';
                msgEl.textContent = err.message;
            }
        });
    }

    // Pre-fill
    const user = auth.user;
    if (user) {
        modal.querySelector('#settings-email').value = user.email || '';
    }
    modal.querySelector('#settings-msg').textContent = '';
    modal.querySelector('#settings-current-pw').value = '';
    modal.querySelector('#settings-new-pw').value = '';
    modal.hidden = false;
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
