// playu/assets/js/admin.js

document.addEventListener('DOMContentLoaded', () => {
    // Referências Globais
    const db = window.db;
    const auth = window.auth;

    // --- ELEMENTOS UI GERAIS ---
    const userGreeting = document.getElementById('user-greeting');
    const logoutBtn = document.getElementById('logout-btn');
    
    // --- ELEMENTOS DE USUÁRIOS ---
    const userTableBody = document.getElementById('user-table-body');
    const userSearchInput = document.getElementById('user-search-input');
    const editUserModal = document.getElementById('edit-user-modal');
    const editUserForm = document.getElementById('edit-user-form');

    // --- ELEMENTOS DE JOGOS ---
    const gameListContainer = document.getElementById('game-list-container');
    const openCreateGameModalBtn = document.getElementById('open-create-game-modal-btn');
    const createGameModal = document.getElementById('create-game-modal');
    const createGameForm = document.getElementById('create-game-form');
    const closeCreateGameModal = document.getElementById('close-create-game-modal');
    const cancelCreateGameBtn = document.getElementById('cancel-create-game-btn');
    const saveGameBtn = document.getElementById('save-game-submit-btn');
    const gameIdHidden = document.getElementById('game-id-hidden');
    const mediaSection = document.getElementById('game-media-section');
    const deleteGameBtn = document.getElementById('delete-game-btn');
    const coverUploadInput = document.getElementById('admin-cover-upload');
    const uploadStatus = document.getElementById('upload-status');
    const coverPreview = document.getElementById('admin-cover-preview');
    
    // Elementos da Agenda
    const schedulePlaceholder = document.getElementById('schedule-placeholder');
    const scheduleContent = document.getElementById('schedule-content');
    const adminCalendarGrid = document.getElementById('admin-calendar-grid');
    const adminMonthHeader = document.getElementById('admin-month-header');
    const singleDayEditor = document.getElementById('single-day-editor');
    const singleDaySlots = document.getElementById('single-day-slots');
    const bulkStartDate = document.getElementById('bulk-start-date');
    const bulkEndDate = document.getElementById('bulk-end-date');
    const bulkTimesList = document.getElementById('bulk-times-list');

    // --- ELEMENTOS DE TAGS ---
    const tagsWrapper = document.getElementById('tags-wrapper');
    const tagInput = document.getElementById('tag-input-field');
    const suggestionsList = document.getElementById('tags-suggestions');

    // --- ELEMENTOS DE CONTEÚDO ---
    const faqListAdmin = document.getElementById('faq-list-admin');
    const addFaqBtn = document.getElementById('add-faq-btn');
    const faqModal = document.getElementById('faq-modal');
    const faqForm = document.getElementById('faq-form');
    const aboutForm = document.getElementById('about-form');

    // --- ELEMENTOS DE CURSOS ---
    const courseListAdmin = document.getElementById('course-list-admin');
    const addCourseBtn = document.getElementById('add-course-btn');
    const courseModal = document.getElementById('course-modal');
    const courseForm = document.getElementById('course-form');
    const modulesContainer = document.getElementById('modules-container');
    const addModuleBtn = document.getElementById('add-module-btn');

    let loggedInUser = null;
    let currentGameData = null; 
    let currentAdminDate = new Date();
    currentAdminDate.setDate(1);
    let editingDateStr = null;
    let bulkTimesArray = [];

    // =========================================================================
    // 1. INICIALIZAÇÃO E AUTH
    // =========================================================================
    
    function checkAuth() {
        const userSession = sessionStorage.getItem('loggedInUser');
        if (!userSession) {
            window.location.href = 'login.html';
            return;
        }
        loggedInUser = JSON.parse(userSession);

        if (loggedInUser.role !== 'admin') {
            alert("Acesso restrito a administradores.");
            window.location.href = 'dashboard.html';
            return;
        }
        
        userGreeting.textContent = `Olá, ${loggedInUser.name.split(' ')[0]}`;
        
        setupLogout();
        setupUserSearch();
        setupUserModalLogic();
        setupGameModalLogic(); 
        
        loadAllUsers();
    }

    function setupLogout() {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('loggedInUser');
            if(auth) auth.signOut();
            window.location.href = 'index.html';
        });
    }

    window.switchAdminTab = (tabId) => {
        document.querySelectorAll('.dashboard-section').forEach(s => s.classList.add('hidden-section'));
        document.getElementById(tabId).classList.remove('hidden-section');
        
        document.querySelectorAll('.dashboard-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        const btns = document.querySelectorAll('.dashboard-tabs .tab-btn');
        btns.forEach(btn => {
            if(btn.getAttribute('onclick').includes(tabId)) btn.classList.add('active');
        });

        if (tabId === 'user-management') loadAllUsers();
        if (tabId === 'game-management') loadAllGames();
        if (tabId === 'content-management') { loadFAQs(); loadAboutText(); }
        if (tabId === 'course-management') loadCourses();
    };

    // =========================================================================
    // 2. GERENCIAMENTO DE USUÁRIOS
    // =========================================================================

    async function loadAllUsers() {
        if(!userTableBody) return;
        userTableBody.innerHTML = '<tr><td colspan="4"><div class="loader"></div></td></tr>';
        try {
            const snapshot = await db.collection('users').get();
            userTableBody.innerHTML = '';
            if (snapshot.empty) {
                userTableBody.innerHTML = '<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>';
                return;
            }
            snapshot.forEach(doc => {
                const user = doc.data();
                const tr = document.createElement('tr');
                let roleLabel = user.role === 'admin' ? '👑 Admin' : (user.role === 'host' ? '🎭 Host' : '👤 Jogador');
                tr.innerHTML = `
                    <td>${user.name || 'Sem Nome'}</td>
                    <td>${user.email || '---'}</td>
                    <td>${roleLabel}</td>
                    <td><button class="submit-btn small-btn edit-user-trigger" data-id="${doc.id}" data-name="${user.name}" data-role="${user.role}"><ion-icon name="create-outline"></ion-icon> Editar</button></td>
                `;
                userTableBody.appendChild(tr);
            });
            document.querySelectorAll('.edit-user-trigger').forEach(btn => btn.addEventListener('click', openEditUserModal));
            triggerSearchEvent();
        } catch (error) { console.error(error); }
    }

    function setupUserSearch() {
        if (userSearchInput) userSearchInput.addEventListener('input', triggerSearchEvent);
    }

    function triggerSearchEvent() {
        const searchTerm = userSearchInput.value.toLowerCase();
        const rows = userTableBody.querySelectorAll('tr');
        rows.forEach(row => {
            if(row.cells.length < 2) return;
            const name = row.cells[0].textContent.toLowerCase();
            const email = row.cells[1].textContent.toLowerCase();
            row.style.display = (name.includes(searchTerm) || email.includes(searchTerm)) ? '' : 'none';
        });
    }

    function setupUserModalLogic() {
        const close = () => editUserModal.classList.add('hidden');
        document.getElementById('close-user-modal').addEventListener('click', close);
        document.getElementById('cancel-edit-btn').addEventListener('click', close);

        editUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const uid = document.getElementById('edit-user-id').value;
            const newName = document.getElementById('edit-user-name').value;
            const newRole = document.getElementById('edit-user-role').value;
            try {
                await db.collection('users').doc(uid).update({ name: newName, role: newRole });
                alert("Usuário atualizado!");
                close();
                loadAllUsers();
            } catch (error) { alert("Erro ao atualizar."); }
        });

        document.getElementById('delete-user-btn').addEventListener('click', async () => {
            const uid = document.getElementById('edit-user-id').value;
            if (uid === loggedInUser.username) return alert("Não pode excluir a si mesmo.");
            if (!confirm("Excluir este usuário permanentemente?")) return;
            try {
                await db.collection('users').doc(uid).delete();
                alert("Usuário excluído.");
                close();
                loadAllUsers();
            } catch (error) { alert("Erro ao excluir."); }
        });
    }

    function openEditUserModal(e) {
        const btn = e.currentTarget;
        document.getElementById('edit-user-id').value = btn.dataset.id;
        document.getElementById('edit-user-name').value = btn.dataset.name;
        document.getElementById('edit-user-role').value = btn.dataset.role;
        editUserModal.classList.remove('hidden');
    }

    // =========================================================================
    // 3. GERENCIAMENTO DE JOGOS (UNIFICADO COM AGENDA)
    // =========================================================================

    function populateTimeSelects() {
        const selects = ['single-time-input', 'bulk-time-input'];
        let options = '<option value="">Selecione...</option>';
        for(let h = 0; h < 24; h++) {
            for(let m = 0; m < 60; m += 30) {
                const time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
                options += `<option value="${time}">${time}</option>`;
            }
        }
        selects.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerHTML = options;
        });
    }

    // --- Lógica de Tags ---
    let currentTags = []; 
    const allKnownTags = new Set(["Ação", "Aventura", "RPG", "Estratégia", "Terror", "Esportes", "Corrida", "Puzzle"]); 

    function renderTags() {
        const existingCapsules = tagsWrapper.querySelectorAll('.tag-capsule');
        existingCapsules.forEach(cap => cap.remove());
        currentTags.forEach((tag, index) => {
            const capsule = document.createElement('div');
            capsule.className = 'tag-capsule';
            capsule.innerHTML = `<span>${tag}</span><span class="close-tag" onclick="removeTag(${index})">&times;</span>`;
            tagsWrapper.insertBefore(capsule, tagInput);
        });
    }

    window.removeTag = (index) => {
        currentTags.splice(index, 1);
        renderTags();
    };

    function addTag(tag) {
        const cleanTag = tag.trim();
        if (cleanTag && !currentTags.includes(cleanTag)) {
            currentTags.push(cleanTag);
            allKnownTags.add(cleanTag);
            renderTags();
        }
        tagInput.value = '';
        suggestionsList.classList.remove('active');
        tagInput.focus();
    }

   // --- Setup do Modal de Jogo (Lógica de Formulário e Uploads) ---
    function setupGameModalLogic() {
        // Variáveis de Estado
        let currentGalleryUrls = []; // Armazena as URLs da galeria atual
        const checkExtraLife = document.getElementById('check-extra-life');
        const extraLifeContainer = document.getElementById('extra-life-config-container');
        const extraLifeInput = document.getElementById('new-game-extra-life-time');

        // CONSTANTES DE TAMANHO
        const MAX_IMG_SIZE = 10 * 1024 * 1024; // 10MB
        const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

        // Elementos
        const trailerUploadInput = document.getElementById('admin-trailer-upload');
        const trailerStatus = document.getElementById('trailer-upload-status');
        const galleryInput = document.getElementById('gallery-upload-input');
        const galleryStatus = document.getElementById('gallery-upload-status');
        const galleryGrid = document.getElementById('gallery-preview-grid');
        const manualGalleryInput = document.getElementById('manual-gallery-url');
        const addManualBtn = document.getElementById('add-manual-url-btn');

        const warningBox = document.getElementById('file-size-warning');
        const warningText = document.getElementById('warning-text');
        const compressLink = document.getElementById('compression-tool-link');

        // --- FUNÇÃO PARA RENDERIZAR GALERIA ---
        window.renderGallery = () => {
            galleryGrid.innerHTML = '';
            currentGalleryUrls.forEach((url, index) => {
                const item = document.createElement('div');
                item.className = 'gallery-item';
                item.innerHTML = `
                    <img src="${url}">
                    <button type="button" class="gallery-remove-btn" onclick="removeGalleryItem(${index})">✕</button>
                `;
                galleryGrid.appendChild(item);
            });
        };

        if(checkExtraLife) {
        checkExtraLife.addEventListener('change', (e) => {
            if (e.target.checked) {
                extraLifeContainer.classList.remove('hidden');
                extraLifeInput.required = true; // Torna obrigatório se marcado
            } else {
                extraLifeContainer.classList.add('hidden');
                extraLifeInput.required = false;
                extraLifeInput.value = ''; // Limpa valor
            }
        });
    }

        // Função global para remover item (precisa ser global para o onclick funcionar)
        window.removeGalleryItem = (index) => {
            currentGalleryUrls.splice(index, 1);
            window.renderGallery();
        };

        // --- INTERCEPTAR A ABERTURA DO MODAL PARA CARREGAR GALERIA ---
        const originalOpenGameModal = window.openGameModal;
        window.openGameModal = (gameId) => {
            // Chama a lógica original de preencher campos
            // Precisamos duplicar parte da lógica aqui ou garantir que currentGalleryUrls seja preenchido
            // Para simplificar, vou reinjetar a lógica de abrir modal aqui:
            
            const modal = document.getElementById('create-game-modal');
            const title = document.getElementById('game-modal-title');
            const btn = document.getElementById('save-game-btn');
            const form = document.getElementById('create-game-form');
            const hiddenId = document.getElementById('game-id');
            const mediaSection = document.getElementById('game-media-section');
            const deleteBtn = document.getElementById('delete-game-btn');
            
            // Limpa estado
            form.reset();
            hiddenId.value = '';
            coverPreview.style.display = 'none';
            currentTags = [];
            currentGalleryUrls = []; // Reseta galeria
            renderTags();
            window.renderGallery();
            
            // Abas
            document.getElementById('schedule-placeholder').classList.remove('hidden');
            document.getElementById('schedule-content').classList.add('hidden');
            warningBox.classList.add('hidden');

            if (gameId) {
                // Modo Edição
                title.textContent = "Editar Jogo";
                btn.textContent = "Salvar Alterações";
                hiddenId.value = gameId;
                mediaSection.classList.remove('hidden');
                if(deleteBtn) deleteBtn.classList.remove('hidden'); // Botão inferior (se existir)
                
                // Busca dados
                db.collection('games').doc(gameId).get().then(doc => {
                    if (doc.exists) {
                        const data = doc.data();
                        document.getElementById('new-game-name').value = data.name;
                        document.getElementById('new-game-status').value = data.status || 'available';
                        document.getElementById('new-game-duration').value = data.sessionDuration || '';
                        document.getElementById('new-game-price').value = data.price || ''; 
                        document.getElementById('new-game-short-desc').value = data.shortDescription || '';
                        document.getElementById('new-game-full-desc').value = data.fullDescription || '';
                        document.getElementById('new-game-cover').value = data.coverImage || '';
                        document.getElementById('new-game-trailer').value = data.videoPreview || '';
                        
                        if (data.coverImage) {
                            coverPreview.src = data.coverImage;
                            coverPreview.style.display = 'block';
                        }

                        if (data.tags) { currentTags = data.tags; renderTags(); }
                        
                        // CARREGA GALERIA DO BANCO
                        if (data.galleryImages && Array.isArray(data.galleryImages)) {
                            currentGalleryUrls = data.galleryImages;
                            window.renderGallery();
                        }

                        // Configura Agenda
                        currentGameData = { id: doc.id, ...data };
                        document.getElementById('schedule-placeholder').classList.add('hidden');
                        document.getElementById('schedule-content').classList.remove('hidden');
                        renderAdminCalendar();

                        document.getElementById('new-game-name').value = data.name;
                        
                        // CARREGA DURAÇÃO E PREÇO
                        document.getElementById('new-game-duration').value = data.sessionDuration || '';
                        document.getElementById('new-game-price').value = data.price || ''; 
                        
                        // CARREGA VIDA EXTRA
                        if (data.hasExtraLife) {
                            checkExtraLife.checked = true;
                            extraLifeContainer.classList.remove('hidden');
                            extraLifeInput.value = data.extraLifeDuration || '';
                        } else {
                            checkExtraLife.checked = false;
                            extraLifeContainer.classList.add('hidden');
                            extraLifeInput.value = '';
                        }

                    }
                });
            } else {
                // Modo Criação
                title.textContent = "Criar Novo Jogo";
                btn.textContent = "Criar Jogo";
                mediaSection.classList.add('hidden');
                if(deleteBtn) deleteBtn.classList.add('hidden');
            }
            modal.classList.remove('hidden');
        };

        const closeModal = () => {
            createGameModal.classList.add('hidden');
            warningBox.classList.add('hidden');
        };

        // Listeners de Fechamento
        if (openCreateGameModalBtn) openCreateGameModalBtn.addEventListener('click', () => window.openGameModal(null));
        closeCreateGameModal.addEventListener('click', closeModal);
        cancelCreateGameBtn.addEventListener('click', closeModal);

        // --- VALIDAÇÃO DE TAMANHO ---
        function validateFile(file, type) {
            const limit = type === 'image' ? MAX_IMG_SIZE : MAX_VIDEO_SIZE;
            const limitMB = type === 'image' ? '10MB' : '100MB';
            
            if (file.size > limit) {
                warningText.textContent = `Arquivo muito grande (${(file.size/1024/1024).toFixed(1)}MB). Limite: ${limitMB}.`;
                if (type === 'image') {
                    compressLink.href = "https://www.iloveimg.com/compress-image";
                } else {
                    compressLink.href = "https://www.freeconvert.com/video-compressor";
                }
                warningBox.classList.remove('hidden');
                return false;
            }
            warningBox.classList.add('hidden');
            return true;
        }

        // --- UPLOAD DE CAPA ---
        coverUploadInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!validateFile(file, 'image')) { coverUploadInput.value = ''; return; }

            uploadStatus.textContent = "Enviando...";
            uploadStatus.style.display = "block";
            try {
                const ref = firebase.storage().ref().child(`game-covers/${Date.now()}_${file.name}`);
                await ref.put(file);
                const url = await ref.getDownloadURL();
                document.getElementById('new-game-cover').value = url;
                coverPreview.src = url;
                coverPreview.style.display = 'block';
                uploadStatus.textContent = "Upload concluído!";
            } catch (error) {
                console.error(error);
                uploadStatus.textContent = "Erro upload.";
            }
        });

        // --- UPLOAD DE GALERIA (MÚLTIPLO) ---
        if (galleryInput) {
            galleryInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                if (files.length === 0) return;

                galleryStatus.textContent = `Enviando ${files.length} imagens...`;
                galleryStatus.style.color = "#ffbb00";

                try {
                    const promises = files.map(async (file) => {
                        if (!validateFile(file, 'image')) return null; // Pula arquivos grandes
                        
                        const ref = firebase.storage().ref().child(`game-gallery/${Date.now()}_${file.name}`);
                        await ref.put(file);
                        return await ref.getDownloadURL();
                    });

                    // Espera todos uploads
                    const results = await Promise.all(promises);
                    
                    // Adiciona URLs válidas ao array
                    const newUrls = results.filter(url => url !== null);
                    currentGalleryUrls = [...currentGalleryUrls, ...newUrls];
                    
                    window.renderGallery();
                    galleryStatus.textContent = "Imagens adicionadas!";
                    galleryStatus.style.color = "#00ff88";
                    
                    // Limpa o input para permitir selecionar as mesmas fotos se quiser
                    galleryInput.value = '';

                } catch (error) {
                    console.error("Erro galeria:", error);
                    galleryStatus.textContent = "Erro ao enviar algumas imagens.";
                    galleryStatus.style.color = "#ff3b3b";
                }
            });
        }

        // Adicionar URL manual na galeria
        if (addManualBtn) {
            addManualBtn.addEventListener('click', () => {
                const url = manualGalleryInput.value.trim();
                if (url) {
                    currentGalleryUrls.push(url);
                    window.renderGallery();
                    manualGalleryInput.value = '';
                }
            });
        }

        // --- UPLOAD DE TRAILER ---
        if(trailerUploadInput) {
            trailerUploadInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (!validateFile(file, 'video')) { trailerUploadInput.value = ''; return; }

                trailerStatus.textContent = "Enviando vídeo (aguarde)...";
                trailerStatus.style.display = "inline-block";
                
                const task = firebase.storage().ref().child(`game-trailers/${Date.now()}_${file.name}`).put(file);
                
                task.on('state_changed', 
                    (snap) => {
                        const pc = (snap.bytesTransferred / snap.totalBytes) * 100;
                        trailerStatus.textContent = `Enviando: ${Math.round(pc)}%`;
                    },
                    (err) => { trailerStatus.textContent = "Erro upload."; },
                    async () => {
                        const url = await task.snapshot.ref.getDownloadURL();
                        document.getElementById('new-game-trailer').value = url;
                        trailerStatus.textContent = "Vídeo carregado!";
                        trailerStatus.style.color = "#00ff88";
                    }
                );
            });
        }

        // --- TAGS (Código existente mantido simplificado aqui) ---
        if (tagInput) {
            tagInput.addEventListener('keydown', (e) => {
                if ((e.key === 'Enter' || e.key === ',') && tagInput.value) {
                    e.preventDefault(); addTag(tagInput.value);
                }
                if (e.key === 'Backspace' && !tagInput.value && currentTags.length) removeTag(currentTags.length - 1);
            });
            // ... (resto da lógica de sugestão de tags) ...
        }

        // --- SUBMIT DO FORMULÁRIO ---
        createGameForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            saveGameBtn.textContent = "Salvando...";
            saveGameBtn.disabled = true;

            const gameId = gameIdHidden.value;
            const isEditMode = !!gameId;

            // Dados
            const name = document.getElementById('new-game-name').value;
            const status = document.getElementById('new-game-status').value;
            const duration = document.getElementById('new-game-duration').value;
            const price = document.getElementById('new-game-price').value; 
            const shortDesc = document.getElementById('new-game-short-desc').value;
            const fullDesc = document.getElementById('new-game-full-desc').value;
            const coverUrl = document.getElementById('new-game-cover').value;
            const trailerUrl = document.getElementById('new-game-trailer').value;

            getElementById('new-game-duration').value; // Agora é number string            
            // CAPTURA DA VIDA EXTRA
            const hasExtraLife = checkExtraLife.checked;
            const extraLifeDuration = hasExtraLife ? document.getElementById('new-game-extra-life-time').value : 0;
            
            const slug = name.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');

            const gameData = {
                name, slug, status, 
                sessionDuration: duration,
                price: price,
                hasExtraLife: hasExtraLife,
                extraLifeDuration: extraLifeDuration,
                tags: currentTags, 
                shortDescription: shortDesc, fullDescription: fullDesc,
                coverImage: coverUrl, 
                galleryImages: currentGalleryUrls, // <--- USA O ARRAY DA GALERIA
                videoPreview: trailerUrl,
                isPaused: (status === 'paused')
            };

            try {
                if (isEditMode) {
                    await db.collection('games').doc(gameId).update(gameData);
                    alert("Jogo atualizado!");
                    localStorage.removeItem('games'); 
                    closeModal();
                    loadAllGames();
                } else {
                    gameData.ownerId = loggedInUser.username;
                    gameData.availability = {};
                    gameData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    
                    const docRef = await db.collection('games').add(gameData);
                    
                    // Passa para modo edição
                    window.openGameModal(docRef.id);
                    alert("Básico salvo! Agora adicione Mídia e Horários.");
                    loadAllGames();
                }
            } catch (error) {
                console.error("Erro:", error);
                alert("Erro ao salvar: " + error.message);
            } finally {
                if(saveGameBtn.textContent !== "Salvar Alterações") saveGameBtn.textContent = isEditMode ? "Salvar Alterações" : "Criar Jogo";
                saveGameBtn.disabled = false;
            }
        });
    }

   // --- 5. CARREGAR LISTA DE JOGOS (LAYOUT EM GRADE) ---
    async function loadAllGames() {
        if(!gameListContainer) return;
        gameListContainer.innerHTML = '<div class="loader"></div>';
        
        try {
            const snapshot = await db.collection('games').get();
            gameListContainer.innerHTML = '';

            if (snapshot.empty) {
                gameListContainer.innerHTML = '<p>Nenhum jogo cadastrado.</p>';
                return;
            }

            snapshot.forEach(doc => {
                const game = doc.data();
                if (game.tags && Array.isArray(game.tags)) game.tags.forEach(t => allKnownTags.add(t));

                const card = document.createElement('div');
                card.className = 'game-card';
                
                let statusBadge = `<span style="font-size:0.8rem; color:#888;">${game.status}</span>`;
                if(game.status === 'available') statusBadge = `<span style="font-size:0.8rem; color:#00ff88;">● Disponível</span>`;
                if(game.status === 'paused') statusBadge = `<span style="font-size:0.8rem; color:#ffbb00;">● Pausado</span>`;

                card.innerHTML = `
                    <button class="delete-corner-btn delete-game-trigger" data-id="${doc.id}" data-name="${game.name}" title="Excluir Jogo">
                        <ion-icon name="trash-outline"></ion-icon>
                    </button>

                    <img src="${game.coverImage || 'assets/images/logo.png'}" class="game-card-img" style="height:150px">
                    
                    <div class="game-card-content">
                        <div style="margin-bottom: 1rem;">
                            <h3 style="margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${game.name}</h3>
                            <p>${statusBadge}</p>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: auto;">
                            
                            <button class="submit-btn small-btn edit-game-trigger" data-id="${doc.id}" style="width:100%; justify-content: center; padding: 0.5rem; font-size: 0.85rem;" title="Editar">
                                <ion-icon name="create-outline"></ion-icon> Editar
                            </button>
                            
                            <button class="submit-btn small-btn schedule-game-trigger" data-id="${doc.id}" style="width:100%; justify-content: center; background-color: var(--primary-color-dark); border: 1px solid var(--border-color); padding: 0.5rem; font-size: 0.85rem;" title="Agenda">
                                <ion-icon name="calendar-outline"></ion-icon> Agenda
                            </button>

                            <button class="submit-btn small-btn test-room-trigger" data-id="${doc.id}" data-name="${game.name}" style="grid-column: span 2; width:100%; justify-content: center; background-color: rgba(0, 255, 136, 0.1); border: 1px solid #00ff88; color: #00ff88;">
                                <ion-icon name="flask-outline"></ion-icon> Abrir Sala de Teste
                            </button>
                        </div>
                    </div>
                `;
                gameListContainer.appendChild(card);
            });
            
            // Listeners
            document.querySelectorAll('.edit-game-trigger').forEach(btn => btn.addEventListener('click', (e) => openGameModal(e.currentTarget.dataset.id)));
            document.querySelectorAll('.schedule-game-trigger').forEach(btn => btn.addEventListener('click', (e) => openScheduleOnly(e.currentTarget.dataset.id)));
            document.querySelectorAll('.test-room-trigger').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const target = e.currentTarget;
                    createFixedTestRoom(target.dataset.id, target.dataset.name);
                });
            });

            // Listener de Exclusão
            document.querySelectorAll('.delete-game-trigger').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const target = e.currentTarget; 
                    openDeleteConfirmModal(target.dataset.id, target.dataset.name);
                });
            });

        } catch (error) { console.error("Erro games:", error); }
    }

    // --- LÓGICA DO MODAL DE EXCLUSÃO SEGURA ---
    let gameToDeleteId = null;
    let gameToDeleteName = null;
    
    const deleteModal = document.getElementById('delete-confirm-modal');
    const deleteInput = document.getElementById('delete-verification-input');
    const confirmDeleteBtn = document.getElementById('confirm-delete-action-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-modal-btn');
    const gameNameDisplay = document.getElementById('delete-game-name-display');

    window.openDeleteConfirmModal = (id, name) => {
        gameToDeleteId = id;
        gameToDeleteName = name;
        
        gameNameDisplay.textContent = name;
        deleteInput.value = '';
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.style.opacity = '0.5';
        
        deleteModal.classList.remove('hidden');
        deleteInput.focus();
    };

    // Verifica o texto digitado
    if (deleteInput) {
        deleteInput.addEventListener('input', (e) => {
            if (e.target.value === gameToDeleteName) {
                confirmDeleteBtn.disabled = false;
                confirmDeleteBtn.style.opacity = '1';
            } else {
                confirmDeleteBtn.disabled = true;
                confirmDeleteBtn.style.opacity = '0.5';
            }
        });
    }

    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', () => {
            deleteModal.classList.add('hidden');
            gameToDeleteId = null;
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (!gameToDeleteId) return;
            
            const originalText = confirmDeleteBtn.textContent;
            confirmDeleteBtn.textContent = "Excluindo...";
            
            try {
                // Deleta o jogo
                await db.collection('games').doc(gameToDeleteId).delete();
                
                // (Opcional) Deletar agendamentos relacionados poderia ser feito via Cloud Functions
                // ou manualmente aqui se quiser fazer uma varredura.
                
                alert(`O jogo "${gameToDeleteName}" foi excluído.`);
                localStorage.removeItem('games');
                
                deleteModal.classList.add('hidden');
                loadAllGames(); // Recarrega a lista
            } catch (error) {
                console.error(error);
                alert("Erro ao excluir.");
            } finally {
                confirmDeleteBtn.textContent = originalText;
            }
        });
    }

    // =========================================================================
    // 4. FUNÇÃO: SALA DE TESTE FIXA (CORRIGIDA)
    // =========================================================================
    window.createFixedTestRoom = async (gameId, gameName) => {
        const fixedBookingId = `test-${gameId}`;
        const btn = document.querySelector(`.test-room-trigger[data-id="${gameId}"]`);
        const originalText = btn ? btn.innerHTML : '';
        
        if(btn) {
            btn.innerHTML = 'Criando...';
            btn.disabled = true;
        }

        try {
            // Cria um agendamento COMPLETO com dados fictícios para não quebrar a sala
            await db.collection('bookings').doc(fixedBookingId).set({
                type: 'test', // Flag essencial
                gameId: gameId,
                gameName: gameName,
                hostId: loggedInUser.username,
                hostName: loggedInUser.name,
                
                // DADOS FICTÍCIOS DO JOGADOR (Para a sala não travar esperando isso)
                userId: 'guest-test', 
                userName: 'Jogador Convidado',
                userEmail: 'convidado@teste.com',
                
                // DADOS DA SESSÃO
                date: new Date().toISOString().split('T')[0], // Hoje
                time: "Sessão de Teste",
                price: "Grátis (Modo Teste)",
                paymentStatus: 'paid',
                status: 'confirmed',
                
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            // Redireciona
            window.location.href = `sala-host.html?bookingId=${fixedBookingId}&mode=test`;

        } catch (error) {
            console.error("Erro ao criar teste:", error);
            alert("Erro ao iniciar teste. Verifique o console.");
            if(btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }
    };

    window.deleteGame = async (gameId) => {
        if (!confirm("TEM CERTEZA? Isso apagará o jogo permanentemente.")) return;
        try {
            await db.collection('games').doc(gameId).delete();
            alert("Jogo excluído.");
            localStorage.removeItem('games');
            createGameModal.classList.add('hidden');
            loadAllGames();
        } catch (error) { alert("Erro ao excluir."); }
    };

    window.openScheduleOnly = async (gameId) => {
        await openGameModal(gameId);
        const modalContent = document.querySelector('#create-game-modal .modal-content');
        if(modalContent) modalContent.classList.add('mode-schedule');
    };

    window.openGameModal = async (gameId) => {
        createGameForm.reset();
        uploadStatus.style.display = 'none';
        coverPreview.style.display = 'none';
        currentTags = [];
        renderTags();
        singleDayEditor.classList.add('hidden');
        bulkTimesArray = [];
        bulkTimesList.innerHTML = '';

        const modalContent = document.querySelector('#create-game-modal .modal-content');
        if(modalContent) modalContent.classList.remove('mode-schedule');

        document.getElementById('schedule-view-calendar').classList.remove('hidden');
        document.getElementById('schedule-view-bulk').classList.add('hidden');
        document.getElementById('tab-calendar-view').classList.add('active');
        document.getElementById('tab-bulk-add').classList.remove('active');

        if (gameId) {
            document.getElementById('game-modal-title').textContent = "Gerenciar Jogo";
            saveGameBtn.textContent = "Salvar Informações";
            gameIdHidden.value = gameId;
            
            mediaSection.classList.remove('hidden');
            deleteGameBtn.classList.remove('hidden');
            
            schedulePlaceholder.classList.add('hidden');
            scheduleContent.classList.remove('hidden');
            
            try {
                const doc = await db.collection('games').doc(gameId).get();
                if (doc.exists) {
                    const data = doc.data();
                    currentGameData = { id: doc.id, ...data };
                    
                    document.getElementById('new-game-name').value = data.name || '';
                    document.getElementById('new-game-status').value = data.status || 'available';
                    document.getElementById('new-game-duration').value = data.sessionDuration || '';
                    document.getElementById('new-game-price').value = data.price || '';
                    if (data.tags && Array.isArray(data.tags)) { currentTags = data.tags; renderTags(); }
                    document.getElementById('new-game-short-desc').value = data.shortDescription || '';
                    document.getElementById('new-game-full-desc').value = data.fullDescription || '';
                    document.getElementById('new-game-cover').value = data.coverImage || '';
                    if(data.coverImage) { coverPreview.src = data.coverImage; coverPreview.style.display = 'block'; }
                    document.getElementById('new-game-gallery').value = (data.galleryImages || []).join(', ');
                    document.getElementById('new-game-trailer').value = data.videoPreview || '';

                    renderAdminCalendar();
                }
            } catch (e) { console.error(e); }

        } else {
            document.getElementById('game-modal-title').textContent = "Criar Novo Jogo";
            saveGameBtn.textContent = "Criar Jogo (Libera Agenda)";
            gameIdHidden.value = "";
            mediaSection.classList.add('hidden');
            deleteGameBtn.classList.add('hidden');
            schedulePlaceholder.classList.remove('hidden');
            scheduleContent.classList.add('hidden');
            currentGameData = null;
        }

        createGameModal.classList.remove('hidden');
    };

    // --- LÓGICA DA AGENDA ---
    
    function renderAdminCalendar() {
        if (!currentGameData) return;
        adminCalendarGrid.innerHTML = '';
        const month = currentAdminDate.getMonth();
        const year = currentAdminDate.getFullYear();
        adminMonthHeader.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentAdminDate);
        const firstDayIndex = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date(); today.setHours(0,0,0,0);

        for (let i = 0; i < firstDayIndex; i++) adminCalendarGrid.innerHTML += `<div></div>`;

        for (let day = 1; day <= daysInMonth; day++) {
            const dateObj = new Date(year, month, day);
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEl = document.createElement('div');
            dayEl.textContent = day;
            dayEl.className = 'calendar-day';

            if (dateObj < today) {
                dayEl.style.opacity = '0.3'; dayEl.style.cursor = 'not-allowed';
            } else {
                dayEl.classList.add('available');
                if (currentGameData.availability && currentGameData.availability[dateStr] && currentGameData.availability[dateStr].length > 0) {
                    dayEl.classList.add('has-schedule');
                    const dot = document.createElement('span');
                    dot.style.cssText = "display:block; width:6px; height:6px; background:var(--secondary-color); border-radius:50%; margin: 2px auto 0;";
                    dayEl.appendChild(dot);
                }
                dayEl.onclick = () => openSingleDayEditor(dateStr);
            }
            adminCalendarGrid.appendChild(dayEl);
        }
    }

    document.getElementById('admin-prev-month').addEventListener('click', () => { currentAdminDate.setMonth(currentAdminDate.getMonth() - 1); renderAdminCalendar(); });
    document.getElementById('admin-next-month').addEventListener('click', () => { currentAdminDate.setMonth(currentAdminDate.getMonth() + 1); renderAdminCalendar(); });

    function openSingleDayEditor(dateStr) {
        editingDateStr = dateStr;
        singleDayEditor.classList.remove('hidden');
        document.getElementById('editing-date-display').textContent = dateStr.split('-').reverse().join('/');
        
        // Injeta Botão de Limpar Dinamicamente se não existir no HTML estático do modal
        let btnContainer = singleDayEditor.querySelector('.editor-btn-container');
        if(!btnContainer) {
            btnContainer = document.createElement('div');
            btnContainer.className = 'editor-btn-container';
            btnContainer.style.cssText = "display:flex; gap:10px; margin-top:10px;";
            
            const clearBtn = document.createElement('button');
            clearBtn.textContent = 'Limpar Dia';
            clearBtn.className = 'submit-btn danger-btn small-btn';
            clearBtn.style.flex = '1';
            clearBtn.onclick = () => {
                if(confirm("Remover todos os horários deste dia?")) {
                    renderSingleDaySlots([]);
                }
            };
            
            // Move o botão salvar existente para dentro
            const saveBtn = document.getElementById('save-single-day-btn');
            saveBtn.style.flex = '1';
            saveBtn.style.width = 'auto'; // Remove width 100%
            saveBtn.style.marginTop = '0';
            
            btnContainer.appendChild(clearBtn);
            btnContainer.appendChild(saveBtn);
            singleDayEditor.appendChild(btnContainer);
        }

        const times = (currentGameData.availability && currentGameData.availability[dateStr]) || [];
        renderSingleDaySlots(times);
    }

    function renderSingleDaySlots(times) {
        singleDaySlots.innerHTML = '';
        times.sort().forEach((time, index) => {
            const tag = document.createElement('div');
            tag.className = 'tag-capsule';
            tag.innerHTML = `<span>${time}</span><span class="close-tag" onclick="removeSingleTime(${index})">&times;</span>`;
            singleDaySlots.appendChild(tag);
        });
    }

    document.getElementById('add-single-time-btn').addEventListener('click', () => {
        const timeVal = document.getElementById('single-time-input').value;
        if (timeVal) {
            let currentTimes = [];
            singleDaySlots.querySelectorAll('.tag-capsule span:first-child').forEach(el => currentTimes.push(el.textContent));
            if (!currentTimes.includes(timeVal)) { currentTimes.push(timeVal); renderSingleDaySlots(currentTimes); }
        }
    });

    window.removeSingleTime = (index) => {
        let currentTimes = [];
        singleDaySlots.querySelectorAll('.tag-capsule span:first-child').forEach(el => currentTimes.push(el.textContent));
        currentTimes.splice(index, 1);
        renderSingleDaySlots(currentTimes);
    };

    document.getElementById('save-single-day-btn').addEventListener('click', async () => {
        if (!editingDateStr || !currentGameData) return;
        let newTimes = [];
        singleDaySlots.querySelectorAll('.tag-capsule span:first-child').forEach(el => newTimes.push(el.textContent));
        newTimes.sort();
        if (!currentGameData.availability) currentGameData.availability = {};
        if (newTimes.length > 0) currentGameData.availability[editingDateStr] = newTimes;
        else delete currentGameData.availability[editingDateStr];

        try {
            await db.collection('games').doc(currentGameData.id).update({ availability: currentGameData.availability });
            alert('Horários atualizados!');
            singleDayEditor.classList.add('hidden');
            renderAdminCalendar();
        } catch (e) { console.error(e); alert('Erro ao salvar.'); }
    });

    // Bulk
    document.getElementById('add-bulk-time-btn').addEventListener('click', () => {
        const timeVal = document.getElementById('bulk-time-input').value;
        if (timeVal && !bulkTimesArray.includes(timeVal)) { bulkTimesArray.push(timeVal); bulkTimesArray.sort(); renderBulkTimes(); }
    });

    function renderBulkTimes() {
        bulkTimesList.innerHTML = '';
        bulkTimesArray.forEach((time, index) => {
            const tag = document.createElement('div');
            tag.className = 'tag-capsule';
            tag.innerHTML = `<span>${time}</span><span class="close-tag" onclick="removeBulkTime(${index})">&times;</span>`;
            bulkTimesList.appendChild(tag);
        });
    }

    window.removeBulkTime = (index) => { bulkTimesArray.splice(index, 1); renderBulkTimes(); };

    // APLICAR AGENDAMENTO EM MASSA (CORRIGIDO)
    document.getElementById('apply-bulk-schedule-btn').addEventListener('click', async () => {
        const startStr = bulkStartDate.value;
        const endStr = bulkEndDate.value;
        
        if (!startStr || !endStr || bulkTimesArray.length === 0) {
            alert("Preencha data de início, fim e adicione pelo menos um horário.");
            return;
        }

        // CORREÇÃO DE FUSO HORÁRIO:
        // Cria as datas considerando o fuso local (adicionando T00:00:00)
        // Isso evita que o dia "volte" um dia ao converter
        const startDate = new Date(startStr + 'T00:00:00');
        const endDate = new Date(endStr + 'T00:00:00');
        
        const selectedWeekdays = [];
        document.querySelectorAll('#schedule-view-bulk input[type="checkbox"]:checked').forEach(cb => {
            selectedWeekdays.push(parseInt(cb.value));
        });

        if (selectedWeekdays.length === 0) {
            alert("Selecione pelo menos um dia da semana.");
            return;
        }

        if (!currentGameData.availability) currentGameData.availability = {};

        let loopDate = new Date(startDate);
        let countChanges = 0;

        while (loopDate <= endDate) {
            const dayOfWeek = loopDate.getDay(); // 0 = Dom, 6 = Sáb
            
            if (selectedWeekdays.includes(dayOfWeek)) {
                // Gera a chave YYYY-MM-DD usando métodos locais para garantir a data correta
                const year = loopDate.getFullYear();
                const month = String(loopDate.getMonth() + 1).padStart(2, '0');
                const day = String(loopDate.getDate()).padStart(2, '0');
                const dateKey = `${year}-${month}-${day}`;
                
                // Mescla horários
                const existing = currentGameData.availability[dateKey] || [];
                const merged = [...new Set([...existing, ...bulkTimesArray])].sort();
                
                currentGameData.availability[dateKey] = merged;
                countChanges++;
            }
            // Avança um dia
            loopDate.setDate(loopDate.getDate() + 1);
        }

        try {
            await db.collection('games').doc(currentGameData.id).update({
                availability: currentGameData.availability
            });
            alert(`Sucesso! Agenda atualizada em ${countChanges} datas.`);
            // Volta para calendário para ver o resultado
            document.getElementById('tab-calendar-view').click();
        } catch (e) { 
            console.error(e); 
            alert("Erro ao salvar em massa."); 
        }
    });

    // =========================================================================
    // 4. GERENCIAMENTO DE CONTEÚDO (FAQ E SOBRE)
    // =========================================================================

    document.querySelectorAll('.content-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if(e.target.closest('#schedule-content')) return; 
            document.querySelectorAll('.content-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            document.querySelectorAll('.content-sub-section').forEach(s => s.classList.add('hidden-section'));
            document.getElementById(e.target.dataset.target).classList.remove('hidden-section');
        });
    });

    async function loadFAQs() {
        faqListAdmin.innerHTML = '<div class="loader"></div>';
        try {
            const doc = await db.collection('siteContent').doc('faq').get();
            let faqs = doc.exists ? (doc.data().items || []) : [];
            faqListAdmin.innerHTML = '';
            if (faqs.length === 0) { faqListAdmin.innerHTML = '<p>Nenhuma pergunta.</p>'; return; }
            
            window.currentFaqs = faqs;
            faqs.forEach((faq, index) => {
                const div = document.createElement('div');
                div.className = 'booking-item';
                div.innerHTML = `
                    <div class="booking-item-info"><strong>${faq.question}</strong><span>${faq.answer.substring(0,50)}...</span></div>
                    <button class="submit-btn small-btn" onclick="openFaqModal(${index})">Editar</button>
                `;
                faqListAdmin.appendChild(div);
            });
        } catch (error) { console.error(error); }
    }

    window.openFaqModal = (index = null) => {
        const isEdit = index !== null;
        document.getElementById('faq-modal-title').textContent = isEdit ? 'Editar Pergunta' : 'Nova Pergunta';
        document.getElementById('faq-id').value = isEdit ? index : '';
        const deleteBtn = document.getElementById('delete-faq-btn');
        
        if (isEdit) {
            const faq = window.currentFaqs[index];
            document.getElementById('faq-question').value = faq.question;
            document.getElementById('faq-answer').value = faq.answer;
            deleteBtn.classList.remove('hidden');
            deleteBtn.onclick = () => deleteFaq(index);
        } else {
            faqForm.reset();
            deleteBtn.classList.add('hidden');
        }
        faqModal.classList.remove('hidden');
    };

    addFaqBtn.addEventListener('click', () => openFaqModal(null));
    document.getElementById('close-faq-modal').addEventListener('click', () => faqModal.classList.add('hidden'));
    document.getElementById('cancel-faq-btn').addEventListener('click', () => faqModal.classList.add('hidden'));

    faqForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const index = document.getElementById('faq-id').value;
        const newFaq = { 
            question: document.getElementById('faq-question').value, 
            answer: document.getElementById('faq-answer').value 
        };
        let faqs = window.currentFaqs || [];
        if (index !== '') faqs[index] = newFaq;
        else faqs.push(newFaq);
        await saveFaqs(faqs);
        faqModal.classList.add('hidden');
    });

    async function deleteFaq(index) {
        if (!confirm('Excluir pergunta?')) return;
        let faqs = window.currentFaqs;
        faqs.splice(index, 1);
        await saveFaqs(faqs);
        faqModal.classList.add('hidden');
    }

    async function saveFaqs(faqs) {
        try {
            await db.collection('siteContent').doc('faq').set({ items: faqs });
            loadFAQs();
        } catch (error) { alert('Erro ao salvar.'); }
    }

    async function loadAboutText() {
        try {
            const doc = await db.collection('siteContent').doc('about').get();
            if (doc.exists) document.getElementById('about-history').value = doc.data().text || '';
        } catch (error) { console.error(error); }
    }

    aboutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await db.collection('siteContent').doc('about').set({ text: document.getElementById('about-history').value });
            alert('Texto "Sobre" atualizado!');
        } catch (error) { alert('Erro ao salvar.'); }
    });

    // =========================================================================
    // 5. GERENCIAMENTO DE CURSOS
    // =========================================================================

    const closeCourseModal = document.getElementById('close-course-modal');
    const cancelCourseBtn = document.getElementById('cancel-course-btn');
    const deleteCourseBtn = document.getElementById('delete-course-btn');
    let currentCourseModules = [];

    async function loadCourses() {
        if(!courseListAdmin) return;
        courseListAdmin.innerHTML = '<div class="loader"></div>';
        try {
            const snapshot = await db.collection('courses').get();
            courseListAdmin.innerHTML = '';
            if (snapshot.empty) { courseListAdmin.innerHTML = '<p>Nenhum curso.</p>'; return; }
            snapshot.forEach(doc => {
                const course = doc.data();
                const card = document.createElement('div');
                card.className = 'game-card';
                card.innerHTML = `
                    <img src="${course.coverImage || 'assets/images/logo.png'}" class="game-card-img" style="height:150px">
                    <div class="game-card-content">
                        <h3>${course.title}</h3>
                        <p>${(course.modules||[]).length} Módulos</p>
                        <button class="submit-btn small-btn" onclick="openCourseModal('${doc.id}')">Editar</button>
                    </div>
                `;
                courseListAdmin.appendChild(card);
            });
        } catch (e) { console.error(e); }
    }

    window.openCourseModal = async (courseId = null) => {
        document.getElementById('course-modal-title').textContent = courseId ? 'Editar Curso' : 'Novo Curso';
        document.getElementById('course-id').value = courseId || '';
        document.getElementById('course-title').value = '';
        document.getElementById('course-desc').value = '';
        document.getElementById('course-cover').value = '';
        currentCourseModules = [];
        renderModulesInput();

        if (courseId) {
            deleteCourseBtn.classList.remove('hidden');
            deleteCourseBtn.onclick = () => deleteCourse(courseId);
            try {
                const doc = await db.collection('courses').doc(courseId).get();
                if (doc.exists) {
                    const data = doc.data();
                    document.getElementById('course-title').value = data.title;
                    document.getElementById('course-desc').value = data.description;
                    document.getElementById('course-cover').value = data.coverImage;
                    currentCourseModules = data.modules || [];
                    renderModulesInput();
                }
            } catch (e) { console.error(e); }
        } else { deleteCourseBtn.classList.add('hidden'); }
        courseModal.classList.remove('hidden');
    };

    function renderModulesInput() {
        modulesContainer.innerHTML = '';
        currentCourseModules.forEach((mod, modIndex) => {
            const modDiv = document.createElement('div');
            modDiv.style.background = 'rgba(0,0,0,0.2)';
            modDiv.style.padding = '1rem';
            modDiv.style.marginBottom = '1rem';
            modDiv.style.borderRadius = '5px';
            modDiv.innerHTML = `
                <div style="display:flex; gap:10px; margin-bottom:10px; align-items:center;">
                    <strong style="color:var(--secondary-color)">Módulo ${modIndex + 1}</strong>
                    <input type="text" value="${mod.title}" placeholder="Nome do Módulo" class="module-title-input" data-index="${modIndex}" style="flex:1; padding:5px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color);">
                    <button type="button" class="submit-btn danger-btn small-btn" onclick="removeModule(${modIndex})">X</button>
                </div>
                <div class="videos-list-${modIndex}" style="padding-left:1rem; border-left:2px solid var(--border-color);"></div>
                <button type="button" class="submit-btn small-btn secondary-btn" onclick="addVideo(${modIndex})" style="margin-top:10px; width:100%">+ Aula</button>
            `;
            const videosContainer = modDiv.querySelector(`.videos-list-${modIndex}`);
            (mod.videos || []).forEach((vid, vidIndex) => {
                const vidRow = document.createElement('div');
                vidRow.style.display = 'flex';
                vidRow.style.gap = '5px';
                vidRow.style.marginTop = '5px';
                vidRow.innerHTML = `
                    <input type="text" value="${vid.title}" placeholder="Título Aula" onchange="updateVideo(${modIndex}, ${vidIndex}, 'title', this.value)" style="padding:5px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color);">
                    <input type="text" value="${vid.url}" placeholder="Link" onchange="updateVideo(${modIndex}, ${vidIndex}, 'url', this.value)" style="padding:5px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-color); color:var(--text-color);">
                    <button type="button" class="submit-btn danger-btn small-btn" onclick="removeVideo(${modIndex}, ${vidIndex})">X</button>
                `;
                videosContainer.appendChild(vidRow);
            });
            modulesContainer.appendChild(modDiv);
        });
        document.querySelectorAll('.module-title-input').forEach(input => {
            input.addEventListener('input', (e) => { currentCourseModules[e.target.dataset.index].title = e.target.value; });
        });
    }

    // Helpers Curso
    window.addModule = () => { currentCourseModules.push({ title: '', videos: [] }); renderModulesInput(); };
    window.removeModule = (i) => { if(confirm('Remover?')) { currentCourseModules.splice(i, 1); renderModulesInput(); } };
    window.addVideo = (i) => { currentCourseModules[i].videos.push({ title: '', url: '' }); renderModulesInput(); };
    window.removeVideo = (mi, vi) => { currentCourseModules[mi].videos.splice(vi, 1); renderModulesInput(); };
    window.updateVideo = (mi, vi, f, v) => { currentCourseModules[mi].videos[vi][f] = v; };

    if(addModuleBtn) addModuleBtn.addEventListener('click', window.addModule);
    if(addCourseBtn) addCourseBtn.addEventListener('click', () => openCourseModal(null));
    const closeCourse = () => courseModal.classList.add('hidden');
    if(closeCourseModal) closeCourseModal.addEventListener('click', closeCourse);
    if(cancelCourseBtn) cancelCourseBtn.addEventListener('click', closeCourse);

    if(courseForm) {
        courseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('course-id').value;
            const data = {
                title: document.getElementById('course-title').value,
                description: document.getElementById('course-desc').value,
                coverImage: document.getElementById('course-cover').value,
                modules: currentCourseModules,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            try {
                if(id) await db.collection('courses').doc(id).update(data);
                else await db.collection('courses').add(data);
                alert('Curso salvo!');
                closeCourse();
                loadCourses();
            } catch (e) { alert('Erro ao salvar.'); }
        });
    }

    window.deleteCourse = async (id) => {
        if(confirm('Excluir curso?')) {
            await db.collection('courses').doc(id).delete();
            closeCourse();
            loadCourses();
        }
    };

    // Inicializa
    populateTimeSelects();
    checkAuth();
});