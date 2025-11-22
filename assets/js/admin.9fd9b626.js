document.addEventListener('DOMContentLoaded', () => {
    // Referências Globais (garantidas pelo firebase-config.js)
    const db = window.db;
    const auth = window.auth;

    // --- ELEMENTOS UI GERAIS ---
    const userGreeting = document.getElementById('user-greeting');
    const logoutBtn = document.getElementById('logout-btn');
    
    // --- ELEMENTOS DE USUÁRIOS ---
    const userTableBody = document.getElementById('user-table-body');
    const userSearchInput = document.getElementById('user-search-input'); // Barra de Pesquisa
    
    // Modal de Usuário
    const editUserModal = document.getElementById('edit-user-modal');
    const closeUserModal = document.getElementById('close-user-modal');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const deleteUserBtn = document.getElementById('delete-user-btn');
    const editUserForm = document.getElementById('edit-user-form');
    const editUserIdInput = document.getElementById('edit-user-id');
    const editUserNameInput = document.getElementById('edit-user-name');
    const editUserRoleSelect = document.getElementById('edit-user-role');

    // --- ELEMENTOS DE JOGOS ---
    const gameListContainer = document.getElementById('game-list-container');
    const openCreateGameModalBtn = document.getElementById('open-create-game-modal-btn'); // Botão "Adicionar Novo Jogo"

    // Modal de Jogo
    const createGameModal = document.getElementById('create-game-modal');
    const closeCreateGameModal = document.getElementById('close-create-game-modal');
    const cancelCreateGameBtn = document.getElementById('cancel-create-game-btn');
    const createGameForm = document.getElementById('create-game-form');
    
    // Campos do Modal de Jogo
    const gameIdHidden = document.getElementById('game-id-hidden');
    const gameModalTitle = document.getElementById('game-modal-title');
    const saveGameBtn = document.getElementById('save-game-submit-btn');
    const goToMediaBtn = document.getElementById('go-to-media-btn');

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

        // Proteção: Apenas Admin entra aqui
        if (loggedInUser.role !== 'admin') {
            alert("Acesso restrito a administradores.");
            window.location.href = 'dashboard.html';
            return;
        }
        
        // Setup Inicial
        userGreeting.textContent = `Olá, ${loggedInUser.name.split(' ')[0]}`;
        
        setupLogout();
        setupUserSearch();      // Ativa a barra de pesquisa
        setupUserModalLogic();  // Ativa modal de usuários
        setupGameModalLogic();  // Ativa modal de jogos
        
        // Carrega Dados
        loadAllUsers();
        loadAllGames();
    }

    function setupLogout() {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('loggedInUser');
            if(auth) auth.signOut();
            window.location.href = 'index.html';
        });
    }

    // =========================================================================
    // 2. GERENCIAMENTO DE USUÁRIOS
    // =========================================================================

    // --- Carregar Lista ---
    async function loadAllUsers() {
        userTableBody.innerHTML = '<tr><td colspan="4"><div class="loader"></div></td></tr>';
        
        try {
            const snapshot = await db.collection('users').get();
            
            if (snapshot.empty) {
                userTableBody.innerHTML = '<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>';
                return;
            }

            userTableBody.innerHTML = ''; // Limpa tabela

            snapshot.forEach(doc => {
                const user = doc.data();
                const userId = doc.id;
                
                const tr = document.createElement('tr');
                
                // Formatação visual do cargo
                let roleLabel = user.role;
                if(roleLabel === 'admin') roleLabel = '👑 Admin';
                if(roleLabel === 'host') roleLabel = '🎭 Host';
                if(roleLabel === 'user') roleLabel = '👤 Jogador';

                tr.innerHTML = `
                    <td>${user.name || 'Sem Nome'}</td>
                    <td>${user.email || '---'}</td>
                    <td>${roleLabel}</td>
                    <td>
                        <button class="submit-btn small-btn edit-user-trigger" 
                                data-id="${userId}" 
                                data-name="${user.name}" 
                                data-role="${user.role}">
                            <ion-icon name="create-outline"></ion-icon> Editar
                        </button>
                    </td>
                `;
                userTableBody.appendChild(tr);
            });

            // Reativa a pesquisa (caso o usuário tenha digitado algo antes do reload)
            triggerSearchEvent();

            // Adiciona eventos aos botões Editar
            document.querySelectorAll('.edit-user-trigger').forEach(btn => {
                btn.addEventListener('click', openEditUserModal);
            });

        } catch (error) {
            console.error("Erro ao carregar usuários:", error);
            userTableBody.innerHTML = '<tr><td colspan="4">Erro ao carregar dados.</td></tr>';
        }
    }

    // --- Pesquisa (Filtro Client-Side) ---
    function setupUserSearch() {
        if (!userSearchInput) return;

        userSearchInput.addEventListener('input', triggerSearchEvent);
    }

    function triggerSearchEvent() {
        const searchTerm = userSearchInput.value.toLowerCase();
        const rows = userTableBody.querySelectorAll('tr');

        rows.forEach(row => {
            // Se for linha de loading/erro, ignora
            if(row.cells.length < 2) return;

            const name = row.cells[0].textContent.toLowerCase();
            const email = row.cells[1].textContent.toLowerCase();

            if (name.includes(searchTerm) || email.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    // --- Modal de Usuário (Lógica) ---
    function setupUserModalLogic() {
        // Fechar
        const closeModal = () => editUserModal.classList.add('hidden');
        closeUserModal.addEventListener('click', closeModal);
        cancelEditBtn.addEventListener('click', closeModal);

        // Salvar (Update)
        editUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const uid = editUserIdInput.value;
            const newName = editUserNameInput.value;
            const newRole = editUserRoleSelect.value;
            const submitBtn = editUserForm.querySelector('button[type="submit"]');

            submitBtn.textContent = "Salvando...";
            submitBtn.disabled = true;

            try {
                await db.collection('users').doc(uid).update({
                    name: newName,
                    role: newRole
                });
                alert("Usuário atualizado com sucesso!");
                closeModal();
                loadAllUsers();
            } catch (error) {
                console.error("Erro update:", error);
                alert("Erro ao atualizar usuário.");
            } finally {
                submitBtn.textContent = "Salvar";
                submitBtn.disabled = false;
            }
        });

        // Excluir (Delete)
        deleteUserBtn.addEventListener('click', async () => {
            const uid = editUserIdInput.value;
            
            if (!confirm("ATENÇÃO: Tem certeza que deseja excluir este usuário permanentemente?")) {
                return;
            }
            if (uid === loggedInUser.username) {
                alert("Você não pode excluir sua própria conta aqui.");
                return;
            }

            const originalText = deleteUserBtn.innerHTML;
            deleteUserBtn.textContent = "Excluindo...";
            deleteUserBtn.disabled = true;

            try {
                await db.collection('users').doc(uid).delete();
                alert("Usuário excluído.");
                closeModal();
                loadAllUsers();
            } catch (error) {
                console.error("Erro delete:", error);
                alert("Erro ao excluir usuário.");
            } finally {
                deleteUserBtn.innerHTML = originalText;
                deleteUserBtn.disabled = false;
            }
        });
    }

    function openEditUserModal(e) {
        const btn = e.currentTarget;
        editUserIdInput.value = btn.dataset.id;
        editUserNameInput.value = btn.dataset.name;
        editUserRoleSelect.value = btn.dataset.role;
        editUserModal.classList.remove('hidden');
    }

    // =========================================================================
    // 3. GERENCIAMENTO DE JOGOS
    // =========================================================================

    // --- Carregar Lista ---
    async function loadAllGames() {
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
                const item = document.createElement('div');
                item.className = 'booking-item'; 
                
                // Badge de Status
                let statusColor = '#00ff88'; // Verde (Available)
                if(game.status === 'paused') statusColor = '#ffbb00'; // Amarelo
                if(game.status === 'draft') statusColor = '#888'; // Cinza

                item.innerHTML = `
                    <div class="booking-item-info">
                        <strong>${game.name}</strong>
                        <span style="color: ${statusColor}; font-size: 0.85rem;">
                            ● ${game.status.toUpperCase()}
                        </span>
                    </div>
                    <div class="right-buttons">
                        <button class="submit-btn small-btn edit-game-trigger" data-id="${doc.id}">
                            <ion-icon name="create-outline"></ion-icon> Editar
                        </button>
                    </div>
                `;
                gameListContainer.appendChild(item);
            });

            // Adiciona evento aos botões de editar jogo
            document.querySelectorAll('.edit-game-trigger').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const gameId = e.currentTarget.dataset.id;
                    openGameModal(gameId); // Abre modo Edição
                });
            });

        } catch (error) { 
            console.error(error); 
            gameListContainer.innerHTML = '<p>Erro ao carregar jogos.</p>';
        }
    }

    // --- Modal de Jogo (Lógica Híbrida: Criar/Editar) ---
    function setupGameModalLogic() {
        const closeModal = () => {
            createGameModal.classList.add('hidden');
            createGameForm.reset();
            gameIdHidden.value = '';
        };

        // Botão Abrir (Criar Novo)
        if (openCreateGameModalBtn) {
            openCreateGameModalBtn.addEventListener('click', () => {
                openGameModal(null); // Null = Criar
            });
        }

        // Fechar
        closeCreateGameModal.addEventListener('click', closeModal);
        cancelCreateGameBtn.addEventListener('click', closeModal);

        // Botão Ir para Mídia (Host Panel)
        goToMediaBtn.addEventListener('click', () => {
            const id = gameIdHidden.value;
            if(id) window.location.href = `host-panel.html?gameId=${id}`;
        });

        // Submit do Formulário
        createGameForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const originalText = saveGameBtn.textContent;
            saveGameBtn.textContent = "Salvando...";
            saveGameBtn.disabled = true;

            const gameId = gameIdHidden.value;
            const isEditMode = !!gameId;

            // Coleta Dados do Formulário
            const name = document.getElementById('new-game-name').value;
            const status = document.getElementById('new-game-status').value;
            const duration = document.getElementById('new-game-duration').value;
            const tagsRaw = document.getElementById('new-game-tags').value;
            const shortDesc = document.getElementById('new-game-short-desc').value;
            const fullDesc = document.getElementById('new-game-full-desc').value;
            const coverUrl = document.getElementById('new-game-cover').value;
            const galleryRaw = document.getElementById('new-game-gallery').value;
            const trailerUrl = document.getElementById('new-game-trailer').value;

            // Processamento
            const tags = tagsRaw.split(',').map(t => t.trim()).filter(t => t);
            const galleryImages = galleryRaw.split(',').map(u => u.trim()).filter(u => u);
            const isPaused = (status === 'paused');

            const slug = name.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, "") // Remove acentos
                .replace(/[^a-z0-9]/g, '-') // Substitui símbolos por traço
                .replace(/-+/g, '-') // Remove traços duplicados
                .replace(/^-|-$/g, ''); // Remove traços do início/fim

            const gameData = {
                name: name,
                slug: slug, // <--- Novo campo
                status: status,
                sessionDuration: duration,
                tags: tags,
                shortDescription: shortDesc,
                fullDescription: fullDesc,
                coverImage: coverUrl,
                galleryImages: galleryImages,
                videoPreview: trailerUrl,
                isPaused: isPaused
            };

            try {
                if (isEditMode) {
                    // ATUALIZAR
                    // Nota: Se atualizar o nome, o slug muda e a URL antiga para de funcionar. 
                    // Idealmente, manteríamos o slug antigo se não quisesse mudar, mas para simplificar vamos atualizar.
                    await db.collection('games').doc(gameId).update(gameData);
                    alert("Jogo atualizado!");
                } else {
                    // CRIAR
                    gameData.ownerId = loggedInUser.username;
                    gameData.availability = {};
                    gameData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    
                    const docRef = await db.collection('games').add(gameData);
                    alert("Jogo criado com sucesso!");
                    
                    if(confirm("Deseja adicionar arquivos de mídia agora?")) {
                         window.location.href = `host-panel.html?gameId=${docRef.id}`;
                         return;
                    }
                }
                
                // Força atualização do cache local se estiver usando data-manager
                localStorage.removeItem('games'); 

                closeModal();
                loadAllGames();

            } catch (error) {
                console.error("Erro jogo:", error);
                alert("Erro ao salvar jogo.");
            } finally {
                saveGameBtn.textContent = originalText;
                saveGameBtn.disabled = false;
            }
        });
    }

    async function openGameModal(gameId) {
        // Limpa o form
        createGameForm.reset();

        if (gameId) {
            // --- MODO EDIÇÃO ---
            gameModalTitle.textContent = "Editar Jogo";
            saveGameBtn.textContent = "Salvar Alterações";
            gameIdHidden.value = gameId;
            goToMediaBtn.classList.remove('hidden'); // Mostra botão de mídia

            // Busca dados atuais
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
                    document.getElementById('new-game-gallery').value = (data.galleryImages || []).join(', ');
                    document.getElementById('new-game-trailer').value = data.videoPreview || '';
                }
            } catch (e) {
                console.error("Erro get game details:", e);
                alert("Erro ao carregar detalhes.");
                return;
            }

        } else {
            // --- MODO CRIAÇÃO ---
            gameModalTitle.textContent = "Criar Novo Jogo";
            saveGameBtn.textContent = "Criar Jogo";
            gameIdHidden.value = "";
            goToMediaBtn.classList.add('hidden'); // Esconde mídia (jogo não existe ainda)
        }

        createGameModal.classList.remove('hidden');
    }

    // =========================================================================
    // 4. GERENCIAMENTO DE CONTEÚDO (FAQ E SOBRE)
    // =========================================================================

    // Elementos UI
    const faqListAdmin = document.getElementById('faq-list-admin');
    const addFaqBtn = document.getElementById('add-faq-btn');
    const faqModal = document.getElementById('faq-modal');
    const faqForm = document.getElementById('faq-form');
    const closeFaqModal = document.getElementById('close-faq-modal');
    const cancelFaqBtn = document.getElementById('cancel-faq-btn');
    const deleteFaqBtn = document.getElementById('delete-faq-btn');
    const aboutForm = document.getElementById('about-form');

    // --- Navegação de Abas (Função Global) ---
    window.switchAdminTab = (tabId) => {
        document.querySelectorAll('.dashboard-section').forEach(s => s.classList.add('hidden-section'));
        document.getElementById(tabId).classList.remove('hidden-section');
        
        // Remove classe ativa dos botões
        document.querySelectorAll('.dashboard-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        // Adiciona ao botão clicado (lógica simplificada, ideal é passar o evento)
        event.target.classList.add('active');

        if (tabId === 'content-management') {
            loadFAQs();
            loadAboutText();
        }
    };

    // Lógica das sub-abas (FAQ vs Sobre)
    document.querySelectorAll('.content-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.content-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            document.querySelectorAll('.content-sub-section').forEach(s => s.classList.add('hidden-section'));
            document.getElementById(e.target.dataset.target).classList.remove('hidden-section');
        });
    });

    // --- Lógica do FAQ ---

    async function loadFAQs() {
        faqListAdmin.innerHTML = '<div class="loader"></div>';
        try {
            const doc = await db.collection('siteContent').doc('faq').get();
            let faqs = [];
            if (doc.exists && doc.data().items) {
                faqs = doc.data().items;
            }

            faqListAdmin.innerHTML = '';
            if (faqs.length === 0) {
                faqListAdmin.innerHTML = '<p>Nenhuma pergunta cadastrada.</p>';
                return;
            }

            faqs.forEach((faq, index) => {
                const div = document.createElement('div');
                div.className = 'booking-item';
                div.innerHTML = `
                    <div class="booking-item-info">
                        <strong>${faq.question}</strong>
                        <span>${faq.answer.substring(0, 50)}...</span>
                    </div>
                    <button class="submit-btn small-btn" onclick="openFaqModal(${index})">Editar</button>
                `;
                faqListAdmin.appendChild(div);
            });
            
            // Salva em memória para edição
            window.currentFaqs = faqs;

        } catch (error) {
            console.error("Erro ao carregar FAQs:", error);
            faqListAdmin.innerHTML = '<p>Erro ao carregar.</p>';
        }
    }

    // Modal FAQ
    window.openFaqModal = (index = null) => {
        const isEdit = index !== null;
        document.getElementById('faq-modal-title').textContent = isEdit ? 'Editar Pergunta' : 'Nova Pergunta';
        document.getElementById('faq-id').value = isEdit ? index : '';
        
        if (isEdit) {
            const faq = window.currentFaqs[index];
            document.getElementById('faq-question').value = faq.question;
            document.getElementById('faq-answer').value = faq.answer;
            deleteFaqBtn.classList.remove('hidden');
            deleteFaqBtn.onclick = () => deleteFaq(index);
        } else {
            faqForm.reset();
            deleteFaqBtn.classList.add('hidden');
        }
        
        faqModal.classList.remove('hidden');
    };

    addFaqBtn.addEventListener('click', () => openFaqModal(null));
    const closeFaq = () => faqModal.classList.add('hidden');
    closeFaqModal.addEventListener('click', closeFaq);
    cancelFaqBtn.addEventListener('click', closeFaq);

    // Salvar FAQ
    faqForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const index = document.getElementById('faq-id').value;
        const question = document.getElementById('faq-question').value;
        const answer = document.getElementById('faq-answer').value;
        
        let faqs = window.currentFaqs || [];
        
        const newFaq = { question, answer };

        if (index !== '') {
            faqs[index] = newFaq; // Atualiza existente
        } else {
            faqs.push(newFaq); // Cria novo
        }

        await saveFaqsToFirebase(faqs);
        closeFaq();
    });

    // Deletar FAQ
    async function deleteFaq(index) {
        if (!confirm('Excluir esta pergunta?')) return;
        let faqs = window.currentFaqs;
        faqs.splice(index, 1);
        await saveFaqsToFirebase(faqs);
        closeFaq();
    }

    async function saveFaqsToFirebase(faqs) {
        try {
            await db.collection('siteContent').doc('faq').set({ items: faqs });
            alert('FAQ atualizado!');
            loadFAQs();
        } catch (error) {
            console.error(error);
            alert('Erro ao salvar.');
        }
    }

    // --- Lógica do Sobre ---

    async function loadAboutText() {
        try {
            const doc = await db.collection('siteContent').doc('about').get();
            if (doc.exists) {
                document.getElementById('about-history').value = doc.data().text || '';
            }
        } catch (error) {
            console.error("Erro ao carregar Sobre:", error);
        }
    }

    aboutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = document.getElementById('about-history').value;
        
        try {
            await db.collection('siteContent').doc('about').set({ text });
            alert('Texto "Sobre" atualizado!');
        } catch (error) {
            console.error(error);
            alert('Erro ao salvar.');
        }
    });

    // Inicializa tudo
    checkAuth();
});