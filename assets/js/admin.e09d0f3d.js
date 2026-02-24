document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. CONFIGURAÇÃO E VARIÁVEIS GLOBAIS
    // =========================================================================
    
    // Verificação de Segurança (Firebase deve estar carregado via main.js ou firebase-config.js)
    if (typeof firebase === 'undefined') {
        console.error("Firebase não encontrado!");
        return;
    }

    const db = window.db || firebase.firestore();
    const auth = window.auth || firebase.auth();
    const storage = window.storage || firebase.storage();

    // --- ESTADO GLOBAL DO APLICATIVO ---
    
    // Jogos & Mídia
    let currentGalleryUrls = []; 
    let currentSessionAssets = []; 
    let currentTags = [];
    let currentDecisions = []; // [NOVO] Array de decisões
    let allKnownTags = new Set(["Ação", "Aventura", "RPG", "Terror", "Estratégia"]);
    
    // Agenda (Separada)
    let currentAgendaGameId = null; 
    let currentAgendaData = {}; 
    let currentAdminDate = new Date(); 
    currentAdminDate.setDate(1);
    let editingDateStr = null;
    let bulkTimesArray = [];

    // Cursos & Conteúdo
    let currentCourseModules = [];
    let currentFaqs = [];

    // Variáveis Temporárias de Upload
    let tempAssetFile = null;

    // --- VERIFICAÇÃO DE AUTENTICAÇÃO ---
    const sessionData = sessionStorage.getItem('loggedInUser');
    if (!sessionData) { window.location.href = 'login.html'; return; }
    const loggedInUser = JSON.parse(sessionData);
    
    if (loggedInUser.role !== 'admin' && loggedInUser.role !== 'host') {
        alert("Acesso não autorizado."); 
        window.location.href = 'index.html'; 
        return;
    }

    // --- INTERFACE DO USUÁRIO GERAL ---
    const userGreeting = document.getElementById('user-greeting');
    if(userGreeting) userGreeting.textContent = `Olá, ${loggedInUser.name.split(' ')[0]}`;
    
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('loggedInUser'); 
        if(auth) auth.signOut(); 
        window.location.href = 'index.html';
    });
    
    document.body.addEventListener('click', (e) => {
        // Encontra o botão clicado, mesmo se o clique for no ícone <ion-icon>
        const btn = e.target.closest('button'); 
        
        if (!btn) return; // Se não for botão, ignora

        // 1. AÇÃO: AGENDA
        if (btn.classList.contains('schedule-game-trigger')) {
            e.preventDefault();
            e.stopPropagation();
            console.log("📅 Botão Agenda clicado. ID:", btn.dataset.id);
            
            if (typeof window.openScheduleModal === 'function') {
                window.openScheduleModal(btn.dataset.id);
            } else {
                console.error("Erro: Função window.openScheduleModal não encontrada.");
            }
        }

        // 2. AÇÃO: SESSÕES
        if (btn.classList.contains('sessions-game-trigger')) {
            e.preventDefault();
            e.stopPropagation();
            console.log("📋 Botão Sessões clicado. ID:", btn.dataset.id);
            
            if (typeof window.openGameSessionsModal === 'function') {
                window.openGameSessionsModal(btn.dataset.id, btn.dataset.name);
            } else {
                console.error("Erro: Função window.openGameSessionsModal não encontrada.");
            }
        }

        // 3. AÇÃO: EXCLUIR
        if (btn.classList.contains('delete-game-trigger')) {
            e.preventDefault();
            if (typeof window.openDeleteConfirmModal === 'function') {
                window.openDeleteConfirmModal(btn.dataset.id, btn.dataset.name);
            }
        }

        // 4. AÇÃO: EDITAR (Garantia extra)
        if (btn.classList.contains('edit-game-trigger')) {
            e.preventDefault();
            if (typeof window.openGameModal === 'function') {
                window.openGameModal(btn.dataset.id);
            }
        }
    });

    // =================================================================
    // LÓGICA DE CATEGORIAS / PACOTES DE PREÇO
    // =================================================================
    let currentGameCategories = []; // Variável global para guardar os pacotes

    window.openCategoryModal = () => {
        document.getElementById('category-modal').classList.remove('hidden');
        document.getElementById('cat-name').value = '';
        document.getElementById('cat-price').value = '';
        document.getElementById('cat-duration').value = '';
    };

    window.closeCategoryModal = () => {
        document.getElementById('category-modal').classList.add('hidden');
    };

    window.addCategory = () => {
        const name = document.getElementById('cat-name').value.trim();
        const price = parseFloat(document.getElementById('cat-price').value);
        const duration = parseInt(document.getElementById('cat-duration').value);

        if(!name || isNaN(price) || isNaN(duration)) {
            return alert("Preencha o nome, o valor e a duração corretamente.");
        }

        currentGameCategories.push({ 
            id: Date.now().toString(),
            name: name, 
            price: price, 
            duration: duration 
        });

        window.renderCategories();
        window.closeCategoryModal();
    };

    window.removeCategory = (index) => {
        currentGameCategories.splice(index, 1);
        window.renderCategories();
    };

    window.renderCategories = () => {
        const list = document.getElementById('game-categories-list');
        if(!list) return;
        list.innerHTML = '';
        
        if(currentGameCategories.length === 0) {
            list.innerHTML = '<p style="font-size:0.8rem; color:#666; text-align:center;">Nenhum pacote extra. O valor padrão será a única opção.</p>';
            return;
        }

        currentGameCategories.forEach((cat, i) => {
            const hostShare = (cat.price * 0.70).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            list.innerHTML += `
                <div style="background:#222; padding:10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; border-left:3px solid var(--secondary-color);">
                    <div>
                        <strong style="color:#fff; font-size:0.9rem;">${cat.name}</strong><br>
                        <span style="color:#00ff88; font-size:0.85rem; font-weight:bold;">R$ ${cat.price.toFixed(2)}</span> 
                        <span style="color:#aaa; font-size:0.8rem;">| <ion-icon name="time-outline"></ion-icon> ${cat.duration} min</span>
                        <div style="font-size:0.7rem; color:#888; margin-top:2px;">Seu repasse: ${hostShare}</div>
                    </div>
                    <button type="button" class="submit-btn small-btn danger-btn" onclick="window.removeCategory(${i})" style="padding:4px 8px; min-width:auto;">
                        <ion-icon name="trash-outline"></ion-icon>
                    </button>
                </div>
            `;
        });
    };

    // --- NAVEGAÇÃO ENTRE ABAS DO DASHBOARD ---
    window.switchAdminTab = (tabId) => {
        document.querySelectorAll('.dashboard-section').forEach(s => s.classList.add('hidden-section'));
        const target = document.getElementById(tabId);
        if(target) target.classList.remove('hidden-section');
        
        document.querySelectorAll('.dashboard-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`.dashboard-tabs .tab-btn[onclick*="${tabId}"]`);
        if (activeBtn) activeBtn.classList.add('active');

        // Carregamento Lazy (sob demanda)
        if (tabId === 'user-management') loadAllUsers();
        if (tabId === 'game-management') loadAllGames();
        if (tabId === 'content-management') { loadFAQs(); loadAboutText(); }
        if (tabId === 'course-management') loadCourses();
    };

    // =========================================================================
    // 2. NOVA FUNÇÃO: PREVIEW DO TIMER (VISUAL)
    // =========================================================================
window.updateTimerPreview = () => {
        const font = document.getElementById('edit-timer-font')?.value;
        const color = document.getElementById('edit-timer-color')?.value;
        const type = document.getElementById('edit-timer-type')?.value;
        const el = document.getElementById('timer-preview-text');
        
        if(el && font) {
            // Aplica a fonte
            el.style.fontFamily = font;
            
            // Aplica a cor (texto e sombra/glow)
            el.style.color = color;
            el.style.textShadow = `0 0 20px ${color}`; // Aumenta o brilho baseado na cor
            
            // Muda o texto
            el.textContent = (type === 'progressive') ? "00:00" : "60:00";
        }
    };

// =========================================================================
    // LÓGICA DE DECISÕES DINÂMICAS (3 a 9 Opções)
    // =========================================================================

    const optionsContainer = document.getElementById('decision-options-container');

    // 1. Renderiza os inputs iniciais (ou recarrega existentes na edição)
    window.renderDecisionInputs = (existingOptions = []) => {
        if (!optionsContainer) return;
        optionsContainer.innerHTML = ''; // Limpa tudo

        // Lógica: Se é novo, começa com 3. Se editando, mostra os que tem + 1 vazio (até max 9).
        let count = existingOptions.length;
        if (count < 3) count = 3; // Mínimo 3 campos visíveis
        else if (count < 9) count++; // Se tem menos que 9, adiciona um extra para digitar

        // Garante limite de 9
        const totalToRender = Math.min(count, 9);

        // Cria os inputs
        for (let i = 0; i < totalToRender; i++) {
            createOptionInput(existingOptions[i] || '');
        }
    };

    // 2. Cria um input individual e adiciona o evento de "Auto-Criação"
    function createOptionInput(value) {
        if (optionsContainer.children.length >= 9) return; // Trava de segurança

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'admin-input decision-opt-input';
        input.placeholder = `Opção ${optionsContainer.children.length + 1}`;
        input.value = value;
        
        // EVENTO MÁGICO: Quando digitar no último campo, cria um novo
        input.addEventListener('input', (e) => {
            const allInputs = optionsContainer.querySelectorAll('input');
            const isLast = e.target === allInputs[allInputs.length - 1];
            
            // Se estou digitando no último E ele não está vazio E ainda cabe mais inputs
            if (isLast && e.target.value.trim() !== '' && allInputs.length < 9) {
                createOptionInput('');
            }
        });

        optionsContainer.appendChild(input);
    }

    // 3. Botão Adicionar Decisão (Salvar na lista temporária)
    const addDecBtn = document.getElementById('add-decision-btn');
    if(addDecBtn) {
        addDecBtn.onclick = () => {
            const qInput = document.getElementById('decision-question-input');
            const q = qInput.value.trim();
            
            // Pega todos os inputs criados dinamicamente
            const inputs = optionsContainer.querySelectorAll('.decision-opt-input');
            
            // Filtra apenas os que têm texto
            const validOptions = Array.from(inputs)
                .map(input => input.value.trim())
                .filter(val => val !== '');

            // Validações
            if (!q) return alert("Por favor, preencha a pergunta.");
            if (validOptions.length < 3) return alert("Você precisa preencher no mínimo 3 opções.");

            // Cria o objeto
            const newDecision = {
                id: Date.now().toString(),
                question: q,
                options: validOptions
            };

            currentDecisions.push(newDecision);
            window.renderDecisionsList();
            
            // Limpa o formulário para a próxima
            qInput.value = ''; 
            window.renderDecisionInputs(); // Reseta para 3 campos vazios
        };
    }

    // 4. Renderizar a lista de decisões salvas (visualização lateral)
    window.renderDecisionsList = () => {
        const list = document.getElementById('decisions-list-container'); // ID corrigido conforme HTML novo
        if(!list) return;
        list.innerHTML = '';

        if(currentDecisions.length === 0) {
            list.innerHTML = '<p style="font-size:0.8rem; opacity:0.5; text-align:center;">Nenhuma decisão salva.</p>';
            return;
        }

        currentDecisions.forEach((d, i) => {
            // Cria pílulas visuais para as opções
            const optsHtml = d.options.map(o => `<span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-size:0.75rem;">${o}</span>`).join(' ');
            
            list.innerHTML += `
            <div style="background:#222; padding:8px; margin-bottom:5px; border-left:3px solid var(--secondary-color); border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
                <div style="overflow:hidden;">
                    <div style="font-weight:bold; font-size:0.9rem; margin-bottom:3px;">${d.question}</div>
                    <div style="display:flex; flex-wrap:wrap; gap:3px;">${optsHtml}</div>
                </div>
                <div style="display:flex; gap:5px; min-width:60px; justify-content:flex-end;">
                    <button onclick="window.loadDecisionToEdit(${i})" style="color:#fff; background:none; border:none; cursor:pointer;" title="Editar"><ion-icon name="create-outline"></ion-icon></button>
                    <button onclick="window.removeDecision(${i})" style="color:#ff4444; background:none; border:none; cursor:pointer;" title="Excluir"><ion-icon name="trash-outline"></ion-icon></button>
                </div>
            </div>`;
        });
    };

    // 5. Remover e Editar
    window.removeDecision = (i) => { 
        currentDecisions.splice(i, 1); 
        window.renderDecisionsList(); 
    };

    window.loadDecisionToEdit = (i) => {
        const d = currentDecisions[i];
        const qInput = document.getElementById('decision-question-input');
        
        if(qInput) qInput.value = d.question;
        
        // Aqui está o segredo: recarrega as opções nos inputs dinâmicos
        window.renderDecisionInputs(d.options);
        
        // Remove da lista (o usuário deve clicar em "Adicionar" novamente para salvar as alterações)
        window.removeDecision(i); 
    };

    // =========================================================================
    // 4. MODAL DE SESSÕES (Histórico e Futuras)
    // =========================================================================
    const sessionsModal = document.getElementById('game-sessions-modal');
    const sessionsList = document.getElementById('game-sessions-list');

    window.openGameSessionsModal = async (gameId, gameName) => {
        if(!sessionsModal) return;
        
        document.getElementById('sessions-game-name').textContent = gameName;
        sessionsList.innerHTML = '<div class="loader"></div>';
        sessionsModal.classList.remove('hidden');

        try {
            const snapshot = await db.collection('bookings')
                .where('gameId', '==', gameId)
                .get();

            sessionsList.innerHTML = '';
            
            if (snapshot.empty) {
                sessionsList.innerHTML = '<p style="text-align:center; padding:1rem; opacity:0.6;">Nenhuma sessão agendada.</p>';
                return;
            }

            let bookings = [];
            snapshot.forEach(doc => bookings.push({ id: doc.id, ...doc.data() }));

            // Ordena
            bookings.sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

            let hasFuture = false;
            const now = new Date();

            bookings.forEach(bk => {
                const sessionDate = new Date(`${bk.date}T${bk.time}`);
                const tolerance = new Date(now.getTime() - (2 * 60 * 60 * 1000));

                if (sessionDate >= tolerance) {
                    hasFuture = true;
                    const dateFmt = sessionDate.toLocaleDateString('pt-BR');
                    
                    const item = document.createElement('div');
                    item.className = 'booking-item';
                    item.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px; margin-bottom:8px; border-radius:6px; border-left: 3px solid var(--secondary-color);";
                    
                    item.innerHTML = `
                        <div style="font-size:0.9rem;">
                            <div style="font-weight:bold; color:#fff;">${dateFmt} às ${bk.time}</div>
                            <div style="font-size:0.8rem; color:#aaa;">Cliente: ${bk.userName || 'Convidado'}</div>
                        </div>
                        <button class="submit-btn small-btn" onclick="window.location.href='sala-host.html?bookingId=${bk.id}'" style="background:var(--secondary-color); color:#fff; border:none;">
                            Entrar <ion-icon name="arrow-forward"></ion-icon>
                        </button>
                    `;
                    sessionsList.appendChild(item);
                }
            });

            if (!hasFuture) {
                sessionsList.innerHTML = '<p style="text-align:center; padding:1rem; opacity:0.6;">Sem sessões futuras.</p>';
            }

        } catch (e) {
            console.error(e);
            sessionsList.innerHTML = '<p style="color:red; text-align:center;">Erro ao carregar sessões.</p>';
        }
    };

    const sessionsModalObj = document.getElementById('game-sessions-modal');
    
    if (sessionsModalObj) {
        // 1. Procura o botão "X" no topo (classe padrão close-overlay-btn)
        const closeX = sessionsModalObj.querySelector('.close-overlay-btn');
        if (closeX) {
            closeX.onclick = () => sessionsModalObj.classList.add('hidden');
        }

        // 2. Procura qualquer botão no rodapé que diga "Fechar" ou "Sair"
        const footerBtns = sessionsModalObj.querySelectorAll('.modal-footer button, button');
        footerBtns.forEach(btn => {
            // Verifica se é um botão de fechar (pelo texto ou classe)
            if (btn.textContent.includes('Fechar') || btn.textContent.includes('Sair') || btn.classList.contains('close-modal-btn')) {
                btn.onclick = () => sessionsModalObj.classList.add('hidden');
            }
        });

        // 3. (Opcional) Fechar ao clicar fora do conteúdo (no fundo escuro)
        sessionsModalObj.addEventListener('click', (e) => {
            if (e.target === sessionsModalObj) {
                sessionsModalObj.classList.add('hidden');
            }
        });
    }

    const closeSess = () => sessionsModal.classList.add('hidden');
    if(document.getElementById('close-sessions-modal')) document.getElementById('close-sessions-modal').onclick = closeSess;
    if(document.getElementById('close-sessions-btn')) document.getElementById('close-sessions-btn').onclick = closeSess;

    // =========================================================================
    // 5. GERENCIAMENTO DE USUÁRIOS
    // =========================================================================
    const userTableBody = document.getElementById('user-table-body');
    const userSearchInput = document.getElementById('user-search-input');
    const editUserModal = document.getElementById('edit-user-modal');
    const editUserForm = document.getElementById('edit-user-form');

    async function loadAllUsers() {
        if(!userTableBody) return;
        userTableBody.innerHTML = '<tr><td colspan="4"><div class="loader"></div></td></tr>';
        try {
            const snapshot = await db.collection('users').get();
            userTableBody.innerHTML = '';
            if (snapshot.empty) { userTableBody.innerHTML = '<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>'; return; }
            
            snapshot.forEach(doc => {
                const user = doc.data();
                const tr = document.createElement('tr');
                let roleLabel = user.role === 'admin' ? '👑 Admin' : (user.role === 'host' ? '🎭 Host' : '👤 Jogador');
                tr.innerHTML = `
                    <td>${user.name || '---'}</td>
                    <td>${user.email || '---'}</td>
                    <td>${roleLabel}</td>
                    <td><button class="submit-btn small-btn edit-user-trigger" data-id="${doc.id}" data-name="${user.name}" data-role="${user.role}"><ion-icon name="create-outline"></ion-icon> Editar</button></td>
                `;
                userTableBody.appendChild(tr);
            });
            document.querySelectorAll('.edit-user-trigger').forEach(btn => btn.addEventListener('click', openEditUserModal));
            if(userSearchInput) triggerUserSearch();
        } catch (e) { console.error(e); }
    }

    function openEditUserModal(e) {
        const btn = e.currentTarget;
        document.getElementById('edit-user-id').value = btn.dataset.id;
        document.getElementById('edit-user-name').value = btn.dataset.name;
        document.getElementById('edit-user-role').value = btn.dataset.role;
        editUserModal.classList.remove('hidden');
    }

    if(userSearchInput) userSearchInput.addEventListener('input', triggerUserSearch);
    function triggerUserSearch() {
        const term = userSearchInput.value.toLowerCase();
        userTableBody.querySelectorAll('tr').forEach(row => {
            if(row.cells.length < 2) return;
            const txt = row.innerText.toLowerCase();
            row.style.display = txt.includes(term) ? '' : 'none';
        });
    }

    if(editUserForm) editUserForm.onsubmit = async (e) => {
        e.preventDefault();
        try {
            await db.collection('users').doc(document.getElementById('edit-user-id').value).update({
                name: document.getElementById('edit-user-name').value,
                role: document.getElementById('edit-user-role').value
            });
            alert("Usuário salvo!"); editUserModal.classList.add('hidden'); loadAllUsers();
        } catch(e) { alert("Erro ao salvar usuário."); }
    };

    if(document.getElementById('delete-user-btn')) document.getElementById('delete-user-btn').onclick = async () => {
        const uid = document.getElementById('edit-user-id').value;
        if(uid === loggedInUser.username) return alert("Não pode excluir a si mesmo.");
        if(confirm("Excluir este usuário?")) {
            await db.collection('users').doc(uid).delete();
            editUserModal.classList.add('hidden'); loadAllUsers();
        }
    };
    
    if(document.getElementById('close-user-modal')) document.getElementById('close-user-modal').onclick = () => editUserModal.classList.add('hidden');
    if(document.getElementById('cancel-edit-btn')) document.getElementById('cancel-edit-btn').onclick = () => editUserModal.classList.add('hidden');


    // =========================================================================
    // 6. GERENCIAMENTO DE CONTEÚDO (FAQ & SOBRE)
    // =========================================================================
    const faqList = document.getElementById('faq-list-admin');
    const faqModal = document.getElementById('faq-modal');
    const faqForm = document.getElementById('faq-form');

    document.querySelectorAll('.content-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(e.target.closest('#schedule-content')) return; 
            document.querySelectorAll('.content-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            document.querySelectorAll('.content-sub-section').forEach(s => s.classList.add('hidden-section'));
            const targetId = e.target.dataset.target;
            if(document.getElementById(targetId)) document.getElementById(targetId).classList.remove('hidden-section');
        });
    });

    async function loadFAQs() {
        if(!faqList) return;
        try {
            const doc = await db.collection('siteContent').doc('faq').get();
            currentFaqs = doc.exists ? (doc.data().items || []) : [];
            faqList.innerHTML = '';
            currentFaqs.forEach((faq, i) => {
                const div = document.createElement('div'); div.className = 'booking-item';
                div.innerHTML = `<div class="booking-item-info"><strong>${faq.question}</strong></div><button class="submit-btn small-btn" onclick="openFaqModal(${i})">Editar</button>`;
                faqList.appendChild(div);
            });
        } catch(e) {}
    }

    window.openFaqModal = (index = null) => {
        document.getElementById('faq-id').value = index !== null ? index : '';
        const delBtn = document.getElementById('delete-faq-btn');
        if(index !== null) {
            document.getElementById('faq-question').value = currentFaqs[index].question;
            document.getElementById('faq-answer').value = currentFaqs[index].answer;
            if(delBtn) delBtn.classList.remove('hidden');
        } else {
            faqForm.reset(); 
            if(delBtn) delBtn.classList.add('hidden');
        }
        faqModal.classList.remove('hidden');
    };

    if(faqForm) faqForm.onsubmit = async (e) => {
        e.preventDefault();
        const idx = document.getElementById('faq-id').value;
        const item = { question: document.getElementById('faq-question').value, answer: document.getElementById('faq-answer').value };
        if(idx !== '') currentFaqs[idx] = item; else currentFaqs.push(item);
        await db.collection('siteContent').doc('faq').set({ items: currentFaqs });
        faqModal.classList.add('hidden'); loadFAQs();
    };

    if(document.getElementById('add-faq-btn')) document.getElementById('add-faq-btn').onclick = () => window.openFaqModal(null);
    if(document.getElementById('delete-faq-btn')) document.getElementById('delete-faq-btn').onclick = async () => {
        const idx = document.getElementById('faq-id').value;
        currentFaqs.splice(idx, 1);
        await db.collection('siteContent').doc('faq').set({ items: currentFaqs });
        faqModal.classList.add('hidden'); loadFAQs();
    };
    if(document.getElementById('close-faq-modal')) document.getElementById('close-faq-modal').onclick = () => faqModal.classList.add('hidden');
    if(document.getElementById('cancel-faq-btn')) document.getElementById('cancel-faq-btn').onclick = () => faqModal.classList.add('hidden');

    async function loadAboutText() {
        try { const doc = await db.collection('siteContent').doc('about').get(); if(doc.exists) document.getElementById('about-history').value = doc.data().text || ''; } catch(e){}
    }
    const aboutForm = document.getElementById('about-form');
    if(aboutForm) aboutForm.onsubmit = async (e) => {
        e.preventDefault();
        await db.collection('siteContent').doc('about').set({ text: document.getElementById('about-history').value });
        alert("Sobre atualizado!");
    };

    // =========================================================================
    // 7. GERENCIAMENTO DE CURSOS
    // =========================================================================
    const courseList = document.getElementById('course-list-admin');
    const courseModal = document.getElementById('course-modal');
    const courseForm = document.getElementById('course-form');
    const modulesContainer = document.getElementById('modules-container');

    async function loadCourses() {
        if(!courseList) return;
        courseList.innerHTML = '<div class="loader"></div>';
        try {
            const snap = await db.collection('courses').get();
            courseList.innerHTML = '';
            if(snap.empty) { courseList.innerHTML = '<p>Nenhum curso.</p>'; return; }
            snap.forEach(doc => {
                const c = doc.data();
                const card = document.createElement('div'); card.className = 'game-card';
                card.innerHTML = `<img src="${c.coverImage||'assets/images/logo.png'}" class="game-card-img" style="height:150px"><div class="game-card-content"><h3>${c.title}</h3><p>${(c.modules||[]).length} Módulos</p><button class="submit-btn small-btn" onclick="openCourseModal('${doc.id}')">Editar</button></div>`;
                courseList.appendChild(card);
            });
        } catch(e) {}
    }

    window.openCourseModal = async (id = null) => {
        document.getElementById('course-id').value = id || '';
        document.getElementById('course-title').value = '';
        document.getElementById('course-desc').value = '';
        document.getElementById('course-cover').value = '';
        currentCourseModules = [];
        
        const delBtn = document.getElementById('delete-course-btn');
        if(id) {
            if(delBtn) delBtn.classList.remove('hidden');
            const doc = await db.collection('courses').doc(id).get();
            if(doc.exists) {
                const d = doc.data();
                document.getElementById('course-title').value = d.title;
                document.getElementById('course-desc').value = d.description;
                document.getElementById('course-cover').value = d.coverImage;
                currentCourseModules = d.modules || [];
            }
        } else {
            if(delBtn) delBtn.classList.add('hidden');
        }
        renderModulesInput();
        courseModal.classList.remove('hidden');
    };

    function renderModulesInput() {
        if(!modulesContainer) return;
        modulesContainer.innerHTML = '';
        currentCourseModules.forEach((mod, mi) => {
            const div = document.createElement('div'); div.style.cssText = 'background:rgba(0,0,0,0.2);padding:1rem;margin-bottom:1rem;border-radius:5px;';
            div.innerHTML = `<div style="display:flex;gap:10px;margin-bottom:10px;"><strong style="color:var(--secondary-color)">Módulo ${mi+1}</strong><input type="text" value="${mod.title}" class="mod-title" data-i="${mi}" style="flex:1"><button type="button" class="submit-btn danger-btn small-btn" onclick="removeModule(${mi})">X</button></div><div class="v-list-${mi}"></div><button type="button" class="submit-btn small-btn secondary-btn" onclick="addVideo(${mi})" style="width:100%">+ Aula</button>`;
            const vList = div.querySelector(`.v-list-${mi}`);
            (mod.videos||[]).forEach((v, vi) => {
                const row = document.createElement('div'); row.style.cssText='display:flex;gap:5px;margin-top:5px;';
                row.innerHTML = `<input type="text" value="${v.title}" placeholder="Título" onchange="updV(${mi},${vi},'title',this.value)"><input type="text" value="${v.url}" placeholder="Link" onchange="updV(${mi},${vi},'url',this.value)"><button type="button" class="submit-btn danger-btn small-btn" onclick="remV(${mi},${vi})">X</button>`;
                vList.appendChild(row);
            });
            modulesContainer.appendChild(div);
        });
        document.querySelectorAll('.mod-title').forEach(i => i.oninput = (e) => currentCourseModules[e.target.dataset.i].title = e.target.value);
    }

    // Helpers Cursos
    window.addModule = () => { currentCourseModules.push({title:'', videos:[]}); renderModulesInput(); };
    window.removeModule = (i) => { if(confirm('Remover?')){currentCourseModules.splice(i,1); renderModulesInput();} };
    window.addVideo = (i) => { currentCourseModules[i].videos.push({title:'', url:''}); renderModulesInput(); };
    window.remV = (mi, vi) => { currentCourseModules[mi].videos.splice(vi, 1); renderModulesInput(); };
    window.updV = (mi, vi, f, v) => { currentCourseModules[mi].videos[vi][f] = v; };

    if(document.getElementById('add-module-btn')) document.getElementById('add-module-btn').onclick = window.addModule;
    if(document.getElementById('add-course-btn')) document.getElementById('add-course-btn').onclick = () => window.openCourseModal(null);
    if(courseForm) courseForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('course-id').value;
        const data = { title: document.getElementById('course-title').value, description: document.getElementById('course-desc').value, coverImage: document.getElementById('course-cover').value, modules: currentCourseModules, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
        try { if(id) await db.collection('courses').doc(id).update(data); else await db.collection('courses').add(data); alert('Curso salvo!'); courseModal.classList.add('hidden'); loadCourses(); } catch(e) { alert('Erro'); }
    };
    if(document.getElementById('delete-course-btn')) document.getElementById('delete-course-btn').onclick = async () => { if(confirm('Excluir?')) { await db.collection('courses').doc(document.getElementById('course-id').value).delete(); courseModal.classList.add('hidden'); loadCourses(); }};
    if(document.getElementById('close-course-modal')) document.getElementById('close-course-modal').onclick = () => courseModal.classList.add('hidden');
    if(document.getElementById('cancel-course-btn')) document.getElementById('cancel-course-btn').onclick = () => courseModal.classList.add('hidden');


    // =========================================================================
    // 8. GERENCIAMENTO DE JOGOS (CRUD & CONFIG)
    // =========================================================================
    const gameListContainer = document.getElementById('game-list-container');
    const createGameModal = document.getElementById('create-game-modal');
    const createGameForm = document.getElementById('create-game-form');
    const agendaModal = document.getElementById('agenda-modal');

    // Funções de Renderização Visual
    window.renderGallery = () => {
        const grid = document.getElementById('gallery-preview-grid');
        if(!grid) return;
        grid.innerHTML = '';
        currentGalleryUrls.forEach((url, i) => {
            grid.innerHTML += `<div class="gallery-item"><img src="${url}"><button type="button" class="gallery-remove-btn" onclick="removeGalleryItem(${i})">✕</button></div>`;
        });
    };

    window.removeGalleryItem = (i) => { currentGalleryUrls.splice(i, 1); window.renderGallery(); };
    window.removeSessionAsset = (i) => { currentSessionAssets.splice(i, 1); window.renderSessionAssets(); };
    window.removeTag = (i) => { currentTags.splice(i, 1); renderTags(); };

    function renderTags() {
        const wrapper = document.getElementById('tags-wrapper');
        const input = document.getElementById('tag-input-field');
        if(!wrapper) return;
        wrapper.querySelectorAll('.tag-capsule').forEach(e => e.remove());
        currentTags.forEach((t, i) => {
            const el = document.createElement('div'); el.className = 'tag-capsule';
            el.innerHTML = `<span>${t}</span><span class="close-tag" onclick="removeTag(${i})">&times;</span>`;
            wrapper.insertBefore(el, input);
        });
    }

