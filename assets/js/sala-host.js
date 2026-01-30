document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Iniciando Sala Host (V-AUDIO UPDATE)...");

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

    // Listas e Paineis
    const assetsList = document.getElementById('host-assets-list');
    const decisionsList = document.getElementById('host-decisions-list');
    const timerDisplay = document.getElementById('session-timer');
    
    // Timer Controls
    const startBtn = document.getElementById('timer-start-btn');
    const pauseBtn = document.getElementById('timer-pause-btn');
    const resetBtn = document.getElementById('timer-reset-btn');
    
    // Feedback
    const decisionFeedback = document.getElementById('host-decision-feedback');
    const feedbackQuestion = document.getElementById('feedback-question');

    // Invite Modal
    const inviteModal = document.getElementById('invite-floating-modal');
    const inviteInput = document.getElementById('floating-invite-link');
    const copyBtn = document.getElementById('floating-copy-btn');
    const reopenBtn = document.getElementById('reopen-invite-btn');

    // --- VARIÁVEIS DE ESTADO ---
    let roomRef = null;
    let currentFacingMode = 'user';
    let localStream = null;
    let cameraStream = null;
    let pc = null;
    
    // Timer
    let timerInterval = null;
    let timerSeconds = 3600; 
    let initialTimer = 3600;
    let timerRunning = false;
    let timerConfig = { type: 'regressive' };
    
    // Media Control
    let currentPlayingAssetUrl = null;
    let currentAudio = null; // <--- NOVA VARIÁVEL PARA ÁUDIO LOCAL
    const sectionVolumes = { video: 1.0, audio: 1.0, image: 1.0 };

    // WebRTC Config
    const servers = {
        iceServers: [
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ]
    };

    // URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    const sessionIdParam = urlParams.get('sessionId');

    if (!bookingId && !sessionIdParam) {
        alert("Link inválido. Retorne ao Admin.");
        window.location.href = 'admin.html';
        return;
    }

    // =================================================================
    // 1. INICIALIZAÇÃO E LIGAÇÃO
    // =================================================================
    async function initSession() {
        try {
            let currentRoomId = sessionIdParam;

            // 1. Recuperar ID da Sessão via Booking
            if (!currentRoomId && bookingId) {
                const bookingDoc = await db.collection('bookings').doc(bookingId).get();
                if (bookingDoc.exists) {
                    const data = bookingDoc.data();
                    
                    if (data.sessionId) {
                        currentRoomId = data.sessionId;
                    } 
                    else if (data.time && data.gameId && data.date) {
                        currentRoomId = `session_${data.gameId}_${data.date}_${data.time.replace(':', '-')}`;
                        await bookingDoc.ref.update({ sessionId: currentRoomId }).catch(console.error);
                    } 
                    else {
                        console.warn("⚠️ Modo Teste: ID provisório gerado.");
                        currentRoomId = `session_manual_${bookingId}`;
                    }
                } else {
                    throw new Error("Agendamento não encontrado.");
                }
            }

            console.log("🔗 Conectando à sala:", currentRoomId);
            roomRef = db.collection('sessions').doc(currentRoomId);
            
            // 2. LIMPEZA SEGURA
            await resetSignaling();

            // 3. Setup Inicial e Recuperação do ID do Jogo
            const sessionDoc = await roomRef.get();
            let realGameId = null;

            if (sessionDoc.exists) {
                realGameId = sessionDoc.data().gameId;
                await roomRef.set({ hostStatus: 'online' }, { merge: true });
            } else {
                await roomRef.set({ hostStatus: 'online' }, { merge: true });
            }

            setupInviteLink(currentRoomId);
            await setupLocalMedia();
            startWebRTC();

            // 4. Carregar Dados do Jogo
            if (realGameId) {
                loadGameData(realGameId);
            } else {
                const parts = currentRoomId.split('_');
                if (parts.length > 1 && parts[1] !== 'manual') {
                    loadGameData(parts[1]); 
                } else {
                    assetsList.innerHTML = "<p style='padding:10px; color:#aaa;'>Modo Teste: Sem assets.</p>";
                }
            }

            listenToActiveDecision();

            if (loadingOverlay) loadingOverlay.style.display = 'none';

        } catch (error) {
            console.error("Erro fatal:", error);
            alert("Erro ao iniciar: " + error.message);
        }
    }

    async function resetSignaling() {
        console.log("🧹 Verificando sinalização antiga...");
        const doc = await roomRef.get();
        if (doc.exists) {
            await roomRef.update({ offer: null, answer: null });
        }
        
        const deleteCollection = async (path) => {
            const ref = roomRef.collection(path);
            const snap = await ref.get();
            if(!snap.empty) {
                const batch = db.batch();
                snap.docs.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
        };

        await deleteCollection('offerCandidates');
        await deleteCollection('answerCandidates');
    }

    // =================================================================
    // 2. CARREGAMENTO DE DADOS (JOGO)
    // =================================================================
    function loadGameData(gameId) {
        console.log("📂 Buscando dados do jogo:", gameId);
        db.collection('games').doc(gameId).get().then(doc => {
            if (doc.exists) processGameData(doc.data());
            else {
                db.collection('games').where('slug', '==', gameId).limit(1).get().then(snap => {
                    if(!snap.empty) processGameData(snap.docs[0].data());
                    else console.error("❌ Jogo não encontrado.");
                });
            }
        });
    }

    function processGameData(g) {
        if (g.sessionDuration) {
            const min = parseInt(g.sessionDuration);
            if (!isNaN(min)) {
                timerSeconds = min * 60;
                initialTimer = timerSeconds;
                if (!timerRunning) {
                    updateTimerDisplay();
                    syncTimer();
                }
            }
        }
        renderAssets(g.sessionAssets || []);
        renderDecisions(g.decisions || []);
    }

    // =================================================================
    // 3. GESTÃO DE ASSETS (MÍDIA & TOGGLE)
    // =================================================================
    function renderAssets(assets) {
        if (!assetsList) return;
        assetsList.innerHTML = '';
        if (!assets || assets.length === 0) return;

        const groups = { video: {l:'Vídeos', i:'videocam', d:[]}, audio: {l:'Áudios', i:'musical-notes', d:[]}, image: {l:'Imagens', i:'image', d:[]} };
        assets.forEach(a => { if (groups[a.type]) groups[a.type].d.push(a); });

        Object.keys(groups).forEach(type => {
            const g = groups[type]; if(g.d.length === 0) return;
            
            const section = document.createElement('div'); 
            section.className = 'assets-section';
            const showVol = type !== 'image';

            section.innerHTML = `
                <div class="section-header">
                    <div class="section-title"><ion-icon name="${g.i}-outline"></ion-icon> ${g.l}</div>
                    ${showVol ? `<input type="range" min="0" max="100" value="100" class="volume-slider" data-type="${type}">` : ''}
                </div><div class="items-container"></div>`;
            assetsList.appendChild(section);

            if(showVol) section.querySelector('.volume-slider').oninput = (e) => sectionVolumes[type] = e.target.value/100;

            const container = section.querySelector('.items-container');
            g.d.forEach(asset => {
                const btn = document.createElement('div'); btn.className = 'asset-btn';
                btn.innerHTML = `<div style="flex:1;overflow:hidden;text-overflow:ellipsis;">${asset.name}</div><ion-icon name="play-circle"></ion-icon>`;
                
                btn.onclick = () => {
                    // SE JÁ ESTIVER TOCANDO O MESMO -> PARA TUDO
                    if (currentPlayingAssetUrl === asset.url) {
                        restoreCamera(); 
                    } else {
                        // SE FOR NOVO, LIMPA O ANTERIOR PRIMEIRO
                        if (currentPlayingAssetUrl) restoreCamera();

                        currentPlayingAssetUrl = asset.url;
                        const vol = sectionVolumes[type] || 1.0;
                        
                        // Envia para o Jogador
                        sendMediaToPlayer(asset, btn, vol);

                        // Toca Localmente no Host
                        if(asset.type === 'video') playLocalVideo(asset.url, vol);
                        else if(asset.type === 'audio') playLocalAudio(asset.url, vol); // <--- AGORA TOCA ÁUDIO AQUI
                    }
                };
                container.appendChild(btn);
            });
        });

        const stopBtn = document.createElement('button'); 
        stopBtn.className = 'submit-btn small-btn danger-btn';
        stopBtn.style.cssText = "width:100%; margin-top:10px;";
        stopBtn.innerHTML = '<ion-icon name="stop-circle"></ion-icon> Restaurar Câmera / Parar Áudio';
        stopBtn.onclick = restoreCamera;
        assetsList.appendChild(stopBtn);
    }

    async function sendMediaToPlayer(asset, btn, volume) {
        if(!roomRef) return;
        const originalBg = btn.style.background;
        btn.style.background = 'rgba(0,255,136,0.2)';
        await roomRef.update({ 
            liveMedia: { 
                ...asset, 
                volume: volume, 
                timestamp: firebase.firestore.FieldValue.serverTimestamp() 
            } 
        });
        setTimeout(() => btn.style.background = originalBg, 500);
    }

    // --- TOCAR VÍDEO LOCAL ---
    async function playLocalVideo(url, volume) {
        localVideo.srcObject = null; localVideo.src = url; 
        localVideo.muted = false; localVideo.volume = volume;
        try { await localVideo.play(); } catch(e){ console.error(e); }

        const stream = localVideo.captureStream ? localVideo.captureStream() : localVideo.mozCaptureStream();
        if(stream && pc) {
            const sender = pc.getSenders().find(s => s.track.kind === 'video');
            if(sender) sender.replaceTrack(stream.getVideoTracks()[0]);
        }
        localVideo.onended = restoreCamera;
    }

    // --- TOCAR ÁUDIO LOCAL (NOVA FUNÇÃO) ---
    function playLocalAudio(url, volume) {
        // Se já tinha áudio, para
        if(currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        console.log("🔊 Tocando áudio local no Host...");
        currentAudio = new Audio(url);
        currentAudio.volume = volume;
        
        currentAudio.play().catch(e => console.error("Erro ao tocar áudio local:", e));
        
        // Quando acabar, restaura estado
        currentAudio.onended = restoreCamera;
    }

    // --- RESTAURAR ESTADO (STOP GERAL) ---
    async function restoreCamera() {
        console.log("♻️ Restaurando Câmera e Parando Mídias...");
        currentPlayingAssetUrl = null;
        
        // 1. Para Áudio Local
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio = null;
        }

        // 2. Restaura Vídeo Local (Câmera)
        if(!cameraStream) return;
        localVideo.src = ""; 
        localVideo.srcObject = cameraStream; 
        localVideo.muted = true; // Host não precisa ouvir a si mesmo

        // 3. Retorna Stream da Câmera pro WebRTC
        if(pc) {
            const sender = pc.getSenders().find(s => s.track.kind === 'video');
            if(sender) sender.replaceTrack(cameraStream.getVideoTracks()[0]);
        }

        // 4. Limpa Mídia no Jogador
        await roomRef.update({ liveMedia: null });
    }

    // =================================================================
    // 4. WEBRTC
    // =================================================================
    async function startWebRTC() {
        console.log("📡 Iniciando WebRTC...");
        pc = new RTCPeerConnection(servers);

        if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

        pc.ontrack = (event) => {
            if (remoteVideo) {
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.play().catch(e => console.warn(e));
            }
        };

        const offerCandidates = roomRef.collection('offerCandidates');
        pc.onicecandidate = (event) => {
            if (event.candidate) offerCandidates.add(event.candidate.toJSON());
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        const doc = await roomRef.get();
        if(doc.exists) await roomRef.update({ offer: { type: offer.type, sdp: offer.sdp } });
        else await roomRef.set({ offer: { type: offer.type, sdp: offer.sdp } }, {merge:true});

        roomRef.onSnapshot(async snap => {
            const data = snap.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                console.log("📩 Resposta recebida!");
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        });

        roomRef.collection('answerCandidates').onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(console.error);
            });
        });
    }

    // =================================================================
    // 5. MÍDIA LOCAL & TOOLS
    // =================================================================
    async function setupLocalMedia() {
        try {
            const constraints = { video: { facingMode: currentFacingMode, width:{ideal:1280}, height:{ideal:720} }, audio: true };
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            cameraStream = localStream; 
            
            if (localVideo) { localVideo.srcObject = localStream; localVideo.muted = true; }

            if(micBtn) micBtn.onclick = () => {
                const t = localStream.getAudioTracks()[0];
                if(t) { t.enabled = !t.enabled; micBtn.classList.toggle('active', !t.enabled); }
            };
            if(camBtn) camBtn.onclick = () => {
                const t = localStream.getVideoTracks()[0];
                if(t) { t.enabled = !t.enabled; camBtn.classList.toggle('active', !t.enabled); localVideo.classList.toggle('camera-off', !t.enabled); }
            };
            if(switchBtn) switchBtn.onclick = switchCamera;
            if(endBtn) endBtn.onclick = () => { if(confirm("Encerrar?")) { roomRef.update({hostStatus:'offline'}); window.location.href='admin.html'; }};

        } catch (e) { console.error("Erro mídia:", e); }
    }

    async function switchCamera() {
        if(!localStream) return;
        currentFacingMode = (currentFacingMode==='user')?'environment':'user';
        localStream.getVideoTracks().forEach(t=>t.stop());
        const newStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:currentFacingMode}, audio:true});
        localVideo.srcObject = newStream;
        newStream.getAudioTracks()[0].enabled = !micBtn.classList.contains('active');
        localStream = newStream;
        cameraStream = newStream;
        if(pc) {
            const sender = pc.getSenders().find(s=>s.track.kind==='video');
            if(sender) sender.replaceTrack(newStream.getVideoTracks()[0]);
        }
    }

    // =================================================================
    // 6. TIMER & DECISÕES
    // =================================================================
    function updateTimerDisplay() { 
        if(!timerDisplay) return;
        const h=Math.floor(timerSeconds/3600), m=Math.floor((timerSeconds%3600)/60), s=timerSeconds%60;
        timerDisplay.innerText = h>0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
    }
    const p = n => String(n).padStart(2,'0');
    function syncTimer() { if(roomRef) roomRef.update({ timer: { value: timerSeconds, isRunning: timerRunning } }).catch(()=>{}); }
    if(startBtn) startBtn.onclick = () => { 
        if(!timerRunning) { 
            timerRunning=true; 
            timerInterval=setInterval(()=>{ 
                if(timerSeconds>0) timerSeconds--; else stopTimer(); 
                updateTimerDisplay(); syncTimer(); 
            },1000); 
        } 
    };
    if(pauseBtn) pauseBtn.onclick = stopTimer;
    if(resetBtn) resetBtn.onclick = () => { stopTimer(); timerSeconds=initialTimer; updateTimerDisplay(); syncTimer(); };
    function stopTimer() { timerRunning=false; clearInterval(timerInterval); syncTimer(); }

    function renderDecisions(list) {
        decisionsList.innerHTML = '';
        list.forEach(d => {
            const el = document.createElement('div'); el.className='decision-card';
            el.innerHTML = `<b>${d.question}</b>`;
            el.onclick = () => roomRef.update({ activeDecision: { ...d, timestamp: firebase.firestore.FieldValue.serverTimestamp() }});
            decisionsList.appendChild(el);
        });
    }
    window.clearPlayerDecision = () => roomRef.update({ activeDecision: null });

    function listenToActiveDecision() {
        roomRef.onSnapshot(doc => {
            const d = doc.data();
            if(d?.activeDecision && decisionFeedback) {
                decisionFeedback.classList.remove('hidden');
                document.getElementById('feedback-question').innerText = d.activeDecision.question;
            } else if(decisionFeedback) {
                decisionFeedback.classList.add('hidden');
            }
        });
    }

    function setupInviteLink(id) {
        const link = `${window.location.origin}/sala.html?sessionId=${id}&guest=true`;
        if(inviteInput) inviteInput.value = link;
        if(reopenBtn) reopenBtn.onclick=()=>inviteModal.classList.remove('hidden');
        if(copyBtn) copyBtn.onclick=()=>{inviteInput.select();document.execCommand('copy');alert('Copiado!');};
    }

    initSession();
});