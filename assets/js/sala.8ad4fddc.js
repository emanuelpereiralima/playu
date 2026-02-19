// =============================================================================
// FUNÇÃO GLOBAL DE DECISÃO (FORA DO DOMContentLoaded)
// =============================================================================
window.selectOption = (option) => {
    console.log("✅ Opção clicada:", option);
    const container = document.getElementById('decision-container');
    if (container) {
        container.classList.add('hidden');
        container.innerHTML = '';
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🎮 Iniciando Sala do Jogador (Correção de Conexão)...");

    // 1. VERIFICAÇÃO DE SEGURANÇA
    if (typeof firebase === 'undefined') {
        alert("Erro crítico: Firebase não carregado.");
        return;
    }

    const db = firebase.firestore();
    const auth = firebase.auth();

    // --- ELEMENTOS DOM ---
    const localVideo = document.getElementById('player-local-video'); 
    const remoteVideo = document.getElementById('player-remote-video-host'); 
    const loadingOverlay = document.getElementById('loading-overlay');
    const timerDisplay = document.getElementById('player-timer-display');
    
    // Botões
    const micBtn = document.getElementById('player-mic-btn');
    const camBtn = document.getElementById('player-cam-btn');
    const exitBtn = document.getElementById('player-leave-btn');

    // --- VARIÁVEIS ---
    let roomRef = null;
    let localStream = null;
    let pc = null;
    let lastMediaTimestamp = 0;
    let lastDecisionTimestamp = 0;
    let localDecisionInterval = null;
    
    const connectionTime = Date.now();

    const servers = {
        iceServers: [
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    // --- URL PARAMS ---
    const urlParams = new URLSearchParams(window.location.search);
    const sessionIdParam = urlParams.get('sessionId');
    const bookingIdParam = urlParams.get('bookingId');
    const isGuest = urlParams.get('guest') === 'true';
    
    let currentRoomId = null;

    // =========================================================================
    // 1. INICIALIZAÇÃO INTELIGENTE (IGUAL AO HOST)
    // =========================================================================
    async function initPlayer() {
        setupControls(); // Configura botões visuais

        if (!isGuest) {
            auth.onAuthStateChanged(user => {
                if (!user) window.location.href = 'login.html';
                else resolveRoomIdAndConnect();
            });
        } else {
            resolveRoomIdAndConnect();
        }
    }

    async function resolveRoomIdAndConnect() {
        try {
            // 1. Tenta usar o sessionId direto
            if (sessionIdParam) {
                currentRoomId = sessionIdParam;
            } 
            // 2. Se for link antigo (bookingId), busca o ID real no banco
            else if (bookingIdParam) {
                console.log("🔄 Buscando ID real da sessão...");
                const doc = await db.collection('bookings').doc(bookingIdParam).get();
                
                if (doc.exists) {
                    const data = doc.data();
                    
                    if (data.sessionId) {
                        currentRoomId = data.sessionId;
                    } else {
                        // Reconstrói o ID padrão se não estiver salvo
                        const gId = data.gameId || 'unknown';
                        const date = data.date || 'nodate';
                        const time = (data.time && typeof data.time === 'string') ? data.time.replace(':', '-') : '00-00';
                        currentRoomId = `session_${gId}_${date}_${time}`;
                    }
                } else {
                    throw new Error("Agendamento não encontrado.");
                }
            } else {
                throw new Error("Link inválido.");
            }

            console.log("🔗 Conectando à sala:", currentRoomId);
            startConnection();

        } catch (e) {
            console.error("Erro de conexão:", e);
            alert("Erro ao entrar na sala: " + e.message);
            window.location.href = 'dashboard.html';
        }
    }

    async function startConnection() {
        roomRef = db.collection('sessions').doc(currentRoomId);

        // Primeiro pega mídia local, depois conecta WebRTC
        await setupLocalMedia();
        await setupWebRTC();

        if (loadingOverlay) {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => loadingOverlay.style.display = 'none', 500);
        }

        listenToRoomEvents();
    }

    // =========================================================================
    // 2. MÍDIA LOCAL
    // =========================================================================
    async function setupLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            
            if (localVideo) {
                localVideo.srcObject = localStream;
                localVideo.muted = true; 
                localVideo.crossOrigin = "anonymous";
            }
        } catch (err) {
            console.warn("Sem câmera/mic (Jogador passivo):", err);
        }
    }

    function setupControls() {
        if (micBtn) {
            micBtn.onclick = () => {
                if (!localStream) return alert("Microfone não ativo.");
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
                if (!localStream) return alert("Câmera não ativa.");
                const track = localStream.getVideoTracks()[0];
                if (track) {
                    track.enabled = !track.enabled;
                    // GIF Logic
                    if (localVideo) {
                        if (track.enabled) localVideo.classList.remove('camera-off');
                        else localVideo.classList.add('camera-off');
                    }
                    camBtn.innerHTML = track.enabled ? '<ion-icon name="videocam-outline"></ion-icon>' : '<ion-icon name="videocam-off-outline"></ion-icon>';
                    camBtn.classList.toggle('active', !track.enabled);
                }
            };
        }

        if (exitBtn) {
            exitBtn.onclick = () => {
                if (confirm("Sair da sala?")) {
                    if (localStream) localStream.getTracks().forEach(t => t.stop());
                    window.location.href = 'dashboard.html';
                }
            };
        }
    }

   // =========================================================================
    // 3. WEBRTC (JOGADOR) - COM FILA DE CANDIDATOS
    // =========================================================================
    async function setupWebRTC() {
        console.log("📡 Iniciando WebRTC (Jogador)...");
        pc = new RTCPeerConnection(servers);

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        pc.ontrack = (event) => {
            console.log("🎥 Stream do Host recebido!");
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.crossOrigin = "anonymous";
                remoteVideo.play().catch(e => console.log("Auto-play bloqueado", e));
            }
        };

        const answerCandidates = roomRef.collection('answerCandidates');
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                answerCandidates.add(e.candidate.toJSON());
            }
        };

        // Escuta OFERTA do Host
        roomRef.onSnapshot(async (snapshot) => {
            const data = snapshot.data();
            
            if (data && data.offer && !pc.currentRemoteDescription) {
                console.log("📩 Oferta do Host recebida! Gerando resposta...");
                
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                // Envia resposta
                await roomRef.update({ answer: { type: answer.type, sdp: answer.sdp } });
                
                // Processa candidatos na fila
                processCandidateQueue();
            }
        });

        // Escuta CANDIDATOS do Host (Com Fila)
        const candidateQueue = [];
        roomRef.collection('offerCandidates').onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const candidate = new RTCIceCandidate(data);
                    
                    if (pc.remoteDescription) {
                        pc.addIceCandidate(candidate).catch(e => console.error("Erro ICE:", e));
                    } else {
                        console.log("⏳ Candidato do Host na fila...");
                        candidateQueue.push(candidate);
                    }
                }
            });
        });

        function processCandidateQueue() {
            if(candidateQueue.length > 0) {
                console.log(`🚀 Processando ${candidateQueue.length} candidatos do Host...`);
                candidateQueue.forEach(c => pc.addIceCandidate(c).catch(e => console.error(e)));
                candidateQueue.length = 0;
            }
        }
    }

    // =========================================================================
    // 4. EVENTOS (TIMER, MÍDIA, DECISÃO)
    // =========================================================================
    function listenToRoomEvents() {
        roomRef.onSnapshot((doc) => {
            if (!doc.exists) return;
            const data = doc.data();

            // ... (Lógica de Timer e Mídia mantém igual) ...
            if (data.timer) updateTimer(data.timer);
            if (data.liveMedia && data.liveMedia.timestamp) {
                const eventTime = data.liveMedia.timestamp.toMillis();
                if (eventTime > connectionTime && eventTime !== lastMediaTimestamp) {
                    lastMediaTimestamp = eventTime;
                    showLiveMedia(data.liveMedia);
                }
            }

            // --- LÓGICA DE DECISÃO ---
            if (data.activeDecision) {
                const d = data.activeDecision;
                
                // 1. Nova Decisão Ativa
                if (d.status === 'active') {
                    // Verifica se é uma decisão nova pelo ID ou Timestamp
                    const dt = d.timestamp ? d.timestamp.toMillis() : 0;
                    if (dt > lastDecisionTimestamp) {
                        lastDecisionTimestamp = dt;
                        showDecisionUI(d);
                    }
                } 
                // 2. Decisão Finalizada (Mostrar Resultado)
                else if (d.status === 'finished') {
                    showResultUI(d);
                }
            } else {
                // Se null, limpa tudo
                const c = document.getElementById('decision-container');
                const r = document.getElementById('decision-result');
                if (c) c.classList.add('hidden');
                if (r) r.remove();
                if (localDecisionInterval) clearInterval(localDecisionInterval);
            }
        });
    }

    // =========================================================================
    // UI DE VOTAÇÃO (COM TIMER VISUAL)
    // =========================================================================
    function showDecisionUI(decision) {
        // Limpa resultados anteriores
        const oldRes = document.getElementById('decision-result');
        if(oldRes) oldRes.remove();

        let container = document.getElementById('decision-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'decision-container';
            container.style.cssText = "position:fixed; bottom:100px; left:50%; transform:translateX(-50%); z-index:2500; width:90%; max-width:500px;";
            document.body.appendChild(container);
        }
        
        const buttonsHtml = decision.options.map(opt => 
            `<button class="submit-btn" style="flex:1; margin:5px;" onclick="sendVote('${decision.id}', '${opt.replace(/'/g, "\\'")}')">${opt}</button>`
        ).join('');

        container.innerHTML = `
            <div style="background:rgba(0,0,0,0.9); padding:20px; border-radius:10px; border:2px solid #00ff88; text-align:center; box-shadow:0 0 20px rgba(0,255,136,0.2);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span style="color:#aaa;">Votação</span>
                    <span id="player-decision-timer" style="color:#00ff88; font-weight:bold;">--s</span>
                </div>
                <h3 style="color:#fff; margin-bottom:15px; font-family:'Orbitron', sans-serif;">${decision.question}</h3>
                <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
                    ${buttonsHtml}
                </div>
            </div>
        `;
        container.classList.remove('hidden');

        // Timer Local do Jogador (Apenas Visual)
        if(localDecisionInterval) clearInterval(localDecisionInterval);
        
        const updatePlayerTimer = () => {
            const now = Date.now();
            const left = Math.max(0, Math.ceil((decision.endTime - now) / 1000));
            const timerEl = document.getElementById('player-decision-timer');
            if(timerEl) timerEl.textContent = `${left}s`;
            if(left <= 0) clearInterval(localDecisionInterval);
        };
        
        localDecisionInterval = setInterval(updatePlayerTimer, 1000);
        updatePlayerTimer(); // Roda imediatamente
    }

    // Função Global para Enviar Voto
    window.sendVote = async (decisionId, option) => {
        const container = document.getElementById('decision-container');
        if(container) container.innerHTML = `<div style="padding:20px; background:rgba(0,0,0,0.8); color:#fff; border-radius:10px; text-align:center;">Voto enviado: <b>${option}</b><br>Aguardando resultado...</div>`;
        
        try {
            // Salva na subcoleção 'decision_votes'
            await roomRef.collection('decision_votes').doc(myId).set({
                decisionId: decisionId,
                userId: myId,
                option: option,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.error("Erro ao votar:", e);
        }
    };

    // =========================================================================
    // UI DE RESULTADO
    // =========================================================================
    function showResultUI(decision) {
        // Esconde votação
        const voteContainer = document.getElementById('decision-container');
        if(voteContainer) voteContainer.classList.add('hidden');
        if(localDecisionInterval) clearInterval(localDecisionInterval);

        // Cria Overlay de Resultado
        const oldRes = document.getElementById('decision-result');
        if(oldRes) oldRes.remove();

        const resultOverlay = document.createElement('div');
        resultOverlay.id = 'decision-result';
        resultOverlay.className = 'decision-result-overlay';

        // Formata votos (Ex: Opção A: 5 | Opção B: 2)
        const statsHtml = Object.entries(decision.votes || {}).map(([opt, count]) => 
            `<div>${opt}: <b>${count}</b></div>`
        ).join('<div style="margin:0 10px; color:#555;">|</div>');

        resultOverlay.innerHTML = `
            <div class="winner-card">
                <div class="winner-label">A decisão foi:</div>
                <div class="winner-text">${decision.winner}</div>
                <div class="winner-stats">${statsHtml}</div>
                <button class="secondary-btn" style="margin-top:20px;" onclick="this.parentElement.parentElement.remove()">Fechar</button>
            </div>
        `;

        document.body.appendChild(resultOverlay);

        // Auto remover após 8 segundos
        setTimeout(() => {
            if(resultOverlay.parentNode) resultOverlay.remove();
        }, 8000);
    }

    // =========================================================================
    // 5. HELPERS VISUAIS
    // =========================================================================
    function showLiveMedia(media) {
        const old = document.getElementById('media-overlay');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'media-overlay';
        // Fica em Fullscreen, atrás dos controles
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
            content.volume = (media.volume !== undefined) ? media.volume : 1.0;
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
            setTimeout(() => { if(modal.parentNode) modal.remove(); }, 15000);
        }

        if(content) modal.appendChild(content);
    }

    function showDecision(decision) {
        let container = document.getElementById('decision-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'decision-container';
            // Z-Index alto para clique
            container.style.cssText = "position:fixed; bottom:100px; left:50%; transform:translateX(-50%); z-index:2500; width:90%; max-width:500px;";
            document.body.appendChild(container);
        }
        
        const buttonsHtml = decision.options.map(opt => 
            `<button class="submit-btn" style="flex:1;" onclick="window.selectOption('${opt.replace(/'/g, "\\'")}')">${opt}</button>`
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

    function updateTimer(t) {
        if (!timerDisplay) return;
        const h = Math.floor(t.value/3600), m = Math.floor((t.value%3600)/60), s = t.value%60;
        const timeStr = h > 0 
            ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
            : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
            
        timerDisplay.textContent = timeStr;
        if(t.color) timerDisplay.style.color = t.color;
        if(t.font) timerDisplay.style.fontFamily = t.font;
    }

    initPlayer();
});