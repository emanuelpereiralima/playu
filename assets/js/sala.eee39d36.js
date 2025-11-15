document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DE VÍDEO E ESTADO ---
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    
    let localStream = null;
    let pc = null; // RTCPeerConnection
    let roomRef = null;
    let timerInterval = null;
    let isAnswerSent = false; // Flag para evitar criar múltiplas respostas

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

    if (!bookingId || !session) {
        accessMsgContainer.innerHTML = '<h1>Sessão Inválida</h1><p>Este link de agendamento não é válido ou expirou.</p>';
        accessMsgContainer.style.display = 'flex';
        return;
    }
    if (!loggedInUser || session.userId !== loggedInUser.username) {
        accessMsgContainer.innerHTML = '<h1>Acesso Negado</h1><p>Você não tem permissão para entrar nesta sessão. Este convite é válido apenas para o usuário que fez o agendamento.</p><a href="login.html" class="submit-btn" style="text-decoration:none; margin-top:1rem;">Fazer Login</a>';
        accessMsgContainer.style.display = 'flex';
        return;
    }

    // --- INICIALIZAÇÃO DA SALA ---
    // Referência do Firestore para esta sala de jogo
    roomRef = db.collection('sessions').doc(bookingId);

    initPlayerView();

    // --- FUNÇÃO PRINCIPAL DE INICIALIZAÇÃO ---
    async function initPlayerView() {
        document.getElementById('player-view').classList.remove('hidden');
        
        // Inicia o WebRTC para "atender" a chamada
        await setupWebRTC();
        
        // Configura os ouvintes de botões e de estado do jogo (dicas, timer)
        setupPlayerListeners();
    }

    // --- LÓGICA DO WEBRTC (PASSO 3) ---

    async function setupWebRTC() {
        pc = new RTCPeerConnection(servers);

        // 1. Pega a câmera/mic do jogador
        await setupLocalMedia();

        // 2. O que fazer quando o stream do host chegar
        pc.ontrack = event => {
            console.log('Recebendo stream remoto do host...');
            if (event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            } else {
                let inboundStream = new MediaStream(event.track);
                remoteVideo.srcObject = inboundStream;
            }
        };

        // 3. Responde à "Oferta" do host
        await answerOffer();
    }

    async function setupLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;

            // Adiciona as trilhas (áudio/vídeo) à conexão
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
            
            // Habilita os botões de mic/câmera
            setupMediaControls(true, 'player');
        } catch (err) {
            console.error("Erro ao acessar a câmera/microfone:", err);
            alert("Não foi possível acessar sua câmera e microfone. Verifique as permissões do navegador.");
        }
    }

    async function answerOffer() {
        const offerCandidates = roomRef.collection('offerCandidates');
        const answerCandidates = roomRef.collection('answerCandidates');

        // 1. Ouve os candidates ICE locais e salva no Firebase
        pc.onicecandidate = event => {
            if (event.candidate) {
                console.log('Jogador: Enviando candidate ICE:', event.candidate.toJSON());
                answerCandidates.add(event.candidate.toJSON());
            }
        };

        // 2. Ouve a "Oferta" do host
        roomRef.onSnapshot(async (snapshot) => {
            const data = snapshot.data();
            // Se a oferta chegar E ainda não respondemos
            if (data?.offer && !isAnswerSent) {
                isAnswerSent = true; // Marca que já estamos respondendo
                console.log('Jogador: Recebendo oferta do host...');
                
                // 3. Define a oferta do host como descrição remota
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

                // 4. Cria a "Resposta"
                const answerDescription = await pc.createAnswer();
                await pc.setLocalDescription(answerDescription);

                const answer = {
                    type: answerDescription.type,
                    sdp: answerDescription.sdp,
                };

                // 5. Salva a resposta no Firebase para o host ver
                await roomRef.update({ answer });
                console.log('Jogador: Resposta enviada ao Firebase');
            }
        });

        // 6. Ouve os candidates ICE do host e adiciona à conexão
        offerCandidates.onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    console.log('Jogador: Adicionando offer candidate do host');
                    pc.addIceCandidate(candidate);
                }
            });
        });
    }

    // --- CONTROLES DE MÍDIA (Função antiga, mantida) ---
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

    // --- LÓGICA DOS OUYINTES DO JOGADOR (Refatorado para Firebase) ---
    function setupPlayerListeners() {
        // Configura botões de UI
        document.getElementById('player-hints-btn').onclick = () => {
            document.getElementById('player-hints-overlay').classList.toggle('hidden');
        };
        document.getElementById('close-hints-btn').onclick = () => {
            document.getElementById('player-hints-overlay').classList.add('hidden');
        };
        document.getElementById('player-exit-btn').onclick = () => {
            window.location.href = 'dashboard.html';
        };

        // OUVINTE PRINCIPAL: Ouve todas as mudanças de estado do jogo vindas do host
        roomRef.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (!data) return;

            // 1. Sincronizar Timer
            if (data.startTime && !timerInterval) {
                startTimer(data.startTime.toDate());
            }

            // 2. Sincronizar Dicas
            if (data.hints) {
                document.querySelector('[data-hint-id="1"]').textContent = data.hints['1'] || '(Aguardando host...)';
                document.querySelector('[data-hint-id="2"]').textContent = data.hints['2'] || '(Aguardando host...)';
                document.querySelector('[data-hint-id="3"]').textContent = data.hints['3'] || '(Aguardando host...)';
            }
            
            // 3. Sincronizar Estilo do Timer
            if (data.timerStyle) {
                applyTimerStyles(data.timerStyle);
            }

            // 4. Receber Decisões
            if (data.liveDecision) {
                // O host enviou uma decisão, vamos renderizá-la
                renderLiveDecision(data.liveDecision, data.decisions || []);
            }
            
            // 5. Receber Mídia
            if (data.liveMedia) {
                showMediaInOverlay(data.liveMedia.src, data.liveMedia.type);
                // Limpa a mídia para não mostrar de novo
                roomRef.update({ liveMedia: null });
            }
        });
    }

    // --- RENDERIZAÇÃO DE DECISÕES (Refatorado para Firebase) ---
    function renderLiveDecision(decisionId, allDecisions) {
        const activeDecision = allDecisions.find(d => d.id === decisionId);
        if (!activeDecision) return;
        
        const overlay = document.getElementById('player-decision-overlay');
        const titleEl = document.getElementById('decision-title');
        const optionsContainer = document.getElementById('decision-options-container');

        titleEl.textContent = activeDecision.title;
        optionsContainer.innerHTML = ''; // Limpa opções antigas

        activeDecision.options.forEach(optionText => {
            const button = document.createElement('button');
            button.className = 'submit-btn';
            button.textContent = optionText;
            button.onclick = () => {
                // NOVO: Envia a escolha para o Firebase
                roomRef.update({
                    playerChoice: optionText,
                    liveDecision: null // Limpa a decisão ativa
                });
                overlay.classList.add('hidden'); // Esconde o overlay
            };
            optionsContainer.appendChild(button);
        });

        overlay.classList.remove('hidden');
    }

