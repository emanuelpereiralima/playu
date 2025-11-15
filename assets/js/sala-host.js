document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DE VÍDEO E ESTADO ---
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    
    let localStream = null;
    let pc = null; // RTCPeerConnection
    let roomRef = null;
    let timerInterval = null;
    let localSessionData = { // Estado local para salvar decisões
        decisions: []
    };

    // --- CONFIGURAÇÃO DO WEBRTC ---
    const servers = {
        iceServers: [
            { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
        ],
        iceCandidatePoolSize: 10,
    };

    // --- DADOS DA SESSÃO ---
// --- DADOS DA SESSÃO E CONTROLE DE ACESSO (Assíncrono) ---
const urlParams = new URLSearchParams(window.location.search);
const bookingId = urlParams.get('bookingId');
const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
const accessMsgContainer = document.getElementById('access-message-container');
const allGames = getGames(); // Do gamedata.js

let session = null;
let gameForSession = null;

// Esta função assíncrona irá bloquear o carregamento da sala
// até que tenhamos os dados da sessão e verifiquemos o acesso.
async function verifyAccessAndLoadData() {
    if (!bookingId) {
        showAccessError('<h1>Sessão Inválida</h1><p>O link de agendamento não foi encontrado.</p>');
        return false;
    }
    if (!loggedInUser) {
        showAccessError('<h1>Acesso Negado</h1><p>Você precisa estar logado para acessar esta sala.</p><a href="login.html" class="submit-btn" style="text-decoration:none; margin-top:1rem;">Fazer Login</a>');
        return false;
    }

    // Busca o agendamento no Firestore
    try {
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingDoc = await bookingRef.get();

        if (!bookingDoc.exists) {
            showAccessError('<h1>Sessão Inválida</h1><p>Este agendamento não existe ou foi excluído.</p>');
            return false;
        }

        session = bookingDoc.data();
        gameForSession = allGames.find(g => g.id === session.gameId);

        if (!gameForSession) {
            showAccessError('<h1>Erro no Jogo</h1><p>O jogo associado a este agendamento não foi encontrado.</p>');
            return false;
        }

        // --- VERIFICAÇÃO DE ACESSO ESPECÍFICA ---
        // (Isso é um pouco diferente entre os dois arquivos, ajuste conforme abaixo)
        
        // =====================================================================
        // NO ARQUIVO sala-host.js, use esta verificação:
        if (loggedInUser.role !== 'admin' && loggedInUser.username !== gameForSession.ownerId) {
            showAccessError('<h1>Acesso Negado</h1><p>Você não tem permissão para acessar esta sala como host.</p>');
            return false;
        }
        // =====================================================================

        // =====================================================================
        // NO ARQUIVO sala-jogador.js, use esta verificação:
        if (session.userId !== loggedInUser.username) {
            showAccessError('<h1>Acesso Negado</h1><p>Você não é o jogador agendado para esta sessão.</p>');
            return false;
        }
        // =====================================================================

        // Se chegou até aqui, o acesso é permitido
        return true; 
        
    } catch (error) {
        console.error("Erro ao verificar acesso:", error);
        showAccessError('<h1>Erro de Conexão</h1><p>Não foi possível verificar os dados da sessão. Tente novamente.</p>');
        return false;
    }
}

function showAccessError(message) {
    accessMsgContainer.innerHTML = message;
    accessMsgContainer.style.display = 'flex';
    document.getElementById('host-view')?.classList.add('hidden'); // Esconde a view
    document.getElementById('player-view')?.classList.add('hidden'); // Esconde a view
}

// --- INICIALIZAÇÃO DA SALA ---
// roomRef = db.collection('sessions').doc(bookingId); // Esta linha já deve existir
// initHostView(); // Esta linha já deve existir

// SUBSTITUA a chamada direta (ex: initHostView()) por esta lógica:
verifyAccessAndLoadData().then(accessGranted => {
    if (accessGranted) {
        console.log('Acesso concedido. Carregando sala...');
        // Referência do Firestore para a SESSÃO DE VÍDEO (diferente do agendamento)
        roomRef = db.collection('sessions').doc(bookingId); 
        
        // Chame a função de inicialização que já existia
        // Em sala-host.js:
        initHostView();
        // Em sala-jogador.js:
        // initPlayerView();
    }
});

    if (!bookingId || !session || !gameForSession) {
        accessMsgContainer.innerHTML = '<h1>Sessão Inválida</h1><p>O agendamento ou o jogo correspondente não foi encontrado.</p>';
        accessMsgContainer.style.display = 'flex';
        return;
    }
    if (!loggedInUser || (loggedInUser.role !== 'admin' && loggedInUser.username !== gameForSession.ownerId)) {
        accessMsgContainer.innerHTML = '<h1>Acesso Negado</h1><p>Você não tem permissão para acessar esta sala como host.</p><a href="login.html" class="submit-btn" style="text-decoration:none; margin-top:1rem;">Fazer Login</a>';
        accessMsgContainer.style.display = 'flex';
        return;
    }

    // --- INICIALIZAÇÃO DA SALA ---
    roomRef = db.collection('sessions').doc(bookingId);

    initHostView();

    // --- FUNÇÃO PRINCIPAL DE INICIALIZAÇÃO ---
    async function initHostView() {
        document.getElementById('host-view').classList.remove('hidden');
        
        await setupWebRTC();
        
        // Carrega dados iniciais do jogo (dicas, decisões, mídias) para o host
        await loadInitialGameData(); 
        
        setupHostTools();
        listenForPlayerUpdates();
    }
    
    // --- CARREGAR DADOS INICIAIS ---
    async function loadInitialGameData() {
        // Carrega dados pré-configurados do jogo (de gamedata.js)
        localSessionData.decisions = gameForSession.decisions || [];
        
        if (gameForSession.hints) {
            document.getElementById('hint1-input').value = gameForSession.hints['1'] || '';
            document.getElementById('hint2-input').value = gameForSession.hints['2'] || '';
            document.getElementById('hint3-input').value = gameForSession.hints['3'] || '';
        }
        
        // Salva dados iniciais no Firebase para o jogador ver
        await roomRef.set({ 
            hints: gameForSession.hints || {},
            decisions: gameForSession.decisions || []
        }, { merge: true }); // Merge: true para não sobrescrever a oferta de vídeo

        // Renderiza as decisões pré-salvas
        renderSavedDecisions();
    }

    // --- LÓGICA DO WEBRTC (Sem alterações) ---
    async function setupWebRTC() {
        pc = new RTCPeerConnection(servers);
        await setupLocalMedia();
        pc.ontrack = event => {
            console.log('Recebendo stream remoto do jogador...');
            if (event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            } else {
                let inboundStream = new MediaStream(event.track);
                remoteVideo.srcObject = inboundStream;
            }
        };
        await createOffer();
    }

    async function setupLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
            setupMediaControls(true, 'host');
        } catch (err) {
            console.error("Erro ao acessar a câmera/microfone:", err);
            alert("Não foi possível acessar sua câmera e microfone. Verifique as permissões do navegador.");
        }
    }

    async function createOffer() {
        const offerCandidates = roomRef.collection('offerCandidates');
        const answerCandidates = roomRef.collection('answerCandidates');
        pc.onicecandidate = event => {
            if (event.candidate) {
                offerCandidates.add(event.candidate.toJSON());
            }
        };
        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);
        const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
        };
        await roomRef.set({ offer }, { merge: true });
        console.log('Host: Oferta salva no Firebase');
        roomRef.onSnapshot(async (snapshot) => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                console.log('Host: Recebendo resposta do jogador...');
                const answerDescription = new RTCSessionDescription(data.answer);
                await pc.setRemoteDescription(answerDescription);
                console.log('Host: Conexão estabelecida com sucesso!');
            }
        });
        answerCandidates.onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate);
                }
            });
        });
    }

    // --- CONTROLES DE MÍDIA (Sem alterações) ---
    function setupMediaControls(enable, prefix) {
        const micBtn = document.getElementById(`${prefix}-mic-btn`);
        const camBtn = document.getElementById(`${prefix}-cam-btn`);
        if (!micBtn || !camBtn) return;
        micBtn.disabled = !enable;
        camBtn.disabled = !enable;
        if (enable) {
            micBtn.classList.add('active');
            camBtn.classList.add('active');
            micBtn.querySelector('ion-icon').setAttribute('name', 'mic-outline');
            camBtn.querySelector('ion-icon').setAttribute('name', 'videocam-outline');
        }
        micBtn.onclick = () => {
            if (!localStream) return;
            const audioTrack = localStream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;
            micBtn.classList.toggle('active', audioTrack.enabled);
            micBtn.classList.toggle('control-btn-toggled', !audioTrack.enabled);
            micBtn.querySelector('ion-icon').setAttribute('name', audioTrack.enabled ? 'mic-outline' : 'mic-off-outline');
        };
        camBtn.onclick = () => {
            if (!localStream) return;
            const videoTrack = localStream.getVideoTracks()[0];
            videoTrack.enabled = !videoTrack.enabled;
            camBtn.classList.toggle('active', videoTrack.enabled);
            camBtn.classList.toggle('control-btn-toggled', !videoTrack.enabled);
            camBtn.querySelector('ion-icon').setAttribute('name', videoTrack.enabled ? 'videocam-outline' : 'videocam-off-outline');
        };
    }

    // --- LÓGICA DAS FERRAMENTAS DO HOST (Refatorado para Firebase) ---
    function setupHostTools() {
        document.getElementById('host-exit-btn').onclick = () => {
             window.location.href = loggedInUser.role === 'admin' ? 'admin.html' : 'host-panel.html';
        };
        
        const closeDecisionBtn = document.getElementById('host-close-decision-btn');
        if(closeDecisionBtn) {
            closeDecisionBtn.onclick = () => { 
                document.getElementById('player-decision-overlay').classList.add('hidden');
            };
        }

        const hostToolsWrapper = document.getElementById('host-tools-wrapper');
        const hostToolsToggleBtn = document.getElementById('host-tools-toggle-btn');
        if(hostToolsToggleBtn && hostToolsWrapper) {
            hostToolsToggleBtn.addEventListener('click', () => {
                hostToolsWrapper.classList.toggle('collapsed');
            });
        }
        
        // --- Timer (Firebase) ---
        const startTimerBtn = document.getElementById('start-timer-btn');
        if (startTimerBtn) {
            startTimerBtn.addEventListener('click', () => {
                roomRef.update({
                    startTime: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    startTimerBtn.textContent = "Timer Iniciado";
                    startTimerBtn.disabled = true;
                });
            });
        }
        
        roomRef.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (data && data.startTime && !timerInterval) {
                console.log('Timer iniciado pelo Firebase');
                startTimer(data.startTime.toDate());
                startTimerBtn.textContent = "Timer Iniciado";
                startTimerBtn.disabled = true;
            }
        });
        
        const timerColorInput = document.getElementById('timer-color-input');
        const timerFontSelect = document.getElementById('timer-font-select');
        
        function saveTimerStyle() {
            const styleData = {
                color: timerColorInput.value,
                font: timerFontSelect.value
            };
            roomRef.update({ timerStyle: styleData });
            applyTimerStyles(styleData);
        }
        if(timerColorInput) timerColorInput.addEventListener('input', saveTimerStyle);
        if(timerFontSelect) timerFontSelect.addEventListener('change', saveTimerStyle);
        

        // --- Dicas (Firebase) ---
        const hintsForm = document.getElementById('hints-editor-form');
        if (hintsForm) {
            const hintInputs = { 
                1: document.getElementById('hint1-input'), 
                2: document.getElementById('hint2-input'), 
                3: document.getElementById('hint3-input') 
            };
            
            hintsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                roomRef.update({
                    hints: {
                        '1': hintInputs[1].value,
                        '2': hintInputs[2].value,
                        '3': hintInputs[3].value,
                    }
                }).then(() => alert('Dicas salvas!'));
            });
        }
        
        // --- Mídia do Jogo (Firebase) ---
        // ESTA SEÇÃO FOI COMPLETAMENTE SUBSTITUÍDA
        
        // Lógica das Abas de Mídia
        document.querySelectorAll('.asset-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabGroup = btn.closest('.asset-tabs');
                const manager = btn.closest('.asset-manager-compact');
                
                tabGroup.querySelectorAll('.asset-tab-btn.active').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                manager.querySelectorAll('.asset-tab-content.active').forEach(c => c.classList.remove('active'));
                manager.querySelector(`#${btn.dataset.tab}-tab`).classList.add('active');
            });
        });

        // Função para renderizar as mídias salvas
        function renderMediaTools() {
            const photosPreview = document.getElementById('host-photos-preview');
            const videosPreview = document.getElementById('host-videos-preview');
            const soundsPreview = document.getElementById('host-sounds-preview');
            
            if (!photosPreview || !videosPreview || !soundsPreview) return;
            
            photosPreview.innerHTML = '';
            videosPreview.innerHTML = '';
            soundsPreview.innerHTML = '';
            
            // Popula Fotos
            (gameForSession.photos || []).forEach(asset => {
                const thumb = document.createElement('img');
                thumb.src = asset.dataUrl;
                thumb.className = 'asset-thumb';
                thumb.title = `Enviar foto: ${asset.name}`;
                thumb.onclick = () => {
                    console.log('Enviando foto para o jogador...');
                    roomRef.update({
                        liveMedia: { src: asset.dataUrl, type: 'image' }
                    });
                };
                photosPreview.appendChild(thumb);
            });
            
            // Popula Vídeos
            (gameForSession.videos || []).forEach(asset => {
                const thumb = document.createElement('video');
                thumb.src = asset.dataUrl;
                thumb.className = 'asset-thumb';
                thumb.title = `Enviar vídeo: ${asset.name}`;
                thumb.onclick = () => {
                    console.log('Enviando vídeo para o jogador...');
                    roomRef.update({
                        liveMedia: { src: asset.dataUrl, type: 'video' }
                    });
                };
                videosPreview.appendChild(thumb);
            });
            
            // Popula Sons
            (gameForSession.sounds || []).forEach(asset => {
                const item = document.createElement('div');
                item.className = 'asset-audio-item';
                // Adiciona ícone e nome
                item.innerHTML = `<span><ion-icon name="musical-notes-outline"></ion-icon> ${asset.name.substring(0, 20)}...</span>`;
                item.title = `Tocar som: ${asset.name}`;
                item.onclick = () => {
                    console.log('Enviando som para o jogador...');
                    roomRef.update({
                        liveMedia: { src: asset.dataUrl, type: 'audio' }
                    });
                };
                soundsPreview.appendChild(item);
            });
        }
        
        // Chama a renderização
        renderMediaTools();
        
        // --- Decisões (Firebase) ---
        const decisionForm = document.getElementById('decision-creator-form');
        const decisionTitleInput = document.getElementById('decision-title-input');
        const optionsContainer = document.getElementById('decision-options-inputs');
        const addOptionBtn = document.getElementById('add-option-btn');
        const savedDecisionsList = document.getElementById('saved-decisions-list');
        const playerChoiceFeedback = document.getElementById('player-choice-feedback');
        
        if (addOptionBtn) {
            addOptionBtn.addEventListener('click', () => {
                const newInput = document.createElement('input');
                newInput.type = 'text';
                newInput.className = 'decision-option-input';
                newInput.placeholder = `Opção ${optionsContainer.children.length + 1}`;
                newInput.required = true;
                optionsContainer.appendChild(newInput);
            });
        }

        if (decisionForm) {
            decisionForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const options = Array.from(optionsContainer.querySelectorAll('input')).map(input => input.value);
                const newDecision = {
                    id: `dec_${Date.now()}`,
                    title: decisionTitleInput.value,
                    options: options
                };
                
                localSessionData.decisions.push(newDecision);
                roomRef.update({ decisions: localSessionData.decisions })
                    .then(() => {
                        renderSavedDecisions();
                        decisionForm.reset();
                        optionsContainer.innerHTML = '<input type="text" class="decision-option-input" placeholder="Opção 1" required><input type="text" class="decision-option-input" placeholder="Opção 2" required>';
                    });
            });
        }
    }
    
    // --- FUNÇÕES AUXILIARES (Decisões, Timer) ---
    
    function renderSavedDecisions() {
        const savedDecisionsList = document.getElementById('saved-decisions-list');
        if(!savedDecisionsList) return;
        
        savedDecisionsList.innerHTML = '';
        localSessionData.decisions.forEach(decision => {
            const item = document.createElement('div');
            item.className = 'saved-decision-item';
            item.innerHTML = `<span>${decision.title}</span><button class="submit-btn small-btn" data-id="${decision.id}">Enviar</button>`;
            savedDecisionsList.appendChild(item);
        });
        
        savedDecisionsList.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const decisionId = btn.dataset.id;
                const playerChoiceFeedback = document.getElementById('player-choice-feedback');

                roomRef.update({
                    liveDecision: decisionId,
                    playerChoice: null 
                }).then(() => {
                    if(playerChoiceFeedback) playerChoiceFeedback.textContent = 'Aguardando jogador...';
                    
                    const decisionOverlay = document.getElementById('player-decision-overlay');
                    const decisionTitle = document.getElementById('decision-title');
                    const optionsContainer = document.getElementById('decision-options-container');
                    const activeDecision = localSessionData.decisions.find(d => d.id === decisionId);
                    
                    if (activeDecision && decisionOverlay) {
                        decisionTitle.textContent = activeDecision.title;
                        optionsContainer.innerHTML = '';
                        activeDecision.options.forEach(optionText => {
                            const btn = document.createElement('button');
                            btn.className = 'submit-btn';
                            btn.textContent = optionText;
                            btn.disabled = true;
                            optionsContainer.appendChild(btn);
                        });
                        decisionOverlay.classList.remove('hidden');
                    }
                });
            });
        });
    }

    function startTimer(startTime) {
        if (timerInterval) return;
        let mainTime = 21 * 60;
        let extraTime = 7 * 60;
        let isExtraTime = false;
        
        timerInterval = setInterval(() => {
            const elapsedSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
            const totalDuration = (21 * 60) + (7 * 60);
            let currentTime;

            if (elapsedSeconds >= totalDuration) {
                currentTime = 0;
                clearInterval(timerInterval);
                alert('O tempo acabou!');
            } else {
                const remainingTotalSeconds = totalDuration - elapsedSeconds;
                if (remainingTotalSeconds > (7 * 60)) {
                    isExtraTime = false;
                    currentTime = remainingTotalSeconds - (7 * 60);
                } else {
                    isExtraTime = true;
                    currentTime = remainingTotalSeconds;
                    document.querySelectorAll('.timer-display').forEach(el => el.classList.add('extra-time'));
                }
            }
            updateTimerDisplay(currentTime, 'host-timer-display');
        }, 1000);
    }
    
    function updateTimerDisplay(timeInSeconds, elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = timeInSeconds % 60;
        element.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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

    // --- OUVINTE DE ATUALIZAÇÕES DO JOGADOR (Firebase) ---
    function listenForPlayerUpdates() {
        roomRef.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (!data) return;

            const feedbackEl = document.getElementById('player-choice-feedback');
            if (feedbackEl && data.playerChoice) {
                feedbackEl.textContent = `Jogador escolheu: "${data.playerChoice}"`;
                const decisionOverlay = document.getElementById('player-decision-overlay');
                if (decisionOverlay) {
                    decisionOverlay.classList.add('hidden');
                }
                roomRef.update({ playerChoice: null }); 
            }
        });
    }

});