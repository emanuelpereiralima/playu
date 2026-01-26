document.addEventListener('DOMContentLoaded', () => {
    console.log("👤 Dashboard do Jogador Iniciado...");

    // Verifica Firebase
    if (typeof firebase === 'undefined') return console.error("Firebase não carregado.");
    
    const db = firebase.firestore();
    const auth = firebase.auth();
    const bookingsContainer = document.getElementById('bookings-list-container');
    const userGreeting = document.getElementById('user-greeting-name'); // Se houver elemento de "Olá, Fulano"

    // Verifica Autenticação
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        if(userGreeting) userGreeting.textContent = user.displayName ? user.displayName.split(' ')[0] : 'Jogador';

        loadUserBookings(user.uid);
    });

    // =================================================================
    // CARREGAR AGENDAMENTOS
    // =================================================================
    async function loadUserBookings(userId) {
        if (!bookingsContainer) return;

        try {
            // Busca agendamentos do usuário
            // Ordena por data e hora (string YYYY-MM-DD funciona bem na ordenação)
            const snapshot = await db.collection('bookings')
                .where('userId', '==', userId)
                .orderBy('date', 'desc') // Mais recentes/futuros primeiro
                .orderBy('time', 'asc')
                .get();

            bookingsContainer.innerHTML = '';

            if (snapshot.empty) {
                bookingsContainer.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: rgba(255,255,255,0.05); border-radius: 10px;">
                        <h3>Nenhum jogo agendado 😢</h3>
                        <p style="color:#aaa; margin-bottom: 20px;">Que tal explorar nossas aventuras?</p>
                        <a href="index.html" class="submit-btn">Ver Jogos</a>
                    </div>`;
                return;
            }

            // Renderiza Cards
            snapshot.forEach(doc => {
                const booking = doc.data();
                createBookingCard(doc.id, booking);
            });

            // Inicia o "Relógio" que verifica a cada 30 segundos se libera o botão
            startLiveCheck();

        } catch (error) {
            console.error("Erro ao buscar agendamentos:", error);
            bookingsContainer.innerHTML = '<p>Erro ao carregar seus jogos.</p>';
        }
    }

    // =================================================================
    // CRIAR HTML DO CARD
    // =================================================================
    async function createBookingCard(bookingId, data) {
        // Tenta buscar a capa do jogo (se não tiver salvo no booking)
        let coverImage = 'assets/images/logo.png';
        
        // Se já salvamos a capa no momento da compra (recomendado), usa ela.
        // Se não, poderíamos buscar no 'games' collection, mas para ser rápido usaremos placeholder ou lógica simples.
        // Vamos assumir que você ajustou o checkout para salvar 'cover' ou faremos uma busca lazy (opcional).
        
        const dateParts = data.date.split('-');
        const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        
        const card = document.createElement('div');
        card.className = 'booking-card';
        card.dataset.date = data.date; // Data ISO YYYY-MM-DD
        card.dataset.time = data.time; // Hora HH:MM
        card.dataset.id = bookingId;

        card.innerHTML = `
            <div class="booking-card-header" style="background-image: url('${data.cover || 'assets/images/logo.png'}');">
                <div class="booking-status-badge" style="background:${getStatusColor(data.status)}">
                    ${translateStatus(data.status)}
                </div>
            </div>
            <div class="booking-card-body">
                <div class="booking-title">${data.gameName}</div>
                
                <div class="booking-info">
                    <ion-icon name="calendar-outline"></ion-icon> ${dateFormatted}
                </div>
                <div class="booking-info">
                    <ion-icon name="time-outline"></ion-icon> ${data.time}
                </div>
                
                <div class="booking-timer-countdown" id="countdown-${bookingId}">Calculando...</div>
                
                <button id="btn-${bookingId}" class="enter-room-btn" disabled onclick="enterRoom('${bookingId}')">
                    <ion-icon name="lock-closed-outline"></ion-icon> Aguarde...
                </button>
            </div>
        `;

        bookingsContainer.appendChild(card);
        
        // Roda a verificação inicial para este card
        updateCardStatus(card);
    }

    // =================================================================
    // LÓGICA DE TEMPO E LIBERAÇÃO DO BOTÃO
    // =================================================================
    function startLiveCheck() {
        // Roda imediatamente
        checkAllCards();
        // Roda a cada 15 segundos
        setInterval(checkAllCards, 15000);
    }

    function checkAllCards() {
        document.querySelectorAll('.booking-card').forEach(card => updateCardStatus(card));
    }

    function updateCardStatus(card) {
        const btn = card.querySelector('.enter-room-btn');
        const countdownEl = card.querySelector('.booking-timer-countdown');
        const bookingId = card.dataset.id;

        // Cria objeto Date da sessão
        // data.date é "2026-01-26", data.time é "14:00"
        const sessionDate = new Date(`${card.dataset.date}T${card.dataset.time}:00`);
        const now = new Date();

        // Diferença em milissegundos
        const diffMs = sessionDate - now;
        const diffMinutes = Math.floor(diffMs / 60000);

        // REGRA DE NEGÓCIO:
        // - Libera 10 minutos antes (diffMinutes <= 10)
        // - Mantém liberado durante a sessão (diffMinutes negativo mas não muito antigo, ex: -120 min)
        // - Bloqueia se já passou muito tempo (ex: -180 min, jogo acabou)

        const TEN_MINUTES = 10;
        const SESSION_DURATION = 120; // Assumindo sessão de 2h, botão some depois

        if (diffMinutes > TEN_MINUTES) {
            // Ainda falta muito
            btn.disabled = true;
            btn.classList.remove('active');
            btn.innerHTML = '<ion-icon name="lock-closed-outline"></ion-icon> Em breve';
            
            // Lógica de visualização do tempo
            if (diffMinutes > 1440) {
                const days = Math.floor(diffMinutes / 1440);
                countdownEl.textContent = `Faltam ${days} dias`;
            } else if (diffMinutes > 60) {
                const hours = Math.floor(diffMinutes / 60);
                countdownEl.textContent = `Faltam ${hours} horas`;
            } else {
                countdownEl.textContent = `Faltam ${diffMinutes} minutos`;
            }
            countdownEl.style.color = '#aaa';

        } else if (diffMinutes <= TEN_MINUTES && diffMinutes > -SESSION_DURATION) {
            // ESTÁ NA HORA! (Entre 10min antes e 2h depois)
            btn.disabled = false;
            btn.classList.add('active');
            btn.innerHTML = 'ENTRAR NA SALA <ion-icon name="arrow-forward-outline"></ion-icon>';
            
            if (diffMinutes > 0) {
                countdownEl.textContent = `Começa em ${diffMinutes} min`;
                countdownEl.style.color = '#00ff88';
            } else {
                countdownEl.textContent = `AO VIVO AGORA!`;
                countdownEl.style.color = '#ff0055'; // Vermelho "Live"
                countdownEl.classList.add('pulse-text'); // Opcional: animação css
            }

        } else {
            // Jogo muito antigo (Acabou)
            btn.disabled = true;
            btn.classList.remove('active');
            btn.innerHTML = 'Finalizado';
            countdownEl.textContent = 'Sessão encerrada';
            countdownEl.style.color = '#666';
        }
    }

    // =================================================================
    // HELPERS
    // =================================================================
    window.enterRoom = (bookingId) => {
        // Redireciona para a sala
        window.location.href = `sala.html?bookingId=${bookingId}`;
    };

    function getStatusColor(status) {
        if(status === 'confirmed' || status === 'paid') return '#00ff88'; // Verde
        if(status === 'pending') return '#ffbb00'; // Amarelo
        if(status === 'cancelled') return '#ff4444'; // Vermelho
        return '#666';
    }

    function translateStatus(status) {
        if(status === 'confirmed' || status === 'paid') return 'Confirmado';
        if(status === 'pending') return 'Pendente';
        if(status === 'cancelled') return 'Cancelado';
        return status;
    }
});