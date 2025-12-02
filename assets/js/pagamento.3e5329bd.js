document.addEventListener('DOMContentLoaded', () => {
    const db = window.db || firebase.firestore();
    const auth = window.auth;

    // 1. Verificação de Segurança
    const userSession = sessionStorage.getItem('loggedInUser');
    const pendingBookingStr = sessionStorage.getItem('pendingBooking');

    if (!userSession) {
        alert("Sessão expirada. Faça login novamente.");
        window.location.href = 'login.html';
        return;
    }
    
    if (!pendingBookingStr) {
        alert("Nenhum agendamento encontrado.");
        window.location.href = 'index.html';
        return;
    }

    const loggedInUser = JSON.parse(userSession);
    const bookingData = JSON.parse(pendingBookingStr);

    // 2. Preencher Resumo na Tela
    document.getElementById('summary-game-name').textContent = bookingData.gameName;
    document.getElementById('summary-date').textContent = bookingData.date.split('-').reverse().join('/');
    document.getElementById('summary-time').textContent = bookingData.time;
    document.getElementById('summary-price').textContent = bookingData.price;
    
    const imgEl = document.getElementById('summary-img');
    if(imgEl) imgEl.src = bookingData.coverImage || 'assets/images/logo.png';

    // 3. Função para Finalizar o Agendamento (Salvar no Firebase)
    async function finalizeBooking(method) {
        // Mostra Loading (pode adicionar um overlay visual aqui)
        const btn = document.querySelector('button[type="submit"]') || document.getElementById('simulate-pix-btn');
        btn.textContent = "Processando...";
        btn.disabled = true;

        try {
            // Cria o objeto final para o banco
            const finalBooking = {
                gameId: bookingData.gameId,
                gameName: bookingData.gameName,
                hostId: bookingData.hostId,
                userId: loggedInUser.username,
                userName: loggedInUser.name,
                userEmail: loggedInUser.email,
                date: bookingData.date,
                time: bookingData.time,
                price: bookingData.price,
                paymentMethod: method,
                paymentStatus: 'paid',
                status: 'confirmed',
                bookingDate: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Salva na coleção 'bookings'
            const docRef = await db.collection('bookings').add(finalBooking);

            // Limpa dados temporários
            sessionStorage.removeItem('pendingBooking');
            sessionStorage.removeItem('redirectAfterLogin');

            // Sucesso!
            alert(`Pagamento aprovado!\nSeu jogo está agendado para ${finalBooking.date} às ${finalBooking.time}.`);
            
            // Redireciona para o Dashboard onde ele verá o agendamento
            window.location.href = 'dashboard.html';

        } catch (error) {
            console.error("Erro ao salvar agendamento:", error);
            alert("Houve um erro ao processar seu agendamento. O pagamento não foi cobrado. Tente novamente.");
            btn.textContent = "Tentar Novamente";
            btn.disabled = false;
        }
    }

    // 4. Event Listeners dos botões de pagamento

    // Cartão de Crédito
    const paymentForm = document.getElementById('payment-form');
    if (paymentForm) {
        paymentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // Aqui entraria a integração real com Stripe/Pagar.me
            // Simulamos um delay de 2 segundos
            setTimeout(() => finalizeBooking('Credit Card'), 1500);
        });
    }

    // PIX
    const pixBtn = document.getElementById('simulate-pix-btn');
    if (pixBtn) {
        pixBtn.addEventListener('click', () => {
            setTimeout(() => finalizeBooking('PIX'), 1500);
        });
    }
});