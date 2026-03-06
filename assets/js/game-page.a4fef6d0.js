document.addEventListener('DOMContentLoaded', async () => {
    console.log("🎮 Game Page Manager (V-FINAL: Busca Ativa de Sala)...");

    if (typeof firebase === 'undefined') {
        console.error("Firebase não carregado.");
        return;
    }

    const db = firebase.firestore();
    const auth = firebase.auth();

    // 1. PEGAR ID DA URL
    const params = new URLSearchParams(window.location.search);
    let gameIdParam = params.get('id') ? params.get('id').trim() : null;
    
    if(gameIdParam && gameIdParam.endsWith('/')) {
        gameIdParam = gameIdParam.slice(0, -1);
    }

    // Referências DOM
    const dom = {
        container: document.getElementById('game-details-container'),
        notFound: document.getElementById('game-not-found'),
        title: document.getElementById('game-title'),
        cover: document.getElementById('game-cover-image'),
        duration: document.getElementById('session-duration'),
        tags: document.getElementById('game-genre-tags'),
        desc: document.getElementById('game-description'),
        
        carouselSection: document.getElementById('carousel-section'),
        carouselTrack: document.getElementById('game-carousel-track'),
        trailerSection: document.getElementById('game-trailer-section'),
        trailerWrapper: document.getElementById('trailer-embed-wrapper'),

        monthDisplay: document.getElementById('calendar-month-display'),
        calendarGrid: document.getElementById('calendar-grid'),
        prevMonthBtn: document.getElementById('prev-month-btn'),
        nextMonthBtn: document.getElementById('next-month-btn'),
        pausedOverlay: document.getElementById('calendar-overlay'),
        
        timeContainer: document.getElementById('time-selection-container'),
        timeGrid: document.getElementById('time-slots-grid'),
        dateDisplay: document.getElementById('selected-date-display')
    };

    if (!gameIdParam) {
        showError("ID do jogo não fornecido.");
        return;
    }

    // Estado Local
    let gameData = null;
    let currentDate = new Date();
    let selectedDateStr = null;

    // =================================================================
    // 1. LÓGICA DO MODAL DO CRIADOR E BUSCA DE JOGOS
    // =================================================================
    window.openCreatorModal = async (creatorName) => {
        const modal = document.getElementById('creator-modal');
        const title = document.getElementById('creator-modal-title');
        const list = document.getElementById('creator-games-list');
        
        if (!modal || !list) return;
        
        modal.classList.remove('hidden');
        title.textContent = `Jogos de ${creatorName}`;
        list.innerHTML = '<p style="text-align:center; color:#888; padding: 20px;">Procurando jogos...</p>';
        
        try {
            // Busca todos os jogos ativos no banco
            const snap = await db.collection('games').get();
            let foundGames = [];
            
            // Filtra manualmente os jogos onde este criador está na lista
            snap.forEach(doc => {
                const g = doc.data();
                if (g.creators && g.creators.some(c => c.name === creatorName)) {
                    foundGames.push({ id: doc.id, ...g });
                }
            });
            
            list.innerHTML = ''; 
            
            if (foundGames.length === 0) {
                list.innerHTML = '<p style="text-align:center; color:#888; padding: 20px;">Nenhum outro jogo encontrado.</p>';
                return;
            }
            
            // Cria um "mini-card" para cada jogo encontrado
            foundGames.forEach(g => {
                const item = document.createElement('div');
                item.style.cssText = "display: flex; gap: 15px; background: #222; padding: 12px; border-radius: 8px; align-items: center; cursor: pointer; border: 1px solid #333; transition: 0.2s;";
                item.onmouseover = () => item.style.borderColor = "var(--secondary-color)";
                item.onmouseout = () => item.style.borderColor = "#333";
                
                // Ao clicar no jogo, redireciona para a página dele
                item.onclick = () => window.location.href = `jogo-template.html?id=${g.id}`;
                
                // Pega a primeira imagem da galeria ou uma padrão
                const imgUrl = (g.gallery && g.gallery.length > 0) ? g.gallery[0] : (g.coverImage || 'assets/images/placeholder.png');
                
                item.innerHTML = `
                    <img src="${imgUrl}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;">
                    <div style="flex: 1; min-width: 0;">
                        <strong style="color: #fff; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1.1rem;">${g.name || g.title}</strong>
                        <span style="font-size: 0.85rem; color: #aaa; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${g.shortDescription || 'Sem descrição'}</span>
                    </div>
                    <ion-icon name="chevron-forward-outline" style="color: var(--secondary-color); font-size: 1.2rem;"></ion-icon>
                `;
                list.appendChild(item);
            });
            
        } catch (error) {
            console.error("Erro ao buscar jogos do criador:", error);
            list.innerHTML = '<p style="text-align:center; color:#ff4444; padding: 20px;">Erro ao carregar os jogos.</p>';
        }
    };

    // =================================================================
    // 2. FUNÇÃO GERADORA DE ID (BACKUP)
    // =================================================================
    function generateDeterministicId(gameId, date, time) {
        // Usada apenas se não encontrarmos nenhuma sala no banco
        const g = String(gameId).trim().replace(/\s+/g, '');
        const d = String(date).trim();
        const t = String(time).trim().replace(/:/g, '-');
        return `session_${g}_${d}_${t}`;
    }

    // =================================================================
    // 3. CARREGAR DADOS
    // =================================================================
    try {
        let doc = await db.collection('games').doc(gameIdParam).get();
        
        if (!doc.exists) {
            // Tenta por slug
            const slugSnap = await db.collection('games').where('slug', '==', gameIdParam).limit(1).get();
            if (!slugSnap.empty) {
                doc = slugSnap.docs[0];
            } else {
                throw new Error("Jogo não encontrado.");
            }
        }

        gameData = { id: doc.id, ...doc.data() };
        console.log("✅ Jogo carregado:", gameData.name);

        renderGameDetails();
        renderCalendar();

    } catch (e) {
        console.error(e);
        showError("Jogo indisponível.");
    }

    function showError(msg) {
        if(dom.container) dom.container.classList.add('hidden');
        if(dom.notFound) {
            dom.notFound.classList.remove('hidden');
            if(msg) dom.notFound.querySelector('h1').innerText = msg;
        }
    }

    function renderGameDetails() {
        document.title = `${gameData.name} | PlayU`;
        if(dom.title) dom.title.textContent = gameData.name;
        if(dom.cover) dom.cover.src = gameData.coverImage || 'assets/images/logo.png';
        if(dom.duration) dom.duration.textContent = gameData.sessionDuration ? `${gameData.sessionDuration} min` : '--';
        if(dom.desc) dom.desc.textContent = gameData.fullDescription || gameData.shortDescription || '';
        
        // ==========================================
        // 1. MELHORIA VISUAL DAS TAGS (BADGES)
        // ==========================================
        if(dom.tags && gameData.tags && gameData.tags.length > 0) {
            dom.tags.innerHTML = ''; // Limpa o texto antigo
            
            const tagsArray = Array.isArray(gameData.tags) ? gameData.tags : [gameData.tags];
            
            tagsArray.forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.textContent = tag;
                // Estilo moderno em formato de "Pílula" (Badge)
                tagEl.style.cssText = "background: rgba(0, 255, 136, 0.1); color: var(--secondary-color); border: 1px solid var(--secondary-color); padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;";
                dom.tags.appendChild(tagEl);
            });
        }

        // ==========================================
        // 2. INJEÇÃO DOS CRIADORES COM LINKS CLICÁVEIS
        // ==========================================
        const creatorsContainer = document.getElementById('game-creators-container');
        
        if (creatorsContainer) {
            creatorsContainer.innerHTML = ''; // Limpa a área para evitar duplicação
            
            // Verifica se a gaveta de criadores existe e se tem alguém lá dentro
            if (gameData.creators && gameData.creators.length > 0) {
                creatorsContainer.innerHTML = '<ion-icon name="people-outline" style="color: var(--secondary-color); font-size: 1.2rem; margin-right: 5px; vertical-align: -2px;"></ion-icon> <span style="color:#aaa; margin-right: 5px;">Criado por:</span> ';
                
                gameData.creators.forEach((c, index) => {
                    const btn = document.createElement('span');
                    btn.textContent = c.name;
                    
                    // Estilo de link interativo
                    btn.style.cssText = "color: #fff; cursor: pointer; transition: 0.2s; font-weight: bold; border-bottom: 1px dashed transparent;";
                    
                    // Efeito Hover (passar o mouse)
                    btn.onmouseover = () => { 
                        btn.style.color = "var(--secondary-color)"; 
                        btn.style.borderBottom = "1px dashed var(--secondary-color)"; 
                    };
                    btn.onmouseout = () => { 
                        btn.style.color = "#fff"; 
                        btn.style.borderBottom = "1px dashed transparent"; 
                    };
                    
                    // Ação de clique para abrir o modal
                    btn.onclick = () => window.openCreatorModal(c.name);
                    
                    creatorsContainer.appendChild(btn);
                    
                    // Adiciona uma vírgula entre os nomes (exceto no último)
                    if (index < gameData.creators.length - 1) {
                        const comma = document.createElement('span');
                        comma.textContent = ', ';
                        comma.style.color = '#aaa';
                        comma.style.marginRight = '5px';
                        creatorsContainer.appendChild(comma);
                    }
                });
            } else {
                // AVISO VISUAL: Se não tiver nenhum criador, mostra isso na tela!
                creatorsContainer.innerHTML = '<span style="color: #666; font-size: 0.9rem; font-style: italic;">(Nenhum criador associado a este jogo ainda)</span>';
            }
        } else {
            console.error("⚠️ ERRO: A div 'game-creators-container' não foi encontrada no HTML!");
        }

        // ==========================================
        // STATUS PAUSADO E MÍDIAS (MANTIDO DO ORIGINAL)
        // ==========================================
        const status = gameData.status || 'available';

        if (status === 'paused') {
            const calendarWrapper = dom.calendarGrid ? dom.calendarGrid.parentNode : null;

            if (calendarWrapper) {
                calendarWrapper.style.position = 'relative'; 
                calendarWrapper.style.overflow = 'hidden'; 

                const overlay = document.createElement('div');
                overlay.style.cssText = `
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    background: rgba(0, 0, 0, 0.85); 
                    backdrop-filter: blur(4px); 
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    z-index: 50;
                    border-radius: 15px;
                `;

                overlay.innerHTML = `
                    <ion-icon name="construct-outline" style="font-size: 3.5rem; color: #ffbb00; margin-bottom: 15px;"></ion-icon>
                    <h3 style="font-family: 'Orbitron', sans-serif; color: #fff; margin-bottom: 10px; font-size: 1.5rem; text-transform: uppercase;">Jogo Pausado</h3>
                    <p style="color: #ccc; text-align: center; max-width: 80%; line-height: 1.4;">
                        Este jogo está temporariamente indisponível para novos agendamentos.<br>
                        <span style="font-size: 0.85rem; color: #777; margin-top: 10px; display: block;">Tente novamente mais tarde.</span>
                    </p>
                `;

                calendarWrapper.appendChild(overlay);

                if(dom.prevMonthBtn) dom.prevMonthBtn.style.opacity = '0';
                if(dom.nextMonthBtn) dom.nextMonthBtn.style.opacity = '0';
                
                if(dom.title) {
                    dom.title.innerHTML += ` <span style="font-size: 0.5em; vertical-align: middle; background: #ffbb00; color: #000; padding: 2px 8px; border-radius: 4px; margin-left: 10px;">PAUSADO</span>`;
                }
            }
        }

        if (gameData.galleryImages?.length > 0 && dom.carouselSection) {
            dom.carouselSection.classList.remove('hidden');
            if(dom.carouselTrack) {
                dom.carouselTrack.innerHTML = gameData.galleryImages.map(url => 
                    `<img src="${url}" class="game-carousel-img" onclick="window.open(this.src)">`
                ).join('');
            }
        }
        
        if (gameData.videoPreview && dom.trailerSection) {
            dom.trailerSection.classList.remove('hidden');
            if(dom.trailerWrapper) {
                const vid = gameData.videoPreview;
                if(vid.includes('youtu')) {
                    const vId = vid.split('v=')[1] || vid.split('/').pop();
                    dom.trailerWrapper.innerHTML = `<iframe width="100%" height="400" src="https://www.youtube.com/embed/${vId}" frameborder="0" allowfullscreen></iframe>`;
                } else {
                    dom.trailerWrapper.innerHTML = `<video src="${vid}" controls style="width:100%"></video>`;
                }
            }
        }
    }

    // =================================================================
    // 4. CALENDÁRIO
    // =================================================================
    function renderCalendar() {
        if(!dom.calendarGrid) return;
        dom.calendarGrid.innerHTML = '';
        
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth();

        dom.monthDisplay.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentDate);

        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        
        const today = new Date();
        today.setHours(0,0,0,0);
        
        for(let i=0; i<firstDay; i++) {
            dom.calendarGrid.appendChild(document.createElement('div'));
        }

        for(let d=1; d<=daysInMonth; d++) {
            const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const checkDate = new Date(y, m, d);
            
            const el = document.createElement('div');
            el.className = 'calendar-day';
            el.textContent = d;

            const adminSlots = gameData.availability ? (gameData.availability[dateStr] || []) : [];
            
            if (checkDate < today) {
                el.classList.add('disabled');
            } 
            else if (adminSlots.length > 0) {
                el.classList.add('available');
                el.onclick = () => selectDate(dateStr, el);
            } 
            else {
                el.classList.add('disabled');
            }

            if(selectedDateStr === dateStr) el.classList.add('selected');
            dom.calendarGrid.appendChild(el);
        }
    }

    // =================================================================
    // 5. SELEÇÃO DE HORÁRIO
    // =================================================================
    async function selectDate(dateStr, el) {
        document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
        el.classList.add('selected');
        selectedDateStr = dateStr;

        const parts = dateStr.split('-');
        if(dom.dateDisplay) dom.dateDisplay.textContent = `${parts[2]}/${parts[1]}/${parts[0]}`;
        
        dom.timeContainer.classList.remove('hidden');
        dom.timeGrid.innerHTML = '<div class="loader-small"></div>';

        const adminSlots = gameData.availability ? (gameData.availability[dateStr] || []) : [];
        
        // Filtra passado
        const now = new Date();
        const validSlots = adminSlots.filter(time => {
            const [h, m] = time.split(':').map(Number);
            const slotDate = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]), h, m);
            return slotDate > now;
        });

        dom.timeGrid.innerHTML = '';
        if (validSlots.length === 0) {
            dom.timeGrid.innerHTML = '<p style="color:#aaa;">Sem horários disponíveis.</p>'; 
            return;
        }

        validSlots.sort().forEach(time => {
            const btn = document.createElement('button');
            btn.className = 'time-slot-btn';
            btn.textContent = time;
            btn.onclick = () => confirmSharedBooking(time);
            dom.timeGrid.appendChild(btn);
        });
    }

// =================================================================
    // 6. REDIRECIONAR PARA PAGAMENTO (ATUALIZADO)
    // =================================================================
    async function confirmSharedBooking(time) {
        const user = auth.currentUser;
        
        // Dados para o checkout
        const checkoutPayload = {
            gameId: gameData.id,
            gameName: gameData.name,
            // Usa a capa carregada ou fallback
            cover: gameData.coverImage || 'assets/images/logo.png', 
            date: selectedDateStr,
            time: time,
            price: gameData.price || 0 // Passa o preço se existir
        };

        // Salva na memória temporária
        sessionStorage.setItem('checkoutData', JSON.stringify(checkoutPayload));

        if (!user) {
            // Se não estiver logado, salva intenção e manda pro login
            sessionStorage.setItem('pendingCheckout', JSON.stringify(checkoutPayload));
            alert("Faça login para continuar com o pagamento.");
            window.location.href = 'login.html';
            return;
        }

        // Redireciona para a tela de pagamento
        window.location.href = 'pagamento.html';
    }

    
    if(dom.prevMonthBtn) dom.prevMonthBtn.onclick = () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); };
    if(dom.nextMonthBtn) dom.nextMonthBtn.onclick = () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); };
});