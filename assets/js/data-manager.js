// Carrega os jogos do localStorage ou usa os dados padrão.
function getGames() {
    const storedGames = localStorage.getItem('games');
    if (storedGames) return JSON.parse(storedGames);
    
    const defaultGames = typeof DEFAULT_GAMES_DATA !== 'undefined' ? DEFAULT_GAMES_DATA : [];
    localStorage.setItem('games', JSON.stringify(defaultGames));
    return defaultGames;
}

// Salva o array completo de jogos.
function saveGames(games) {
    localStorage.setItem('games', JSON.stringify(games));
}

// Carrega os agendamentos.
function getBookings() {
    return JSON.parse(localStorage.getItem('bookings') || '[]');
}

// Salva os agendamentos.
function saveBookings(bookings) {
    localStorage.setItem('bookings', JSON.stringify(bookings));
}

// Carrega os usuários.
function getUsers() {
    const storedUsers = localStorage.getItem('users');
    if (storedUsers) return JSON.parse(storedUsers);
    
    const defaultUsers = typeof DEFAULT_USERS_DATA !== 'undefined' ? DEFAULT_USERS_DATA : {};
    localStorage.setItem('users', JSON.stringify(defaultUsers));
    return defaultUsers;
}

// Salva os usuários.
function saveUsers(users) {
    localStorage.setItem('users', JSON.stringify(users));
}