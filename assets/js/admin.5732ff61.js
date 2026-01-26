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

    // =========================================================================
    // CORREÇÃO: FECHAR MODAL DE SESSÕES
    // =========================================================================
    // Força o funcionamento dos botões de fechar especificamente para este modal
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
                            <small>${g.status==='available'?'<span style="color:#00ff88">● On</span>':'<span style="color:#ffbb00">● Off</span>'}</small>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                            <button class="submit-btn small-btn edit-game-trigger" data-id="${doc.id}">Editar</button>
                            <button class="submit-btn small-btn schedule-game-trigger" data-id="${doc.id}" style="background:var(--primary-color-dark); border:1px solid #444;">Agenda</button>
                            <button class="submit-btn small-btn test-room-trigger" data-id="${doc.id}" data-name="${g.name}" style="background:rgba(0,255,136,0.1); color:#00ff88; border:1px solid #00ff88;"><ion-icon name="flask-outline"></ion-icon> Testar</button>
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

    // --- ABRIR MODAL DE EDIÇÃO/CRIAÇÃO ---
    window.openGameModal = async (gameId) => {
        createGameForm.reset();
        document.getElementById('game-id').value = gameId || '';
        
        // Reset Globals
        currentTags = []; currentGalleryUrls = []; currentSessionAssets = []; currentDecisions = [];
        tempAssetFile = null;
        renderTags(); window.renderGallery(); window.renderSessionAssets(); window.renderDecisionsList();
        
        // Reset Visuals
        const coverPreview = document.getElementById('admin-cover-preview');
        if(coverPreview) coverPreview.style.display = 'none';
        
        const chkExtra = document.getElementById('check-extra-life');
        const extraCont = document.getElementById('extra-life-config-container');
        if(chkExtra) { chkExtra.checked = false; if(extraCont) extraCont.classList.add('hidden'); }

        const title = document.getElementById('game-modal-title');
        const saveBtn = document.getElementById('save-game-submit-btn');
        const delBtn = document.getElementById('delete-game-btn');

        if (gameId) {
            if(title) title.textContent = "Editar Jogo";
            if(saveBtn) saveBtn.textContent = "Salvar Alterações";
            if(delBtn) delBtn.classList.remove('hidden');
            
            try {
                const doc = await db.collection('games').doc(gameId).get();
                if(doc.exists) {
                    const d = doc.data();
                    const set = (id, v) => { const e = document.getElementById(id); if(e) e.value = v || ''; };
                    
                    set('new-game-name', d.name); set('new-game-status', d.status);
                    set('new-game-duration', d.sessionDuration); set('new-game-price', d.price);
                    set('new-game-short-desc', d.shortDescription); set('new-game-full-desc', d.fullDescription);
                    document.getElementById('new-game-duration').value = d.sessionDuration;
                    document.getElementById('new-game-max-players').value = d.maxPlayers || 1; // Padrão 1 se não existir
                    set('new-game-cover', d.coverImage); set('new-game-trailer', d.videoPreview);
                    
                    // Config Timer
                    const timerSettings = d.timerSettings || {};
                    set('edit-timer-type', timerSettings.type || 'regressive');
                    set('edit-timer-font', timerSettings.font || "'Orbitron', sans-serif");
                    set('edit-timer-color', timerSettings.color || '#ff0000');
                    if(window.updateTimerPreview) window.updateTimerPreview();

                    // Previews e Arrays
                    if(d.coverImage && coverPreview) { coverPreview.src = d.coverImage; coverPreview.style.display = 'block'; }
                    if(d.tags) { currentTags = d.tags; renderTags(); }
                    if(d.galleryImages) { currentGalleryUrls = d.galleryImages; window.renderGallery(); }
                    if(d.sessionAssets) { currentSessionAssets = d.sessionAssets; window.renderSessionAssets(); }
                    if(d.decisions) { currentDecisions = d.decisions; window.renderDecisionsList(); }
                    
                    if(d.hasExtraLife && chkExtra) {
                        chkExtra.checked = true;
                        if(extraCont) extraCont.classList.remove('hidden');
                        document.getElementById('new-game-extra-life-time').value = d.extraLifeDuration || '';
                    }
                }
            } catch(e) { console.error(e); }
        } else {
            if(title) title.textContent = "Criar Novo Jogo";
            if(saveBtn) saveBtn.textContent = "Criar Jogo";
            if(delBtn) delBtn.classList.add('hidden');
            if(window.updateTimerPreview) window.updateTimerPreview();
        }
        createGameModal.classList.remove('hidden');
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

    const chkExtra = document.getElementById('check-extra-life');
    if(chkExtra) chkExtra.onchange = (e) => { const box = document.getElementById('extra-life-config-container'); if(e.target.checked) box.classList.remove('hidden'); else box.classList.add('hidden'); };

    // --- SALVAR JOGO (SUBMIT) ---
    if(createGameForm) createGameForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('game-id').value;
        const btn = document.getElementById('save-game-submit-btn');
        btn.textContent = "Salvando..."; btn.disabled = true;

        const data = {
            name: document.getElementById('new-game-name').value,
            slug: document.getElementById('new-game-name').value.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            status: document.getElementById('new-game-status').value,
            sessionDuration: document.getElementById('new-game-duration').value,
            price: document.getElementById('new-game-price').value,
            hasExtraLife: chkExtra.checked,
            extraLifeDuration: chkExtra.checked ? document.getElementById('new-game-extra-life-time').value : 0,
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