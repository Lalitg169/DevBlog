const menuBtn = document.querySelector('#menu-btn');
const nav = document.querySelector('header nav');

menuBtn.addEventListener('click', () => {
    nav.classList.toggle('nav-open');
});

const searchInput = document.querySelector('#search-input');
const postCards = document.querySelectorAll('.post-card');

searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    postCards.forEach(card => {
        const title = card.querySelector('h3').textContent.toLowerCase();
        const category = card.querySelector('span').textContent.toLowerCase();
        if (title.includes(searchTerm) || category.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
});

const scrollBtn = document.querySelector('#scroll-top-btn');

window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
        scrollBtn.classList.add('visible');
    } else {
        scrollBtn.classList.remove('visible');
    }
});

scrollBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});
