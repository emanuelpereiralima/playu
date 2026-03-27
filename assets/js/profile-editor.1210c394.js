document.addEventListener('DOMContentLoaded', () => {
    // Pega o usuário logado da sessão
    const sessionDataString = sessionStorage.getItem('loggedInUser');
    if (!sessionDataString) return; // Sai se ninguém estiver logado
    const loggedInUser = JSON.parse(sessionDataString);

    // Seleciona os elementos do formulário de perfil
    const profilePanel = document.querySelector('.profile-panel'); // Seleciona o painel inteiro
    const profileForm = document.getElementById('profile-form');
    const nameInput = document.getElementById('profile-name');
    const emailInput = document.getElementById('profile-email');
    const newPasswordInput = document.getElementById('profile-new-password');
    const confirmPasswordInput = document.getElementById('profile-confirm-password');
    const profileMessage = document.getElementById('profile-message');

    // Função para carregar os dados do usuário no formulário
    function loadProfileData() {
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        const userData = users[loggedInUser.username];

        if (userData) {
            nameInput.value = userData.name || '';
            emailInput.value = userData.email || '';
        }
    }

    // Lógica para salvar as alterações
    profileForm.addEventListener('submit', (event) => {
        event.preventDefault();
        profileMessage.style.display = 'none';

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // Validação de senha
        if (newPassword && newPassword !== confirmPassword) {
            profileMessage.textContent = 'As senhas não coincidem.';
            profileMessage.className = 'error';
            profileMessage.style.display = 'block';
            return;
        }

        // Atualiza os dados no localStorage
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        const userData = users[loggedInUser.username];

        if (userData) {
            userData.name = nameInput.value;
            userData.email = emailInput.value;
            if (newPassword) {
                userData.password = newPassword;
            }

            localStorage.setItem('users', JSON.stringify(users));

            newPasswordInput.value = '';
            confirmPasswordInput.value = '';
            profileMessage.textContent = 'Perfil atualizado com sucesso!';
            profileMessage.className = 'success';
            profileMessage.style.display = 'block';

            const headerUsername = document.querySelector('#host-username');
            if (headerUsername && loggedInUser.role === 'host') {
                headerUsername.textContent = userData.name;
            }

            // --- MELHORIA ADICIONADA AQUI ---
            // Após 2 segundos, esconde a mensagem e o painel de perfil.
            setTimeout(() => {
                profileMessage.style.display = 'none';
                if (profilePanel) {
                    profilePanel.classList.add('hidden');
                }
            }, 1000);
        }
    });

    // Carrega os dados do perfil ao iniciar a página
    loadProfileData();
});