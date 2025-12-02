document.addEventListener('DOMContentLoaded', () => {
    const db = window.db;
    const auth = window.auth;

    // --- UI GERAL ---
    const userGreeting = document.getElementById('user-greeting');
    const logoutBtn = document.getElementById('logout-btn');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    
    // --- ELEMENTOS DO DASHBOARD ---
    const myBookingsContainer = document.getElementById('my-bookings-container');
    const gameListContainer = document.getElementById('game-list-container');
    const userCourseListContainer = document.getElementById('user-course-list');
    const adminActionsContainer = document.getElementById('admin-actions-container');

    // --- ELEMENTOS DE MODAL DE JOGO (Criação/Edição) ---
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
    const gameModalTitle = document.getElementById('game-modal-title');

    // --- MODAL DE PERFIL ---
    const profileModal = document.getElementById('profile-modal');
    const closeProfileModal = document.getElementById('close-profile-modal');
    const profileForm = document.getElementById('profile-form');
    const profileNameInput = document.getElementById('profile-name-input');
    const profileEmailDisplay = document.getElementById('profile-email-display');

    let loggedInUser = null;

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
        
        updateHeaderGreeting();
        setupLogout();
        setupProfileLogic();
        setupGameModalLogic(); // Ativa a lógica do modal de jogos
        configureViewByRole();
        
        loadMyBookings(); // Carrega a aba padrão
    }

    function updateHeaderGreeting() {
        const firstName = loggedInUser.name.split(' ')[0];
        userGreeting.textContent = `Olá, ${firstName}`;
    }

    function setupLogout() {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('loggedInUser');
            if(auth) auth.signOut();
            window.location.href = 'login.html';
        });
    }

    // =========================================================================
    // 2. GERENCIAMENTO DE PERFIL
    // =========================================================================
    function setupProfileLogic() {
        editProfileBtn.addEventListener('click', () => {
            profileNameInput.value = loggedInUser.name;
            profileEmailDisplay.value = loggedInUser.email;
            profileModal.classList.remove('hidden');
        });

        closeProfileModal.addEventListener('click', () => profileModal.classList.add('hidden'));

        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = profileNameInput.value.trim();
            const submitBtn = profileForm.querySelector('button[type="submit"]');
            
            if (!newName) return;
            submitBtn.textContent = "Salvando...";
            submitBtn.disabled = true;

            try {
                const currentUser = auth.currentUser;
                if (currentUser) await currentUser.updateProfile({ displayName: newName });
                
                await db.collection('users').doc(loggedInUser.username).update({ name: newName });

                loggedInUser.name = newName;
                sessionStorage.setItem('loggedInUser', JSON.stringify(loggedInUser));
                updateHeaderGreeting();

                alert("Nome atualizado!");
                profileModal.classList.add('hidden');
            } catch (error) {
                console.error("Erro perfil:", error);
                alert("Erro ao salvar.");
            } finally {
                submitBtn.textContent = "Salvar";
                submitBtn.disabled = false;
            }
        });
    }

    // =========================================================================
    // 3. CONFIGURAÇÃO DE ABAS
    // =========================================================================
    function configureViewByRole() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        
        // Se for admin, habilita a aba de jogos
        if (loggedInUser.role === 'admin') {
            const adminTab = document.getElementById('admin-tab-btn');
            if(adminTab) adminTab.classList.remove('hidden');
            
            if(adminActionsContainer && adminActionsContainer.children.length === 0) {
                const addBtn = document.createElement('button');
                addBtn.className = 'submit-btn';
                addBtn.innerHTML = '<ion-icon name="add-circle-outline"></ion-icon> Adicionar Novo Jogo';
                // Agora abre o modal ao invés de criar rascunho direto
                addBtn.onclick = () => openGameModal(null); 
                adminActionsContainer.appendChild(addBtn);
            }
        }

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.dashboard-section').forEach(s => {
                    s.classList.add('hidden-section');
                    s.classList.remove('active-section');
                });

                btn.classList.add('active');
                const targetId = btn.dataset.target;
                const targetSection = document.getElementById(targetId);
                targetSection.classList.remove('hidden-section');
                targetSection.classList.add('active-section');

                if (targetId === 'my-bookings') loadMyBookings();
                if (targetId === 'courses-area') loadUserCourses();
                if (targetId === 'manage-games' && loggedInUser.role === 'admin') loadAllGames();
            });
        });
    }

    // =========================================================================
    // 4. LÓGICA DE JOGOS (ADMIN) - MODAL E CRUD
    // =========================================================================
    
    function setupGameModalLogic() {
        const closeModal = () => {
            createGameModal.classList.add('hidden');
            createGameForm.reset();
            gameIdHidden.value = '';
            coverPreview.style.display = 'none';
        };

        if(closeCreateGameModal) closeCreateGameModal.addEventListener('click', closeModal);
        if(cancelCreateGameBtn) cancelCreateGameBtn.addEventListener('click', closeModal);

        // Preview da URL da Capa
        const urlInput = document.getElementById('new-game-cover');
        if(urlInput) {
            urlInput.addEventListener('input', (e) => {
                const url = e.target.value;
                if (url) {
                    coverPreview.src = url;
                    coverPreview.style.display = 'block';
                } else {
                    coverPreview.style.display = 'none';
                }
            });
        }

        // Upload de Capa
        if(coverUploadInput) {
            coverUploadInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                uploadStatus.textContent = "Enviando...";
                uploadStatus.style.display = "block";
                uploadStatus.style.color = "#ffbb00";

                try {
                    const storageRef = firebase.storage().ref();
                    const fileRef = storageRef.child(`game-covers/${Date.now()}_${file.name}`);
                    await fileRef.put(file);
                    const url = await fileRef.getDownloadURL();

                    document.getElementById('new-game-cover').value = url;
                    coverPreview.src = url;
                    coverPreview.style.display = 'block';
                    
                    uploadStatus.textContent = "Concluído!";
                    uploadStatus.style.color = "#00ff88";
                } catch (error) {
                    console.error("Erro upload:", error);
                    uploadStatus.textContent = "Erro.";
                    uploadStatus.style.color = "#ff3b3b";
                }
            });
        }

        // Excluir Jogo
        if(deleteGameBtn) {
            deleteGameBtn.addEventListener('click', async () => {
                const id = gameIdHidden.value;
                if(id && confirm("TEM CERTEZA? Isso apagará o jogo permanentemente.")) {
                    try {
                        await db.collection('games').doc(id).delete();
                        alert("Jogo excluído.");
                        localStorage.removeItem('games');
                        closeModal();
                        loadAllGames();
                    } catch (error) {
                        console.error(error);
                        alert("Erro ao excluir.");
                    }
                }
            });
        }

        // Salvar Jogo
        if(createGameForm) {
            createGameForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                saveGameBtn.textContent = "Salvando...";
                saveGameBtn.disabled = true;

                const gameId = gameIdHidden.value;
                const isEditMode = !!gameId;

                const name = document.getElementById('new-game-name').value;
                const status = document.getElementById('new-game-status').value;
                const duration = document.getElementById('new-game-duration').value;
                const tagsRaw = document.getElementById('new-game-tags').value;
                const shortDesc = document.getElementById('new-game-short-desc').value;
                const fullDesc = document.getElementById('new-game-full-desc').value;
                const coverUrl = document.getElementById('new-game-cover').value;
                const galleryRaw = document.getElementById('new-game-gallery').value;
                const trailerUrl = document.getElementById('new-game-trailer').value;

                const tags = tagsRaw.split(',').map(t => t.trim()).filter(t => t);
                const galleryImages = galleryRaw.split(',').map(u => u.trim()).filter(u => u);
                const isPaused = (status === 'paused');
                
                const slug = name.toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9]/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '');

                const gameData = {
                    name, slug, status, sessionDuration: duration,
                    tags, shortDescription: shortDesc, fullDescription: fullDesc,
                    coverImage: coverUrl, galleryImages, videoPreview: trailerUrl,
                    isPaused
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
                        
                        // Muda para modo edição (libera mídia)
                        gameIdHidden.value = docRef.id;
                        gameModalTitle.textContent = "Continuar Editando Jogo";
                        mediaSection.classList.remove('hidden');
                        deleteGameBtn.classList.remove('hidden');
                        saveGameBtn.textContent = "Salvar Alterações";
                        
                        localStorage.removeItem('games');
                        alert("Básico salvo! Agora você pode adicionar Mídia extra.");
                        loadAllGames();
                        return; // Não fecha o modal
                    }
                } catch (error) {
                    console.error("Erro jogo:", error);
                    alert("Erro ao salvar.");
                } finally {
                    if(saveGameBtn.textContent !== "Salvar Alterações") {
                        saveGameBtn.textContent = isEditMode ? "Salvar Alterações" : "Criar Jogo";
                    }
                    saveGameBtn.disabled = false;
                }
            });
        }
    }

    window.openGameModal = async (gameId) => {
        createGameForm.reset();
        uploadStatus.style.display = 'none';
        coverPreview.style.display = 'none';

        if (gameId) {
            gameModalTitle.textContent = "Editar Jogo";
            saveGameBtn.textContent = "Salvar Alterações";
            gameIdHidden.value = gameId;
            mediaSection.classList.remove('hidden');
            deleteGameBtn.classList.remove('hidden');

            try {
                const doc = await db.collection('games').doc(gameId).get();
                if (doc.exists) {
                    const data = doc.data();
                    document.getElementById('new-game-name').value = data.name || '';
                    document.getElementById('new-game-status').value = data.status || 'available';
                    document.getElementById('new-game-duration').value = data.sessionDuration || '';
                    document.getElementById('new-game-tags').value = (data.tags || []).join(', ');
                    document.getElementById('new-game-short-desc').value = data.shortDescription || '';
                    document.getElementById('new-game-full-desc').value = data.fullDescription || '';
                    document.getElementById('new-game-cover').value = data.coverImage || '';
                    if(data.coverImage) {
                        coverPreview.src = data.coverImage;
                        coverPreview.style.display = 'block';
                    }
                    document.getElementById('new-game-gallery').value = (data.galleryImages || []).join(', ');
                    document.getElementById('new-game-trailer').value = data.videoPreview || '';
                }
            } catch (e) { console.error("Erro detalhes:", e); }
        } else {
            gameModalTitle.textContent = "Criar Novo Jogo";
            saveGameBtn.textContent = "Criar Jogo";
            gameIdHidden.value = "";
            mediaSection.classList.add('hidden');
            deleteGameBtn.classList.add('hidden');
        }
        createGameModal.classList.remove('hidden');
    };

    // --- 5. CARREGAR LISTA DE JOGOS (ADMIN) ---
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
                const card = document.createElement('div');
                card.className = 'game-card';
                
                let statusBadge = `<span style="font-size:0.8rem; color:#888;">${game.status}</span>`;
                if(game.status === 'available') statusBadge = `<span style="font-size:0.8rem; color:#00ff88;">● Disponível</span>`;
                if(game.status === 'paused') statusBadge = `<span style="font-size:0.8rem; color:#ffbb00;">● Pausado</span>`;

                card.innerHTML = `
                    <img src="${game.coverImage || 'assets/images/logo.png'}" class="game-card-img">
                    <div class="game-card-content">
                        <h3>${game.name}</h3>
                        <p>${statusBadge}</p>
                        <button class="submit-btn small-btn" onclick="openGameModal('${doc.id}')">
                            <ion-icon name="create-outline"></ion-icon> Editar
                        </button>
                    </div>
                `;
                gameListContainer.appendChild(card);
            });
        } catch (error) {
            console.error("Erro games admin:", error);
        }
    }

    // =========================================================================
    // 6. CARREGAMENTO DE DADOS (AGENDAMENTOS E CURSOS)
    // =========================================================================
    