function showMediaInOverlay(src, type) {
    const mediaOverlay = document.getElementById('player-media-overlay');
    const mediaContent = document.getElementById('media-content');
    if (!mediaOverlay || !mediaContent) return;

    mediaContent.innerHTML = ''; // Limpa mídia anterior
    
    let media;
    
    if (type.startsWith('image')) {
        media = document.createElement('img');
        media.src = src;
        mediaContent.appendChild(media);
        mediaOverlay.classList.remove('hidden'); // Mostra overlay para imagem
    } 
    else if (type.startsWith('video')) {
        media = document.createElement('video');
        media.src = src;
        media.autoplay = true;
        media.controls = true;
        mediaContent.appendChild(media);
        mediaOverlay.classList.remove('hidden'); // Mostra overlay para vídeo
    }
    else if (type.startsWith('audio')) {
        media = document.createElement('audio');
        media.src = src;
        media.autoplay = true;
        media.controls = false; // Sons de "efeito" não precisam de controle
        mediaContent.appendChild(media);
        // NÃO mostra o overlay para áudio, apenas toca
        mediaOverlay.classList.add('hidden'); 
        console.log('Tocando áudio enviado pelo host...');
        return; // Sai da função mais cedo
    }

    // Botão de fechar só se aplica a imagem/vídeo
    document.getElementById('close-media-btn').onclick = () => {
        mediaOverlay.classList.add('hidden');
        mediaContent.innerHTML = '';
    };
}
    
    // --- LÓGICA DO TIMER (Copiada do host) ---
    function startTimer(startTime) {
        if (timerInterval) return;

        let mainTime = 21 * 60;
        let extraTime = 7 * 60;
        let isExtraTime = false;
        
        const timerDisplay = document.getElementById('player-timer-overlay');

        timerInterval = setInterval(() => {
            const elapsedSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
            const totalDuration = (21 * 60) + (7 * 60);
            let currentTime;

            if (elapsedSeconds >= totalDuration) {
                currentTime = 0;
                clearInterval(timerInterval);
            } else {
                const remainingTotalSeconds = totalDuration - elapsedSeconds;
                if (remainingTotalSeconds > (7 * 60)) {
                    isExtraTime = false;
                    currentTime = remainingTotalSeconds - (7 * 60);
                } else {
                    isExtraTime = true;
                    currentTime = remainingTotalSeconds;
                    if(timerDisplay) timerDisplay.classList.add('extra-time');
                }
            }
            updateTimerDisplay(currentTime, 'player-timer-overlay');
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
        const timerElement = document.getElementById('player-timer-overlay');
        if (styleData && timerElement) {
            timerElement.style.color = styleData.color || 'white';
            timerElement.style.borderColor = styleData.color || 'white';
            timerElement.style.fontFamily = styleData.font || "'Poppins', sans-serif";
        }
    }
});