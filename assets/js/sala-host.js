/* =========================================================================
   SALA HOST JS - VERSÃO DE DEPURAÇÃO E CORREÇÃO
   ========================================================================= */

// --- VARIÁVEIS GLOBAIS ---
let roomRef = null;
let localStream = null;
let peerConnection = null;
let currentTimer = 0;
let timerInterval = null;
const db = firebase.firestore(); // Assume que firebase já carregou no HTML

// Controle de Mídia
let currentAudioObj = null;
let currentPlayingUrl = null;

let originalGameDuration = 3600;
let volumes = {};

// Configuração WebRTC
const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Host Panel Inicializado - Iniciando...");

    // 1. Configura UI (Botões)
    setupUIControls();

    // 2. Inicia Lógica (Com tratamento de erro robusto)
    initGameLogic().catch(err => {
        console.error("❌ Erro fatal na inicialização:", err);
        alert("Erro crítico: " + err.message);
    });
});

// =================================================================
// 1. UI E BOTÕES
// =================================================================
function setupUIControls() {
    // Botão Sair
    const endBtn = document.getElementById('end-call-btn');
    if (endBtn) endBtn.onclick = () => {
        if (confirm("Sair da sala?")) window.location.href = 'dashboard.html';
    };

    // Botão Mic
    const micBtn = document.getElementById('host-mic-btn');
    if (micBtn) micBtn.onclick = () => toggleLocalTrack('audio', micBtn);

    // Botão Cam
    // C. Câmera (Atualizado com lógica do GIF)
    const camBtn = document.getElementById('host-cam-btn');
    if (camBtn) {
        camBtn.onclick = () => {
            if (!localStream) return alert("Câmera não iniciada.");

            const videoTrack = localStream.getVideoTracks()[0];
            const videoEl = document.getElementById('host-local-video');

            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;

                // Lógica Visual (Botão e GIF)
                if (videoTrack.enabled) {
                    // CÂMERA LIGADA
                    camBtn.classList.remove('danger');
                    camBtn.innerHTML = '<ion-icon name="videocam-outline"></ion-icon>';
                    camBtn.style.background = '#333';
                    
                    // Mostra o vídeo (esconde o GIF)
                    if(videoEl) videoEl.classList.remove('camera-off');
                } else {
                    // CÂMERA DESLIGADA
                    camBtn.classList.add('danger');
                    camBtn.innerHTML = '<ion-icon name="videocam-off-outline"></ion-icon>';
                    camBtn.style.background = '#ff4444';
                    
                    // Oculta o vídeo (revela o GIF)
                    if(videoEl) videoEl.classList.add('camera-off');
                }
            }
        };
    }

    // Timer
    const btnStart = document.getElementById('timer-start-btn');
    const btnPause = document.getElementById('timer-pause-btn');
    const btnReset = document.getElementById('timer-reset-btn');

    if(btnStart) btnStart.onclick = startTimer;
    if(btnPause) btnPause.onclick = pauseTimer;
    if(btnReset) btnReset.onclick = resetTimer;
}

function toggleLocalTrack(kind, btn) {
    if (!localStream) return alert(`Mídia (${kind}) não iniciada.`);
    
    const tracks = kind === 'audio' ? localStream.getAudioTracks() : localStream.getVideoTracks();
    if (tracks.length === 0) return alert(`Nenhum dispositivo de ${kind} encontrado.`);

    const track = tracks[0];
    track.enabled = !track.enabled;

    // Atualiza Visual
    const iconName = kind === 'audio' ? 'mic' : 'videocam';
    if (track.enabled) {
        btn.style.background = '#333';
        btn.innerHTML = `<ion-icon name="${iconName}-outline"></ion-icon>`;
    } else {
        btn.style.background = '#ff4444';
        btn.innerHTML = `<ion-icon name="${iconName}-off-outline"></ion-icon>`;
    }
}

// =================================================================
// 2. LÓGICA DE DADOS (AQUI ESTAVA O PROBLEMA)
// =================================================================
async function initGameLogic() {
    // A. Pegar ID
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId') || urlParams.get('bookingId');

    if (!sessionId) {
        document.getElementById('loading-overlay')?.classList.add('hidden');
        throw new Error("ID da sessão não encontrado na URL.");
    }

    roomRef = db.collection('sessions').doc(sessionId);
    console.log("🔗 Conectando à sessão:", sessionId);

    try {
        // B. Mídia Local
        await setupLocalMedia();

        // C. Carregar Dados do Banco
        await loadSessionData();

        // D. WebRTC
        setupWebRTC();

    } catch (e) {
        console.error("Erro interno:", e);
        throw e; // Repassa erro para o catch principal
    } finally {
        // SEMPRE esconde o loading, mesmo com erro, para ver o console
        document.getElementById('loading-overlay')?.classList.add('hidden');
    }
}

