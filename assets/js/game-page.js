// playu/assets/js/game-page.js

// Sincronização: Recarrega a página se os dados mudarem em outra aba
window.addEventListener('storage', (event) => {
    if (event.key === 'games' || event.key === 'bookings') {
        window.location.reload();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. IDENTIFICAR O JOGO PELA URL (ID ou SLUG) ---
    // Suporta tanto /jogo-template.html?id=123 quanto /jogo/nome-do-jogo
    
    let gameIdentifier = null;
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.has('id')) {
        // Método antigo/direto via ID
        gameIdentifier = urlParams.get('id');
    } else {
        // Método novo: Pega o último pedaço da URL (Slug)
        const pathSegments = window.location.pathname.split('/');
        // Filtra vazios e pega o último segmento
        gameIdentifier = pathSegments.filter(s => s.length > 0).pop();
    }

    // --- 2. BUSCAR DADOS DO JOGO ---
    let allGames = [];
    try {
        // Tenta pegar do cache local primeiro (mais rápido)
        allGames = JSON.parse(localStorage.getItem('games') || '[]');
        
        // Se o cache estiver vazio, tenta buscar via função global (se existir)
        if (allGames.length === 0 && typeof getPublicGames === 'function') {
            allGames = await getPublicGames();
        }
    } catch (e) { 
        console.error("Erro ao carregar jogos:", e); 
    }

    // Busca o jogo comparando ID ou Slug
    const gameData = allGames.find(g => g.id === gameIdentifier || g.slug === gameIdentifier);

    // Referências aos elementos da página
    const detailsContainer = document.getElementById('game-details-container');
    const notFoundContainer = document.getElementById('game-not-found');
    const pausedMessageContainer = document.getElementById('paused-message');
    const bookingSection = document.getElementById('booking-section-wrapper');

    // Se não encontrou o jogo, mostra erro e para
    if (!gameData) {
        if(detailsContainer) detailsContainer.style.display = 'none';
        if(notFoundContainer) notFoundContainer.style.display = 'block';
        return;
    }

    // --- 3. LÓGICA DE PAUSA E DISPONIBILIDADE ---
    // Verifica se existe alguma data com horários no objeto availability
    let hasAvailableDates = false;
    if (gameData.availability && Object.keys(gameData.availability).length > 0) {
        // (Opcional: Aqui você poderia filtrar datas que já passaram)
        hasAvailableDates = true;
    }

    // O jogo está pausado se: estiver marcado como paused OU não tiver datas
    const isPaused = gameData.isPaused || !hasAvailableDates;

    if (isPaused) {
        // Mostra o aviso
        if(pausedMessageContainer) pausedMessageContainer.style.display = 'block';
        // Esconde o calendário
        if(bookingSection) bookingSection.style.display = 'none';
        
        // Se for apenas falta de datas (e não pausa manual), ajusta a mensagem
        if (!hasAvailableDates && !gameData.isPaused) {
            const msgParagraph = pausedMessageContainer.querySelector('p');
            if(msgParagraph) msgParagraph.textContent = "No momento, não há datas disponíveis para este jogo. Por favor, volte mais tarde.";
        }
    }

    // --- 4. RENDERIZAR CONTEÚDO TEXTUAL ---
    document.title = `${gameData.name} - PlayU`;
    document.getElementById('game-title').textContent = gameData.name;
    document.getElementById('game-description').textContent = gameData.fullDescription;
    document.getElementById('session-duration').textContent = gameData.sessionDuration || '60 min';

    // --- 5. RENDERIZAR CARROSSEL DE IMAGENS ---
    if (gameData.galleryImages && gameData.galleryImages.length > 0) {
        const carouselContainer = document.getElementById('carousel-container');
        const track = document.getElementById('game-carousel-track');
        carouselContainer.classList.remove('hidden');

        // Limpa o track antes de adicionar (caso haja lixo)
        track.innerHTML = '';

        gameData.galleryImages.forEach(src => {
            const slide = document.createElement('div');
            slide.className = 'game-carousel-slide';
            const img = document.createElement('img');
            img.src = src;
            slide.appendChild(img);
            track.appendChild(slide);
        });

        // Controles do Carrossel
        let currentSlide = 0;
        const slides = track.children;
        const totalSlides = slides.length;

        function updateCarousel() {
            track.style.transform = `translateX(-${currentSlide * 100}%)`;
        }

        const nextBtn = document.getElementById('btn-next-photo');
        const prevBtn = document.getElementById('btn-prev-photo');

        if(nextBtn) nextBtn.addEventListener('click', () => {
            currentSlide = (currentSlide + 1) % totalSlides;
            updateCarousel();
        });

        if(prevBtn) prevBtn.addEventListener('click', () => {
            currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
            updateCarousel();
        });
    }

    // --- 6. RENDERIZAR TRAILER ---
    if (gameData.videoPreview && gameData.videoPreview.trim() !== "") {
        const trailerSection = document.getElementById('game-trailer-section');
        const trailerWrapper = document.getElementById('trailer-embed-wrapper');
        trailerSection.classList.remove('hidden');

        // Ajusta URL do YouTube para formato Embed se necessário
        let videoUrl = gameData.videoPreview;
        if (videoUrl.includes('watch?v=')) {
            videoUrl = videoUrl.replace('watch?v=', 'embed/');
        } else if (videoUrl.includes('youtu.be/')) {
            videoUrl = videoUrl.replace('youtu.be/', 'youtube.com/embed/');
        }

        trailerWrapper.innerHTML = `
            <iframe src="${videoUrl}" title="Trailer do Jogo" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        `;
    }

    // --- 7. INICIAR CALENDÁRIO (Se não estiver pausado) ---
    if (!isPaused) {
        initCalendar(gameData);
    }
});