// --- 4. CARREGAR AGENDAMENTOS (JOGADOR) ---
    async function loadMyBookings() {
        if(!myBookingsContainer) return;
        myBookingsContainer.innerHTML = '<div class="loader"></div>';
        
        try {
            const snapshot = await db.collection('bookings')
                .where('userId', '==', loggedInUser.username)
                .orderBy('date', 'desc') // Ordena por data (mais recente primeiro)
                .get();

            myBookingsContainer.innerHTML = '';

            if (snapshot.empty) {
                myBookingsContainer.innerHTML = '<p>Você ainda não tem agendamentos.</p>';
                return;
            }

            const now = new Date();

            snapshot.forEach(doc => {
                const booking = doc.data();
                
                // Cria objetos de data para cálculo
                // Formato esperado no banco: YYYY-MM-DD e HH:MM
                const sessionStart = new Date(`${booking.date}T${booking.time}`);
                const diffMs = sessionStart - now;
                const diffMinutes = Math.floor(diffMs / 1000 / 60);
                
                // Regra dos 10 minutos
                // Permite entrar se faltar 10 min ou menos (incluindo se já começou)
                // Bloqueia se a sessão já passou há mais de 3 horas (opcional, para limpar a view)
                const isTooEarly = diffMinutes > 10;
                const isExpired = diffMinutes < -180; // 3 horas depois

                let btnHtml = '';
                
                if (isExpired) {
                    btnHtml = `<button class="submit-btn small-btn secondary-btn" disabled style="opacity:0.5">Finalizado</button>`;
                } else if (isTooEarly) {
                    btnHtml = `<button class="submit-btn small-btn secondary-btn" disabled title="Disponível 10 min antes">
                                <ion-icon name="time-outline"></ion-icon> Em breve
                               </button>`;
                } else {
                    btnHtml = `<a href="sala.html?bookingId=${doc.id}" class="submit-btn small-btn" style="background-color: #00ff88; color: #000;">
                                <ion-icon name="play-outline"></ion-icon> Entrar Agora
                               </a>`;
                }

                const dateDisplay = sessionStart.toLocaleDateString() + ' às ' + booking.time;

                const item = document.createElement('div');
                item.className = 'booking-item';
                item.innerHTML = `
                    <div class="booking-item-info">
                        <strong>${booking.gameName}</strong>
                        <span>${dateDisplay}</span>
                    </div>
                    ${btnHtml}
                `;
                myBookingsContainer.appendChild(item);
            });
        } catch (error) {
            console.error("Erro bookings:", error);
            // Se der erro de índice no console, o Firebase pedirá para criar um link.
            // Enquanto isso, tente remover o .orderBy se necessário.
            myBookingsContainer.innerHTML = '<p>Erro ao carregar agendamentos.</p>';
        }
    }
    
    async function loadUserCourses() {
        if(!userCourseListContainer) return;
        userCourseListContainer.innerHTML = '<div class="loader"></div>';
        try {
            const snapshot = await db.collection('courses').get();
            userCourseListContainer.innerHTML = '';
            if (snapshot.empty) {
                userCourseListContainer.innerHTML = '<p>Nenhum curso disponível.</p>';
                return;
            }
            snapshot.forEach(doc => {
                const course = doc.data();
                const card = document.createElement('div');
                card.className = 'game-card';
                card.innerHTML = `
                    <img src="${course.coverImage || 'assets/images/logo.png'}" class="game-card-img" style="height:150px">
                    <div class="game-card-content">
                        <h3>${course.title}</h3>
                        <p>${course.description || ''}</p>
                        <button class="submit-btn small-btn" onclick="openCoursePlayer('${doc.id}')">Assistir</button>
                    </div>
                `;
                userCourseListContainer.appendChild(card);
            });
        } catch (e) {
            console.error(e);
            userCourseListContainer.innerHTML = '<p>Erro.</p>';
        }
    }

    window.openCoursePlayer = async (courseId) => {
        const modal = document.getElementById('course-viewer-modal');
        const listContainer = document.getElementById('course-modules-list');
        const embedWrapper = document.getElementById('video-embed-wrapper');
        const titleEl = document.getElementById('current-video-title');
        
        listContainer.innerHTML = '<div class="loader"></div>';
        embedWrapper.innerHTML = '';
        modal.classList.remove('hidden');

        try {
            const doc = await db.collection('courses').doc(courseId).get();
            if (!doc.exists) return;
            const course = doc.data();
            titleEl.textContent = course.title;
            listContainer.innerHTML = '';

            (course.modules || []).forEach((mod) => {
                const h4 = document.createElement('h4');
                h4.textContent = mod.title;
                h4.style.padding = '10px';
                h4.style.background = 'var(--primary-color-dark)';
                h4.style.marginTop = '10px';
                listContainer.appendChild(h4);

                const ul = document.createElement('ul');
                (mod.videos || []).forEach(vid => {
                    const li = document.createElement('li');
                    li.textContent = `▶ ${vid.title}`;
                    li.style.padding = '8px';
                    li.style.cursor = 'pointer';
                    li.style.borderBottom = '1px solid var(--border-color)';
                    li.onclick = () => {
                        let url = vid.url.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/');
                        embedWrapper.innerHTML = `<iframe src="${url}" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>`;
                    };
                    ul.appendChild(li);
                });
                listContainer.appendChild(ul);
            });
        } catch (e) { console.error(e); }
    };

    if(document.getElementById('close-course-viewer')) {
        document.getElementById('close-course-viewer').addEventListener('click', () => {
            document.getElementById('course-viewer-modal').classList.add('hidden');
            document.getElementById('video-embed-wrapper').innerHTML = '';
        });
    }

    // --- LÓGICA DE SALA DE TESTE ---
    const quickActionsPanel = document.getElementById('quick-actions-panel');
    const createTestBtn = document.getElementById('create-test-room-btn');

    // 1. Mostrar painel para Host/Admin
    if (loggedInUser.role === 'admin' || loggedInUser.role === 'host') {
        if(quickActionsPanel) quickActionsPanel.classList.remove('hidden');
    }

    // 2. Criar a Sala
    if(createTestBtn) {
        createTestBtn.addEventListener('click', async () => {
            const originalText = createTestBtn.innerHTML;
            createTestBtn.textContent = "Criando...";
            createTestBtn.disabled = true;

            try {
                // Cria um agendamento especial do tipo 'test'
                const testSession = {
                    type: 'test', // Flag importante!
                    gameName: "Sala de Teste e Calibragem",
                    hostId: loggedInUser.username,
                    hostName: loggedInUser.name,
                    date: new Date().toISOString().split('T')[0],
                    time: "Agora",
                    status: 'confirmed',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    // Note que não tem 'userId' específico, pois é pública para quem tem o link
                };

                const docRef = await db.collection('bookings').add(testSession);
                
                // Redireciona o Host para a sala de controle
                window.location.href = `sala-host.html?bookingId=${docRef.id}&mode=test`;

            } catch (error) {
                console.error("Erro ao criar teste:", error);
                alert("Erro ao criar sala.");
                createTestBtn.innerHTML = originalText;
                createTestBtn.disabled = false;
            }
        });
    }

    checkAuth();
});