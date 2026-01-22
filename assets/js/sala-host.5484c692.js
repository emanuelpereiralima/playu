document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÕES ---
    const localVideo = document.getElementById('host-local-video');
    const remoteVideo = document.getElementById('host-remote-video');
    const db = window.db || firebase.firestore();
    
    // WebRTC Config
    const servers = {
        iceServers: [
            { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
        ],
        iceCandidatePoolSize: 10,
    };

    let localStream = null;
    let pc = null;
    let roomRef = null;
    let currentGameId = null; // Armazena o ID do jogo atual

    // URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    const isTestMode = urlParams.get('mode') === 'test';

    // Auth
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));

    // =========================================================================
    // 1. VERIFICAÇÃO DE HOST & INICIALIZAÇÃO
    // =========================================================================
    if (!loggedInUser || (loggedInUser.role !== 'host' && loggedInUser.role !== 'admin')) {
        alert("Acesso restrito ao Host.");
        window.location.href = 'index.html';
        return;
    }

    if (!bookingId) {
        alert("ID da sessão não encontrado.");
        window.location.href = 'admin.html';
        return;
    }

    roomRef = db.collection('sessions').doc(bookingId);

    async function initSession() {
        try {
            // 1. Garante que a sessão WebRTC existe
            const sessionDoc = await roomRef.get();
            if (!sessionDoc.exists) {
                await roomRef.set({
                    created: firebase.firestore.FieldValue.serverTimestamp(),
                    hostStatus: 'online'
                });
            }

            // 2. Busca dados do Agendamento para saber qual é o Jogo
            const bookingDoc = await db.collection('bookings').doc(bookingId).get();
            if (bookingDoc.exists) {
                const bookingData = bookingDoc.data();
                currentGameId = bookingData.gameId;
                
                // 3. Carrega os Assets do Jogo
                if (currentGameId) {
                    loadGameAssets(currentGameId);
                }
            } else {
                console.error("Agendamento não encontrado no banco.");
            }

            // 4. Inicia WebRTC
            startHost();

        } catch (e) {
            console.error("Erro na inicialização:", e);
        }
    }
    
    initSession();
    
    // --- MODO DE TESTE (UI) ---
    if (isTestMode) {
        const linkPanel = document.createElement('div');
        linkPanel.style.cssText = "background: #1a1a2e; border: 1px solid #00ff88; padding: 1rem; margin: 1rem; border-radius: 8px; text-align: center;";
        linkPanel.innerHTML = `
            <h3 style="color:#00ff88; margin-bottom:0.5rem;"><ion-icon name="flask-outline"></ion-icon> Sala de Teste</h3>
            <p style="margin-bottom:0.5rem; font-size:0.9rem;">Link do Jogador:</p>
            <div style="display:flex; gap:10px; max-width:600px; margin:0 auto;">
                <input type="text" id="share-link-input" readonly style="flex:1; padding:8px; border-radius:5px; border:1px solid #555; background:#222; color:#fff;">
                <button id="copy-link-btn" class="submit-btn small-btn">Copiar</button>
            </div>
        `;
        const container = document.querySelector('.game-room-container');
        if(container) container.before(linkPanel); else document.body.prepend(linkPanel);

        const baseUrl = window.location.origin + window.location.pathname.replace('sala-host.html', 'sala.html');
        const guestLink = `${baseUrl}?bookingId=${bookingId}&mode=test`;
        const input = document.getElementById('share-link-input');
        input.value = guestLink;

        document.getElementById('copy-link-btn').onclick = () => {
            input.select(); document.execCommand('copy'); alert("Copiado!");
        };
    }

    // =========================================================================
    // 2. CARREGAMENTO DE MÍDIAS DO FIREBASE (NOVO)
    // =========================================================================
    async function loadGameAssets(gameId) {
        const listContainer = document.getElementById('host-assets-list');
        if (!listContainer) return;

        try {
            const gameDoc = await db.collection('games').doc(gameId).get();
            if (!gameDoc.exists) {
                listContainer.innerHTML = '<p style="font-size:0.8rem; color:#888;">Jogo não encontrado.</p>';
                return;
            }

            const assets = gameDoc.data().sessionAssets || [];
            listContainer.innerHTML = ''; // Limpa loader

            if (assets.length === 0) {
                listContainer.innerHTML = '<p style="font-size:0.8rem; color:#888;">Nenhuma mídia cadastrada.</p>';
                return;
            }

            assets.forEach(asset => {
                // Cria o botão visual da mídia
                const btn = document.createElement('div');
                btn.className = 'asset-btn';
                btn.style.cssText = `
                    display: flex; align-items: center; gap: 10px;
                    background: rgba(255,255,255,0.05); padding: 10px;
                    border-radius: 6px; cursor: pointer; transition: 0.2s;
                    border: 1px solid transparent;
                `;

                // Ícone baseado no tipo
                let iconName = 'document-outline';
                let iconColor = '#fff';
                
                if (asset.type === 'image') { iconName = 'image-outline'; iconColor = '#4facfe'; }
                else if (asset.type === 'video') { iconName = 'videocam-outline'; iconColor = '#00ff88'; }
                else if (asset.type === 'audio') { iconName = 'musical-notes-outline'; iconColor = '#ffbb00'; }

                btn.innerHTML = `
                    <ion-icon name="${iconName}" style="font-size: 1.2rem; color: ${iconColor};"></ion-icon>
                    <div style="flex:1; overflow:hidden;">
                        <div style="font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${asset.name}</div>
                        <div style="font-size:0.7rem; color:#aaa; text-transform:uppercase;">${asset.type}</div>
                    </div>
                    <ion-icon name="send-outline"></ion-icon>
                `;

                // Ação de Clique: Enviar para o Jogador
                btn.onclick = async () => {
                    // Feedback visual de clique
                    btn.style.borderColor = 'var(--secondary-color)';
                    btn.style.background = 'rgba(233, 69, 96, 0.1)';
                    
                    try {
                        // Atualiza a sessão no Firebase -> Dispara listener na sala.js
                        await roomRef.update({
                            liveMedia: {
                                type: asset.type,
                                src: asset.url,
                                name: asset.name,
                                timestamp: firebase.firestore.FieldValue.serverTimestamp()
                            }
                        });
                        
                        setTimeout(() => {
                            btn.style.borderColor = 'transparent';
                            btn.style.background = 'rgba(255,255,255,0.05)';
                        }, 500);
                        
                    } catch (error) {
                        console.error("Erro ao enviar mídia:", error);
                        alert("Erro ao enviar mídia.");
                    }
                };

                listContainer.appendChild(btn);
            });

        } catch (error) {
            console.error("Erro ao carregar assets:", error);
            listContainer.innerHTML = '<p style="color:red; font-size:0.8rem;">Erro ao carregar.</p>';
        }
    }

    // =========================================================================
    // 3. WEBRTC (HOST)
    // =========================================================================
    async function startHost() {
        pc = new RTCPeerConnection(servers);

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            setupHostMediaControls();
        } catch (err) {
            console.error("Erro câmera Host:", err);
            alert("Erro ao acessar câmera/microfone.");
        }

        pc.ontrack = event => {
            if (event.streams && event.streams[0]) remoteVideo.srcObject = event.streams[0];
            else remoteVideo.srcObject = new MediaStream(event.track);
        };

        const offerCandidates = roomRef.collection('offerCandidates');
        const answerCandidates = roomRef.collection('answerCandidates');

        pc.onicecandidate = event => {
            if (event.candidate) offerCandidates.add(event.candidate.toJSON());
        };

        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);
        const offer = { sdp: offerDescription.sdp, type: offerDescription.type };
        await roomRef.set({ offer }, { merge: true });

        roomRef.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                const answerDescription = new RTCSessionDescription(data.answer);
                pc.setRemoteDescription(answerDescription);
            }
            if (data?.playerChoice) {
                alert(`O jogador escolheu: ${data.playerChoice}`);
                roomRef.update({ playerChoice: firebase.firestore.FieldValue.delete() });
            }
        });

        answerCandidates.onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate);
                }
            });
        });
    }

    function setupHostMediaControls() {
        const micBtn = document.getElementById('host-mic-btn');
        const camBtn = document.getElementById('host-cam-btn');
        if(micBtn) micBtn.onclick = () => {
            const track = localStream.getAudioTracks()[0];
            track.enabled = !track.enabled;
            micBtn.classList.toggle('active', track.enabled);
        };
        if(camBtn) camBtn.onclick = () => {
            const track = localStream.getVideoTracks()[0];
            track.enabled = !track.enabled;
            camBtn.classList.toggle('active', track.enabled);
        };
    }

    // =========================================================================
    // 4. OUTRAS FERRAMENTAS DO HOST
    // =========================================================================
    
    // Toggle Sidebar
    const toggleBtn = document.getElementById('toggle-tools-btn');
    if(toggleBtn) toggleBtn.addEventListener('click', () => {
        document.querySelector('.host-tools-wrapper').classList.toggle('collapsed');
    });

    // Enviar Dica (Texto Livre)
    document.querySelectorAll('.send-hint-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const hintId = e.target.dataset.hint;
            const textarea = document.querySelector(`textarea[data-hint="${hintId}"]`);
            if(textarea && textarea.value) {
                await roomRef.set({ hints: { [hintId]: textarea.value } }, { merge: true });
                alert(`Dica ${hintId} enviada!`);
            }
        });
    });

    // Timer
    const timerBtn = document.getElementById('start-timer-btn');
    if(timerBtn) timerBtn.addEventListener('click', async () => {
        await roomRef.update({ startTime: firebase.firestore.FieldValue.serverTimestamp() });
        alert('Cronômetro iniciado!');
    });

    // Encerrar
    const endBtn = document.getElementById('end-session-btn');
    if(endBtn) endBtn.addEventListener('click', () => {
        if(confirm("Encerrar sessão?")) window.location.href = 'host-panel.html';
    });
});