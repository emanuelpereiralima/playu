/* =========================================================================
   SALA HOST JS - TOTALMENTE ENCAPSULADO E PROTEGIDO
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 Host Panel Inicializado - Iniciando...");

    // =================================================================
    // 1. CONFIGURAÇÃO E VARIÁVEIS PROTEGIDAS
    // =================================================================
    if (typeof firebase === 'undefined') {
        alert("ERRO CRÍTICO: Firebase não foi carregado no HTML.");
        return;
    }

    const db = window.db || firebase.firestore();
    const auth = window.auth || firebase.auth();

    let roomRef = null;
    let localStream = null;
    let peerConnection = null;
    let currentTimer = 0;
    let timerInterval = null;

    let currentAudioObj = null;
    let currentPlayingUrl = null;
    let originalGameDuration = 3600;

    const servers = {
        iceServers: [ { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] } ]
    };

    // =================================================================
    // 2. INICIALIZAÇÃO
    // =================================================================
    setupUIControls();

    initGameLogic().catch(err => {
        console.error("❌ Erro fatal na inicialização:", err);
        alert("Erro ao carregar a sala: " + err.message);
    });

    async function initGameLogic() {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('sessionId') || urlParams.get('bookingId');

        if (!sessionId) {
            document.getElementById('loading-overlay')?.classList.add('hidden');
            throw new Error("ID da sessão não encontrado na URL.");
        }

        console.log("🔗 Procurando sessão ID:", sessionId);

        // Tenta achar na coleção 'sessions'
        roomRef = db.collection('sessions').doc(sessionId);
        let checkDoc = await roomRef.get();
        
        // Se não achar, tenta na coleção 'bookings' (retrocompatibilidade)
        if (!checkDoc.exists) {
            console.log("⚠️ Sessão não encontrada em 'sessions', buscando em 'bookings'...");
            roomRef = db.collection('bookings').doc(sessionId);
            checkDoc = await roomRef.get();
        }

        if (!checkDoc.exists) {
            throw new Error("Sessão ou Agendamento não existe no banco de dados.");
        }

        console.log("✅ Sessão encontrada!");

        try {
            await setupLocalMedia();
            await loadSessionData();
            setupWebRTC();
        } catch (e) {
            console.error("❌ Erro durante o carregamento dos dados:", e);
        } finally {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.classList.add('hidden');
        }
    }

    // =================================================================
    // 3. CARREGAMENTO DE DADOS DO FIREBASE
    // =================================================================
    async function loadSessionData() {
        console.log("🔄 Carregando dados da sessão e do jogo...");

        const sessionSnap = await roomRef.get();
        const sessionData = sessionSnap.data();
        
        console.log("📄 Dados da Sessão:", sessionData);

        const inviteInput = document.getElementById('floating-invite-link');
        if(inviteInput) inviteInput.value = `${window.location.origin}/sala.html?sessionId=${roomRef.id}`;

        // BUSCAR DADOS DO JOGO (Mídias, Decisões, Timer)
        if (sessionData.gameId) {
            console.log("🎮 Buscando jogo ID:", sessionData.gameId);
            const gameSnap = await db.collection('games').doc(sessionData.gameId).get();
            
            if (gameSnap.exists) {
                const gameData = gameSnap.data();
                console.log("📦 Dados do Jogo recebidos:", gameData);
                
                // Renderiza Mídias
                if (gameData.sessionAssets) {
                    console.log(`Encontradas ${gameData.sessionAssets.length} mídias.`);
                    renderAssets(gameData.sessionAssets);
                } else {
                    console.warn("Nenhuma mídia (sessionAssets) salva neste jogo.");
                    renderAssets([]); // Força mostrar mensagem de vazio
                }
                
                // Renderiza Decisões
                if (gameData.decisions) {
                    console.log(`Encontradas ${gameData.decisions.length} decisões.`);
                    renderDecisions(gameData.decisions);
                } else {
                    console.warn("Nenhuma decisão salva neste jogo.");
                    renderDecisions([]);
                }
                
                // Configura Timer
                if(gameData.sessionDuration) {
                    originalGameDuration = parseInt(gameData.sessionDuration) * 60;
                }
            } else {
                console.error("❌ O Jogo associado a esta sessão foi excluído ou não existe.");
            }
        } else {
            console.warn("⚠️ Esta sessão não tem um 'gameId' atrelado.");
        }

        // Define o Timer Atual
        if (sessionData.timerCurrent !== undefined && sessionData.timerCurrent !== null) {
            currentTimer = parseInt(sessionData.timerCurrent);
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
    // 4. RENDERIZAÇÃO NA TELA
    // =================================================================
    function renderAssets(assets) {
        const audioList = document.getElementById('host-audio-list');
        const videoList = document.getElementById('host-video-list');
        const generalList = document.getElementById('media-assets-list'); 

        if (audioList) audioList.innerHTML = '';
        if (videoList) videoList.innerHTML = '';
        if (generalList) generalList.innerHTML = '';

        if (!assets || assets.length === 0) {
            const emptyHtml = '<p style="color:#666; font-size:0.85rem; padding:10px; text-align:center;">Nenhuma mídia cadastrada.</p>';
            if(generalList) generalList.innerHTML = emptyHtml;
            if(audioList) audioList.innerHTML = emptyHtml;
            if(videoList) videoList.innerHTML = emptyHtml;
            return;
        }

        assets.forEach((asset, index) => {
            const card = document.createElement('div');
            card.className = 'media-card';
            card.style.cssText = "background:#222; padding:12px; margin-bottom:8px; border-radius:6px; border:1px solid #333; transition:0.2s;";
            
            let iconName = asset.type === 'audio' ? 'musical-notes' : 'videocam';
            if (asset.type === 'image') iconName = 'image';

            const safeId = "ind-" + index;

            // HTML DO CARD (AGORA SEM O SLIDER INDIVIDUAL)
            card.innerHTML = `
                <div class="media-header" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
                    <div class="media-info" style="display:flex; align-items:center; gap:10px; overflow:hidden;">
                        <ion-icon name="${iconName}" style="color:var(--secondary-color); font-size:1.3rem; min-width:20px;"></ion-icon>
                        <span style="font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${asset.name}</span>
                    </div>
                    <div class="play-indicator" id="${safeId}" style="min-width:30px; text-align:right;">
                        <ion-icon name="play-circle-outline" style="font-size:1.8rem; color:#00ff88; transition:0.2s;"></ion-icon>
                    </div>
                </div>
            `;

            // Clique para tocar a mídia
            card.addEventListener('click', () => toggleMedia(asset, safeId));

            if (generalList) {
                generalList.appendChild(card);
            } else {
                if (asset.type === 'audio' && audioList) audioList.appendChild(card);
                else if (videoList) videoList.appendChild(card);
            }
        });
    }

    function renderDecisions(decisions) {
        const list = document.getElementById('host-decisions-list');
        if (!list) return;

        list.innerHTML = '';

        if (!Array.isArray(decisions) || decisions.length === 0) {
            list.innerHTML = '<p style="color:#666; text-align:center; padding:10px;">Sem decisões salvas.</p>';
            return;
        }

        decisions.forEach(dec => {
            const btn = document.createElement('button');
            btn.className = 'secondary-btn';
            btn.style.cssText = "width:100%; text-align:left; margin-bottom:8px; background:#333; padding:10px; border:1px solid #444; color:#fff; display:flex; flex-direction:column; gap:5px;";
            
            btn.innerHTML = `
                <div style="font-weight:bold; color:var(--secondary-color);"><ion-icon name="help-circle-outline"></ion-icon> ${dec.question}</div>
                <div style="font-size:0.75rem; color:#aaa;">Opções: ${dec.options.join(' / ')}</div>
            `;
            
            btn.onclick = () => sendDecision(dec);
            list.appendChild(btn);
        });
    }

    // =================================================================
    // 5. FUNÇÕES DE MÍDIA E CONTROLES (Globais Seguros)
    // =================================================================

// =================================================================
    // CONTROLE DE VOLUME GERAL
    // =================================================================
    window.adjustMasterVolume = (val) => {
        masterVolume = parseFloat(val);
        
        // Altera o volume do áudio tocando agora
        if (currentAudioObj) {
            currentAudioObj.volume = masterVolume;
        }
        
        // Altera o volume do vídeo tocando agora
        const videoEl = document.querySelector('#host-video-layer video');
        if (videoEl) {
            videoEl.volume = masterVolume;
        }
    };

    // =================================================================
    // TOCAR MÍDIA (Agora usa o masterVolume)
    // =================================================================
    async function playMedia(asset) {
        if (asset.type === 'audio') {
            currentAudioObj = new Audio(asset.url);
            currentAudioObj.loop = true; 
            currentAudioObj.volume = masterVolume; // Aplica o volume geral
            currentAudioObj.play().catch(e => console.error("Erro ao tocar áudio:", e));
        }
        
        if (asset.type === 'video' || asset.type === 'image') {
            const layer = document.getElementById('host-video-layer');
            if (layer) {
                layer.innerHTML = ''; 
                if (asset.type === 'video') {
                    const vid = document.createElement('video');
                    vid.src = asset.url; 
                    vid.autoplay = true; 
                    vid.loop = true; 
                    vid.volume = masterVolume; // Aplica o volume geral
                    vid.removeAttribute('controls');
                    layer.appendChild(vid);
                } else if (asset.type === 'image') {
                    const img = document.createElement('img'); 
                    img.src = asset.url; 
                    layer.appendChild(img);
                }
            }
        }

        if (roomRef) await roomRef.update({ liveMedia: { ...asset, loop: true, timestamp: Date.now() } });
    }

    async function toggleMedia(asset, safeId) {
        if (currentPlayingUrl === asset.url) {
            await stopMedia();
            updateVisuals(null, 'stop');
        } else {
            if (currentPlayingUrl) await stopMedia(); 
            currentPlayingUrl = asset.url;
            updateVisuals(safeId, 'play');
            playMedia(asset);
        }
    }

    function updateVisuals(safeId, state) {
        document.querySelectorAll('.play-indicator ion-icon').forEach(i => {
            i.setAttribute('name', 'play-circle-outline');
            i.style.color = '#00ff88';
        });

        if (state === 'play' && safeId) {
            const el = document.getElementById(safeId);
            if (el) {
                const icon = el.querySelector('ion-icon');
                icon.setAttribute('name', 'stop-circle-outline');
                icon.style.color = '#ff4444';
            }
        }
    }


    async function stopMedia(skipDb = false) {
        if (currentAudioObj) { currentAudioObj.pause(); currentAudioObj = null; }
        const layer = document.getElementById('host-video-layer');
        if (layer) layer.innerHTML = '';
        currentPlayingUrl = null;
        updateVisuals(null, 'reset');
        if (roomRef && !skipDb) await roomRef.update({ liveMedia: null });
    }
    window.stopMedia = stopMedia;

    // =================================================================
    // --- DECISÕES (COM TIMER REAL E RESULTADOS) ---
    // =================================================================
    
    let decisionTimerInterval = null; // Variável para guardar o cronômetro

    async function sendDecision(decision) {
        const fb = document.getElementById('host-decision-feedback');
        const qEl = document.getElementById('feedback-question');
        const tEl = document.getElementById('feedback-timer');
        
        let timeLeft = decision.time || 30; // 30 segundos padrão

        // Limpa a tela de resultados anterior (se houver)
        let resBox = document.getElementById('decision-results-display');
        if (resBox) resBox.style.display = 'none';

        if(fb) {
            fb.classList.remove('hidden');
            if(qEl) qEl.innerText = decision.question;
            if(tEl) tEl.innerText = timeLeft + 's';
            if(tEl) tEl.style.color = '#fff';
        }

        if(roomRef) {
            // 1. Envia a decisão para o Firebase e ZERA os votos
            await roomRef.update({
                activeDecision: {
                    ...decision,
                    id: Date.now().toString(),
                    endTime: Date.now() + (timeLeft * 1000),
                    status: 'active',
                    votes: {}, // Cria o objeto vazio para receber os votos dos jogadores
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }
            });

            // 2. Inicia o Cronômetro Local
            if (decisionTimerInterval) clearInterval(decisionTimerInterval);
            
            decisionTimerInterval = setInterval(async () => {
                timeLeft--;
                if (tEl) tEl.innerText = timeLeft + 's';

                // Efeito visual quando o tempo está acabando (10s)
                if (timeLeft <= 10 && tEl) tEl.style.color = '#ff4444';

                // 3. Quando o tempo acaba!
                if (timeLeft <= 0) {
                    clearInterval(decisionTimerInterval);
                    if(tEl) tEl.innerText = "Encerrado!";
                    await finishDecision(); // Chama a função que calcula os votos
                }
            }, 1000);
        }
    }

    async function finishDecision() {
        if (!roomRef) return;

        // 1. Puxa os dados atualizados do banco (com os votos)
        const snap = await roomRef.get();
        const data = snap.data();
        const activeDecision = data.activeDecision;

        if (!activeDecision) return;

        // 2. Fecha a votação no banco para os jogadores não votarem mais
        await roomRef.update({ 'activeDecision.status': 'finished' });

        // 3. Calcula os Resultados
        const votes = activeDecision.votes || {}; 
        const totalVotes = Object.keys(votes).length;
        let resultHTML = "";

        if (totalVotes === 0) {
            resultHTML = `<div style="padding: 10px; background: rgba(255, 68, 68, 0.2); border-left: 3px solid #ff4444; border-radius: 4px; margin-top: 15px;">
                            <span style="color:#ffbb00; font-weight:bold;">Ninguém votou a tempo!</span>
                          </div>`;
        } else {
            // Conta qual opção teve mais votos
            const counts = {};
            for (const player in votes) {
                const opt = votes[player];
                counts[opt] = (counts[opt] || 0) + 1;
            }

            let maxVotes = 0;
            let winningOption = "";
            for (const opt in counts) {
                if (counts[opt] > maxVotes) {
                    maxVotes = counts[opt];
                    winningOption = opt;
                }
            }

            // Monta o HTML do resultado
            resultHTML = `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #444;">
                    <h4 style="color:#00ff88; margin-bottom: 10px;">🏆 Mais votada: <br><span style="color:#fff;">${winningOption}</span> (${maxVotes} votos)</h4>
                    <p style="font-size: 0.8rem; color: #aaa; margin-bottom: 5px;">Detalhes dos votos:</p>
                    <ul style="list-style:none; padding:0; font-size:0.85rem; color:#ccc; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 4px;">
            `;
            
            for (const player in votes) {
                resultHTML += `<li style="margin-bottom: 4px;"><strong>${player}:</strong> escolheu <em>${votes[player]}</em></li>`;
            }
            resultHTML += `</ul></div>`;
        }

        // 4. Exibe na tela do Host
        const fbBox = document.getElementById('host-decision-feedback');
        let resBox = document.getElementById('decision-results-display');
        
        // Se a caixa de resultados não existir, cria ela
        if (!resBox) {
            resBox = document.createElement('div');
            resBox.id = 'decision-results-display';
            if (fbBox) fbBox.appendChild(resBox);
        }

        resBox.innerHTML = resultHTML;
        resBox.style.display = 'block';
    }

    // Função para limpar e fechar o painel de decisão
    window.clearPlayerDecision = async () => {
        if (decisionTimerInterval) clearInterval(decisionTimerInterval); // Para o timer se fechar antes
        
        const fbBox = document.getElementById('host-decision-feedback');
        if (fbBox) fbBox.classList.add('hidden');
        
        const resBox = document.getElementById('decision-results-display');
        if (resBox) resBox.style.display = 'none';

        if(roomRef) await roomRef.update({ activeDecision: null });
    };

    // --- TIMERS ---
    function updateTimerDisplay(seconds) {
        const el = document.getElementById('session-timer');
        if (el) {
            const min = Math.floor(seconds / 60); const sec = seconds % 60;
            el.innerText = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }
    }

// =================================================================
    // CONTROLES DE UI (Timers, Câmera, Microfone, Link)
    // =================================================================
    function setupUIControls() {
        // --- TIMERS ---
        const btnStart = document.getElementById('timer-start-btn');
        const btnPause = document.getElementById('timer-pause-btn');
        const btnReset = document.getElementById('timer-reset-btn');

        if(btnStart) btnStart.onclick = () => {
            if (timerInterval) clearInterval(timerInterval);
            if(roomRef) roomRef.update({ timerStatus: 'running' });
            timerInterval = setInterval(() => {
                if (currentTimer > 0) {
                    currentTimer--; updateTimerDisplay(currentTimer);
                    if (currentTimer % 5 === 0 && roomRef) roomRef.update({ timerCurrent: currentTimer });
                } else clearInterval(timerInterval);
            }, 1000);
        };

        if(btnPause) btnPause.onclick = () => {
            if (timerInterval) clearInterval(timerInterval);
            if(roomRef) roomRef.update({ timerStatus: 'paused' });
        };

        if(btnReset) btnReset.onclick = () => {
            if (timerInterval) clearInterval(timerInterval);
            currentTimer = originalGameDuration; updateTimerDisplay(currentTimer);
            if(roomRef) roomRef.update({ timerCurrent: currentTimer, timerStatus: 'paused' });
        };
        
        // --- COPIAR LINK ---
        const copyBtn = document.getElementById('copy-invite-btn');
        const inviteInput = document.getElementById('floating-invite-link');
        if (copyBtn && inviteInput) {
            copyBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(inviteInput.value);
                    copyBtn.innerHTML = '<ion-icon name="checkmark-outline"></ion-icon>';
                    copyBtn.style.color = '#00ff88';
                    setTimeout(() => { copyBtn.innerHTML = '<ion-icon name="copy-outline"></ion-icon>'; copyBtn.style.color = ''; }, 2000);
                } catch (err) { inviteInput.select(); document.execCommand('copy'); }
            };
        }

        // --- CÂMERA E MICROFONE ---
        const micBtn = document.getElementById('host-mic-btn');
        const camBtn = document.getElementById('host-cam-btn');
        const endBtn = document.getElementById('end-call-btn');

        if (micBtn) micBtn.onclick = () => toggleLocalTrack('audio', micBtn);
        if (camBtn) camBtn.onclick = () => toggleLocalTrack('video', camBtn);
        
        if (endBtn) endBtn.onclick = () => {
            if (confirm("Deseja realmente sair da sala?")) window.location.href = 'index.html';
        };
    }

    // Função que liga/desliga a mídia da câmera e microfone
    function toggleLocalTrack(kind, btn) {
        if (!localStream) {
            alert(`Acesso à ${kind === 'audio' ? 'microfone' : 'câmera'} não iniciado ou bloqueado pelo navegador.`);
            return;
        }
        
        const tracks = kind === 'audio' ? localStream.getAudioTracks() : localStream.getVideoTracks();
        if (tracks.length === 0) {
            alert(`Nenhum dispositivo de ${kind === 'audio' ? 'áudio' : 'vídeo'} encontrado.`);
            return;
        }

        const track = tracks[0];
        track.enabled = !track.enabled; // Inverte o status (liga/desliga)

        const iconName = kind === 'audio' ? 'mic' : 'videocam';
        
        // Atualiza o visual do botão
        if (track.enabled) {
            btn.style.background = '#333';
            btn.innerHTML = `<ion-icon name="${iconName}-outline"></ion-icon>`;
            btn.classList.remove('danger');
        } else {
            btn.style.background = '#ff4444';
            btn.innerHTML = `<ion-icon name="${iconName}-off-outline"></ion-icon>`;
            btn.classList.add('danger');
        }

        // Se for vídeo, escurece a caixinha local
        if (kind === 'video') {
            const videoEl = document.getElementById('host-local-video');
            if (videoEl) {
                if (track.enabled) videoEl.style.opacity = '1';
                else videoEl.style.opacity = '0.3';
            }
        }
    }

    // --- WEBRTC (Câmera Local) ---
    async function setupLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const localVideo = document.getElementById('host-local-video');
            if (localVideo) { localVideo.srcObject = localStream; localVideo.muted = true; }
        } catch (e) { console.warn("Sem permissão de mídia."); }
    }

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

}); // FIM DO ENCAPSULAMENTO