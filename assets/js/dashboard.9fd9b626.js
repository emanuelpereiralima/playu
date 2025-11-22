document.addEventListener('DOMContentLoaded', () => {
    // Garante acesso às variáveis globais do firebase-config.js
    const db = window.db;
    const auth = window.auth;

    // Elementos UI Gerais
    const userGreeting = document.getElementById('user-greeting');
    const logoutBtn = document.getElementById('logout-btn');
    const editProfileBtn = document.getElementById('edit-profile-btn');
    
    // Elementos de Perfil (Modal)
    const profileModal = document.getElementById('profile-modal');
    const closeProfileModal = document.getElementById('close-profile-modal');
    const profileForm = document.getElementById('profile-form');
    const profileNameInput = document.getElementById('profile-name-input');
    const profileEmailDisplay = document.getElementById('profile-email-display');

    // Elementos do Dashboard
    const myBookingsContainer = document.getElementById('my-bookings-container');
    const gameListContainer = document.getElementById('game-list-container');
    const adminTabs = document.getElementById('admin-tabs');
    const sectionMyBookings = document.getElementById('my-bookings');
    const sectionManageGames = document.getElementById('manage-games');
    const adminActionsContainer = document.getElementById('admin-actions-container');

    let loggedInUser = null;

    // --- 1. INICIALIZAÇÃO E AUTH ---
    function checkAuth() {
        const userSession = sessionStorage.getItem('loggedInUser');
        if (!userSession) {
            window.location.href = 'login.html';
            return;
        }
        loggedInUser = JSON.parse(userSession);
        
        // Atualiza saudação
        updateHeaderGreeting();
        
        setupLogout();
        setupProfileLogic(); // Ativa a edição de nome
        configureViewByRole();
        loadMyBookings();
    }

    function updateHeaderGreeting() {
        // Pega apenas o primeiro nome para exibir
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

    // --- 2. LÓGICA DE EDIÇÃO DE PERFIL (NOVO) ---
    function setupProfileLogic() {
        // Abrir Modal
        editProfileBtn.addEventListener('click', () => {
            profileNameInput.value = loggedInUser.name;
            profileEmailDisplay.value = loggedInUser.email;
            profileModal.classList.remove('hidden');
        });

        // Fechar Modal
        closeProfileModal.addEventListener('click', () => {
            profileModal.classList.add('hidden');
        });

        // Salvar Perfil
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newName = profileNameInput.value.trim();
            const submitBtn = profileForm.querySelector('button[type="submit"]');
            
            if (!newName) return;
            
            submitBtn.textContent = "Salvando...";
            submitBtn.disabled = true;

            try {
                // 1. Atualizar no Firebase Auth (Login)
                const currentUser = auth.currentUser;
                if (currentUser) {
                    await currentUser.updateProfile({ displayName: newName });
                }

                // 2. Atualizar no Firestore (Banco de Dados)
                await db.collection('users').doc(loggedInUser.username).update({
                    name: newName
                });

                // 3. Atualizar Sessão Local e UI
                loggedInUser.name = newName;
                sessionStorage.setItem('loggedInUser', JSON.stringify(loggedInUser));
                updateHeaderGreeting();

                alert("Nome atualizado com sucesso!");
                profileModal.classList.add('hidden');

            } catch (error) {
                console.error("Erro ao atualizar perfil:", error);
                alert("Erro ao salvar. Tente novamente.");
            } finally {
                submitBtn.textContent = "Salvar Alterações";
                submitBtn.disabled = false;
            }
        });
    }

    // --- 3. CONFIGURAÇÃO DE VISUALIZAÇÃO (USER vs ADMIN) ---
    function configureViewByRole() {
        if (loggedInUser.role === 'admin') {
            // === MODO ADMIN ===
            adminTabs.classList.remove('hidden');
            setupTabs();
            
            // Injeta Botão de Criar Jogo
            if(adminActionsContainer.children.length === 0) {
                const addBtn = document.createElement('button');
                addBtn.className = 'submit-btn';
                addBtn.innerHTML = '<ion-icon name="add-circle-outline"></ion-icon> Adicionar Novo Jogo';
                addBtn.onclick = createNewGame;
                adminActionsContainer.appendChild(addBtn);
            }

            loadAllGames(); // Carrega a lista para o admin gerenciar
        } else {
            // === MODO JOGADOR ===
            adminTabs.classList.add('hidden');
            sectionMyBookings.classList.remove('hidden-section');
            sectionManageGames.classList.add('hidden-section');
        }
    }

    function setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
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
            });
        });
    }

    // --- 4. CARREGAR AGENDAMENTOS ---
    async function loadMyBookings() {
        myBookingsContainer.innerHTML = '<div class="loader"></div>';
        try {
            const snapshot = await db.collection('bookings')
                .where('userId', '==', loggedInUser.username)
                .get(); // Removi o orderBy temporariamente para evitar erro de índice

            myBookingsContainer.innerHTML = '';

            if (snapshot.empty) {
                myBookingsContainer.innerHTML = '<p>Você ainda não tem agendamentos. Volte ao site para escolher um jogo.</p>';
                return;
            }

            // Pega dados dos jogos para mostrar nomes bonitos
            const gamesSnapshot = await db.collection('games').get();
            const gamesMap = {};
            gamesSnapshot.forEach(doc => gamesMap[doc.id] = doc.data());

            snapshot.forEach(doc => {
                const booking = doc.data();
                const gameData = gamesMap[booking.gameId] || {};
                const dateObj = booking.bookingDate.toDate();

                const item = document.createElement('div');
                item.className = 'booking-item';
                item.innerHTML = `
                    <div class="booking-item-info">
                        <strong>${gameData.name || 'Jogo Indefinido'}</strong>
                        <span>${dateObj.toLocaleDateString()} às ${dateObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <a href="sala-jogador.html?bookingId=${doc.id}" class="submit-btn small-btn">
                        Entrar na Sala
                    </a>
                `;
                myBookingsContainer.appendChild(item);
            });
        } catch (error) {
            console.error("Erro bookings:", error);
            myBookingsContainer.innerHTML = '<p>Erro ao carregar agendamentos.</p>';
        }
    }

    // --- 5. CARREGAR LISTA DE JOGOS (ADMIN) ---
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
                const card = document.createElement('div');
                card.className = 'game-card';
                card.innerHTML = `
                    <img src="${game.coverImage || 'assets/images/logo.png'}" alt="${game.name}" class="game-card-img">
                    <div class="game-card-content">
                        <h3>${game.name}</h3>
                        <p>Status: ${game.status}</p>
                        <a href="host-panel.html?gameId=${doc.id}" class="submit-btn">
                            <ion-icon name="create-outline"></ion-icon> Editar
                        </a>
                    </div>
                `;
                gameListContainer.appendChild(card);
            });
        } catch (error) {
            console.error("Erro games admin:", error);
        }
    }

    // --- 6. CRIAR NOVO JOGO (COM ESTRUTURA ECOS) ---
    async function createNewGame() {
        if (!confirm("Criar um novo jogo com o template padrão?")) return;

        try {
            // ESTRUTURA BASEADA NO SEU JSON (ECOS)
            const newGameData = {
                name: "Novo Jogo (ECOS Template)",
                ownerId: loggedInUser.username,
                status: "draft", // começa como rascunho
                isPaused: false,
                shortDescription: "Explore ruínas antigas e desvende segredos arcanos.",
                fullDescription: "Em Aventura Mística, você é um explorador corajoso em busca da Relíquia Perdida...",
                coverImage: "assets/images/logo.png", // Placeholder
                videoPreview: "",
                galleryImages: [],
                sessionDuration: "90 minutos",
                availability: {
                    // Datas de exemplo vazias, o host preencherá depois
                },
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('games').add(newGameData);
            // Vai para o editor
            window.location.href = `host-panel.html?gameId=${docRef.id}`;

        } catch (error) {
            console.error("Erro ao criar jogo:", error);
            alert("Falha ao criar jogo.");
        }
    }

    checkAuth();
});