document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Iniciando Sala Host (Fix Sincronização)...");

    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        alert("Erro crítico: Firebase não conectado.");
        return;
    }

    const db = firebase.firestore();
    
    // --- ELEMENTOS DOM ---
    const localVideo = document.getElementById('host-local-video');
    const remoteVideo = document.getElementById('host-remote-video');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    // Botões
    const micBtn = document.getElementById('host-mic-btn');
    const camBtn = document.getElementById('host-cam-btn');
    const endBtn = document.getElementById('end-call-btn');
    const switchBtn = document.getElementById('switch-cam-btn');

    // Listas
    const assetsList = document.getElementById('host-assets-list');
    const decisionsList = document.getElementById('host-decisions-list');

    // Timer e Feedback
    const timerDisplay = document.getElementById('session-timer');
    const startBtn = document.getElementById('timer-start-btn');
    const pauseBtn = document.getElementById('timer-pause-btn');
    const resetBtn = document.getElementById('timer-reset-btn');
    const decisionFeedback = document.getElementById('host-decision-feedback');
    const feedbackQuestion = document.getElementById('feedback-question');
    const feedbackTimer = document.getElementById('feedback-timer');

    // Invite
    const inviteModal = document.getElementById('invite-floating-modal');
    const inviteInput = document.getElementById('floating-invite-link');
    const copyBtn = document.getElementById('floating-copy-btn');
    const reopenBtn = document.getElementById('reopen-invite-btn');

    // --- VARIÁVEIS ---
    let roomRef = null;
    let currentFacingMode = 'user';
    let localStream = null;
    let cameraStream = null;
    let pc = null;
    
    // Timer
    let timerInterval = null;
    let timerSeconds = 0;
    let timerRunning = false;
    let timerConfig = { type: 'regressive', font: "'Orbitron', sans-serif", color: '#ff0000', initialTime: 3600 };
    let decisionInterval = null;

    // Configuração ICE (Servidores de Conexão)
    const servers = {
        iceServers: [
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    // --- URL PARAMS ---
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    const sessionIdParam = urlParams.get('sessionId');

    if (!bookingId && !sessionIdParam) {
        alert("Link inválido (sem ID).");
        window.location.href = 'admin.html';
        return;
    }

    // =========================================================================
    // 1. INICIALIZAÇÃO (TRAVANDO O ID DA SALA)
    // =========================================================================
    async function initSession() {
        try {
            let currentRoomId = sessionIdParam;

            // Se veio pelo bookingId, define o ID da sala e SALVA no banco
            if (!currentRoomId && bookingId) {
                console.log("🔄 Verificando agendamento:", bookingId);
                const bookingRef = db.collection('bookings').doc(bookingId);
                const bookingDoc = await bookingRef.get();
                
                if (bookingDoc.exists) {
                    const data = bookingDoc.data();
                    
                    // Se já tem ID salvo, usa ele. Se não, cria um novo.
                    if (data.sessionId) {
                        currentRoomId = data.sessionId;
                        console.log("✅ ID recuperado do agendamento:", currentRoomId);
                    } else {
                        // Gera ID: session_GAMEID_DATA_HORA
                        const gId = data.gameId || 'geral';
                        const date = data.date || 'hoje';
                        const time = (data.time && typeof data.time === 'string') ? data.time.replace(':', '-') : '00-00';
                        
                        currentRoomId = `session_${gId}_${date}_${time}`;
                        console.log("🆕 Novo ID gerado:", currentRoomId);
                        
                        // IMPORTANTE: Salva esse ID no booking para o Jogador achar a mesma sala
                        await bookingRef.update({ sessionId: currentRoomId });
                    }
                } else {
                    throw new Error("Agendamento não encontrado.");
                }
            }

            console.log("🔗 Conectando à sala:", currentRoomId);
            roomRef = db.collection('sessions').doc(currentRoomId);
            
            // Marca Host como Online e Limpa status antigo se necessário
            await roomRef.set({ hostStatus: 'online' }, { merge: true });

            await setupLocalMedia();
            setupInviteLink(currentRoomId);

            if (currentRoomId.startsWith('session_')) {
                const parts = currentRoomId.split('_');
                if (parts[1]) loadGameData(parts[1]);
            }

            listenToActiveDecision();
            startWebRTC(); // Inicia conexão de vídeo

            if (loadingOverlay) loadingOverlay.style.display = 'none';

        } catch (error) {
            console.error("Erro fatal:", error);
            alert("Erro ao iniciar: " + error.message);
        }
    }

// =========================================================================
    // 2. MÍDIA LOCAL, CONTROLES E TROCA DE CÂMERA
    // =========================================================================
    async function setupLocalMedia() {
        try {
            // CONFIGURAÇÃO DE RESOLUÇÃO 16:9
            const constraints = { 
                video: { 
                    facingMode: currentFacingMode,
                    width: { ideal: 1280 },  // Tenta HD
                    height: { ideal: 720 },  // Tenta HD
                    aspectRatio: { ideal: 1.7777777778 } // Força proporção 16:9
                }, 
                audio: true 
            };
            
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            cameraStream = localStream; 

            if (localVideo) {
                localVideo.srcObject = localStream;
                localVideo.muted = true; // Host não ouve a si mesmo
            }

            // --- BOTÃO MICROFONE ---
            if (micBtn) micBtn.onclick = () => {
                const track = localStream.getAudioTracks()[0];
                if (track) {
                    track.enabled = !track.enabled;
                    micBtn.innerHTML = track.enabled ? '<ion-icon name="mic-outline"></ion-icon>' : '<ion-icon name="mic-off-outline"></ion-icon>';
                    micBtn.classList.toggle('active', !track.enabled);
                }
            };

            // --- BOTÃO CÂMERA (COM GIF) ---
            if (camBtn) camBtn.onclick = () => {
                const track = localStream.getVideoTracks()[0];
                if (track) {
                    track.enabled = !track.enabled;
                    
                    if (track.enabled) {
                        localVideo.classList.remove('camera-off');
                        camBtn.innerHTML = '<ion-icon name="videocam-outline"></ion-icon>';
                    } else {
                        localVideo.classList.add('camera-off');
                        camBtn.innerHTML = '<ion-icon name="videocam-off-outline"></ion-icon>';
                    }
                    camBtn.classList.toggle('active', !track.enabled);
                }
            };

            // --- BOTÃO TROCAR CÂMERA (SWAP) ---
            if (switchBtn) {
                switchBtn.onclick = async () => {
                    if (!localStream) return;

                    currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
                    
                    // Para a trilha atual
                    localStream.getVideoTracks().forEach(track => track.stop());

                    try {
                        // Solicita nova câmera mantendo 16:9
                        const newConstraints = {
                            video: { 
                                facingMode: currentFacingMode,
                                width: { ideal: 1980 },
                                height: { ideal: 1080 },
                                aspectRatio: { ideal: 1.7777777778 }
                            },
                            audio: true
                        };

                        const newStream = await navigator.mediaDevices.getUserMedia(newConstraints);

                        localVideo.srcObject = newStream;
                        
                        // Mantém estado do áudio (Mudo/Ativo)
                        const oldAudioState = !micBtn.classList.contains('active'); 
                        newStream.getAudioTracks()[0].enabled = oldAudioState;

                        localStream = newStream;
                        cameraStream = newStream;

                        // Atualiza WebRTC
                        if (pc) {
                            const videoTrack = newStream.getVideoTracks()[0];
                            const sender = pc.getSenders().find(s => s.track.kind === 'video');
                            if (sender) sender.replaceTrack(videoTrack);
                            
                            const audioTrack = newStream.getAudioTracks()[0];
                            const audioSender = pc.getSenders().find(s => s.track.kind === 'audio');
                            if (audioSender) audioSender.replaceTrack(audioTrack);
                        }

                        // Animação
                        switchBtn.style.transform = "rotate(180deg)";
                        setTimeout(() => switchBtn.style.transform = "rotate(0deg)", 300);

                    } catch (err) {
                        console.error("Erro switch cam:", err);
                        alert("Não foi possível trocar de câmera.");
                    }
                };
            }

            // --- BOTÃO ENCERRAR ---
            if (endBtn) endBtn.onclick = () => {
                if (confirm("Encerrar sessão?")) {
                    roomRef.update({ hostStatus: 'offline' });
                    window.location.href = 'admin.html';
                }
            };

        } catch (err) {
            console.error("Erro mídia:", err);
            alert("Erro ao acessar câmera/microfone. Verifique permissões.");
        }
    }

    function toggleTrack(kind) {
        if(!localStream) return;
        const track = kind === 'audio' ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
        if(track) {
            track.enabled = !track.enabled;
            if(kind === 'audio') {
                micBtn.innerHTML = track.enabled ? '<ion-icon name="mic-outline"></ion-icon>' : '<ion-icon name="mic-off-outline"></ion-icon>';
                micBtn.classList.toggle('active', !track.enabled);
            } else {
                // GIF Logic
                if(track.enabled) {
                    localVideo.classList.remove('camera-off');
                    camBtn.innerHTML = '<ion-icon name="videocam-outline"></ion-icon>';
                } else {
                    localVideo.classList.add('camera-off');
                    camBtn.innerHTML = '<ion-icon name="videocam-off-outline"></ion-icon>';
                }
                camBtn.classList.toggle('active', !track.enabled);
            }
        }
    }

    // =========================================================================
    // 3. TIMER
    // =========================================================================
    window.adjustTimer = (m) => { timerSeconds = Math.max(0, timerSeconds + m*60); updateTimerDisplay(); syncTimer(); };
    
    function updateTimerDisplay() {
        if(!timerDisplay) return;
        const h = Math.floor(timerSeconds/3600), m = Math.floor((timerSeconds%3600)/60), s = timerSeconds%60;
        timerDisplay.textContent = h>0 ? `${h}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}` : `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }

    function syncTimer() {
        if(roomRef) roomRef.update({ timer: { value: timerSeconds, isRunning: timerRunning, color: timerConfig.color, font: timerConfig.font } }).catch(()=>{});
    }

    if(startBtn) startBtn.onclick = () => {
        if(timerRunning) return;
        timerRunning = true;
        startBtn.style.opacity = '0.5'; pauseBtn.style.opacity = '1';
        timerInterval = setInterval(() => {
            if(timerConfig.type === 'progressive') timerSeconds++;
            else { if(timerSeconds>0) timerSeconds--; else stopTimer(); }
            updateTimerDisplay(); syncTimer();
        }, 1000);
    };

    if(pauseBtn) pauseBtn.onclick = stopTimer;
    if(resetBtn) resetBtn.onclick = () => { stopTimer(); timerSeconds = timerConfig.initialTime; updateTimerDisplay(); syncTimer(); };

    function stopTimer() {
        timerRunning = false; clearInterval(timerInterval);
        startBtn.style.opacity = '1'; pauseBtn.style.opacity = '0.5';
        syncTimer();
    }

    // =========================================================================
    // 4. LOAD GAME & ASSETS
    // =========================================================================
    function loadGameData(gameId) {
        db.collection('games').doc(gameId).onSnapshot(doc => {
            if(!doc.exists) return;
            const g = doc.data();
            if(g.timerSettings) {
                timerConfig = { ...timerConfig, ...g.timerSettings };
                timerConfig.initialTime = (parseInt(g.sessionDuration)||60)*60;
                if(!timerRunning && timerSeconds === 0) timerSeconds = timerConfig.initialTime;
                if(timerDisplay) { timerDisplay.style.color = timerConfig.color; timerDisplay.style.fontFamily = timerConfig.font; }
                updateTimerDisplay();
            }
            renderAssets(g.sessionAssets||[]);
            renderDecisions(g.decisions||[]);
        });
    }

// =========================================================================
    // 5. RENDERIZAÇÃO DE MÍDIAS (AGRUPADA COM VOLUME)
    // =========================================================================
    
    // Objeto para armazenar os volumes atuais de cada seção (0 a 1)
    const sectionVolumes = {
        video: 1.0,
        audio: 1.0,
        image: 1.0
    };

    function renderAssets(assets) {
        if (!assetsList) return;
        assetsList.innerHTML = '';

        if (!assets || assets.length === 0) {
            assetsList.innerHTML = '<p style="padding:10px; color:#aaa; font-size:0.9rem;">Nenhuma mídia cadastrada.</p>';
            return;
        }

        // 1. Agrupar Assets
        const groups = {
            video: { label: 'Vídeos', icon: 'videocam', items: [] },
            audio: { label: 'Áudios', icon: 'musical-notes', items: [] },
            image: { label: 'Imagens', icon: 'image', items: [] }
        };

        assets.forEach(asset => {
            if (groups[asset.type]) {
                groups[asset.type].items.push(asset);
            }
        });

        // 2. Renderizar Seções
        Object.keys(groups).forEach(type => {
            const group = groups[type];
            if (group.items.length === 0) return; // Pula se vazio

            // Container da Seção
            const section = document.createElement('div');
            section.className = 'assets-section';

            // Cabeçalho (Título + Volume)
            // Nota: Imagens não precisam de volume, então escondemos o slider se for imagem
            const showVolume = type !== 'image';
            
            const headerHTML = `
                <div class="section-header">
                    <div class="section-title">
                        <ion-icon name="${group.icon}-outline"></ion-icon> ${group.label}
                    </div>
                    ${showVolume ? `
                    <div class="volume-control-area">
                        <ion-icon name="volume-medium-outline" style="font-size:1rem; color:#aaa;"></ion-icon>
                        <input type="range" min="0" max="100" value="100" class="volume-slider" data-type="${type}">
                    </div>
                    ` : ''}
                </div>
                <div class="section-items-container"></div>
            `;
            
            section.innerHTML = headerHTML;
            assetsList.appendChild(section);

            // Listener do Slider
            if (showVolume) {
                const slider = section.querySelector('.volume-slider');
                slider.oninput = (e) => {
                    const vol = e.target.value / 100; // Converte 0-100 para 0.0-1.0
                    sectionVolumes[type] = vol;
                    // Opcional: Atualizar ícone de volume dinamicamente
                };
            }

            // 3. Renderizar Itens dentro da Seção
            const container = section.querySelector('.section-items-container');
            
            group.items.forEach(asset => {
                const btn = document.createElement('div');
                btn.className = 'asset-btn';
                btn.style.cssText = `
                    display: flex; align-items: center; gap: 10px;
                    background: rgba(255,255,255,0.05); padding: 8px 10px;
                    border-radius: 4px; cursor: pointer; margin-bottom: 5px;
                    border: 1px solid transparent; transition: 0.2s;
                `;
                
                btn.innerHTML = `
                    <div style="flex:1; overflow:hidden;">
                        <div style="font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${asset.name}</div>
                    </div>
                    <ion-icon name="${type === 'video' ? 'play-circle-outline' : 'send-outline'}" style="color:#00ff88;"></ion-icon>
                `;

                btn.onclick = () => {
                    // Pega o volume atual desta seção
                    const currentVol = sectionVolumes[type] !== undefined ? sectionVolumes[type] : 1.0;
                    
                    sendMediaToPlayer(asset, btn, currentVol);

                    // Se for vídeo, toca no Host também (com o volume ajustado)
                    if (asset.type === 'video') {
                        playVideoInHostCamera(asset.url);
                        if(localVideo) localVideo.volume = currentVol; // Ajusta volume local também
                    }
                };
                container.appendChild(btn);
            });
        });

        // Botão Restaurar Webcam (sempre no final)
        const stopBtn = document.createElement('button');
        stopBtn.className = 'submit-btn small-btn danger-btn';
        stopBtn.style.cssText = "width: 100%; margin-top: 15px; background: #333; border: 1px solid #444;";
        stopBtn.innerHTML = '<ion-icon name="stop-circle-outline"></ion-icon> Restaurar Webcam';
        stopBtn.onclick = restoreCamera;
        assetsList.appendChild(stopBtn);
    }

    async function sendMediaToPlayer(asset, btnElement, volume = 1.0) {
        if (!roomRef) return;
        
        // Feedback visual
        btnElement.style.background = 'rgba(0, 255, 136, 0.2)';
        btnElement.style.borderColor = '#00ff88';

        try {
            await roomRef.update({
                liveMedia: {
                    type: asset.type,
                    url: asset.url,
                    name: asset.name,
                    volume: volume, // ENVIA O VOLUME PARA O JOGADOR
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }
            });
            console.log(`Mídia enviada: ${asset.name} (Vol: ${volume})`);
        } catch (e) {
            console.error("Erro ao enviar mídia:", e);
        }

        setTimeout(() => {
            btnElement.style.background = 'rgba(255,255,255,0.05)';
            btnElement.style.borderColor = 'transparent';
        }, 500);
    }

    async function playVideoInHostCamera(url) {
        if(!localVideo) return;
        if(!cameraStream) cameraStream = localStream;
        try {
            localVideo.srcObject = null; localVideo.src = url; localVideo.muted = false; localVideo.crossOrigin="anonymous";
            await localVideo.play();
            const stream = localVideo.captureStream ? localVideo.captureStream() : localVideo.mozCaptureStream();
            if(stream && pc) {
                const vSender = pc.getSenders().find(s => s.track.kind === 'video');
                if(vSender) vSender.replaceTrack(stream.getVideoTracks()[0]);
            }
            localVideo.onended = restoreCamera;
        } catch(e){ console.error(e); restoreCamera(); }
    }

    async function restoreCamera() {
        if(!cameraStream) return;
        localVideo.src = ""; localVideo.srcObject = cameraStream; localVideo.muted = true;
        if(pc) {
            const vSender = pc.getSenders().find(s => s.track.kind === 'video');
            if(vSender) vSender.replaceTrack(cameraStream.getVideoTracks()[0]);
        }
    }

    // =========================================================================
    // 5. WEBRTC & DECISÕES
    // =========================================================================
    function renderDecisions(list) {
        if(!decisionsList) return; decisionsList.innerHTML='';
        list.forEach(d => {
            const el = document.createElement('div'); el.className='decision-card';
            el.style.cssText='background:rgba(0,0,0,0.3); padding:10px; margin-bottom:5px; border-left:3px solid red; cursor:pointer;';
            el.innerHTML = `<b>${d.question}</b>`;
            el.onclick = () => roomRef.update({ activeDecision: { ...d, timestamp: firebase.firestore.FieldValue.serverTimestamp() } });
            decisionsList.appendChild(el);
        });
    }

    function listenToActiveDecision() {
        roomRef.onSnapshot(doc => {
            const d = doc.data()?.activeDecision;
            if(decisionInterval) clearInterval(decisionInterval);
            if(d && decisionFeedback) {
                decisionFeedback.classList.remove('hidden');
                feedbackQuestion.innerText = d.question;
                let t = 30; feedbackTimer.innerText = t+'s';
                decisionInterval = setInterval(()=>{ t--; feedbackTimer.innerText = t+'s'; if(t<=0){ clearInterval(decisionInterval); roomRef.update({activeDecision:null}); }}, 1000);
            } else if(decisionFeedback) decisionFeedback.classList.add('hidden');
        });
    }
    window.clearPlayerDecision = () => roomRef.update({ activeDecision: null });

    // =========================================================================
    // 7. WEBRTC (HOST) - COM FILA DE CANDIDATOS
    // =========================================================================
    async function startWebRTC() {
        console.log("📡 Iniciando WebRTC (Host)...");
        pc = new RTCPeerConnection(servers);

        // Adiciona trilhas locais (se houver)
        if (localStream) {
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        }

        // Quando receber vídeo do jogador
        pc.ontrack = e => {
            console.log("🎥 Stream do Jogador recebido!");
            if (remoteVideo && e.streams[0]) {
                remoteVideo.srcObject = e.streams[0];
                remoteVideo.play().catch(e => console.warn("Autoplay remoto:", e));
            }
        };

        // Envia candidatos ICE para o banco
        const offerCandidates = roomRef.collection('offerCandidates');
        pc.onicecandidate = e => {
            if (e.candidate) {
                offerCandidates.add(e.candidate.toJSON());
            }
        };

        // 1. Cria OFERTA
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        // Salva oferta no banco (limpa candidatos antigos se for nova sessão - opcional)
        await roomRef.set({ offer: { type: offer.type, sdp: offer.sdp } }, { merge: true });

        // 2. Escuta RESPOSTA do Jogador
        roomRef.onSnapshot(async snap => {
            const data = snap.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                console.log("📩 Resposta do Jogador recebida!");
                const answerDesc = new RTCSessionDescription(data.answer);
                await pc.setRemoteDescription(answerDesc);
                
                // Processa candidatos que estavam na fila
                processCandidateQueue(); 
            }
        });

        // 3. Escuta CANDIDATOS do Jogador (Com Fila)
        const candidateQueue = [];
        roomRef.collection('answerCandidates').onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const candidate = new RTCIceCandidate(data);
                    
                    if (pc.remoteDescription) {
                        pc.addIceCandidate(candidate).catch(e => console.error("Erro ICE:", e));
                    } else {
                        console.log("⏳ Candidato na fila (aguardando resposta remota)...");
                        candidateQueue.push(candidate);
                    }
                }
            });
        });

        function processCandidateQueue() {
            if(candidateQueue.length > 0) {
                console.log(`🚀 Processando ${candidateQueue.length} candidatos da fila...`);
                candidateQueue.forEach(c => pc.addIceCandidate(c).catch(e => console.error(e)));
                candidateQueue.length = 0; // Limpa fila
            }
        }
    }

    function setupInviteLink(id) {
        const link = `${window.location.origin}/sala.html?sessionId=${id}&guest=true`;
        if(inviteInput) inviteInput.value = link;
        if(reopenBtn) reopenBtn.onclick = () => inviteModal.classList.remove('hidden');
        if(copyBtn) copyBtn.onclick = () => { inviteInput.select(); document.execCommand('copy'); alert('Copiado!'); };
    }

    initSession();
});