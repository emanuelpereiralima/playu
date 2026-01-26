document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Iniciando Sala Host...");

    // 1. VERIFICAÇÃO DE SEGURANÇA DO FIREBASE
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        console.error("ERRO CRÍTICO: Firebase não inicializado. Verifique a importação do firebase-config.js no HTML.");
        alert("Erro de configuração: Banco de dados não conectado.");
        return;
    }

    const db = firebase.firestore();
    
    // --- REFERÊNCIAS DOM (INTERFACE) ---
    const localVideo = document.getElementById('host-local-video');
    const remoteVideo = document.getElementById('host-remote-video');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    // Listas de Conteúdo
    const assetsList = document.getElementById('host-assets-list');
    const decisionsList = document.getElementById('host-decisions-list');

    // Timer Elements
    const timerDisplay = document.getElementById('session-timer');
    const timerInfo = document.getElementById('timer-info-display');
    const startBtn = document.getElementById('timer-start-btn');
    const pauseBtn = document.getElementById('timer-pause-btn');
    const resetBtn = document.getElementById('timer-reset-btn');

    // Invite Modal Elements
    const inviteModal = document.getElementById('invite-floating-modal');
    const inviteInput = document.getElementById('floating-invite-link');
    const copyBtn = document.getElementById('floating-copy-btn');
    const reopenBtn = document.getElementById('reopen-invite-btn');

    // --- VARIÁVEIS DE ESTADO ---
    let roomRef = null;
    let localStream = null;   // Stream atual (pode ser Webcam ou Vídeo)
    let cameraStream = null;  // Backup da Webcam original
    let pc = null;
    
    // Configuração ICE (STUN e TURN)
    const servers = {
        iceServers: [
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            // TURN servers (exemplo Metered.ca)
            { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
            { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
            { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
        ]
    };

    // Estado do Timer
    let timerInterval = null;
    let timerSeconds = 0;
    let timerRunning = false;
    let timerConfig = { 
        type: 'regressive', 
        font: "'Orbitron', sans-serif", 
        color: '#ff0000', 
        initialTime: 3600 
    };

    // --- URL PARAMS & AUTH ---
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    const isTestMode = urlParams.get('mode') === 'test';

    const sessionData = sessionStorage.getItem('loggedInUser');
    if (!sessionData && !isTestMode) {
        alert("Sessão expirada. Faça login novamente.");
        window.location.href = 'login.html';
        return;
    }

    if (!bookingId) {
        alert("ID de sessão inválido.");
        window.location.href = 'admin.html';
        return;
    }

    // =========================================================================
    // 1. INICIALIZAÇÃO DA SESSÃO
    // =========================================================================
    async function initSession() {
        try {
            console.log("🔍 Conectando à sessão:", bookingId);
            
            roomRef = db.collection('sessions').doc(bookingId);
            
            const sessionDoc = await roomRef.get();
            if (!sessionDoc.exists) {
                await roomRef.set({ 
                    created: firebase.firestore.FieldValue.serverTimestamp(),
                    hostStatus: 'online'
                });
            } else {
                await roomRef.update({ hostStatus: 'online' });
            }

            setupInviteLink();

            const bookingDoc = await db.collection('bookings').doc(bookingId).get();
            if (bookingDoc.exists) {
                const data = bookingDoc.data();
                if (data.gameId) {
                    await loadGameData(data.gameId);
                }
            } else {
                console.warn("Agendamento não encontrado (Modo Teste ou Erro).");
            }

            await startHost();

            if (loadingOverlay) {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => loadingOverlay.style.display = 'none', 500);
            }

        } catch (error) {
            console.error("Erro fatal:", error);
            alert("Erro ao iniciar sessão: " + error.message);
        }
    }

    // =========================================================================
    // 2. LÓGICA DE CONVITE
    // =========================================================================
    function setupInviteLink() {
        if (!bookingId) return;

        const guestLink = `${window.location.origin}/sala.html?bookingId=${bookingId}&guest=true`;
        if (inviteInput) inviteInput.value = guestLink;

        if (inviteModal) {
            inviteModal.classList.remove('hidden');
            setTimeout(() => {
                inviteModal.classList.add('hidden');
            }, 120000);
        }

        if (reopenBtn) {
            reopenBtn.onclick = () => inviteModal.classList.remove('hidden');
        }

        if (copyBtn && inviteInput) {
            copyBtn.onclick = () => {
                inviteInput.select();
                inviteInput.setSelectionRange(0, 99999);
                navigator.clipboard.writeText(guestLink).then(() => {
                    const originalIcon = copyBtn.innerHTML;
                    copyBtn.classList.add('copied');
                    copyBtn.innerHTML = '<ion-icon name="checkmark-outline"></ion-icon>';
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyBtn.innerHTML = originalIcon;
                    }, 2000);
                }).catch(err => alert("Erro ao copiar link"));
            };
        }
    }

    // =========================================================================
    // 3. CARREGAMENTO DE DADOS DO JOGO
    // =========================================================================
    async function loadGameData(gameId) {
        try {
            // Usa onSnapshot para atualizações em tempo real (opcional, mas recomendado)
            db.collection('games').doc(gameId).onSnapshot(doc => {
                if (!doc.exists) return;
                const game = doc.data();
                renderAssets(game.sessionAssets || []);
                renderDecisions(game.decisions || []);
                // Configura timer apenas na primeira carga para não resetar
                if (!timerRunning && timerSeconds === 0) setupTimer(game);
            });
        } catch (e) {
            console.error("Erro ao carregar dados do jogo:", e);
        }
    }

    // =========================================================================
    // 4. LÓGICA DO TIMER
    // =========================================================================
    function setupTimer(game) {
        const settings = game.timerSettings || {};
        
        timerConfig.type = settings.type || 'regressive';
        timerConfig.font = settings.font || "'Orbitron', sans-serif";
        timerConfig.color = settings.color || '#ff0000';
        
        if (timerConfig.type === 'regressive') {
            const duration = parseInt(game.sessionDuration) || 60;
            timerConfig.initialTime = duration * 60;
            timerSeconds = timerConfig.initialTime;
        } else {
            timerConfig.initialTime = 0;
            timerSeconds = 0;
        }

        applyTimerStyles();
        updateTimerDisplay();
    }

    function applyTimerStyles() {
        if (!timerDisplay) return;
        timerDisplay.style.fontFamily = timerConfig.font;
        timerDisplay.style.color = timerConfig.color;
        
        if (timerInfo) {
            timerInfo.textContent = timerConfig.type === 'progressive' 
                ? 'MODO: CRESCENTE' 
                : 'MODO: REGRESSIVO';
        }
    }

    function updateTimerDisplay() {
        if (!timerDisplay) return;
        
        const h = Math.floor(timerSeconds / 3600);
        const m = Math.floor((timerSeconds % 3600) / 60);
        const s = timerSeconds % 60;

        let text = '';
        if (h > 0) {
            text = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        } else {
            text = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }
        timerDisplay.textContent = text;
    }

    function startTimer() {
        if (timerRunning) return;
        timerRunning = true;
        toggleTimerControls(true);
        
        timerInterval = setInterval(() => {
            if (timerConfig.type === 'progressive') {
                timerSeconds++;
            } else {
                if (timerSeconds > 0) timerSeconds--;
                else stopTimer();
            }
            updateTimerDisplay();
            syncTimerToFirebase();
        }, 1000);
    }

    function stopTimer() {
        timerRunning = false;
        clearInterval(timerInterval);
        toggleTimerControls(false);
        syncTimerToFirebase();
    }

    function resetTimer() {
        stopTimer();
        timerSeconds = timerConfig.initialTime;
        updateTimerDisplay();
        syncTimerToFirebase();
    }

    window.adjustTimer = (minutes) => {
        timerSeconds += (minutes * 60);
        if (timerSeconds < 0) timerSeconds = 0;
        updateTimerDisplay();
        syncTimerToFirebase();
    };

    function toggleTimerControls(isRunning) {
        if (startBtn) {
            startBtn.disabled = isRunning;
            startBtn.style.opacity = isRunning ? '0.5' : '1';
        }
        if (pauseBtn) {
            pauseBtn.disabled = !isRunning;
            pauseBtn.style.opacity = !isRunning ? '0.5' : '1';
        }
    }

    function syncTimerToFirebase() {
        if (!roomRef) return;
        roomRef.update({
            timer: {
                value: timerSeconds,
                isRunning: timerRunning,
                totalTime: timerConfig.initialTime,
                type: timerConfig.type,
                font: timerConfig.font,
                color: timerConfig.color,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }
        }).catch(err => {});
    }

    if (startBtn) startBtn.onclick = startTimer;
    if (pauseBtn) pauseBtn.onclick = stopTimer;
    if (resetBtn) resetBtn.onclick = resetTimer;


    // =========================================================================
    // 5. RENDERIZAÇÃO DE MÍDIAS (ASSETS) COM VÍDEO NA CÂMERA
    // =========================================================================
    function renderAssets(assets) {
        if (!assetsList) return;
        assetsList.innerHTML = '';

        if (assets.length === 0) {
            assetsList.innerHTML = '<p style="padding:10px; color:#aaa; font-size:0.9rem;">Nenhuma mídia cadastrada.</p>';
            return;
        }

        assets.forEach(asset => {
            const btn = document.createElement('div');
            btn.className = 'asset-btn';
            btn.style.cssText = `
                display: flex; align-items: center; gap: 10px;
                background: rgba(255,255,255,0.05); padding: 10px;
                border-radius: 6px; cursor: pointer; margin-bottom: 5px;
                border: 1px solid transparent; transition: 0.2s;
            `;
            
            let icon = 'document';
            if(asset.type === 'image') icon = 'image';
            if(asset.type === 'video') icon = 'videocam';
            if(asset.type === 'audio') icon = 'musical-notes';

            btn.innerHTML = `
                <ion-icon name="${icon}-outline" style="font-size:1.2rem; color:#00ff88;"></ion-icon>
                <div style="flex:1; overflow:hidden;">
                    <div style="font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${asset.name}</div>
                </div>
                ${asset.type === 'video' ? '<ion-icon name="play-circle-outline" title="Tocar na Câmera"></ion-icon>' : '<ion-icon name="send-outline"></ion-icon>'}
            `;

            btn.onclick = () => {
                // Envia para a tela do jogador (pop-up ou background)
                sendMediaToPlayer(asset, btn);

                // SE FOR VÍDEO, TOCA NA CÂMERA DO HOST
                if (asset.type === 'video') {
                    playVideoInHostCamera(asset.url);
                }
            };
            assetsList.appendChild(btn);
        });

        // Botão para restaurar a câmera (aparece sempre no final da lista)
        const stopBtn = document.createElement('button');
        stopBtn.className = 'submit-btn small-btn danger-btn';
        stopBtn.style.cssText = "width: 100%; margin-top: 15px; background: #333; border: 1px solid #444;";
        stopBtn.innerHTML = '<ion-icon name="stop-circle-outline"></ion-icon> Restaurar Webcam';
        stopBtn.onclick = restoreCamera;
        assetsList.appendChild(stopBtn);
    }

    async function sendMediaToPlayer(asset, btnElement) {
        if (!roomRef) return;
        
        btnElement.style.background = 'rgba(0, 255, 136, 0.2)';
        btnElement.style.borderColor = '#00ff88';

        try {
            await roomRef.update({
                liveMedia: {
                    type: asset.type,
                    url: asset.url,
                    name: asset.name,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }
            });
            console.log("Mídia enviada:", asset.name);
        } catch (e) {
            console.error("Erro ao enviar mídia:", e);
        }

        setTimeout(() => {
            btnElement.style.background = 'rgba(255,255,255,0.05)';
            btnElement.style.borderColor = 'transparent';
        }, 500);
    }