// --- FUNÇÃO DO CALENDÁRIO ---
function initCalendar(gameData) {
    const monthYearHeader = document.getElementById('month-year-header');
    const calendarGrid = document.getElementById('calendar-grid');
    const timeSlotsContainer = document.getElementById('time-slots-container');
    const instructionText = document.getElementById('instruction-text');
    const confirmationSection = document.getElementById('confirmation-section');
    const confirmBtn = document.getElementById('confirm-booking-btn');
    
    let currentDate = new Date();
    currentDate.setDate(1); // Sempre começa no dia 1 para renderizar o mês
    
    let selectedDateStr = null;
    let selectedTimeStr = null;

    function render() {
        calendarGrid.innerHTML = '';
        const month = currentDate.getMonth();
        const year = currentDate.getFullYear();

        monthYearHeader.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentDate);

        // Dia da semana que o mês começa (0 = Dom, 1 = Seg...)
        const firstDayIndex = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Preenche espaços vazios antes do dia 1
        for (let i = 0; i < firstDayIndex; i++) {
            calendarGrid.innerHTML += `<div></div>`;
        }

        // Renderiza os dias
        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            dayEl.textContent = day;
            dayEl.className = 'calendar-day';
            
            // Formata a data como YYYY-MM-DD para buscar no objeto availability
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Verifica se há horários disponíveis neste dia
            if (gameData.availability && gameData.availability[dateStr] && gameData.availability[dateStr].length > 0) {
                dayEl.classList.add('available');
                dayEl.onclick = () => selectDate(dateStr, gameData.availability[dateStr], dayEl);
            }

            calendarGrid.appendChild(dayEl);
        }
    }

    function selectDate(dateStr, times, element) {
        // Remove seleção visual anterior
        document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        
        selectedDateStr = dateStr;
        selectedTimeStr = null; // Reseta horário ao trocar de dia

        // Renderiza a lista de horários
        timeSlotsContainer.innerHTML = '';
        instructionText.textContent = `Horários disponíveis para ${dateStr.split('-').reverse().join('/')}:`;
        
        times.forEach(time => {
            const btn = document.createElement('button');
            btn.className = 'time-slot-btn';
            btn.textContent = time;
            btn.onclick = () => selectTime(dateStr, time, btn);
            timeSlotsContainer.appendChild(btn);
        });
        
        confirmationSection.style.display = 'none';
    }

    function selectTime(date, time, btnElement) {
        document.querySelectorAll('.time-slot-btn.selected').forEach(el => el.classList.remove('selected'));
        btnElement.classList.add('selected');
        
        selectedTimeStr = time;
        
        confirmationSection.style.display = 'block';
        document.getElementById('selection-summary').innerHTML = `Você escolheu: <br><strong>${date.split('-').reverse().join('/')} às ${time}</strong>`;
    }

    // --- LÓGICA DO BOTÃO CONFIRMAR (Verificação de Login) ---
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            // 1. Verifica se selecionou data e hora
            if (!selectedDateStr || !selectedTimeStr) {
                alert("Por favor, selecione um dia e um horário.");
                return;
            }

            // 2. Verifica se o usuário está logado
            const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
            
            if (!loggedInUser) {
                // Salva a intenção do usuário para redirecionar depois (opcional, mas boa UX)
                sessionStorage.setItem('redirectAfterLogin', window.location.href);
                
                alert("Você precisa fazer login ou criar uma conta para finalizar o agendamento.");
                window.location.href = 'login.html';
                return;
            }

            // 3. Se logado, prossegue (Aqui entraria a integração real com o Firebase para salvar o booking)
            alert(`Agendamento confirmado para ${selectedDateStr} às ${selectedTimeStr}!\n(Simulação)`);
            
            // Em um cenário real: db.collection('bookings').add({...})
            // window.location.href = 'dashboard.html';
        };
    }

    // Controles de navegação do calendário
    document.getElementById('prev-month-btn').onclick = () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        render();
    };
    document.getElementById('next-month-btn').onclick = () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        render();
    };

    // Renderiza o calendário inicialmente
    render();
}