// Carregar Lista de Jogos
    async function loadAllGames() {
        const container = document.getElementById('game-list-container');
        if (!container) return;
        container.innerHTML = '<div class="loader"></div>';

        try {
            const snap = await db.collection('games').orderBy('createdAt', 'desc').get();
            container.innerHTML = '';
            
            if(snap.empty) { container.innerHTML = '<p>Nenhum jogo.</p>'; return; }

            // Pegar a data de hoje no formato YYYY-MM-DD para comparação
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const todayStr = `${yyyy}-${mm}-${dd}`;

            // 1. Verifica em paralelo se cada jogo possui sessões futuras agendadas
            const gamesWithSessionStatus = await Promise.all(snap.docs.map(async (doc) => {
                const g = doc.data();
                
                // Busca todas as sessões desse jogo
                const sessionsSnap = await db.collection('bookings')
                                           .where('gameId', '==', doc.id)
                                           .get();
                
                // Filtro via JavaScript (evita erros de Indexação do Firebase)
                // Retorna 'true' se encontrar QUALQUER sessão com data maior ou igual a hoje
                const hasFutureSessions = sessionsSnap.docs.some(sessionDoc => {
                    const sessionData = sessionDoc.data();
                    // Compara a string de data salva com a data de hoje
                    return sessionData.date && sessionData.date >= todayStr;
                });
                                           
                return {
                    id: doc.id,
                    data: g,
                    hasSessions: hasFutureSessions
                };
            }));

            // 2. Renderiza os cards baseados na verificação
            gamesWithSessionStatus.forEach(gameInfo => {
                const docId = gameInfo.id;
                const g = gameInfo.data;
                const hasSessions = gameInfo.hasSessions;

                // Monta o botão de sessões de acordo com o status
                const sessionsButtonHtml = hasSessions 
                    ? `<button class="submit-btn small-btn sessions-game-trigger" data-id="${docId}" data-name="${g.name}" style="background:var(--secondary-color);">Sessões</button>`
                    : `<button class="submit-btn small-btn" disabled style="background:#333; color:#666; cursor:not-allowed;" title="Nenhuma sessão futura agendada">Sem Sessões</button>`;

                const card = document.createElement('div'); 
                card.className = 'game-card';
                card.innerHTML = `
                    <div style="position:relative; height:150px;">
                        <img src="${g.coverImage || 'assets/images/logo.png'}" style="width:100%; height:100%; object-fit:cover;">
                        <button class="delete-game-trigger delete-corner-btn" data-id="${docId}" data-name="${g.name}"><ion-icon name="trash-outline"></ion-icon></button>
                    </div>
                    <div class="game-card-content">
                        <h3 style="margin-bottom:5px;">${g.name}</h3>
                        <small>
                            ${g.status === 'available' 
                                ? '<span style="color:#00ff88">● Disponível</span>' 
                                : g.status === 'paused' 
                                    ? '<span style="color:#ffbb00">● Pausado</span>' 
                                    : '<span style="color:#aaaaaa">● Rascunho</span>'
                            }
                        </small>                        
                        
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
                            <button class="submit-btn small-btn edit-game-trigger" data-id="${docId}">Editar</button>
                            <button class="submit-btn small-btn schedule-game-trigger" data-id="${docId}" style="background:#444;">Agenda</button>
                            
                            ${sessionsButtonHtml}
                            
                            <button class="submit-btn small-btn test-room-trigger" data-id="${docId}" data-name="${g.name}" style="background:rgba(0,255,136,0.1); color:#00ff88; border:1px solid #00ff88; width:100%;">
                                <ion-icon name="flask-outline"></ion-icon> Testar Sala
                            </button>
                        </div>
                    </div>`;
                container.appendChild(card);
            });
        } catch(e) { 
            console.error(e); 
            container.innerHTML = '<p>Erro ao carregar jogos.</p>'; 
        }
    }

    // =================================================================
    // CRIAR SESSÃO DE TESTE
    // =================================================================
    window.createTestSession = async (gameId) => {
        if (!gameId) {
            alert("Erro: ID do jogo não encontrado no botão.");
            return;
        }

        const user = window.auth.currentUser || firebase.auth().currentUser;
        if (!user) return alert("Login necessário.");
        
        try {
            // Cria a sessão com o gameId ATRELADO!
            const ref = await db.collection('sessions').add({
                gameId: gameId,          // Isso resolve o problema!
                hostId: user.uid,
                status: 'scheduled',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                clientName: "Teste Admin",
                timerCurrent: 0,
                timerStatus: 'paused'
            });
            
            // Abre a sala-host em uma nova aba
            window.open(`sala-host.html?sessionId=${ref.id}`, '_blank');
            
        } catch (e) {
            console.error(e);
            alert("Erro ao criar sessão de teste.");
        }
    };

    // =========================================================================
    // CORREÇÃO: EVENT LISTENER UNIFICADO (DELEGAÇÃO DE EVENTOS)
    // =========================================================================
    if (gameListContainer) {
        gameListContainer.addEventListener('click', (e) => {
            // Usa .closest para pegar o botão mesmo se clicar no ícone ou texto dentro dele
            const editBtn = e.target.closest('.edit-game-trigger');
            const agendaBtn = e.target.closest('.schedule-game-trigger');
            const sessionsBtn = e.target.closest('.sessions-game-trigger'); // O erro provavelmente estava aqui (falta de captura)
            const testBtn = e.target.closest('.test-room-trigger');
            const delBtn = e.target.closest('.delete-game-trigger');

            // 1. Botão EDITAR
            if (editBtn) {
                e.preventDefault();
                window.openGameModal(editBtn.dataset.id);
            }

            // 2. Botão AGENDA (Calendário)
            if (agendaBtn) {
                e.preventDefault();
                console.log("📅 Abrindo agenda para:", agendaBtn.dataset.id); // Debug
                window.openScheduleModal(agendaBtn.dataset.id);
            }

            // 3. Botão SESSÕES (Lista de bookings)
            if (sessionsBtn) {
                e.preventDefault();
                console.log("📋 Abrindo sessões para:", sessionsBtn.dataset.id); // Debug
                // Verifica se a função existe antes de chamar
                if (typeof window.openGameSessionsModal === 'function') {
                    window.openGameSessionsModal(sessionsBtn.dataset.id, sessionsBtn.dataset.name);
                } else {
                    console.error("Função openGameSessionsModal não encontrada!");
                }
            }

            // 4. Botão TESTAR SALA
            if (testBtn) {
                e.preventDefault();
                window.createFixedTestRoom(testBtn.dataset.id, testBtn.dataset.name);
            }

            // 5. Botão EXCLUIR
            if (delBtn) {
                e.preventDefault();
                window.openDeleteConfirmModal(delBtn.dataset.id, delBtn.dataset.name);
            }
        });
    }

    // =================================================================
    // ABRIR MODAL DE JOGO
    // =================================================================
    window.openGameModal = async (gameId = null) => {
        const modal = document.getElementById('game-modal') || document.getElementById('create-game-modal');
        if (!modal) return console.error("Modal de jogo não encontrado.");
        
        modal.classList.remove('hidden');

        // 1. Reset Geral do Formulário
        const form = document.getElementById('create-game-form');
        if (form) form.reset();
        
        window.calculateHostEarnings();
        document.getElementById('game-id').value = gameId || '';
        
        // 2. Reset Listas Visuais e Globais
        const assetsList = document.getElementById('assets-crud-list');
        if(assetsList) assetsList.innerHTML = '<p style="text-align:center; opacity:0.5; padding:10px;">Nenhuma mídia adicionada.</p>';
        
        const galleryGrid = document.getElementById('gallery-preview-grid');
        if(galleryGrid) galleryGrid.innerHTML = '';

        // Reset Globais
        currentSessionAssets = [];
        currentDecisions = [];
        currentGalleryUrls = [];
        currentTags = [];
        currentGameCategories = [];
        
        // Reset Decisões (Função Dinâmica)
        if(typeof window.renderDecisionInputs === 'function') window.renderDecisionInputs(); 
        
        // Reset Vida Extra UI
        const elCheck = document.getElementById('check-extra-life');
        const elHiddenUrl = document.getElementById('extra-life-media-url');
        const elPreview = document.getElementById('el-selected-preview');
        
        if (elCheck) {
            elCheck.checked = false;
            window.toggleExtraLifeSection(); // Esconde a área
        }
        if (elHiddenUrl) elHiddenUrl.value = '';
        if (elPreview) elPreview.classList.add('hidden');
        
        // Reset Uploads Visuais (Capa e Trailer)
        const coverPreview = document.getElementById('admin-cover-preview');
        if(coverPreview) { coverPreview.src = ''; coverPreview.style.display = 'none'; }
        
        const trailerStatus = document.getElementById('trailer-status');
        if(trailerStatus) trailerStatus.textContent = '';

        if (d.pricingCategories) { 
        currentGameCategories = d.pricingCategories; 
        if(typeof window.renderCategories === 'function') window.renderCategories(); 
    }

        // Reset Tags
        if(typeof renderTags === 'function') renderTags();

        // Títulos e Botões
        const modalTitle = document.getElementById('game-modal-title');
        const deleteBtn = document.getElementById('delete-game-btn');

        if (gameId) {
            // --- MODO EDIÇÃO ---
            if(modalTitle) modalTitle.textContent = "Editar Jogo";
            if(deleteBtn) {
                deleteBtn.classList.remove('hidden');
                deleteBtn.onclick = () => window.openDeleteConfirmModal(gameId, document.getElementById('new-game-name').value);
            }

            try {
                const doc = await db.collection('games').doc(gameId).get();
                if (doc.exists) {
                    const d = doc.data(); // <--- AQUI É ONDE 'd' É DEFINIDO
                    
                    // Helpers de preenchimento
                    const setVal = (id, v) => { const el = document.getElementById(id); if(el) el.value = v || ''; };
                    
                    // Preencher Campos Básicos
                    setVal('new-game-name', d.name);
                    setVal('new-game-status', d.status);
                    setVal('new-game-price', d.price);
                    setVal('new-game-duration', d.sessionDuration);
                    setVal('new-game-max-players', d.maxPlayers);
                    setVal('new-game-short-desc', d.shortDescription);
                    setVal('new-game-full-desc', d.fullDescription || d.longDescription);
                    setVal('new-game-price', d.price);
                    
                    // Capa
                    setVal('new-game-cover', d.coverImage);
                    if(d.coverImage && coverPreview) {
                        coverPreview.src = d.coverImage;
                        coverPreview.style.display = 'block';
                    }

                    // Trailer
                    setVal('new-game-trailer', d.videoPreview);
                    if(d.videoPreview && trailerStatus) trailerStatus.textContent = "Vídeo já cadastrado.";

                    // Arrays (Tags, Galeria, Assets, Decisões)
                    if (d.tags) { currentTags = d.tags; if(typeof renderTags === 'function') renderTags(); }
                    
                    if (d.galleryImages) { 
                        currentGalleryUrls = d.galleryImages; 
                        if(typeof window.renderGallery === 'function') window.renderGallery(); 
                    }
                    
                    if (d.sessionAssets) { 
                        currentSessionAssets = d.sessionAssets; 
                        if(typeof window.renderAssetsList === 'function') window.renderAssetsList(); 
                    }
                    
                    if (d.decisions) { 
                        currentDecisions = d.decisions; 
                        // Carrega a primeira decisão nos inputs para editar ou renderiza lista
                        if(typeof window.renderDecisionsList === 'function') window.renderDecisionsList();
                        // Reseta inputs de criação
                        if(typeof window.renderDecisionInputs === 'function') window.renderDecisionInputs();
                    }

                    // --- LÓGICA DE VIDA EXTRA (DENTRO DO BLOCO ONDE 'd' EXISTE) ---
                    if (d.hasExtraLife) {
                        if(elCheck) {
                            elCheck.checked = true;
                            window.toggleExtraLifeSection(); // Mostra a área
                        }
                        setVal('new-game-extra-life-time', d.extraLifeDuration);
                        
                        // Se tem vídeo salvo
                        if(d.extraLifeVideo) {
                            setVal('extra-life-media-url', d.extraLifeVideo);
                            
                            // Tenta encontrar o nome do asset se ele estiver na biblioteca
                            let assetName = "Mídia Salva";
                            if(d.sessionAssets) {
                                const found = d.sessionAssets.find(a => a.url === d.extraLifeVideo);
                                if(found) assetName = found.name;
                            }
                            
                            // Chama a função visual de seleção
                            if(typeof window.selectExtraLifeMedia === 'function') {
                                window.selectExtraLifeMedia(d.extraLifeVideo, assetName);
                            }
                        }
                    }

                    // Timer Config
                    if (d.timerSettings) {
                        const tType = document.getElementById('edit-timer-type');
                        const tFont = document.getElementById('edit-timer-font');
                        const tColor = document.getElementById('edit-timer-color');
                        if(tType) tType.value = d.timerSettings.type || 'regressive';
                        if(tFont) tFont.value = d.timerSettings.font || 'sans-serif';
                        if(tColor) tColor.value = d.timerSettings.color || '#ff0000';
                        if(typeof window.updateTimerPreview === 'function') window.updateTimerPreview();
                    }
                }
            } catch (e) { 
                console.error("Erro ao carregar jogo:", e); 
            }
        } else {
            // --- MODO NOVO JOGO ---
            if(modalTitle) modalTitle.textContent = "Criar Novo Jogo";
            if(deleteBtn) deleteBtn.classList.add('hidden');
        }
        window.calculateHostEarnings();
    };

    window.openScheduleModal = async (gameId) => {
        currentAgendaGameId = gameId; currentAgendaData = {};
        const viewCal = document.getElementById('schedule-view-calendar');
        const viewBulk = document.getElementById('schedule-view-bulk');
        const tabCal = document.getElementById('tab-calendar-view');
        const tabBulk = document.getElementById('tab-bulk-add');

        if(viewCal) viewCal.classList.remove('hidden');
        if(viewBulk) viewBulk.classList.add('hidden');
        if(tabCal) tabCal.classList.add('active');
        if(tabBulk) tabBulk.classList.remove('active');
        
        try {
            const doc = await db.collection('games').doc(gameId).get();
            if(doc.exists) {
                const d = doc.data();
                currentAgendaData = d.availability || {};
                const label = document.getElementById('agenda-game-name');
                if(label) label.textContent = d.name;
                renderAdminCalendar();
                agendaModal.classList.remove('hidden');
            }
        } catch(e) { alert("Erro ao abrir agenda."); }
    };

