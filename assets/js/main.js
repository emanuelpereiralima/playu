// =================================================================
// MAIN.JS - LÓGICA GERAL (NAVBAR, TEMA, CARREGAMENTO)
// =================================================================

// Deixe as variáveis declaradas sem inicializar ainda para evitar erros
let db;
let auth;
let games = []; 
let slideIndex = 0;
let slideInterval;

// =================================================================
// 1. INICIALIZAÇÃO SEGURA
// =================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Garante que o Firebase carregou antes de tentar usar
    if (typeof firebase === 'undefined') {
        console.error("❌ ERRO: Firebase não encontrado no HTML.");
        return;
    }

    db = window.db || firebase.firestore();
    auth = window.auth || firebase.auth();

    // A. Monitora Login/Logout para ajustar a Navbar
    auth.onAuthStateChanged((user) => {
        updateNavbar(user);
    });

    // B. Inicializa o Sistema de Tema (Dark/Light)
    initThemeSystem();

    // C. Carrega jogos se estiver na Home (Grid ou Carrossel)
    if (document.getElementById('games-grid') || document.getElementById('carousel-track')) {
        await loadGames();
    }
});

// =================================================================
// 2. NAVBAR (LOGIN vs PERFIL E ADMIN)
// =================================================================
async function updateNavbar(user) {
    // Tenta encontrar a div dos botões usando as classes mais comuns do seu projeto
    const navControls = document.querySelector('.nav__controls') || document.querySelector('.nav-buttons') || document.getElementById('user-logged-in-menu');
    
    if (!navControls) {
        console.warn("⚠️ Div dos botões não encontrada no HTML. Verifique se existe a classe '.nav__controls' no menu.");
        return;
    }

    // Garante que a div esteja visível (caso estivesse escondida no CSS)
    navControls.style.display = 'flex';
    navControls.style.alignItems = 'center';
    navControls.style.gap = '15px';

    // Preserva o botão de tema
    const themeSwitcher = navControls.querySelector('.theme-switcher') || document.getElementById('theme-toggle')?.parentElement;
    const themeHtml = themeSwitcher ? themeSwitcher.outerHTML : '<div class="theme-switcher" style="cursor:pointer; font-size:1.2rem; display:flex; align-items:center;"><ion-icon name="sunny-outline" id="theme-toggle"></ion-icon></div>';

    if (user) {
        // --- USUÁRIO LOGADO ---
        let isAdmin = false;
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData.role === 'admin' || userData.isAdmin === true) {
                    isAdmin = true;
                }
            }
        } catch (error) {
            console.error("Erro ao verificar permissões:", error);
        }

        // HTML do botão Admin (Apenas se for admin)
        const adminBtnHtml = isAdmin 
            ? `<a href="admin.html" class="submit-btn small-btn" style="background: var(--secondary-color); color: #fff; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; padding: 8px 15px;">
                    <ion-icon name="settings-outline" style="margin-right: 5px;"></ion-icon> Admin
               </a>` 
            : '';

        navControls.innerHTML = `
            ${adminBtnHtml}
            
            <a href="dashboard.html" class="submit-btn small-btn danger-btn" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center; padding: 8px 15px;">
                Perfil
            </a>
            
            <button onclick="logout()" style="
                background: transparent; 
                border: 1px solid var(--text-muted); 
                color: var(--text-color); 
                font-weight: 500; 
                padding: 8px 15px; 
                border-radius: 4px; 
                cursor: pointer; 
                transition: all 0.3s ease;
                font-size: 0.9rem;
            " 
            onmouseover="this.style.borderColor='var(--primary-color)'; this.style.color='var(--primary-color)'"
            onmouseout="this.style.borderColor='var(--text-muted)'; this.style.color='var(--text-color)'">
                Sair
            </button>
            
            ${themeHtml} 
        `;
    } else {
        // --- USUÁRIO DESLOGADO ---
        navControls.innerHTML = `
            <a href="login.html" class="submit-btn small-btn danger-btn" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center; padding: 8px 15px;">
                Entrar
            </a>
            ${themeHtml}
        `;
    }

    // Reativa o clique do solzinho/lua
    initThemeSystem();
}

window.logout = () => {
    if(auth) auth.signOut().then(() => window.location.href = 'index.html');
};

// =================================================================
// 3. SISTEMA DE TEMA (CLARO / ESCURO)
// =================================================================
function initThemeSystem() {
    const themeIcon = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;

    if (!themeIcon) return;

    const savedTheme = localStorage.getItem('theme') || 'dark';
    htmlElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(themeIcon, savedTheme);

    const newBtn = themeIcon.cloneNode(true);
    themeIcon.parentNode.replaceChild(newBtn, themeIcon);

    newBtn.style.cursor = 'pointer';
    newBtn.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        htmlElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newBtn, newTheme);
    });
}

function updateThemeIcon(btnElement, theme) {
    const iconName = theme === 'light' ? 'moon-outline' : 'sunny-outline';
    btnElement.setAttribute('name', iconName);
}

