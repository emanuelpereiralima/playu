/* ==================================================================
   ARQUIVO JAVASCRIPT PRINCIPAL - play.u LIVE ENTERTAINMENT
   ================================================================== */

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


/* ==================== LÓGICA DA PÁGINA PRINCIPAL (INDEX.HTML) ==================== */
// Executa tudo depois que o conteúdo HTML da página foi totalmente carregado
document.addEventListener('DOMContentLoaded', () => {

    // Verifica se estamos na página principal, que contém a seção de jogos
    const isIndexPage = document.getElementById('jogos');
    if (!isIndexPage) return; // Se não for a página principal, não executa o resto

    /* --- FUNÇÕES AUXILIARES PARA GERAR HTML --- */

    // Função para gerar um card de jogo para a grade
    function createGameCard(game) {
        return `
            <a href="jogo-template.html?id=${game.id}" class="game-card">
                <img src="${game.coverImage}" alt="Capa do Jogo ${game.name}" class="game-card__image">
                <div class="game-card__overlay">
                    <h3 class="game-card__title">${game.name}</h3>
                    <p class="game-card__cta" data-lang-key="seeMore">Ver Mais</p>
                </div>
                <video class="video-preview" src="${game.videoPreview}" muted loop playsinline></video>
            </a>
        `;
    }

    // Função para gerar um slide do carrossel
    function createCarouselSlide(game) {
        return `
            <a href="jogo-template.html?id=${game.id}" class="carousel-slide">
                <img src="${game.coverImage}" alt="Imagem do Jogo ${game.name}">
                <div class="slide-info"><h3>${game.name}</h3></div>
            </a>
        `;
    }

    /* --- PREENCHIMENTO DINÂMICO DO CONTEÚDO --- */

    // 1. Preencher a grade de jogos na seção #jogos
    const gamesGrid = document.querySelector('#jogos .games-grid');
    if (gamesGrid) {
        gamesGrid.innerHTML = GAMES_DATA.map(game => createGameCard(game)).join('');
    }

    // 2. Preencher o carrossel na seção #home
    const carouselContainer = document.querySelector('#home .carousel-container');
    if (carouselContainer) {
        carouselContainer.innerHTML = GAMES_DATA.map(game => createCarouselSlide(game)).join('');
    }


    /* --- INICIALIZAÇÃO DAS FUNCIONALIDADES INTERATIVAS --- */

    // 3. Lógica do Carrossel
    const homeCarousel = document.querySelector('.home-carousel');
    if (homeCarousel && carouselContainer) {
        // Embaralhar os slides
        const slidesArray = Array.from(carouselContainer.children);
        for (let i = slidesArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [slidesArray[i], slidesArray[j]] = [slidesArray[j], slidesArray[i]];
        }
        slidesArray.forEach(slide => carouselContainer.appendChild(slide));

        // Seleciona os elementos do carrossel (agora na ordem aleatória)
        const slides = carouselContainer.querySelectorAll('.carousel-slide');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        let currentIndex = 0;

        function updateCarousel() {
            const viewportWidth = document.querySelector('.carousel-viewport').offsetWidth;
            const slideWidth = slides[0].offsetWidth;
            const slideMargin = parseInt(window.getComputedStyle(slides[0]).marginRight) * 2;
            const offset = (viewportWidth / 2) - (slideWidth / 2) - (currentIndex * (slideWidth + slideMargin));
            carouselContainer.style.transform = `translateX(${offset}px)`;
            slides.forEach((slide, index) => {
                slide.classList.toggle('active', index === currentIndex);
            });
        }

        nextBtn.addEventListener('click', () => {
            currentIndex = (currentIndex + 1) % slides.length;
            updateCarousel();
        });

        prevBtn.addEventListener('click', () => {
            currentIndex = (currentIndex - 1 + slides.length) % slides.length;
            updateCarousel();
        });
        
        window.addEventListener('resize', updateCarousel);
        updateCarousel(); // Inicia o carrossel na posição correta
    }

    // 4. Lógica do hover com vídeo na grade de jogos
    if (gamesGrid) {
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
                }, 15000); // 15 segundos
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

    // Força a atualização do idioma para os textos criados dinamicamente
    const savedLang = localStorage.getItem('language') || 'pt';
    if(typeof setLanguage === 'function') {
        setLanguage(savedLang);
    }
});