// =================================================================
    // 10. FUNÇÕES DE RENDERIZAÇÃO E ASSETS (CORRIGIDO)
    // =================================================================

    // 10.1 DEFINIÇÃO DA FUNÇÃO DE UPLOAD (Deve vir antes do uso)
    function setupUpload(inputId, type, callback) {
        const input = document.getElementById(inputId);
        if (!input) return;

        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;

            // Feedback Visual: Acha o texto dentro da caixa de upload
            const boxContainer = input.closest('.upload-box-container');
            const boxText = boxContainer ? boxContainer.querySelector('.upload-box-text') : null;
            const originalText = boxText ? boxText.textContent : "";
            
            if(boxText) boxText.textContent = "Enviando... Aguarde...";

            try {
                const promises = files.map(async f => {
                    const ref = storage.ref().child(`uploads/${Date.now()}_${f.name}`);
                    await ref.put(f);
                    return { url: await ref.getDownloadURL(), name: f.name, type: f.type };
                });
                
                const results = await Promise.all(promises);
                callback(results); // Executa a lógica específica de cada campo

                if(boxText) boxText.textContent = "Upload concluído!";
                
                // Retorna ao texto original após 2 segundos (opcional)
                setTimeout(() => {
                    if(boxText && !input.multiple) boxText.textContent = "Arquivo selecionado (Clique para alterar)";
                    if(boxText && input.multiple) boxText.textContent = originalText; 
                }, 2000);

            } catch (e) {
                console.error(e);
                alert("Erro no envio do arquivo.");
                if(boxText) boxText.textContent = "Erro. Tente novamente.";
            }
        };
    }

    // 10.2 CONFIGURAÇÃO DOS CAMPOS (Agora que a função existe, podemos chamar)

    // A) CAPA DO JOGO
    setupUpload('admin-cover-upload', 'image', (r) => { 
        const urlInput = document.getElementById('new-game-cover'); // Input Hidden
        const preview = document.getElementById('admin-cover-preview');
        
        if(urlInput) urlInput.value = r[0].url; 
        
        if(preview) { 
            preview.src = r[0].url; 
            preview.style.display = 'block'; 
        }
    });

    // B) TEASER (VÍDEO)
    setupUpload('admin-trailer-upload', 'video', (r) => {
        const urlInput = document.getElementById('new-game-trailer'); // Input Hidden
        const statusDiv = document.getElementById('trailer-status');

        if(urlInput) urlInput.value = r[0].url;
        
        if(statusDiv) {
            statusDiv.textContent = `Vídeo pronto: ${r[0].name}`;
            statusDiv.style.color = '#00ff88';
        }
    });

    // C) GALERIA (Múltiplos arquivos)
    setupUpload('gallery-upload-input', 'image', (results) => {
        results.forEach(res => {
            currentGalleryUrls.push(res.url);
        });
        window.renderGallery();
    });

