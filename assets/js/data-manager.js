function getGames() {
    const storedGames = localStorage.getItem('games');
    if (storedGames) {
        try {
            // Tenta converter o texto para um objeto.
            return JSON.parse(storedGames);
        } catch (error) {
            // Se falhar (JSON inválido), avisa no console e reseta com os dados padrão.
            console.error("Erro ao analisar os dados de 'games' do localStorage. Resetando para o padrão.", error);
            localStorage.removeItem('games'); // Remove a entrada corrompida.
        }
    }
    
    // Este código é executado se não houver dados ou se eles estiverem corrompidos.
    const defaultGames = typeof DEFAULT_GAMES_DATA !== 'undefined' ? DEFAULT_GAMES_DATA : [];
    localStorage.setItem('games', JSON.stringify(defaultGames));
    return defaultGames;
}

function saveGames(games) {
    localStorage.setItem('games', JSON.stringify(games));
}

function getBookings() {
    // Adicionando o mesmo tratamento de erro para os agendamentos.
    const storedBookings = localStorage.getItem('bookings');
    if(storedBookings) {
        try {
            return JSON.parse(storedBookings);
        } catch (error) {
            console.error("Erro ao analisar os dados de 'bookings' do localStorage. Resetando.", error);
            localStorage.removeItem('bookings');
        }
    }
    return []; // Retorna um array vazio se não houver ou se estiver corrompido.
}

function saveBookings(bookings) {
    localStorage.setItem('bookings', JSON.stringify(bookings));
}

function getUsers() {
    // Adicionando o mesmo tratamento de erro para os usuários.
    const storedUsers = localStorage.getItem('users');
    if (storedUsers) {
        try {
            return JSON.parse(storedUsers);
        } catch (error) {
            console.error("Erro ao analisar os dados de 'users' do localStorage. Resetando para o padrão.", error);
            localStorage.removeItem('users');
        }
    }
    
    const defaultUsers = typeof DEFAULT_USERS_DATA !== 'undefined' ? DEFAULT_USERS_DATA : {};
    localStorage.setItem('users', JSON.stringify(defaultUsers));
    return defaultUsers;
}

function saveUsers(users) {
    localStorage.setItem('users', JSON.stringify(users));
}