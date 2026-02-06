// =================================================================
// MAIN.JS - LÓGICA DA HOME, CARROSSEL E LISTAGEM
// =================================================================

// --- Variáveis Globais ---
let games = []; // Armazena todos os jogos carregados
const db = firebase.firestore();

// Variáveis do Carrossel
let slideIndex = 0;
let slideInterval;

// =================================================================
// 1. INICIALIZAÇÃO
// =================================================================
document.addEventListener('DOMContentLoaded', async () => {
    
    // A. Gerencia a Barra de Navegação (Login/Logout)
    firebase.auth().onAuthStateChanged((user) => {
        updateNavbar(user);
    });

    // B. Carrega os Jogos se houver um grid na tela
    if (document.getElementById('games-grid') || document.getElementById('carousel-track')) {
        await loadGames();
    }
});

// =================================================================
// 2. CARREGAMENTO DE DADOS (FIRESTORE)
// =================================================================
async function loadGames() {
    const grid = document.getElementById('games-grid');
    
    // Feedback de carregamento no grid (se existir)
    if (grid) {
        grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:#ff4444; margin-top:50px;">Carregando sistema Playnambuco...</p>';
    }

    try {
        // Busca jogos ordenados por data de criação (mais novos primeiro)
        const snapshot = await db.collection('games').orderBy('createdAt', 'desc').get();

        if (snapshot.empty) {
            if (grid) grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:#aaa;">Nenhum jogo encontrado no banco de dados.</p>';
            return;
        }

        games = []; // Limpa array global

        snapshot.forEach(doc => {
            const data = doc.data();
            // Processa e sanitiza os dados
            games.push({
                id: doc.id,
                ...data,
                // Garante números para filtros matemáticos
                maxPlayers: parseInt(data.maxPlayers) || 0,
                sessionDuration: parseInt(data.sessionDuration) || 0,
                // Garante array de tags (ou infere do texto se estiver vazio)
                tags: (Array.isArray(data.tags) && data.tags.length > 0) 
                      ? data.tags 
                      : inferTagsFromText(data.name, data.shortDescription, data.longDescription)
            });
        });

        console.log(`✅ ${games.length} jogos carregados.`);

        // --- A. POPULA O CARROSSEL (Hero) ---
        setupHeroCarousel(games);

        // --- B. POPULA OS FILTROS DE TAGS ---
        populateDynamicTags(games);

        // --- C. RENDERIZA O GRID ---
        renderGames(games);

    } catch (error) {
        console.error("Erro crítico ao carregar jogos:", error);
        if (grid) grid.innerHTML = '<p style="color:red; text-align:center;">Erro de conexão com o servidor.</p>';
    }
}

// =================================================================
// 3. CARROSSEL DINÂMICO (HERO SECTION)
// =================================================================
function setupHeroCarousel(gamesList) {
    const track = document.getElementById('carousel-track');
    const dotsContainer = document.getElementById('carousel-dots');
    
    // Se não tiver carrossel na página, sai da função
    if (!track) return;

    // Limpa conteúdo anterior
    track.innerHTML = '';
    if (dotsContainer) dotsContainer.innerHTML = '';

    // Pega os 5 primeiros jogos para destaque
    const featuredGames = gamesList.slice(0, 5);

    if (featuredGames.length === 0) {
        track.innerHTML = '<div style="height:100%; display:flex; align-items:center; justify-content:center; color:#888;">Em breve novidades.</div>';
        return;
    }

    // Cria os Slides
    featuredGames.forEach((game, index) => {
        const cover = game.coverImage || 'assets/images/logo.png';
        
        // Slide Element
        const slide = document.createElement('div');
        slide.className = index === 0 ? 'carousel-slide active' : 'carousel-slide';
        // Estilos inline para garantir funcionamento base
        slide.style.cssText = `
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            opacity: ${index === 0 ? '1' : '0'}; transition: opacity 1s ease-in-out;
        `;

slide.innerHTML = `
            <img src="${cover}" alt="${game.name}" style="width: 100%; height: 100%; object-fit: cover;">
            
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.9)); z-index: 1;"></div>

            <div class="carousel-caption" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #fff; width: 80%; z-index: 2;">
                
                <h1 style="font-size: 3rem; margin-bottom: 10px; color: var(--secondary-color, #ff0000); text-transform: uppercase; text-shadow: 2px 2px 10px rgba(0,0,0,0.8);">
                    ${game.name}
                </h1>
                
                <p style="font-size: 1.2rem; margin-bottom: 25px; text-shadow: 1px 1px 3px rgba(0,0,0,0.8); color: #ddd;">
                    ${game.shortDescription || 'Uma experiência Playnambuco.'}
                </p>
                
                <a href="jogo-template.html?id=${game.id}" style="display: inline-block; text-decoration: none; padding: 12px 35px; background: var(--secondary-color, #ff0000); color: #fff; font-weight: bold; border-radius: 50px; cursor: pointer; font-size: 1rem; box-shadow: 0 0 15px rgba(255,0,0,0.4); transition: transform 0.2s;">
                    JOGAR AGORA
                </a>
            </div>
        `;

        track.appendChild(slide);

        // Dot Element (Bolinha)
        if (dotsContainer) {
            const dot = document.createElement('div');
            dot.className = index === 0 ? 'dot active' : 'dot';
            // Estilos inline das bolinhas
            dot.style.cssText = `width: 12px; height: 12px; background: ${index === 0 ? '#ff0000' : 'rgba(255,255,255,0.5)'}; border-radius: 50%; cursor: pointer; transition: all 0.3s;`;
            
            dot.onclick = () => {
                showSlide(index);
                resetAutoSlide();
            };
            dotsContainer.appendChild(dot);
        }
    });

    // Inicia rotação automática
    startAutoSlide();
}

