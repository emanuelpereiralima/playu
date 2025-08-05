document.addEventListener('DOMContentLoaded', () => {
    // ... (lógica de verificação de sessão e seleção de elementos) ...

    function renderGameList() {
        gameListContainer.innerHTML = '';
        let allGames = getAllGamesFromStorage();
        const allBookings = getBookingsFromStorage();
        const hostGames = allGames.filter(game => game.ownerId === loggedInUser.username);

        if (hostGames.length === 0) {
            gameListContainer.innerHTML = '<p>Você ainda não possui jogos.</p>';
            return;
        }

        hostGames.forEach(game => {
            const gameElement = document.createElement('details');
            gameElement.className = 'game-list-item';

            const today = new Date().setHours(0, 0, 0, 0);
            const bookingsForGame = allBookings
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

            gameElement.innerHTML = `
                <summary>
                    <div>
                        <span>${game.name}</span>
                        <span class="status-badge ${statusClass}">${game.status}</span>
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
        document.querySelectorAll('.schedule-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const gameId = event.target.dataset.id;
                if (window.openAvailabilityModal) window.openAvailabilityModal(gameId); 
            });
        });
        document.querySelectorAll('.cancel-session-btn').forEach(button => button.addEventListener('click', handleCancelSession));
        document.querySelectorAll('.start-session-btn').forEach(button => button.addEventListener('click', handleStartSession)); // <-- LINHA CORRIGIDA
    }

    function handleStartSession(event) {
        event.stopPropagation();
        const bookingId = event.target.dataset.id;
        window.location.href = `sala.html?bookingId=${bookingId}`;
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
        document.getElementById('isPaused').checked = game.isPaused || false;
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

    cancelBtn.addEventListener('click', () => gameFormModal.close());

    gameForm.addEventListener('submit', (event) => {
        event.preventDefault();
        console.log("Formulário enviado.");

        const nameValue = document.getElementById('name').value;
        const editingId = gameIdInput.value;
        
        // Sempre leia a versão mais recente dos jogos do storage antes de modificar.
        let allGames = getAllGamesFromStorage(); 

        const gameDataPayload = {
            name: nameValue,
            fullDescription: document.getElementById('fullDescription').value,
        };

        if (editingId) {
            console.log(`Modo Edição para o jogo ID: ${editingId}`);
            const gameIndex = allGames.findIndex(g => g.id === editingId);
            if (gameIndex > -1) {
                allGames[gameIndex] = { ...allGames[gameIndex], ...gameDataPayload };
            }
        } else {
            console.log("Modo Adição.");
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
                ...gameDataPayload
            };
            
            console.log("Novo jogo a ser adicionado:", newGame);
            // Adiciona o novo jogo ao array de todos os jogos.
            allGames.push(newGame);
        }

        saveAllGamesToStorage(allGames);
        renderGameList();
        gameFormModal.close();
    });
    
    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('loggedInUser');
        window.location.href = 'login.html';
    });

    // Inicia a renderização da lista ao carregar a página.
    renderGameList();
});