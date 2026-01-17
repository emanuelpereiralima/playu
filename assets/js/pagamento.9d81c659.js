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

    // 3. Função para Finalizar o Agendamento
    async function finalizeBooking(method) {
        const btn = document.querySelector('button[type="submit"]') || document.getElementById('simulate-pix-btn');
        const originalText = btn.textContent;
        btn.textContent = "Processando...";
        btn.disabled = true;

        try {
            // A. Buscar o E-mail do Host (Baseado no hostId salvo anteriormente)
            let hostEmail = "admin@playu.com"; // Fallback
            
            if (bookingData.hostId) {
                const hostDoc = await db.collection('users').doc(bookingData.hostId).get();
                if (hostDoc.exists) {
                    hostEmail = hostDoc.data().email;
                }
            }

            // B. Salvar Agendamento na coleção 'bookings'
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

            await db.collection('bookings').add(finalBooking);

            // C. Disparar Email via Extensão (Escrevendo na coleção 'mail')
            // A extensão lê este documento e envia o email automaticamente
            await db.collection('mail').add({
                to: hostEmail, // Envia para o Host
                cc: loggedInUser.email, // Cópia para o Jogador (opcional)
                message: {
                    subject: `Nova Sessão Confirmada: ${bookingData.gameName}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; color: #333;">
                            <h2 style="color: #E94560;">Novo Agendamento Recebido!</h2>
                            <p>Olá Host, você tem uma nova sessão confirmada.</p>
                            <hr>
                            <p><strong>Jogo:</strong> ${bookingData.gameName}</p>
                            <p><strong>Jogador:</strong> ${loggedInUser.name} (${loggedInUser.email})</p>
                            <p><strong>Data:</strong> ${bookingData.date.split('-').reverse().join('/')}</p>
                            <p><strong>Horário:</strong> ${bookingData.time}</p>
                            <p><strong>Valor:</strong> ${bookingData.price}</p>
                            <hr>
                            <p>Acesse seu painel para iniciar a sala.</p>
                        </div>
                    `
                }
            });

            console.log("Solicitação de email enviada para a fila.");

            // D. Limpeza e Redirecionamento
            sessionStorage.removeItem('pendingBooking');
            sessionStorage.removeItem('redirectAfterLogin');

            alert(`Pagamento aprovado!\n\nO agendamento foi confirmado e o e-mail enviado.`);
            window.location.href = 'dashboard.html';

        } catch (error) {
            console.error("Erro crítico:", error);
            alert("Erro ao processar. Tente novamente.");
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    // 4. Event Listeners
    const paymentForm = document.getElementById('payment-form');
    if (paymentForm) {
        paymentForm.addEventListener('submit', (e) => {
            e.preventDefault();
            finalizeBooking('Credit Card');
        });
    }

    const pixBtn = document.getElementById('simulate-pix-btn');
    if (pixBtn) {
        pixBtn.addEventListener('click', () => {
            finalizeBooking('PIX');
        });
    }
});