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
    // 2. MÍDIA LOCAL
    // =========================================================================
    async function setupLocalMedia() {
        try {
            const constraints = { video: { facingMode: currentFacingMode }, audio: true };
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            cameraStream = localStream; 

            if (localVideo) {
                localVideo.srcObject = localStream;
                localVideo.muted = true;
            }

            // Configura Botões (Mic, Cam, Swap)
            if(micBtn) micBtn.onclick = () => toggleTrack('audio');
            if(camBtn) camBtn.onclick = () => toggleTrack('video');
            
            if(switchBtn) switchBtn.onclick = async () => {
                if(!localStream) return;
                currentFacingMode = (currentFacingMode === 'user') ? 'environment' : 'user';
                localStream.getVideoTracks().forEach(t => t.stop());
                
                const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode }, audio: true });
                localVideo.srcObject = newStream;
                
                // Mantém estado do áudio
                const audioTrack = newStream.getAudioTracks()[0];
                if(audioTrack) audioTrack.enabled = !micBtn.classList.contains('active'); // Lógica inversa da classe active (active = mudo/off)

                localStream = newStream;
                cameraStream = newStream;
                
                // Atualiza conexão
                if(pc) {
                    const senders = pc.getSenders();
                    const vSender = senders.find(s => s.track.kind === 'video');
                    const aSender = senders.find(s => s.track.kind === 'audio');
                    if(vSender) vSender.replaceTrack(newStream.getVideoTracks()[0]);
                    if(aSender && audioTrack) aSender.replaceTrack(audioTrack);
                }
            };

            if(endBtn) endBtn.onclick = () => {
                if(confirm("Encerrar?")) {
                    roomRef.update({ hostStatus: 'offline' });
                    window.location.href = 'admin.html';
                }
            };
        } catch (e) { console.error("Erro mídia:", e); }
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

    function renderAssets(list) {
        if(!assetsList) return;
        assetsList.innerHTML = '';
        list.forEach(a => {
            const b = document.createElement('div');
            b.className = 'asset-btn';
            b.style.cssText = 'background:rgba(255,255,255,0.1); padding:10px; margin-bottom:5px; cursor:pointer; display:flex; align-items:center; gap:10px;';
            let icon = a.type === 'video' ? 'videocam' : (a.type === 'audio' ? 'musical-notes' : 'image');
            b.innerHTML = `<ion-icon name="${icon}-outline" style="color:#00ff88;"></ion-icon><div style="flex:1;">${a.name}</div><ion-icon name="play-circle"></ion-icon>`;
            
            b.onclick = () => {
                roomRef.update({ liveMedia: { ...a, timestamp: firebase.firestore.FieldValue.serverTimestamp() } });
                if(a.type === 'video') playVideoInHostCamera(a.url);
            };
            assetsList.appendChild(b);
        });
        const rBtn = document.createElement('button'); rBtn.className='submit-btn small-btn danger-btn'; rBtn.innerText='Restaurar Webcam'; rBtn.onclick=restoreCamera; assetsList.appendChild(rBtn);
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