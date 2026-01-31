/* =========================================================================
   HOST ROOM CONTROLLER - PLAYU
   Gerencia WebRTC, Assets de Mídia e Decisões Dinâmicas
   ========================================================================= */

// --- VARIÁVEIS GLOBAIS ---
let roomRef = null;
let localStream = null;
let peerConnection = null; // Modelo 1-para-1 (Expandir para Mesh depois)
const peers = {}; // Futuro suporte Mesh
let myId = "host";

// Configuração WebRTC
const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

// Controle de Assets
let currentPlayingAssetUrl = null;

// Controle de Decisão
let decisionTimerInterval = null;
let decisionTimeLeft = 0;
let currentDecisionId = null;

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Host Panel Iniciado");

    const db = firebase.firestore();
    
    // Elementos DOM
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const micBtn = document.getElementById('host-mic-btn');
    const camBtn = document.getElementById('host-cam-btn');
    const endBtn = document.getElementById('end-call-btn');
    
    // URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId') || urlParams.get('bookingId');

    if (!sessionId) {
        alert("ID da sessão não fornecido.");
        return;
    }

    // Referência da Sala
    roomRef = db.collection('sessions').doc(sessionId);

    // =================================================================
    // 1. INICIALIZAÇÃO
    // =================================================================
    async function init() {
        try {
            // A. Mídia Local
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            if (localVideo) {
                localVideo.srcObject = localStream;
                localVideo.muted = true; // Muta localmente para evitar eco
            }

            // B. Conectar WebRTC (Modelo Simples 1-1 por enquanto)
            setupWebRTC();

            // C. Carregar Assets do Jogo
            loadGameAssets();

            // D. Escutar Decisões Ativas (CORREÇÃO DO ERRO)
            listenToActiveDecision();

            console.log("✅ Sala iniciada com sucesso.");
        } catch (error) {
            console.error("Erro ao iniciar:", error);
            alert("Erro de permissão de câmera/mic ou conexão.");
        }
    }

    // =================================================================
    // 2. WEBRTC (Sinalização Simples)
    // =================================================================
    function setupWebRTC() {
        peerConnection = new RTCPeerConnection(servers);

        // Adiciona trilhas locais
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Ao receber trilha remota
        peerConnection.ontrack = (event) => {
            if (remoteVideo) remoteVideo.srcObject = event.streams[0];
        };

        // Candidatos ICE
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                // Em um cenário real Mesh, isso iria para uma subcoleção 'candidates'
                // Aqui estamos simplificando para o modelo Host-Client direto na sessão
                roomRef.collection('candidates').add(event.candidate.toJSON());
            }
        };

        // Escuta Oferta do Cliente (Cliente liga para Host)
        roomRef.onSnapshot(async snapshot => {
            const data = snapshot.data();
            if (data && data.offer && !peerConnection.currentRemoteDescription) {
                console.log("📩 Oferta recebida!");
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);

                await roomRef.update({ answer: { type: answer.type, sdp: answer.sdp } });
            }
        });
    }

    // =================================================================
    // 3. ASSETS DE MÍDIA (Visual Novo)
    // =================================================================
    async function loadGameAssets() {
        try {
            const doc = await roomRef.get();
            if (doc.exists && doc.data().gameId) {
                const gameDoc = await db.collection('games').doc(doc.data().gameId).get();
                if (gameDoc.exists) {
                    const assets = gameDoc.data().sessionAssets || [];
                    renderAssets(assets);
                    
                    // Renderiza também a lista de Decisões do Jogo
                    if(gameDoc.data().decisions) {
                        renderDecisionsList(gameDoc.data().decisions);
                    }
                }
            }
        } catch (e) { console.error("Erro ao carregar assets:", e); }
    }

    // Função visual atualizada (Card Style)
    function renderAssets(assets) {
        const audioList = document.getElementById('audio-list');
        const videoList = document.getElementById('video-list');
        const imageList = document.getElementById('image-list');

        if(audioList) audioList.innerHTML = '';
        if(videoList) videoList.innerHTML = '';
        if(imageList) imageList.innerHTML = '';

        if (!assets || assets.length === 0) return;

        assets.forEach(asset => {
            const btn = document.createElement('div');
            btn.className = 'asset-btn';
            
            let iconName = 'document-outline';
            let typeLabel = asset.type;
            let targetList = null;
            
            if (asset.type === 'audio') { 
                iconName = 'musical-notes-outline'; typeLabel = 'Áudio / SFX'; targetList = audioList;
            } else if (asset.type === 'video') { 
                iconName = 'videocam-outline'; typeLabel = 'Vídeo / Cena'; targetList = videoList;
            } else if (asset.type === 'image') { 
                iconName = 'image-outline'; typeLabel = 'Imagem / Mapa'; targetList = imageList;
            }

            if (!targetList) return;

            btn.innerHTML = `
                <div class="asset-icon"><ion-icon name="${iconName}"></ion-icon></div>
                <div class="asset-info">
                    <span class="asset-name">${asset.name}</span>
                    <span class="asset-type">${typeLabel}</span>
                </div>
                <div class="play-indicator"><ion-icon name="play-circle"></ion-icon></div>
            `;

            btn.onclick = () => {
                document.querySelectorAll('.asset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                if (asset.type === 'audio') playAudio(asset.url);
                else playVideo(asset.url, asset.type);
            };

            targetList.appendChild(btn);
        });
    }

    async function playVideo(url, type) {
        currentPlayingAssetUrl = url;
        // Atualiza a sala para que todos vejam
        await roomRef.update({
            liveMedia: {
                type: type, // 'video' ou 'image'
                url: url,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }
        });
    }

    async function playAudio(url) {
        // Áudio toca localmente e envia comando
        const audio = new Audio(url);
        audio.play();
        
        await roomRef.update({
            liveMedia: {
                type: 'audio',
                url: url,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }
        });
    }

    // =================================================================
    // 4. SISTEMA DE DECISÕES (Host)
    // =================================================================
    
    // Renderiza a lista de botões de decisão disponíveis
    function renderDecisionsList(decisions) {
        const listContainer = document.getElementById('host-decisions-list');
        if(!listContainer) return;
        
        listContainer.innerHTML = '';
        
        decisions.forEach(dec => {
            const btn = document.createElement('button');
            btn.className = 'secondary-btn';
            btn.style.width = '100%';
            btn.style.marginBottom = '10px';
            btn.style.textAlign = 'left';
            btn.innerHTML = `<ion-icon name="help-circle-outline"></ion-icon> ${dec.question} (${dec.time}s)`;
            
            btn.onclick = () => startDecision(dec);
            listContainer.appendChild(btn);
        });
    }

    // Inicia uma nova rodada de decisão
    async function startDecision(decisionData) {
        if(decisionTimerInterval) clearInterval(decisionTimerInterval);
        
        const duration = parseInt(decisionData.time) || 30;
        decisionTimeLeft = duration;
        currentDecisionId = `dec_${Date.now()}`;

        // Limpa votos antigos
        // (Em produção, ideal seria usar subcoleção nova por ID, mas aqui limpamos global)
        const oldVotes = await roomRef.collection('decision_votes').get();
        const batch = db.batch();
        oldVotes.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        // Envia para a sala
        await roomRef.update({ 
            activeDecision: {
                id: currentDecisionId,
                question: decisionData.question,
                options: decisionData.options,
                endTime: Date.now() + (duration * 1000),
                status: 'active',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }
        });

        // Inicia monitoramento local
        monitorDecision(decisionData);
    }

    // Monitora o tempo e os votos
    function monitorDecision(decisionData) {
        const feedbackEl = document.getElementById('host-decision-feedback');
        if(feedbackEl) {
            feedbackEl.classList.remove('hidden');
            feedbackEl.innerHTML = `
                <div style="background:#222; padding:10px; border:1px solid var(--primary-color); border-radius:8px; text-align:center;">
                    <h4 style="color:#fff; margin:0;">Votação em Andamento</h4>
                    <div style="font-size:2rem; font-weight:bold; color:var(--primary-color);" id="host-timer-display">${decisionTimeLeft}s</div>
                    <p style="color:#aaa; font-size:0.9rem;">${decisionData.question}</p>
                    <button onclick="finishDecisionManually()" class="danger-btn small-btn" style="margin-top:5px;">Encerrar Agora</button>
                </div>
            `;
        }

        decisionTimerInterval = setInterval(() => {
            decisionTimeLeft--;
            const timerDisplay = document.getElementById('host-timer-display');
            if(timerDisplay) timerDisplay.innerText = `${decisionTimeLeft}s`;

            if (decisionTimeLeft <= 0) {
                finishDecision(decisionData);
            }
        }, 1000);
        
        // Torna a função global para o botão funcionar
        window.finishDecisionManually = () => finishDecision(decisionData);
    }

    // Encerra e calcula o resultado
    async function finishDecision(decisionData) {
        if(decisionTimerInterval) clearInterval(decisionTimerInterval);
        
        // Coleta votos
        const votesSnap = await roomRef.collection('decision_votes')
            .where('decisionId', '==', currentDecisionId)
            .get();

        const counts = {};
        decisionData.options.forEach(opt => counts[opt] = 0);

        votesSnap.forEach(doc => {
            const vote = doc.data().option;
            if (counts[vote] !== undefined) counts[vote]++;
        });

        // Vencedor
        let winner = "Empate";
        let maxVotes = -1;
        Object.entries(counts).forEach(([opt, count]) => {
            if (count > maxVotes) { maxVotes = count; winner = opt; }
            else if (count === maxVotes) { winner = "Empate"; }
        });

        // Atualiza sala com resultado
        await roomRef.update({
            activeDecision: {
                ...decisionData,
                status: 'finished',
                winner: winner,
                votes: counts
            }
        });

        // Limpa UI Host
        const feedbackEl = document.getElementById('host-decision-feedback');
        if(feedbackEl) feedbackEl.classList.add('hidden');

        // Feedback de Áudio (TTS)
        if ('speechSynthesis' in window) {
            const msg = new SpeechSynthesisUtterance(winner === "Empate" ? "Empate na votação." : `A opção vencedora foi: ${winner}`);
            msg.lang = 'pt-BR';
            window.speechSynthesis.speak(msg);
        }
    }

    // =================================================================
    // 5. ESCUTA DE ESTADO (A função que faltava!)
    // =================================================================
    function listenToActiveDecision() {
        // Esta função é mais útil no lado do CLIENTE (sala.js), mas no HOST
        // podemos usá-la para garantir sincronia se a internet cair e voltar.
        // Por enquanto, deixamos vazia ou apenas logs, pois o Host CONTROLA a decisão.
        console.log("👂 Host monitorando estado da decisão...");
        
        roomRef.onSnapshot(doc => {
            const data = doc.data();
            // Se necessário, atualize a UI do Host baseada no banco
        });
    }

    // =================================================================
    // CONTROLES DE HARDWARE
    // =================================================================
    if(micBtn) micBtn.onclick = () => {
        const track = localStream.getAudioTracks()[0];
        track.enabled = !track.enabled;
        micBtn.classList.toggle('active', !track.enabled); // Active = Muted (vermelho)
        micBtn.innerHTML = track.enabled ? '<ion-icon name="mic-outline"></ion-icon>' : '<ion-icon name="mic-off-outline"></ion-icon>';
    };

    if(camBtn) camBtn.onclick = () => {
        const track = localStream.getVideoTracks()[0];
        track.enabled = !track.enabled;
        camBtn.classList.toggle('active', !track.enabled);
        camBtn.innerHTML = track.enabled ? '<ion-icon name="videocam-outline"></ion-icon>' : '<ion-icon name="videocam-off-outline"></ion-icon>';
    };

    if(endBtn) endBtn.onclick = () => {
        if(confirm("Encerrar sessão para todos?")) {
            // Limpa sala e redireciona
            roomRef.delete();
            window.location.href = 'dashboard.html';
        }
    };

    // Inicia tudo
    init();
});