// =================================================================
// 4. CARREGAMENTO DE JOGOS (HOME)
// =================================================================
async function loadGames() {
    const grid = document.getElementById('games-grid');
    if (grid) grid.innerHTML = '<div class="loader-small" style="margin: 50px auto;"></div>';

    try {
        const snapshot = await db.collection('games').orderBy('createdAt', 'desc').get();
        
        if (snapshot.empty) {
            if (grid) grid.innerHTML = '<p style="text-align:center; color:var(--text-muted);">Nenhum jogo encontrado.</p>';
            return;
        }

        games = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            games.push({
                id: doc.id,
                ...data,
                maxPlayers: parseInt(data.maxPlayers) || 0,
                sessionDuration: parseInt(data.sessionDuration) || 0,
                tags: (Array.isArray(data.tags) && data.tags.length > 0) 
                      ? data.tags 
                      : inferTagsFromText(data.name, data.shortDescription, data.longDescription)
            });
        });

        // Chama as funções de renderização
        setupHeroCarousel(games);
        populateDynamicTags(games);
        renderGames(games);

    } catch (error) {
        console.error("Erro ao carregar jogos:", error);
        if(grid) grid.innerHTML = '<p style="text-align:center; color:red;">Erro ao conectar com o servidor.</p>';
    }
}

// =================================================================
// 5. CARROSSEL DINÂMICO
// =================================================================
function setupHeroCarousel(gamesList) {
    const track = document.getElementById('carousel-track');
    const dotsContainer = document.getElementById('carousel-dots');
    
    if (!track) return;

    track.innerHTML = '';
    if (dotsContainer) dotsContainer.innerHTML = '';

    const featuredGames = gamesList.slice(0, 5); // Top 5

    if (featuredGames.length === 0) return;

    featuredGames.forEach((game, index) => {
        const cover = game.coverImage || 'assets/images/logo.png';
        
        // Slide
        const slide = document.createElement('div');
        slide.className = index === 0 ? 'carousel-slide active' : 'carousel-slide';
        
        slide.innerHTML = `
            <img src="${cover}" alt="${game.name}" style="width: 100%; height: 100%; object-fit: cover;">
            
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.9)); z-index: 1;"></div>

            <div class="carousel-caption" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #fff; width: 80%; z-index: 2;">
                <h1 style="font-size: 3rem; margin-bottom: 10px; color: var(--secondary-color); text-transform: uppercase; text-shadow: 2px 2px 10px rgba(0,0,0,0.8);">
                    ${game.name}
                </h1>
                <p style="font-size: 1.2rem; margin-bottom: 25px; text-shadow: 1px 1px 3px rgba(0,0,0,0.8); color: #ddd;">
                    ${game.shortDescription || 'Uma experiência Playnambuco.'}
                </p>
                <a href="jogo-template.html?id=${game.id}" style="display: inline-block; text-decoration: none; padding: 12px 35px; background: var(--secondary-color); color: #fff; font-weight: bold; border-radius: 50px; cursor: pointer; font-size: 1rem; box-shadow: 0 0 15px rgba(255,0,0,0.4); transition: transform 0.2s;">
                    JOGAR AGORA
                </a>
            </div>
        `;
        track.appendChild(slide);

        // Bolinha (Dot)
        if (dotsContainer) {
            const dot = document.createElement('div');
            dot.className = index === 0 ? 'dot active' : 'dot';
            dot.style.cssText = `width: 12px; height: 12px; background: ${index === 0 ? 'var(--secondary-color)' : 'rgba(255,255,255,0.5)'}; border-radius: 50%; cursor: pointer; transition: all 0.3s;`;
            
            dot.onclick = () => {
                showSlide(index);
                resetAutoSlide();
            };
            dotsContainer.appendChild(dot);
        }
    });

    startAutoSlide();
}

function showSlide(n) {
    const slides = document.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.carousel-dots .dot');

    if (slides.length === 0) return;

    slides.forEach(slide => {
        slide.classList.remove('active');
        slide.style.opacity = ''; 
    });
    
    if(dots) {
        dots.forEach(dot => {
            dot.classList.remove('active');
            dot.style.background = 'rgba(255,255,255,0.5)';
            dot.style.transform = 'scale(1)';
        });
    }

    slideIndex = n;
    if (slideIndex >= slides.length) slideIndex = 0;
    if (slideIndex < 0) slideIndex = slides.length - 1;

    if (slides[slideIndex]) {
        slides[slideIndex].classList.add('active');
    }

    if (dots && dots[slideIndex]) {
        dots[slideIndex].classList.add('active');
        dots[slideIndex].style.background = 'var(--secondary-color)';
        dots[slideIndex].style.transform = 'scale(1.3)';
    }
}

function startAutoSlide() {
    if (slideInterval) clearInterval(slideInterval);
    slideInterval = setInterval(() => {
        showSlide(slideIndex + 1);
    }, 5000);
}

function resetAutoSlide() {
    clearInterval(slideInterval);
    startAutoSlide();
}

