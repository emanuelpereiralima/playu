document.addEventListener('DOMContentLoaded', async () => {
    console.log("🎮 Iniciando Sala do Jogador...");

    if (typeof firebase === 'undefined') {
        alert("Erro crítico: Firebase não carregado.");
        return;
    }

    const db = window.db || firebase.firestore();
    const auth = window.auth || firebase.auth();

    // --- ELEMENTOS DOM ---
    const localVideo = document.getElementById('player-local-video'); 
    const remoteVideo = document.getElementById('player-remote-video-host'); 
    const loadingOverlay = document.getElementById('loading-overlay');
    const timerDisplay = document.getElementById('player-timer-display');
    
    const micBtn = document.getElementById('player-mic-btn');
    const camBtn = document.getElementById('player-cam-btn');
    const exitBtn = document.getElementById('player-leave-btn');

    // --- VARIÁVEIS DE ESTADO ---
    let roomRef = null;
    let localStream = null;
    let pc = null;
    let lastMediaTimestamp = 0;
    let localDecisionInterval = null;
    let currentDecisionId = null;
    let playerName = sessionStorage.getItem('playerName');
    let playerId = sessionStorage.getItem('roomPlayerId');
    if (!playerId) {
        playerId = 'player_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        sessionStorage.setItem('roomPlayerId', playerId);
    }
    
    const servers = {
        iceServers: [
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    const urlParams = new URLSearchParams(window.location.search);
    const sessionIdParam = urlParams.get('sessionId');
    const bookingIdParam = urlParams.get('bookingId');
    const isGuest = urlParams.get('guest') === 'true';
    
    let currentRoomId = null;

    // =========================================================================
    // 1. INICIALIZAÇÃO
    // =========================================================================
    async function initPlayer() {
        if (!playerName) {
            playerName = prompt("Digite seu nome para entrar na sala:");
            if (!playerName || playerName.trim() === "") {
                playerName = "Jogador Anônimo " + Math.floor(Math.random() * 1000);
            }
            sessionStorage.setItem('playerName', playerName);
        }

        setupControls();

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
            if (sessionIdParam) {
                currentRoomId = sessionIdParam;
            } else if (bookingIdParam) {
                const doc = await db.collection('bookings').doc(bookingIdParam).get();
                if (doc.exists && doc.data().sessionId) {
                    currentRoomId = doc.data().sessionId;
                } else {
                    throw new Error("Sessão não inicializada pelo host.");
                }
            } else {
                throw new Error("Link de sala inválido.");
            }

            console.log("🔗 Conectando à sala:", currentRoomId);
            startConnection();

        } catch (e) {
            console.error(e);
            alert(e.message);
            window.location.href = 'dashboard.html';
        }
    }

    async function startConnection() {
        roomRef = db.collection('sessions').doc(currentRoomId);

        // Registra o jogador no banco de dados da sala
        await roomRef.update({
            [`connectedPlayers.${playerId}`]: playerName
        });

        // Tenta remover o jogador se ele fechar a aba
        window.addEventListener('beforeunload', () => {
            roomRef.update({ [`connectedPlayers.${playerId}`]: firebase.firestore.FieldValue.delete() });
        });
        
        await setupLocalMedia();
        await setupWebRTC();

        if (loadingOverlay) {
            loadingOverlay.style.opacity = '0';
            setTimeout(() => loadingOverlay.style.display = 'none', 500);
        }

        listenToRoomEvents();
    }

    // =========================================================================
    // 2. MÍDIA LOCAL E CONTROLES
    // =========================================================================
    async function setupLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) {
                localVideo.srcObject = localStream;
                localVideo.muted = true; // Não ouvir o próprio eco
            }
        } catch (err) {
            console.warn("Entrando sem câmera/mic:", err);
        }
    }

    function setupControls() {
        if (micBtn) micBtn.onclick = () => toggleLocalTrack('audio', micBtn);
        if (camBtn) camBtn.onclick = () => toggleLocalTrack('video', camBtn);
        if (exitBtn) exitBtn.onclick = () => {
            if (confirm("Sair da sala?")) {
                if (localStream) localStream.getTracks().forEach(t => t.stop());
                window.location.href = 'dashboard.html';
            }
        };
    }

    function toggleLocalTrack(kind, btn) {
        if (!localStream) return alert("Dispositivo não conectado.");
        const track = kind === 'audio' ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
        
        if (track) {
            track.enabled = !track.enabled;
            const iconName = kind === 'audio' ? 'mic' : 'videocam';
            
            if (track.enabled) {
                btn.style.background = '#333';
                btn.innerHTML = `<ion-icon name="${iconName}-outline"></ion-icon>`;
            } else {
                btn.style.background = '#ff4444';
                btn.innerHTML = `<ion-icon name="${iconName}-off-outline"></ion-icon>`;
            }
        }
    }

    // =========================================================================
    // 3. WEBRTC (O Jogador responde à Oferta do Host)
    // =========================================================================
    async function setupWebRTC() {
        console.log("📡 Iniciando WebRTC (Jogador)...");
        pc = new RTCPeerConnection(servers);

        // Adiciona a mídia do jogador para o Host ver
        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }

        // Recebe a mídia do Host
        pc.ontrack = (event) => {
            console.log("🎥 Stream do Host recebido!");
            if (remoteVideo && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            }
        };

        // Envia os caminhos de rede (ICE) do jogador para o Host
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                roomRef.collection('answerCandidates').add(e.candidate.toJSON());
            }
        };

        // Escuta a Oferta do Host e cria a Resposta
        roomRef.onSnapshot(async (snapshot) => {
            const data = snapshot.data();
            if (data?.offer && !pc.currentRemoteDescription) {
                console.log("📩 Oferta do Host recebida. Gerando resposta...");
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                await roomRef.update({ answer: { type: answer.type, sdp: answer.sdp } });
                
                processCandidateQueue(); // Libera a fila de rede
            }
        });

        // Fila de pacotes de rede do Host
        const candidateQueue = [];
        roomRef.collection('offerCandidates').onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    if (pc.remoteDescription) {
                        pc.addIceCandidate(candidate).catch(e => console.error("Erro ICE:", e));
                    } else {
                        candidateQueue.push(candidate);
                    }
                }
            });
        });

        function processCandidateQueue() {
            if(candidateQueue.length > 0) {
                candidateQueue.forEach(c => pc.addIceCandidate(c).catch(e => console.error(e)));
                candidateQueue.length = 0;
            }
        }
    }

    // =========================================================================
    // 4. ESCUTAR MÍDIA, DECISÕES E TIMER DO HOST
    // =========================================================================
    function listenToRoomEvents() {
        roomRef.onSnapshot((doc) => {
            if (!doc.exists) return;
            const data = doc.data();

            // ==========================================
            // --- VERIFICAÇÃO DE EXPULSÃO (AQUI!) ---
            // ==========================================
            if (data.kickedPlayers && data.kickedPlayers.includes(playerId)) {
                alert("Você foi removido da sala pelo Host.");
                if (localStream) localStream.getTracks().forEach(t => t.stop());
                window.location.href = 'index.html'; // Volta para a página inicial
                return; // Para a execução do código aqui para que ele não tente carregar o resto
            }
            // ==========================================

            // Sincronizar Cronômetro
            if (data.timerCurrent !== undefined) {
                updateTimerDisplay(data.timerCurrent, data.timerSettings);
            }

            // Sincronizar Mídias (Vídeos, Áudios, Imagens)
            if (data.liveMedia) {
                const eventTime = data.liveMedia.timestamp;
                if (eventTime !== lastMediaTimestamp) {
                    lastMediaTimestamp = eventTime;
                    showLiveMedia(data.liveMedia);
                }
            } else {
                // Host parou a mídia
                const activeMedia = document.getElementById('dynamic-media-overlay');
                if (activeMedia) activeMedia.remove();
            }

            // Sincronizar Decisões (Enquetes)
            if (data.activeDecision) {
                const dec = data.activeDecision;
                
                if (dec.status === 'active' && currentDecisionId !== dec.id) {
                    currentDecisionId = dec.id;
                    showDecisionUI(dec);
                } else if (dec.status === 'finished' && currentDecisionId !== 'finished_' + dec.id) {
                    currentDecisionId = 'finished_' + dec.id;
                    showResultUI(dec);
                }
            } else {
                // Host encerrou/limpou a decisão
                const c = document.getElementById('decision-container');
                const r = document.getElementById('decision-result');
                if (c) c.remove();
                if (r) r.remove();
                if (localDecisionInterval) clearInterval(localDecisionInterval);
                currentDecisionId = null;
            }
        });
    }

    // =========================================================================
    // 5. FUNÇÕES VISUAIS (MÍDIA E DECISÕES)
    // =========================================================================
    
    function showLiveMedia(media) {
        // Limpa mídia anterior se existir
        const old = document.getElementById('dynamic-media-overlay');
        if (old) old.remove();

        const overlay = document.createElement('div');
        overlay.id = 'dynamic-media-overlay';
        overlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); z-index: 2000; display: flex; justify-content: center; align-items: center;";
        
        let content;
        if (media.type === 'video' || media.type === 'audio') {
            content = document.createElement(media.type === 'audio' ? 'audio' : 'video');
            content.src = media.url;
            content.autoplay = true;
            content.loop = media.loop !== false;
            content.style.maxWidth = '90%';
            content.style.maxHeight = '90%';
            content.setAttribute('playsinline', '');
            
            // Força auto-play nos navegadores restritos
            content.play().catch(e => {
                const btn = document.createElement('button');
                btn.className = 'submit-btn';
                btn.innerText = "Clique para Tocar a Mídia";
                btn.onclick = () => { content.play(); btn.remove(); };
                overlay.appendChild(btn);
            });
        } else if (media.type === 'image') {
            content = document.createElement('img');
            content.src = media.url;
            content.style.maxWidth = '90%';
            content.style.maxHeight = '90%';
            content.style.objectFit = 'contain';
        }

        if (content) overlay.appendChild(content);
        document.body.appendChild(overlay);
    }

    function showDecisionUI(decision) {
        let container = document.getElementById('decision-container');
        if (container) container.remove();

        container = document.createElement('div');
        container.id = 'decision-container';
        container.style.cssText = "position:fixed; bottom:120px; left:50%; transform:translateX(-50%); z-index:2500; width:90%; max-width:500px;";
        
        const buttonsHtml = decision.options.map(opt => 
            `<button class="submit-btn" style="flex:1; margin:5px; padding:15px; font-size:1rem;" onclick="sendVote('${decision.id}', '${opt.replace(/'/g, "\\'")}')">${opt}</button>`
        ).join('');

        container.innerHTML = `
            <div style="background:rgba(0,0,0,0.9); padding:20px; border-radius:12px; border:2px solid var(--secondary-color); text-align:center;">
                <div style="display:flex; justify-content:space-between; margin-bottom:15px;">
                    <span style="color:#aaa; font-weight:bold;">TOME SUA DECISÃO</span>
                    <span id="player-decision-timer" style="color:var(--secondary-color); font-weight:bold; font-family:'Orbitron', sans-serif;">--s</span>
                </div>
                <h3 style="color:#fff; margin-bottom:20px;">${decision.question}</h3>
                <div style="display:flex; flex-direction:column; gap:8px;">${buttonsHtml}</div>
            </div>
        `;
        document.body.appendChild(container);

        // Timer de Decisão Local
        if (localDecisionInterval) clearInterval(localDecisionInterval);
        localDecisionInterval = setInterval(() => {
            const left = Math.max(0, Math.ceil((decision.endTime - Date.now()) / 1000));
            const timerEl = document.getElementById('player-decision-timer');
            if (timerEl) {
                timerEl.textContent = `${left}s`;
                if (left <= 10) timerEl.style.color = '#ff4444';
            }
            if (left <= 0) clearInterval(localDecisionInterval);
        }, 1000);
    }

    window.sendVote = async (decisionId, option) => {
        const container = document.getElementById('decision-container');
        if(container) {
            container.innerHTML = `
                <div style="padding:20px; background:rgba(0,0,0,0.9); border-radius:12px; border:2px solid #00ff88; text-align:center;">
                    <h3 style="color:#00ff88; margin-bottom:10px;">Voto Registrado!</h3>
                    <p style="color:#fff;">Aguardando os outros jogadores...</p>
                </div>`;
        }
        try {
            // Registra o voto com o nome do jogador no Firebase
            await roomRef.update({ [`activeDecision.votes.${playerName}`]: option });
        } catch (e) { console.error("Erro ao votar:", e); }
    };

    function showResultUI(decision) {
        const voteContainer = document.getElementById('decision-container');
        if (voteContainer) voteContainer.remove();
        if (localDecisionInterval) clearInterval(localDecisionInterval);

        const resultOverlay = document.createElement('div');
        resultOverlay.id = 'decision-result';
        resultOverlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:3000; display:flex; justify-content:center; align-items:center;";

        const votes = decision.votes || {};
        let resultHtml = "";

        if (Object.keys(votes).length === 0) {
            resultHtml = `<h2 style="color:#ffbb00;">Tempo Esgotado!</h2><p style="color:#aaa;">Ninguém votou.</p>`;
        } else {
            // Conta votos
            const counts = {};
            for (const p in votes) counts[votes[p]] = (counts[votes[p]] || 0) + 1;
            
            let maxVotes = 0, winner = "";
            for (const opt in counts) {
                if (counts[opt] > maxVotes) { maxVotes = counts[opt]; winner = opt; }
            }

            resultHtml = `
                <div style="color:#aaa; text-transform:uppercase;">Decisão da Equipe:</div>
                <div style="font-family:'Orbitron', sans-serif; font-size:2rem; color:#00ff88; margin: 10px 0;">${winner}</div>
                <p style="color:#ccc;">(Recebeu ${maxVotes} votos)</p>
            `;
        }

        resultOverlay.innerHTML = `
            <div style="background:#1a1a2e; border:2px solid var(--secondary-color); padding:30px; border-radius:12px; text-align:center;">
                ${resultHtml}
                <button class="submit-btn" style="margin-top:20px; width:100%;" onclick="this.parentElement.parentElement.remove()">Entendido</button>
            </div>
        `;
        document.body.appendChild(resultOverlay);
        setTimeout(() => { if (resultOverlay.parentNode) resultOverlay.remove(); }, 15000);
    }

    function updateTimerDisplay(seconds, settings = null) {
        if (!timerDisplay) return;
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        timerDisplay.innerText = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        
        // Aplica o estilo personalizado definido pelo Host (se houver)
        if (settings) {
            if (settings.color) timerDisplay.style.color = settings.color;
            if (settings.font) timerDisplay.style.fontFamily = settings.font;
        }
    }

    initPlayer();
});