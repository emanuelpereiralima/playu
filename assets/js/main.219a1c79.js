// playu/assets/js/main.js

document.addEventListener('DOMContentLoaded', () => {
    initApp();       
    loadGameContent(); 
});

/**
 * Função principal que orquestra o carregamento dos jogos
 */
async function loadGameContent() {
    const carouselContainer = document.querySelector('.carousel-container');
    const gamesGrid = document.querySelector('.games-grid');

    if (!carouselContainer && !gamesGrid) return;

    if(gamesGrid) gamesGrid.innerHTML = '<div class="loader"></div>';

    // --- 1. BUSCA ROBUSTA DE DADOS ---
    let games = [];
    
    try {
        if (typeof getPublicGames === 'function') {
            games = await getPublicGames();
        } else {
            console.warn("data-manager não encontrado, buscando direto do Firebase...");
            const db = window.db || firebase.firestore();
            const snapshot = await db.collection('games').get();
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.status !== 'draft') {
                    games.push({ id: doc.id, ...data });
                }
            });
        }

        if (games.length > 0) {
            localStorage.setItem('games', JSON.stringify(games));
        }

    } catch (e) {
        console.error("Erro crítico ao carregar jogos:", e);
        if(gamesGrid) gamesGrid.innerHTML = '<p class="error-message">Erro ao carregar jogos. Verifique sua conexão.</p>';
        return;
    }

    // --- 2. LIMPEZA E RENDERIZAÇÃO ---
    if(carouselContainer) carouselContainer.innerHTML = '';
    if(gamesGrid) gamesGrid.innerHTML = '';

    if (games.length === 0) {
        const emptyMsg = '<p style="grid-column: 1/-1; text-align: center; opacity: 0.7;">Nenhum jogo disponível no momento.</p>';
        if(gamesGrid) gamesGrid.innerHTML = emptyMsg;
        return;
    }

    // 3. Popula o Carrossel
    if (carouselContainer) {
        const featuredGames = games.slice(0, 5); 
        featuredGames.forEach(game => {
            const slide = createCarouselSlide(game);
            carouselContainer.appendChild(slide);
        });
        initCarouselControls(); 
    }

    // 4. Popula a Grade
    if (gamesGrid) {
        games.forEach(game => {
            const card = createGameCard(game);
            gamesGrid.appendChild(card);
        });
    }
}

/**
 * Cria o HTML de um Slide do Carrossel (URL LIMPA)
 */
function createCarouselSlide(game) {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    
    const imageSrc = game.coverImage || 'assets/images/logo.png';
    const gameIdentifier = game.slug || game.id;
    
    // URL LIMPA: /jogo/nome-do-jogo
    const gameUrl = `jogo/${gameIdentifier}`;

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
 * Cria o HTML de um Card de Jogo (URL LIMPA)
 */
function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    
    const imageSrc = game.coverImage || 'assets/images/logo.png';
    const gameIdentifier = game.slug || game.id;
    
    // URL LIMPA: /jogo/nome-do-jogo
    const gameUrl = `jogo/${gameIdentifier}`;
    
    let pausedBadge = '';
    if (game.status === 'paused') {
        pausedBadge = `<div style="position:absolute; top:10px; right:10px; background:#ffbb00; color:#000; padding:2px 8px; border-radius:4px; font-weight:bold; font-size:0.8rem; z-index:5;">PAUSADO</div>`;
    }

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
    initTheme();
    const backToTop = document.getElementById('back-to-top');
    if(backToTop) {
        window.addEventListener('scroll', () => {
            backToTop.classList.toggle('visible', window.scrollY > 300);
        });
    }
}

function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;
    const savedTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }
}

function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
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
    if(slides[0]) slides[0].classList.add('active');

    function updateCarousel() {
        slides[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
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