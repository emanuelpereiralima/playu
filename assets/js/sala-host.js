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
    let localStream = null;
    let pc = null;
    const servers = { iceServers: [{ urls: 'stun:stun1.l.google.com:19302' }] };

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
            
            // Referência da Sala no Firestore
            roomRef = db.collection('sessions').doc(bookingId);
            
            // Garante que o documento existe
            const sessionDoc = await roomRef.get();
            if (!sessionDoc.exists) {
                await roomRef.set({ 
                    created: firebase.firestore.FieldValue.serverTimestamp(),
                    hostStatus: 'online'
                });
            } else {
                await roomRef.update({ hostStatus: 'online' });
            }

            // Lógica do Link de Convite (Modal Flutuante)
            setupInviteLink();

            // Carrega dados do Jogo (Mídias, Decisões, Timer)
            const bookingDoc = await db.collection('bookings').doc(bookingId).get();
            if (bookingDoc.exists) {
                const data = bookingDoc.data();
                if (data.gameId) {
                    await loadGameData(data.gameId);
                }
            } else {
                console.warn("Agendamento não encontrado (Modo Teste ou Erro).");
            }

            // Inicia Câmera e WebRTC
            await startHost();

            // Remove Loading
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
    // 2. LÓGICA DE CONVITE (LINK FLUTUANTE)
    // =========================================================================
    function setupInviteLink() {
        if (!bookingId) return;

        // 1. Gera o Link com guest=true
        const guestLink = `${window.location.origin}/sala.html?bookingId=${bookingId}&guest=true`;
        if (inviteInput) inviteInput.value = guestLink;

        // 2. Configura Timer para fechar modal (2 minutos)
        if (inviteModal) {
            inviteModal.classList.remove('hidden'); // Garante que abre
            setTimeout(() => {
                inviteModal.classList.add('hidden');
            }, 120000); // 120.000 ms = 2 minutos
        }

        // 3. Botão para Reabrir (na Sidebar)
        if (reopenBtn) {
            reopenBtn.onclick = () => {
                inviteModal.classList.remove('hidden');
            };
        }

        // 4. Botão Copiar
        if (copyBtn && inviteInput) {
            copyBtn.onclick = () => {
                inviteInput.select();
                inviteInput.setSelectionRange(0, 99999); // Mobile
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
            const doc = await db.collection('games').doc(gameId).get();
            if (!doc.exists) return;

            const game = doc.data();

            // A. Renderizar Mídias (Assets)
            renderAssets(game.sessionAssets || []);

            // B. Renderizar Decisões (Enquetes)
            renderDecisions(game.decisions || []);

            // C. Configurar Timer
            setupTimer(game);

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
        
        // Define tempo inicial
        if (timerConfig.type === 'regressive') {
            const duration = parseInt(game.sessionDuration) || 60;
            timerConfig.initialTime = duration * 60; // Converte para segundos
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
                else stopTimer(); // Acabou o tempo
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

    // Função Global para Ajuste Rápido (+1m, -5m)
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

    // Envia estado para o banco (para o jogador ver)
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
        }).catch(err => console.log("Skip sync frame"));
    }

    // Listeners do Timer
    if (startBtn) startBtn.onclick = startTimer;
    if (pauseBtn) pauseBtn.onclick = stopTimer;
    if (resetBtn) resetBtn.onclick = resetTimer;


    // =========================================================================
    // 5. RENDERIZAÇÃO DE MÍDIAS (ASSETS)
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
                <ion-icon name="send-outline"></ion-icon>
            `;

            btn.onclick = () => {
                sendMediaToPlayer(asset, btn);
            };
            assetsList.appendChild(btn);
        });
    }

    async function sendMediaToPlayer(asset, btnElement) {
        if (!roomRef) return;
        
        // Feedback Visual
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

        // Remove destaque
        setTimeout(() => {
            btnElement.style.background = 'rgba(255,255,255,0.05)';
            btnElement.style.borderColor = 'transparent';
        }, 500);
    }


    // =========================================================================
    // 6. RENDERIZAÇÃO DE DECISÕES (ENQUETES)
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
            alert("Erro ao enviar decisão.");
        }

        setTimeout(() => {
            cardElement.style.background = 'rgba(0, 0, 0, 0.3)';
        }, 500);
    }

    // Função Global para limpar a decisão da tela do jogador
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
            // Tenta pegar vídeo e áudio
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            
            // Mostra no elemento de vídeo local
            if (localVideo) localVideo.srcObject = localStream;
            
            // Adiciona as tracks na conexão Peer
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });

            setupMediaControls();

        } catch (err) {
            console.error("Erro ao acessar câmera/microfone:", err);
            alert("Aviso: Não foi possível acessar a câmera ou microfone. Verifique as permissões do navegador.");
        }

        // Quando receber vídeo do Jogador Remoto
        pc.ontrack = (event) => {
            console.log("📡 Stream remoto recebido!");
            if (event.streams && event.streams[0]) {
                if (remoteVideo) remoteVideo.srcObject = event.streams[0];
            }
        };

        // ICE Candidates
        const offerCandidates = roomRef.collection('offerCandidates');
        const answerCandidates = roomRef.collection('answerCandidates');

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                offerCandidates.add(event.candidate.toJSON());
            }
        };

        // Criar Oferta
        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);

        const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
        };

        await roomRef.set({ offer }, { merge: true });

        // Escuta a Resposta
        roomRef.onSnapshot((snapshot) => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                const answerDescription = new RTCSessionDescription(data.answer);
                pc.setRemoteDescription(answerDescription);
            }
        });

        // Escuta Candidatos ICE
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
                    camBtn.classList.toggle('active', !track.enabled);
                    camBtn.innerHTML = track.enabled 
                        ? '<ion-icon name="videocam-outline"></ion-icon>' 
                        : '<ion-icon name="videocam-off-outline"></ion-icon>';
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