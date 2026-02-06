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
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await firebase.auth().signOut();
                window.location.href = 'index.html';
            } catch (error) {
                console.error("Erro ao sair:", error);
            }
        });
    }

    // 2. BOTÃO "NOVO JOGO" (Na tela principal do Admin)
    // Verifique se no seu HTML o botão tem id="create-game-btn"
    const createGameBtn = document.getElementById('create-game-btn');
    if (createGameBtn) {
        createGameBtn.addEventListener('click', () => {
            // Chama a função global que criamos
            if (typeof window.openGameModal === 'function') {
                window.openGameModal(null); // Null = Novo Jogo
            } else {
                console.error("Função openGameModal não encontrada!");
            }
        });
    }

    // 3. BOTÃO "NOVO CURSO" (Se houver)
    const createCourseBtn = document.getElementById('create-course-btn');
    if (createCourseBtn) {
        createCourseBtn.addEventListener('click', () => {
            if (typeof window.openCourseModal === 'function') {
                window.openCourseModal(null);
            }
        });
    }

    // 4. FECHAR MODAIS (Genérico para botões com classe .close-modal)
    // Se você tiver botões com id específico para fechar, adicione o check aqui
    const closeGameBtn = document.getElementById('close-game-modal');
    if (closeGameBtn) {
        closeGameBtn.addEventListener('click', () => {
            document.getElementById('game-modal').classList.add('hidden');
        });
    }

    firebase.auth().onAuthStateChanged((user) => {
        if (!user) {
            window.location.href = 'index.html';
        } else {
            console.log("Admin logado:", user.email);
            // Carrega as listas iniciais
            if (typeof loadGames === 'function') loadGames();
            if (typeof loadCourses === 'function') loadCourses();
        }
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
        const previewEl = document.getElementById('timer-preview-text');

        if (previewEl && font && color) {
            previewEl.style.fontFamily = font;
            previewEl.style.color = color;

            // Apenas visual: muda o texto para indicar o tipo
            if (type === 'progressive') {
                previewEl.textContent = "00:00 (Crescente)";
            } else {
                previewEl.textContent = "60:00 (Regressivo)";
            }
        }
    };

    // =========================================================================
    // 3. NOVA LÓGICA: GERENCIADOR DE DECISÕES
    // =========================================================================
    const decisionQ = document.getElementById('decision-question-input');
    const opt1 = document.getElementById('decision-opt-1');
    const opt2 = document.getElementById('decision-opt-2');
    const opt3 = document.getElementById('decision-opt-3');
    const addDecBtn = document.getElementById('add-decision-btn');

    if(addDecBtn) addDecBtn.onclick = () => {
        const q = decisionQ.value.trim();
        const o1 = opt1.value.trim();
        const o2 = opt2.value.trim();
        const o3 = opt3.value.trim();

        if(!q || !o1 || !o2) return alert("Preencha a pergunta e pelo menos 2 alternativas.");

        const newDecision = {
            id: Date.now().toString(),
            question: q,
            options: [o1, o2]
        };
        if(o3) newDecision.options.push(o3);

        currentDecisions.push(newDecision);
        renderDecisionsList();
        
        // Limpar inputs
        decisionQ.value = ''; opt1.value = ''; opt2.value = ''; opt3.value = '';
    };

    window.renderDecisionsList = () => {
        const list = document.getElementById('decisions-list-container');
        if(!list) return;
        list.innerHTML = '';

        if(currentDecisions.length === 0) {
            list.innerHTML = '<p style="font-size:0.8rem; opacity:0.5; text-align:center;">Nenhuma decisão criada.</p>';
            return;
        }

        currentDecisions.forEach((d, i) => {
            const optsHtml = d.options.map(o => `<span style="background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; font-size:0.8rem;">${o}</span>`).join(' ');
            
            list.innerHTML += `
            <div class="decision-card" style="background:rgba(0,0,0,0.3); padding:10px; border-radius:6px; margin-bottom:8px; border-left:3px solid var(--secondary-color); display:flex; justify-content:space-between; align-items:center;">
                <div class="decision-card-content">
                    <div class="decision-question" style="font-weight:bold; color:#fff; margin-bottom:4px;">${d.question}</div>
                    <div class="decision-preview-opts" style="display:flex; gap:5px; color:#aaa;">${optsHtml}</div>
                </div>
                <div style="display:flex; gap:5px;">
                    <button type="button" class="submit-btn small-btn" onclick="loadDecisionToEdit(${i})" title="Editar (Recarrega nos inputs)">
                        <ion-icon name="create-outline"></ion-icon>
                    </button>
                    <button type="button" class="submit-btn danger-btn small-btn" onclick="removeDecision(${i})" title="Excluir">
                        <ion-icon name="trash-outline"></ion-icon>
                    </button>
                </div>
            </div>`;
        });
    };

    window.removeDecision = (i) => {
        currentDecisions.splice(i, 1);
        renderDecisionsList();
    };

    window.loadDecisionToEdit = (i) => {
        const d = currentDecisions[i];
        if(decisionQ) decisionQ.value = d.question;
        if(opt1) opt1.value = d.options[0] || '';
        if(opt2) opt2.value = d.options[1] || '';
        if(opt3) opt3.value = d.options[2] || '';
        
        removeDecision(i); // Remove da lista para ser readicionado ao salvar
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
    // 7. GERENCIAMENTO DE CURSOS (COMPLETO E ATUALIZADO)
    // =========================================================================
    
    // Variáveis de Referência
    const courseList = document.getElementById('course-list-admin');
    const courseModal = document.getElementById('course-modal');
    const courseForm = document.getElementById('course-form');
    const modulesContainer = document.getElementById('modules-container');
    
    // --- A. CONFIGURAÇÃO DO UPLOAD DA CAPA ---
    setupUpload('course-cover-upload', 'image', (files) => {
        if (files && files.length > 0) {
            const fileData = files[0];
            
            // 1. Salva a URL no input oculto
            document.getElementById('course-cover-url').value = fileData.url;
            
            // 2. Mostra o Preview
            const preview = document.getElementById('course-cover-preview');
            preview.src = fileData.url;
            preview.style.display = 'block';
            
            // 3. Feedback de Sucesso
            const statusMsg = document.getElementById('course-cover-status');
            statusMsg.innerText = "Imagem carregada com sucesso!";
            statusMsg.style.color = "#00ff88";
        }
    });

    // --- B. LISTAR CURSOS ---
    async function loadCourses() {
        if(!courseList) return;
        courseList.innerHTML = '<div class="loader"></div>';
        
        try {
            const snap = await db.collection('courses').orderBy('updatedAt', 'desc').get();
            courseList.innerHTML = '';
            
            if(snap.empty) { 
                courseList.innerHTML = '<p style="opacity:0.6; padding:20px;">Nenhum curso cadastrado.</p>'; 
                return; 
            }
            
            snap.forEach(doc => {
                const c = doc.data();
                // Usa imagem padrão se não tiver capa
                const coverImg = c.coverImage || 'assets/images/logo.png';
                
                const card = document.createElement('div'); 
                card.className = 'game-card'; // Reutilizando estilo de card de jogo
                card.innerHTML = `
                    <div style="height:150px; overflow:hidden; position:relative;">
                        <img src="${coverImg}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                    <div class="game-card-content">
                        <h3 style="margin-bottom:5px; font-size:1.1rem;">${c.title}</h3>
                        <p style="font-size:0.85rem; color:#aaa; margin-bottom:10px;">
                            ${(c.modules || []).length} Módulos
                        </p>
                        <button class="submit-btn small-btn" onclick="openCourseModal('${doc.id}')" style="width:100%;">
                            <ion-icon name="create-outline"></ion-icon> Editar
                        </button>
                    </div>`;
                courseList.appendChild(card);
            });
        } catch(e) { 
            console.error("Erro ao listar cursos:", e);
            courseList.innerHTML = '<p style="color:red;">Erro ao carregar cursos.</p>';
        }
    }

    // --- C. ABRIR MODAL (NOVO OU EDITAR) ---
    window.openCourseModal = async (id = null) => {
        // 1. Resetar Campos
        document.getElementById('course-id').value = id || '';
        document.getElementById('course-title').value = '';
        document.getElementById('course-desc').value = '';
        
        // 2. Resetar Capa
        document.getElementById('course-cover-url').value = '';
        const preview = document.getElementById('course-cover-preview');
        preview.src = '';
        preview.style.display = 'none';
        const statusMsg = document.getElementById('course-cover-status');
        statusMsg.innerText = "Tamanho recomendado: 800x600";
        statusMsg.style.color = "#aaa";

        // 3. Resetar Módulos
        currentCourseModules = [];
        
        // 4. Configurar Botões (Título e Delete)
        const delBtn = document.getElementById('delete-course-btn');
        const titleEl = document.getElementById('course-modal-title');

        if(id) {
            // MODO EDIÇÃO
            titleEl.textContent = "Editar Curso";
            if(delBtn) {
                delBtn.classList.remove('hidden');
                delBtn.onclick = () => deleteCourse(id);
            }
            
            try {
                const doc = await db.collection('courses').doc(id).get();
                if(doc.exists) {
                    const d = doc.data();
                    document.getElementById('course-title').value = d.title;
                    document.getElementById('course-desc').value = d.description;
                    
                    // Carrega Capa Existente
                    if(d.coverImage) {
                        document.getElementById('course-cover-url').value = d.coverImage;
                        preview.src = d.coverImage;
                        preview.style.display = 'block';
                    }
                    
                    // Carrega Módulos
                    currentCourseModules = d.modules || [];
                }
            } catch(e) { console.error(e); }
        } else {
            // MODO CRIAÇÃO
            titleEl.textContent = "Novo Curso";
            if(delBtn) delBtn.classList.add('hidden');
        }
        
        renderModulesInput(); // Renderiza inputs de módulos
        courseModal.classList.remove('hidden');
    };

    // --- D. GERENCIAMENTO DE MÓDULOS (INTERFACE) ---
    
    // Botão Adicionar Módulo
    document.getElementById('add-module-btn').onclick = () => {
        currentCourseModules.push({ title: '', videoUrl: '' });
        renderModulesInput();
    };

    function renderModulesInput() {
        modulesContainer.innerHTML = '';
        
        currentCourseModules.forEach((mod, index) => {
            const div = document.createElement('div');
            div.className = 'module-item';
            div.style.background = '#222';
            div.style.padding = '10px';
            div.style.marginBottom = '10px';
            div.style.borderRadius = '5px';
            div.style.border = '1px solid #333';
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span style="font-weight:bold; color:var(--primary-color);">Módulo ${index + 1}</span>
                    <button type="button" onclick="removeModule(${index})" style="background:none; border:none; color:#ff4444; cursor:pointer;">
                        <ion-icon name="trash-outline"></ion-icon>
                    </button>
                </div>
                <input type="text" placeholder="Título do Módulo" value="${mod.title}" 
                    onchange="updateModule(${index}, 'title', this.value)" 
                    class="input-field" style="margin-bottom:5px;">
                <input type="text" placeholder="Link do Vídeo (YouTube/Embed)" value="${mod.videoUrl}" 
                    onchange="updateModule(${index}, 'videoUrl', this.value)" 
                    class="input-field">
            `;
            modulesContainer.appendChild(div);
        });
    }

    window.updateModule = (index, field, value) => {
        currentCourseModules[index][field] = value;
    };

    window.removeModule = (index) => {
        if(confirm('Remover este módulo?')) {
            currentCourseModules.splice(index, 1);
            renderModulesInput();
        }
    };

// --- E. SALVAR CURSO (SUBMIT) ---
    if(courseForm) courseForm.onsubmit = async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('course-id').value;
        
        // CORREÇÃO: Busca o botão pelo atributo 'form' pois ele está fora da tag <form>
        const submitBtn = document.querySelector('button[type="submit"][form="course-form"]');
        
        // Bloqueia botão (com verificação de segurança)
        if(submitBtn) {
            submitBtn.disabled = true; 
            submitBtn.innerHTML = '<div class="loader-small"></div> Salvando...';
        }

        const data = { 
            title: document.getElementById('course-title').value, 
            description: document.getElementById('course-desc').value, 
            coverImage: document.getElementById('course-cover-url').value, 
            modules: currentCourseModules, 
            updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
        };

        try { 
            if(id) {
                await db.collection('courses').doc(id).update(data);
            } else {
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('courses').add(data); 
            }
            
            alert('Curso salvo com sucesso!'); 
            courseModal.classList.add('hidden'); 
            loadCourses(); 
        } catch(e) { 
            console.error(e);
            alert('Erro ao salvar curso: ' + e.message); 
        } finally {
            if(submitBtn) {
                submitBtn.disabled = false; 
                submitBtn.textContent = "Salvar Curso";
            }
        }
    };

    // --- F. EXCLUIR CURSO ---
    async function deleteCourse(id) {
        if(confirm('Tem certeza que deseja excluir este curso permanentemente?')) {
            try {
                await db.collection('courses').doc(id).delete();
                alert('Curso excluído.');
                courseModal.classList.add('hidden');
                loadCourses();
            } catch(e) {
                console.error(e);
                alert('Erro ao excluir.');
            }
        }
    }

    // Listener para fechar modal
    document.getElementById('close-course-modal')?.addEventListener('click', () => {
        courseModal.classList.add('hidden');
    });
    
    document.getElementById('cancel-course-btn')?.addEventListener('click', () => {
        courseModal.classList.add('hidden');
    });

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
    window.loadAllGames = async function() {
        if(!gameListContainer) return;
        gameListContainer.innerHTML = '<div class="loader"></div>';
        
        try {
            const gamesSnap = await db.collection('games').get();
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`; 

            const bookingsSnap = await db.collection('bookings').where('date', '>=', todayStr).get();
            const gamesWithSessions = new Set();
            const toleranceTime = new Date(now.getTime() - (2 * 60 * 60 * 1000));

            bookingsSnap.forEach(doc => {
                const data = doc.data();
                if (data.gameId && data.status !== 'cancelled') {
                    const sessionDateTime = new Date(`${data.date}T${data.time}`);
                    if (sessionDateTime >= toleranceTime) gamesWithSessions.add(data.gameId);
                }
            });

            gameListContainer.innerHTML = '';
            if(gamesSnap.empty) { gameListContainer.innerHTML = '<p>Nenhum jogo.</p>'; return; }
            
            gamesSnap.forEach(doc => {
                const g = doc.data();
                if(g.tags) g.tags.forEach(t => allKnownTags.add(t));
                
                const hasFutureSession = gamesWithSessions.has(doc.id);
                const sessionBtnState = hasFutureSession ? '' : 'disabled';
                const sessionBtnStyle = hasFutureSession ? 'background:var(--secondary-color); color:#fff; border:none;' : 'background:rgba(255,255,255,0.05); color:#666; border:1px solid #444; cursor:not-allowed; opacity:0.6;'; 

                const card = document.createElement('div'); card.className = 'game-card';
                card.innerHTML = `
                    <button class="delete-corner-btn delete-game-trigger" data-id="${doc.id}" data-name="${g.name}"><ion-icon name="trash-outline"></ion-icon></button>
                    <img src="${g.coverImage||'assets/images/logo.png'}" class="game-card-img" style="height:150px; object-fit: cover;">
                    <div class="game-card-content">
                        <div style="margin-bottom:1rem;">
                            <h3 style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${g.name}</h3>
                            <small>
                                ${g.status === 'available' 
                                    ? '<span style="color:#00ff88">● Disponível</span>' 
                                    : g.status === 'paused' 
                                        ? '<span style="color:#ffbb00">● Pausado</span>' 
                                        : '<span style="color:white">● Rascunho</span>'
                                }
                            </small>                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                            <button class="submit-btn small-btn edit-game-trigger" data-id="${doc.id}">Editar</button>
                            <button class="submit-btn small-btn schedule-game-trigger" data-id="${doc.id}" style="background:var(--primary-color-dark); border:1px solid #444;">Agenda</button>
                            <button class="submit-btn small-btn test-room-trigger" onclick="window.createTestSession('${doc.id}')" data-id="${doc.id}" data-name="${g.name}" style="background:rgba(0,255,136,0.1); color:#00ff88; border:1px solid #00ff88;"><ion-icon name="flask-outline"></ion-icon> Testar</button>
                            <button class="submit-btn small-btn sessions-game-trigger" data-id="${doc.id}" data-name="${g.name}" ${sessionBtnState} style="${sessionBtnStyle} display: flex; align-items: center; justify-content: center; gap: 5px;"><ion-icon name="list-outline"></ion-icon> Sessões</button>
                        </div>
                    </div>`;
                gameListContainer.appendChild(card);
            });
        } catch(e) { console.error(e); }
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
// FUNÇÕES DE RENDERIZAÇÃO (Mídias e Decisões)
// =================================================================

// 1. Renderizar Lista de Assets (Mídias)
window.renderAssetsList = () => {
    const list = document.getElementById('assets-list');
    if (!list) return;
    list.innerHTML = '';

    currentSessionAssets.forEach((asset, index) => {
        const item = document.createElement('div');
        item.className = 'list-item'; // Certifique-se de ter CSS para isso ou use style inline
        item.style.cssText = "display:flex; justify-content:space-between; background:#222; padding:8px; margin-bottom:5px; border-radius:4px; align-items:center;";
        
        let icon = asset.type === 'video' ? 'videocam' : (asset.type === 'audio' ? 'musical-notes' : 'image');
        
        item.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
                <ion-icon name="${icon}" style="color:#aaa;"></ion-icon>
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px;">${asset.name}</span>
            </div>
            <button type="button" onclick="removeAsset(${index})" style="background:none; border:none; color:#ff4444; cursor:pointer;">
                <ion-icon name="trash-outline"></ion-icon>
            </button>
        `;
        list.appendChild(item);
    });
};

// 2. Renderizar Lista de Decisões
window.renderDecisionsList = () => {
    const list = document.getElementById('decisions-list');
    if (!list) return;
    list.innerHTML = '';

    currentGameDecisions.forEach((decision, index) => {
        const item = document.createElement('div');
        item.style.cssText = "display:flex; justify-content:space-between; background:#222; padding:8px; margin-bottom:5px; border-radius:4px; align-items:center;";
        
        item.innerHTML = `
            <div style="display:flex; flex-direction:column;">
                <span style="font-weight:bold; color:var(--primary-color);">${decision.question}</span>
                <span style="font-size:0.8rem; color:#aaa;">${decision.options.length} opções • ${decision.time}s</span>
            </div>
            <div style="display:flex; gap:10px;">
                <button type="button" onclick="editDecision(${index})" style="background:none; border:none; color:#fff; cursor:pointer;">
                    <ion-icon name="create-outline"></ion-icon>
                </button>
                <button type="button" onclick="removeDecision(${index})" style="background:none; border:none; color:#ff4444; cursor:pointer;">
                    <ion-icon name="trash-outline"></ion-icon>
                </button>
            </div>
        `;
        list.appendChild(item);
    });
};

// Funções auxiliares de remoção (caso não tenha)
window.removeAsset = (index) => {
    currentSessionAssets.splice(index, 1);
    renderAssetsList();
};

window.removeDecision = (index) => {
    currentGameDecisions.splice(index, 1);
    renderDecisionsList();
};


// =================================================================
// 1. FUNÇÃO AUXILIAR: Configura a UI da Vida Extra (Contextual)
// =================================================================
function setupExtraLifeUI(gameData) {
    const libraryRadio = document.getElementById('radio-library');
    const libraryLabel = document.getElementById('btn-opt-library');
    const countLabel = document.getElementById('library-count-label');
    const select = document.getElementById('extra-life-history-select');
    
    // 1. Reseta para estado "Novo/Upload"
    const uploadRadio = document.querySelector('input[value="upload"]');
    if(uploadRadio) uploadRadio.checked = true;
    
    // Garante visibilidade correta dos containers
    const uploadDiv = document.getElementById('extra-life-upload-container');
    const selectDiv = document.getElementById('extra-life-select-container');
    if(uploadDiv) uploadDiv.classList.remove('hidden');
    if(selectDiv) selectDiv.classList.add('hidden');

    let availableVideos = [];

    // 2. Se houver dados do jogo, procura vídeos para popular a biblioteca
    if (gameData) {
        // A. Verifica vídeo de vida extra atual
        if (gameData.extraLifeVideo) {
            availableVideos.push({ name: "Vídeo Atual de Vida Extra", url: gameData.extraLifeVideo });
        }
        // B. Verifica assets da sessão (Vídeos enviados na lista de mídias)
        if (gameData.sessionAssets && Array.isArray(gameData.sessionAssets)) {
            gameData.sessionAssets.forEach(asset => {
                if (asset.type === 'video' && asset.url) {
                    // Evita duplicatas
                    if (!availableVideos.some(v => v.url === asset.url)) {
                        availableVideos.push({ name: asset.name || "Vídeo da Sessão", url: asset.url });
                    }
                }
            });
        }
    }

    // 3. Atualiza a Interface (Habilita ou Desabilita a aba Biblioteca)
    if (availableVideos.length > 0) {
        if(libraryRadio) libraryRadio.disabled = false;
        if(libraryLabel) {
            libraryLabel.style.opacity = "1";
            libraryLabel.style.cursor = "pointer";
        }
        if(countLabel) countLabel.innerText = `(${availableVideos.length} vídeos encontrados)`;

        // Preenche Select
        if(select) {
            select.innerHTML = '<option value="">-- Selecione --</option>';
            availableVideos.forEach(vid => {
                const opt = document.createElement('option');
                opt.value = vid.url;
                opt.innerText = vid.name;
                select.appendChild(opt);
            });
        }
    } else {
        if(libraryRadio) libraryRadio.disabled = true;
        if(libraryLabel) {
            libraryLabel.style.opacity = "0.5";
            libraryLabel.style.cursor = "not-allowed";
        }
        if(countLabel) countLabel.innerText = "(Nenhum vídeo neste jogo)";
        if(select) select.innerHTML = '<option>Sem vídeos disponíveis</option>';
    }
}

// =================================================================
// 2. FUNÇÃO PRINCIPAL: Abrir Modal (Completa)
// =================================================================
window.openGameModal = async (gameId = null) => {
    console.log("📂 Abrindo Modal de Jogo. ID:", gameId);

    // --- A. GARANTIR ABERTURA ---
    const modal = document.getElementById('game-modal');
    if (!modal) {
        alert("ERRO CRÍTICO: HTML do modal não encontrado.");
        return;
    }
    modal.classList.remove('hidden');

    // --- B. REFERÊNCIAS DE UI ---
    const modalTitle = document.getElementById('modal-title');
    const deleteBtn = document.getElementById('delete-game-btn');
    
    // --- C. LIMPEZA TOTAL (Resetar campos para vazio) ---
    document.getElementById('game-id').value = gameId || '';

    // Lista de IDs dos inputs para limpar
    const inputsToReset = [
        'game-name', 
        'game-price', 
        'game-players', 
        'game-timer', 
        'game-short-desc', 
        'game-long-desc', 
        'extra-life-duration'
    ];

    inputsToReset.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = ''; // Define como vazio (sem defaults)
    });

    // Resetar Listas
    if (document.getElementById('assets-list')) document.getElementById('assets-list').innerHTML = '';
    if (document.getElementById('decisions-list')) document.getElementById('decisions-list').innerHTML = '';
    
    // Resetar Variáveis Globais
    currentSessionAssets = [];
    currentGameDecisions = [];

    // Resetar Vida Extra
    const elCheck = document.getElementById('enable-extra-life');
    if(elCheck) {
        elCheck.checked = false;
        if(typeof window.toggleExtraLifeSection === 'function') window.toggleExtraLifeSection();
    }
    setupExtraLifeUI(null); // Bloqueia a biblioteca inicialmente

    // --- D. LÓGICA DE EDIÇÃO ---
    if (gameId) {
        if(modalTitle) modalTitle.innerText = "Editar Jogo";
        
        // Configura botão de deletar
        if(deleteBtn) {
            deleteBtn.classList.remove('hidden');
            deleteBtn.onclick = () => deleteGame(gameId);
        }

        // Feedback visual
        const nameInput = document.getElementById('game-name');
        if(nameInput) nameInput.value = "Carregando dados...";

        try {
            const doc = await db.collection('games').doc(gameId).get();
            
            if (doc.exists) {
                const gameData = doc.data();
                console.log("✅ Dados carregados:", gameData);

                // 1. Preencher Campos Básicos (Só preenche se existir dado)
                if(nameInput) nameInput.value = gameData.name || '';
                
                if(document.getElementById('game-price')) 
                    document.getElementById('game-price').value = gameData.price || '';
                
                if(document.getElementById('game-players')) 
                    document.getElementById('game-players').value = gameData.maxPlayers || '';

                if(document.getElementById('game-timer')) 
                    document.getElementById('game-timer').value = gameData.sessionDuration || '';

                if(document.getElementById('game-short-desc')) 
                    document.getElementById('game-short-desc').value = gameData.shortDescription || '';

                if(document.getElementById('game-long-desc')) 
                    document.getElementById('game-long-desc').value = gameData.longDescription || '';

                // 2. Carregar ASSETS
                if(gameData.sessionAssets) {
                    currentSessionAssets = gameData.sessionAssets;
                    if(typeof renderAssetsList === 'function') renderAssetsList();
                }

                // 3. Carregar DECISÕES
                if(gameData.decisions) {
                    currentGameDecisions = gameData.decisions;
                    if(typeof renderDecisionsList === 'function') renderDecisionsList();
                }

                // 4. Carregar VIDA EXTRA
                setupExtraLifeUI(gameData); // Libera biblioteca com vídeos deste jogo

                if (gameData.extraLifeVideo) {
                    // Ativa checkbox
                    if(elCheck) {
                        elCheck.checked = true;
                        if(typeof window.toggleExtraLifeSection === 'function') window.toggleExtraLifeSection();
                    }
                    
                    // Define duração (se houver salva)
                    const elDuration = document.getElementById('extra-life-duration');
                    if(elDuration) elDuration.value = gameData.extraLifeDuration || '';

                    // Tenta selecionar automaticamente no dropdown
                    const select = document.getElementById('extra-life-history-select');
                    const radioLib = document.querySelector('input[value="select"]');
                    
                    if (select && radioLib && !radioLib.disabled) {
                        // Verifica se a URL salva está na lista
                        const existsInList = Array.from(select.options).some(opt => opt.value === gameData.extraLifeVideo);
                        
                        if (existsInList) {
                            radioLib.checked = true;
                            select.value = gameData.extraLifeVideo;
                            
                            // Atualiza UI para mostrar o select
                            if(typeof window.toggleExtraLifeSource === 'function') window.toggleExtraLifeSource();
                            
                            // Atualiza preview de texto
                            const preview = document.getElementById('selected-video-preview');
                            if(preview) preview.innerText = "Selecionado: " + select.options[select.selectedIndex].text;
                        }
                    }
                }

            } else {
                console.error("Jogo não encontrado no banco.");
                if(nameInput) nameInput.value = "Erro: Jogo não encontrado";
            }
        } catch (error) {
            console.error("Erro ao carregar jogo:", error);
            alert("Erro de conexão ao buscar dados.");
        }
    } else {
        // --- E. LÓGICA DE NOVO JOGO ---
        if(modalTitle) modalTitle.innerText = "Novo Jogo";
        if(deleteBtn) deleteBtn.classList.add('hidden');
        // Campos já foram limpos na etapa C
    }
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

    function setupUpload(inputId, type, cb) {
        const input = document.getElementById(inputId);
        if(!input) return;
        
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if(!files.length) return;

            // --- VALIDAÇÃO DE TAMANHO (100MB) ---
            const MAX_SIZE = 100 * 1024 * 1024; // 100MB em bytes
            const oversizedFile = files.find(f => f.size > MAX_SIZE);

            if (oversizedFile) {
                alert(`O arquivo "${oversizedFile.name}" é muito grande (acima de 100MB).\n\nO envio foi cancelado.`);
                input.value = ''; // Limpa o input para permitir nova seleção
                
                // Limpa status se houver
                let stat = input.parentElement.querySelector('.form-hint') || document.getElementById(inputId.replace('input','status'));
                if(stat) stat.textContent = "Erro: Arquivo muito grande.";
                return;
            }
            // -------------------------------------

            let stat = input.parentElement.querySelector('.form-hint') || document.getElementById(inputId.replace('input','status'));
            if(stat) stat.textContent = "Enviando...";
            
            try {
                const promises = files.map(async f => {
                    const ref = storage.ref().child(`uploads/${Date.now()}_${f.name}`);
                    await ref.put(f);
                    return { url: await ref.getDownloadURL(), name: f.name, type: f.type };
                });
                const res = await Promise.all(promises);
                cb(res);
                if(stat) stat.textContent = "Concluído!";
            } catch(e) { 
                console.error(e);
                if(stat) stat.textContent = "Erro no envio."; 
            }
        };
    }

    setupUpload('admin-cover-upload', 'image', (r) => { document.getElementById('new-game-cover').value = r[0].url; document.getElementById('admin-cover-preview').src = r[0].url; document.getElementById('admin-cover-preview').style.display = 'block'; });
    setupUpload('gallery-upload-input', 'image', (r) => { currentGalleryUrls.push(...r.map(x=>x.url)); window.renderGallery(); });
    setupUpload('admin-trailer-upload', 'video', (r) => { document.getElementById('new-game-trailer').value = r[0].url; });

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
            /*const MAX_SIZE = 100 * 1024 * 1024; // 100MB
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
                */
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

    const chkExtra = document.getElementById('check-extra-life');
    if(chkExtra) chkExtra.onchange = (e) => { const box = document.getElementById('extra-life-config-container'); if(e.target.checked) box.classList.remove('hidden'); else box.classList.add('hidden'); };

    // --- SALVAR JOGO (SUBMIT) ---
    if(createGameForm) createGameForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('game-id').value;
        const btn = document.getElementById('save-game-submit-btn');
        btn.textContent = "Salvando..."; btn.disabled = true;
        const extraLifeEnabled = document.getElementById('enable-extra-life').checked;
let finalExtraLifeUrl = null;
let finalDuration = null;

if (extraLifeEnabled) {
    // SÓ PROCESSA SE ESTIVER HABILITADO
    const extraLifeSource = document.querySelector('input[name="extraLifeSource"]:checked')?.value || 'upload';
    
    if (extraLifeSource === 'upload') {
        const file = document.getElementById('extra-life-video').files[0];
        if (file) {
            const storageRef = firebase.storage().ref();
            const fileRef = storageRef.child(`games/extra-life/${Date.now()}_${file.name}`);
            await fileRef.put(file);
            finalExtraLifeUrl = await fileRef.getDownloadURL();
        }
    } else {
        finalExtraLifeUrl = document.getElementById('extra-life-history-select').value;
    }
    
    finalDuration = parseInt(document.getElementById('extra-life-duration').value) || 7;
}

        const data = {
            name: document.getElementById('new-game-name').value,
            slug: document.getElementById('new-game-name').value.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            status: document.getElementById('new-game-status').value,
            sessionDuration: document.getElementById('game-timer').value,
            price: document.getElementById('new-game-price').value,
            hasExtraLife: chkExtra.checked,
            extraLifeVideo: finalExtraLifeUrl, 
            extraLifeDuration: finalDuration,
            extraLifeDuration: chkExtra.checked ? document.getElementById('new-game-extra-life-time').value : 0,
            tags: currentTags,
            shortDescription: document.getElementById('game-short-desc').value,
            fullDescription: document.getElementById('game-long-desc').value,
            coverImage: document.getElementById('new-game-cover').value,
            videoPreview: document.getElementById('new-game-trailer').value,
            sessionDuration: document.getElementById('new-game-duration').value,
            maxPlayers: parseInt(document.getElementById('game-players').value) || 1,
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

    // Adicione ao final do admin.js ou dentro do setupEventListeners
window.createTestSession = async (gameId) => {
    try {
        const db = firebase.firestore();
        const user = firebase.auth().currentUser;

        if (!user) return alert("Você precisa estar logado.");

        console.log("Criando sessão de teste para o jogo:", gameId);

        // 1. Cria a sessão com TODOS os dados obrigatórios
        const sessionRef = await db.collection('sessions').add({
            gameId: gameId,              // <--- O CAMPO QUE FALTAVA
            hostId: user.uid,
            status: 'scheduled',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            clientName: "Teste Admin",
            clientEmail: user.email,
            timerCurrent: 0,             // Opcional: começa zerado
            timerStatus: 'paused'
        });

        // 2. Redireciona para a sala-host
        console.log("Sessão criada:", sessionRef.id);
        window.location.href = `sala-host.html?sessionId=${sessionRef.id}`;

    } catch (error) {
        console.error("Erro ao criar teste:", error);
        alert("Erro ao criar sessão de teste.");
    }
};

// Variável para armazenar temporariamente a biblioteca de vídeos organizada por jogo
let videoLibraryCache = {}; 

async function loadExtraLifeHistory() {
    const gameFilter = document.getElementById('library-game-filter');
    const videoSelect = document.getElementById('extra-life-history-select');
    
    // Feedback visual de carregamento
    gameFilter.innerHTML = '<option>Carregando...</option>';
    videoSelect.innerHTML = '<option>Aguarde...</option>';
    videoSelect.disabled = true;

    try {
        const db = firebase.firestore();
        const snapshot = await db.collection('games').orderBy('createdAt', 'desc').get();
        
        videoLibraryCache = {}; // Reseta cache
        
        // 1. Processa todos os jogos e seus vídeos
        snapshot.forEach(doc => {
            const data = doc.data();
            const gameId = doc.id;
            const gameName = data.name || 'Sem Nome';
            
            // Inicializa array para este jogo
            if (!videoLibraryCache[gameId]) {
                videoLibraryCache[gameId] = { name: gameName, videos: [] };
            }

            const seenUrls = new Set();

            // A. Pega vídeo de Vida Extra (se houver)
            if (data.extraLifeVideo) {
                videoLibraryCache[gameId].videos.push({
                    name: "Vídeo de Vida Extra",
                    url: data.extraLifeVideo
                });
                seenUrls.add(data.extraLifeVideo);
            }

            // B. Pega vídeos dos Assets da Sessão (sessionAssets)
            if (data.sessionAssets && Array.isArray(data.sessionAssets)) {
                data.sessionAssets.forEach(asset => {
                    if (asset.type === 'video' && asset.url && !seenUrls.has(asset.url)) {
                        videoLibraryCache[gameId].videos.push({
                            name: asset.name || "Vídeo sem nome",
                            url: asset.url
                        });
                        seenUrls.add(asset.url);
                    }
                });
            }
        });

        // 2. Preenche o Dropdown de FILTRO DE JOGOS
        gameFilter.innerHTML = '<option value="">-- Selecione o Jogo --</option>';
        
        Object.keys(videoLibraryCache).forEach(gameId => {
            const gameData = videoLibraryCache[gameId];
            // Só adiciona o jogo no filtro se ele tiver vídeos
            if (gameData.videos.length > 0) {
                const opt = document.createElement('option');
                opt.value = gameId;
                opt.innerText = gameData.name;
                gameFilter.appendChild(opt);
            }
        });

        // 3. Listener: Quando mudar o Jogo, atualiza a lista de Vídeos
        gameFilter.onchange = () => {
            const selectedGameId = gameFilter.value;
            videoSelect.innerHTML = '<option value="">-- Selecione o Vídeo --</option>';
            
            if (!selectedGameId) {
                videoSelect.disabled = true;
                return;
            }

            const gameVideos = videoLibraryCache[selectedGameId].videos;
            
            if (gameVideos.length === 0) {
                videoSelect.innerHTML = '<option>Sem vídeos neste jogo</option>';
                videoSelect.disabled = true;
            } else {
                gameVideos.forEach(vid => {
                    const opt = document.createElement('option');
                    opt.value = vid.url;
                    opt.innerText = vid.name;
                    videoSelect.appendChild(opt);
                });
                videoSelect.disabled = false;
            }
        };

        // 4. Listener: Preview do Vídeo
        videoSelect.onchange = () => {
            const preview = document.getElementById('selected-video-preview');
            if (preview) {
                preview.innerHTML = videoSelect.value ? 
                    `<span style="color:#00ff88">Vídeo Selecionado:</span> ${videoSelect.options[videoSelect.selectedIndex].text}` : 
                    'Nenhum vídeo selecionado';
            }
        };

        // Reseta o select de vídeos para o estado inicial
        videoSelect.innerHTML = '<option value="">Selecione um jogo primeiro</option>';
        videoSelect.disabled = true;

    } catch (error) {
        console.error("Erro ao carregar biblioteca:", error);
        gameFilter.innerHTML = '<option>Erro ao carregar</option>';
    }
}

// Alterna a visibilidade da seção inteira
window.toggleExtraLifeSection = () => {
    const isChecked = document.getElementById('enable-extra-life').checked;
    const optionsDiv = document.getElementById('extra-life-options');
    
    if (isChecked) {
        optionsDiv.classList.remove('hidden');
        // Opcional: Já carrega o histórico se a pessoa abrir
        if(document.querySelector('input[name="extraLifeSource"][value="select"]').checked) {
            loadExtraLifeHistory();
        }
    } else {
        optionsDiv.classList.add('hidden');
    }
};

// Mantém a função de alternar fonte (Upload/Select) que criamos antes
    window.toggleExtraLifeSource = () => {
    // Verifica se os elementos existem antes de tentar usar .classList
    const uploadDiv = document.getElementById('extra-life-upload-container');
    const selectDiv = document.getElementById('extra-life-select-container');
    const sourceInput = document.querySelector('input[name="extraLifeSource"]:checked');

    if (!uploadDiv || !selectDiv || !sourceInput) return; // Sai se algo estiver faltando

    const source = sourceInput.value;

    if (source === 'upload') {
        uploadDiv.classList.remove('hidden');
        selectDiv.classList.add('hidden');
    } else {
        uploadDiv.classList.add('hidden');
        selectDiv.classList.remove('hidden');
        loadExtraLifeHistory(); 
    }
};

// Pequeno helper para o preview do select
document.getElementById('extra-life-history-select').addEventListener('change', function() {
    const preview = document.getElementById('selected-video-preview');
    if(this.value) preview.innerText = "Selecionado: " + this.options[this.selectedIndex].text;
});

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