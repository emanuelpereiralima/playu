document.addEventListener('DOMContentLoaded', async () => {
    console.log("🎮 Iniciando Sala do Jogador (Versão Final Corrigida)...");

    // 1. VERIFICAÇÃO DE SEGURANÇA
    if (typeof firebase === 'undefined') {
        console.error("Firebase SDK não carregado.");
        alert("Erro crítico: Sistema não carregado.");
        return;
    }

    const db = firebase.firestore();
    const auth = firebase.auth();

    // --- ELEMENTOS DOM ---
    const localVideo = document.getElementById('player-local-video'); 
    const remoteVideo = document.getElementById('player-remote-video');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    // Botões
    const micBtn = document.getElementById('mic-btn');
    const camBtn = document.getElementById('cam-btn');
    const exitBtn = document.getElementById('exit-btn');

    // --- VARIÁVEIS DE CONTROLE ---
    let roomRef = null;
    let localStream = null;
    let pc = null;
    
    // TIMESTAMP DE CONEXÃO
    const connectionTime = Date.now(); 

    // Travas para evitar repetição de mídia
    let lastMediaTimestamp = 0;
    let lastDecisionTimestamp = 0;

    const servers = {
        iceServers: [
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            // Adicione TURN servers aqui para produção
            { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
            { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
            { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
        ]
    };

    // --- URL PARAMS ---
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');
    const bookingId = urlParams.get('bookingId');
    const isGuest = urlParams.get('guest') === 'true';
    
    const currentRoomId = sessionId || bookingId;

    if (!currentRoomId) {
        alert("ID da sala não encontrado.");
        window.location.href = 'dashboard.html';
        return;
    }

    // =========================================================================
    // 1. INICIALIZAÇÃO
    // =========================================================================
    async function initPlayer() {
        // Inicializa os botões imediatamente (mesmo sem stream ainda)
        setupControls();

        if (!isGuest) {
            auth.onAuthStateChanged(user => {
                if (!user) window.location.href = 'login.html';
                else startConnection();
            });
        } else {
            startConnection();
        }
    }

    async function startConnection() {
        console.log("🔗 Conectando à sala:", currentRoomId);
        roomRef = db.collection('sessions').doc(currentRoomId);

        await setupLocalMedia();
        await setupWebRTC();

        if (loadingOverlay) {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => loadingOverlay.style.display = 'none', 500);
        }

        listenToRoomEvents();
    }

    // =========================================================================
    // 2. CONTROLES E MÍDIA LOCAL
    // =========================================================================
    function setupControls() {
        console.log("🎛️ Configurando controles...");

        if (micBtn) {
            micBtn.onclick = () => {
                if (!localStream) return console.warn("Stream ainda não carregado.");
                const track = localStream.getAudioTracks()[0];
                if (track) {
                    track.enabled = !track.enabled;
                    micBtn.innerHTML = track.enabled ? '<ion-icon name="mic-outline"></ion-icon>' : '<ion-icon name="mic-off-outline"></ion-icon>';
                    micBtn.classList.toggle('active', !track.enabled);
                }
            };
        }

        if (camBtn) {
            camBtn.onclick = () => {
                if (!localStream) return console.warn("Stream ainda não carregado.");
                const track = localStream.getVideoTracks()[0];
                if (track) {
                    track.enabled = !track.enabled;
                    
                    // Lógica do GIF
                    if (localVideo) {
                        if (track.enabled) {
                            localVideo.classList.remove('camera-off');
                            camBtn.innerHTML = '<ion-icon name="videocam-outline"></ion-icon>';
                        } else {
                            localVideo.classList.add('camera-off');
                            camBtn.innerHTML = '<ion-icon name="videocam-off-outline"></ion-icon>';
                        }
                    }
                    camBtn.classList.toggle('active', !track.enabled);
                }
            };
        }

        if (exitBtn) {
            exitBtn.onclick = () => {
                if (confirm("Sair da sala?")) {
                    if(localStream) localStream.getTracks().forEach(t => t.stop());
                    window.location.href = 'dashboard.html';
                }
            };
        }
    }

    async function setupLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            
            if (localVideo) {
                localVideo.srcObject = localStream;
                localVideo.muted = true; // Jogador não ouve o próprio eco
                localVideo.crossOrigin = "anonymous";
            }
        } catch (err) {
            console.warn("Sem câmera/mic:", err);
            // Não bloqueamos a entrada, mas os botões de mídia não funcionarão
        }
    }

    // =========================================================================
    // 3. WEBRTC
    // =========================================================================
    async function setupWebRTC() {
        pc = new RTCPeerConnection(servers);

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        pc.ontrack = (event) => {
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.crossOrigin = "anonymous";
            }
        };

        const answerCandidates = roomRef.collection('answerCandidates');
        pc.onicecandidate = (e) => {
            if (e.candidate) answerCandidates.add(e.candidate.toJSON());
        };

        // Escuta Oferta
        roomRef.onSnapshot(async (snapshot) => {
            const data = snapshot.data();
            if (data && data.offer && !pc.currentRemoteDescription) {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await roomRef.update({ answer: { type: answer.type, sdp: answer.sdp } });
            }
        });

        // Escuta ICE
        roomRef.collection('offerCandidates').onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            });
        });
    }

    // =========================================================================
    // 4. ESCUTA EVENTOS DA SALA
    // =========================================================================
    function listenToRoomEvents() {
        roomRef.onSnapshot((doc) => {
            if (!doc.exists) return;
            const data = doc.data();

            // A. TIMER (CORREÇÃO: SEM TRAVA DE TEMPO)
            // O Timer deve sempre atualizar, independente de quando o usuário entrou
            if (data.timer) {
                updateTimer(data.timer);
            }

            // B. MÍDIA (VÍDEO/ÁUDIO)
            // Mantém a trava de tempo para não repetir vídeos antigos
            if (data.liveMedia && data.liveMedia.timestamp) {
                const eventTime = data.liveMedia.timestamp.toMillis();
                const isNewEvent = eventTime > connectionTime; 
                const isNotDuplicate = eventTime !== lastMediaTimestamp;

                if (isNewEvent && isNotDuplicate) {
                    lastMediaTimestamp = eventTime;
                    showLiveMedia(data.liveMedia);
                }
            }

            // C. DECISÕES
            // Mantém a trava de tempo para não mostrar perguntas velhas
            if (data.activeDecision && data.activeDecision.timestamp) {
                const decisionTime = data.activeDecision.timestamp.toMillis();
                const isNewDecision = decisionTime > connectionTime;
                const isNotDuplicateDec = decisionTime !== lastDecisionTimestamp;

                if (isNewDecision && isNotDuplicateDec) {
                    lastDecisionTimestamp = decisionTime;
                    showDecision(data.activeDecision);
                }
            } else {
                if (data.activeDecision === null) hideDecision();
            }
        });
    }

    // =========================================================================
    // 5. HELPER: MÍDIA (FULLSCREEN)
    // =========================================================================
    function showLiveMedia(media) {
        const old = document.getElementById('media-overlay');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'media-overlay';
        // Z-Index 1000 para ficar atrás dos botões (que devem ser 2000)
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:#000;z-index:1000;padding:0;margin:0;';
        document.body.appendChild(modal);
        
        let content;

        if (media.type === 'video' || media.type === 'audio') {
            content = document.createElement(media.type === 'audio' ? 'audio' : 'video');
            content.src = media.url;
            content.controls = false; 
            content.autoplay = true;
            content.muted = false;
            content.setAttribute('playsinline', ''); 
            content.setAttribute('webkit-playsinline', '');
            content.style.cssText = "position:absolute;top:50%;left:50%;width:100%;height:100%;object-fit:cover;transform:translate(-50%,-50%);pointer-events:none;";

            content.onended = () => modal.remove();
            
            content.play().catch(e => {
                const btn = document.createElement('button');
                btn.innerText = "CLIQUE PARA INICIAR";
                btn.style.cssText = "position:absolute;z-index:1001;top:50%;left:50%;transform:translate(-50%,-50%);padding:20px;font-size:20px;background:#00ff88;border:none;cursor:pointer;";
                btn.onclick = () => { content.play(); btn.remove(); };
                modal.appendChild(btn);
            });

        } else if (media.type === 'image') {
            content = document.createElement('img');
            content.src = media.url;
            content.style.cssText = "position:absolute;top:50%;left:50%;width:100%;height:100%;object-fit:cover;transform:translate(-50%,-50%);pointer-events:none;";
            setTimeout(() => { if(modal.parentNode) modal.remove(); }, 15000);
        }

        if(content) modal.appendChild(content);
    }

    // =========================================================================
    // 6. HELPER: DECISÕES (CORREÇÃO DO CLIQUE)
    // =========================================================================
    
    // Função global para ser chamada pelo HTML gerado
    window.selectOption = (option) => {
        console.log("Opção selecionada:", option);
        // 1. Oculta visualmente para o jogador
        hideDecision();
        
        // 2. (Opcional) Envia feedback para o Host (ex: chat ou log no banco)
        // roomRef.collection('interactions').add({ type:'decision', choice: option, user: ... });
    };

    function showDecision(decision) {
        let container = document.getElementById('decision-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'decision-container';
            // Z-Index alto para ficar acessível
            container.style.cssText = "position:fixed; bottom:100px; left:50%; transform:translateX(-50%); z-index:2500; width:90%; max-width:500px;";
            document.body.appendChild(container);
        }
        
        // CORREÇÃO: Adicionado onclick="selectOption(...)"
        const buttonsHtml = decision.options.map(opt => 
            `<button class="submit-btn" style="flex:1;" onclick="selectOption('${opt.replace(/'/g, "\\'")}')">${opt}</button>`
        ).join('');

        container.innerHTML = `
            <div style="background:rgba(0,0,0,0.9); padding:20px; border-radius:10px; border:2px solid #00ff88; text-align:center; box-shadow:0 0 20px rgba(0,255,136,0.2);">
                <h3 style="color:#fff; margin-bottom:15px; font-family:'Orbitron', sans-serif;">${decision.question}</h3>
                <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                    ${buttonsHtml}
                </div>
            </div>
        `;
        container.classList.remove('hidden');
    }

    function hideDecision() {
        const c = document.getElementById('decision-container');
        if (c) c.classList.add('hidden');
    }

    // =========================================================================
    // 7. HELPER: TIMER (ATUALIZAÇÃO NA TELA)
    // =========================================================================
    function updateTimer(t) {
        const el = document.getElementById('player-timer-display');
        
        // Se o elemento não existir no HTML, cria um flutuante (Fallback)
        if (!el) {
            console.warn("Elemento 'player-timer-display' não encontrado no HTML.");
            return;
        }
        
        const h = Math.floor(t.value/3600), m = Math.floor((t.value%3600)/60), s = t.value%60;
        const timeStr = h > 0 
            ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
            : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            
        el.textContent = timeStr;
        if(t.color) el.style.color = t.color;
        if(t.font) el.style.fontFamily = t.font;
    }

    initPlayer();
});