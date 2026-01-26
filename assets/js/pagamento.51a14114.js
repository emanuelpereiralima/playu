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
    let gameRealData = null; // Para armazenar dados frescos do banco

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
            // Se perdeu o login no meio do caminho, salva a intenção e manda logar
            sessionStorage.setItem('pendingCheckout', sessionData);
            alert("Sessão expirada. Faça login novamente.");
            window.location.href = 'login.html';
            return;
        }

        try {
            // 3. BUSCAR DADOS REAIS DO JOGO NO FIREBASE (SEGURANÇA)
            // Impede manipulação de preço via console do navegador
            const doc = await db.collection('games').doc(checkoutData.gameId).get();

            if (!doc.exists) {
                alert("Erro: Jogo não encontrado no sistema.");
                window.location.href = 'index.html';
                return;
            }

            gameRealData = doc.data();
            
            // Define o preço real (Fallback para 0 se não definido)
            finalPrice = parseFloat(gameRealData.price || 0);

            // 4. PREENCHER A TELA COM DADOS VALIDADOS
            if(gameNameEl) gameNameEl.textContent = gameRealData.name;
            
            // Capa: Prioriza a do banco, senão usa a da sessão, senão placeholder
            const coverUrl = gameRealData.coverImage || checkoutData.cover || 'assets/images/logo.png';
            if(coverEl) coverEl.src = coverUrl;
            
            // Formata Data (YYYY-MM-DD -> DD/MM/YYYY)
            const dateParts = checkoutData.date.split('-'); 
            const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
            if(dateTimeEl) dateTimeEl.textContent = `${dateFormatted} às ${checkoutData.time}`;

            // Formata Preço
            if(priceEl) priceEl.textContent = finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            // 5. REMOVER LOADING E MOSTRAR CONTEÚDO
            if(loadingOverlay) {
                loadingOverlay.classList.add('hidden');
                loadingOverlay.style.display = 'none'; // Garantia extra
            }
            if(contentDiv) contentDiv.classList.remove('hidden');

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            alert("Erro de conexão com o servidor. Tente recarregar.");
        }
    });

    // 6. LÓGICA DO BOTÃO PAGAR
    if(confirmBtn) confirmBtn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) return;

        confirmBtn.disabled = true;
        confirmBtn.textContent = "Processando...";
        if(statusText) statusText.textContent = "Validando pagamento...";

        try {
            // SIMULAÇÃO DE PAGAMENTO (Aqui entraria Stripe/MercadoPago)
            await new Promise(r => setTimeout(r, 1500)); // Delay simulado

            // Garante URL da capa para salvar no histórico
            const finalCover = gameRealData.coverImage || 'assets/images/logo.png';

            // CRIA O AGENDAMENTO FINAL NO BANCO
            await db.collection('bookings').add({
                gameId: checkoutData.gameId,
                gameName: gameRealData.name, // Nome validado
                cover: finalCover, // IMPORTANTE: Salva a capa para o Dashboard
                
                userId: user.uid,
                userName: user.displayName || user.email,
                userEmail: user.email,
                
                date: checkoutData.date,
                time: checkoutData.time,
                price: finalPrice,
                
                status: 'confirmed', // Em produção: 'pending' até webhook de pagto
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            if(statusText) {
                statusText.textContent = "Pagamento aprovado!";
                statusText.style.color = "#00ff88";
            }

            // Limpa a sessão
            sessionStorage.removeItem('checkoutData');
            sessionStorage.removeItem('pendingCheckout');

            alert("Sucesso! Seu jogo está agendado.");
            // Redireciona para dashboard (usando o nome correto do arquivo)
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