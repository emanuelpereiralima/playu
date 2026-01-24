document.addEventListener('DOMContentLoaded', () => {
    initApp();       
    loadGameContent(); 
});

/**
 * Inicializa configurações globais do app
 */
function initApp() {
    checkAuthPersistence();
    initTheme();
    const backToTop = document.getElementById('back-to-top');
    if(backToTop) {
        window.addEventListener('scroll', () => {
            backToTop.classList.toggle('visible', window.scrollY > 300);
        });
    }
}

/**
 * Verifica se há um login persistente válido (regra de 2 dias)
 */
function checkAuthPersistence() {
    const localData = localStorage.getItem('loggedInUser');
    
    if (localData) {
        try {
            const userData = JSON.parse(localData);
            
            // Verifica se tem data de expiração e se ainda é válida
            if (userData.authExpiry && Date.now() < userData.authExpiry) {
                // Sessão Válida: Sincroniza com sessionStorage para compatibilidade
                // (Isso garante que scripts como admin.js, que buscam no sessionStorage, funcionem)
                if (!sessionStorage.getItem('loggedInUser')) {
                    sessionStorage.setItem('loggedInUser', JSON.stringify(userData));
                    console.log("Sessão restaurada via persistência.");
                }
            } else {
                // Sessão Expirada: Limpa tudo
                console.warn("Sessão expirada. Deslogando...");
                localStorage.removeItem('loggedInUser');
                sessionStorage.removeItem('loggedInUser');
                if (window.auth) window.auth.signOut();
            }
        } catch (e) {
            console.error("Erro ao validar persistência:", e);
            localStorage.removeItem('loggedInUser');
        }
    }
}

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

    // 3. Popula o Carrossel (ALEATÓRIO)
    if (carouselContainer) {
        // Cria uma cópia da lista e embaralha para não afetar a ordem da grade abaixo
        const shuffledGames = [...games].sort(() => 0.5 - Math.random());
        
        // Pega os 5 primeiros da lista embaralhada
        const featuredGames = shuffledGames.slice(0, 5); 
        
        featuredGames.forEach(game => {
            const slide = createCarouselSlide(game);
            carouselContainer.appendChild(slide);
        });
        initCarouselControls(); 
    }

    // 4. Popula a Grade (Mantém ordem original ou pode embaralhar também se desejar)
    if (gamesGrid) {
        games.forEach(game => {
            const card = createGameCard(game);
            gamesGrid.appendChild(card);
        });
    }
}

function createCarouselSlide(game) {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide';
    const imageSrc = game.coverImage || 'assets/images/logo.png';
    const gameIdentifier = game.slug || game.id;
    
    // CORREÇÃO AQUI: Mudamos para usar ?id= para evitar erro de rota 404
    const gameUrl = `jogo-template.html?id=${gameIdentifier}`;

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

function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    const imageSrc = game.coverImage || 'assets/images/logo.png';
    const gameIdentifier = game.slug || game.id;
    
    // URL correta para o template
    const gameUrl = `jogo-template.html?id=${gameIdentifier}`;
    
    // Status visual
    let statusHtml = '';
    if (game.status === 'paused') {
        statusHtml = '<small style="font-size:0.75rem;"><span style="color:#ffbb00">● Pausado</span></small>';
    } else {
        const durationText = game.sessionDuration ? `⏱ ${game.sessionDuration} min` : '● Disponível';
        statusHtml = `<small style="font-size:0.75rem; color:#aaa;">${durationText}</small>`;
    }

    card.innerHTML = `
        <img src="${imageSrc}" class="game-card-img" style="height:120px; object-fit: cover; width: 100%;">
        
        <div class="game-card-content" style="display: flex; flex-direction: column; flex: 1; padding: 1rem;">
            <div style="margin-bottom:0.8rem;">
                <h3 style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size: 1rem; color: #fff; margin: 0 0 3px 0;">${game.name}</h3>
                ${statusHtml}
            </div>

            <div style="display:grid; grid-template-columns:1fr; gap:8px; margin-top: auto;">
                <a href="${gameUrl}" class="submit-btn small-btn" style="text-align:center; text-decoration:none; display:flex; align-items:center; justify-content:center; gap:8px; font-size: 0.85rem; padding: 0.5rem;">
                    Ver Detalhes <ion-icon name="arrow-forward-outline"></ion-icon>
                </a>
            </div>
        </div>
    `;
    return card;
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