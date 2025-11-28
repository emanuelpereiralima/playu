// playu/assets/js/sala.js

document.addEventListener('DOMContentLoaded', () => {
    // Elementos e Variáveis Globais
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const accessMsgContainer = document.getElementById('access-message-container');
    
    let localStream = null;
    let pc = null; 
    let roomRef = null;
    let timerInterval = null;
    let isAnswerSent = false;

    // Configuração WebRTC
    const servers = {
        iceServers: [
            { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
        ],
        iceCandidatePoolSize: 10,
    };

    // Dados da URL e Sessão
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    const db = window.db || firebase.firestore();

    let session = null;

    // --- VERIFICAÇÃO DE ACESSO ---
    async function verifyAccessAndLoadData() {
        if (!bookingId) {
            showAccessError('<h1>Sessão Inválida</h1><p>Link não encontrado.</p>');
            return false;
        }
        if (!loggedInUser) {
            showAccessError('<h1>Acesso Negado</h1><p>Faça login para continuar.</p><a href="login.html" class="submit-btn">Login</a>');
            return false;
        }

        try {
            const bookingDoc = await db.collection('bookings').doc(bookingId).get();

            if (!bookingDoc.exists) {
                showAccessError('<h1>Sessão Inexistente</h1><p>Este agendamento não existe.</p>');
                return false;
            }

            session = bookingDoc.data();

            // 1. Verifica se é o dono do agendamento
            if (session.userId !== loggedInUser.username) {
                showAccessError('<h1>Acesso Negado</h1><p>Você não é o jogador agendado.</p>');
                return false;
            }

            // 2. VERIFICAÇÃO DE HORÁRIO (REGRA DOS 10 MINUTOS)
            if (!checkTimeRestriction(session.date, session.time)) {
                return false; // Bloqueia se ainda não for a hora
            }

            return true;

        } catch (error) {
            console.error("Erro verificação:", error);
            showAccessError('<h1>Erro</h1><p>Falha ao verificar sessão.</p>');
            return false;
        }
    }

    // --- FUNÇÃO DE RESTRIÇÃO DE TEMPO ---
    function checkTimeRestriction(dateStr, timeStr) {
        // Cria a data do agendamento (Ex: "2025-12-01T14:30:00")
        const scheduledDate = new Date(`${dateStr}T${timeStr}:00`);
        const now = new Date();

        // Calcula a diferença em minutos
        const diffMs = scheduledDate - now;
        const diffMinutes = Math.floor(diffMs / 1000 / 60);

        // Se faltam mais de 10 minutos (ex: 15, 60, 1000 minutos positivos)
        if (diffMinutes > 10) {
            showAccessError(`
                <h1>Sala Fechada</h1>
                <p>Sua sessão está agendada para <strong>${dateStr.split('-').reverse().join('/')} às ${timeStr}</strong>.</p>
                <p>A sala será liberada 10 minutos antes do início.</p>
                <div style="margin-top:1rem; padding:1rem; background:rgba(255,255,255,0.1); border-radius:8px;">
                    Faltam aproximadamente <strong>${diffMinutes} minutos</strong>.
                </div>
                <a href="dashboard.html" class="submit-btn" style="margin-top:1rem; text-decoration:none;">Voltar ao Dashboard</a>
            `);
            return false;
        }

        // Se já passou muito tempo (ex: 2 horas depois), opcionalmente bloquear também
        // if (diffMinutes < -120) { ... "Sessão expirada" ... }

        return true;
    }

    function showAccessError(html) {
        accessMsgContainer.innerHTML = html;
        accessMsgContainer.style.display = 'flex';
        document.getElementById('player-view')?.classList.add('hidden');
    }

    // --- INICIALIZAÇÃO ---
    verifyAccessAndLoadData().then(accessGranted => {
        if (accessGranted) {
            console.log('Acesso concedido. Entrando na sala...');
            accessMsgContainer.style.display = 'none';
            roomRef = db.collection('sessions').doc(bookingId);
            initPlayerView();
        }
    });

    // --- FUNÇÃO PRINCIPAL ---
    async function initPlayerView() {
        document.getElementById('player-view').classList.remove('hidden');
        await setupWebRTC();
        setupPlayerListeners();
    }

    // ... (O resto do código WebRTC, setupMediaControls, etc. permanece idêntico) ...
    // ... Mantenha as funções setupWebRTC, setupLocalMedia, answerOffer, setupPlayerListeners abaixo ...

    async function setupWebRTC() {
        pc = new RTCPeerConnection(servers);
        await setupLocalMedia();
        pc.ontrack = event => {
            if (event.streams && event.streams[0]) remoteVideo.srcObject = event.streams[0];
            else remoteVideo.srcObject = new MediaStream(event.track);
        };
        await answerOffer();
    }

    async function setupLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            setupMediaControls(true, 'player');
        } catch (err) {
            console.error("Erro mídia:", err);
            alert("Erro ao acessar câmera/microfone.");
        }
    }

    async function answerOffer() {
        const offerCandidates = roomRef.collection('offerCandidates');
        const answerCandidates = roomRef.collection('answerCandidates');

        pc.onicecandidate = event => {
            if (event.candidate) answerCandidates.add(event.candidate.toJSON());
        };

        roomRef.onSnapshot(async (snapshot) => {
            const data = snapshot.data();
            if (data?.offer && !isAnswerSent) {
                isAnswerSent = true;
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answerDescription = await pc.createAnswer();
                await pc.setLocalDescription(answerDescription);
                await roomRef.update({ answer: { type: answerDescription.type, sdp: answerDescription.sdp } });
            }
        });

        offerCandidates.onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
            });
        });
    }

    function setupMediaControls(enable, prefix) {
        const micBtn = document.getElementById(`${prefix}-mic-btn`);
        const camBtn = document.getElementById(`${prefix}-cam-btn`);
        if (!micBtn) return;
        micBtn.disabled = !enable; camBtn.disabled = !enable;
        if (enable) { micBtn.classList.add('active'); camBtn.classList.add('active'); }

        micBtn.onclick = () => {
            const track = localStream.getAudioTracks()[0];
            track.enabled = !track.enabled;
            micBtn.classList.toggle('active', track.enabled);
            micBtn.querySelector('ion-icon').setAttribute('name', track.enabled ? 'mic-outline' : 'mic-off-outline');
        };
        camBtn.onclick = () => {
            const track = localStream.getVideoTracks()[0];
            track.enabled = !track.enabled;
            camBtn.classList.toggle('active', track.enabled);
            camBtn.querySelector('ion-icon').setAttribute('name', track.enabled ? 'videocam-outline' : 'videocam-off-outline');
        };
    }

    function setupPlayerListeners() {
        document.getElementById('player-hints-btn').onclick = () => document.getElementById('player-hints-overlay').classList.toggle('hidden');
        document.getElementById('close-hints-btn').onclick = () => document.getElementById('player-hints-overlay').classList.add('hidden');
        document.getElementById('player-exit-btn').onclick = () => window.location.href = 'dashboard.html';

        roomRef.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (!data) return;
            if (data.startTime && !timerInterval) startTimer(data.startTime.toDate());
            
            if (data.hints) {
                document.querySelector('[data-hint-id="1"]').textContent = data.hints['1'] || '...';
                document.querySelector('[data-hint-id="2"]').textContent = data.hints['2'] || '...';
                document.querySelector('[data-hint-id="3"]').textContent = data.hints['3'] || '...';
            }
            if (data.liveDecision) renderLiveDecision(data.liveDecision, data.decisions || []);
            if (data.liveMedia) {
                showMediaInOverlay(data.liveMedia.src, data.liveMedia.type);
                roomRef.update({ liveMedia: null });
            }
        });
    }

    function renderLiveDecision(decisionId, allDecisions) {
        const activeDecision = allDecisions.find(d => d.id === decisionId);
        if (!activeDecision) return;
        const overlay = document.getElementById('player-decision-overlay');
        document.getElementById('decision-title').textContent = activeDecision.title;
        const container = document.getElementById('decision-options-container');
        container.innerHTML = '';
        activeDecision.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'submit-btn';
            btn.textContent = opt;
            btn.onclick = () => {
                roomRef.update({ playerChoice: opt, liveDecision: null });
                overlay.classList.add('hidden');
            };
            container.appendChild(btn);
        });
        overlay.classList.remove('hidden');
    }

    function showMediaInOverlay(src, type) {
        const overlay = document.getElementById('player-media-overlay');
        const content = document.getElementById('media-content');
        content.innerHTML = '';
        if (type.startsWith('audio')) {
            const audio = document.createElement('audio');
            audio.src = src; audio.autoplay = true; content.appendChild(audio);
            return;
        }
        const media = type.startsWith('video') ? document.createElement('video') : document.createElement('img');
        media.src = src;
        if(type.startsWith('video')) { media.autoplay = true; media.controls = true; }
        content.appendChild(media);
        overlay.classList.remove('hidden');
        document.getElementById('close-media-btn').onclick = () => { overlay.classList.add('hidden'); content.innerHTML = ''; };
    }

    function startTimer(startTime) {
        const display = document.getElementById('player-timer-overlay');
        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
            const total = (21 * 60) + (7 * 60);
            let current = total - elapsed;
            if (elapsed >= total) { current = 0; clearInterval(timerInterval); }
            if (current <= (7 * 60)) display.classList.add('extra-time');
            else current -= (7 * 60);
            
            const m = Math.floor(current / 60);
            const s = current % 60;
            display.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }, 1000);
    }
});