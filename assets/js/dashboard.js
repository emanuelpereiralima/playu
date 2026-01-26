document.addEventListener('DOMContentLoaded', () => {
    console.log("👤 Dashboard do Jogador Iniciado...");

    // Verifica se o Firebase foi carregado corretamente
    if (typeof firebase === 'undefined') {
        console.error("Firebase SDK não encontrado.");
        return;
    }

    // Aguarda o main.js inicializar o window.db e window.auth
    // Caso o main.js demore, podemos tentar pegar direto do firebase global
    const db = window.db || firebase.firestore();
    const auth = window.auth || firebase.auth();
    
    const bookingsContainer = document.getElementById('my-bookings-container');
    const userGreeting = document.getElementById('user-greeting');

    // Verifica Autenticação
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            // Se não estiver logado, manda pro login
            window.location.href = 'login.html';
            return;
        }

        // Atualiza saudação
        if(userGreeting) {
            const firstName = user.displayName ? user.displayName.split(' ')[0] : 'Jogador';
            userGreeting.textContent = `Olá, ${firstName}`;
        }

        // Carrega os agendamentos
        loadUserBookings(user.uid);
    });

    // =================================================================
    // CARREGAR AGENDAMENTOS
    // =================================================================
    async function loadUserBookings(userId) {
        if (!bookingsContainer) return;
        
        bookingsContainer.innerHTML = '<div class="loader"></div>';

        try {
            // 1. Busca agendamentos APENAS filtrando pelo usuário
            // Removemos o orderBy daqui para evitar erro de índice do Firestore
            const snapshot = await db.collection('bookings')
                .where('userId', '==', userId)
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

            // 2. Converte para Array e Ordena no JavaScript
            let bookings = [];
            snapshot.forEach(doc => {
                bookings.push({ id: doc.id, ...doc.data() });
            });

            // Ordena: Mais recentes/futuros primeiro
            bookings.sort((a, b) => {
                const dateA = new Date(`${a.date}T${a.time}`);
                const dateB = new Date(`${b.date}T${b.time}`);
                return dateB - dateA; // Decrescente
            });

            // 3. Renderiza os Cards
            // Garante o grid layout
            bookingsContainer.style.display = 'grid';
            bookingsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
            bookingsContainer.style.gap = '20px';

            bookings.forEach(booking => {
                createBookingCard(booking);
            });

            // Inicia o loop de verificação de horário (para liberar o botão)
            startLiveCheck();

        } catch (error) {
            console.error("Erro ao buscar agendamentos:", error);
            bookingsContainer.innerHTML = '<p style="color: #ff4444; text-align: center;">Erro ao carregar seus jogos. Tente recarregar a página.</p>';
        }
    }

    // =================================================================
    // CRIAR HTML DO CARD
    // =================================================================
    function createBookingCard(data) {
        // Formata data (YYYY-MM-DD -> DD/MM/YYYY)
        const dateParts = data.date.split('-');
        const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        
        // Define imagem de capa (fallback se não tiver)
        const coverUrl = data.cover || 'assets/images/logo.png';

        const card = document.createElement('div');
        card.className = 'booking-card'; // Classe CSS definida anteriormente
        
        // Dados para o timer
        card.dataset.date = data.date; 
        card.dataset.time = data.time; 
        card.dataset.id = data.id;

        // Estilos inline de backup
        card.style.cssText = `
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            transition: transform 0.2s;
        `;
        
        // Hover effect via JS events já que inline css não suporta hover pseudo-class facilmente
        card.onmouseover = () => { card.style.transform = 'translateY(-5px)'; card.style.borderColor = 'var(--secondary-color)'; };
        card.onmouseout = () => { card.style.transform = 'none'; card.style.borderColor = 'rgba(255, 255, 255, 0.1)'; };

        card.innerHTML = `
            <div class="booking-card-header" style="height: 140px; background-image: url('${coverUrl}'); background-size: cover; background-position: center; position: relative;">
                <div class="booking-status-badge" style="position:absolute; top:10px; right:10px; background:rgba(0,0,0,0.8); padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold; color:${getStatusColor(data.status)}; border: 1px solid ${getStatusColor(data.status)}">
                    ${translateStatus(data.status)}
                </div>
            </div>
            <div class="booking-card-body" style="padding: 15px; flex: 1; display: flex; flex-direction: column;">
                <div class="booking-title" style="font-size: 1.1rem; font-weight: bold; color: #fff; margin-bottom: 5px;">${data.gameName}</div>
                
                <div style="color: #aaa; font-size: 0.9rem; margin-bottom: 5px; display: flex; align-items: center; gap: 5px;">
                    <ion-icon name="calendar-outline"></ion-icon> ${dateFormatted}
                </div>
                <div style="color: #aaa; font-size: 0.9rem; margin-bottom: 10px; display: flex; align-items: center; gap: 5px;">
                    <ion-icon name="time-outline"></ion-icon> ${data.time}
                </div>
                
                <div class="booking-timer-countdown" id="countdown-${data.id}" style="margin-top: auto; font-size: 0.85rem; color: var(--secondary-color); font-weight: bold; margin-bottom: 10px;">
                    Calculando tempo...
                </div>
                
                <button id="btn-${data.id}" class="enter-room-btn" disabled onclick="window.location.href='sala.html?bookingId=${data.id}'" 
                        style="width: 100%; padding: 10px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; background: #333; color: #666; transition: 0.3s;">
                    <ion-icon name="lock-closed-outline"></ion-icon> Aguarde...
                </button>
            </div>
        `;

        bookingsContainer.appendChild(card);
        
        // Atualiza status imediatamente
        updateCardStatus(card);
    }

    // =================================================================
    // LÓGICA DE TEMPO (LIBERAÇÃO DO BOTÃO)
    // =================================================================
    function startLiveCheck() {
        // Roda a cada 10 segundos
        setInterval(() => {
            document.querySelectorAll('.booking-card').forEach(card => updateCardStatus(card));
        }, 10000);
    }

    function updateCardStatus(card) {
        const btn = card.querySelector('.enter-room-btn');
        const countdownEl = card.querySelector('.booking-timer-countdown');

        // Cria data da sessão
        const dateStr = card.dataset.date; // YYYY-MM-DD
        const timeStr = card.dataset.time; // HH:MM
        const sessionDate = new Date(`${dateStr}T${timeStr}:00`);
        const now = new Date();

        // Diferença em minutos
        const diffMs = sessionDate - now;
        const diffMinutes = Math.floor(diffMs / 60000);

        // Regra: Libera 10 min antes (diff <= 10) até 2h depois (diff > -120)
        
        if (diffMinutes > 10) {
            // FUTURO (Falta mais de 10 min)
            btn.disabled = true;
            btn.style.background = '#333';
            btn.style.color = '#666';
            btn.style.boxShadow = 'none';
            btn.innerHTML = '<ion-icon name="lock-closed-outline"></ion-icon> Em breve';
            
            if (diffMinutes > 1440) countdownEl.textContent = `Faltam ${Math.floor(diffMinutes/1440)} dias`;
            else if (diffMinutes > 60) countdownEl.textContent = `Faltam ${Math.floor(diffMinutes/60)} horas`;
            else countdownEl.textContent = `Faltam ${diffMinutes} minutos`;
            
            countdownEl.style.color = '#aaa';

        } else if (diffMinutes <= 10 && diffMinutes > -120) {
            // AGORA (Entre 10 min antes e 2h depois)
            btn.disabled = false;
            btn.style.background = '#00ff88';
            btn.style.color = '#000';
            btn.style.boxShadow = '0 0 15px rgba(0,255,136,0.5)';
            btn.innerHTML = 'ENTRAR NA SALA <ion-icon name="arrow-forward-outline"></ion-icon>';
            
            if (diffMinutes > 0) {
                countdownEl.textContent = `Começa em ${diffMinutes} min`;
                countdownEl.style.color = '#00ff88';
            } else {
                countdownEl.textContent = `AO VIVO AGORA!`;
                countdownEl.style.color = '#ff0055';
            }

        } else {
            // PASSADO (Mais de 2h depois)
            btn.disabled = true;
            btn.style.background = '#333';
            btn.style.color = '#666';
            btn.style.boxShadow = 'none';
            btn.innerHTML = 'Finalizado';
            
            countdownEl.textContent = 'Sessão encerrada';
            countdownEl.style.color = '#666';
        }
    }

    // Helpers
    function getStatusColor(s) {
        if(s === 'confirmed' || s === 'paid') return '#00ff88'; // Verde
        if(s === 'pending') return '#ffbb00'; // Amarelo
        if(s === 'cancelled') return '#ff4444'; // Vermelho
        return '#aaa';
    }

    function translateStatus(s) {
        if(s === 'confirmed' || s === 'paid') return 'Confirmado';
        if(s === 'pending') return 'Pendente';
        if(s === 'cancelled') return 'Cancelado';
        return s;
    }
});