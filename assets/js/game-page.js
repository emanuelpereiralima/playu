document.addEventListener('DOMContentLoaded', () => {
    const db = firebase.firestore();
    
    // Elementos DOM
    const calendarGrid = document.getElementById('calendar-grid');
    const monthDisplay = document.getElementById('calendar-month-display');
    const overlay = document.getElementById('calendar-overlay');
    const timeContainer = document.getElementById('time-selection-container');
    const timeGrid = document.getElementById('time-slots-grid');
    
    // Estado
    let gameId = new URLSearchParams(window.location.search).get('id');
    let gameData = null;
    let availabilityMap = {}; // Dados brutos do banco
    let validDatesSet = new Set(); // Apenas datas futuras/válidas
    let currentDate = new Date();
    currentDate.setDate(1); // Sempre dia 1 para renderizar o mês

    // 1. CARREGAR JOGO
    async function loadGame() {
        if(!gameId) return alert("Jogo não especificado.");
        
        try {
            const doc = await db.collection('games').doc(gameId).get();
            if(!doc.exists) return window.location.href = 'index.html';
            
            gameData = doc.data();
            renderGameInfo(gameData);
            
            // Processa a disponibilidade
            availabilityMap = gameData.availability || {};
            processValidDates(); 

            // Se não houver NENHUMA data válida futura, mostra overlay
            if (validDatesSet.size === 0) {
                showPausedOverlay();
            } else {
                renderCalendar();
            }

        } catch(e) { console.error(e); }
    }

    // 2. PROCESSAR DATAS VÁLIDAS (FILTRO DE PASSADO)
    function processValidDates() {
        validDatesSet.clear();
        
        const now = new Date();
        // Zera hora para comparação de dia
        const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        Object.keys(availabilityMap).forEach(dateStr => {
            // dateStr vem como YYYY-MM-DD
            // Criar data localmente para evitar problemas de UTC
            const [y, m, d] = dateStr.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d); // Mês começa em 0 no JS

            // Verifica se a data é >= hoje (ignora passado)
            if (dateObj >= todayZero) {
                const slots = availabilityMap[dateStr];
                
                // Se for HOJE, precisamos filtrar horários que já passaram
                if (dateObj.getTime() === todayZero.getTime()) {
                    const validSlots = slots.filter(time => {
                        const [h, min] = time.split(':').map(Number);
                        const slotDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min);
                        // Tolerância: Permite agendar se faltar mais de 30min? Ou bloqueia passado estrito?
                        // Aqui: Bloqueia estritamente o passado.
                        return slotDate > now;
                    });
                    
                    if (validSlots.length > 0) {
                        validDatesSet.add(dateStr);
                    }
                } else {
                    // Data futura com slots
                    if (slots && slots.length > 0) {
                        validDatesSet.add(dateStr);
                    }
                }
            }
        });
    }

    // 3. RENDERIZAR CALENDÁRIO
    function renderCalendar() {
        if(!calendarGrid) return;
        calendarGrid.innerHTML = '';
        
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();
        
        // Nome do Mês
        monthDisplay.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentDate);

        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();

        // Espaços vazios
        for(let i=0; i<firstDay; i++) {
            calendarGrid.appendChild(createDayEl('', 'disabled'));
        }

        // Dias
        for(let d=1; d<=daysInMonth; d++) {
            const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isAvailable = validDatesSet.has(dateStr);
            
            const el = createDayEl(d, isAvailable ? 'available' : 'disabled');
            
            if(isAvailable) {
                el.classList.add('has-slots'); // Classe visual para dia disponível
                el.onclick = () => selectDate(dateStr, el);
            }
            
            calendarGrid.appendChild(el);
        }
    }

    function createDayEl(text, type) {
        const div = document.createElement('div');
        div.className = 'player-calendar-day';
        div.textContent = text;
        if(type === 'disabled') {
            div.style.opacity = '0.3';
        }
        return div;
    }

    // 4. SELECIONAR DATA
    function selectDate(dateStr, el) {
        // Visual Selection
        document.querySelectorAll('.player-calendar-day').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        
        // Mostrar Horários
        timeContainer.classList.remove('hidden');
        document.getElementById('selected-date-display').textContent = dateStr.split('-').reverse().join('/');
        renderTimeSlots(dateStr);
    }

    // 5. RENDERIZAR HORÁRIOS
    function renderTimeSlots(dateStr) {
        timeGrid.innerHTML = '';
        let slots = availabilityMap[dateStr] || [];
        
        // Filtro de horário passado (caso seja Hoje)
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
            btn.style.border = '1px solid var(--secondary-color)';
            btn.style.background = 'transparent';
            
            btn.onclick = () => {
                // Lógica de prosseguir para pagamento/checkout
                proceedToCheckout(dateStr, time);
            };
            
            timeGrid.appendChild(btn);
        });
    }
    
    function showPausedOverlay() {
        if(overlay) overlay.classList.remove('hidden');
        if(calendarGrid) calendarGrid.style.opacity = '0.2'; // Opcional: esmaecer o fundo
        if(timeContainer) timeContainer.classList.add('hidden');
    }

    function renderGameInfo(g) {
        // Preenche título, capa, descrição... (código padrão existente)
        const title = document.getElementById('game-title-display');
        const price = document.getElementById('game-price-display');
        if(title) title.textContent = g.name;
        if(price) price.textContent = `R$ ${parseFloat(g.price).toFixed(2)}`;
        // ... (resto do render normal)
    }
    
    // Navegação Mês
    document.getElementById('prev-month-btn').onclick = () => { currentDate.setMonth(currentDate.getMonth()-1); renderCalendar(); };
    document.getElementById('next-month-btn').onclick = () => { currentDate.setMonth(currentDate.getMonth()+1); renderCalendar(); };

    // Init
    loadGame();
});

// Mock da função de checkout (para não quebrar se não existir)
function proceedToCheckout(date, time) {
    // Salva na sessão e vai para pagamento
    const gameId = new URLSearchParams(window.location.search).get('id');
    sessionStorage.setItem('cart', JSON.stringify({ gameId, date, time }));
    window.location.href = 'pagamento.html';
}