function showSlide(n) {
    const slides = document.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.carousel-dots .dot');

    if (slides.length === 0) return;

    // 1. Remove a classe 'active' de TODOS os slides e bolinhas
    // Isso garante que o z-index e pointer-events sejam resetados
    slides.forEach(slide => {
        slide.classList.remove('active');
        // Removemos estilos inline antigos para garantir que o CSS mande
        slide.style.opacity = ''; 
    });
    
    if(dots) {
        dots.forEach(dot => {
            dot.classList.remove('active');
            dot.style.background = 'rgba(255,255,255,0.5)';
            dot.style.transform = 'scale(1)';
        });
    }

    // 2. Calcula o índice (Loop Infinito)
    slideIndex = n;
    if (slideIndex >= slides.length) slideIndex = 0;
    if (slideIndex < 0) slideIndex = slides.length - 1;

    // 3. Adiciona a classe 'active' APENAS no atual
    if (slides[slideIndex]) {
        slides[slideIndex].classList.add('active');
    }

    if (dots && dots[slideIndex]) {
        dots[slideIndex].classList.add('active');
        dots[slideIndex].style.background = '#ff0000';
        dots[slideIndex].style.transform = 'scale(1.3)';
    }
}

function moveCarousel(n) {
    showSlide(slideIndex + n);
    resetAutoSlide();
}

function startAutoSlide() {
    if (slideInterval) clearInterval(slideInterval);
    slideInterval = setInterval(() => {
        showSlide(slideIndex + 1);
    }, 5000); // 5 segundos
}

function resetAutoSlide() {
    clearInterval(slideInterval);
    startAutoSlide();
}

