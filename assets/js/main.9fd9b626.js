// assets/js/main.js

document.addEventListener('DOMContentLoaded', () => {
    initApp();       // Inicia tema, scroll e UI básica
    loadGameContent(); // Inicia o carregamento dos jogos
});

/**
 * Função principal que orquestra o carregamento dos jogos
 */
async function loadGameContent() {
    const carouselContainer = document.querySelector('.carousel-container');
    const gamesGrid = document.querySelector('.games-grid');

    // Se não estiver na home (ex: login page), para aqui
    if (!carouselContainer && !gamesGrid) return;

    // Coloca loadings
    if(gamesGrid) gamesGrid.innerHTML = '<div class="loader"></div>';

    // 1. Busca os dados reais do Firebase (via data-manager.js)
    const games = await getPublicGames(); 

    // 2. Limpa os containers
    if(carouselContainer) carouselContainer.innerHTML = '';
    if(gamesGrid) gamesGrid.innerHTML = '';

    if (games.length === 0) {
        if(gamesGrid) gamesGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Nenhum jogo disponível no momento.</p>';
        return;
    }

    // 3. Popula o Carrossel (Pega os 5 primeiros jogos como destaque)
    if (carouselContainer) {
        const featuredGames = games.slice(0, 5); 
        featuredGames.forEach(game => {
            const slide = createCarouselSlide(game);
            carouselContainer.appendChild(slide);
        });
        initCarouselControls(); // Ativa os botões de passar slide
    }

    // 4. Popula a Grade de Jogos (Todos os jogos públicos)
    if (gamesGrid) {
        games.forEach(game => {
            const card = createGameCard(game);
            gamesGrid.appendChild(card);
        });
    }
}

/**
 * Cria o HTML de um Slide do Carrossel
 */
function createCarouselSlide(game) {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    
    const imageSrc = game.coverImage || 'assets/images/logo.png';
    // Usa o slug se existir, senão usa o ID (para compatibilidade com jogos antigos)
    const gameIdentifier = game.slug || game.id;
    const gameUrl = `jogo/${gameIdentifier}`; // URL Limpa

    slide.innerHTML = `
        <a href="${gameUrl}" class="carousel-img-link" title="Ver detalhes do jogo">
            <img src="${imageSrc}" alt="${game.name}">
        </a>
        <div class="slide-info">
            <h3>${game.name}</h3>
            <p>${game.shortDescription || 'Uma aventura incrível espera por você.'}</p>
        </div>
    `;
    return slide;
}

/**
 * Cria o HTML de um Card de Jogo
 */
function createGameCard(game) {
    // ... código anterior ...
    const imageSrc = game.coverImage || 'assets/images/logo.png';
    
    // Usa o slug se existir, senão usa o ID
    const gameIdentifier = game.slug || game.id;
    const gameUrl = `jogo/${gameIdentifier}`; // URL Limpa

    // ... resto da lógica do badge ...

    card.innerHTML = `
        <div style="position:relative;">
            <img src="${imageSrc}" alt="${game.name}" class="game-card-img">
            ${pausedBadge}
        </div>
        <div class="game-card-content">
            <h3>${game.name}</h3>
            <p>${game.shortDescription || 'Sem descrição.'}</p>
            <div style="margin-top:auto; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.8rem; opacity:0.7;">⏱ ${game.sessionDuration || 'N/A'}</span>
                <a href="${gameUrl}" class="submit-btn small-btn">Ver Detalhes</a>
            </div>
        </div>
    `;
    return card;
}

// --- Funções Auxiliares (UI) ---

function initApp() {
    initTheme(); // Inicia a lógica do tema
    
    // Back to top
    const backToTop = document.getElementById('back-to-top');
    if(backToTop) {
        window.addEventListener('scroll', () => {
            backToTop.classList.toggle('visible', window.scrollY > 300);
        });
    }
}

// --- Lógica de Tema (Dark/Light) ---
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;
    
    // 1. Recupera tema salvo ou usa 'dark' como padrão
    const savedTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    // 2. Event Listener do botão
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';

            // Aplica no HTML e Salva no Storage
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            
            // Atualiza o ícone
            updateThemeIcon(newTheme);
        });
    }
}

function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        // Se o tema for escuro, mostra o sol (para mudar pro claro)
        // Se o tema for claro, mostra a lua (para mudar pro escuro)
        const iconName = theme === 'dark' ? 'sunny-outline' : 'moon-outline';
        themeToggle.setAttribute('name', iconName);
    }
}

function initCarouselControls() {
    const container = document.querySelector('.carousel-container');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    
    if (!container || !prevBtn || !nextBtn || container.children.length === 0) return;

    let currentIndex = 0;
    const slides = container.children;
    const totalSlides = slides.length;

    // Mostra o primeiro slide
    slides[0].classList.add('active');

    function updateCarousel() {
        slides[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        
        // Atualiza classe active (opcional, dependendo do CSS)
        Array.from(slides).forEach((slide, index) => {
            if (index === currentIndex) slide.classList.add('active');
            else slide.classList.remove('active');
        });
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