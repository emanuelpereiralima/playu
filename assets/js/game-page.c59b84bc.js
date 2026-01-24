document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    
    // --- REFERÊNCIAS AOS ELEMENTOS DO HTML (IDs Corrigidos) ---
    const containers = {
        details: document.getElementById('game-details-container'),
        notFound: document.getElementById('game-not-found'),
        hero: document.getElementById('game-hero'),
        calendar: document.getElementById('game-calendar-container') // Wrapper do calendário
    };

    const elements = {
        title: document.getElementById('game-title'),
        description: document.getElementById('game-description'),
        cover: document.getElementById('game-cover-image'),
        duration: document.getElementById('session-duration'),
        tags: document.getElementById('game-genre-tags'),
        // Calendário
        calendarGrid: document.getElementById('calendar-grid'),
        monthDisplay: document.getElementById('calendar-month-display'),
        overlay: document.getElementById('calendar-overlay'),
        timeContainer: document.getElementById('time-selection-container'),
        timeGrid: document.getElementById('time-slots-grid'),
        selectedDateDisplay: document.getElementById('selected-date-display')
    };

    // --- ESTADO ---
    let urlParam = new URLSearchParams(window.location.search).get('id');
    let gameData = null;
    let gameDocId = null; 
    let availabilityMap = {}; 
    let validDatesSet = new Set();
    let currentDate = new Date();
    currentDate.setDate(1); 

    // 1. CARREGAR JOGO
    async function loadGame() {
        if(!urlParam) {
            console.warn("ID não fornecido na URL.");
            showNotFound();
            return;
        }
        
        try {
            let doc;
            
            // Tenta buscar direto pelo ID do documento
            doc = await db.collection('games').doc(urlParam).get();

            // Se não achar, tenta buscar pelo Slug
            if (!doc.exists) {
                const slugSnap = await db.collection('games').where('slug', '==', urlParam).limit(1).get();
                if (!slugSnap.empty) {
                    doc = slugSnap.docs[0];
                }
            }

            // Se ainda assim não existir
            if (!doc || !doc.exists) {
                console.error("Jogo não encontrado no banco de dados.");
                showNotFound();
                return;
            }
            
            // Jogo Encontrado
            gameData = doc.data();
            gameDocId = doc.id;
            
            // Renderiza na tela
            renderGameInfo(gameData);
            
            // Configura Agenda
            availabilityMap = gameData.availability || {};
            processValidDates(); 

            if (validDatesSet.size === 0) {
                showPausedOverlay();
            } else {
                renderCalendar();
            }

        } catch(e) { 
            console.error("Erro crítico ao carregar jogo:", e);
            showNotFound();
        }
    }

    // 2. MOSTRAR DADOS NA TELA
    function renderGameInfo(g) {
        // Título
        if(elements.title) elements.title.textContent = g.name;
        
        // Descrição (Prioriza full, depois short, depois fallback)
        if(elements.description) {
            elements.description.textContent = g.fullDescription || g.shortDescription || "Sem descrição disponível.";
        }
        
        // Capa
        if(elements.cover) {
            elements.cover.src = g.coverImage || '/assets/images/logo.png';
        }
        
        // Duração
        if(elements.duration) {
            elements.duration.textContent = g.sessionDuration ? `${g.sessionDuration} min` : 'Duração n/a';
        }

        // Tags
        if(elements.tags && g.tags) {
            elements.tags.innerHTML = ''; // Limpa anterior
            g.tags.forEach((tag, index) => {
                // Adiciona vírgula se não for o último, ou cria spans bonitos
                const span = document.createElement('span');
                span.style.cssText = "background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:4px; font-size:0.9rem; margin-right:5px;";
                span.textContent = tag;
                elements.tags.appendChild(span);
            });
        }
    }

    // 3. LÓGICA DE CALENDÁRIO (Datas Válidas)
    function processValidDates() {
        validDatesSet.clear();
        const now = new Date();
        const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        Object.keys(availabilityMap).forEach(dateStr => {
            const [y, m, d] = dateStr.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d); 

            if (dateObj >= todayZero) {
                const slots = availabilityMap[dateStr];
                
                if (dateObj.getTime() === todayZero.getTime()) {
                    // Hoje: filtra horas passadas
                    const validSlots = slots.filter(time => {
                        const [h, min] = time.split(':').map(Number);
                        const slotDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min);
                        return slotDate > now;
                    });
                    if (validSlots.length > 0) validDatesSet.add(dateStr);
                } else {
                    // Futuro
                    if (slots && slots.length > 0) validDatesSet.add(dateStr);
                }
            }
        });
    }

    // 4. DESENHAR CALENDÁRIO
    function renderCalendar() {
        if(!elements.calendarGrid) return;
        elements.calendarGrid.innerHTML = '';
        
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        
        if(elements.monthDisplay) {
            elements.monthDisplay.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentDate);
        }

        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();

        // Dias vazios do início do mês
        for(let i=0; i<firstDay; i++) {
            elements.calendarGrid.appendChild(createDayEl('', 'disabled'));
        }

        // Dias do mês
        for(let d=1; d<=daysInMonth; d++) {
            const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isAvailable = validDatesSet.has(dateStr);
            
            const el = createDayEl(d, isAvailable ? 'available' : 'disabled');
            
            if(isAvailable) {
                el.classList.add('has-slots'); 
                el.onclick = () => selectDate(dateStr, el);
            }
            
            elements.calendarGrid.appendChild(el);
        }
    }

    function createDayEl(text, type) {
        const div = document.createElement('div');
        div.className = 'player-calendar-day'; // Certifique-se que essa classe existe no CSS
        div.textContent = text;
        
        // Estilo inline básico caso o CSS falhe
        if(type === 'disabled') {
            div.style.opacity = '0.3';
            div.style.cursor = 'default';
        } else {
            div.style.cursor = 'pointer';
        }
        return div;
    }

    function selectDate(dateStr, el) {
        // Remove seleção anterior
        document.querySelectorAll('.player-calendar-day').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        
        if(elements.timeContainer) {
            elements.timeContainer.classList.remove('hidden');
            if(elements.selectedDateDisplay) {
                elements.selectedDateDisplay.textContent = dateStr.split('-').reverse().join('/');
            }
            renderTimeSlots(dateStr);
        }
    }

    function renderTimeSlots(dateStr) {
        if(!elements.timeGrid) return;
        elements.timeGrid.innerHTML = '';
        let slots = availabilityMap[dateStr] || [];
        
        // Filtro de segurança (Hoje)
        const now = new Date();
        const [y, m, d] = dateStr.split('-').map(Number);
        const isToday = (y === now.getFullYear() && (m-1) === now.getMonth() && d === now.getDate());

        if (isToday) {
            slots = slots.filter(time => {
                const [h, min] = time.split(':').map(Number);
                const slotTime = new Date(y, m-1, d, h, min);
                return slotTime > now; 
            });
        }
        
        slots.sort();

        slots.forEach(time => {
            const btn = document.createElement('button');
            btn.className = 'submit-btn small-btn';
            btn.textContent = time;
            btn.style.margin = '5px';
            btn.onclick = () => proceedToCheckout(dateStr, time);
            elements.timeGrid.appendChild(btn);
        });
    }
    
    // Auxiliares de UI
    function showNotFound() {
        if(containers.details) containers.details.classList.add('hidden');
        if(containers.notFound) containers.notFound.classList.remove('hidden');
    }

    function showPausedOverlay() {
        if(elements.overlay) elements.overlay.classList.remove('hidden');
        if(elements.calendarGrid) elements.calendarGrid.style.opacity = '0.2';
        if(elements.timeContainer) elements.timeContainer.classList.add('hidden');
    }

    // Navegação do Calendário
    const prevBtn = document.getElementById('prev-month-btn');
    const nextBtn = document.getElementById('next-month-btn');
    if(prevBtn) prevBtn.onclick = () => { currentDate.setMonth(currentDate.getMonth()-1); renderCalendar(); };
    if(nextBtn) nextBtn.onclick = () => { currentDate.setMonth(currentDate.getMonth()+1); renderCalendar(); };

    // Checkout
    window.proceedToCheckout = (date, time) => {
        const cartItem = { 
            gameId: gameDocId, 
            gameName: gameData.name,
            price: gameData.price,
            date, 
            time 
        };
        sessionStorage.setItem('cart', JSON.stringify(cartItem));
        window.location.href = 'pagamento.html';
    };

    // Inicia
    loadGame();
});