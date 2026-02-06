document.addEventListener('DOMContentLoaded', async () => {
    console.log("🎮 Game Page Manager (V-FINAL: Busca Ativa de Sala)...");

    if (typeof firebase === 'undefined') {
        console.error("Firebase não carregado.");
        return;
    }

    const db = firebase.firestore();
    const auth = firebase.auth();

    // 1. PEGAR ID DA URL
    const params = new URLSearchParams(window.location.search);
    let gameIdParam = params.get('id') ? params.get('id').trim() : null;
    
    if(gameIdParam && gameIdParam.endsWith('/')) {
        gameIdParam = gameIdParam.slice(0, -1);
    }

    // Referências DOM
    const dom = {
        container: document.getElementById('game-details-container'),
        notFound: document.getElementById('game-not-found'),
        title: document.getElementById('game-title'),
        cover: document.getElementById('game-cover-image'),
        duration: document.getElementById('session-duration'),
        tags: document.getElementById('game-genre-tags'),
        desc: document.getElementById('game-description'),
        
        carouselSection: document.getElementById('carousel-section'),
        carouselTrack: document.getElementById('game-carousel-track'),
        trailerSection: document.getElementById('game-trailer-section'),
        trailerWrapper: document.getElementById('trailer-embed-wrapper'),

        monthDisplay: document.getElementById('calendar-month-display'),
        calendarGrid: document.getElementById('calendar-grid'),
        prevMonthBtn: document.getElementById('prev-month-btn'),
        nextMonthBtn: document.getElementById('next-month-btn'),
        pausedOverlay: document.getElementById('calendar-overlay'),
        
        timeContainer: document.getElementById('time-selection-container'),
        timeGrid: document.getElementById('time-slots-grid'),
        dateDisplay: document.getElementById('selected-date-display')
    };

    if (!gameIdParam) {
        showError("ID do jogo não fornecido.");
        return;
    }

    // Estado Local
    let gameData = null;
    let currentDate = new Date();
    let selectedDateStr = null;

    // =================================================================
    // 2. FUNÇÃO GERADORA DE ID (BACKUP)
    // =================================================================
    function generateDeterministicId(gameId, date, time) {
        // Usada apenas se não encontrarmos nenhuma sala no banco
        const g = String(gameId).trim().replace(/\s+/g, '');
        const d = String(date).trim();
        const t = String(time).trim().replace(/:/g, '-');
        return `session_${g}_${d}_${t}`;
    }

    // =================================================================
    // 3. CARREGAR DADOS
    // =================================================================
    try {
        let doc = await db.collection('games').doc(gameIdParam).get();
        
        if (!doc.exists) {
            // Tenta por slug
            const slugSnap = await db.collection('games').where('slug', '==', gameIdParam).limit(1).get();
            if (!slugSnap.empty) {
                doc = slugSnap.docs[0];
            } else {
                throw new Error("Jogo não encontrado.");
            }
        }

        gameData = { id: doc.id, ...doc.data() };
        console.log("✅ Jogo carregado:", gameData.name);

        renderGameDetails();
        renderCalendar();

    } catch (e) {
        console.error(e);
        showError("Jogo indisponível.");
    }

    function showError(msg) {
        if(dom.container) dom.container.classList.add('hidden');
        if(dom.notFound) {
            dom.notFound.classList.remove('hidden');
            if(msg) dom.notFound.querySelector('h1').innerText = msg;
        }
    }

    function renderGameDetails() {
        document.title = `${gameData.name} | PlayU`;
        if(dom.title) dom.title.textContent = gameData.name;
        if(dom.cover) dom.cover.src = gameData.coverImage || 'assets/images/logo.png';
        if(dom.duration) dom.duration.textContent = gameData.sessionDuration ? `${gameData.sessionDuration} min` : '--';
        if(dom.desc) dom.desc.textContent = gameData.fullDescription || gameData.shortDescription || '';
        if(dom.tags && gameData.tags) dom.tags.textContent = Array.isArray(gameData.tags) ? gameData.tags.join(' • ') : gameData.tags;

        const status = gameData.status || 'available';

        if (status === 'paused') {
            // Pega o elemento pai do grid (o container principal do calendário)
            const calendarWrapper = dom.calendarGrid ? dom.calendarGrid.parentNode : null;

            if (calendarWrapper) {
                // Garante que o pai tenha posição relativa para o filho absoluto funcionar
                calendarWrapper.style.position = 'relative'; 
                calendarWrapper.style.overflow = 'hidden'; // Garante bordas arredondadas

                // Cria o Overlay
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.85); /* Fundo escuro transparente */
                    backdrop-filter: blur(4px); /* Efeito de desfoque no fundo */
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 50;
                    border-radius: 15px;
                `;

                overlay.innerHTML = `
                    <ion-icon name="construct-outline" style="font-size: 3.5rem; color: #ffbb00; margin-bottom: 15px;"></ion-icon>
                    <h3 style="font-family: 'Orbitron', sans-serif; color: #fff; margin-bottom: 10px; font-size: 1.5rem; text-transform: uppercase;">Jogo Pausado</h3>
                    <p style="color: #ccc; text-align: center; max-width: 80%; line-height: 1.4;">
                        Este jogo está temporariamente indisponível para novos agendamentos.<br>
                        <span style="font-size: 0.85rem; color: #777; margin-top: 10px; display: block;">Tente novamente mais tarde.</span>
                    </p>
                `;

                // Adiciona o overlay POR CIMA do calendário
                calendarWrapper.appendChild(overlay);

                // Desabilita visualmente os botões de navegação do mês
                if(dom.prevMonthBtn) dom.prevMonthBtn.style.opacity = '0';
                if(dom.nextMonthBtn) dom.nextMonthBtn.style.opacity = '0';
                
                // Adiciona badge no título
                if(dom.title) {
                    dom.title.innerHTML += ` <span style="font-size: 0.5em; vertical-align: middle; background: #ffbb00; color: #000; padding: 2px 8px; border-radius: 4px; margin-left: 10px;">PAUSADO</span>`;
                }
            }}

        if (gameData.galleryImages?.length > 0 && dom.carouselSection) {
            dom.carouselSection.classList.remove('hidden');
            if(dom.carouselTrack) {
                dom.carouselTrack.innerHTML = gameData.galleryImages.map(url => 
                    `<img src="${url}" class="game-carousel-img" onclick="window.open(this.src)">`
                ).join('');
            }
        }
        if (gameData.videoPreview && dom.trailerSection) {
            dom.trailerSection.classList.remove('hidden');
            if(dom.trailerWrapper) {
                const vid = gameData.videoPreview;
                if(vid.includes('youtu')) {
                    const vId = vid.split('v=')[1] || vid.split('/').pop();
                    dom.trailerWrapper.innerHTML = `<iframe width="100%" height="400" src="https://www.youtube.com/embed/${vId}" frameborder="0" allowfullscreen></iframe>`;
                } else {
                    dom.trailerWrapper.innerHTML = `<video src="${vid}" controls style="width:100%"></video>`;
                }
            }
        }
    }

    // =================================================================
    // 4. CALENDÁRIO
    // =================================================================
    function renderCalendar() {
        if(!dom.calendarGrid) return;
        dom.calendarGrid.innerHTML = '';
        
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();

        dom.monthDisplay.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentDate);

        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        
        const today = new Date();
        today.setHours(0,0,0,0);
        
        for(let i=0; i<firstDay; i++) {
            dom.calendarGrid.appendChild(document.createElement('div'));
        }

        for(let d=1; d<=daysInMonth; d++) {
            const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const checkDate = new Date(y, m, d);
            
            const el = document.createElement('div');
            el.className = 'calendar-day';
            el.textContent = d;

            const adminSlots = gameData.availability ? (gameData.availability[dateStr] || []) : [];
            
            if (checkDate < today) {
                el.classList.add('disabled');
            } 
            else if (adminSlots.length > 0) {
                el.classList.add('available');
                el.onclick = () => selectDate(dateStr, el);
            } 
            else {
                el.classList.add('disabled');
            }

            if(selectedDateStr === dateStr) el.classList.add('selected');
            dom.calendarGrid.appendChild(el);
        }
    }

    // =================================================================
    // 5. SELEÇÃO DE HORÁRIO
    // =================================================================
    async function selectDate(dateStr, el) {
        document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
        el.classList.add('selected');
        selectedDateStr = dateStr;

        const parts = dateStr.split('-');
        if(dom.dateDisplay) dom.dateDisplay.textContent = `${parts[2]}/${parts[1]}/${parts[0]}`;
        
        dom.timeContainer.classList.remove('hidden');
        dom.timeGrid.innerHTML = '<div class="loader-small"></div>';

        const adminSlots = gameData.availability ? (gameData.availability[dateStr] || []) : [];
        
        // Filtra passado
        const now = new Date();
        const validSlots = adminSlots.filter(time => {
            const [h, m] = time.split(':').map(Number);
            const slotDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]), h, m);
            return slotDate > now;
        });

        dom.timeGrid.innerHTML = '';
        if (validSlots.length === 0) {
            dom.timeGrid.innerHTML = '<p style="color:#aaa;">Sem horários disponíveis.</p>'; 
            return;
        }

        validSlots.sort().forEach(time => {
            const btn = document.createElement('button');
            btn.className = 'time-slot-btn';
            btn.textContent = time;
            btn.onclick = () => confirmSharedBooking(time);
            dom.timeGrid.appendChild(btn);
        });
    }

// =================================================================
    // 6. REDIRECIONAR PARA PAGAMENTO (ATUALIZADO)
    // =================================================================
    async function confirmSharedBooking(time) {
        const user = auth.currentUser;
        
        // Dados para o checkout
        const checkoutPayload = {
            gameId: gameData.id,
            gameName: gameData.name,
            // Usa a capa carregada ou fallback
            cover: gameData.coverImage || 'assets/images/logo.png', 
            date: selectedDateStr,
            time: time,
            price: gameData.price || 0 // Passa o preço se existir
        };

        // Salva na memória temporária
        sessionStorage.setItem('checkoutData', JSON.stringify(checkoutPayload));

        if (!user) {
            // Se não estiver logado, salva intenção e manda pro login
            sessionStorage.setItem('pendingCheckout', JSON.stringify(checkoutPayload));
            alert("Faça login para continuar com o pagamento.");
            window.location.href = 'login.html';
            return;
        }

        // Redireciona para a tela de pagamento
        window.location.href = 'pagamento.html';
    }

    
    if(dom.prevMonthBtn) dom.prevMonthBtn.onclick = () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); };
    if(dom.nextMonthBtn) dom.nextMonthBtn.onclick = () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); };
});