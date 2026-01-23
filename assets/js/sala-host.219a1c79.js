document.addEventListener('DOMContentLoaded', () => {
    // --- REFERÊNCIAS DOM ---
    const localVideo = document.getElementById('host-local-video');
    const remoteVideo = document.getElementById('host-remote-video');
    const loadingOverlay = document.getElementById('loading-screen') || document.getElementById('loading-overlay'); // Tenta achar o loader
    
    // --- FIREBASE & CONFIG ---
    const db = window.db || firebase.firestore();
    const servers = {
        iceServers: [
            { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
        ],
        iceCandidatePoolSize: 10,
    };

    let localStream = null;
    let pc = null;
    let roomRef = null;
    let currentGameId = null;

    // URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    const isTestMode = urlParams.get('mode') === 'test';

    // Auth Check
    const sessionData = sessionStorage.getItem('loggedInUser');
    const loggedInUser = sessionData ? JSON.parse(sessionData) : null;

    // =========================================================================
    // 1. INICIALIZAÇÃO DA SESSÃO
    // =========================================================================
    
    async function initSession() {
        // 1. Validação de Segurança
        if (!loggedInUser || (loggedInUser.role !== 'host' && loggedInUser.role !== 'admin')) {
            alert("Acesso restrito ao Host.");
            window.location.href = 'index.html';
            return;
        }

        if (!bookingId) {
            alert("ID da sessão inválido.");
            window.location.href = 'admin.html';
            return;
        }

        roomRef = db.collection('sessions').doc(bookingId);

        try {
            // 2. Criar ou validar documento da sessão WebRTC
            const sessionDoc = await roomRef.get();
            if (!sessionDoc.exists) {
                await roomRef.set({
                    created: firebase.firestore.FieldValue.serverTimestamp(),
                    hostStatus: 'online',
                    type: isTestMode ? 'test' : 'game'
                });
            } else {
                // Atualiza status se já existir
                await roomRef.update({ hostStatus: 'online' });
            }

            // 3. Buscar dados do Agendamento (Para saber qual é o Jogo)
            const bookingDoc = await db.collection('bookings').doc(bookingId).get();
            
            if (bookingDoc.exists) {
                const bookingData = bookingDoc.data();
                currentGameId = bookingData.gameId;
                
                // Carrega os botões de mídia se tivermos o ID do jogo
                if (currentGameId) {
                    loadGameAssets(currentGameId);
                }
            } else {
                console.warn("Agendamento não encontrado, modo fallback ativado.");
            }

            // 4. Iniciar Câmera e WebRTC
            await startHost();

            // 5. REMOVER TELA DE LOADING (A CORREÇÃO ESTÁ AQUI)
            if (loadingOverlay) {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                }, 500);
            }

        } catch (e) {
            console.error("Erro fatal na inicialização:", e);
            alert("Erro ao conectar na sala: " + e.message);
        }
    }

    // Inicia tudo
    initSession();

    // =========================================================================
    // 2. MODULO DE MÍDIAS (ASSETS)
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
            listContainer.innerHTML = ''; 

            if (assets.length === 0) {
                listContainer.innerHTML = '<p style="font-size:0.8rem; color:#888;">Nenhuma mídia cadastrada.</p>';
                return;
            }

            assets.forEach(asset => {
                const btn = document.createElement('div');
                btn.className = 'asset-btn';
                btn.style.cssText = `
                    display: flex; align-items: center; gap: 10px;
                    background: rgba(255,255,255,0.05); padding: 10px;
                    border-radius: 6px; cursor: pointer; transition: 0.2s;
                    border: 1px solid transparent; margin-bottom: 5px;
                `;

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

                btn.onclick = async () => {
                    // Feedback visual
                    btn.style.borderColor = 'var(--secondary-color)';
                    btn.style.background = 'rgba(233, 69, 96, 0.1)';
                    
                    try {
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
                        console.error("Erro envio media:", error);
                    }
                };
                listContainer.appendChild(btn);
            });
        } catch (error) {
            console.error("Erro assets:", error);
        }
    }

    // =========================================================================
    // 3. WEBRTC & CONTROLES
    // =========================================================================
    async function startHost() {
        pc = new RTCPeerConnection(servers);

        // Setup Local Stream
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            
            // Ativa controles de mute/video
            setupMediaControls();
            
        } catch (err) {
            console.error("Erro ao acessar câmera:", err);
            alert("Não foi possível acessar a câmera/microfone. Verifique as permissões.");
            throw err; // Interrompe a inicialização
        }

        // Setup Remote Stream
        pc.ontrack = event => {
            if (event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            } else {
                remoteVideo.srcObject = new MediaStream([event.track]);
            }
        };

        // ICE Candidates
        const offerCandidates = roomRef.collection('offerCandidates');
        const answerCandidates = roomRef.collection('answerCandidates');

        pc.onicecandidate = event => {
            if (event.candidate) offerCandidates.add(event.candidate.toJSON());
        };

        // Create Offer
        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);
        
        const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
        };
        await roomRef.set({ offer }, { merge: true });

        // Listen for Answer
        roomRef.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                const answerDescription = new RTCSessionDescription(data.answer);
                pc.setRemoteDescription(answerDescription);
            }
        });

        // Listen for Remote ICE
        answerCandidates.onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate);
                }
            });
        });
    }

    function setupMediaControls() {
        const micBtn = document.getElementById('host-mic-btn');
        const camBtn = document.getElementById('host-cam-btn');
        
        if(micBtn) micBtn.onclick = () => {
            const audioTrack = localStream.getAudioTracks()[0];
            if(audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                micBtn.classList.toggle('active', !audioTrack.enabled); // Active = Muted visualmente
                micBtn.innerHTML = audioTrack.enabled ? '<ion-icon name="mic"></ion-icon>' : '<ion-icon name="mic-off"></ion-icon>';
            }
        };
        
        if(camBtn) camBtn.onclick = () => {
            const videoTrack = localStream.getVideoTracks()[0];
            if(videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                camBtn.classList.toggle('active', !videoTrack.enabled);
                camBtn.innerHTML = videoTrack.enabled ? '<ion-icon name="videocam"></ion-icon>' : '<ion-icon name="videocam-off"></ion-icon>';
            }
        };
    }

    // =========================================================================
    // 4. INTERFACE DE TESTE & TOOLS
    // =========================================================================
    if (isTestMode) {
        createTestInterface();
    }

    function createTestInterface() {
        // Cria painel de link para teste
        const panel = document.createElement('div');
        panel.style.cssText = "background:#1a1a2e; border:1px solid #00ff88; padding:15px; margin:15px; border-radius:8px; text-align:center; position:relative; z-index:100;";
        
        const baseUrl = window.location.href.replace('sala-host.html', 'sala.html').split('?')[0];
        const guestLink = `${baseUrl}?bookingId=${bookingId}&mode=test`;
        
        panel.innerHTML = `
            <h3 style="color:#00ff88; margin:0 0 10px 0;"><ion-icon name="flask"></ion-icon> Modo de Teste</h3>
            <p style="margin-bottom:5px; font-size:0.9rem;">Envie este link para um convidado ou abra em aba anônima:</p>
            <div style="display:flex; gap:10px; justify-content:center;">
                <input type="text" value="${guestLink}" readonly style="width:70%; padding:8px; background:#222; border:1px solid #444; color:#fff; border-radius:4px;">
                <button onclick="navigator.clipboard.writeText('${guestLink}');alert('Copiado!')" class="submit-btn small-btn">Copiar</button>
            </div>
        `;
        
        const header = document.querySelector('header');
        if(header) header.after(panel);
        else document.body.prepend(panel);
    }
});