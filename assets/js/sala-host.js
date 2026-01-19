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

    // URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    const isTestMode = urlParams.get('mode') === 'test';

    // Auth
    const loggedInUser = JSON.parse(sessionStorage.getItem('loggedInUser'));

    // =========================================================================
    // 1. VERIFICAÇÃO DE HOST
    // =========================================================================
    // 1. Verifica se está logado
    if (!loggedInUser || (loggedInUser.role !== 'host' && loggedInUser.role !== 'admin')) {
        alert("Acesso restrito ao Host.");
        window.location.href = 'index.html';
        return;
    }

    if (!bookingId) {
        alert("ID da sessão não encontrado.");
        window.location.href = 'admin.html'; // Volta pro admin
        return;
    }

    // Inicializa Referência
    roomRef = db.collection('sessions').doc(bookingId);;

    async function ensureSessionExists() {
        try {
            const doc = await roomRef.get();
            if(doc.exists) {
            if (bookingData && bookingData.gameId) {
                loadGameAssets(bookingData.gameId);
            }
        }
            if (!doc.exists) {
                // Cria documento vazio da sessão para sinalização WebRTC
                await roomRef.set({
                    created: firebase.firestore.FieldValue.serverTimestamp(),
                    hostStatus: 'online'
                });
            }
        } catch (e) {
            console.error("Erro ao verificar sessão:", e);
        }
    }
    
    // Chama a garantia antes de iniciar
    ensureSessionExists().then(() => {
        // Inicia tudo
        startHost();
    });
    
    // --- LÓGICA DE MODO DE TESTE (LINK DE CONVITE) ---
    if (isTestMode) {
        const mainContent = document.querySelector('.main-content') || document.body;
        
        const linkPanel = document.createElement('div');
        linkPanel.style.cssText = "background: #1a1a2e; border: 1px solid #00ff88; padding: 1rem; margin: 1rem; border-radius: 8px; text-align: center;";
        linkPanel.innerHTML = `
            <h3 style="color:#00ff88; margin-bottom:0.5rem;"><ion-icon name="flask-outline"></ion-icon> Sala de Teste Ativa</h3>
            <p style="margin-bottom:0.5rem; font-size:0.9rem;">Envie este link para quem vai testar com você (abre a visão do Jogador):</p>
            <div style="display:flex; gap:10px; max-width:600px; margin:0 auto;">
                <input type="text" id="share-link-input" readonly style="flex:1; padding:8px; border-radius:5px; border:1px solid #555; background:#222; color:#fff;">
                <button id="copy-link-btn" class="submit-btn small-btn">Copiar</button>
            </div>
        `;
        
        // Insere no topo
        if(document.querySelector('.game-room-container')) {
            document.querySelector('.game-room-container').before(linkPanel);
        } else {
            document.body.prepend(linkPanel);
        }

        // Gera Link
        const baseUrl = window.location.origin + window.location.pathname.replace('sala-host.html', 'sala.html');
        // Usa o mesmo bookingId e mode=test
        const guestLink = `${baseUrl}?bookingId=${bookingId}&mode=test`;
        
        const input = document.getElementById('share-link-input');
        input.value = guestLink;

        document.getElementById('copy-link-btn').onclick = () => {
            input.select();
            document.execCommand('copy');
            alert("Link copiado para a área de transferência!");
        };
    }

    async function loadGameAssets(gameId) {
        const container = document.getElementById('game-assets-container');
        if(!container) return;

        try {
            const gameDoc = await db.collection('games').doc(gameId).get();
            if(!gameDoc.exists) return;

            const assets = gameDoc.data().sessionAssets || [];
            container.innerHTML = '';

            if(assets.length === 0) {
                container.innerHTML = '<p style="font-size:0.8rem; opacity:0.5; text-align:center;">Sem mídias cadastradas.</p>';
                return;
            }

            assets.forEach(asset => {
                const btn = document.createElement('div');
                btn.style.cssText = "display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); padding: 8px; border-radius: 6px; cursor: pointer; border: 1px solid transparent; transition: 0.2s;";
                
                // Ícone baseado no tipo
                let icon = asset.type === 'image' ? 'image-outline' : 'videocam-outline';
                
                btn.innerHTML = `
                    <ion-icon name="${icon}" style="font-size: 1.2rem; color: var(--secondary-color);"></ion-icon>
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.85rem;">${asset.name}</div>
                    <ion-icon name="arrow-forward-circle-outline" style="margin-left: auto;"></ion-icon>
                `;

                // Ação de Clique: Enviar para Tela
                btn.onclick = () => {
                    // Feedback visual
                    btn.style.borderColor = "var(--secondary-color)";
                    setTimeout(() => btn.style.borderColor = "transparent", 500);
                    
                    // Atualiza Firebase
                    roomRef.update({
                        liveMedia: {
                            type: asset.type,
                            src: asset.url,
                            timestamp: firebase.firestore.FieldValue.serverTimestamp()
                        }
                    }).then(() => {
                        console.log("Mídia enviada:", asset.name);
                    });
                };

                container.appendChild(btn);
            });

        } catch (error) {
            console.error("Erro carregando assets:", error);
        }
    }

    // =========================================================================
    // 2. INICIALIZAÇÃO WEBRTC (HOST É O CALLER)
    // =========================================================================
    
    async function startHost() {
        pc = new RTCPeerConnection(servers);

        // Mídia Local
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            
            // Botões de Mute (Host)
            setupHostMediaControls();

        } catch (err) {
            console.error("Erro câmera Host:", err);
            alert("Erro ao abrir câmera.");
        }

        // Recebe Mídia Remota
        pc.ontrack = event => {
            if (event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            } else {
                remoteVideo.srcObject = new MediaStream(event.track);
            }
        };

        // Subcoleções
        const offerCandidates = roomRef.collection('offerCandidates');
        const answerCandidates = roomRef.collection('answerCandidates');

        // ICE Candidates Locais (Host)
        pc.onicecandidate = event => {
            if (event.candidate) {
                offerCandidates.add(event.candidate.toJSON());
            }
        };

        // CRIA A OFERTA
        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);

        const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
        };

        // Salva oferta no documento da sessão (cria se não existir)
        await roomRef.set({ offer }, { merge: true });

        // Ouve a resposta (Answer) do Jogador
        roomRef.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                const answerDescription = new RTCSessionDescription(data.answer);
                pc.setRemoteDescription(answerDescription);
            }
            
            // Monitora escolha do jogador (Decisões)
            if (data?.playerChoice) {
                alert(`O jogador escolheu: ${data.playerChoice}`);
                // Reseta a escolha para não alertar de novo
                roomRef.update({ playerChoice: firebase.firestore.FieldValue.delete() });
            }
        });

        // Ouve candidatos ICE remotos (do Jogador)
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
    // 3. CONTROLES DO HOST (FERRAMENTAS)
    // =========================================================================

    // Toggle Sidebar
    document.getElementById('toggle-tools-btn').addEventListener('click', () => {
        document.querySelector('.host-tools-wrapper').classList.toggle('collapsed');
    });

    // Enviar Dica
    document.querySelectorAll('.send-hint-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const hintId = e.target.dataset.hint;
            const hintText = document.querySelector(`textarea[data-hint="${hintId}"]`).value;
            
            if(hintText) {
                await roomRef.set({
                    hints: { [hintId]: hintText }
                }, { merge: true });
                alert(`Dica ${hintId} enviada!`);
            }
        });
    });

    // Enviar Decisão
    document.querySelectorAll('.send-decision-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const decisionId = e.target.dataset.decision;
            // Exemplo estático, idealmente viria do banco de dados do jogo
            const decisionsData = [
                { id: '1', title: 'Escolha o caminho', options: ['Esquerda', 'Direita'] },
                { id: '2', title: 'Abrir a caixa?', options: ['Sim', 'Não'] }
            ];
            
            await roomRef.set({
                liveDecision: decisionId,
                decisions: decisionsData
            }, { merge: true });
            alert('Decisão enviada para a tela do jogador.');
        });
    });

    // Enviar Mídia
    document.querySelectorAll('.send-media-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const mediaId = e.target.dataset.media;
            // Exemplo estático
            const mediaData = {
                '1': { type: 'image', src: 'assets/images/pista1.jpg' },
                '2': { type: 'video', src: 'https://www.w3schools.com/html/mov_bbb.mp4' }, // Exemplo
                '3': { type: 'audio', src: 'assets/audio/scream.mp3' }
            };

            if (mediaData[mediaId]) {
                await roomRef.update({
                    liveMedia: mediaData[mediaId]
                });
                alert('Mídia enviada!');
            }
        });
    });

    // Timer
    document.getElementById('start-timer-btn').addEventListener('click', async () => {
        await roomRef.update({
            startTime: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Cronômetro iniciado!');
    });

    // Encerrar Sessão
    document.getElementById('end-session-btn').addEventListener('click', async () => {
        if(confirm("Encerrar sessão e desconectar todos?")) {
            // Pode deletar a sessão ou marcar como finalizada
            // await roomRef.delete(); 
            window.location.href = 'host-panel.html';
        }
    });

    // Inicia tudo
    startHost();
});