document.addEventListener('DOMContentLoaded', async () => {
    // 1. Pega os dados básicos que vieram da tela do jogo
    const checkoutDataStr = sessionStorage.getItem('checkoutData');
    if (!checkoutDataStr) {
        alert("Erro: Nenhum jogo selecionado!");
        window.location.href = 'index.html';
        return;
    }

    const checkoutData = JSON.parse(checkoutDataStr);
    let selectedPackage = null; // Variável para guardar o pacote escolhido

    // Preenche o resumo básico na tela (se os elementos existirem)
    if(document.getElementById('checkout-game-name')) document.getElementById('checkout-game-name').textContent = checkoutData.gameName;
    if(document.getElementById('checkout-date')) document.getElementById('checkout-date').textContent = checkoutData.date;
    if(document.getElementById('checkout-time')) document.getElementById('checkout-time').textContent = checkoutData.time;
    if(document.getElementById('checkout-total-price')) document.getElementById('checkout-total-price').textContent = `R$ ${parseFloat(checkoutData.price).toFixed(2)}`;

    // 2. Busca o jogo no Firebase para verificar se existem pacotes especiais
    try {
        const doc = await db.collection('games').doc(checkoutData.gameId).get();
        if (doc.exists) {
            const gameData = doc.data();
            const packages = gameData.pricingCategories || [];

            // Se o jogo TIVER pacotes extras...
            if (packages.length > 0) {
                renderPackages(packages, gameData, checkoutData);
            } else {
                // Se NÃO tiver pacotes, mostra a área de pagamento direto!
                document.getElementById('payment-methods-container').style.display = 'block';
            }
        }
    } catch (error) {
        console.error("Erro ao buscar pacotes do jogo:", error);
        // Em caso de erro, libera o pagamento padrão por segurança
        document.getElementById('payment-methods-container').style.display = 'block';
    }

    // =======================================================
    // FUNÇÕES DE PACOTE
    // =======================================================
    function renderPackages(packages, gameData, checkoutData) {
        document.getElementById('package-selection-container').style.display = 'block';
        const list = document.getElementById('packages-list');
        list.innerHTML = '';

        // Cria a opção Padrão (Base do Jogo)
        const basePrice = gameData.price || checkoutData.price;
        const baseDuration = gameData.sessionDuration || 60;
        
        const baseOption = createPackageCard('Sessão Padrão', basePrice, baseDuration, true);
        baseOption.onclick = () => selectPackage(baseOption, 'Sessão Padrão', basePrice, baseDuration);
        list.appendChild(baseOption);

        // Define a opção padrão como a primeira selecionada
        selectedPackage = { name: 'Sessão Padrão', price: basePrice, duration: baseDuration };

        // Cria os cards para as opções extras (Pacotes Especiais)
        packages.forEach(pkg => {
            const pkgName = pkg.name || pkg.title;
            const pkgPrice = pkg.price;
            const pkgDuration = pkg.duration;
            
            const pkgOption = createPackageCard(pkgName, pkgPrice, pkgDuration, false);
            pkgOption.onclick = () => selectPackage(pkgOption, pkgName, pkgPrice, pkgDuration);
            list.appendChild(pkgOption);
        });
    }

    function createPackageCard(name, price, duration, isActive) {
        const card = document.createElement('div');
        card.className = 'package-card';
        // Estilo dinâmico: Se for o ativo, fica verde neon. Se não, fica cinza.
        card.style.cssText = isActive 
            ? "padding: 15px; border: 2px solid var(--secondary-color); border-radius: 8px; cursor: pointer; background: rgba(0, 255, 136, 0.1); transition: 0.2s;" 
            : "padding: 15px; border: 2px solid #333; border-radius: 8px; cursor: pointer; background: #222; transition: 0.2s;";
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="color: #fff; font-size: 1.1rem;">${name}</strong>
                <span style="font-weight: bold; color: var(--secondary-color); font-size: 1.1rem;">R$ ${parseFloat(price).toFixed(2)}</span>
            </div>
            <div style="font-size: 0.9rem; color: #aaa; margin-top: 5px;">
                <ion-icon name="time-outline" style="vertical-align: -2px;"></ion-icon> Duração: ${duration} minutos
            </div>
        `;
        return card;
    }

    function selectPackage(element, name, price, duration) {
        // Remove o estilo ativo de todos os cards
        document.querySelectorAll('.package-card').forEach(el => {
            el.style.border = '2px solid #333';
            el.style.background = '#222';
        });

        // Aplica o estilo ativo no card clicado
        element.style.border = '2px solid var(--secondary-color)';
        element.style.background = 'rgba(0, 255, 136, 0.1)';

        // Atualiza a memória
        selectedPackage = { name, price, duration };
        
        // Atualiza o Preço Total no topo da tela (se existir)
        const priceDisplay = document.getElementById('checkout-total-price');
        if (priceDisplay) priceDisplay.textContent = `R$ ${parseFloat(price).toFixed(2)}`;
    }

    window.confirmSelectedPackage = () => {
        // 1. Atualiza os dados de checkout com o pacote escolhido
        const data = JSON.parse(sessionStorage.getItem('checkoutData'));
        data.price = selectedPackage.price;
        data.duration = selectedPackage.duration;
        data.packageName = selectedPackage.name; // Salva o nome do pacote escolhido!
        
        sessionStorage.setItem('checkoutData', JSON.stringify(data));

        // 2. Esconde os pacotes e revela os métodos de pagamento (Pix/Cartão)
        document.getElementById('package-selection-container').style.display = 'none';
        
        const paymentMethods = document.getElementById('payment-methods-container');
        if (paymentMethods) {
            paymentMethods.style.display = 'block';
            paymentMethods.scrollIntoView({ behavior: 'smooth' }); // Rola a tela suavemente
        }
    };
});