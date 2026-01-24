document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Iniciando Sala Host...");

if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
    // Garante que auth e db estão disponíveis globalmente
    if (!window.auth) window.auth = firebase.auth();
    if (!window.db) window.db = firebase.firestore();
    if (!window.storage) window.storage = firebase.storage();
} else {
    console.warn("AVISO: Firebase não inicializado. Verifique se firebase-config.js foi importado antes do main.js");
}

    const db = firebase.firestore();
    
    // --- REFERÊNCIAS DOM ---
    const localVideo = document.getElementById('host-local-video');
    const remoteVideo = document.getElementById('host-remote-video');
    const loadingOverlay = document.getElementById('loading-overlay');
    const assetsList = document.getElementById('host-assets-list');

    if (!localVideo || !remoteVideo) {
        alert("Erro fatal: Elementos de vídeo não encontrados.");
        return;
    }

    // --- VARIÁVEIS ---
    const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };
    let localStream = null;
    let pc = null;
    let roomRef = null;
    
    // URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('bookingId');
    const isTestMode = urlParams.get('mode') === 'test';

    // Auth Check
    const sessionData = sessionStorage.getItem('loggedInUser');
    const loggedInUser = sessionData ? JSON.parse(sessionData) : null;

    if (!loggedInUser && !isTestMode) {
        alert("Faça login novamente.");
        window.location.href = 'login.html';
        return;
    }

    if (!bookingId) {
        alert("ID da sessão inválido.");
        window.location.href = 'admin.html';
        return;
    }

    // =========================================================================
    // INICIALIZAÇÃO
    // =========================================================================
    async function initSession() {
        try {
            console.log("🔍 Buscando sessão:", bookingId);
            
            // 1. Referência da Sala
            roomRef = db.collection('sessions').doc(bookingId);
            const sessionDoc = await roomRef.get();
            
            if (!sessionDoc.exists) {
                console.log("📝 Criando nova sala de sessão...");
                await roomRef.set({ created: firebase.firestore.FieldValue.serverTimestamp(), hostStatus: 'online' });
            }

            // 2. Carregar Assets do Jogo
            // Precisamos saber qual Jogo é para buscar as imagens
            const bookingDoc = await db.collection('bookings').doc(bookingId).get();
            if (bookingDoc.exists) {
                const data = bookingDoc.data();
                console.log("🎮 Jogo da sessão:", data.gameName, "(ID:", data.gameId, ")");
                if (data.gameId) {
                    loadGameAssets(data.gameId);
                }
            } else {
                console.warn("⚠️ Agendamento não encontrado no banco.");
            }

            // 3. Iniciar Câmera
            console.log("📷 Solicitando câmera...");
            await startHost();

            // 4. Remover Loading
            if (loadingOverlay) {
                loadingOverlay.style.opacity = '0';
                setTimeout(() => loadingOverlay.style.display = 'none', 500);
            }

        } catch (error) {
            console.error("❌ ERRO FATAL:", error);
            alert("Erro ao conectar: " + error.message);
        }
    }

    // =========================================================================
    // FUNÇÕES DE ASSETS (MÍDIA)
    // =========================================================================
    async function loadGameAssets(gameId) {
        if (!assetsList) return;
        assetsList.innerHTML = '<div class="loader"></div>';

        try {
            const doc = await db.collection('games').doc(gameId).get();
            if (!doc.exists) {
                assetsList.innerHTML = '<p style="padding:10px; color:#aaa;">Jogo não encontrado.</p>';
                return;
            }

            const assets = doc.data().sessionAssets || [];
            assetsList.innerHTML = ''; // Limpa loader

            if (assets.length === 0) {
                assetsList.innerHTML = '<p style="padding:10px; color:#aaa;">Nenhuma mídia cadastrada.</p>';
                return;
            }

            assets.forEach(asset => {
                const btn = document.createElement('div');
                btn.className = 'asset-btn';
                // Estilo Inline para garantir
                btn.style.cssText = `
                    display: flex; align-items: center; gap: 10px;
                    background: rgba(255,255,255,0.05); padding: 10px;
                    border-radius: 6px; cursor: pointer; margin-bottom: 5px;
                    border: 1px solid transparent; transition: 0.2s;
                `;
                
                let icon = 'document-outline';
                if(asset.type === 'image') icon = 'image-outline';
                if(asset.type === 'video') icon = 'videocam-outline';
                if(asset.type === 'audio') icon = 'musical-notes-outline';

                btn.innerHTML = `
                    <ion-icon name="${icon}" style="font-size:1.2rem; color:#00ff88;"></ion-icon>
                    <div style="flex:1; overflow:hidden;">
                        <div style="font-size:0.9rem; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${asset.name}</div>
                    </div>
                    <ion-icon name="send-outline"></ion-icon>
                `;

                btn.onclick = () => sendMediaToPlayer(asset, btn);
                assetsList.appendChild(btn);
            });

        } catch (e) {
            console.error("Erro assets:", e);
            assetsList.innerHTML = '<p style="color:red;">Erro ao carregar.</p>';
        }
    }

    async function sendMediaToPlayer(asset, btnElement) {
        // Feedback Visual
        btnElement.style.background = 'rgba(233, 69, 96, 0.2)';
        btnElement.style.borderColor = 'var(--secondary-color)';
        
        try {
            await roomRef.update({
                liveMedia: {
                    type: asset.type,
                    url: asset.url,
                    name: asset.name,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }
            });
            console.log("Mídia enviada:", asset.name);
            
            // Remove destaque após 500ms
            setTimeout(() => {
                btnElement.style.background = 'rgba(255,255,255,0.05)';
                btnElement.style.borderColor = 'transparent';
            }, 500);
        } catch (e) {
            console.error("Erro ao enviar mídia:", e);
            alert("Erro ao enviar mídia.");
        }
    }

    // =========================================================================
    // FUNÇÕES DE VÍDEO (WEBRTC)
    // =========================================================================
    async function startHost() {
        pc = new RTCPeerConnection(servers);

        // 1. Get User Media
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream; // Mostra vídeo local
            
            // Adiciona tracks ao PC
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            
            // Ativa Botões Mute/Cam
            setupMediaButtons();

        } catch (err) {
            console.error("Erro GERAL de Câmera:", err);
            // Se der erro, tenta só vídeo ou só áudio antes de desistir
            alert("Não foi possível acessar a câmera/microfone. Verifique as permissões do navegador (ícone de cadeado na URL).");
            throw err;
        }

        // 2. Setup Remote
        pc.ontrack = event => {
            console.log("📡 Recebendo stream remoto...");
            if (event.streams && event.streams[0]) {
                remoteVideo.srcObject = event.streams[0];
            } else {
                remoteVideo.srcObject = new MediaStream([event.track]);
            }
        };

        // 3. ICE Handling
        const offerCandidates = roomRef.collection('offerCandidates');
        const answerCandidates = roomRef.collection('answerCandidates');

        pc.onicecandidate = event => {
            if (event.candidate) offerCandidates.add(event.candidate.toJSON());
        };

        // 4. Create Offer
        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);
        
        const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
        };
        await roomRef.set({ offer }, { merge: true });

        // 5. Listen for Answer
        roomRef.onSnapshot(snapshot => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                const answerDescription = new RTCSessionDescription(data.answer);
                pc.setRemoteDescription(answerDescription);
            }
        });

        // 6. Listen for Remote ICE
        answerCandidates.onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate);
                }
            });
        });
    }

    function setupMediaButtons() {
        const micBtn = document.getElementById('host-mic-btn');
        const camBtn = document.getElementById('host-cam-btn');
        const endBtn = document.getElementById('end-call-btn');

        if(micBtn) micBtn.onclick = () => {
            const track = localStream.getAudioTracks()[0];
            if(track) {
                track.enabled = !track.enabled;
                micBtn.classList.toggle('active', !track.enabled);
                micBtn.innerHTML = track.enabled ? '<ion-icon name="mic-outline"></ion-icon>' : '<ion-icon name="mic-off-outline"></ion-icon>';
            }
        };

        if(camBtn) camBtn.onclick = () => {
            const track = localStream.getVideoTracks()[0];
            if(track) {
                track.enabled = !track.enabled;
                camBtn.classList.toggle('active', !track.enabled);
                camBtn.innerHTML = track.enabled ? '<ion-icon name="videocam-outline"></ion-icon>' : '<ion-icon name="videocam-off-outline"></ion-icon>';
            }
        };
        
        if(endBtn) endBtn.onclick = () => {
            if(confirm("Encerrar sessão?")) {
                window.location.href = 'admin.html';
            }
        };
    }

    // START
    initSession();
});