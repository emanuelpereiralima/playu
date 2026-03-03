document.addEventListener('DOMContentLoaded', () => {
    console.log("💳 Iniciando Checkout com Busca Ativa de Sala...");

    if (typeof firebase === 'undefined') {
        console.error("Firebase SDK não carregado.");
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

    // 2. HELPER: GERADOR DE ID DE SALA (Padronizado)
    function generateDeterministicId(gameId, date, time) {
        const g = String(gameId).trim().replace(/\s+/g, '');
        const d = String(date).trim();
        const t = String(time).trim().replace(/:/g, '-');
        return `session_${g}_${d}_${t}`;
    }

    // 3. VERIFICAR AUTENTICAÇÃO E CARREGAR DADOS
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            sessionStorage.setItem('pendingCheckout', sessionData);
            alert("Sessão expirada. Faça login novamente.");
            window.location.href = 'login.html';
            return;
        }

        try {
            // Busca dados atualizados do jogo (preço, nome, etc)
            const doc = await db.collection('games').doc(checkoutData.gameId).get();

            if (!doc.exists) {
                alert("Erro: Jogo não encontrado no sistema.");
                window.location.href = 'index.html';
                return;
            }

            gameRealData = doc.data();
            finalPrice = parseFloat(gameRealData.price || 0);

            // Preencher Tela
            if(gameNameEl) gameNameEl.textContent = gameRealData.name;
            
            const coverUrl = gameRealData.coverImage || checkoutData.cover || 'assets/images/logo.png';
            if(coverEl) coverEl.src = coverUrl;
            
            const dateParts = checkoutData.date.split('-'); 
            const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
            if(dateTimeEl) dateTimeEl.textContent = `${dateFormatted} às ${checkoutData.time}`;

            if(priceEl) priceEl.textContent = finalPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

            if(loadingOverlay) loadingOverlay.classList.add('hidden');
            if(contentDiv) contentDiv.classList.remove('hidden');

        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            alert("Erro de conexão.");
        }
    });

    // 4. PROCESSAR PAGAMENTO E CRIAR/ENTRAR NA SALA
    if(confirmBtn) confirmBtn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) return;

        // Trava o botão
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<div class="loader-small"></div> Processando...';
        if(statusText) statusText.textContent = "Validando pagamento e buscando sala...";

        try {
            // SIMULAÇÃO DE PAGAMENTO (1.5s)
            await new Promise(r => setTimeout(r, 1500)); 

            // --- LÓGICA DE BUSCA ATIVA (MOVIDA PARA CÁ) ---
            
            let finalSessionId = null;
            let isFirstCreator = false;

            // A. Verifica se já existe uma sessão para este jogo/dia/hora
            const existingSessionQuery = await db.collection('sessions')
                .where('gameId', '==', checkoutData.gameId)
                .where('config.date', '==', checkoutData.date)
                .where('config.time', '==', checkoutData.time)
                .limit(1)
                .get();

            if (!existingSessionQuery.empty) {
                // Já existe sala! Vamos colocar o usuário nela.
                finalSessionId = existingSessionQuery.docs[0].id;
                console.log("✅ Sala existente encontrada:", finalSessionId);
            } else {
                // Sala nova! Vamos criar.
                finalSessionId = generateDeterministicId(checkoutData.gameId, checkoutData.date, checkoutData.time);
                isFirstCreator = true;
                console.log("🆕 Criando nova sala:", finalSessionId);
            }

            // B. Verifica Duplicidade (se o usuário já pagou/agendou essa sala antes)
            const duplicateCheck = await db.collection('bookings')
                .where('userId', '==', user.uid)
                .where('sessionId', '==', finalSessionId)
                .limit(1)
                .get();

            if (!duplicateCheck.empty) {
                alert("Você já possui um agendamento confirmado para esta sessão!");
                window.location.href = 'dashboard.html';
                return;
            }

            // C. Cria o Registro de Pagamento/Agendamento (Booking)
            await db.collection('bookings').add({
                userId: user.uid,
                userEmail: user.email,
                userName: user.displayName || "Jogador",
                
                gameId: checkoutData.gameId,
                gameName: gameRealData.name,
                cover: gameRealData.coverImage || '',
                
                sessionId: finalSessionId, // Vincula à sala correta
                date: checkoutData.date,
                time: checkoutData.time,
                price: finalPrice,
                
                status: 'confirmed', // Pagamento OK
                paymentMethod: 'simulated',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // D. Cria ou Atualiza a Sala (Session)
            if (isFirstCreator) {
                await db.collection('sessions').doc(finalSessionId).set({
                    gameId: checkoutData.gameId,
                    hostStatus: 'offline',
                    config: {
                        gameName: gameRealData.name,
                        date: checkoutData.date,
                        time: checkoutData.time
                    },
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Se sala já existe, atualiza timestamp para indicar atividade
                await db.collection('sessions').doc(finalSessionId).update({
                    lastBookingAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            // Sucesso Visual
            if(statusText) {
                statusText.textContent = "Pagamento Aprovado! Sala Confirmada.";
                statusText.style.color = "#00ff88";
            }
            
            // Limpa sessão
            sessionStorage.removeItem('checkoutData');
            sessionStorage.removeItem('pendingCheckout');

            // Redireciona
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1000);

        } catch (error) {
            console.error("Erro no processo:", error);
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Tentar Novamente";
            if(statusText) {
                statusText.textContent = "Erro ao processar. Tente novamente.";
                statusText.style.color = "#ff4444";
            }
        }
    };
});