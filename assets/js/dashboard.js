document.addEventListener('DOMContentLoaded', () => {
    console.log("👤 Dashboard do Jogador Iniciado...");

    if (typeof firebase === 'undefined') {
        console.error("Firebase SDK não encontrado.");
        return;
    }

    const db = window.db || firebase.firestore();
    const auth = window.auth || firebase.auth();
    
    // IDs do HTML (Certifique-se que seu HTML tem uma div com id="my-bookings-container")
    // Caso seu HTML use 'bookings-list', altere aqui:
    const bookingsContainer = document.getElementById('my-bookings-container') || document.getElementById('bookings-list');
    const userGreeting = document.getElementById('user-greeting');

    // Elementos do Modal de Cancelamento
    const modalCancel = document.getElementById('modal-cancel-booking');
    const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
    const btnAbortCancel = document.getElementById('btn-abort-cancel');
    let bookingIdToDelete = null;

    // 1. Auth Check
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        if(userGreeting) {
            const firstName = user.displayName ? user.displayName.split(' ')[0] : 'Jogador';
            userGreeting.textContent = `Olá, ${firstName}`;
        }

        loadUserBookings(user.uid);
    });

    // 2. Carregar Agendamentos
    async function loadUserBookings(userId) {
        if (!bookingsContainer) return;
        bookingsContainer.innerHTML = '<div class="loader"></div>';

        try {
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

            let bookings = [];
            snapshot.forEach(doc => {
                bookings.push({ id: doc.id, ...doc.data() });
            });

            // Ordena: Futuros/Hoje primeiro, depois passados
            bookings.sort((a, b) => {
                const dateA = new Date(`${a.date}T${a.time}`);
                const dateB = new Date(`${b.date}T${b.time}`);
                return dateB - dateA; 
            });

            // Grid Layout
            bookingsContainer.style.display = 'grid';
            bookingsContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
            bookingsContainer.style.gap = '20px';

            bookings.forEach(booking => {
                createBookingCard(booking);
            });

            startLiveCheck();

        } catch (error) {
            console.error("Erro ao buscar agendamentos:", error);
            bookingsContainer.innerHTML = '<p style="color: #ff4444; text-align: center;">Erro ao carregar seus jogos.</p>';
        }
    }

    // 3. Criar Card (Com Botão Cancelar)
    function createBookingCard(data) {
        const dateParts = data.date.split('-');
        const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        const coverUrl = data.cover || 'assets/images/logo.png';

        // LÓGICA DE LINK ÚNICO
        const roomId = data.sessionId || `session_${data.gameId}_${data.date}_${data.time.replace(':', '-')}`;

        const card = document.createElement('div');
        card.className = 'booking-card';
        card.dataset.date = data.date; 
        card.dataset.time = data.time; 
        card.dataset.id = data.id;

        card.style.cssText = `
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            transition: transform 0.2s;
            position: relative;
        `;
        
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
                
                <div style="display: flex; gap: 10px;">
                    <button id="btn-${data.id}" class="enter-room-btn" disabled 
                            onclick="window.location.href='sala.html?sessionId=${roomId}&bookingId=${data.id}'" 
                            style="flex: 1; padding: 10px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; background: #333; color: #666; transition: 0.3s;">
                        <ion-icon name="lock-closed-outline"></ion-icon> Aguarde...
                    </button>

                    <button onclick="window.requestCancel('${data.id}')" class="cancel-btn"
                            style="width: 45px; background: rgba(255, 68, 68, 0.1); border: 1px solid #ff4444; color: #ff4444; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                        <ion-icon name="trash-outline"></ion-icon>
                    </button>
                </div>
            </div>
        `;

        bookingsContainer.appendChild(card);
        updateCardStatus(card);
    }

    // 4. Timer Logic (Live Check)
    function startLiveCheck() {
        setInterval(() => {
            document.querySelectorAll('.booking-card').forEach(card => updateCardStatus(card));
        }, 10000); // Checa a cada 10s
    }

    function updateCardStatus(card) {
        const btn = card.querySelector('.enter-room-btn');
        const countdownEl = card.querySelector('.booking-timer-countdown');

        const sessionDate = new Date(`${card.dataset.date}T${card.dataset.time}:00`);
        const now = new Date();
        const diffMinutes = Math.floor((sessionDate - now) / 60000);

        if (diffMinutes > 10) {
            // Futuro
            btn.disabled = true;
            btn.style.background = '#333'; btn.style.color = '#666'; btn.style.boxShadow = 'none';
            btn.innerHTML = '<ion-icon name="lock-closed-outline"></ion-icon> Em breve';
            
            if (diffMinutes > 1440) countdownEl.textContent = `Faltam ${Math.floor(diffMinutes/1440)} dias`;
            else if (diffMinutes > 60) countdownEl.textContent = `Faltam ${Math.floor(diffMinutes/60)} horas`;
            else countdownEl.textContent = `Faltam ${diffMinutes} minutos`;
            countdownEl.style.color = '#aaa';

        } else if (diffMinutes <= 10 && diffMinutes > -120) {
            // Agora (Abre 10 min antes até 2h depois)
            btn.disabled = false;
            btn.style.background = '#00ff88'; btn.style.color = '#000'; btn.style.boxShadow = '0 0 15px rgba(0,255,136,0.5)';
            btn.innerHTML = 'ENTRAR <ion-icon name="arrow-forward-outline"></ion-icon>';
            
            if (diffMinutes > 0) {
                countdownEl.textContent = `Começa em ${diffMinutes} min`;
                countdownEl.style.color = '#00ff88';
            } else {
                countdownEl.textContent = `AO VIVO AGORA!`;
                countdownEl.style.color = '#ff0055';
            }

        } else {
            // Passado
            btn.disabled = true;
            btn.style.background = '#333'; btn.style.color = '#666'; btn.style.boxShadow = 'none';
            btn.innerHTML = 'Finalizado';
            countdownEl.textContent = 'Sessão encerrada';
            countdownEl.style.color = '#666';
        }
    }

    // 5. Helpers
    function getStatusColor(s) {
        if(s === 'confirmed' || s === 'paid') return '#00ff88';
        if(s === 'pending') return '#ffbb00';
        if(s === 'cancelled') return '#ff4444';
        return '#aaa';
    }

    function translateStatus(s) {
        if(s === 'confirmed' || s === 'paid') return 'Confirmado';
        if(s === 'pending') return 'Pendente';
        if(s === 'cancelled') return 'Cancelado';
        return s;
    }

    // 6. Lógica de Cancelamento (Global)
    window.requestCancel = (id) => {
        bookingIdToDelete = id;
        if(modalCancel) modalCancel.classList.remove('hidden');
    };

    if(btnAbortCancel) {
        btnAbortCancel.onclick = () => {
            if(modalCancel) modalCancel.classList.add('hidden');
            bookingIdToDelete = null;
        };
    }

    if(btnConfirmCancel) {
        btnConfirmCancel.onclick = async () => {
            if (!bookingIdToDelete) return;
            
            const originalText = btnConfirmCancel.innerText;
            btnConfirmCancel.innerText = "Processando...";
            btnConfirmCancel.disabled = true;

            try {
                await db.collection('bookings').doc(bookingIdToDelete).delete();
                
                // Fecha Modal
                if(modalCancel) modalCancel.classList.add('hidden');
                
                // Recarrega Lista
                const user = auth.currentUser;
                if(user) loadUserBookings(user.uid);
                
                alert("Agendamento cancelado.");
            } catch (e) {
                console.error("Erro ao cancelar:", e);
                alert("Erro ao cancelar: " + e.message);
            } finally {
                btnConfirmCancel.innerText = originalText;
                btnConfirmCancel.disabled = false;
                bookingIdToDelete = null;
            }
        };
    }
});