// =================================================================
// 6. RENDERIZAÇÃO DO GRID
// =================================================================
function renderGames(list) {
    const grid = document.getElementById('games-grid');
    const noResults = document.getElementById('no-results-msg');

    if (!grid) return;
    grid.innerHTML = '';
    grid.className = 'games-grid';

    if (!list || list.length === 0) {
        if (noResults) noResults.classList.remove('hidden');
        return;
    } else {
        if (noResults) noResults.classList.add('hidden');
    }

    list.forEach(game => {
        const cover = game.coverImage || 'assets/images/logo.png';
        const isPaused = game.status === 'paused';

        const card = document.createElement('div');
        card.className = 'game-card';
        
        if (isPaused) {
            card.style.opacity = '0.5';
            card.style.filter = 'grayscale(100%)';
            card.title = "Em manutenção";
            card.style.cursor = 'not-allowed';
        } else {
            card.style.cursor = 'pointer';
            card.onclick = () => startGame(game.id);
        }

        card.innerHTML = `
            <div style="position:relative; overflow:hidden;">
                <img src="${cover}" class="game-card-img" alt="${game.name}">
                ${isPaused ? '<div style="position:absolute; inset:0; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold; letter-spacing:2px;">OFFLINE</div>' : ''}
            </div>

            <div class="game-card-content">
                <h3 style="color:var(--text-color);">${game.name}</h3>
                <p style="color:var(--text-color-light);">${game.shortDescription || 'Clique para ver detalhes.'}</p>
                
                <div class="card-footer">
                    <span><ion-icon name="hourglass-outline"></ion-icon> ${game.sessionDuration || 60} min</span>
                    <span><ion-icon name="people-outline"></ion-icon> Max ${game.maxPlayers || 5}</span>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });
}

// =================================================================
// 7. SISTEMA DE FILTROS & TAGS
// =================================================================
function populateDynamicTags(gamesList) {
    const select = document.getElementById('filter-tag');
    if (!select) return;

    const uniqueTags = new Set();

    gamesList.forEach(game => {
        if (game.tags && Array.isArray(game.tags)) {
            game.tags.forEach(tag => {
                const formatted = tag.trim().charAt(0).toUpperCase() + tag.trim().slice(1);
                uniqueTags.add(formatted);
            });
        }
    });

    select.innerHTML = '<option value="all">Todas as Categorias</option>';
    uniqueTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag.toLowerCase();
        option.innerText = tag;
        select.appendChild(option);
    });
}

window.applyGameFilters = () => {
    const searchInput = document.getElementById('search-input');
    const timeInput = document.getElementById('filter-time');
    const playersInput = document.getElementById('filter-players');
    const tagInput = document.getElementById('filter-tag');

    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const timeFilter = timeInput ? timeInput.value : 'all';
    const playerFilter = playersInput ? playersInput.value : '';
    const tagFilter = tagInput ? tagInput.value : 'all';

    const filteredGames = games.filter(game => {
        const nameMatch = (game.name || '').toLowerCase().includes(searchTerm);
        
        let timeMatch = true;
        if (timeFilter !== 'all') {
            const d = game.sessionDuration;
            if (timeFilter === '30') timeMatch = d <= 30;
            else if (timeFilter === '60') timeMatch = d <= 60;
            else if (timeFilter === '120') timeMatch = d > 60;
        }

        let playersMatch = true;
        if (playerFilter) {
            playersMatch = game.maxPlayers >= parseInt(playerFilter);
        }

        let tagMatch = true;
        if (tagFilter !== 'all') {
            const gameTags = (game.tags || []).map(t => t.toLowerCase());
            const textContent = JSON.stringify(gameTags) + " " + (game.longDescription || "").toLowerCase();
            tagMatch = textContent.includes(tagFilter);
        }

        return nameMatch && timeMatch && playersMatch && tagMatch;
    });

    renderGames(filteredGames);
};

window.toggleFilterPanel = () => {
    const panel = document.getElementById('filter-panel');
    if (panel) panel.classList.toggle('hidden');
};

window.clearFilters = () => {
    const ids = ['search-input', 'filter-players'];
    ids.forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
    
    const selects = ['filter-time', 'filter-tag'];
    selects.forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = 'all'; });

    applyGameFilters();
};

// =================================================================
// 8. HELPERS
// =================================================================
window.startGame = (gameId) => {
    window.location.href = `jogo-template.html?id=${gameId}`;
};

function inferTagsFromText(name, short, long) {
    const text = ((name || "") + " " + (short || "") + " " + (long || "")).toLowerCase();
    const tags = [];
    if (text.includes('terror') || text.includes('medo')) tags.push('horror');
    if (text.includes('enigma') || text.includes('puzzle') || text.includes('investigação')) tags.push('puzzle');
    if (text.includes('aventura') || text.includes('exploração')) tags.push('adventure');
    if (text.includes('rpg') || text.includes('roleplay')) tags.push('rpg');
    return tags;
}