// D) CAPA DO CURSO
    window.openCourseModal = async (id = null) => {
        const modal = document.getElementById('course-modal');
        if(!modal) return console.error("Modal de curso não encontrado.");
        
        modal.classList.remove('hidden');
        
        // 1. Reset Seguro dos Campos
        const idInput = document.getElementById('course-id');
        const titleInput = document.getElementById('course-title');
        const descInput = document.getElementById('course-desc');
        const coverUrlInput = document.getElementById('course-cover-url'); // Novo ID
        const coverPreview = document.getElementById('course-cover-preview');
        const coverUpload = document.getElementById('course-cover-upload');
        const coverText = coverUpload ? coverUpload.parentElement.querySelector('.upload-box-text') : null;

        if(idInput) idInput.value = id || '';
        if(titleInput) titleInput.value = '';
        if(descInput) descInput.value = '';
        if(coverUrlInput) coverUrlInput.value = '';
        
        // Reset Visual da Capa
        if(coverPreview) {
            coverPreview.src = '';
            coverPreview.style.display = 'none';
        }
        if(coverText) coverText.textContent = "Clique para enviar imagem da capa";

        // Reset Módulos
        currentCourseModules = [];
        renderModulesInput();

        // Títulos e Botões
        const modalTitle = document.getElementById('course-modal-title');
        const delBtn = document.getElementById('delete-course-btn');

        if (id) {
            // --- MODO EDIÇÃO ---
            if(modalTitle) modalTitle.textContent = "Editar Curso";
            if(delBtn) {
                delBtn.classList.remove('hidden');
                delBtn.onclick = () => window.deleteCourse(id);
            }

            try {
                const doc = await db.collection('courses').doc(id).get();
                if(doc.exists) {
                    const d = doc.data();
                    
                    if(titleInput) titleInput.value = d.title || '';
                    if(descInput) descInput.value = d.description || '';
                    
                    // Preencher Capa (Novo Sistema)
                    if(d.coverImage) {
                        if(coverUrlInput) coverUrlInput.value = d.coverImage;
                        if(coverPreview) {
                            coverPreview.src = d.coverImage;
                            coverPreview.style.display = 'block';
                        }
                        if(coverText) coverText.textContent = "Enviar Capa";
                    }

                    currentCourseModules = d.modules || [];
                    renderModulesInput();
                }
            } catch(e) { 
                console.error("Erro ao carregar dados do curso:", e); 
            }
        } else {
            // --- MODO NOVO CURSO ---
            if(modalTitle) modalTitle.textContent = "Criar Curso";
            if(delBtn) delBtn.classList.add('hidden');
        }
    };


    // 10.3 RENDERIZAÇÃO DAS LISTAS VISUAIS

    // Galeria
    window.renderGallery = () => {
        const grid = document.getElementById('gallery-preview-grid');
        if(!grid) return;
        grid.innerHTML = '';
        currentGalleryUrls.forEach((url, i) => {
            grid.innerHTML += `
            <div class="gallery-item" style="position:relative; width:60px; height:60px; display:inline-block; margin:5px;">
                <img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:4px; border:1px solid #444;">
                <button onclick="window.removeGalleryItem(${i})" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border:none; border-radius:50%; width:18px; height:18px; font-size:10px; cursor:pointer; display:flex; align-items:center; justify-content:center;">&times;</button>
            </div>`;
        });
    };
    window.removeGalleryItem = (i) => { currentGalleryUrls.splice(i, 1); window.renderGallery(); };

    // Upload Manual de Assets (Sessão)
    window.handleAssetUpload = (input) => {
        // ... (Seu código anterior para handleAssetUpload aqui, ou use a lógica do setupUpload se quiser refatorar depois)
        // Por compatibilidade, mantemos o que você já tinha:
        if (input.files && input.files[0]) {
            Array.from(input.files).forEach(file => {
                 // Simulação ou lógica de upload real
                 const type = file.type.startsWith('video') ? 'video' : (file.type.startsWith('audio') ? 'audio' : 'image');
                 // Se quiser upload real, copie a lógica do setupUpload. 
                 // Por enquanto, placeholder para não quebrar:
                 const fakeUrl = URL.createObjectURL(file); 
                 currentSessionAssets.push({ name: file.name, type: type, url: fakeUrl });
            });
            window.renderAssetsList();
        }
    };

    window.renderAssetsList = () => {
        const list = document.getElementById('assets-crud-list'); // ID atualizado conforme seu HTML
        if (!list) return;
        list.innerHTML = '';
        
        if(currentSessionAssets.length === 0) {
            list.innerHTML = '<p style="padding:10px;text-align:center;opacity:0.5;">Nenhuma mídia adicionada.</p>';
            return;
        }

        currentSessionAssets.forEach((a, i) => {
            const icon = a.type === 'video' ? 'videocam' : (a.type === 'audio' ? 'musical-notes' : 'image');
            list.innerHTML += `
            <div style="background:#222; padding:8px; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center; border-radius:4px; border:1px solid #333;">
                <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
                    <ion-icon name="${icon}" style="color:var(--secondary-color);"></ion-icon>
                    <span style="font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${a.name}</span>
                </div>
                <button type="button" onclick="window.removeSessionAsset(${i})" style="color:#ff4444; background:none; border:none; cursor:pointer;">
                    <ion-icon name="trash-outline"></ion-icon>
                </button>
            </div>`;
        });
    };
    window.removeSessionAsset = (i) => { currentSessionAssets.splice(i, 1); window.renderAssetsList(); };
    
    // --- UPLOAD DE ASSETS (CRUD) ---
    const assetNameInput = document.getElementById('asset-name-input');
    const assetAddBtn = document.getElementById('add-asset-btn');
    const assetStatus = document.getElementById('assets-upload-status');
    const selectedFileDisplay = document.getElementById('selected-file-display');
    const assetFilenameText = document.getElementById('asset-filename-text');
    const clearAssetBtn = document.getElementById('clear-asset-selection');
    const inputImage = document.getElementById('upload-asset-image');
    const inputVideo = document.getElementById('upload-asset-video');
    const inputAudio = document.getElementById('upload-asset-audio');
    let tempAssetType = null;

    function handleAssetSelection(e, type) {
        const file = e.target.files[0];
        if (file) {
            // --- VALIDAÇÃO DE TAMANHO (100MB) ---
            const MAX_SIZE = 100 * 1024 * 1024; // 100MB
            if (file.size > MAX_SIZE) {
                alert(`O arquivo "${file.name}" excede o limite de 100MB.\n\nPor favor, escolha um arquivo menor.`);
                e.target.value = ''; // Limpa o input
                
                // Limpa variáveis temporárias para garantir que nada seja enviado
                tempAssetFile = null;
                tempAssetType = null;
                selectedFileDisplay.classList.add('hidden');
                if(assetAddBtn) {
                    assetAddBtn.disabled = true;
                    assetAddBtn.classList.add('secondary-btn');
                    assetAddBtn.classList.remove('primary-btn');
                }
                return;
            }
            // -------------------------------------

            tempAssetFile = file; 
            tempAssetType = type;
            
            if (assetNameInput && !assetNameInput.value) assetNameInput.value = file.name.split('.')[0];
            if (selectedFileDisplay) selectedFileDisplay.classList.remove('hidden');
            if (assetFilenameText) assetFilenameText.textContent = `${type.toUpperCase()}: ${file.name}`;
            if (assetAddBtn) { assetAddBtn.disabled = false; assetAddBtn.classList.remove('secondary-btn'); assetAddBtn.classList.add('primary-btn'); }
        }
    }
    if(inputImage) inputImage.addEventListener('change', (e) => handleAssetSelection(e, 'image'));
    if(inputVideo) inputVideo.addEventListener('change', (e) => handleAssetSelection(e, 'video'));
    if(inputAudio) inputAudio.addEventListener('change', (e) => handleAssetSelection(e, 'audio'));

    if(clearAssetBtn) clearAssetBtn.addEventListener('click', () => {
        tempAssetFile = null; tempAssetType = null;
        if(inputImage) inputImage.value = ''; if(inputVideo) inputVideo.value = ''; if(inputAudio) inputAudio.value = '';
        selectedFileDisplay.classList.add('hidden');
        assetAddBtn.disabled = true; assetAddBtn.classList.add('secondary-btn'); assetAddBtn.classList.remove('primary-btn');
    });

    if(assetAddBtn) assetAddBtn.addEventListener('click', async () => {
        const name = assetNameInput.value.trim();
        if(!name || !tempAssetFile) return alert("Preencha o nome e selecione um arquivo.");
        assetStatus.textContent = "Enviando..."; assetAddBtn.disabled = true;
        try {
            let folder = 'game-assets-misc';
            if(tempAssetType === 'image') folder = 'game-assets-images';
            if(tempAssetType === 'video') folder = 'game-assets-videos';
            if(tempAssetType === 'audio') folder = 'game-assets-audio';
            const ref = storage.ref().child(`${folder}/${Date.now()}_${tempAssetFile.name}`);
            await ref.put(tempAssetFile);
            const url = await ref.getDownloadURL();
            currentSessionAssets.push({ name: name, url: url, type: tempAssetType });
            window.renderSessionAssets();
            assetNameInput.value = ''; tempAssetFile = null; tempAssetType = null; selectedFileDisplay.classList.add('hidden');
            inputImage.value = ''; inputVideo.value = ''; inputAudio.value = '';
            assetStatus.textContent = "Sucesso!"; setTimeout(() => { assetStatus.textContent = ''; }, 2000);
        } catch(e) { console.error(e); assetStatus.textContent = "Erro."; } 
        finally { assetAddBtn.disabled = true; assetAddBtn.classList.add('secondary-btn'); assetAddBtn.classList.remove('primary-btn'); }
    });

    window.renderSessionAssets = () => {
        const list = document.getElementById('assets-crud-list');
        if(!list) return;
        list.innerHTML = '';
        if(currentSessionAssets.length === 0) { list.innerHTML = '<p style="padding:10px;text-align:center;opacity:0.5;font-size:0.9rem">Nenhuma mídia adicionada.</p>'; return; }
        currentSessionAssets.forEach((a, i) => {
            let thumb = a.type === 'image' ? `<img src="${a.url}" class="crud-item-thumb">` : `<div class="crud-item-thumb"><ion-icon name="document"></ion-icon></div>`;
            if(a.type==='video') thumb = `<div class="crud-item-thumb"><ion-icon name="videocam"></ion-icon></div>`;
            if(a.type==='audio') thumb = `<div class="crud-item-thumb"><ion-icon name="musical-notes"></ion-icon></div>`;
            list.innerHTML += `<div class="crud-item">${thumb}<div class="crud-item-info"><div class="crud-item-name">${a.name}</div><div class="crud-item-type">${a.type.toUpperCase()}</div></div><div class="crud-actions"><button type="button" class="submit-btn small-btn" onclick="window.open('${a.url}', '_blank')"><ion-icon name="eye"></ion-icon></button><button type="button" class="submit-btn danger-btn small-btn" onclick="removeSessionAsset(${i})"><ion-icon name="trash"></ion-icon></button></div></div>`;
        });
    };

    const tagIn = document.getElementById('tag-input-field');
    if(tagIn) tagIn.onkeydown = (e) => { if(e.key==='Enter'||e.key===',') { e.preventDefault(); const v=tagIn.value.trim(); if(v&&!currentTags.includes(v)){currentTags.push(v);renderTags();} tagIn.value=''; } };


    // =================================================================
    // CÁLCULO DE GANHOS DO HOST (70%)
    // =================================================================
    window.calculateHostEarnings = () => {
        const priceInput = document.getElementById('new-game-price');
        const display = document.getElementById('host-share-display');
        
        if (!priceInput || !display) return;

        const price = parseFloat(priceInput.value);

        if (isNaN(price) || price < 0) {
            display.textContent = "R$ 0,00";
            return;
        }

        // Cálculo: 70% para o host
        const hostShare = price * 0.70;

        // Formatação para Real Brasileiro
        display.textContent = hostShare.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    // =========================================================================
    // LÓGICA DE VIDA EXTRA (UPLOAD & BIBLIOTECA)
    // =========================================================================

    // 1. Alternar visualização da seção
    window.toggleExtraLifeSection = () => {
        const chk = document.getElementById('check-extra-life');
        const container = document.getElementById('extra-life-config-container');
        if (chk && container) {
            if (chk.checked) container.classList.remove('hidden');
            else container.classList.add('hidden');
        }
    };

    // 2. Alternar Abas (Upload vs Biblioteca)
    window.switchExtraLifeTab = (mode) => {
        const uploadTab = document.getElementById('el-tab-upload');
        const libraryTab = document.getElementById('el-tab-library');
        const btnUpload = document.getElementById('btn-tab-el-upload');
        const btnLibrary = document.getElementById('btn-tab-el-library');

        if (mode === 'upload') {
            uploadTab.classList.remove('hidden');
            libraryTab.classList.add('hidden');
            btnUpload.classList.add('active');
            btnLibrary.classList.remove('active');
        } else {
            uploadTab.classList.add('hidden');
            libraryTab.classList.remove('hidden');
            btnUpload.classList.remove('active');
            btnLibrary.classList.add('active');
            window.renderExtraLifeLibrary(); // Carrega a lista ao abrir a aba
        }
    };

    // 3. Renderizar Biblioteca (Baseado em currentSessionAssets)
    window.renderExtraLifeLibrary = () => {
        const list = document.getElementById('el-library-list');
        if (!list) return;
        list.innerHTML = '';

        // Filtra apenas Vídeos e Áudios (imagens geralmente não são "executáveis" como timer end)
        // Se quiser incluir imagens, remova o filtro.
        const mediaAssets = currentSessionAssets.filter(a => a.type === 'video' || a.type === 'audio');

        if (mediaAssets.length === 0) {
            list.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:0.8rem; padding:10px;">Nenhum vídeo ou áudio na lista de mídias desta sessão.</p>';
            return;
        }

        mediaAssets.forEach((asset, index) => {
            const icon = asset.type === 'video' ? 'videocam' : 'musical-notes';
            const item = document.createElement('div');
            item.className = 'library-item';
            item.onclick = () => window.selectExtraLifeMedia(asset.url, asset.name);
            
            item.innerHTML = `
                <ion-icon name="${icon}" class="library-item-icon"></ion-icon>
                <span class="library-item-name">${asset.name}</span>
                <button class="library-item-select-btn">Selecionar</button>
            `;
            list.appendChild(item);
        });
    };

    // 4. Filtrar Biblioteca (Pesquisa)
    window.filterExtraLifeLibrary = () => {
        const term = document.getElementById('el-library-search').value.toLowerCase();
        const items = document.querySelectorAll('#el-library-list .library-item');
        
        items.forEach(item => {
            const name = item.querySelector('.library-item-name').textContent.toLowerCase();
            if (name.includes(term)) item.style.display = 'flex';
            else item.style.display = 'none';
        });
    };

    // 5. Selecionar Mídia (Atualiza o input hidden e visual)
    window.selectExtraLifeMedia = (url, name) => {
        const hiddenInput = document.getElementById('extra-life-media-url');
        const previewBox = document.getElementById('el-selected-preview');
        const nameLabel = document.getElementById('el-selected-name');

        if (hiddenInput) hiddenInput.value = url;
        if (nameLabel) nameLabel.textContent = name;
        if (previewBox) previewBox.classList.remove('hidden');
    };

    window.clearExtraLifeSelection = () => {
        document.getElementById('extra-life-media-url').value = '';
        document.getElementById('el-selected-preview').classList.add('hidden');
    };

    // 6. Configurar Upload Específico da Vida Extra
    // (Chama a função setupUpload que já criamos)
    if(typeof setupUpload === 'function') {
        setupUpload('extra-life-upload-input', 'video', (r) => {
            // Callback de sucesso
            window.selectExtraLifeMedia(r[0].url, r[0].name);
            
            const status = document.getElementById('el-upload-status');
            if(status) status.textContent = "Upload concluído e selecionado!";
        });
    }

    // --- SALVAR JOGO (SUBMIT) ---
    if(createGameForm) createGameForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('game-id').value;
        const btn = document.getElementById('save-game-submit-btn');
        const extraLifeUrl = document.getElementById('extra-life-media-url').value;
        const hasExtra = document.getElementById('check-extra-life').checked;
        btn.textContent = "Salvando..."; btn.disabled = true;

        const data = {
            name: document.getElementById('new-game-name').value,
            slug: document.getElementById('new-game-name').value.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            status: document.getElementById('new-game-status').value,
            price: parseFloat(document.getElementById('new-game-price').value),
            sessionDuration: parseInt(document.getElementById('new-game-duration').value),
            pricingCategories: currentGameCategories,
            hasExtraLife: hasExtra,
            extraLifeDuration: document.getElementById('new-game-extra-life-time').value,
            extraLifeVideo: extraLifeUrl,
            tags: currentTags,
            shortDescription: document.getElementById('new-game-short-desc').value,
            fullDescription: document.getElementById('new-game-full-desc').value,
            coverImage: document.getElementById('new-game-cover').value,
            videoPreview: document.getElementById('new-game-trailer').value,
            sessionDuration: document.getElementById('new-game-duration').value,
            maxPlayers: parseInt(document.getElementById('new-game-max-players').value) || 1,
            galleryImages: currentGalleryUrls,
            sessionAssets: currentSessionAssets,
            isPaused: document.getElementById('new-game-status').value === 'paused',
            
            // Novos Campos
            decisions: currentDecisions,
            timerSettings: {
                type: document.getElementById('edit-timer-type').value,
                font: document.getElementById('edit-timer-font').value,
                color: document.getElementById('edit-timer-color').value
            }
        };

        try {
            if(id) {
                await db.collection('games').doc(id).update(data);
                alert("Salvo!"); createGameModal.classList.add('hidden');
            } else {
                data.ownerId = loggedInUser.username;
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                data.availability = {};
                const ref = await db.collection('games').add(data);
                alert("Criado!"); window.openGameModal(ref.id);
            }
            loadAllGames();
        } catch(e) { alert("Erro ao salvar."); }
        finally { btn.textContent = "Salvar Alterações"; btn.disabled = false; }
    };

    // =========================================================================
    // 9. LÓGICA DA AGENDA (CALENDÁRIO)
    // =========================================================================
    function renderAdminCalendar() {
        const grid = document.getElementById('admin-calendar-grid');
        if(!grid) return;
        
        grid.innerHTML = '';
        const m = currentAdminDate.getMonth();
        const y = currentAdminDate.getFullYear();
        document.getElementById('admin-month-header').textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentAdminDate);

        const firstDay = new Date(y, m, 1).getDay();
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        
        for(let i = 0; i < firstDay; i++) { const empty = document.createElement('div'); empty.className = 'calendar-day'; empty.style.opacity = '0'; empty.style.cursor = 'default'; grid.appendChild(empty); }

        const today = new Date(); today.setHours(0,0,0,0);

        for(let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const el = document.createElement('div'); el.className = 'calendar-day'; el.textContent = d; el.dataset.date = dateStr;
            const dateObj = new Date(y, m, d);
            if(dateObj < today) { /* Passado */ } else {
                el.classList.add('available');
                if(currentAgendaData[dateStr] && currentAgendaData[dateStr].length > 0) el.classList.add('has-schedule');
                if(editingDateStr === dateStr) el.classList.add('selected');
                el.onclick = () => openSingleDayEditor(dateStr);
            }
            grid.appendChild(el);
        }
    }

    function openSingleDayEditor(dateStr) {
        editingDateStr = dateStr;
        document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
        const activeDay = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
        if(activeDay) activeDay.classList.add('selected');

        const modal = document.getElementById('single-day-editor');
        modal.classList.remove('hidden');
        const dateParts = dateStr.split('-');
        document.getElementById('editing-date-display').textContent = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        renderSlots(); updateTimeSelectOptions(dateStr);
    }

    function updateTimeSelectOptions(selectedDateStr) {
        const select = document.getElementById('single-time-input');
        if(!select) return;
        select.innerHTML = '<option value="">Selecionar horário...</option>';
        const now = new Date();
        const isToday = selectedDateStr === now.toISOString().split('T')[0];
        const currentHour = now.getHours(); const currentMin = now.getMinutes();

        for(let h = 0; h < 24; h++) {
            for(let m = 0; m < 60; m += 10) { 
                if (isToday) { if (h < currentHour || (h === currentHour && m < currentMin)) continue; }
                const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                const option = document.createElement('option'); option.value = timeStr; option.textContent = timeStr; select.appendChild(option);
            }
        }
    }

    function renderSlots() {
        const list = document.getElementById('single-day-slots');
        list.innerHTML = '';
        const times = currentAgendaData[editingDateStr] || [];
        if(times.length === 0) list.innerHTML = '<span style="font-size:0.8rem; opacity:0.6;">Nenhum horário marcado.</span>';
        times.sort().forEach((t, i) => { list.innerHTML += `<div class="tag-capsule"><span>${t}</span><span onclick="removeSlot(${i})">&times;</span></div>`; });
    }

    window.removeSlot = (i) => { currentAgendaData[editingDateStr].splice(i, 1); renderSlots(); };

    if(document.getElementById('add-single-time-btn')) {
        document.getElementById('add-single-time-btn').onclick = () => {
            const v = document.getElementById('single-time-input').value;
            if(v) { 
                if(!currentAgendaData[editingDateStr]) currentAgendaData[editingDateStr] = [];
                if(!currentAgendaData[editingDateStr].includes(v)) { currentAgendaData[editingDateStr].push(v); currentAgendaData[editingDateStr].sort(); renderSlots(); }
            }
        };
    }

    if(document.getElementById('save-single-day-btn')) {
        document.getElementById('save-single-day-btn').onclick = async () => {
            if(!currentAgendaGameId) return;
            if(currentAgendaData[editingDateStr] && currentAgendaData[editingDateStr].length === 0) delete currentAgendaData[editingDateStr];
            try {
                await db.collection('games').doc(currentAgendaGameId).update({ availability: currentAgendaData });
                document.getElementById('single-day-editor').classList.add('hidden');
                document.querySelector('.calendar-day.selected')?.classList.remove('selected');
                renderAdminCalendar(); 
            } catch(e) { alert("Erro ao salvar agenda."); }
        };
    }

    if(document.getElementById('clear-day-btn')) document.getElementById('clear-day-btn').onclick = () => { if(confirm("Remover todos?")) { delete currentAgendaData[editingDateStr]; renderSlots(); } };
    if(document.getElementById('close-day-editor-btn')) document.getElementById('close-day-editor-btn').onclick = () => { document.getElementById('single-day-editor').classList.add('hidden'); document.querySelector('.calendar-day.selected')?.classList.remove('selected'); };

    if(document.getElementById('admin-prev-month')) document.getElementById('admin-prev-month').onclick = () => { currentAdminDate.setMonth(currentAdminDate.getMonth()-1); renderAdminCalendar(); };
    if(document.getElementById('admin-next-month')) document.getElementById('admin-next-month').onclick = () => { currentAdminDate.setMonth(currentAdminDate.getMonth()+1); renderAdminCalendar(); };
    
    // Bulk
    if(document.getElementById('add-bulk-time-btn')) document.getElementById('add-bulk-time-btn').onclick = () => { const v = document.getElementById('bulk-time-input').value; if(v && !bulkTimesArray.includes(v)) { bulkTimesArray.push(v); renderBulkTimes(); } };
    function renderBulkTimes() { const l = document.getElementById('bulk-times-list'); l.innerHTML=''; bulkTimesArray.forEach((t, i) => l.innerHTML+=`<div class="tag-capsule"><span>${t}</span><span onclick="removeBulkTime(${i})">&times;</span></div>`); }
    window.removeBulkTime = (i) => { bulkTimesArray.splice(i,1); renderBulkTimes(); };
    
    if(document.getElementById('apply-bulk-schedule-btn')) document.getElementById('apply-bulk-schedule-btn').onclick = async () => {
        const s = document.getElementById('bulk-start-date').value;
        const e = document.getElementById('bulk-end-date').value;
        const days = []; document.querySelectorAll('#schedule-view-bulk input:checked').forEach(c=>days.push(parseInt(c.value)));
        if(!s || !e || !days.length || !bulkTimesArray.length) return alert("Preencha tudo");
        let loop = new Date(s+'T00:00:00'), end = new Date(e+'T00:00:00');
        while(loop <= end) {
            if(days.includes(loop.getDay())) {
                const k = `${loop.getFullYear()}-${String(loop.getMonth()+1).padStart(2,'0')}-${String(loop.getDate()).padStart(2,'0')}`;
                const ex = currentAgendaData[k] || [];
                currentAgendaData[k] = [...new Set([...ex, ...bulkTimesArray])].sort();
            }
            loop.setDate(loop.getDate()+1);
        }
        await db.collection('games').doc(currentAgendaGameId).update({ availability: currentAgendaData });
        alert("Aplicado!"); document.getElementById('tab-calendar-view').click();
    };

    const closeMod = (id, mid) => { const e=document.getElementById(id); if(e) e.onclick = () => document.getElementById(mid).classList.add('hidden'); };
    closeMod('close-create-game-modal','create-game-modal'); closeMod('cancel-create-game-btn','create-game-modal');
    closeMod('close-agenda-modal','agenda-modal');
    if(document.getElementById('open-create-game-modal-btn')) document.getElementById('open-create-game-modal-btn').onclick = () => window.openGameModal(null);

    if(document.getElementById('tab-calendar-view')) document.getElementById('tab-calendar-view').onclick = (e) => {
        document.getElementById('schedule-view-calendar').classList.remove('hidden'); document.getElementById('schedule-view-bulk').classList.add('hidden');
        e.target.classList.add('active'); document.getElementById('tab-bulk-add').classList.remove('active'); renderAdminCalendar();
    };
    if(document.getElementById('tab-bulk-add')) document.getElementById('tab-bulk-add').onclick = (e) => {
        document.getElementById('schedule-view-calendar').classList.add('hidden'); document.getElementById('schedule-view-bulk').classList.remove('hidden');
        e.target.classList.add('active'); document.getElementById('tab-calendar-view').classList.remove('active');
    };

    window.createFixedTestRoom = async (id, name) => {
        const bid = `test-${id}`;
        await db.collection('bookings').doc(bid).set({ type:'test', gameId:id, gameName:name, hostId:loggedInUser.username, date: new Date().toISOString(), status:'confirmed' });
        window.location.href = `sala-host.html?bookingId=${bid}&mode=test`;
    };

    window.openDeleteConfirmModal = (id, name) => {
        const m = document.getElementById('delete-confirm-modal');
        const i = document.getElementById('delete-verification-input');
        const b = document.getElementById('confirm-delete-action-btn');
        document.getElementById('delete-game-name-display').textContent = name;
        i.value = ''; b.disabled = true; b.style.opacity = '0.5';
        m.classList.remove('hidden');
        i.oninput = (e) => { b.disabled = e.target.value!==name; b.style.opacity = e.target.value===name?'1':'0.5'; };
        b.onclick = async () => { await db.collection('games').doc(id).delete(); alert("Excluído!"); m.classList.add('hidden'); loadAllGames(); };
        document.getElementById('cancel-delete-modal-btn').onclick = () => m.classList.add('hidden');
    };

    // Init
    loadAllGames();
    loadAllUsers();
});