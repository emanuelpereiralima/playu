// assets/js/main.js (NOVA VERSÃO FIREBASE)

document.addEventListener('DOMContentLoaded', () => {
    
    // Inicializa todas as funções principais da página
    initApp();

    // Tenta carregar os dados dinâmicos (jogos)
    loadDynamicContent();
});

/**
 * Inicializa os componentes estáticos da página
 * (Ex: tema, tradução, back-to-top)
 */
function initApp() {
    console.log('App inicializado.');

    // Lógica do Tema (Dark/Light)
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.toggleAttribute('data-theme', 'dark');
            themeToggle.setAttribute('name', isDark ? 'sunny-outline' : 'moon-outline');
            // Opcional: Salvar preferência no localStorage aqui
        });
    }

    // Lógica do botão Voltar ao Topo
    const backToTop = document.getElementById('back-to-top');
    if(backToTop) {
        window.addEventListener('scroll', () => {
            backToTop.classList.toggle('visible', window.scrollY > 300);
        });
    }

    // NOTA: A lógica dos botões "Entrar como Jogador/Host" foi removida 
    // pois o acesso agora é exclusivo via Dashboard/Admin.
}

/**
 * Carrega o conteúdo dinâmico (jogos) do Firestore
 * e preenche o carrossel e a grade de jogos.
 */
async function loadDynamicContent() {
    // Busca os jogos usando o novo data-manager
    const games = await getAllGames(); 

    if (!games || games.length === 0) {
        console.warn('Nenhum jogo retornado pelo data-manager.');
        return;
    }

    // Popula o carrossel (ex: 5 primeiros jogos)
    populateCarousel(games.slice(0, 5));
    
    // Popula a grade principal de jogos
    populateGamesGrid(games);
}

/**
 * Preenche o carrossel de destaque
 * @param {Array<Object>} featuredGames Array de jogos para o carrossel
 */
function populateCarousel(featuredGames) {
    const container = document.querySelector('.carousel-container');
    if (!container) return;

    container.innerHTML = ''; // Limpa o loader (se houver)
    
    featuredGames.forEach(game => {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide';
        // Note: Assumindo que o 'thumbnailUrl' foi salvo no host-panel
        slide.innerHTML = `
            <img src="${game.thumbnailUrl || 'assets/images/placeholder.png'}" alt="${game.title}">
            <div class="carousel-caption">
                <h3>${game.title}</h3>
                <p>${game.description.substring(0, 100)}...</p>
                <a href="dashboard.html" class="submit-btn small-btn">Agendar Agora</a>
            </div>
        `;
        container.appendChild(slide);
    });
    
    // Aqui você inicializaria a lógica do carrossel (prev/next)
    // (A lógica de controle do carrossel em si não foi fornecida, 
    //  mas este é o local para ativá-la)
    console.log('Carrossel populado.');
    initCarouselControls(); // Função de exemplo
}

/**
 * Preenche a grade de jogos
 * @param {Array<Object>} allGames Array com todos os jogos
 */
function populateGamesGrid(allGames) {
    const grid = document.querySelector('.games-grid');
    if (!grid) return;

    grid.innerHTML = ''; // Limpa o loader

    allGames.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card'; // Reutilizando a classe do dashboard
        card.innerHTML = `
            <img src="${game.thumbnailUrl || 'assets/images/placeholder.png'}" alt="${game.title}" class="game-card-img">
            <div class="game-card-content">
                <h3>${game.title}</h3>
                <p>${game.description.substring(0, 100)}...</p>
                <a href="dashboard.html" class="submit-btn">Ver Agendamentos</a>
            </div>
        `;
        grid.appendChild(card);
    });
    console.log('Grade de jogos populada.');
}

// Função de exemplo para a lógica do carrossel
function initCarouselControls() {
    const container = document.querySelector('.carousel-container');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    if (!container || !prevBtn || !nextBtn || container.children.length === 0) return;

    let currentIndex = 0;
    const slides = container.children;
    const totalSlides = slides.length;

    function updateCarousel() {
        const offset = -currentIndex * 100;
        container.style.transform = `translateX(${offset}%)`;
    }

    prevBtn.addEventListener('click', () => {
        currentIndex = (currentIndex > 0) ? currentIndex - 1 : totalSlides - 1;
        updateCarousel();
    });

    nextBtn.addEventListener('click', () => {
        currentIndex = (currentIndex < totalSlides - 1) ? currentIndex + 1 : 0;
        updateCarousel();
    });
}