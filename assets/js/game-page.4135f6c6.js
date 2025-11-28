document.addEventListener('DOMContentLoaded', async () => {
    // Garante que o Firebase está carregado
    const db = window.db || firebase.firestore();

    // --- 1. IDENTIFICAR O JOGO (ID ou SLUG) ---
    let gameIdentifier = null;
    let isSlug = false;
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.has('id')) {
        gameIdentifier = urlParams.get('id');
    } else {
        const pathSegments = window.location.pathname.split('/');
        gameIdentifier = pathSegments.filter(s => s.length > 0).pop();
        // Se não tiver ".html", assumimos que é um slug limpo
        if (gameIdentifier && !gameIdentifier.includes('.html')) isSlug = true;
    }

    if (!gameIdentifier) return; // Se não achou nada, não faz nada (ou redireciona)

    // --- 2. CONFIGURAR LISTENER EM TEMPO REAL ---
    let unsubscribe;

    // Função que recebe os dados atualizados e redesenha a tela
    const handleGameUpdate = (doc) => {
        if (!doc.exists) {
            showNotFound();
            return;
        }
        const gameData = { id: doc.id, ...doc.data() };
        renderGamePage(gameData);
    };

    if (isSlug) {
        // Se for Slug, precisamos fazer uma query primeiro
        // Nota: onSnapshot em query retorna um conjunto de documentos
        unsubscribe = db.collection('games')
            .where('slug', '==', gameIdentifier)
            .limit(1)
            .onSnapshot(snapshot => {
                if (!snapshot.empty) {
                    handleGameUpdate(snapshot.docs[0]);
                } else {
                    showNotFound();
                }
            }, error => console.error("Erro realtime:", error));
    } else {
        // Se for ID, ouve o documento direto
        unsubscribe = db.collection('games')
            .doc(gameIdentifier)
            .onSnapshot(handleGameUpdate, error => console.error("Erro realtime:", error));
    }

    function showNotFound() {
        document.getElementById('game-details-container').style.display = 'none';
        document.getElementById('game-hero').style.display = 'none';
        document.getElementById('game-not-found').classList.remove('hidden');
    }

    // --- 3. RENDERIZAÇÃO DA PÁGINA ---
    function renderGamePage(gameData) {
        // Elementos
        const detailsContainer = document.getElementById('game-details-container');
        const notFoundContainer = document.getElementById('game-not-found');
        const blockedOverlay = document.getElementById('booking-blocked-overlay');

        // Mostra containers
        detailsContainer.style.display = 'block';
        document.getElementById('game-hero').style.display = 'block';
        notFoundContainer.classList.add('hidden');

        // Preenche Textos
        document.title = `${gameData.name} - PlayU`;
        document.getElementById('game-title').textContent = gameData.name;
        document.getElementById('game-description').textContent = gameData.fullDescription;
        document.getElementById('session-duration').textContent = gameData.sessionDuration || '60 min';
        
        // Capa
        const coverImg = document.getElementById('game-cover-image');
        if (coverImg) coverImg.src = gameData.coverImage || 'assets/images/logo.png';

        // Tags
        const tagsContainer = document.getElementById('game-genre-tags');
        if (tagsContainer && gameData.tags) {
            tagsContainer.innerHTML = gameData.tags.map(tag => 
                `<span style="background:var(--primary-color-dark); padding:2px 8px; border-radius:4px; font-size:0.9rem; border:1px solid var(--border-color)">${tag}</span>`
            ).join(' ');
        }

        // Carrossel (Só cria se tiver imagens e se o container estiver vazio para evitar flash)
        const track = document.getElementById('game-carousel-track');
        if (gameData.galleryImages && gameData.galleryImages.length > 0 && track.children.length === 0) {
            document.getElementById('carousel-section').classList.remove('hidden');
            document.getElementById('carousel-container').classList.remove('hidden');
            
            gameData.galleryImages.forEach(src => {
                const slide = document.createElement('div');
                slide.className = 'game-carousel-slide';
                slide.innerHTML = `<img src="${src}">`;
                track.appendChild(slide);
            });
        }

        // Trailer
        const trailerWrapper = document.getElementById('trailer-embed-wrapper');
        if (gameData.videoPreview && gameData.videoPreview.trim() !== "") {
            document.getElementById('game-trailer-section').classList.remove('hidden');
            
            let videoUrl = gameData.videoPreview;
            if (videoUrl.includes('watch?v=')) videoUrl = videoUrl.replace('watch?v=', 'embed/');
            else if (videoUrl.includes('youtu.be/')) videoUrl = videoUrl.replace('youtu.be/', 'youtube.com/embed/');
            
            // Só atualiza se mudou (para não recarregar iframe a toa)
            if (!trailerWrapper.innerHTML.includes(videoUrl)) {
                trailerWrapper.innerHTML = `<iframe src="${videoUrl}" title="Trailer" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
            }
        }

        // --- LÓGICA DE CALENDÁRIO ---
        let hasAvailableDates = false;
        if (gameData.availability && Object.keys(gameData.availability).length > 0) {
            hasAvailableDates = true;
        }

        const isPaused = gameData.isPaused || !hasAvailableDates;

        // Atualiza os dados do calendário global e re-renderiza
        updateCalendarData(gameData);

        if (isPaused) {
            blockedOverlay.classList.remove('hidden');
            const p = blockedOverlay.querySelector('p');
            if(gameData.isPaused) p.textContent = "Este jogo está temporariamente pausado pelo administrador.";
            else p.textContent = "No momento, não há datas disponíveis para agendamento. O calendário será atualizado assim que novas datas forem liberadas.";
        } else {
            blockedOverlay.classList.add('hidden');
        }
    }

    // --- VARIÁVEIS GLOBAIS DE UI ---
    
    // Carrossel
    let currentSlide = 0;
    const btnNext = document.getElementById('btn-next-photo');
    const btnPrev = document.getElementById('btn-prev-photo');
    
    if(btnNext) btnNext.addEventListener('click', () => {
        const track = document.getElementById('game-carousel-track');
        const total = track.children.length;
        if(total > 0) {
            currentSlide = (currentSlide + 1) % total;
            track.style.transform = `translateX(-${currentSlide * 100}%)`;
        }
    });
    
    if(btnPrev) btnPrev.addEventListener('click', () => {
        const track = document.getElementById('game-carousel-track');
        const total = track.children.length;
        if(total > 0) {
            currentSlide = (currentSlide - 1 + total) % total;
            track.style.transform = `translateX(-${currentSlide * 100}%)`;
        }
    });

    // --- LÓGICA DO CALENDÁRIO ---
    let calendarDate = new Date();
    calendarDate.setDate(1);
    let cachedGameData = null; // Guarda os dados mais recentes recebidos do snapshot

    function updateCalendarData(newData) {
        cachedGameData = newData;
        renderCalendar();
    }

    function renderCalendar() {
        if (!cachedGameData) return;
        
        const calendarGrid = document.getElementById('calendar-grid');
        const monthYearHeader = document.getElementById('month-year-header');
        
        calendarGrid.innerHTML = '';
        monthYearHeader.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calendarDate);

        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const firstDayIndex = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Espaços vazios
        for (let i = 0; i < firstDayIndex; i++) {
            calendarGrid.innerHTML += `<div></div>`;
        }

        // Dias
        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            dayEl.textContent = day;
            dayEl.className = 'calendar-day';
            
            // Formata data YYYY-MM-DD para bater com o banco
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Verifica disponibilidade
            if (cachedGameData.availability && cachedGameData.availability[dateStr] && cachedGameData.availability[dateStr].length > 0) {
                dayEl.classList.add('available');
                dayEl.onclick = () => selectDate(dateStr, cachedGameData.availability[dateStr], dayEl);
            }
            calendarGrid.appendChild(dayEl);
        }
    }

    let selectedDateStr = null;
    let selectedTimeStr = null;

    function selectDate(dateStr, times, element) {
        document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
        element.classList.add('selected');
        
        selectedDateStr = dateStr;
        selectedTimeStr = null;

        const timeContainer = document.getElementById('time-slots-container');
        const instructionText = document.getElementById('instruction-text');
        const confirmSection = document.getElementById('confirmation-section');

        timeContainer.innerHTML = '';
        instructionText.textContent = `Horários para ${dateStr.split('-').reverse().join('/')}:`;
        confirmSection.classList.add('hidden');

        times.sort().forEach(time => {
            const btn = document.createElement('button');
            btn.className = 'time-slot-btn';
            btn.textContent = time;
            btn.onclick = () => {
                document.querySelectorAll('.time-slot-btn.selected').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                selectedTimeStr = time;
                confirmSection.classList.remove('hidden');
                document.getElementById('selection-summary').innerHTML = `<strong>${dateStr.split('-').reverse().join('/')}</strong> às <strong>${time}</strong>`;
            };
            timeContainer.appendChild(btn);
        });
    }

    document.getElementById('prev-month-btn').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar();
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar();
    });

// --- LÓGICA DO BOTÃO CONFIRMAR (Redireciona para Pagamento) ---
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            // 1. Verifica se selecionou data e hora
            if (!selectedDateStr || !selectedTimeStr) {
                alert("Por favor, selecione um dia e um horário.");
                return;
            }

            // 2. Salva os dados do agendamento temporariamente
            const pendingBooking = {
                gameId: cachedGameData.id,
                gameName: cachedGameData.name,
                coverImage: cachedGameData.coverImage,
                date: selectedDateStr,
                time: selectedTimeStr,
                price: "R$ 60,00" // Preço fixo por enquanto, ou pegue do gameData se tiver
            };
            sessionStorage.setItem('pendingBooking', JSON.stringify(pendingBooking));

            // 3. Verifica Login
            const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
            
            if (!loggedInUser) {
                // Configura para voltar para a tela de pagamento após o login
                sessionStorage.setItem('redirectAfterLogin', 'pagamento.html');
                
                // Redireciona para login
                window.location.href = 'login.html';
            } else {
                // Já logado? Vai direto para pagamento
                window.location.href = 'pagamento.html';
            }
        };
    }
});