async function setupLocalMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const localVideo = document.getElementById('host-local-video');
        if (localVideo) {
            localVideo.srcObject = localStream;
            localVideo.muted = true;
        }
    } catch (e) {
        console.warn("⚠️ Sem permissão de mídia:", e);
    }
}

async function loadSessionData() {
    console.log("🔄 Carregando dados da sessão...");

    // 1. Buscar Sessão
    const sessionSnap = await roomRef.get();
    if (!sessionSnap.exists) throw new Error("Documento da sessão não existe.");
    const sessionData = sessionSnap.data();

    // Link de convite
    const inviteInput = document.getElementById('floating-invite-link');
    if(inviteInput) inviteInput.value = `${window.location.origin}/sala.html?sessionId=${roomRef.id}`;

    // 2. Buscar Jogo
    if (sessionData.gameId) {
        const gameSnap = await db.collection('games').doc(sessionData.gameId).get();
        if (gameSnap.exists) {
            const gameData = gameSnap.data();
            
            renderAssets(gameData.sessionAssets || []);
            renderDecisions(gameData.decisions || []);
            
            // SALVA A DURAÇÃO ORIGINAL NA VARIÁVEL GLOBAL
            if(gameData.sessionDuration) {
                originalGameDuration = parseInt(gameData.sessionDuration) * 60;
            }
        }
    }

    // 3. Define o Timer Atual
    if (sessionData.timerCurrent !== undefined && sessionData.timerCurrent !== null) {
        currentTimer = parseInt(sessionData.timerCurrent);
        
        // Correção para timer zerado incorretamente
        if (currentTimer === 0 && sessionData.status !== 'finished') {
            currentTimer = originalGameDuration;
            roomRef.update({ timerCurrent: currentTimer });
        }
    } else {
        currentTimer = originalGameDuration;
        roomRef.update({ timerCurrent: currentTimer });
    }

    updateTimerDisplay(currentTimer);
}

// =================================================================
// 3. RENDERIZAÇÃO (ASSETS & DECISÕES)
// =================================================================
function renderAssets(assets) {
    const audioList = document.getElementById('host-audio-list');
    const videoList = document.getElementById('host-video-list');
    
    if (audioList) audioList.innerHTML = '';
    if (videoList) videoList.innerHTML = '';

    if (!assets || assets.length === 0) return;

    assets.forEach(asset => {
        // Define volume padrão como 100% se não existir
        if (!volumes[asset.url]) volumes[asset.url] = 1.0;

        const card = document.createElement('div');
        card.className = 'media-card';
        
        // Ícones
        let iconName = asset.type === 'audio' ? 'musical-notes' : 'videocam';
        if (asset.type === 'image') iconName = 'image';

        card.innerHTML = `
            <div class="media-header" onclick="triggerMedia('${asset.url}')">
                <div class="media-info">
                    <ion-icon name="${iconName}" style="color:#888;"></ion-icon>
                    <span>${asset.name}</span>
                </div>
                <div class="play-indicator" id="ind-${btoa(asset.url)}">
                    <ion-icon name="play-circle-outline" style="font-size:1.4rem; color:var(--primary-color);"></ion-icon>
                </div>
            </div>
            
            <div class="volume-control">
                <ion-icon name="volume-medium-outline" style="color:#666; font-size:0.8rem;"></ion-icon>
                <input type="range" min="0" max="1" step="0.1" value="${volumes[asset.url]}" class="volume-slider" 
                       oninput="adjustVolume('${asset.url}', this.value)" 
                       onclick="event.stopPropagation()"> </div>
        `;

        // Coloca na lista correta
        if (asset.type === 'audio') {
            if (audioList) audioList.appendChild(card);
        } else {
            if (videoList) videoList.appendChild(card);
        }
        
        // Salva referência do objeto asset no elemento DOM para uso posterior
        card.dataset.assetObj = JSON.stringify(asset);
    });
}