// =================================================================
// 4. RENDERIZAÇÃO DO GRID (VISUAL RED THEME)
// =================================================================
function renderGames(list) {
    const grid = document.getElementById('games-grid');
    const noResults = document.getElementById('no-results-msg');

    if (!grid) return;
    grid.innerHTML = '';
    
    // Garante que a classe CSS do grid esteja aplicada
    grid.className = 'games-grid';

    // Estado vazio
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
        card.className = 'game-card'; // Usa o CSS "Red Theme" que criamos
        
        if (isPaused) {
            card.style.opacity = '0.5';
            card.style.filter = 'grayscale(100%)';
            card.title = "Em manutenção";
            card.style.cursor = 'not-allowed';
        } else {
            card.style.cursor = 'pointer';
            card.onclick = () => startGame(game.id); // Clica no card todo
        }

        // HTML do Card
        card.innerHTML = `
            <div style="position:relative; overflow:hidden;">
                <img src="${cover}" class="game-card-img" alt="${game.name}">
                ${isPaused ? '<div style="position:absolute; inset:0; background:rgba(0,0,0,0.8); display:flex; align-items:center; justify-content:center; color:#fff; font-weight:bold; letter-spacing:2px;">OFFLINE</div>' : ''}
            </div>

            <div class="game-card-content">
                <h3>${game.name}</h3>
                <p>${game.shortDescription || 'Clique para ver detalhes.'}</p>
                
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
// 5. SISTEMA DE FILTROS & TAGS
// =================================================================

// Popula o select de tags automaticamente lendo os jogos
function populateDynamicTags(gamesList) {
    const select = document.getElementById('filter-tag');
    if (!select) return;

    const uniqueTags = new Set();

    gamesList.forEach(game => {
        if (game.tags && Array.isArray(game.tags)) {
            game.tags.forEach(tag => {
                // Capitaliza (ex: "terror" -> "Terror")
                const formatted = tag.trim().charAt(0).toUpperCase() + tag.trim().slice(1);
                uniqueTags.add(formatted);
            });
        }
    });

    // Mantém a opção "Todas" e adiciona as novas
    select.innerHTML = '<option value="all">Todas as Categorias</option>';
    
    uniqueTags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag.toLowerCase(); // Valor interno minúsculo
        option.innerText = tag;           // Valor visível Capitalizado
        select.appendChild(option);
    });
}

// Aplica os filtros (Search, Time, Players, Tags)
window.applyGameFilters = () => {
    // Referências
    const searchInput = document.getElementById('search-input');
    const timeInput = document.getElementById('filter-time');
    const playersInput = document.getElementById('filter-players');
    const tagInput = document.getElementById('filter-tag');

    // Valores (com proteção contra null)
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const timeFilter = timeInput ? timeInput.value : 'all';
    const playerFilter = playersInput ? playersInput.value : '';
    const tagFilter = tagInput ? tagInput.value : 'all';

    // Filtra array global 'games'
    const filteredGames = games.filter(game => {
        // 1. Nome
        const nameMatch = (game.name || '').toLowerCase().includes(searchTerm);
        
        // 2. Tempo
        let timeMatch = true;
        if (timeFilter !== 'all') {
            const d = game.sessionDuration;
            if (timeFilter === '30') timeMatch = d <= 30;
            else if (timeFilter === '60') timeMatch = d <= 60;
            else if (timeFilter === '120') timeMatch = d > 60;
        }

        // 3. Jogadores (Mostra se o jogo aceita a quantidade digitada)
        let playersMatch = true;
        if (playerFilter) {
            playersMatch = game.maxPlayers >= parseInt(playerFilter);
        }

        // 4. Tags
        let tagMatch = true;
        if (tagFilter !== 'all') {
            const gameTags = (game.tags || []).map(t => t.toLowerCase());
            // Verifica tags OU texto da descrição
            const textContent = JSON.stringify(gameTags) + " " + (game.longDescription || "").toLowerCase();
            tagMatch = textContent.includes(tagFilter);
        }

        return nameMatch && timeMatch && playersMatch && tagMatch;
    });

    renderGames(filteredGames);
};

// Toggle UI
window.toggleFilterPanel = () => {
    const panel = document.getElementById('filter-panel');
    if (panel) panel.classList.toggle('hidden');
};

// Resetar
window.clearFilters = () => {
    const ids = ['search-input', 'filter-players'];
    ids.forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
    
    const selects = ['filter-time', 'filter-tag'];
    selects.forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = 'all'; });

    applyGameFilters();
};

// =================================================================
// 6. NAVEGAÇÃO & UTILITÁRIOS
// =================================================================

// Redireciona para o template do jogo
window.startGame = (gameId) => {
    window.location.href = `jogo-template.html?id=${gameId}`;
};

// Atualiza Navbar
function updateNavbar(user) {
    const navAuth = document.getElementById('nav-auth-links');
    if (!navAuth) return;

    if (user) {
        navAuth.innerHTML = `
            <a href="painel-usuario.html" class="nav-link">Perfil</a>
            <button onclick="logout()" class="btn-login" style="background:transparent; border:1px solid #555; margin-left:10px;">Sair</button>
        `;
    } else {
        navAuth.innerHTML = `
            <a href="login.html" class="nav-link">Login</a>
            <a href="registro.html" class="btn-login">Criar Conta</a>
        `;
    }
}

window.logout = () => {
    firebase.auth().signOut().then(() => window.location.reload());
};

// Auxiliar: Infere tags se não existirem no banco
function inferTagsFromText(name, short, long) {
    const text = ((name || "") + " " + (short || "") + " " + (long || "")).toLowerCase();
    const tags = [];
    if (text.includes('terror') || text.includes('medo')) tags.push('horror');
    if (text.includes('enigma') || text.includes('puzzle') || text.includes('investigação')) tags.push('puzzle');
    if (text.includes('aventura') || text.includes('exploração')) tags.push('adventure');
    if (text.includes('rpg') || text.includes('roleplay')) tags.push('rpg');
    return tags;
}