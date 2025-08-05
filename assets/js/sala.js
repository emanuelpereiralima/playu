document.addEventListener('DOMContentLoaded', () => {
    // --- DADOS E ESTADO INICIAL ---
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    const bookings = JSON.parse(localStorage.getItem('bookings') || '[]');
    const session = bookings.find(b => b.bookingId === bookingId);
    const sessionDataKey = `session_${bookingId}`;
    
    let timerInterval;
    let mainTime = 21 * 60; // 21 minutos em segundos
    let extraTime = 7 * 60; // 7 minutos em segundos
    let isExtraTime = false;

    // --- CONTROLE DE ACESSO ---
    function checkAccess() {
        const accessMsgContainer = document.getElementById('access-message-container');
        if (!session) {
            accessMsgContainer.innerHTML = '<h1>Sessão Inválida</h1><p>O agendamento não foi encontrado.</p>';
            accessMsgContainer.style.display = 'flex';
            return;
        }

        const sessionStartTime = new Date(`${session.date}T${session.time}`);
        const sessionEndTime = new Date(sessionStartTime.getTime() + (mainTime + extraTime) * 1000);
        const deletionTime = new Date(sessionEndTime.getTime() + 60 * 60 * 1000);
        const now = new Date();

        const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));

        if (loggedInUser && (loggedInUser.role === 'admin' || loggedInUser.username === session.ownerId)) {
            initHostView();
        } else {
            if (now > deletionTime) {
                accessMsgContainer.innerHTML = '<h1>Sessão Expirada</h1><p>Esta sessão de jogo já foi encerrada.</p>';
                accessMsgContainer.style.display = 'flex';
            } else if (now < new Date(sessionStartTime.getTime() - 5 * 60 * 1000)) {
                accessMsgContainer.innerHTML = `<h1>Acesso Negado</h1><p>A sala estará disponível 5 minutos antes do horário marcado.<br>Horário: ${session.date} às ${session.time}</p>`;
                accessMsgContainer.style.display = 'flex';
            } else {
                initPlayerView();
            }
        }
    }

    // --- LÓGICA DO TIMER ---
    function updateTimerDisplay(timeInSeconds, elementId) {
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = timeInSeconds % 60;
        document.getElementById(elementId).textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    function startTimer() {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (!isExtraTime) {
                mainTime--;
                updateTimerDisplay(mainTime, 'player-timer-display');
                updateTimerDisplay(mainTime, 'host-timer-display');
                if (mainTime <= 0) {
                    isExtraTime = true;
                    document.getElementById('player-timer-display').classList.add('extra-time');
                    document.getElementById('host-timer-display').classList.add('extra-time');
                    // Desabilita compra de dicas
                    document.querySelectorAll('.hint-buy-btn').forEach(btn => btn.disabled = true);
                }
            } else {
                extraTime--;
                updateTimerDisplay(extraTime, 'player-timer-display');
                updateTimerDisplay(extraTime, 'host-timer-display');
                if (extraTime <= 0) {
                    clearInterval(timerInterval);
                    alert('O tempo acabou!');
                }
            }
        }, 1000);
    }
    
    // --- VISÃO DO JOGADOR ---
    function initPlayerView() {
        document.getElementById('player-view').classList.remove('hidden');
        const hintsToggleBtn = document.getElementById('hints-toggle-btn');
        const hintsPanel = document.getElementById('hints-panel');

        hintsToggleBtn.addEventListener('click', () => hintsPanel.classList.toggle('collapsed'));
        
        // Carrega dicas salvas pelo host
        const sessionData = JSON.parse(localStorage.getItem(sessionDataKey) || '{}');
        const hints = sessionData.hints || {};
        
        document.querySelectorAll('.hint-buy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (isExtraTime || mainTime < 60) return;
                
                mainTime -= 60; // Custo de 1 minuto
                const hintNumber = btn.dataset.hint;
                btn.classList.add('hidden');
                btn.nextElementSibling.textContent = hints[hintNumber] || `Dica ${hintNumber} não definida pelo host.`;
                btn.nextElementSibling.classList.remove('hidden');
            });
        });

        startTimer(); // Timer do jogador começa automaticamente
    }

    // --- VISÃO DO HOST ---
    function initHostView() {
        document.getElementById('host-view').classList.remove('hidden');
        document.getElementById('start-timer-btn').addEventListener('click', startTimer);
        
        const hintsForm = document.getElementById('hints-editor-form');
        const hintInputs = {
            1: document.getElementById('hint1-input'),
            2: document.getElementById('hint2-input'),
            3: document.getElementById('hint3-input'),
        };

        // Carrega ou inicializa dados da sessão
        let sessionData = JSON.parse(localStorage.getItem(sessionDataKey) || '{}');
        if (!sessionData.hints) sessionData.hints = {};
        hintInputs[1].value = sessionData.hints['1'] || '';
        hintInputs[2].value = sessionData.hints['2'] || '';
        hintInputs[3].value = sessionData.hints['3'] || '';

        hintsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sessionData.hints['1'] = hintInputs[1].value;
            sessionData.hints['2'] = hintInputs[2].value;
            sessionData.hints['3'] = hintInputs[3].value;
            localStorage.setItem(sessionDataKey, JSON.stringify(sessionData));
            alert('Dicas salvas!');
        });
    }

    // --- INICIALIZAÇÃO ---
    checkAccess();
});