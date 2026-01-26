document.addEventListener('DOMContentLoaded', async () => {
    console.log("🎮 Game Page Manager Iniciado...");

    // 1. PEGAR ID DA URL
    const params = new URLSearchParams(window.location.search);
    // Tenta pegar 'id' (padrão novo) ou usa o slug se for o caso
    const gameId = params.get('id');

    if (!gameId) {
        // Se não tiver ID, esconde tudo e mostra erro (opcional)
        document.getElementById('game-details-container').classList.add('hidden');
        document.getElementById('game-not-found').classList.remove('hidden');
        return;
    }

    // Configuração Firebase (garantindo que existe)
    if (typeof firebase === 'undefined') {
        console.error("Firebase não carregado.");
        return;
    }
    const db = firebase.firestore();
    const auth = firebase.auth();

    // Referências do DOM (Baseado no seu jogo-template.html)
    const dom = {
        title: document.getElementById('game-title'),
        cover: document.getElementById('game-cover-image'),
        duration: document.getElementById('session-duration'),
        tags: document.getElementById('game-genre-tags'),
        desc: document.getElementById('game-description'),
        
        // Seções de Mídia
        carouselSection: document.getElementById('carousel-section'),
        carouselTrack: document.getElementById('game-carousel-track'),
        trailerSection: document.getElementById('game-trailer-section'),
        trailerWrapper: document.getElementById('trailer-embed-wrapper'),

        // Calendário
        monthDisplay: document.getElementById('calendar-month-display'),
        calendarGrid: document.getElementById('calendar-grid'),
        prevMonthBtn: document.getElementById('prev-month-btn'),
        nextMonthBtn: document.getElementById('next-month-btn'),
        pausedOverlay: document.getElementById('calendar-overlay'),

        // Horários
        timeContainer: document.getElementById('time-selection-container'),
        timeGrid: document.getElementById('time-slots-grid'),
        dateDisplay: document.getElementById('selected-date-display')
    };

    // Estado Local
    let gameData = null;
    let currentDate = new Date();
    let selectedDateStr = null;

    // =================================================================
    // 2. CARREGAR DADOS DO JOGO
    // =================================================================
    try {
        // Tenta buscar pelo ID do documento
        let doc = await db.collection('games').doc(gameId).get();
        
        // Se não achar por ID, tenta buscar por slug (caso o link use slug)
        if (!doc.exists) {
            const slugSnap = await db.collection('games').where('slug', '==', gameId).limit(1).get();
            if (!slugSnap.empty) {
                doc = slugSnap.docs[0];
            } else {
                throw new Error("Jogo não encontrado");
            }
        }

        gameData = { id: doc.id, ...doc.data() };
        console.log("✅ Jogo carregado:", gameData.name);

        renderGameDetails();
        renderCalendar();

    } catch (e) {
        console.error("Erro:", e);
        document.getElementById('game-details-container').classList.add('hidden');
        document.getElementById('game-not-found').classList.remove('hidden');
    }

    // =================================================================
    // 3. RENDERIZAR DETALHES VISUAIS
    // =================================================================
    function renderGameDetails() {
        document.title = `${gameData.name} | PlayU`;
        
        // Textos Básicos
        if(dom.title) dom.title.textContent = gameData.name;
        if(dom.cover) dom.cover.src = gameData.coverImage || '/assets/images/logo.png';
        if(dom.duration) dom.duration.textContent = gameData.sessionDuration ? `${gameData.sessionDuration} min` : 'N/A';
        if(dom.desc) dom.desc.textContent = gameData.fullDescription || gameData.shortDescription || '';
        
        // Tags
        if(dom.tags && gameData.tags) {
            dom.tags.textContent = Array.isArray(gameData.tags) ? gameData.tags.join(' • ') : gameData.tags;
        }

        // Galeria (Carrossel)
        if (gameData.galleryImages && gameData.galleryImages.length > 0) {
            dom.carouselSection.classList.remove('hidden');
            dom.carouselTrack.innerHTML = gameData.galleryImages.map(url => 
                `<img src="${url}" class="game-carousel-img" onclick="window.open(this.src)">`
            ).join('');
        }

        // Trailer
        if (gameData.videoPreview) {
            dom.trailerSection.classList.remove('hidden');
            // Tenta converter link do youtube se necessário, ou usa video tag
            if(gameData.videoPreview.includes('youtube') || gameData.videoPreview.includes('youtu.be')) {
                // Lógica simples de embed youtube seria necessária aqui
                dom.trailerWrapper.innerHTML = `<p>Trailer disponível no link: <a href="${gameData.videoPreview}" target="_blank">Assistir</a></p>`;
            } else {
                dom.trailerWrapper.innerHTML = `<video src="${gameData.videoPreview}" controls style="width:100%; border-radius:8px;"></video>`;
            }
        }

        // Verifica se jogo está pausado
        if (gameData.status === 'paused' || gameData.isPaused) {
            dom.pausedOverlay.classList.remove('hidden');
            dom.calendarGrid.style.opacity = '0.3';
            dom.calendarGrid.style.pointerEvents = 'none';
        }
    }

    // =================================================================
    // 4. RENDERIZAR CALENDÁRIO
    // =================================================================
    function renderCalendar() {
        if(!dom.calendarGrid) return;
        
        dom.calendarGrid.innerHTML = '';
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();

        // Atualiza título do mês
        dom.monthDisplay.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentDate);

        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const todayStr = new Date().toISOString().split('T')[0];

        // Dias vazios antes do dia 1
        for(let i=0; i<firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-day empty';
            dom.calendarGrid.appendChild(empty);
        }

        // Dias do mês
        for(let d=1; d<=daysInMonth; d++) {
            const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const el = document.createElement('div');
            el.className = 'calendar-day';
            el.textContent = d;

            // Lógica de Disponibilidade do Admin
            const adminSlots = gameData.availability ? gameData.availability[dateStr] : [];
            const hasAdminSlots = adminSlots && adminSlots.length > 0;
            const isPast = dateStr < todayStr;

            if (isPast) {
                el.classList.add('disabled');
            } else if (hasAdminSlots) {
                el.classList.add('available');
                el.onclick = () => selectDate(dateStr, el);
            } else {
                el.classList.add('disabled');
            }

            // Marca visualmente se for a data selecionada
            if(selectedDateStr === dateStr) {
                el.classList.add('selected');
            }

            dom.calendarGrid.appendChild(el);
        }
    }

    // =================================================================
    // 5. SELECIONAR DATA (CALENDÁRIO COM VAGAS)
    // =================================================================
    async function selectDate(dateStr, el) {
        // UI Visual
        document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
        el.classList.add('selected');
        
        selectedDateStr = dateStr;
        
        // Formata Data
        const dateParts = dateStr.split('-');
        if(dom.dateDisplay) dom.dateDisplay.textContent = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        
        dom.timeContainer.classList.remove('hidden');
        dom.timeGrid.innerHTML = '<div class="loader-small"></div>';

        try {
            // 1. Horários definidos pelo Admin
            const adminSlots = gameData.availability ? (gameData.availability[dateStr] || []) : [];

            // 2. Buscar Agendamentos Confirmados no dia
            const bookingsSnap = await db.collection('bookings')
                .where('gameId', '==', gameData.id)
                .where('date', '==', dateStr)
                .get();

            // 3. Contagem de Vagas Ocupadas
            const slotsCount = {}; // Ex: { "14:00": 2, "15:00": 1 }
            
            bookingsSnap.forEach(doc => {
                const b = doc.data();
                if (b.status !== 'cancelled') {
                    // Soma +1 para esse horário
                    slotsCount[b.time] = (slotsCount[b.time] || 0) + 1;
                }
            });

            // 4. Limite do Jogo (Padrão 1 se não definido)
            const limit = gameData.maxPlayers || 1;

            // 5. Filtrar Horários Disponíveis
            // Mostra se: (Contagem Atual < Limite)
            const finalSlots = adminSlots.filter(time => {
                const currentOccupied = slotsCount[time] || 0;
                return currentOccupied < limit;
            });
            
            // 6. Renderizar
            dom.timeGrid.innerHTML = '';

            if (finalSlots.length === 0) {
                dom.timeGrid.innerHTML = '<p style="color:#ff4444; font-size:0.9rem;">Todos os horários estão cheios.</p>';
                return;
            }

            finalSlots.sort().forEach(time => {
                const currentOccupied = slotsCount[time] || 0;
                const vagasRestantes = limit - currentOccupied;

                const btn = document.createElement('button');
                btn.className = 'time-slot-btn'; // Use sua classe CSS padrão
                
                // Texto do botão com contador de vagas (opcional, mas útil)
                if (limit > 1) {
                    btn.innerHTML = `${time} <span style="font-size:0.7rem; display:block; opacity:0.7;">${vagasRestantes} vagas</span>`;
                } else {
                    btn.textContent = time;
                }

                // Estilos inline de garantia (caso não tenha CSS atualizado)
                btn.style.padding = '10px';
                btn.style.margin = '5px';
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.border = '1px solid var(--secondary-color)';
                btn.style.color = '#fff';
                btn.style.borderRadius = '6px';
                btn.style.cursor = 'pointer';

                btn.onclick = () => prepareCheckout(time);
                
                dom.timeGrid.appendChild(btn);
            });

        } catch (e) {
            console.error("Erro ao verificar vagas:", e);
            dom.timeGrid.innerHTML = '<p>Erro ao carregar horários.</p>';
        }
    }

    // =================================================================
    // 6. PREPARAR CHECKOUT (Redireciona para Pagamento)
    // =================================================================
    function prepareCheckout(time) {
        console.log("🛒 Checkout iniciado:", time);
        
        const user = auth.currentUser;
        if (!user) {
            // Salva intenção e vai para login
            const pendingData = { 
                gameId: gameData.id, 
                date: selectedDateStr, 
                time: time 
            };
            sessionStorage.setItem('pendingCheckout', JSON.stringify(pendingData));
            
            alert("Você precisa estar logado para agendar.");
            window.location.href = '/login.html';
            return;
        }

        // Dados para a tela de pagamento
        const checkoutData = {
            gameId: gameData.id,
            gameName: gameData.name,
            cover: gameData.coverImage,
            date: selectedDateStr,
            time: time,
            price: gameData.price || 0
        };

        // Salva e Redireciona
        sessionStorage.setItem('checkoutData', JSON.stringify(checkoutData));
        window.location.href = '/pagamento.html';
    }

    // Navegação do Calendário
    if(dom.prevMonthBtn) dom.prevMonthBtn.onclick = () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); };
    if(dom.nextMonthBtn) dom.nextMonthBtn.onclick = () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); };

});