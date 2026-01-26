document.addEventListener('DOMContentLoaded', () => {
    console.log("💳 Iniciando Checkout...");

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

    // Variável para armazenar preço real vindo do banco (Segurança)
    let finalPrice = 0;

    // 1. RECUPERAR DADOS DA SESSÃO (INTENÇÃO DE COMPRA)
    const sessionData = sessionStorage.getItem('checkoutData');
    
    if (!sessionData) {
        alert("Nenhum agendamento iniciado. Redirecionando para a home.");
        window.location.href = 'index.html';
        return;
    }

    const checkoutData = JSON.parse(sessionData);

    // 2. VERIFICAR AUTENTICAÇÃO E DADOS NO FIREBASE
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            // Se perdeu o login no meio do caminho
            alert("Sessão expirada. Faça login novamente.");
            window.location.href = 'login.html';
            return;
        }

        try {
            // 3. BUSCAR DADOS REAIS DO JOGO NO FIREBASE
            // (Isso evita que alguém edite o sessionStorage para mudar o preço)
            const doc = await db.collection('games').doc(checkoutData.gameId).get();

            if (!doc.exists) {
                alert("Erro: Jogo não encontrado no sistema.");
                window.location.href = 'index.html';
                return;
            }

            const gameRealData = doc.data();
            finalPrice = parseFloat(gameRealData.price || 0);

            // 4. PREENCHER A TELA
            gameNameEl.textContent = gameRealData.name;
            coverEl.src = gameRealData.coverImage || 'assets/images/logo.png';
            
            // Formata Data
            const dateParts = checkoutData.date.split('-'); // YYYY-MM-DD
            const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
            dateTimeEl.textContent = `${dateFormatted} às ${checkoutData.time}`;

            // Formata Preço
            priceEl.textContent = finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            // 5. REMOVER LOADING E MOSTRAR CONTEÚDO
            loadingOverlay.classList.add('hidden'); // classe do style.css que dá display:none
            loadingOverlay.style.display = 'none'; // Garantia extra inline
            contentDiv.classList.remove('hidden');

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            alert("Erro de conexão com o servidor.");
        }
    });

    // 6. LÓGICA DO BOTÃO PAGAR
    confirmBtn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) return;

        confirmBtn.disabled = true;
        confirmBtn.textContent = "Processando...";
        statusText.textContent = "Validando pagamento...";

        try {
            // Simulação de delay de pagamento (Pix/Gateway)
            await new Promise(r => setTimeout(r, 2000));

            // CRIA O AGENDAMENTO FINAL NO BANCO
            await db.collection('bookings').add({
                gameId: checkoutData.gameId,
                gameName: gameNameEl.textContent, // Pega o nome validado
                userId: user.uid,
                userName: user.displayName || user.email,
                userEmail: user.email,
                date: checkoutData.date,
                time: checkoutData.time,
                price: finalPrice, // Usa o preço validado
                status: 'confirmed', 
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            statusText.textContent = "Pagamento aprovado!";
            statusText.style.color = "#00ff88";

            // Limpa a sessão
            sessionStorage.removeItem('checkoutData');

            alert("Sucesso! Seu jogo está agendado.");
            window.location.href = 'minha-conta.html'; // Redireciona para dashboard do usuário

        } catch (error) {
            console.error(error);
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Pagar e Agendar";
            statusText.textContent = "Erro ao processar. Tente novamente.";
            statusText.style.color = "#ff4444";
        }
    };
});