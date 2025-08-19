/* ==================================================================
   ARQUIVO JAVASCRIPT PRINCIPAL - play.u LIVE ENTERTAINMENT
   Página Pública (index.html)
   ================================================================== */

// --- LÓGICA GLOBAL DE UI (TEMA E 'VOLTAR AO TOPO') ---
const themeToggle = document.getElementById('theme-toggle');
const htmlElement = document.documentElement;

function applyTheme(theme) {
    htmlElement.setAttribute('data-theme', theme);
    if (themeToggle) {
        themeToggle.setAttribute('name', theme === 'light' ? 'moon-outline' : 'sunny-outline');
    }
    localStorage.setItem('theme', theme);
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const currentTheme = htmlElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    });
}

const savedTheme = localStorage.getItem('theme') || 'dark';
applyTheme(savedTheme);

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

// --- LÓGICA PRINCIPAL DA PÁGINA (Executada após o carregamento do HTML) ---
document.addEventListener('DOMContentLoaded', () => {
    // Garante que o script só execute na página de início
    const indexPageContainer = document.getElementById('jogos');
    if (!indexPageContainer) return;

    // --- SINCRONIZAÇÃO AUTOMÁTICA ---
    window.addEventListener('storage', (event) => {
        if (event.key === 'games' || event.key === 'bookings') {
            populateContent();
        }
    });

    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    function createGameCard(game) {
        const isPausedClass = game.isPaused ? 'game-card--paused' : '';
        const pausedOverlay = game.isPaused ? `<div class="paused-overlay"><span data-lang-key="paused">Pausado</span></div>` : '';

        return `
            <a href="jogo-template.html?id=${game.id}" class="game-card ${isPausedClass}">
                ${pausedOverlay}
                <img src="${game.coverImage}" alt="Capa do Jogo ${game.name}" class="game-card__image">
                <div class="game-card__overlay">
                    <h3 class="game-card__title">${game.name}</h3>
                    <p class="game-card__cta" data-lang-key="seeMore">Ver Mais</p>
                </div>
                <video class="video-preview" src="${game.videoPreview}" muted loop playsinline></video>
            </a>
        `;
    }

    function createCarouselSlide(game) {
        const isPausedClass = game.isPaused ? 'game-card--paused' : '';
        return `
            <a href="jogo-template.html?id=${game.id}" class="carousel-slide ${isPausedClass}">
                <img src="${game.coverImage}" alt="Imagem do Jogo ${game.name}">
                <div class="slide-info"><h3>${game.name}</h3></div>
            </a>
        `;
    }

    function populateContent() {
        const games = getGames().filter(g => g.status === 'approved');

        const gamesGrid = document.querySelector('#jogos .games-grid');
        if (gamesGrid) {
            gamesGrid.innerHTML = games.map(createGameCard).join('');
        }
        
        const carouselContainer = document.querySelector('#home .carousel-container');
        if (carouselContainer) {
            carouselContainer.innerHTML = games.map(createCarouselSlide).join('');
        }
        
        initCarousel();
        initGameCardHover();
        
        const currentLang = localStorage.getItem('language') || 'pt';
        if (typeof setLanguage === 'function') setLanguage(currentLang);
    }
    
    // --- FUNÇÕES DE INICIALIZAÇÃO DE COMPONENTES ---
    function initCarousel() {
        const homeCarousel = document.querySelector('.home-carousel');
        const carouselContainer = document.querySelector('#home .carousel-container');
        if (!homeCarousel || !carouselContainer) return;

        const slidesArray = Array.from(carouselContainer.children);
        if (slidesArray.length === 0) return;

        for (let i = slidesArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [slidesArray[i], slidesArray[j]] = [slidesArray[j], slidesArray[i]];
        }
        slidesArray.forEach(slide => carouselContainer.appendChild(slide));
        
        const viewport = document.querySelector('.carousel-viewport');
        const slides = carouselContainer.querySelectorAll('.carousel-slide');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        let currentIndex = 0;
        let isDown = false;
        let startX;
        let scrollLeft;

        viewport.addEventListener('mousedown', (e) => {
            isDown = true;
            viewport.classList.add('grabbing');
            startX = e.pageX - viewport.offsetLeft;
            scrollLeft = viewport.scrollLeft;
        });
        viewport.addEventListener('mouseleave', () => { isDown = false; viewport.classList.remove('grabbing'); });
        viewport.addEventListener('mouseup', () => { isDown = false; viewport.classList.remove('grabbing'); });
        viewport.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - viewport.offsetLeft;
            const walk = (x - startX) * 2;
            viewport.scrollLeft = scrollLeft - walk;
        });

        function snapToSlide() {
            if (slides.length === 0) return;
            const slideWidth = slides[0].offsetWidth;
            const currentScroll = viewport.scrollLeft;
            currentIndex = Math.round(currentScroll / slideWidth);
            if (currentIndex >= slides.length) currentIndex = slides.length - 1;
            updateCarousel(true);
        }
        viewport.addEventListener('scrollend', snapToSlide);
        
        function updateCarousel(smooth = false) {
            if (slides.length === 0) return;
            const slideWidth = slides[0].offsetWidth;
            const targetScroll = slideWidth * currentIndex;
            viewport.scrollTo({ left: targetScroll, behavior: smooth ? 'smooth' : 'instant' });
            slides.forEach((slide, index) => slide.classList.toggle('active', index === currentIndex));
        }

        nextBtn.addEventListener('click', () => {
            if (slides.length === 0) return;
            currentIndex = (currentIndex + 1) % slides.length;
            updateCarousel(true);
        });
        prevBtn.addEventListener('click', () => {
            if (slides.length === 0) return;
            currentIndex = (currentIndex - 1 + slides.length) % slides.length;
            updateCarousel(true);
        });
        
        window.addEventListener('resize', () => updateCarousel(false));
        updateCarousel(false);
    }

    function initGameCardHover() {
        const gamesGrid = document.querySelector('#jogos .games-grid');
        if (!gamesGrid) return;

        const gameCards = gamesGrid.querySelectorAll('.game-card');
        let hoverTimeout;

        gameCards.forEach(card => {
            const videoPreview = card.querySelector('.video-preview');
            card.addEventListener('mouseenter', () => {
                hoverTimeout = setTimeout(() => {
                    if (videoPreview) {
                        videoPreview.style.display = 'block';
                        videoPreview.play();
                    }
                }, 15000);
            });
            card.addEventListener('mouseleave', () => {
                clearTimeout(hoverTimeout);
                if (videoPreview) {
                    videoPreview.style.display = 'none';
                    videoPreview.pause();
                    videoPreview.currentTime = 0;
                }
            });
        });
    }
    
    // --- LÓGICA DOS BOTÕES DE ATALHO DO HEADER (VERSÃO DE TESTE) ---
    const joinPlayerBtn = document.getElementById('header-join-player-btn');
    const joinHostBtn = document.getElementById('header-join-host-btn');

    function createTestSessionAndJoin(viewMode) {
    const allGames = getGames();
    if (!allGames || allGames.length === 0) {
        alert('Nenhum jogo disponível para criar uma sala de teste.');
        return;
    }
    const testGame = allGames[0]; // Pega o primeiro jogo da lista para o teste

    // Cria uma data e hora para o momento atual
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // Formato "YYYY-MM-DD"
    const timeStr = now.toTimeString().substring(0, 5); // Formato "HH:MM"

    // A variável é CRIADA aqui, antes de ser usada
    const testBooking = {
        bookingId: `test_${Date.now()}`, // ID único de teste
        gameId: testGame.id,
        gameName: testGame.name,
        date: dateStr,
        time: timeStr,
        bookedBy: 'TestUser'
    };

    // Salva o agendamento temporário para que a página da sala possa encontrá-lo
    const allBookings = getBookings();
    allBookings.push(testBooking);
    saveBookings(allBookings);

    // Redireciona para a sala com o modo de visão correto
    // A variável é USADA aqui, depois de já ter sido criada.
    window.location.href = `sala.html?bookingId=${testBooking.bookingId}&view=${viewMode}`;
}

    if (joinPlayerBtn) {
        joinPlayerBtn.addEventListener('click', () => {
            createTestSessionAndJoin('player');
        });
    }

    if (joinHostBtn) {
        joinHostBtn.addEventListener('click', () => {
            createTestSessionAndJoin('host');
        });
    }

    // --- CARGA INICIAL ---
    populateContent();
});