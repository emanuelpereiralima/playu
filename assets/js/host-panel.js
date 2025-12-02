document.addEventListener('DOMContentLoaded', () => {
    // Referências
    const db = window.db || firebase.firestore();
    const auth = window.auth;
    const sessionDataString = sessionStorage.getItem('loggedInUser');

    if (!sessionDataString) {
        window.location.href = 'login.html';
        return;
    }

    const loggedInUser = JSON.parse(sessionDataString);
    if (loggedInUser.role !== 'host' && loggedInUser.role !== 'admin') {
        alert('Acesso negado.');
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('host-username').textContent = loggedInUser.name;
    
    // Botões e Containers
    const gameListContainer = document.getElementById('game-list-container');
    const hostBookingsList = document.getElementById('host-bookings-list');
    const addNewGameBtn = document.getElementById('add-new-game-btn');
    
    // --- 1. CARREGAR AGENDAMENTOS RECEBIDOS (NOVO) ---
    async function loadHostBookings() {
        if(!hostBookingsList) return;
        hostBookingsList.innerHTML = '<div class="loader"></div>';

        try {
            // Busca agendamentos onde eu sou o Host
            const snapshot = await db.collection('bookings')
                .where('hostId', '==', loggedInUser.username)
                .orderBy('date', 'desc')
                .get();

            hostBookingsList.innerHTML = '';

            if (snapshot.empty) {
                hostBookingsList.innerHTML = '<p>Nenhuma sessão agendada no momento.</p>';
                return;
            }

            snapshot.forEach(doc => {
                const booking = doc.data();
                const dateDisplay = booking.date.split('-').reverse().join('/') + ' às ' + booking.time;

                const item = document.createElement('div');
                item.className = 'booking-item';
                // Host vê quem agendou e entra direto
                item.innerHTML = `
                    <div class="booking-item-info">
                        <strong>${booking.gameName}</strong>
                        <span>Jogador: ${booking.userName} (${booking.userEmail})</span>
                        <span style="color:var(--secondary-color)">${dateDisplay}</span>
                    </div>
                    <a href="sala-host.html?bookingId=${doc.id}" class="submit-btn small-btn">
                        <ion-icon name="easel-outline"></ion-icon> Iniciar Sala
                    </a>
                `;
                hostBookingsList.appendChild(item);
            });

        } catch (error) {
            console.error("Erro host bookings:", error);
            hostBookingsList.innerHTML = '<p>Erro ao carregar agenda.</p>';
        }
    }

    // --- 2. CARREGAR JOGOS (Mantido para referência) ---
    async function loadHostGames() {
        // ... (Lógica existente ou redirecionamento para o admin se preferir)
        // Se você moveu tudo para o admin.html, pode simplificar aqui ou manter a lista apenas para visualização
        gameListContainer.innerHTML = '<p>Gerencie seus jogos pelo <a href="admin.html" style="color:var(--secondary-color)">Painel Admin</a>.</p>';
    }

    // Navegação
    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('loggedInUser');
        if(auth) auth.signOut();
        window.location.href = 'login.html';
    });

    if(addNewGameBtn) {
        addNewGameBtn.addEventListener('click', () => {
            window.location.href = 'admin.html'; // Redireciona para onde cria jogos agora
        });
    }

    // Inicialização
    loadHostBookings();
    loadHostGames();
});