function renderDecisions(decisions) {
    const list = document.getElementById('host-decisions-list');
    
    if (!list) {
        console.error("❌ ERRO HTML: Não encontrei <div id='host-decisions-list'>.");
        return;
    }

    list.innerHTML = '';

    if (!Array.isArray(decisions) || decisions.length === 0) {
        list.innerHTML = '<p style="color:#666; text-align:center; padding:10px;">Sem decisões.</p>';
        return;
    }

    decisions.forEach(dec => {
        const btn = document.createElement('button');
        btn.className = 'secondary-btn';
        btn.style.cssText = "width:100%; text-align:left; margin-bottom:8px; background:#333; padding:10px; border:1px solid #444; color:#fff; display:flex; gap:10px; align-items:center;";
        
        btn.innerHTML = `<ion-icon name="help-circle-outline"></ion-icon> ${dec.question}`;
        
        btn.onclick = () => sendDecision(dec);
        list.appendChild(btn);
    });
}

// =================================================================
// 4. FUNÇÕES AUXILIARES (PLAY, TIMER, ETC)
// =================================================================

window.adjustVolume = (url, val) => {
    volumes[url] = parseFloat(val);
    
    // Se este asset estiver tocando agora, ajusta em tempo real
    if (currentPlayingUrl === url) {
        if (currentAudioObj) currentAudioObj.volume = volumes[url];
        
        // Se for vídeo tocando na tela
        const videoEl = document.querySelector('#host-video-layer video');
        if (videoEl) videoEl.volume = volumes[url];
    }
};

// --- Mídia ---
async function toggleMedia(asset) {
    if (currentPlayingUrl === asset.url) {
        await stopMedia();
        updateVisuals(asset.url, 'stop');
    } else {
        if (currentPlayingUrl) await stopMedia(); // Para o anterior
        
        currentPlayingUrl = asset.url;
        updateVisuals(asset.url, 'play');
        playMedia(asset);
    }
}

function updateVisuals(activeUrl, state) {
    // Reseta todos
    document.querySelectorAll('.play-indicator ion-icon').forEach(i => i.setAttribute('name', 'play-circle-outline'));
    
    // Ativa o atual
    if (state === 'play') {
        const id = `ind-${btoa(activeUrl)}`;
        const el = document.getElementById(id);
        if (el) el.querySelector('ion-icon').setAttribute('name', 'stop-circle-outline');
    }
}


function updateIcon(btn, state) {
    const icon = btn.querySelector('.play-indicator ion-icon');
    if (icon) icon.setAttribute('name', state === 'stop' ? 'stop-circle-outline' : 'play-circle-outline');
}

async function playMedia(asset) {
    console.log("▶️ Reproduzindo em Loop:", asset.name, "Vol:", volumes[asset.url]);

    // 1. ÁUDIO (Com Loop Infinito)
    if (asset.type === 'audio') {
        currentAudioObj = new Audio(asset.url);
        currentAudioObj.loop = true; // <--- ATIVADO O LOOP
        currentAudioObj.volume = volumes[asset.url] || 1.0;
        
        currentAudioObj.play().catch(e => console.error("Erro ao tocar áudio:", e));
    }
    
    // 2. VÍDEO / IMAGEM (Com Loop Infinito)
    if (asset.type === 'video' || asset.type === 'image') {
        const layer = document.getElementById('host-video-layer');
        if (layer) {
            layer.innerHTML = ''; // Limpa anterior
            
            if (asset.type === 'video') {
                const vid = document.createElement('video');
                vid.src = asset.url;
                vid.autoplay = true;
                
                vid.loop = true; // <--- VÍDEOS TAMBÉM EM LOOP (Ideal para cenários)
                
                vid.volume = volumes[asset.url] || 1.0;
                vid.removeAttribute('controls'); // Sem barra de progresso
                
                layer.appendChild(vid);
            } 
            else if (asset.type === 'image') {
                const img = document.createElement('img');
                img.src = asset.url;
                layer.appendChild(img);
            }
        }
    }

    // 3. Envia para o Firebase (para os jogadores verem/ouvirem)
    if (roomRef) {
        await roomRef.update({ 
            liveMedia: { 
                ...asset, 
                loop: true, // Avisa o jogador que é loop (opcional, para uso futuro)
                timestamp: Date.now() 
            } 
        });
    }
}

