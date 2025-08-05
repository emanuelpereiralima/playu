
/* ==================== MODO CLARO / ESCURO ==================== */
const themeToggle = document.getElementById('theme-toggle');
const htmlElement = document.documentElement;

// Função para aplicar o tema e salvar a preferência
function applyTheme(theme) {
    htmlElement.setAttribute('data-theme', theme);
    if (themeToggle) {
        themeToggle.setAttribute('name', theme === 'light' ? 'moon-outline' : 'sunny-outline');
    }
    localStorage.setItem('theme', theme); // Salva a preferência no navegador
}

// Event Listener para o botão de troca de tema
if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    });
}

// Aplica o tema salvo ao carregar qualquer página
const savedTheme = localStorage.getItem('theme') || 'dark';
applyTheme(savedTheme);

/* ==================== BOTÃO 'VOLTAR AO TOPO' ==================== */
const backToTopButton = document.getElementById('back-to-top');

if (backToTopButton) {
    window.addEventListener('scroll', () => {
        if (window.scrollY >= 400) {
            backToTopButton.classList.add('show-scroll');
        } else {
            backToTopButton.classList.remove('show-scroll');
        }
    });
}



document.addEventListener('DOMContentLoaded', () => {
    // Escopo principal da página de início
    const indexPageContainer = document.getElementById('jogos');
    if (!indexPageContainer) return;

    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    function createGameCard(game) { /* ... (código existente sem alterações) ... */ }
    function createCarouselSlide(game) { /* ... (código existente sem alterações) ... */ }
    
    function populateContent() {
        const games = getGames().filter(g => g.status === 'approved'); // Usa a função central

        const gamesGrid = document.querySelector('#jogos .games-grid');
        if (gamesGrid) {
            gamesGrid.innerHTML = games.map(createGameCard).join('');
        }
        
        const carouselContainer = document.querySelector('#home .carousel-container');
        if (carouselContainer) {
            carouselContainer.innerHTML = games.map(createCarouselSlide).join('');
        }
        
        // Re-inicializa funcionalidades interativas
        initCarousel();
        initGameCardHover();
        
        const currentLang = localStorage.getItem('language') || 'pt';
        if (typeof setLanguage === 'function') setLanguage(currentLang);
    }
    
    // --- FUNÇÕES DE INICIALIZAÇÃO ---
    function initCarousel() { /* ... (cole aqui toda a lógica do carrossel, da randomização aos botões e arraste) ... */ }
    function initGameCardHover() { /* ... (cole aqui toda a lógica de hover dos cards com vídeo) ... */ }

    // --- SINCRONIZAÇÃO AUTOMÁTICA ---
    window.addEventListener('storage', (event) => {
        // Se os jogos ou agendamentos mudarem em outra aba, recarrega o conteúdo.
        if (event.key === 'games' || event.key === 'bookings') {
            console.log('Dados atualizados em outra aba. Recarregando conteúdo...');
            populateContent();
        }
    });
    
    // Primeira carga
    populateContent();
});