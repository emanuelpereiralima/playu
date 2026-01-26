document.addEventListener('DOMContentLoaded', () => {
    console.log("💳 Iniciando Checkout...");

    // Verifica Firebase
    if (typeof firebase === 'undefined') {
        console.error("Firebase SDK não carregado.");
        alert("Erro crítico: Sistema não carregado.");
        return;
    }

    const db = firebase.firestore();
    const auth = firebase.auth();

    // Elementos da Interface
    const loadingOverlay = document.getElementById('payment-loading');
    const contentDiv = document.getElementById('payment-content');
    
    const gameNameEl = document.getElementById('checkout-game-name');
    const dateTimeEl = document.getElementById('checkout-datetime');
    const priceEl = document.getElementById('checkout-total-price');
    const coverEl = document.getElementById('checkout-cover');
    const confirmBtn = document.getElementById('confirm-payment-btn');
    const statusText = document.getElementById('payment-status');

    // Variáveis de Estado
    let finalPrice = 0;
    let gameRealData = null;

    // 1. RECUPERAR DADOS DA SESSÃO
    const sessionData = sessionStorage.getItem('checkoutData');
    
    if (!sessionData) {
        alert("Nenhum agendamento iniciado. Redirecionando para a home.");
        window.location.href = 'index.html';
        return;
    }

    const checkoutData = JSON.parse(sessionData);

    // 2. VERIFICAR AUTENTICAÇÃO E DADOS
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            sessionStorage.setItem('pendingCheckout', sessionData);
            alert("Sessão expirada. Faça login novamente.");
            window.location.href = 'login.html';
            return;
        }

        try {
            // 3. BUSCAR DADOS REAIS DO JOGO
            const doc = await db.collection('games').doc(checkoutData.gameId).get();

            if (!doc.exists) {
                alert("Erro: Jogo não encontrado no sistema.");
                window.location.href = 'index.html';
                return;
            }

            gameRealData = doc.data();
            finalPrice = parseFloat(gameRealData.price || 0);

            // 4. PREENCHER TELA
            if(gameNameEl) gameNameEl.textContent = gameRealData.name;
            
            const coverUrl = gameRealData.coverImage || checkoutData.cover || 'assets/images/logo.png';
            if(coverEl) coverEl.src = coverUrl;
            
            const dateParts = checkoutData.date.split('-'); 
            const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
            if(dateTimeEl) dateTimeEl.textContent = `${dateFormatted} às ${checkoutData.time}`;

            if(priceEl) priceEl.textContent = finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            if(loadingOverlay) {
                loadingOverlay.classList.add('hidden');
                loadingOverlay.style.display = 'none';
            }
            if(contentDiv) contentDiv.classList.remove('hidden');

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            alert("Erro de conexão. Tente recarregar.");
        }
    });

    // 5. PROCESSAR PAGAMENTO
    if(confirmBtn) confirmBtn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) return;

        confirmBtn.disabled = true;
        confirmBtn.textContent = "Processando...";
        if(statusText) statusText.textContent = "Validando pagamento...";

        try {
            // Simulação de delay de pagamento
            await new Promise(r => setTimeout(r, 1500)); 

            const finalCover = gameRealData.coverImage || 'assets/images/logo.png';

            // --- LÓGICA DE LINK ÚNICO ---
            // Gera um ID determinístico para a sala: session_JOGO_DATA_HORA
            const uniqueSessionId = `session_${checkoutData.gameId}_${checkoutData.date}_${checkoutData.time.replace(':', '-')}`;

            // Salva no Banco
            await db.collection('bookings').add({
                gameId: checkoutData.gameId,
                gameName: gameRealData.name,
                cover: finalCover,
                
                // ID DA SALA COMPARTILHADA
                sessionId: uniqueSessionId,
                
                userId: user.uid,
                userName: user.displayName || user.email,
                userEmail: user.email,
                
                date: checkoutData.date,
                time: checkoutData.time,
                price: finalPrice,
                status: 'confirmed',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            if(statusText) {
                statusText.textContent = "Pagamento aprovado!";
                statusText.style.color = "#00ff88";
            }

            sessionStorage.removeItem('checkoutData');
            sessionStorage.removeItem('pendingCheckout');

            alert("Sucesso! Seu jogo está agendado.");
            window.location.href = 'dashboard.html'; 

        } catch (error) {
            console.error("Erro no pagamento:", error);
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Pagar e Agendar";
            if(statusText) {
                statusText.textContent = "Erro ao processar. Tente novamente.";
                statusText.style.color = "#ff4444";
            }
        }
    };
});