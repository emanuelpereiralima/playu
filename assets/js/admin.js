document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. CONFIGURAÇÃO E VARIÁVEIS GLOBAIS
    // =========================================================================
    const db = window.db || firebase.firestore();
    const auth = window.auth;
    const storage = firebase.storage();

    // --- ESTADO GLOBAL DO APLICATIVO ---
    
    // Jogos & Mídia
    let currentGalleryUrls = []; 
    let currentSessionAssets = []; 
    let currentTags = [];
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
    // 2. GERENCIAMENTO DE USUÁRIOS
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
            // Listeners locais
            document.querySelectorAll('.edit-user-trigger').forEach(btn => btn.addEventListener('click', openEditUserModal));
            if(userSearchInput) triggerUserSearch();
        } catch (e) { console.error("Erro users:", e); }
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
    
    // Fechar Modal Usuário
    if(document.getElementById('close-user-modal')) document.getElementById('close-user-modal').onclick = () => editUserModal.classList.add('hidden');
    if(document.getElementById('cancel-edit-btn')) document.getElementById('cancel-edit-btn').onclick = () => editUserModal.classList.add('hidden');


    // =========================================================================
    // 3. GERENCIAMENTO DE CONTEÚDO (FAQ & SOBRE)
    // =========================================================================
    const faqList = document.getElementById('faq-list-admin');
    const faqModal = document.getElementById('faq-modal');
    const faqForm = document.getElementById('faq-form');

    // Abas internas de conteúdo
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

    // Sobre
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
    // 4. GERENCIAMENTO DE CURSOS
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

    // Helpers Globais de Cursos
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
    // 5. GERENCIAMENTO DE JOGOS & AGENDAS (CORRIGIDO E SEPARADO)
    // =========================================================================
    
    // Referências DOM
    const gameListContainer = document.getElementById('game-list-container');
    const createGameModal = document.getElementById('create-game-modal');
    const createGameForm = document.getElementById('create-game-form');
    const agendaModal = document.getElementById('agenda-modal');

    // Funções Globais de Mídia (Assets)
    window.renderGallery = () => {
        const grid = document.getElementById('gallery-preview-grid');
        if(!grid) return;
        grid.innerHTML = '';
        currentGalleryUrls.forEach((url, i) => {
            grid.innerHTML += `<div class="gallery-item"><img src="${url}"><button type="button" class="gallery-remove-btn" onclick="removeGalleryItem(${i})">✕</button></div>`;
        });
    };

    window.renderSessionAssets = () => {
        const list = document.getElementById('assets-crud-list'); // Atualizado para o ID do CRUD
        if(!list) return;
        list.innerHTML = '';
        if(currentSessionAssets.length === 0) {
            list.innerHTML = '<p style="padding:10px;text-align:center;opacity:0.5;">Sem arquivos.</p>'; return;
        }
        currentSessionAssets.forEach((a, i) => {
            let thumb = a.type.includes('image') ? `<img src="${a.url}" class="crud-item-thumb">` : `<div class="crud-item-thumb"><ion-icon name="videocam"></ion-icon></div>`;
            list.innerHTML += `
            <div class="crud-item">
                ${thumb}
                <div class="crud-item-info"><div class="crud-item-name">${a.name}</div><div class="crud-item-type">${a.type}</div></div>
                <div class="crud-actions">
                    <button type="button" class="submit-btn small-btn" onclick="window.open('${a.url}')"><ion-icon name="eye"></ion-icon></button>
                    <button type="button" class="submit-btn danger-btn small-btn" onclick="removeSessionAsset(${i})"><ion-icon name="trash"></ion-icon></button>
                </div>
            </div>`;
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

    // --- CARREGAR JOGOS (EVENT DELEGATION PARA EVITAR BUGS) ---
    window.loadAllGames = async function() {
        if(!gameListContainer) return;
        gameListContainer.innerHTML = '<div class="loader"></div>';
        try {
            const snap = await db.collection('games').get();
            gameListContainer.innerHTML = '';
            if(snap.empty) { gameListContainer.innerHTML = '<p>Nenhum jogo cadastrado.</p>'; return; }
            
            snap.forEach(doc => {
                const g = doc.data();
                if(g.tags) g.tags.forEach(t => allKnownTags.add(t));
                const card = document.createElement('div'); card.className = 'game-card';
                card.innerHTML = `
                    <button class="delete-corner-btn delete-game-trigger" data-id="${doc.id}" data-name="${g.name}"><ion-icon name="trash-outline"></ion-icon></button>
                    <img src="${g.coverImage||'assets/images/logo.png'}" class="game-card-img" style="height:150px">
                    <div class="game-card-content">
                        <div style="margin-bottom:1rem;"><h3>${g.name}</h3><small>${g.status==='available'?'<span style="color:#00ff88">● On</span>':'<span style="color:#ffbb00">● Off</span>'}</small></div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                            <button class="submit-btn small-btn edit-game-trigger" data-id="${doc.id}">Editar</button>
                            <button class="submit-btn small-btn schedule-game-trigger" data-id="${doc.id}" style="background:var(--primary-color-dark);border:1px solid #444;">Agenda</button>
                            <button class="submit-btn small-btn test-room-trigger" data-id="${doc.id}" data-name="${g.name}" style="grid-column:span 2;background:rgba(0,255,136,0.1);color:#00ff88;">Testar Sala</button>
                        </div>
                    </div>`;
                gameListContainer.appendChild(card);
            });
        } catch(e) { console.error(e); }
    };

    // DELEGATION LISTENER (CORREÇÃO FUNDAMENTAL)
    if(gameListContainer) {
        gameListContainer.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-game-trigger');
            const agendaBtn = e.target.closest('.schedule-game-trigger');
            const testBtn = e.target.closest('.test-room-trigger');
            const delBtn = e.target.closest('.delete-game-trigger');

            if(editBtn) window.openGameModal(editBtn.dataset.id);
            if(agendaBtn) window.openScheduleModal(agendaBtn.dataset.id);
            if(testBtn) window.createFixedTestRoom(testBtn.dataset.id, testBtn.dataset.name);
            if(delBtn) window.openDeleteConfirmModal(delBtn.dataset.id, delBtn.dataset.name);
        });
    }

    // --- FUNÇÃO DE ABRIR MODAL DE JOGO (SAFE MODE) ---
    window.openGameModal = async (gameId) => {
        createGameForm.reset();
        document.getElementById('game-id').value = gameId || '';
        
        // Reset local
        currentTags = []; currentGalleryUrls = []; currentSessionAssets = [];
        tempAssetFile = null;
        renderTags(); window.renderGallery(); window.renderSessionAssets();
        
        // Esconder previews
        const coverPreview = document.getElementById('admin-cover-preview');
        if(coverPreview) coverPreview.style.display = 'none';
        
        // Reset Vida Extra
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
                    set('new-game-cover', d.coverImage); set('new-game-trailer', d.videoPreview);
                    
                    if(d.coverImage && coverPreview) { coverPreview.src = d.coverImage; coverPreview.style.display = 'block'; }
                    if(d.tags) { currentTags = d.tags; renderTags(); }
                    if(d.galleryImages) { currentGalleryUrls = d.galleryImages; window.renderGallery(); }
                    if(d.sessionAssets) { currentSessionAssets = d.sessionAssets; window.renderSessionAssets(); }
                    
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
        }
        createGameModal.classList.remove('hidden');
    };

    // --- FUNÇÃO DE ABRIR MODAL AGENDA ---
    window.openScheduleModal = async (gameId) => {
        currentAgendaGameId = gameId;
        currentAgendaData = {};
        
        // Reset UI Agenda
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

// --- UPLOAD HANDLER GENÉRICO (Para Capa, Galeria, Trailer) ---
    function setupUpload(inputId, type, cb) {
        const input = document.getElementById(inputId);
        if(!input) return;
        input.onchange = async (e) => {
            const files = Array.from(e.target.files);
            if(!files.length) return;
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
            } catch(e) { if(stat) stat.textContent = "Erro."; }
        };
    }

    setupUpload('admin-cover-upload', 'image', (r) => {
        document.getElementById('new-game-cover').value = r[0].url;
        document.getElementById('admin-cover-preview').src = r[0].url;
        document.getElementById('admin-cover-preview').style.display = 'block';
    });
    setupUpload('gallery-upload-input', 'image', (r) => { currentGalleryUrls.push(...r.map(x=>x.url)); window.renderGallery(); });
    setupUpload('admin-trailer-upload', 'video', (r) => { document.getElementById('new-game-trailer').value = r[0].url; });


    // =========================================================================
    // LÓGICA DO CRUD DE ASSETS (FOTO / VÍDEO / ÁUDIO)
    // =========================================================================
    
    // Elementos
    const assetNameInput = document.getElementById('asset-name-input');
    const assetAddBtn = document.getElementById('add-asset-btn');
    const assetStatus = document.getElementById('assets-upload-status');
    const selectedFileDisplay = document.getElementById('selected-file-display');
    const assetFilenameText = document.getElementById('asset-filename-text');
    const clearAssetBtn = document.getElementById('clear-asset-selection');

    // Inputs Específicos
    const inputImage = document.getElementById('upload-asset-image');
    const inputVideo = document.getElementById('upload-asset-video');
    const inputAudio = document.getElementById('upload-asset-audio');

    // Variáveis Temporárias
    let tempAssetType = null;

    // Função auxiliar para lidar com a seleção
    function handleAssetSelection(e, type) {
        const file = e.target.files[0];
        if (file) {
            tempAssetFile = file;
            tempAssetType = type;
            
            // Preenche nome se vazio
            if (assetNameInput && !assetNameInput.value) {
                assetNameInput.value = file.name.split('.')[0];
            }

            // Atualiza UI
            if (selectedFileDisplay) selectedFileDisplay.classList.remove('hidden');
            if (assetFilenameText) assetFilenameText.textContent = `${type.toUpperCase()}: ${file.name}`;
            if (assetAddBtn) {
                assetAddBtn.disabled = false;
                assetAddBtn.classList.remove('secondary-btn');
                assetAddBtn.classList.add('primary-btn'); // Destaque
            }
        }
    }

    // Listeners para cada tipo
    if(inputImage) inputImage.addEventListener('change', (e) => handleAssetSelection(e, 'image'));
    if(inputVideo) inputVideo.addEventListener('change', (e) => handleAssetSelection(e, 'video'));
    if(inputAudio) inputAudio.addEventListener('change', (e) => handleAssetSelection(e, 'audio'));

    // Botão Limpar Seleção
    if(clearAssetBtn) clearAssetBtn.addEventListener('click', () => {
        tempAssetFile = null;
        tempAssetType = null;
        if(inputImage) inputImage.value = '';
        if(inputVideo) inputVideo.value = '';
        if(inputAudio) inputAudio.value = '';
        selectedFileDisplay.classList.add('hidden');
        assetAddBtn.disabled = true;
        assetAddBtn.classList.add('secondary-btn');
        assetAddBtn.classList.remove('primary-btn');
    });

    // Botão Adicionar (Upload + Save to Array)
    if(assetAddBtn) assetAddBtn.addEventListener('click', async () => {
        const name = assetNameInput.value.trim();
        if(!name) return alert("Digite um nome para a mídia.");
        if(!tempAssetFile) return alert("Selecione um arquivo.");
        
        assetStatus.textContent = "Enviando...";
        assetAddBtn.disabled = true;

        try {
            // Define pasta baseada no tipo
            let folder = 'game-assets-misc';
            if(tempAssetType === 'image') folder = 'game-assets-images';
            if(tempAssetType === 'video') folder = 'game-assets-videos';
            if(tempAssetType === 'audio') folder = 'game-assets-audio';

            const ref = storage.ref().child(`${folder}/${Date.now()}_${tempAssetFile.name}`);
            await ref.put(tempAssetFile);
            const url = await ref.getDownloadURL();

            // Adiciona ao array local
            currentSessionAssets.push({ 
                name: name, 
                url: url, 
                type: tempAssetType 
            });

            // Atualiza Lista Visual
            window.renderSessionAssets();

            // Reset UI
            assetNameInput.value = '';
            tempAssetFile = null;
            tempAssetType = null;
            selectedFileDisplay.classList.add('hidden');
            inputImage.value = ''; inputVideo.value = ''; inputAudio.value = '';
            
            assetStatus.textContent = "Adicionado com sucesso!";
            setTimeout(() => { assetStatus.textContent = ''; }, 2000);

        } catch(e) { 
            console.error(e); 
            assetStatus.textContent = "Erro ao enviar."; 
        } finally {
            // Mantém desabilitado até nova seleção
            assetAddBtn.disabled = true;
            assetAddBtn.classList.add('secondary-btn');
            assetAddBtn.classList.remove('primary-btn');
        }
    });

    // Renderizador da Lista (Atualizado para Áudio)
    window.renderSessionAssets = () => {
        const list = document.getElementById('assets-crud-list');
        if(!list) return;
        list.innerHTML = '';
        
        if(currentSessionAssets.length === 0) {
            list.innerHTML = '<p style="padding:10px;text-align:center;opacity:0.5;font-size:0.9rem">Nenhuma mídia adicionada.</p>';
            return;
        }

        currentSessionAssets.forEach((a, i) => {
            let thumb = '';
            // Ícone apropriado por tipo
            if(a.type === 'image') thumb = `<img src="${a.url}" class="crud-item-thumb">`;
            else if(a.type === 'video') thumb = `<div class="crud-item-thumb" style="color:#00ff88"><ion-icon name="videocam"></ion-icon></div>`;
            else if(a.type === 'audio') thumb = `<div class="crud-item-thumb" style="color:#ffbb00"><ion-icon name="musical-notes"></ion-icon></div>`;
            else thumb = `<div class="crud-item-thumb"><ion-icon name="document"></ion-icon></div>`;

            list.innerHTML += `
            <div class="crud-item">
                ${thumb}
                <div class="crud-item-info">
                    <div class="crud-item-name">${a.name}</div>
                    <div class="crud-item-type" style="font-size:0.7rem; opacity:0.7;">${a.type.toUpperCase()}</div>
                </div>
                <div class="crud-actions">
                    <button type="button" class="submit-btn small-btn" onclick="window.open('${a.url}', '_blank')" title="Ver/Ouvir"><ion-icon name="eye"></ion-icon></button>
                    <button type="button" class="submit-btn danger-btn small-btn" onclick="removeSessionAsset(${i})" title="Excluir"><ion-icon name="trash"></ion-icon></button>
                </div>
            </div>`;
        });
    };

    // Tag Keydown
    const tagIn = document.getElementById('tag-input-field');
    if(tagIn) tagIn.onkeydown = (e) => {
        if(e.key==='Enter'||e.key===',') { e.preventDefault(); const v=tagIn.value.trim(); if(v&&!currentTags.includes(v)){currentTags.push(v);renderTags();} tagIn.value=''; }
    };

    const chkExtra = document.getElementById('check-extra-life');
    if(chkExtra) chkExtra.onchange = (e) => {
        const box = document.getElementById('extra-life-config-container');
        if(e.target.checked) box.classList.remove('hidden'); else box.classList.add('hidden');
    };

    // --- SALVAR JOGO ---
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
            galleryImages: currentGalleryUrls,
            sessionAssets: currentSessionAssets,
            isPaused: document.getElementById('new-game-status').value === 'paused'
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
    // 6. AGENDA CALENDAR LOGIC
    // =========================================================================
    // =========================================================================
    // 6. LÓGICA DA AGENDA (VALIDAÇÃO DE DATA/HORA)
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
        
        // Células vazias
        for(let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-day';
            empty.style.opacity = '0';
            empty.style.cursor = 'default';
            grid.appendChild(empty);
        }

        // Data de Hoje (Zerada para comparação apenas de dia)
        const today = new Date();
        today.setHours(0,0,0,0);

        for(let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const el = document.createElement('div');
            el.className = 'calendar-day';
            el.textContent = d;
            el.dataset.date = dateStr;

            const dateObj = new Date(y, m, d);

            // VERIFICAÇÃO 1: Bloquear dias passados
            if(dateObj < today) {
                // Mantém a classe padrão (cinza escuro, not-allowed)
                // Não adiciona onclick
            } else {
                // Dia Futuro ou Hoje
                el.classList.add('available');

                // DESTAQUE 1: Tem horários marcados?
                if(currentAgendaData[dateStr] && currentAgendaData[dateStr].length > 0) {
                    el.classList.add('has-schedule');
                }

                // DESTAQUE 2: É o dia selecionado agora?
                if(editingDateStr === dateStr) {
                    el.classList.add('selected');
                }

                el.onclick = () => openSingleDayEditor(dateStr);
            }
            grid.appendChild(el);
        }
    }

    function openSingleDayEditor(dateStr) {
        editingDateStr = dateStr;
        
        // Atualiza visual do grid (Move a classe .selected)
        document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
        const activeDay = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
        if(activeDay) activeDay.classList.add('selected');

        // Abre o editor
        const modal = document.getElementById('single-day-editor');
        modal.classList.remove('hidden');
        
        const dateParts = dateStr.split('-');
        document.getElementById('editing-date-display').textContent = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        
        // Atualiza a lista de horários já marcados
        renderSlots();

        // VERIFICAÇÃO 2: Filtrar horários no Select
        updateTimeSelectOptions(dateStr);
    }

    // Função Auxiliar: Gera opções de hora, removendo passado se for "Hoje"
    function updateTimeSelectOptions(selectedDateStr) {
        const select = document.getElementById('single-time-input');
        if(!select) return;

        select.innerHTML = '<option value="">Selecionar horário...</option>';

        const now = new Date();
        const isToday = selectedDateStr === now.toISOString().split('T')[0];
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();

        for(let h = 0; h < 24; h++) {
            for(let m = 0; m < 60; m += 30) { // Intervalo de 30 min
                // Se for hoje, verifica se o horário já passou
                if (isToday) {
                    if (h < currentHour || (h === currentHour && m < currentMin)) {
                        continue; // Pula horários passados
                    }
                }

                const timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                
                // Cria a opção
                const option = document.createElement('option');
                option.value = timeStr;
                option.textContent = timeStr;
                select.appendChild(option);
            }
        }
    }

    function renderSlots() {
        const list = document.getElementById('single-day-slots');
        list.innerHTML = '';
        const times = currentAgendaData[editingDateStr] || [];
        
        if(times.length === 0) {
            list.innerHTML = '<span style="font-size:0.8rem; opacity:0.6;">Nenhum horário marcado.</span>';
        }

        times.sort().forEach((t, i) => {
            list.innerHTML += `<div class="tag-capsule"><span>${t}</span><span onclick="removeSlot(${i})">&times;</span></div>`;
        });
    }

    // Funções dos Botões do Editor de Dia
    window.removeSlot = (i) => { 
        currentAgendaData[editingDateStr].splice(i, 1); 
        renderSlots(); 
    };

    if(document.getElementById('add-single-time-btn')) {
        document.getElementById('add-single-time-btn').onclick = () => {
            const v = document.getElementById('single-time-input').value;
            if(v) { 
                if(!currentAgendaData[editingDateStr]) currentAgendaData[editingDateStr] = [];
                // Evita duplicatas
                if(!currentAgendaData[editingDateStr].includes(v)) {
                    currentAgendaData[editingDateStr].push(v); 
                    // Ordena cronologicamente
                    currentAgendaData[editingDateStr].sort();
                    renderSlots(); 
                }
            }
        };
    }

    if(document.getElementById('save-single-day-btn')) {
        document.getElementById('save-single-day-btn').onclick = async () => {
            if(!currentAgendaGameId) return;
            
            // Limpa chave vazia se não houver horários
            if(currentAgendaData[editingDateStr] && currentAgendaData[editingDateStr].length === 0) {
                delete currentAgendaData[editingDateStr];
            }
            
            try {
                await db.collection('games').doc(currentAgendaGameId).update({ availability: currentAgendaData });
                
                // Fecha o editor de dia, mas mantém o calendário
                document.getElementById('single-day-editor').classList.add('hidden');
                document.querySelector('.calendar-day.selected')?.classList.remove('selected');
                
                renderAdminCalendar(); // Re-renderiza para mostrar a bolinha vermelha no dia
            } catch(e) {
                console.error(e);
                alert("Erro ao salvar agenda.");
            }
        };
    }

    if(document.getElementById('clear-day-btn')) {
        document.getElementById('clear-day-btn').onclick = () => {
            if(confirm("Remover todos os horários deste dia?")) {
                delete currentAgendaData[editingDateStr];
                renderSlots();
            }
        };
    }

    // Botão fechar editor auxiliar
    if(document.getElementById('close-day-editor-btn')) {
        document.getElementById('close-day-editor-btn').onclick = () => {
            document.getElementById('single-day-editor').classList.add('hidden');
            document.querySelector('.calendar-day.selected')?.classList.remove('selected');
        };
    }

    // Navegação Mês
    if(document.getElementById('admin-prev-month')) document.getElementById('admin-prev-month').onclick = () => { currentAdminDate.setMonth(currentAdminDate.getMonth()-1); renderAdminCalendar(); };
    if(document.getElementById('admin-next-month')) document.getElementById('admin-next-month').onclick = () => { currentAdminDate.setMonth(currentAdminDate.getMonth()+1); renderAdminCalendar(); };
    
    // (A parte do Bulk pode continuar igual, mas removendo a chamada antiga de populateTimeSelects no final do arquivo)
    // Bulk Actions
    if(document.getElementById('add-bulk-time-btn')) document.getElementById('add-bulk-time-btn').onclick = () => {
        const v = document.getElementById('bulk-time-input').value;
        if(v && !bulkTimesArray.includes(v)) { bulkTimesArray.push(v); renderBulkTimes(); }
    };
    function renderBulkTimes() {
        const l = document.getElementById('bulk-times-list'); l.innerHTML='';
        bulkTimesArray.forEach((t, i) => l.innerHTML+=`<div class="tag-capsule"><span>${t}</span><span onclick="removeBulkTime(${i})">&times;</span></div>`);
    }
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

    // Close Modals
    const closeMod = (id, mid) => { const e=document.getElementById(id); if(e) e.onclick = () => document.getElementById(mid).classList.add('hidden'); };
    closeMod('close-create-game-modal','create-game-modal'); closeMod('cancel-create-game-btn','create-game-modal');
    closeMod('close-agenda-modal','agenda-modal');
    if(document.getElementById('open-create-game-modal-btn')) document.getElementById('open-create-game-modal-btn').onclick = () => window.openGameModal(null);

    // Abas Agenda
    if(document.getElementById('tab-calendar-view')) document.getElementById('tab-calendar-view').onclick = (e) => {
        document.getElementById('schedule-view-calendar').classList.remove('hidden');
        document.getElementById('schedule-view-bulk').classList.add('hidden');
        e.target.classList.add('active'); document.getElementById('tab-bulk-add').classList.remove('active');
        renderAdminCalendar();
    };
    if(document.getElementById('tab-bulk-add')) document.getElementById('tab-bulk-add').onclick = (e) => {
        document.getElementById('schedule-view-calendar').classList.add('hidden');
        document.getElementById('schedule-view-bulk').classList.remove('hidden');
        e.target.classList.add('active'); document.getElementById('tab-calendar-view').classList.remove('active');
    };

    // Test & Delete
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