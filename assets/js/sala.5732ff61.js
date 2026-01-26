document.addEventListener('DOMContentLoaded', async () => {
    console.log("🎮 Iniciando Sala do Jogador...");

    // 1. SETUP FIREBASE
    if (typeof firebase === 'undefined' || !firebase.apps.length) {
        return alert("Erro: Firebase não conectado.");
    }
    const db = firebase.firestore();
    const auth = firebase.auth();

    // 2. ELEMENTOS DOM
    const remoteVideo = document.getElementById('player-remote-video');
    const localVideo = document.getElementById('player-local-video');
    const loadingOverlay = document.getElementById('loading-overlay');
    const timerDisplay = document.getElementById('player-timer');
    
    // Media Overlay
    const mediaOverlay = document.getElementById('player-media-overlay');
    const mediaWrapper = document.getElementById('media-content-wrapper');
    window.closeMedia = () => mediaOverlay.classList.remove('active');

    // Decision Overlay
    const decisionOverlay = document.getElementById('player-decision-overlay');
    const decisionQuestion = document.getElementById('decision-question');
    const decisionOptions = document.getElementById('decision-options');

    // 3. VARIÁVEIS DE ESTADO
    let roomRef = null;
    let localStream = null;
    let pc = null;
    const servers = { iceServers: [{ urls: 'stun:stun1.l.google.com:19302' }] };

    // 4. URL & AUTH
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    const isGuest = urlParams.get('guest') === 'true';

    if (!bookingId) {
        alert("Link inválido. ID da sessão não encontrado.");
        window.location.href = 'index.html';
        return;
    }

    // Verifica Login (se não for Guest)
    if (!isGuest) {
        const sessionUser = sessionStorage.getItem('loggedInUser');
        if (!sessionUser) {
            // Salva link para voltar depois do login
            sessionStorage.setItem('redirectAfterLogin', window.location.href);
            window.location.href = 'login.html';
            return;
        }
    } else {
        console.log("👤 Acesso Convidado (Guest Mode)");
    }

    // =========================================================================
    // INICIALIZAÇÃO
    // =========================================================================
    async function init() {
        try {
            roomRef = db.collection('sessions').doc(bookingId);
            const doc = await roomRef.get();
            
            if (!doc.exists) {
                alert("Esta sessão ainda não foi iniciada pelo Host.");
                return;
            }

            // A. Iniciar WebRTC (Responder ao Host)
            await startPlayerWebRTC();

            // B. Configurar Listeners (Timer, Mídia, Decisões)
            setupRealtimeListeners();

            // Remove Loading
            loadingOverlay.style.display = 'none';

        } catch (e) {
            console.error("Erro init:", e);
            alert("Erro ao conectar: " + e.message);
        }
    }

    // =========================================================================
    // WEBRTC (LADO JOGADOR / ANSWER)
    // =========================================================================
    async function startPlayerWebRTC() {
        pc = new RTCPeerConnection(servers);

        // 1. Pegar Mídia Local
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            setupControls();
        } catch (err) {
            console.warn("Sem câmera/mic:", err);
            // Continua para ver o host
        }

        // 2. Receber Stream do Host
        pc.ontrack = event => {
            console.log("📡 Stream do Host recebido!");
            if(event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            }
        };

        // 3. ICE Candidates
        const offerCandidates = roomRef.collection('offerCandidates');
        const answerCandidates = roomRef.collection('answerCandidates');

        pc.onicecandidate = event => {
            if(event.candidate) {
                answerCandidates.add(event.candidate.toJSON());
            }
        };

        // 4. Lógica de Sinalização (Ler Offer -> Criar Answer)
        const roomSnapshot = await roomRef.get();
        const roomData = roomSnapshot.data();

        if (roomData.offer) {
            await pc.setRemoteDescription(new RTCSessionDescription(roomData.offer));
            
            const answerDescription = await pc.createAnswer();
            await pc.setLocalDescription(answerDescription);

            const answer = {
                type: answerDescription.type,
                sdp: answerDescription.sdp
            };

            await roomRef.update({ answer });
        }

        // 5. Escutar ICE Candidates do Host
        offerCandidates.onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if(change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate);
                }
            });
        });
    }

    // =========================================================================
    // LISTENERS EM TEMPO REAL (INTERATIVIDADE)
    // =========================================================================
    function setupRealtimeListeners() {
        roomRef.onSnapshot(snapshot => {
            const data = snapshot.data();
            if(!data) return;

            // --- 1. TIMER ---
            if (data.timer) {
                updateTimerDisplay(data.timer);
            }

            // --- 2. MÍDIA AO VIVO ---
            if (data.liveMedia && data.liveMedia.timestamp) {
                // Checa se é uma mídia nova (pra não reabrir se usuário fechou e o host não mudou)
                // Aqui usamos uma lógica simples: sempre que mudar o timestamp, mostra.
                const lastTs = mediaOverlay.dataset.timestamp;
                if (String(data.liveMedia.timestamp) !== lastTs) {
                    showMedia(data.liveMedia);
                }
            }

            // --- 3. DECISÕES ---
            if (data.activeDecision) {
                showDecision(data.activeDecision);
            } else {
                decisionOverlay.classList.remove('active');
            }
            
            // --- 4. STATUS DO HOST ---
            if (data.hostStatus === 'offline') {
                alert("O Host encerrou a sessão.");
                window.location.href = 'index.html';
            }
        });
    }

    // UI UPDATERS
    
    function updateTimerDisplay(timerData) {
        if (!timerDisplay) return;
        
        // Aplica Estilos do Host
        if(timerData.font) timerDisplay.style.fontFamily = timerData.font;
        if(timerData.color) timerDisplay.style.color = timerData.color;

        const seconds = timerData.value;
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        let text = '';
        if (h > 0) {
            text = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        } else {
            text = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }
        timerDisplay.textContent = text;
    }

    function showMedia(media) {
        mediaWrapper.innerHTML = '';
        mediaOverlay.dataset.timestamp = media.timestamp;
        
        let el;
        if (media.type === 'image') {
            el = document.createElement('img');
            el.src = media.url;
            el.className = 'media-content';
        } else if (media.type === 'video') {
            el = document.createElement('video');
            el.src = media.url;
            el.className = 'media-content';
            el.controls = true;
            el.autoplay = true;
        }

        if (el) {
            mediaWrapper.appendChild(el);
            mediaOverlay.classList.add('active');
        }
    }

    function showDecision(decision) {
        decisionQuestion.textContent = decision.question;
        decisionOptions.innerHTML = '';

        decision.options.forEach((opt, i) => {
            const btn = document.createElement('button');
            btn.className = 'decision-btn';
            btn.textContent = `${String.fromCharCode(65+i)}. ${opt}`;
            btn.onclick = () => {
                // Efeito visual de seleção
                btn.style.background = '#00ff88';
                btn.style.color = '#000';
                btn.textContent = "Voto Enviado!";
                // Opcional: Enviar voto para o banco (ainda não implementado no host)
                setTimeout(() => decisionOverlay.classList.remove('active'), 1000);
            };
            decisionOptions.appendChild(btn);
        });

        decisionOverlay.classList.add('active');
    }

    function setupControls() {
        const micBtn = document.getElementById('player-mic-btn');
        const camBtn = document.getElementById('player-cam-btn');
        const leaveBtn = document.getElementById('player-leave-btn');

        if(micBtn) micBtn.onclick = () => {
            const track = localStream.getAudioTracks()[0];
            if(track) {
                track.enabled = !track.enabled;
                micBtn.classList.toggle('active', !track.enabled);
                micBtn.innerHTML = track.enabled ? '<ion-icon name="mic-outline"></ion-icon>' : '<ion-icon name="mic-off-outline"></ion-icon>';
            }
        }

        if(camBtn) camBtn.onclick = () => {
            const track = localStream.getVideoTracks()[0];
            if(track) {
                track.enabled = !track.enabled;
                camBtn.classList.toggle('active', !track.enabled);
                camBtn.innerHTML = track.enabled ? '<ion-icon name="videocam-outline"></ion-icon>' : '<ion-icon name="videocam-off-outline"></ion-icon>';
            }
        }

        if(leaveBtn) leaveBtn.onclick = () => {
            if(confirm("Sair da sala?")) window.location.href = 'index.html';
        }
    }

    // INICIA
    init();
});