// =========================================================================
    // 5.1. FUNÇÕES DE VÍDEO NA CÂMERA (COM ÁUDIO)
    // =========================================================================
    async function playVideoInHostCamera(videoUrl) {
        if (!localVideo) return;

        // 1. Backup da Câmera e Microfone originais
        if (!cameraStream && localStream) {
            cameraStream = localStream; 
        }

        console.log("🎬 Trocando câmera/mic por vídeo:", videoUrl);

        try {
            localVideo.crossOrigin = "anonymous"; // Importante para CORS
            
            // 2. Define o vídeo no elemento local
            localVideo.srcObject = null;
            localVideo.src = videoUrl;
            
            // IMPORTANTE: Host precisa ouvir o vídeo, então desmutamos.
            // (Use fones de ouvido para evitar que o som do vídeo entre no seu microfone físico se algo der errado)
            localVideo.muted = false; 
            localVideo.loop = false;
            
            await localVideo.play();

            // 3. Captura o stream do vídeo (Imagem + Áudio)
            let videoStream = null;
            if (localVideo.captureStream) {
                videoStream = localVideo.captureStream();
            } else if (localVideo.mozCaptureStream) {
                videoStream = localVideo.mozCaptureStream();
            }

            if (videoStream && pc) {
                const senders = pc.getSenders();

                // 4. Substitui a trilha de VÍDEO
                const videoTrack = videoStream.getVideoTracks()[0];
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender && videoTrack) {
                    videoSender.replaceTrack(videoTrack);
                }

                // 5. Substitui a trilha de ÁUDIO (Para o jogador ouvir o som do vídeo, não o mic)
                const audioTrack = videoStream.getAudioTracks()[0];
                const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                if (audioSender && audioTrack) {
                    audioSender.replaceTrack(audioTrack);
                    console.log("🔊 Áudio do microfone substituído pelo áudio do vídeo.");
                }

                // 6. Quando acabar, restaura tudo
                localVideo.onended = () => {
                    console.log("Video acabou. Restaurando...");
                    restoreCamera();
                };
            }
        } catch (e) {
            console.error("Erro ao tocar vídeo:", e);
            alert("Erro ao reproduzir mídia. Verifique permissões/CORS.");
            restoreCamera();
        }
    }

    async function restoreCamera() {
        if (!cameraStream || !localVideo) {
            console.warn("Backup da câmera não encontrado.");
            return;
        }

        console.log("📷 Restaurando Webcam e Microfone...");
        
        // 1. Restaura visual local
        localVideo.src = "";
        localVideo.srcObject = cameraStream;
        localVideo.muted = true; // Muta localmente para evitar eco da própria voz
        
        if (pc) {
            const senders = pc.getSenders();

            // 2. Restaura trilha de VÍDEO da Webcam
            const camVideoTrack = cameraStream.getVideoTracks()[0];
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            if (videoSender && camVideoTrack) {
                videoSender.replaceTrack(camVideoTrack);
            }

            // 3. Restaura trilha de ÁUDIO do Microfone
            const camAudioTrack = cameraStream.getAudioTracks()[0];
            const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
            if (audioSender && camAudioTrack) {
                audioSender.replaceTrack(camAudioTrack);
                console.log("🎤 Microfone restaurado.");
            }
        }
    }

    async function restoreCamera() {
        if (!cameraStream || !localVideo) {
            console.warn("Nenhum backup de câmera encontrado.");
            return;
        }

        console.log("📷 Restaurando Webcam...");
        
        // Volta o srcObject para a câmera
        localVideo.src = "";
        localVideo.srcObject = cameraStream;
        
        // Substitui a trilha WebRTC de volta para a câmera
        if (pc) {
            const videoTrack = cameraStream.getVideoTracks()[0];
            const senders = pc.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            
            if (videoSender) {
                videoSender.replaceTrack(videoTrack);
            }
        }
    }


    // =========================================================================
    // 6. RENDERIZAÇÃO DE DECISÕES
    // =========================================================================
    function renderDecisions(decisions) {
        if (!decisionsList) return;
        decisionsList.innerHTML = '';

        if (!decisions || decisions.length === 0) {
            decisionsList.innerHTML = '<p style="padding:10px; color:#aaa; font-size:0.9rem; text-align:center;">Nenhuma decisão cadastrada.</p>';
            return;
        }

        decisions.forEach(dec => {
            const card = document.createElement('div');
            card.className = 'decision-card';
            card.style.cssText = `
                background: rgba(0, 0, 0, 0.3); padding: 10px; border-radius: 6px;
                margin-bottom: 8px; border-left: 3px solid var(--secondary-color);
                display: flex; justify-content: space-between; align-items: center;
                cursor: pointer; transition: 0.2s;
            `;

            const optsHtml = dec.options.map((o, idx) => 
                `<span style="font-size:0.75rem; background:rgba(255,255,255,0.1); padding:2px 5px; border-radius:3px; margin-right:5px;">${String.fromCharCode(65+idx)}. ${o}</span>`
            ).join('');

            card.innerHTML = `
                <div style="flex:1;">
                    <div style="font-weight:bold; color:#fff; font-size:0.95rem; margin-bottom:4px;">${dec.question}</div>
                    <div style="display:flex; flex-wrap:wrap; gap:5px; color:#aaa;">${optsHtml}</div>
                </div>
                <div style="font-size:1.2rem; color:var(--secondary-color); padding-left:10px;">
                    <ion-icon name="send-outline"></ion-icon>
                </div>
            `;

            card.onclick = () => sendDecisionToPlayer(dec, card);
            decisionsList.appendChild(card);
        });
    }

    async function sendDecisionToPlayer(decision, cardElement) {
        if (!roomRef) return;
        
        cardElement.style.background = 'rgba(233, 69, 96, 0.2)';

        try {
            await roomRef.update({
                activeDecision: {
                    question: decision.question,
                    options: decision.options,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    status: 'active'
                }
            });
            console.log("Decisão enviada:", decision.question);
        } catch (e) {
            console.error("Erro ao enviar decisão:", e);
        }

        setTimeout(() => {
            cardElement.style.background = 'rgba(0, 0, 0, 0.3)';
        }, 500);
    }

    window.clearPlayerDecision = async () => {
        if(!roomRef) return;
        try {
            await roomRef.update({ activeDecision: null });
            alert("Decisão removida da tela do jogador.");
        } catch(e) { console.error(e); }
    };


    // =========================================================================
    // 7. WEBRTC (VÍDEO E ÁUDIO)
    // =========================================================================
    async function startHost() {
        console.log("📷 Iniciando Câmera...");
        pc = new RTCPeerConnection(servers);

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            
            // Salva backup da câmera para poder restaurar depois do vídeo
            cameraStream = localStream; 

            if (localVideo) localVideo.srcObject = localStream;
            
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });

            setupMediaControls();

        } catch (err) {
            console.error("Erro ao acessar câmera/microfone:", err);
            alert("Aviso: Não foi possível acessar a câmera ou microfone. Verifique as permissões do navegador.");
        }

        pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                if (remoteVideo) remoteVideo.srcObject = event.streams[0];
            }
        };

        const offerCandidates = roomRef.collection('offerCandidates');
        const answerCandidates = roomRef.collection('answerCandidates');

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                offerCandidates.add(event.candidate.toJSON());
            }
        };

        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);

        await roomRef.set({ 
            offer: {
                sdp: offerDescription.sdp,
                type: offerDescription.type,
            } 
        }, { merge: true });

        roomRef.onSnapshot((snapshot) => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                const answerDescription = new RTCSessionDescription(data.answer);
                pc.setRemoteDescription(answerDescription);
            }
        });

        answerCandidates.onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate);
                }
            });
        });
    }

    function setupMediaControls() {
        const micBtn = document.getElementById('host-mic-btn');
        const camBtn = document.getElementById('host-cam-btn');
        const endBtn = document.getElementById('end-call-btn');

        if (micBtn && localStream) {
            micBtn.onclick = () => {
                const track = localStream.getAudioTracks()[0];
                if (track) {
                    track.enabled = !track.enabled;
                    micBtn.classList.toggle('active', !track.enabled);
                    micBtn.innerHTML = track.enabled 
                        ? '<ion-icon name="mic-outline"></ion-icon>' 
                        : '<ion-icon name="mic-off-outline"></ion-icon>';
                }
            };
        }

        if (camBtn && localStream) {
            camBtn.onclick = () => {
                const track = localStream.getVideoTracks()[0];
                if (track) {
                    track.enabled = !track.enabled;
                    
                    // --- LÓGICA DO GIF ---
                    if (track.enabled) {
                        // Câmera ligada: Mostra vídeo, esconde GIF (video opacidade 1)
                        localVideo.classList.remove('camera-off');
                        camBtn.innerHTML = '<ion-icon name="videocam-outline"></ion-icon>';
                        camBtn.classList.remove('active'); // Remove estilo de desativado
                    } else {
                        // Câmera desligada: Esconde vídeo, revela GIF (video opacidade 0)
                        localVideo.classList.add('camera-off');
                        camBtn.innerHTML = '<ion-icon name="videocam-off-outline"></ion-icon>';
                        camBtn.classList.add('active'); // Adiciona estilo de desativado
                    }
                }
            };
        }

        if (endBtn) {
            endBtn.onclick = () => {
                if (confirm("Deseja realmente encerrar a sessão e voltar?")) {
                    if(roomRef) roomRef.update({ hostStatus: 'offline' });
                    
                    if(localStream) localStream.getTracks().forEach(track => track.stop());
                    if(pc) pc.close();

                    window.location.href = 'admin.html';
                }
            };
        }
    }

    // INICIA TUDO
    initSession();
});