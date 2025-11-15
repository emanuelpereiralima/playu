document.addEventListener('DOMContentLoaded', () => {
    // Referências do Firebase
    // const auth = firebase.auth();
    // const db = firebase.firestore();

    // Elementos da UI
    const userGreeting = document.getElementById('user-greeting');
    const logoutBtn = document.getElementById('logout-btn');
    const userTableBody = document.getElementById('user-table-body');
    const gameListContainer = document.getElementById('game-list-container');

    let loggedInUser = null;

    // --- 1. VERIFICAÇÃO DE AUTENTICAÇÃO (O MAIS IMPORTANTE) ---
    function checkAuth() {
        const user = JSON.parse(sessionStorage.getItem('loggedInUser'));
        
        // Se não estiver logado OU se não for um admin, expulsa
        if (!user || user.role !== 'admin') {
            alert('Acesso negado.');
            window.location.href = 'login.html';
            return;
        }
        
        loggedInUser = user;
        
        // Personaliza a UI
        userGreeting.textContent = `Olá, ${loggedInUser.name.split(' ')[0]}`;
        logoutBtn.addEventListener('click', () => {
            sessionStorage.removeItem('loggedInUser');
            window.location.href = 'login.html';
        });

        // Carrega os dados da página
        loadAllUsers();
        loadAllGames();
    }

    // --- 2. CARREGAR TODOS OS USUÁRIOS (Do Firestore) ---
    async function loadAllUsers() {
        userTableBody.innerHTML = ''; // Limpa o loader
        
        try {
            const snapshot = await db.collection('users').get();
            if (snapshot.empty) {
                userTableBody.innerHTML = '<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>';
                return;
            }

            snapshot.forEach(doc => {
                const user = doc.data();
                const userId = doc.id; // UID do usuário
                
                // Ignora o próprio admin (para não se rebaixar sem querer)
                if (userId === loggedInUser.username) return;

                const tr = document.createElement('tr');
                
                // Cria o <select> de cargos
                const roleSelect = `
                    <select class="role-select" data-user-id="${userId}">
                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>Jogador</option>
                        <option value="host" ${user.role === 'host' ? 'selected' : ''}>Host</option>
                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                `;

                tr.innerHTML = `
                    <td>${user.name || 'Nome não definido'}</td>
                    <td>${user.email || 'Email não definido'}</td>
                    <td>${roleSelect}</td>
                    <td>
                        <button class="submit-btn small-btn save-role-btn" data-user-id="${userId}">
                            Salvar
                        </button>
                    </td>
                `;
                userTableBody.appendChild(tr);
            });

            // Adiciona os eventos aos botões "Salvar"
            document.querySelectorAll('.save-role-btn').forEach(button => {
                button.addEventListener('click', handleRoleSave);
            });

        } catch (error) {
            console.error("Erro ao carregar usuários:", error);
            userTableBody.innerHTML = '<tr><td colspan="4">Erro ao carregar usuários.</td></tr>';
        }
    }

    // --- 3. ATUALIZAR CARGO (No Firestore) ---
    async function handleRoleSave(event) {
        const button = event.target;
        const userId = button.dataset.userId;
        const select = document.querySelector(`.role-select[data-user-id="${userId}"]`);
        const newRole = select.value;

        button.textContent = 'Salvando...';
        button.disabled = true;

        try {
            // Atualiza o documento do usuário no Firestore
            await db.collection('users').doc(userId).update({
                role: newRole
            });
            
            alert(`Cargo do usuário atualizado para "${newRole}".`);
            button.textContent = 'Salvar';
            button.disabled = false;

        } catch (error) {
            console.error("Erro ao atualizar cargo:", error);
            alert('Erro ao salvar. Tente novamente.');
            button.textContent = 'Salvar';
            button.disabled = false;
        }
    }

    // --- 4. CARREGAR JOGOS (Do gamedata.js) ---
    function loadAllGames() {
        const allGames = getGames(); // Do gamedata.js
        gameListContainer.innerHTML = '';
        
        if (!allGames || allGames.length === 0) {
            gameListContainer.innerHTML = '<p>Nenhum jogo cadastrado.</p>';
            return;
        }

        allGames.forEach(game => {
            const item = document.createElement('div');
            item.className = 'booking-item'; // Reutilizando estilo
            item.innerHTML = `
                <div class="booking-item-info">
                    <strong>${game.title}</strong>
                    <span>Proprietário: ${game.ownerId}</span>
                </div>
                <a href="host-panel.html?gameId=${game.id}" class="submit-btn small-btn">
                    Editar Jogo
                    <ion-icon name="pencil-outline"></ion-icon>
                </a>
            `;
            gameListContainer.appendChild(item);
        });
    }

    // --- INICIALIZAÇÃO ---
    checkAuth();
});