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
    let extraLifeUsed = false;

    let currentAudioObj = null;
    let currentPlayingUrl = null;
    let originalGameDuration = 3600;
    
    // Variáveis Globais de Controle de Mídia
    let masterVolume = 1.0; 
    let localMediaAssets = []; 

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

        roomRef = db.collection('sessions').doc(sessionId);
        let checkDoc = await roomRef.get();
        
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
    // 3. CARREGAMENTO DE DADOS DO FIREBASE E RENDERIZAÇÃO
    // =================================================================
    async function loadSessionData() {
        console.log("🔄 Carregando dados da sessão e do jogo...");

        const sessionSnap = await roomRef.get();
        const sessionData = sessionSnap.data();

        const inviteInput = document.getElementById('floating-invite-link');
        if(inviteInput) inviteInput.value = `${window.location.origin}/sala.html?sessionId=${roomRef.id}`;

        // 1. Pegar os dados do Jogo
        if (sessionData.gameId) {
            const gameSnap = await db.collection('games').doc(sessionData.gameId).get();
            
            if (gameSnap.exists) {
                const gameData = gameSnap.data();
                
                // Carrega Mídias e Decisões
                renderAssets(gameData.sessionAssets || []);
                renderDecisions(gameData.decisions || []);
                
                // Define a duração original do jogo baseada no banco de dados
                if(gameData.sessionDuration) {
                    originalGameDuration = parseInt(gameData.sessionDuration) * 60;
                }
            } else {
                console.error("❌ O Jogo associado a esta sessão não existe.");
            }
        }

        // 2. CORREÇÃO DO TIMER
        // Se a sala já estava rodando ou pausada no meio do jogo, mantém o tempo.
        // Se for uma sala nova, puxa o tempo correto do Jogo.
        if (sessionData.timerCurrent !== undefined && sessionData.timerStatus === 'running') {
            currentTimer = parseInt(sessionData.timerCurrent);
        } else if (sessionData.timerCurrent !== undefined && sessionData.timerCurrent > 0 && sessionData.timerCurrent < originalGameDuration) {
            currentTimer = parseInt(sessionData.timerCurrent);
        } else {
            currentTimer = originalGameDuration; // Puxa do jogo real!
            roomRef.update({ timerCurrent: currentTimer, timerStatus: 'paused' });
        }

        updateTimerDisplay(currentTimer);
    }

    // =================================================================
    // 4. RENDERIZAÇÃO NA TELA (SIMPLES, SEM SETAS)
    // =================================================================
    
    // Deixei a função de reordenar vazia caso algum botão velho ainda chame ela
    window.moveAssetOrder = () => {}; 

    function renderAssets(assetsArray) {
        if (assetsArray) {
            localMediaAssets = assetsArray;
        }

        // 1. Procura as três listas no seu HTML
        const audioList = document.getElementById('host-audio-list');
        const videoList = document.getElementById('host-video-list');
        const imageList = document.getElementById('host-image-list'); // NOVA LISTA DE FOTOS
        const generalList = document.getElementById('media-assets-list'); // Fallback (caso esqueça alguma)

        // Limpa todas as listas antes de preencher
        if (audioList) audioList.innerHTML = '';
        if (videoList) videoList.innerHTML = '';
        if (imageList) imageList.innerHTML = '';
        if (generalList) generalList.innerHTML = '';

        if (!localMediaAssets || localMediaAssets.length === 0) {
            const emptyHtml = '<p style="color:#666; font-size:0.85rem; padding:10px; text-align:center;">Nenhuma mídia cadastrada.</p>';
            if(audioList) audioList.innerHTML = emptyHtml;
            if(videoList) videoList.innerHTML = emptyHtml;
            if(imageList) imageList.innerHTML = emptyHtml;
            if(generalList) generalList.innerHTML = emptyHtml;
            return;
        }

        localMediaAssets.forEach((asset, index) => {
            const card = document.createElement('div');
            card.className = 'media-card';
            
            // Design blindado que quebra o texto perfeitamente
            card.style.cssText = "background:#222; padding:12px; margin-bottom:8px; border-radius:6px; border:1px solid #333; display:flex; justify-content:space-between; align-items:center; cursor:pointer; transition:0.2s; width:100%; box-sizing:border-box;";
            
            let iconName = asset.type === 'audio' ? 'musical-notes' : 'videocam';
            if (asset.type === 'image') iconName = 'image';

            const safeId = "ind-" + index;

            card.innerHTML = `
                <div class="media-info" style="display:flex; align-items:center; gap:10px; flex:1 1 auto; min-width:0;">
                    <ion-icon name="${iconName}" style="color:var(--secondary-color); font-size:1.3rem; flex-shrink:0;"></ion-icon>
                    <span style="font-size:0.95rem; word-break:break-word; line-height:1.4; display:block; width:100%;">
                        ${asset.name}
                    </span>
                </div>
                <div class="play-indicator" id="${safeId}" style="width:30px; text-align:right; flex-shrink:0; margin-left:10px;">
                    <ion-icon name="play-circle-outline" style="font-size:1.8rem; color:#00ff88; transition:0.2s;"></ion-icon>
                </div>
            `;

            // Clique simples para tocar
            card.addEventListener('click', () => toggleMedia(asset, safeId));

            // 2. SEPARAÇÃO MÁGICA: Joga o cartão na lista correta de acordo com o tipo
            if (asset.type === 'audio' && audioList) {
                audioList.appendChild(card);
            } else if (asset.type === 'video' && videoList) {
                videoList.appendChild(card);
            } else if (asset.type === 'image' && imageList) {
                imageList.appendChild(card);
            } else if (generalList) {
                // Se o HTML específico não existir, usa a lista geral
                generalList.appendChild(card);
            }
        });
    }

    // --- CORREÇÃO DAS DECISÕES ---
    function renderDecisions(decisions) {
        // Multiplos IDs de busca para garantir que encontre a div no seu HTML
        const list = document.getElementById('host-decisions-list') || document.getElementById('decisions-list') || document.getElementById('decision-list');
        if (!list) return;

        list.innerHTML = '';

        if (!Array.isArray(decisions) || decisions.length === 0) {
            list.innerHTML = '<p style="color:#666; text-align:center; padding:10px;">Sem decisões salvas para este jogo.</p>';
            return;
        }

        decisions.forEach(dec => {
            const btn = document.createElement('button');
            btn.className = 'secondary-btn';
            btn.style.cssText = "width:100%; text-align:left; margin-bottom:8px; background:#333; padding:12px; border:1px solid #444; color:#fff; display:flex; flex-direction:column; gap:5px; border-radius:6px; cursor:pointer;";
            
            btn.innerHTML = `
                <div style="font-weight:bold; color:var(--secondary-color); font-size:1rem;"><ion-icon name="help-circle-outline"></ion-icon> ${dec.question}</div>
                <div style="font-size:0.8rem; color:#aaa;">Opções: ${dec.options.join(' / ')}</div>
            `;
            
            btn.onclick = () => sendDecision(dec);
            list.appendChild(btn);
        });
    }

    // --- CORREÇÃO DO DISPLAY DO TIMER ---
    function updateTimerDisplay(seconds) {
        // Multiplos IDs de busca para garantir que o relógio atualize
        const el = document.getElementById('session-timer') || document.getElementById('timer-display') || document.getElementById('host-timer');
        if (el) {
            const min = Math.floor(seconds / 60); 
            const sec = seconds % 60;
            el.innerText = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }
    }

    // =================================================================
    // 5. FUNÇÕES DE MÍDIA E CONTROLES (Globais Seguros)
    // =================================================================

    window.adjustMasterVolume = (val) => {
        masterVolume = parseFloat(val);
        
        if (currentAudioObj) {
            currentAudioObj.volume = masterVolume;
        }
        
        const videoEl = document.querySelector('#host-video-layer video');
        if (videoEl) {
            videoEl.volume = masterVolume;
        }
    };

    async function playMedia(asset) {
        if (asset.type === 'audio') {
            currentAudioObj = new Audio(asset.url);
            currentAudioObj.loop = true; 
            currentAudioObj.volume = masterVolume; 
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
                    vid.volume = masterVolume;
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
    
    let decisionTimerInterval = null;

    async function sendDecision(decision) {
        const fb = document.getElementById('host-decision-feedback');
        const qEl = document.getElementById('feedback-question');
        const tEl = document.getElementById('feedback-timer');
        
        let timeLeft = decision.time || 30; 

        let resBox = document.getElementById('decision-results-display');
        if (resBox) resBox.style.display = 'none';

        if(fb) {
            fb.classList.remove('hidden');
            if(qEl) qEl.innerText = decision.question;
            if(tEl) tEl.innerText = timeLeft + 's';
            if(tEl) tEl.style.color = '#fff';
        }

        if(roomRef) {
            await roomRef.update({
                activeDecision: {
                    ...decision,
                    id: Date.now().toString(),
                    endTime: Date.now() + (timeLeft * 1000),
                    status: 'active',
                    votes: {}, 
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                }
            });

            if (decisionTimerInterval) clearInterval(decisionTimerInterval);
            
            decisionTimerInterval = setInterval(async () => {
                timeLeft--;
                if (tEl) tEl.innerText = timeLeft + 's';

                if (timeLeft <= 10 && tEl) tEl.style.color = '#ff4444';

                if (timeLeft <= 0) {
                    clearInterval(decisionTimerInterval);
                    if(tEl) tEl.innerText = "Encerrado!";
                    await finishDecision(); 
                }
            }, 1000);
        }
    }

    async function finishDecision() {
        if (!roomRef) return;

        const snap = await roomRef.get();
        const data = snap.data();
        const activeDecision = data.activeDecision;

        if (!activeDecision) return;

        await roomRef.update({ 'activeDecision.status': 'finished' });

        const votes = activeDecision.votes || {}; 
        const totalVotes = Object.keys(votes).length;
        let resultHTML = "";

        if (totalVotes === 0) {
            resultHTML = `<div style="padding: 10px; background: rgba(255, 68, 68, 0.2); border-left: 3px solid #ff4444; border-radius: 4px; margin-top: 15px;">
                            <span style="color:#ffbb00; font-weight:bold;">Ninguém votou a tempo!</span>
                          </div>`;
        } else {
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

        const fbBox = document.getElementById('host-decision-feedback');
        let resBox = document.getElementById('decision-results-display');
        
        if (!resBox) {
            resBox = document.createElement('div');
            resBox.id = 'decision-results-display';
            if (fbBox) fbBox.appendChild(resBox);
        }

        resBox.innerHTML = resultHTML;
        resBox.style.display = 'block';
    }

    window.clearPlayerDecision = async () => {
        if (decisionTimerInterval) clearInterval(decisionTimerInterval); 
        
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
    // LÓGICA DO CRONÔMETRO E VIDA EXTRA
    // =================================================================
    
    // Função exclusiva para disparar a Vida Extra
    window.triggerExtraLife = async () => {
        if (extraLifeUsed) return; // Garante que só vai acontecer uma vez
        
        extraLifeUsed = true;
        console.log("Tempo esgotado! Iniciando Vida Extra...");
        
        // 1. Procura a mídia ignorando maiúsculas, minúsculas e acentos
        const extraLifeAsset = localMediaAssets.find(a => {
            if (!a.name) return false; // Evita erro se o arquivo não tiver nome
            
            // Tira acentos e deixa tudo minúsculo para a busca não falhar
            const nameClean = a.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return nameClean.includes('vida extra');
        });
        
        if (extraLifeAsset) {
            const assetIndex = localMediaAssets.indexOf(extraLifeAsset);
            const safeId = "ind-" + assetIndex;
            
            // Para o que estiver tocando e roda a vida extra
            if (currentPlayingUrl) await stopMedia(); 
            currentPlayingUrl = extraLifeAsset.url;
            if(typeof updateVisuals === 'function') updateVisuals(safeId, 'play');
            if(typeof playMedia === 'function') playMedia(extraLifeAsset);
        } else {
            console.warn("Nenhum vídeo com o nome 'Vida Extra' foi encontrado na lista.");
        }
        
        // 2. Adiciona o tempo da Vida Extra (300 segundos = 5 minutos)
        currentTimer = 300; 
        updateTimerDisplay(currentTimer);
        
        // 3. Volta a correr o relógio automaticamente
        startTimerInterval();
    };

    function startTimerInterval() {
        if (timerInterval) clearInterval(timerInterval);
        if(roomRef) roomRef.update({ timerStatus: 'running' });
        
        timerInterval = setInterval(() => {
            if (currentTimer > 0) {
                currentTimer--; 
                updateTimerDisplay(currentTimer);
                if (currentTimer % 5 === 0 && roomRef) roomRef.update({ timerCurrent: currentTimer });
            } else {
                // O TEMPO ACABOU SOZINHO PELO RELÓGIO!
                clearInterval(timerInterval);
                
                if (!extraLifeUsed) {
                    window.triggerExtraLife(); // Chama a função que criamos acima
                } else {
                    if(roomRef) roomRef.update({ timerStatus: 'finished', timerCurrent: 0 });
                }
            }
        }, 1000);
    }

    // =================================================================
    // AJUSTE RÁPIDO DO TIMER (+/- Minutos)
    // =================================================================
    window.adjustTimer = (secondsToAdd) => {
        currentTimer += secondsToAdd;
        
        if (currentTimer <= 0) {
            currentTimer = 0;
            updateTimerDisplay(currentTimer);
            if (roomRef) roomRef.update({ timerCurrent: 0 });
            
            // Se você zerou o tempo no botão (ex: clicando em -5 min) e a vida extra não foi usada, ele dispara ela na mesma hora!
            if (!extraLifeUsed) {
                if (timerInterval) clearInterval(timerInterval);
                window.triggerExtraLife();
            } else {
                if (timerInterval) clearInterval(timerInterval);
                if(roomRef) roomRef.update({ timerStatus: 'finished' });
            }
        } else {
            updateTimerDisplay(currentTimer);
            if (roomRef) roomRef.update({ timerCurrent: currentTimer });
        }
    };

    // =================================================================
    // CONTROLES DE UI (Timers, Câmera, Microfone, Link)
    // =================================================================
    function setupUIControls() {
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
            currentTimer = originalGameDuration; extraLifeUsed = false; updateTimerDisplay(currentTimer);
            if(roomRef) roomRef.update({ timerCurrent: currentTimer, timerStatus: 'paused' });
        };
        
        // Controles de Link de Convite
        const copyBtn = document.getElementById('floating-copy-btn');
        const inviteInput = document.getElementById('floating-invite-link');
        if (copyBtn && inviteInput) {
            copyBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(inviteInput.value);
                    copyBtn.innerHTML = '<ion-icon name="checkmark-outline"></ion-icon>';
                    copyBtn.style.color = '#00ff88';
                    setTimeout(() => { copyBtn.innerHTML = '<ion-icon name="copy-outline"></ion-icon>'; copyBtn.style.color = 'var(--secondary-color)'; }, 2000);
                } catch (err) { inviteInput.select(); document.execCommand('copy'); }
            };
        }

        const micBtn = document.getElementById('host-mic-btn');
        const camBtn = document.getElementById('host-cam-btn');
        const endBtn = document.getElementById('end-call-btn');

        if (micBtn) micBtn.onclick = () => toggleLocalTrack('audio', micBtn);
        if (camBtn) camBtn.onclick = () => toggleLocalTrack('video', camBtn);
        
        if (endBtn) endBtn.onclick = () => {
            if (confirm("Deseja realmente sair da sala?")) window.location.href = 'index.html';
        };
    }

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
        track.enabled = !track.enabled;

        const iconName = kind === 'audio' ? 'mic' : 'videocam';
        
        if (track.enabled) {
            btn.style.background = '#333';
            btn.innerHTML = `<ion-icon name="${iconName}-outline"></ion-icon>`;
            btn.classList.remove('danger');
        } else {
            btn.style.background = '#ff4444';
            btn.innerHTML = `<ion-icon name="${iconName}-off-outline"></ion-icon>`;
            btn.classList.add('danger');
        }

        if (kind === 'video') {
            const videoEl = document.getElementById('host-local-video');
            if (videoEl) {
                if (track.enabled) videoEl.style.opacity = '1';
                else videoEl.style.opacity = '0.3';
            }
        }
    }

    async function setupLocalMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const localVideo = document.getElementById('host-local-video');
            if (localVideo) { localVideo.srcObject = localStream; localVideo.muted = true; }
        } catch (e) { console.warn("Sem permissão de mídia."); }
    }

    // --- WEBRTC CORRIGIDO PARA O HOST INICIAR A CÂMERA ---
    function setupWebRTC() {
        peerConnection = new RTCPeerConnection(servers);
        
        if (localStream) {
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
        }
        
        // Host envia os ICE Candidates
        peerConnection.onicecandidate = event => {
            if(event.candidate && roomRef) {
                roomRef.collection('offerCandidates').add(event.candidate.toJSON());
            }
        };

        // HOST CRIA A OFERTA
        peerConnection.createOffer().then(async offer => {
            await peerConnection.setLocalDescription(offer);
            if(roomRef) await roomRef.update({ offer: { type: offer.type, sdp: offer.sdp } });
        });
        
        // Host escuta a resposta E a lista de jogadores em tempo real
        roomRef.onSnapshot(async snapshot => {
            const data = snapshot.data();
            
            // Lógica do Vídeo (WebRTC)
            if (data?.answer && !peerConnection.currentRemoteDescription) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            }

            // Lógica de Presença (Jogadores Conectados)
            renderConnectedPlayers(data?.connectedPlayers || {});
        });

        // Host coleta os candidatos de resposta do jogador
        roomRef.collection('answerCandidates').onSnapshot(snap => {
            snap.docChanges().forEach(change => {
                if (change.type === 'added') {
                    peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()));
                }
            });
        });
    }

    // Função para desenhar a lista de jogadores na tela
    function renderConnectedPlayers(playersMap) {
        const list = document.getElementById('connected-players-list');
        if (!list) return;
        
        list.innerHTML = '';
        const playerIds = Object.keys(playersMap);
        
        if(playerIds.length === 0) {
            list.innerHTML = '<p style="text-align:center; color:#aaa; font-size: 0.85rem;">Nenhum jogador na sala.</p>';
            return;
        }

        playerIds.forEach(pId => {
            const pName = playersMap[pId];
            const item = document.createElement('div');
            item.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:6px; border:1px solid #333;";
            item.innerHTML = `
                <span style="color:#fff; font-size:0.9rem; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${pName}</span>
                <button class="submit-btn danger-btn small-btn" style="padding:4px 8px;" onclick="window.kickPlayer('${pId}', '${pName}')" title="Remover da Sala">
                    <ion-icon name="exit-outline"></ion-icon>
                </button>
            `;
            list.appendChild(item);
        });
    }

    // Função que chuta o jogador da sala
    window.kickPlayer = async (pId, pName) => {
        if(confirm(`Tem a certeza que deseja remover [${pName}] da sala? A conexão do jogador será encerrada.`)) {
            try {
                await roomRef.update({
                    // Remove o jogador da lista de ativos
                    [`connectedPlayers.${pId}`]: firebase.firestore.FieldValue.delete(),
                    // Coloca o ID dele na lista negra de expulsos
                    kickedPlayers: firebase.firestore.FieldValue.arrayUnion(pId)
                });
            } catch(e) {
                console.error("Erro ao remover jogador:", e);
                alert("Ocorreu um erro ao tentar remover o jogador.");
            }
        }
    };

});