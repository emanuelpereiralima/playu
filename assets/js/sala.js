document.addEventListener('DOMContentLoaded', () => {
    // --- DADOS E ESTADO INICIAL ---
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    
    const bookings = JSON.parse(localStorage.getItem('bookings') || '[]');
    const allGames = JSON.parse(localStorage.getItem('games') || '[]');
    const session = bookings.find(b => b.bookingId === bookingId);
    const gameForSession = session ? allGames.find(g => g.id === session.gameId) : null;
    const sessionDataKey = `session_${bookingId}`;
    
    let userMediaStream = null;
    let timerInterval;
    let mainTime = 21 * 60; // 21 minutos em segundos
    let extraTime = 7 * 60; // 7 minutos em segundos
    let isExtraTime = false;

    // --- LÓGICA DE MÍDIA (CÂMERA E MICROFONE) ---
    async function startUserMedia(videoElementId) {
        try {
            userMediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const videoElement = document.getElementById(videoElementId);
            if(videoElement) {
                videoElement.srcObject = userMediaStream;
            }
            setupMediaControls(true, 'player');
            setupMediaControls(true, 'host');
        } catch (err) {
            console.error("Erro ao acessar a câmera/microfone:", err);
            alert("Não foi possível acessar sua câmera e microfone. Verifique as permissões do navegador e recarregue a página.");
        }
    }

    function setupMediaControls(enable, prefix) {
        const micBtn = document.getElementById(`${prefix}-mic-btn`);
        const camBtn = document.getElementById(`${prefix}-cam-btn`);
        if (!micBtn || !camBtn) return;

        micBtn.disabled = !enable;
        camBtn.disabled = !enable;

        if (enable) {
            micBtn.classList.remove('control-btn-toggled');
            camBtn.classList.remove('control-btn-toggled');
            micBtn.querySelector('ion-icon').setAttribute('name', 'mic-outline');
            camBtn.querySelector('ion-icon').setAttribute('name', 'videocam-outline');
        }

        micBtn.onclick = () => {
            if (!userMediaStream) return;
            const audioTrack = userMediaStream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            micBtn.classList.toggle('active', audioTrack.enabled);
            micBtn.classList.toggle('control-btn-toggled', !audioTrack.enabled);
            micBtn.querySelector('ion-icon').setAttribute('name', audioTrack.enabled ? 'mic-outline' : 'mic-off-outline');
        };
        camBtn.onclick = () => {
            if (!userMediaStream) return;
            const videoTrack = userMediaStream.getVideoTracks()[0];
            videoTrack.enabled = !videoTrack.enabled;
            camBtn.classList.toggle('active', videoTrack.enabled);
            camBtn.classList.toggle('control-btn-toggled', !videoTrack.enabled);
            camBtn.querySelector('ion-icon').setAttribute('name', videoTrack.enabled ? 'videocam-outline' : 'videocam-off-outline');
        };
    }
    
    // --- CONTROLE DE ACESSO (VERSÃO FINAL) ---
    function checkAccess() {
        const accessMsgContainer = document.getElementById('access-message-container');
        if (!session || !gameForSession) {
            accessMsgContainer.innerHTML = '<h1>Sessão Inválida</h1><p>O agendamento ou o jogo correspondente não foi encontrado.</p>';
            accessMsgContainer.style.display = 'flex';
            return;
        }

        const sessionStartTime = new Date(`${session.date}T${session.time}`);
        const sessionEndTime = new Date(sessionStartTime.getTime() + (mainTime + extraTime) * 1000);
        const deletionTime = new Date(sessionEndTime.getTime() + 60 * 60 * 1000);
        const now = new Date();
        const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));

        if (loggedInUser && (loggedInUser.role === 'admin' || loggedInUser.username === gameForSession.ownerId)) {
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

    // --- LÓGICA DE SINCRONIZAÇÃO EM TEMPO REAL ---
    window.addEventListener('storage', (event) => {
        if (event.key === sessionDataKey) {
            const newData = JSON.parse(event.newValue || '{}');
            applyTimerStyles(newData.timerStyle);
            if (newData.startTime && !timerInterval) {
                startTimer();
            }
        }
    });

    function applyTimerStyles(styleData) {
        const timerElements = document.querySelectorAll('.timer-display');
        if (styleData) {
            timerElements.forEach(el => {
                if(el) {
                    el.style.color = styleData.color || 'white';
                    el.style.fontFamily = styleData.font || "'Poppins', sans-serif";
                }
            });
        }
    }

    // --- LÓGICA DO TIMER ---
    function updateTimerDisplay(timeInSeconds, elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = timeInSeconds % 60;
        element.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    function startTimer() {
        if (timerInterval) return;

        let sessionData = JSON.parse(localStorage.getItem(sessionDataKey) || '{}');
        if (!sessionData.startTime) return;

        const elapsedSeconds = Math.floor((Date.now() - sessionData.startTime) / 1000);
        const totalDuration = (21 * 60) + (7 * 60);

        if (elapsedSeconds >= totalDuration) {
            mainTime = 0; 
            extraTime = 0;
        } else {
            const remainingTotalSeconds = totalDuration - elapsedSeconds;
            const mainTimeDuration = 21 * 60;
            if (remainingTotalSeconds > (7 * 60)) {
                isExtraTime = false;
                mainTime = remainingTotalSeconds - (7 * 60);
                extraTime = 7 * 60;
            } else {
                isExtraTime = true;
                mainTime = 0;
                extraTime = remainingTotalSeconds;
            }
        }
        
        timerInterval = setInterval(() => {
            let currentTime;
            if (!isExtraTime) {
                mainTime--;
                currentTime = mainTime;
                if (mainTime <= 0) {
                    isExtraTime = true;
                    document.querySelectorAll('.timer-display').forEach(el => el.classList.add('extra-time'));
                    document.querySelectorAll('.hint-buy-btn').forEach(btn => btn.disabled = true);
                }
            } else {
                extraTime--;
                currentTime = extraTime;
                if (extraTime < 0) {
                    currentTime = 0;
                    clearInterval(timerInterval);
                    alert('O tempo acabou!');
                }
            }
            updateTimerDisplay(currentTime, 'timer-display');
            updateTimerDisplay(currentTime, 'host-timer-display');
        }, 1000);
    }
    
    // --- VISÃO DO JOGADOR ---
    function initPlayerView() {
        document.getElementById('player-view').classList.remove('hidden');
        document.getElementById('player-exit-btn').onclick = () => window.location.href = 'index.html';
        
        startUserMedia('player-video-preview');
        document.getElementById('host-video-feed').play().catch(()=>{});

        let sessionData = JSON.parse(localStorage.getItem(sessionDataKey) || '{}');
        applyTimerStyles(sessionData.timerStyle);
        
        if (sessionData.startTime) {
            startTimer();
        } else {
            updateTimerDisplay(mainTime, 'timer-display');
        }

        const hintsToggleBtn = document.getElementById('hints-toggle-btn');
        const hintsPanel = document.getElementById('hints-panel');
        if(hintsToggleBtn) hintsToggleBtn.addEventListener('click', () => hintsPanel.classList.toggle('collapsed'));
        
        const hints = sessionData.hints || {};
        
        document.querySelectorAll('.hint-buy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (isExtraTime || mainTime < 60) {
                    alert('Não é possível comprar dicas no tempo extra ou com menos de 1 minuto restante.');
                    return;
                }
                mainTime -= 60;
                const hintNumber = btn.dataset.hint;
                btn.classList.add('hidden');
                const hintTextEl = btn.nextElementSibling;
                hintTextEl.textContent = hints[hintNumber] || `Dica ${hintNumber} não definida pelo host.`;
                hintTextEl.classList.remove('hidden');
            });
        });
    }

    // --- VISÃO DO HOST ---
    function initHostView() {
    document.getElementById('host-view').classList.remove('hidden');
    document.getElementById('host-exit-btn').onclick = () => window.location.href = 'host-panel.html';
    
    startUserMedia('host-own-video-feed');

    // ==================== NOVO CÓDIGO PARA O PAINEL RECOLHÍVEL ====================
    const hostToolsWrapper = document.getElementById('host-tools-wrapper');
    const hostToolsToggleBtn = document.getElementById('host-tools-toggle-btn');

    if(hostToolsToggleBtn && hostToolsWrapper) {
        hostToolsToggleBtn.addEventListener('click', () => {
            hostToolsWrapper.classList.toggle('collapsed');
        });
    }

        let sessionData = JSON.parse(localStorage.getItem(sessionDataKey) || '{}');
        if (!sessionData) sessionData = {};
        applyTimerStyles(sessionData.timerStyle);

        const startTimerBtn = document.getElementById('start-timer-btn');
        startTimerBtn.addEventListener('click', () => {
            let currentSessionData = JSON.parse(localStorage.getItem(sessionDataKey) || '{}');
            if (!currentSessionData.startTime) {
                currentSessionData.startTime = Date.now();
                localStorage.setItem(sessionDataKey, JSON.stringify(currentSessionData));
                startTimer();
                startTimerBtn.textContent = "Timer Iniciado";
                startTimerBtn.disabled = true;
            }
        });

        if (sessionData.startTime) {
            startTimer();
            startTimerBtn.textContent = "Timer Iniciado";
            startTimerBtn.disabled = true;
        } else {
            updateTimerDisplay(mainTime, 'host-timer-display');
        }

        const hintsForm = document.getElementById('hints-editor-form');
        const hintInputs = { 1: document.getElementById('hint1-input'), 2: document.getElementById('hint2-input'), 3: document.getElementById('hint3-input') };
        
        if (!sessionData.hints) sessionData.hints = {};
        hintInputs[1].value = sessionData.hints['1'] || '';
        hintInputs[2].value = sessionData.hints['2'] || '';
        hintInputs[3].value = sessionData.hints['3'] || '';

        hintsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            let currentSessionData = JSON.parse(localStorage.getItem(sessionDataKey) || '{}');
            if (!currentSessionData.hints) currentSessionData.hints = {};
            currentSessionData.hints['1'] = hintInputs[1].value;
            currentSessionData.hints['2'] = hintInputs[2].value;
            currentSessionData.hints['3'] = hintInputs[3].value;
            localStorage.setItem(sessionDataKey, JSON.stringify(currentSessionData));
            alert('Dicas salvas!');
        });

        const timerColorInput = document.getElementById('timer-color-input');
        const timerFontSelect = document.getElementById('timer-font-select');
        
        function saveTimerStyle() {
            let currentSessionData = JSON.parse(localStorage.getItem(sessionDataKey) || '{}');
            if(!currentSessionData.timerStyle) currentSessionData.timerStyle = {};
            currentSessionData.timerStyle.color = timerColorInput.value;
            currentSessionData.timerStyle.font = timerFontSelect.value;
            localStorage.setItem(sessionDataKey, JSON.stringify(currentSessionData));
            applyTimerStyles(currentSessionData.timerStyle);
        }
        timerColorInput.addEventListener('input', saveTimerStyle);
        timerFontSelect.addEventListener('change', saveTimerStyle);

        const mediaUpload = document.getElementById('media-upload');
        const mediaPreviews = document.getElementById('media-previews');
        const mediaOverlay = document.getElementById('host-media-display-overlay');

        mediaUpload.addEventListener('change', (event) => {
            mediaPreviews.innerHTML = '';
            for (const file of event.target.files) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const thumb = document.createElement(file.type.startsWith('image') ? 'img' : 'video');
                    thumb.src = e.target.result;
                    thumb.className = 'media-thumb';
                    thumb.onclick = () => showMediaInOverlay(e.target.result, file.type);
                    mediaPreviews.appendChild(thumb);
                };
                reader.readAsDataURL(file);
            }
        });
        
        function showMediaInOverlay(src, type) {
            mediaOverlay.innerHTML = '';
            const media = document.createElement(type.startsWith('image') ? 'img' : 'video');
            if (type.startsWith('video')) media.autoplay = true;
            media.src = src;
            mediaOverlay.appendChild(media);

            mediaOverlay.classList.remove('hidden');
            mediaOverlay.onclick = () => mediaOverlay.classList.add('hidden');
        }
    }

    // --- INICIALIZAÇÃO ---
    checkAccess();
});