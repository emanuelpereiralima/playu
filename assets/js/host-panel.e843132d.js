document.addEventListener('DOMContentLoaded', () => {
    // --- 1. VERIFICAÇÃO DE SESSÃO E PERMISSÃO ---
    const sessionDataString = sessionStorage.getItem('loggedInUser');
    if (!sessionDataString) {
        window.location.href = 'login.html';
        return;
    }
    const loggedInUser = JSON.parse(sessionDataString);
    if (loggedInUser.role !== 'host') {
        alert('Acesso negado. Esta página é apenas para hosts.');
        window.location.href = 'login.html';
        return;
    }

    // --- 2. SELEÇÃO DOS ELEMENTOS DO DOM ---
    document.getElementById('host-username').textContent = loggedInUser.name;
    const gameListContainer = document.getElementById('game-list-container');
    const addNewGameBtn = document.getElementById('add-new-game-btn'); // <-- ESTA LINHA ESTAVA FALTANDO
    const gameFormModal = document.getElementById('game-form-modal');
    const gameForm = document.getElementById('game-form');
    const cancelBtn = document.getElementById('cancel-btn');
    const modalTitle = document.getElementById('modal-title');
    const gameIdInput = document.getElementById('game-id');

    // --- 3. FUNÇÕES DE MANIPULAÇÃO DE DADOS (localStorage) ---
    function getAllGamesFromStorage() {
        const storedGames = localStorage.getItem('games');
        if (storedGames) return JSON.parse(storedGames);
        const defaultGames = typeof DEFAULT_GAMES_DATA !== 'undefined' ? DEFAULT_GAMES_DATA : [];
        localStorage.setItem('games', JSON.stringify(defaultGames));
        return defaultGames;
    }

    function saveAllGamesToStorage(allGames) {
        localStorage.setItem('games', JSON.stringify(allGames));
    }

    // --- 4. LÓGICA PRINCIPAL DE RENDERIZAÇÃO E EVENTOS ---
    function renderGameList() {
        gameListContainer.innerHTML = '';
        const allGames = getAllGamesFromStorage();
        const hostGames = allGames.filter(game => game.ownerId === loggedInUser.username);

        if (hostGames.length === 0) {
            gameListContainer.innerHTML = '<p>Você ainda não possui jogos. Clique em "Adicionar Novo Jogo" para começar.</p>';
            return;
        }

        hostGames.forEach(game => {
            const gameElement = document.createElement('div');
            gameElement.className = 'game-list-item';
            const statusClass = game.status === 'pending' ? 'status-pending' : 'status-approved';
            
            gameElement.innerHTML = `
                <div>
                    <span>${game.name}</span>
                    <span class="status-badge ${statusClass}">${game.status}</span>
                </div>
                <div class="item-actions">
                    <button class="edit-btn" data-id="${game.id}">Editar</button>
                    <button class="remove-btn" data-id="${game.id}">Remover</button>
                </div>
            `;
            gameListContainer.appendChild(gameElement);
        });

        addEventListenersToButtons();
    }
    
    function addEventListenersToButtons() {
        document.querySelectorAll('.edit-btn').forEach(button => button.addEventListener('click', handleEditGame));
        document.querySelectorAll('.remove-btn').forEach(button => button.addEventListener('click', handleRemoveGame));
    }

    function handleEditGame(event) {
        const gameId = event.target.dataset.id;
        const allGames = getAllGamesFromStorage();
        const game = allGames.find(g => g.id === gameId);
        
        if (!game) return;

        modalTitle.textContent = 'Editar Jogo';
        gameForm.reset();
        
        gameIdInput.value = game.id;
        document.getElementById('name').value = game.name;
        document.getElementById('fullDescription').value = game.fullDescription;
        
        gameFormModal.showModal();
    }

    function handleRemoveGame(event) {
        const gameId = event.target.dataset.id;
        let allGames = getAllGamesFromStorage();
        const gameToRemove = allGames.find(g => g.id === gameId);

        if (gameToRemove && confirm(`Tem certeza que deseja remover o jogo "${gameToRemove.name}"?`)) {
            const updatedGames = allGames.filter(g => g.id !== gameId);
            saveAllGamesToStorage(updatedGames);
            renderGameList();
        }
    }

    addNewGameBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Adicionar Novo Jogo';
        gameForm.reset();
        gameIdInput.value = '';
        gameFormModal.showModal();
    });

    cancelBtn.addEventListener('click', () => {
        gameFormModal.close();
    });

    gameForm.addEventListener('submit', (event) => {
        event.preventDefault();
        
        let allGames = getAllGamesFromStorage();
        const nameValue = document.getElementById('name').value;
        const editingId = gameIdInput.value;

        const gameDataPayload = {
            name: nameValue,
            fullDescription: document.getElementById('fullDescription').value,
        };

        if (editingId) {
            const gameIndex = allGames.findIndex(g => g.id === editingId);
            if (gameIndex > -1) {
                allGames[gameIndex] = { ...allGames[gameIndex], ...gameDataPayload };
            }
        } else {
            const newGame = {
                id: nameValue.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, ''),
                ownerId: loggedInUser.username,
                status: 'pending',
                shortDescription: (gameDataPayload.fullDescription || '').substring(0, 50) + '...',
                coverImage: "https://via.placeholder.com/500x700/cccccc/FFFFFF?text=Pendente",
                videoPreview: "",
                galleryImages: [],
                sessionDuration: "60 minutos",
                availability: {},
                isPaused: false,
                ...gameDataPayload
            };
            allGames.push(newGame);
        }

        saveAllGamesToStorage(allGames);
        renderGameList();
        gameFormModal.close();
    });

    function handleStartSession(event) {
    event.stopPropagation();
    const bookingId = event.target.dataset.bookingId;
    window.location.href = `sala.html?bookingId=${bookingId}`;
}
    
    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('loggedInUser');
        window.location.href = 'login.html';
    });

    renderGameList();
});