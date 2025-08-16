document.addEventListener('DOMContentLoaded', () => {
    // --- LÓGICA DOS BOTÕES DO HEADER ---
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

    // --- LÓGICA DE GERENCIAMENTO DE JOGOS ---
    const gameListContainer = document.getElementById('game-list-container');
    const addNewGameBtn = document.getElementById('add-new-game-btn');
    const gameFormModal = document.getElementById('game-form-modal');
    const gameForm = document.getElementById('game-form');
    const cancelBtn = document.getElementById('cancel-btn');
    const modalTitle = document.getElementById('modal-title');
    const gameIdInput = document.getElementById('game-id');

    function getGamesFromStorage() {
        const storedGames = localStorage.getItem('games');
        if (storedGames) return JSON.parse(storedGames);
        const defaultGames = typeof DEFAULT_GAMES_DATA !== 'undefined' ? DEFAULT_GAMES_DATA : [];
        localStorage.setItem('games', JSON.stringify(defaultGames));
        return defaultGames;
    }

    function saveGamesToStorage(gamesToSave) {
        localStorage.setItem('games', JSON.stringify(gamesToSave));
    }

    function getBookingsFromStorage() {
        return JSON.parse(localStorage.getItem('bookings') || '[]');
    }

    function saveBookingsToStorage(bookings) {
        localStorage.setItem('bookings', JSON.stringify(bookings));
    }

    function renderGameList() {
        gameListContainer.innerHTML = '';
        const games = getGamesFromStorage();
        const bookings = getBookingsFromStorage();

        if (!games || games.length === 0) {
            gameListContainer.innerHTML = '<p>Nenhum jogo encontrado.</p>';
            return;
        }

        games.forEach(game => {
            const gameElement = document.createElement('details');
            gameElement.className = 'game-list-item';

            const today = new Date().setHours(0, 0, 0, 0);
            const bookingsForGame = bookings
                .filter(b => b.gameId === game.id && new Date(b.date) >= today)
                .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

            let sessionsHTML = '<p>Nenhuma sessão agendada.</p>';
            if (bookingsForGame.length > 0) {
                sessionsHTML = bookingsForGame.map(b => `
                    <div class="session-item">
                        <div class="session-details">
                            📅 <strong>${new Intl.DateTimeFormat('pt-BR').format(new Date(b.date))}</strong> às 
                            <strong>${b.time}</strong> (Reservado por: ${b.bookedBy})
                        </div>
                        <div class="session-actions">
                            <button class="remove-btn cancel-session-btn" data-booking-id="${b.bookingId}">Cancelar</button>
                            <button class="approve-btn start-session-btn" data-booking-id="${b.bookingId}">Entrar na Sala</button>
                        </div>
                    </div>
                `).join('');
            }
            
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
                        <span class="status-badge ${statusClass}">${game.status}</span>
                        <span class="owner-badge">Dono: ${game.ownerId}</span>
                    </div>
                    <div class="item-actions">${mainActionButtons}</div>
                </summary>
                <div class="session-list">
                    <h4>Sessões Agendadas:</h4>
                    ${sessionsHTML}
                </div>
            `;
            gameListContainer.appendChild(gameElement);
        });

        addEventListenersToButtons();
    }

    function addEventListenersToButtons() {
        document.querySelectorAll('.edit-btn').forEach(button => button.addEventListener('click', handleEditGame));
        document.querySelectorAll('.remove-btn').forEach(button => button.addEventListener('click', handleRemoveGame));
        document.querySelectorAll('.approve-btn').forEach(button => button.addEventListener('click', handleApproveGame));
        document.querySelectorAll('.schedule-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const gameId = event.target.dataset.id;
                if (window.openAvailabilityModal) window.openAvailabilityModal(gameId); 
            });
        });
        document.querySelectorAll('.cancel-session-btn').forEach(button => button.addEventListener('click', handleCancelSession));
        document.querySelectorAll('.start-session-btn').forEach(button => button.addEventListener('click', handleStartSession)); // <-- LINHA CORRIGIDA
    }

// Em admin.js e host-panel.js

function handleStartSession(event) {
    event.stopPropagation();
    const bookingId = event.target.dataset.bookingId;
    window.location.href = `sala.html?bookingId=${bookingId}`;
}

    function handleCancelSession(event) {
        event.stopPropagation();
        const bookingId = event.target.dataset.bookingId;
        let allBookings = getBookingsFromStorage();
        const bookingToCancel = allBookings.find(b => b.bookingId === bookingId);

        if (bookingToCancel && confirm('Tem certeza que deseja cancelar esta sessão?')) {
            const updatedBookings = allBookings.filter(b => b.bookingId !== bookingId);
            saveBookingsToStorage(updatedBookings);

            let allGames = getGamesFromStorage();
            const gameIndex = allGames.findIndex(g => g.id === bookingToCancel.gameId);
            if(gameIndex > -1) {
                if (!allGames[gameIndex].availability[bookingToCancel.date]) {
                    allGames[gameIndex].availability[bookingToCancel.date] = [];
                }
                allGames[gameIndex].availability[bookingToCancel.date].push(bookingToCancel.time);
                allGames[gameIndex].availability[bookingToCancel.date].sort();
                saveGamesToStorage(allGames);
            }
            renderGameList();
        }
    }

    function handleEditGame(event) {
        const gameId = event.target.dataset.id;
        const games = getGamesFromStorage();
        const game = games.find(g => g.id === gameId);

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
        let games = getGamesFromStorage();
        const gameToRemove = games.find(g => g.id === gameId);

        if (gameToRemove && confirm(`Tem certeza que deseja remover o jogo "${gameToRemove.name}"?`)) {
            const updatedGames = games.filter(g => g.id !== gameId);
            saveGamesToStorage(updatedGames);
            renderGameList();
        }
    }
    
    function handleApproveGame(event) {
        const gameId = event.target.dataset.id;
        let games = getGamesFromStorage();
        const gameIndex = games.findIndex(g => g.id === gameId);
        
        if (gameIndex > -1) {
            games[gameIndex].status = 'approved';
            saveGamesToStorage(games);
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
        
        let allGames = getGamesFromStorage();
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

        saveGamesToStorage(allGames);
        renderGameList();
        gameFormModal.close();
    });

    renderGameList();
});