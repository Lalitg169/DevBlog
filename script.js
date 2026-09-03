const menuBtn = document.querySelector('#menu-btn');
const nav = document.querySelector('header nav');

if (menuBtn && nav) {
    menuBtn.addEventListener('click', () => {
        nav.classList.toggle('nav-open');
    });
}

const searchInput = document.querySelector('#search-input');
const postCards = document.querySelectorAll('.post-card');

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim().toLowerCase();
        postCards.forEach(card => {
            const title = card.querySelector('h3')?.textContent.toLowerCase() ?? '';
            const category = card.querySelector('.category')?.textContent.toLowerCase() ?? '';
            const author = card.querySelector('.author')?.textContent.toLowerCase() ?? '';
            const match = title.includes(searchTerm) || category.includes(searchTerm) || author.includes(searchTerm);
            card.style.display = match ? '' : 'none';
        });
    });
}

const scrollBtn = document.querySelector('#scroll-top-btn');

if (scrollBtn) {
    window.addEventListener('scroll', () => {
        scrollBtn.classList.toggle('visible', window.scrollY > 300);
    });

    scrollBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}
