document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÕES E VARIÁVEIS GLOBAIS ---
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const accessMsgContainer = document.getElementById('access-message-container');
    
    let localStream = null;
    let pc = null; 
    let roomRef = null;
    let timerInterval = null;
    let isAnswerSent = false;

    // Configuração do Servidor STUN (Google) para WebRTC
    const servers = {
        iceServers: [
            { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
        ],
        iceCandidatePoolSize: 10,
    };

    // Dados da URL e Sessão
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    const db = window.db || firebase.firestore(); // Pega do config global
    
    // Recupera usuário da sessão
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));
    let session = null;

    // =========================================================================
    // 1. VERIFICAÇÃO DE ACESSO (Segurança + Lógica de Teste)
    // =========================================================================
    async function verifyAccessAndLoadData() {
        // Validação Básica
        if (!bookingId) {
            showAccessError('<h1>Sessão Inválida</h1><p>Link incompleto ou corrompido.</p>');
            return false;
        }
        
        // Login Obrigatório (Mesmo para teste, precisamos saber quem é)
        if (!loggedInUser) {
            sessionStorage.setItem('redirectAfterLogin', window.location.href);
            showAccessError(`
                <h1>Identificação Necessária</h1>
                <p>Para acessar a sala, você precisa se identificar.</p>
                <a href="login.html" class="submit-btn" style="margin-top:1rem; display:inline-block;">Entrar / Criar Conta</a>
            `);
            return false;
        }

        try {
            const bookingDoc = await db.collection('bookings').doc(bookingId).get();

            if (!bookingDoc.exists) {
                showAccessError('<h1>Sessão Inexistente</h1><p>Esta sala não existe ou foi encerrada.</p>');
                return false;
            }

            session = bookingDoc.data();

            // --- LÓGICA DE EXCEÇÃO PARA SALA DE TESTE ---
            if (session.type === 'test') {
                console.log("Entrando em modo de Sala de Teste...");
                // Permite acesso imediato para qualquer usuário logado
                return true; 
            }

            // --- LÓGICA PADRÃO (SALA REAL) ---
            
            // 1. Verifica se é o dono do agendamento
            if (session.userId !== loggedInUser.username) {
                showAccessError('<h1>Acesso Negado</h1><p>Esta sessão pertence a outro jogador.</p>');
                return false;
            }

            // 2. Regra dos 10 Minutos (Horário)
            if (!checkTimeRestriction(session.date, session.time)) {
                return false;
            }

            return true;

        } catch (error) {
            console.error("Erro verificação:", error);
            showAccessError('<h1>Erro de Conexão</h1><p>Falha ao verificar status da sala.</p>');
            return false;
        }
    }

    // Função Auxiliar: Verifica Horário
    function checkTimeRestriction(dateStr, timeStr) {
        // Cria Data Agendada (YYYY-MM-DDTHH:MM:00)
        const scheduledDate = new Date(`${dateStr}T${timeStr}:00`);
        const now = new Date();

        const diffMs = scheduledDate - now;
        const diffMinutes = Math.floor(diffMs / 1000 / 60);

        // Se faltam mais de 10 minutos
        if (diffMinutes > 10) {
            showAccessError(`
                <h1>Sala Fechada</h1>
                <p>Sua sessão está agendada para <strong>${dateStr.split('-').reverse().join('/')} às ${timeStr}</strong>.</p>
                <div style="margin-top:1rem; padding:1rem; background:rgba(255,255,255,0.1); border-radius:8px; border:1px solid #444;">
                    <p style="margin:0; font-size:0.9rem;">A sala abre 10 minutos antes.</p>
                    <p style="margin:0.5rem 0 0; font-weight:bold; color:var(--secondary-color);">Faltam aprox. ${diffMinutes} minutos.</p>
                </div>
                <a href="dashboard.html" class="submit-btn secondary-btn" style="margin-top:1.5rem;">Voltar ao Dashboard</a>
            `);
            return false;
        }
        return true;
    }

    function showAccessError(html) {
        if(accessMsgContainer) {
            accessMsgContainer.innerHTML = html;
            accessMsgContainer.style.display = 'flex';
        }
        const playerView = document.getElementById('player-view');
        if(playerView) playerView.classList.add('hidden');
    }

    // =========================================================================
    // 2. INICIALIZAÇÃO DA SALA (WEBRTC)
    // =========================================================================
    
    // Executa verificação ao carregar
    verifyAccessAndLoadData().then(accessGranted => {
        if (accessGranted) {
            console.log('Acesso concedido. Iniciando WebRTC...');
            if(accessMsgContainer) accessMsgContainer.style.display = 'none';
            
            // Referência à sessão no Firestore (para troca de sinais)
            // Em produção real, bookings e sessions podem ser coleções separadas, 
            // mas aqui usaremos o mesmo ID para simplificar.
            roomRef = db.collection('sessions').doc(bookingId);
            
            initPlayerView();
        }
    });

    async function initPlayerView() {
        document.getElementById('player-view').classList.remove('hidden');
        await setupWebRTC();
        setupPlayerListeners();
    }

    async function setupWebRTC() {
        pc = new RTCPeerConnection(servers);

        // 1. Configura Mídia Local (Câmera/Mic)
        await setupLocalMedia();

        // 2. Configura Recepção Remota (Vídeo do Host)
        pc.ontrack = event => {
            if (event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            } else {
                remoteVideo.srcObject = new MediaStream(event.track);
            }
        };

        // 3. Responde à oferta do Host
        await answerOffer();
    }

    async function setupLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            
            // Adiciona trilhas ao PC
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });

            // Ativa botões de Mute
            setupMediaControls(true);

        } catch (err) {
            console.error("Erro ao acessar mídia:", err);
            alert("Não foi possível acessar câmera ou microfone. Verifique as permissões.");
        }
    }

    async function answerOffer() {
        // Subcoleções para troca de candidatos ICE
        const offerCandidates = roomRef.collection('offerCandidates');
        const answerCandidates = roomRef.collection('answerCandidates');

        // Envia candidatos locais (Jogador) para o Host
        pc.onicecandidate = event => {
            if (event.candidate) {
                answerCandidates.add(event.candidate.toJSON());
            }
        };

        // Ouve a oferta do Host
        roomRef.onSnapshot(async (snapshot) => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.offer && !isAnswerSent) {
                console.log('Oferta recebida do Host.');
                isAnswerSent = true; // Evita loop

                const offerDescription = data.offer;
                await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

                const answerDescription = await pc.createAnswer();
                await pc.setLocalDescription(answerDescription);

                const answer = {
                    type: answerDescription.type,
                    sdp: answerDescription.sdp,
                };

                await roomRef.update({ answer });
            }
        });

        // Ouve candidatos remotos (do Host)
        offerCandidates.onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate);
                }
            });
        });
    }

    function setupMediaControls(enable) {
        const micBtn = document.getElementById('player-mic-btn');
        const camBtn = document.getElementById('player-cam-btn');
        
        if (!micBtn || !camBtn) return;

        micBtn.disabled = !enable;
        camBtn.disabled = !enable;

        if (enable) {
            micBtn.classList.add('active');
            camBtn.classList.add('active');
        }

        micBtn.onclick = () => {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                micBtn.classList.toggle('active', audioTrack.enabled);
                micBtn.innerHTML = audioTrack.enabled ? '<ion-icon name="mic-outline"></ion-icon>' : '<ion-icon name="mic-off-outline"></ion-icon>';
            }
        };

        camBtn.onclick = () => {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                camBtn.classList.toggle('active', videoTrack.enabled);
                camBtn.innerHTML = videoTrack.enabled ? '<ion-icon name="videocam-outline"></ion-icon>' : '<ion-icon name="videocam-off-outline"></ion-icon>';
            }
        };
    }

    // =========================================================================
    // 3. LISTENERS DE INTERAÇÃO (Dicas, Decisões, Timer)
    // =========================================================================
    
    function setupPlayerListeners() {
        // Botão Sair
        document.getElementById('player-exit-btn').onclick = () => {
            if(confirm("Sair da sala?")) window.location.href = 'dashboard.html';
        };

        // Botão Dicas (UI)
        const hintsOverlay = document.getElementById('player-hints-overlay');
        document.getElementById('player-hints-btn').onclick = () => hintsOverlay.classList.toggle('hidden');
        document.getElementById('close-hints-btn').onclick = () => hintsOverlay.classList.add('hidden');

        // Listener Global da Sessão (Atualizações do Host)
        roomRef.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (!data) return;

            // Timer
            if (data.startTime && !timerInterval) {
                startTimer(data.startTime.toDate());
            }

            // Dicas (Atualiza texto se houver)
            if (data.hints) {
                if(data.hints['1']) document.querySelector('[data-hint-id="1"]').textContent = data.hints['1'];
                if(data.hints['2']) document.querySelector('[data-hint-id="2"]').textContent = data.hints['2'];
                if(data.hints['3']) document.querySelector('[data-hint-id="3"]').textContent = data.hints['3'];
            }

            // Decisões
            if (data.liveDecision) {
                renderLiveDecision(data.liveDecision, data.decisions || []);
            }

            // Mídia (Imagem/Video/Audio pop-up)
            if (data.liveMedia) {
                showMediaInOverlay(data.liveMedia.src, data.liveMedia.type);
                // Reseta no banco para não reabrir se recarregar
                // (Opcional: Host deve controlar isso)
                // roomRef.update({ liveMedia: null }); 
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
                // Envia escolha para o Host
                roomRef.update({ 
                    playerChoice: opt,
                    liveDecision: null // Fecha decisão
                });
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
            // Audio toca em background ou player pequeno
            const audio = document.createElement('audio');
            audio.src = src;
            audio.autoplay = true;
            content.appendChild(audio);
            // Poderia mostrar um ícone de "Tocando Áudio..."
            return;
        }

        const media = type.startsWith('video') ? document.createElement('video') : document.createElement('img');
        media.src = src;
        media.style.maxWidth = '100%';
        media.style.maxHeight = '80vh';
        
        if(type.startsWith('video')) {
            media.autoplay = true;
            media.controls = true;
        }

        content.appendChild(media);
        overlay.classList.remove('hidden');

        document.getElementById('close-media-btn').onclick = () => {
            overlay.classList.add('hidden');
            content.innerHTML = ''; // Para o vídeo/audio
        };
    }

    function startTimer(startTime) {
        const display = document.getElementById('player-timer-overlay');
        // Exemplo: 28 min totais (21 jogo + 7 extra)
        const totalSeconds = (21 * 60) + (7 * 60);

        timerInterval = setInterval(() => {
            const now = new Date();
            const elapsed = Math.floor((now - startTime) / 1000);
            let current = totalSeconds - elapsed;

            if (elapsed >= totalSeconds) {
                current = 0;
                clearInterval(timerInterval);
                display.classList.add('time-up'); // CSS classe vermelha
            }

            // Lógica visual (ex: fica vermelho nos últimos 7 min)
            if (current <= (7 * 60)) {
                display.classList.add('extra-time');
            } else {
                current -= (7 * 60); // Mostra tempo regular
            }
            
            const m = Math.floor(current / 60);
            const s = current % 60;
            display.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }, 1000);
    }
});