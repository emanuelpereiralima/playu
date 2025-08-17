document.addEventListener('DOMContentLoaded', () => {
    // Lógica dos botões do Header
    const showProfileBtn = document.getElementById('show-profile-btn');
    const profilePanel = document.querySelector('.profile-panel');
    const logoutBtn = document.getElementById('logout-btn');

    if (showProfileBtn && profilePanel) {
        showProfileBtn.addEventListener('click', () => {
            profilePanel.classList.toggle('hidden');
        });
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('loggedInUser');
            window.location.href = 'login.html';
        });
    }

    // Lógica de Gerenciamento de Jogos
    const gameListContainer = document.getElementById('game-list-container');
    const addNewGameBtn = document.getElementById('add-new-game-btn');
    const gameFormModal = document.getElementById('game-form-modal');
    const gameForm = document.getElementById('game-form');
    const cancelBtn = document.getElementById('cancel-btn');
    const modalTitle = document.getElementById('modal-title');
    const gameIdInput = document.getElementById('game-id');

    function renderGameList() {
        if (!gameListContainer) return;
        gameListContainer.innerHTML = '';
        const games = getGames();

        if (!games || games.length === 0) {
            gameListContainer.innerHTML = '<p>Nenhum jogo encontrado. Adicione um para começar.</p>';
            return;
        }

        games.forEach(game => {
            const gameElement = document.createElement('details');
            gameElement.className = 'game-list-item';
            
            const statusClass = game.status === 'pending' ? 'status-pending' : 'status-approved';
            let mainActionButtons = `
                <button class="schedule-btn" data-id="${game.id}">Agendar</button>
                <button class="edit-btn" data-id="${game.id}">Editar Jogo</button>
                <button class="remove-btn" data-id="${game.id}">Remover Jogo</button>
            `;
            if (game.status === 'pending') {
                mainActionButtons = `<button class="approve-btn" data-id="${game.id}">Aprovar</button>` + mainActionButtons;
            }

            gameElement.innerHTML = `
                <summary>
                    <div>
                        <span>${game.name}</span>
                        <span class="status-badge ${statusClass}">${game.status || 'N/A'}</span>
                        <span class="owner-badge">Dono: ${game.ownerId || 'N/A'}</span>
                    </div>
                    <div class="item-actions">${mainActionButtons}</div>
                </summary>
                `;
            gameListContainer.appendChild(gameElement);
        });
        addEventListenersToButtons();
    }

    function addEventListenersToButtons() {
        document.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', handleEditGame));
        document.querySelectorAll('.remove-btn').forEach(b => b.addEventListener('click', handleRemoveGame));
        document.querySelectorAll('.approve-btn').forEach(b => b.addEventListener('click', handleApproveGame));
        document.querySelectorAll('.schedule-btn').forEach(b => b.addEventListener('click', (e) => {
            if (window.openAvailabilityModal) window.openAvailabilityModal(e.target.dataset.id);
        }));
    }

    function handleEditGame(event) {
        const gameId = event.target.dataset.id;
        const game = getGames().find(g => g.id === gameId);
        if (!game) return;
        modalTitle.textContent = 'Editar Jogo';
        gameForm.reset();
        gameIdInput.value = game.id;
        document.getElementById('name').value = game.name;
        document.getElementById('fullDescription').value = game.fullDescription;
        document.getElementById('isPaused').checked = game.isPaused || false;
        gameFormModal.showModal();
    }

    function handleRemoveGame(event) {
        const gameId = event.target.dataset.id;
        let games = getGames();
        const gameToRemove = games.find(g => g.id === gameId);
        if (gameToRemove && confirm(`Remover "${gameToRemove.name}"?`)) {
            saveGames(games.filter(g => g.id !== gameId));
            renderGameList();
        }
    }

    function handleApproveGame(event) {
        const gameId = event.target.dataset.id;
        let games = getGames();
        const gameIndex = games.findIndex(g => g.id === gameId);
        if (gameIndex > -1) {
            games[gameIndex].status = 'approved';
            saveGames(games);
            renderGameList();
        }
    }

    addNewGameBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Adicionar Novo Jogo';
        gameForm.reset();
        gameIdInput.value = '';
        gameFormModal.showModal();
    });

    cancelBtn.addEventListener('click', () => gameFormModal.close());

    gameForm.addEventListener('submit', (event) => {
        event.preventDefault();
        let allGames = getGames();
        const editingId = gameIdInput.value;
        const formData = {
            name: document.getElementById('name').value,
            fullDescription: document.getElementById('fullDescription').value,
            isPaused: document.getElementById('isPaused').checked
        };
        if (editingId) {
            const gameIndex = allGames.findIndex(g => g.id === editingId);
            if (gameIndex > -1) {
                allGames[gameIndex] = { ...allGames[gameIndex], ...formData };
            }
        } else {
            const newGame = {
                id: formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, ''),
                ownerId: 'admin',
                status: 'approved',
                shortDescription: (formData.fullDescription || '').substring(0, 50) + '...',
                coverImage: "https://via.placeholder.com/500x700/cccccc/FFFFFF?text=Novo+Jogo",
                videoPreview: "",
                galleryImages: [],
                sessionDuration: "60 minutos",
                availability: {},
                ...formData
            };
            allGames.push(newGame);
        }
        saveGames(allGames);
        renderGameList();
        gameFormModal.close();
    });

    renderGameList();
});