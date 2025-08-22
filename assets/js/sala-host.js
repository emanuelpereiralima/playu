document.addEventListener('DOMContentLoaded', () => {
    // --- DADOS E ESTADO INICIAL ---
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    
    const bookings = getBookings();
    const allGames = getGames();
    const session = bookings.find(b => b.bookingId === bookingId);
    const gameForSession = session ? allGames.find(g => g.id === session.gameId) : null;
    const sessionDataKey = `session_${bookingId}`;
    
    let userMediaStream = null;
    let timerInterval = null;
    let mainTime = 21 * 60;
    let extraTime = 7 * 60;
    let isExtraTime = false;

    /* --- CONTROLE DE ACESSO ESTRITO PARA O HOST ---
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    const accessMsgContainer = document.getElementById('access-message-container');

    if (!session || !gameForSession) {
        accessMsgContainer.innerHTML = '<h1>Sessão Inválida</h1><p>O agendamento ou o jogo correspondente não foi encontrado.</p>';
        accessMsgContainer.style.display = 'flex';
        return;
    }
    if (!loggedInUser || (loggedInUser.role !== 'admin' && loggedInUser.username !== gameForSession.ownerId)) {
        accessMsgContainer.innerHTML = '<h1>Acesso Negado</h1><p>Você não tem permissão para acessar esta sala como host.</p><a href="login.html" class="submit-btn" style="text-decoration:none; margin-top:1rem;">Fazer Login</a>';
        accessMsgContainer.style.display = 'flex';
        return;
    }*/
    
    // Se o acesso for permitido, o resto do script roda
    initHostView();

    // --- LÓGICA DE MÍDIA (CÂMERA E MICROFONE) ---
    async function startUserMedia(videoElementId) {
        try {
            userMediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const videoElement = document.getElementById(videoElementId);
            if(videoElement) {
                videoElement.srcObject = userMediaStream;
                videoElement.muted = true;
            }
            setupMediaControls(true, 'host');
        } catch (err) {
            console.error("Erro ao acessar a câmera/microfone:", err);
            alert("Não foi possível acessar sua câmera e microfone. Verifique as permissões do navegador.");
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
            micBtn.classList.add('active');
            camBtn.classList.add('active');
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
    
    function applyTimerStyles(styleData) {
        const timerElements = document.querySelectorAll('.timer-display');
        if (styleData) {
            timerElements.forEach(el => {
                if(el) {
                    el.style.color = styleData.color || 'white';
                    el.style.borderColor = styleData.color || 'white';
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
            updateTimerDisplay(currentTime, 'host-timer-display');
        }, 1000);
    }
    
    // --- INICIALIZAÇÃO DA VISÃO DO HOST ---
    function initHostView() {
        document.getElementById('host-view').classList.remove('hidden');
        document.getElementById('host-exit-btn').onclick = () => window.location.href = 'index.html';


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
        if(startTimerBtn){
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
        }

        const hintsForm = document.getElementById('hints-editor-form');
        if(hintsForm) {
            const hintInputs = { 
                1: document.getElementById('hint1-input'), 
                2: document.getElementById('hint2-input'), 
                3: document.getElementById('hint3-input') 
            };
            
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
        }

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

        if(timerColorInput) timerColorInput.addEventListener('input', saveTimerStyle);
        if(timerFontSelect) timerFontSelect.addEventListener('change', saveTimerStyle);

       const mediaUploadInput = document.getElementById('media-upload');
const mediaPreviews = document.getElementById('media-previews');
const mediaOverlay = document.getElementById('host-media-display-overlay');
const mediaDropZone = document.getElementById('media-drop-zone');

// Função centralizada para processar os arquivos
function handleMediaFiles(files) {
    if(mediaPreviews) mediaPreviews.innerHTML = '';
    for (const file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const thumb = document.createElement(file.type.startsWith('image') ? 'img' : 'video');
            thumb.src = e.target.result;
            thumb.className = 'media-thumb';
            thumb.onclick = () => showMediaInOverlay(e.target.result, file.type);
            if(mediaPreviews) mediaPreviews.appendChild(thumb);
        };
        reader.readAsDataURL(file);
    }
}

// Evento para o input de clique
if(mediaUploadInput) {
    mediaUploadInput.addEventListener('change', (event) => {
        handleMediaFiles(event.target.files);
    });
}

// Eventos de Drag and Drop
if(mediaDropZone) {
    mediaDropZone.addEventListener('dragover', (event) => {
        event.preventDefault(); // Essencial para permitir o drop
        mediaDropZone.classList.add('drag-over');
    });

    mediaDropZone.addEventListener('dragleave', () => {
        mediaDropZone.classList.remove('drag-over');
    });

    mediaDropZone.addEventListener('drop', (event) => {
        event.preventDefault(); // Essencial para impedir que o navegador abra o arquivo
        mediaDropZone.classList.remove('drag-over');
        handleMediaFiles(event.dataTransfer.files);
    });
}
        
        function showMediaInOverlay(src, type) {
            if(!mediaOverlay) return;
            mediaOverlay.innerHTML = '';
            const media = document.createElement(type.startsWith('image') ? 'img' : 'video');
            if (type.startsWith('video')) {
                media.autoplay = true;
                media.controls = true;
            }
            media.src = src;
            mediaOverlay.appendChild(media);

            mediaOverlay.classList.remove('hidden');
            mediaOverlay.onclick = () => {
                mediaOverlay.classList.add('hidden');
                mediaOverlay.innerHTML = '';
            };
        }
    }
});