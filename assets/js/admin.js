document.addEventListener('DOMContentLoaded', () => {
    // Seleção de elementos do DOM
    const gameListContainer = document.getElementById('game-list-container');
    const addNewGameBtn = document.getElementById('add-new-game-btn');
    const gameFormModal = document.getElementById('game-form-modal');
    const gameForm = document.getElementById('game-form');
    const cancelBtn = document.getElementById('cancel-btn');
    const modalTitle = document.getElementById('modal-title');
    
    // Elementos do formulário
    const gameIdInput = document.getElementById('game-id');
    const nameInput = document.getElementById('name');
    const descriptionInput = document.getElementById('fullDescription');
    const coverImageHiddenInput = document.getElementById('coverImage');
    const coverImageUploadInput = document.getElementById('coverImageUpload');
    const coverImageUrlInput = document.getElementById('coverImageUrl');
    const imagePreview = document.getElementById('image-preview');
    const uploadError = document.getElementById('upload-error');

    let games = [];
    const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

    // Funções para interagir com o localStorage
    function getGamesFromStorage() {
        const storedGames = localStorage.getItem('games');
        if (storedGames) return JSON.parse(storedGames);
        localStorage.setItem('games', JSON.stringify(DEFAULT_GAMES_DATA));
        return DEFAULT_GAMES_DATA;
    }

    function saveGamesToStorage(gamesToSave) {
        localStorage.setItem('games', JSON.stringify(gamesToSave));
    }

    // --- Lógica de Upload e Preview ---
    coverImageUploadInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Validação do tamanho do arquivo
        if (file.size > MAX_FILE_SIZE) {
            uploadError.textContent = 'Erro: O arquivo excede o limite de 2MB.';
            uploadError.style.display = 'block';
            coverImageUploadInput.value = ''; // Limpa o input
            return;
        }
        
        uploadError.style.display = 'none';
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64String = e.target.result;
            imagePreview.src = base64String;
            imagePreview.style.display = 'block';
            coverImageHiddenInput.value = base64String; // Salva o Base64 no campo oculto
            coverImageUrlInput.value = ''; // Limpa o campo de URL
        };
        reader.readAsDataURL(file);
    });

    coverImageUrlInput.addEventListener('input', () => {
        const url = coverImageUrlInput.value.trim();
        if (url) {
            imagePreview.src = url;
            imagePreview.style.display = 'block';
            coverImageHiddenInput.value = url; // Salva a URL no campo oculto
            coverImageUploadInput.value = ''; // Limpa o input de arquivo
        } else {
            imagePreview.style.display = 'none';
        }
    });

    // Função para renderizar a lista de jogos
    function renderGameList() {
        gameListContainer.innerHTML = '';
        games = getGamesFromStorage();

        if (games.length === 0) {
            gameListContainer.innerHTML = '<p>Nenhum jogo encontrado.</p>';
            return;
        }

        games.forEach((game, index) => {
            const gameElement = document.createElement('div');
            gameElement.className = 'game-list-item';
            gameElement.innerHTML = `
                <span>${game.name}</span>
                <div class="item-actions">
                    <button class="edit-btn" data-index="${index}">Editar</button>
                    <button class="remove-btn" data-index="${index}">Remover</button>
                </div>
            `;
            gameListContainer.appendChild(gameElement);
        });

        addEventListenersToButtons();
    }
    
    function addEventListenersToButtons() {
        document.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', handleEditGame);
        });
        document.querySelectorAll('.remove-btn').forEach(button => {
            button.addEventListener('click', handleRemoveGame);
        });
    }

    // Abre o modal para Edição
    function handleEditGame(event) {
        const gameIndex = event.target.dataset.index;
        const game = games[gameIndex];

        modalTitle.textContent = 'Editar Jogo';
        gameForm.reset();
        imagePreview.style.display = 'none';
        uploadError.style.display = 'none';

        gameIdInput.value = gameIndex;
        nameInput.value = game.name;
        descriptionInput.value = game.fullDescription;
        coverImageHiddenInput.value = game.coverImage;

        // Preenche o campo de imagem correto
        if (game.coverImage) {
            imagePreview.src = game.coverImage;
            imagePreview.style.display = 'block';
            if (!game.coverImage.startsWith('data:image')) {
                coverImageUrlInput.value = game.coverImage;
            }
        }
        
        gameFormModal.showModal();
    }

    // Remove um jogo
    function handleRemoveGame(event) {
        const gameIndex = event.target.dataset.index;
        if (confirm(`Tem certeza que deseja remover o jogo "${games[gameIndex].name}"?`)) {
            games.splice(gameIndex, 1);
            saveGamesToStorage(games);
            renderGameList();
        }
    }

    // Abre o modal para Adição
    addNewGameBtn.addEventListener('click', () => {
        modalTitle.textContent = 'Adicionar Novo Jogo';
        gameForm.reset();
        gameIdInput.value = '';
        imagePreview.src = '';
        imagePreview.style.display = 'none';
        uploadError.style.display = 'none';
        gameFormModal.showModal();
    });

    // Fecha o modal
    cancelBtn.addEventListener('click', () => {
        gameFormModal.close();
    });

    // Salva (Adiciona ou Edita)
    gameForm.addEventListener('submit', (event) => {
        event.preventDefault();
        
        const gameDataPayload = {
            id: nameInput.value.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, ''),
            name: nameInput.value,
            coverImage: coverImageHiddenInput.value, // Pega o valor do campo oculto
            fullDescription: descriptionInput.value,
            shortDescription: descriptionInput.value.substring(0, 50) + '...',
            videoPreview: "",
            galleryImages: [],
            sessionDuration: "60 minutos",
            availability: {}
        };
        
        if (gameIdInput.value !== '') {
            const index = parseInt(gameIdInput.value, 10);
            games[index] = { ...games[index], ...gameDataPayload };
        } else {
            games.push(gameDataPayload);
        }

        saveGamesToStorage(games);
        renderGameList();
        gameFormModal.close();
    });

    renderGameList(); // Inicia a renderização
});