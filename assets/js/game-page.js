document.addEventListener('DOMContentLoaded', () => {
    // Pega os parâmetros da URL (ex: ?id=cyber-runners)
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('id');

    // Procura o jogo no nosso "banco de dados"
    const gameData = GAMES_DATA.find(game => game.id === gameId);

    const detailsContainer = document.getElementById('game-details-container');
    const notFoundContainer = document.getElementById('game-not-found');

    if (gameData) {
        // Se o jogo for encontrado, preenche a página
        document.title = `${gameData.name} - play.u`;
        document.getElementById('game-title').textContent = gameData.name;
        document.getElementById('game-description').textContent = gameData.fullDescription;
        
        const gallery = document.getElementById('game-gallery');
        gameData.galleryImages.forEach(imageUrl => {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = `Imagem do jogo ${gameData.name}`;
            gallery.appendChild(img);
        });
        
    } else {
        // Se o jogo não for encontrado, mostra uma mensagem de erro
        detailsContainer.style.display = 'none';
        notFoundContainer.style.display = 'block';
    }
});