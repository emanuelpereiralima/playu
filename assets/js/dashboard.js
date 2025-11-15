document.addEventListener('DOMContentLoaded', () => {
    // Referências do Firebase (assumindo que estão em firebase-config.js)
    // const auth = firebase.auth();
    // const db = firebase.firestore();

    // Elementos da UI
    const userGreeting = document.getElementById('user-greeting');
    const logoutBtn = document.getElementById('logout-btn');
    const gameListContainer = document.getElementById('game-list-container');
    const myBookingsContainer = document.getElementById('my-bookings-container');
    const noBookingsMsg = document.getElementById('no-bookings-msg');

    // Elementos do Modal
    const modal = document.getElementById('booking-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const bookingForm = document.getElementById('booking-form');
    const modalGameTitle = document.getElementById('modal-game-title');
    const modalGameIdInput = document.getElementById('modal-game-id');
    const bookingError = document.getElementById('booking-error');
    const bookingDateInput = document.getElementById('booking-date');
    const bookingTimeInput = document.getElementById('booking-time');

    let loggedInUser = null;

    // --- 1. VERIFICAÇÃO DE AUTENTICAÇÃO ---
    function checkAuth() {
        const user = JSON.parse(sessionStorage.getItem('loggedInUser'));
        if (!user) {
            // Se não estiver logado, volta para o login
            window.location.href = 'login.html';
            return;
        }
        loggedInUser = user;
        
        // Personaliza a UI
        userGreeting.textContent = `Olá, ${loggedInUser.name.split(' ')[0]}`;
            logoutBtn.addEventListener('click', () => {            sessionStorage.removeItem('loggedInUser');
            window.location.href = 'login.html';
        });

        // Carrega os dados da página
        loadAllGames();
        loadMyBookings();
    }

    // --- 2. CARREGAR JOGOS (Catálogo) ---
    function loadAllGames() {
        const allGames = getGames(); // Do gamedata.js
        if (!allGames || allGames.length === 0) {
            gameListContainer.innerHTML = '<p>Nenhum jogo disponível no momento.</p>';
            return;
        }
        
        gameListContainer.innerHTML = ''; // Limpa o loader
        allGames.forEach(game => {
            const card = document.createElement('div');
            card.className = 'game-card';
            card.innerHTML = `
                <img src="${game.thumbnailUrl}" alt="${game.title}" class="game-card-img">
                <div class="game-card-content">
                    <h3>${game.title}</h3>
                    <p>${game.description.substring(0, 100)}...</p>
                    <button class="submit-btn" data-game-id="${game.id}">Agendar</button>
                </div>
            `;
            // Adiciona evento ao botão "Agendar"
            card.querySelector('button').addEventListener('click', () => openBookingModal(game));
            gameListContainer.appendChild(card);
        });
    }

    // --- 3. CARREGAR MEUS AGENDAMENTOS (Do Firestore) ---
    async function loadMyBookings() {
        if (!loggedInUser) return;
        
        myBookingsContainer.innerHTML = ''; // Limpa a mensagem padrão
        
        // Consulta ao Firestore: pega agendamentos ONDE userId == UID do usuário logado
        const bookingsRef = db.collection('bookings');
        const snapshot = await bookingsRef.where('userId', '==', loggedInUser.username).get();

        if (snapshot.empty) {
            myBookingsContainer.appendChild(noBookingsMsg); // Mostra a mensagem "sem agendamentos"
            return;
        }

        const allGames = getGames(); // Para pegar nomes e imagens
        
        snapshot.forEach(doc => {
            const booking = doc.data();
            const bookingId = doc.id; // Este é o ID do documento
            const game = allGames.find(g => g.id === booking.gameId);
            
            const item = document.createElement('div');
            item.className = 'booking-item';
            
            // Formata a data (do Firestore Timestamp para legível)
            const bookingDateTime = booking.bookingDate.toDate();
            const formattedDate = bookingDateTime.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
            const formattedTime = bookingDateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            item.innerHTML = `
                <div class="booking-item-info">
                    <strong>${game ? game.title : 'Jogo Desconhecido'}</strong>
                    <span>${formattedDate} às ${formattedTime}</span>
                </div>
                <a href="sala-jogador.html?bookingId=${bookingId}" class="submit-btn small-btn">
                    Entrar na Sala
                    <ion-icon name="arrow-forward-outline"></ion-icon>
                </a>
            `;
            myBookingsContainer.appendChild(item);
        });
    }

    // --- 4. LÓGICA DO MODAL E CRIAÇÃO DO AGENDAMENTO ---
    
    function openBookingModal(game) {
        modalGameTitle.textContent = `Agendar "${game.title}"`;
        modalGameIdInput.value = game.id;
        
        // Sugere data e hora (ex: amanhã às 14:00)
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        bookingDateInput.value = tomorrow.toISOString().split('T')[0];
        bookingTimeInput.value = '14:00';
        
        bookingError.classList.add('hidden');
        modal.classList.remove('hidden');
    }

    // Fecha o modal
    closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));

    // Envio do formulário de agendamento
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const gameId = modalGameIdInput.value;
        const date = bookingDateInput.value;
        const time = bookingTimeInput.value;
        
        if (!gameId || !date || !time) {
            showBookingError('Por favor, preencha todos os campos.');
            return;
        }

        // Combina data e hora em um objeto Date do JS
        const [year, month, day] = date.split('-');
        const [hour, minute] = time.split(':');
        const bookingDateTime = new Date(year, month - 1, day, hour, minute);

        if (bookingDateTime < new Date()) {
            showBookingError('Não é possível agendar no passado.');
            return;
        }
        
        // Converte o objeto Date do JS para um Timestamp do Firestore
        const firestoreTimestamp = firebase.firestore.Timestamp.fromDate(bookingDateTime);

        try {
            // Cria o novo documento no Firestore
            await db.collection('bookings').add({
                userId: loggedInUser.username, // O UID do Firebase
                gameId: gameId,
                bookingDate: firestoreTimestamp,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Sucesso!
            modal.classList.add('hidden');
            loadMyBookings(); // Atualiza a lista de agendamentos

        } catch (error) {
            console.error("Erro ao criar agendamento:", error);
            showBookingError('Não foi possível salvar seu agendamento. Tente novamente.');
        }
    });

    function showBookingError(message) {
        bookingError.textContent = message;
        bookingError.classList.remove('hidden');
    }

    // --- INICIALIZAÇÃO ---
    checkAuth();
});