async function stopMedia(skipDb = false) {
    // Para Áudio
    if (currentAudioObj) {
        currentAudioObj.pause();
        currentAudioObj = null;
    }

    // Para Vídeo (Limpa a camada)
    const layer = document.getElementById('host-video-layer');
    if (layer) layer.innerHTML = '';

    currentPlayingUrl = null;
    updateVisuals(null, 'reset'); // Reseta ícones

    if (roomRef && !skipDb) await roomRef.update({ liveMedia: null });
}
// Tornar global para o botão "X" do HTML funcionar
window.stopMedia = stopMedia;

// --- Timer ---
function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if(roomRef) roomRef.update({ timerStatus: 'running' });
    
    timerInterval = setInterval(() => {
        if (currentTimer > 0) {
            currentTimer--;
            updateTimerDisplay(currentTimer);
            if (currentTimer % 5 === 0 && roomRef) roomRef.update({ timerCurrent: currentTimer });
        } else clearInterval(timerInterval);
    }, 1000);
}

function pauseTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if(roomRef) roomRef.update({ timerStatus: 'paused' });
}

// FUNÇÕES DE CONTROLE DO TIMER

function resetTimer() {
    // 1. Para o contador local imediatamente
    if (timerInterval) clearInterval(timerInterval);
    
    // 2. Reseta para o valor original salvo
    // (Se originalGameDuration não estiver definido, usa 3600 como fallback)
    currentTimer = (typeof originalGameDuration !== 'undefined') ? originalGameDuration : 3600;
    
    // 3. Atualiza Display
    updateTimerDisplay(currentTimer);
    
    // 4. Atualiza Firebase (Pausa e reseta o tempo)
    if(roomRef) {
        roomRef.update({ 
            timerCurrent: currentTimer,
            timerStatus: 'paused' 
        });
    }
    console.log("🔄 Timer resetado automaticamente para:", currentTimer);
}

// TORNAR GLOBAL para o HTML poder chamar (onclick="window.adjustTimer(...)")
window.adjustTimer = (minutes) => {
    // Adiciona ou remove minutos (convertendo para segundos)
    const secondsToAdd = minutes * 60;
    currentTimer += secondsToAdd;

    // Impede tempo negativo
    if (currentTimer < 0) currentTimer = 0;

    // Atualiza Display
    updateTimerDisplay(currentTimer);

    // Envia novo tempo para o Firebase imediatamente
    if (roomRef) {
        roomRef.update({ timerCurrent: currentTimer });
    }
    
    console.log(`⏱️ Ajuste rápido: ${minutes}m. Novo tempo: ${currentTimer}s`);
};

function updateTimerDisplay(seconds) {
    const el = document.getElementById('session-timer');
    if (el) {
        const min = Math.floor(seconds / 60);
        const sec = seconds % 60;
        el.innerText = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }
}

// --- Decisões ---
async function sendDecision(decision) {
    // 1. Feedback Visual Imediato no Painel do Host
    const fb = document.getElementById('host-decision-feedback');
    if(fb) {
        fb.classList.remove('hidden');
        const qEl = document.getElementById('feedback-question');
        const tEl = document.getElementById('feedback-timer');
        
        if(qEl) qEl.innerText = decision.question;
        if(tEl) tEl.innerText = (decision.time || 30) + 's';
    }

    console.log("🚀 Enviando decisão:", decision.question);

    // 2. Envio para o Firebase (Jogadores recebem na hora)
    if(roomRef) {
        try {
            // Opcional: Limpar votos anteriores para evitar conflitos
            // await clearVotes(); 

            await roomRef.update({
                activeDecision: {
                    ...decision,
                    id: Date.now().toString(), // ID único para essa rodada
                    endTime: Date.now() + ((decision.time || 30) * 1000),
                    status: 'active',
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }
            });
        } catch (error) {
            console.error("Erro ao enviar decisão:", error);
            alert("Erro ao enviar decisão. Verifique o console.");
        }
    }
}

window.clearPlayerDecision = async () => {
    document.getElementById('host-decision-feedback')?.classList.add('hidden');
    if(roomRef) await roomRef.update({ activeDecision: null });
};

// --- WebRTC ---
function setupWebRTC() {
    peerConnection = new RTCPeerConnection(servers);
    if (localStream) localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    
    roomRef.onSnapshot(async snapshot => {
        const data = snapshot.data();
        if (data?.offer && !peerConnection.currentRemoteDescription) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            roomRef.update({ answer: { type: answer.type, sdp: answer.sdp } });
        }
    });
}