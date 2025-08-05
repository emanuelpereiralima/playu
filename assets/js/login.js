document.addEventListener('DOMContentLoaded', () => {
    // --- NOVO: LÓGICA PARA VISUALIZAR/OCULTAR SENHA ---
    const togglePassword = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');

    // Adiciona um evento de clique ao ícone, se ele existir na página.
    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            // Verifica o tipo atual do campo de senha.
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Troca o ícone do olho (aberto/fechado) para refletir o estado.
            togglePassword.setAttribute('name', type === 'password' ? 'eye-off-outline' : 'eye-outline');
        });
    }
    // --- FIM DA NOVA LÓGICA ---


    // Carrega os usuários do localStorage ou usa os dados padrão.
    function getUsers() {
        const storedUsers = localStorage.getItem('users');
        if (storedUsers) {
            return JSON.parse(storedUsers);
        }
        // Se não houver, usa os dados padrão e salva no localStorage.
        const defaultUsers = typeof DEFAULT_USERS_DATA !== 'undefined' ? DEFAULT_USERS_DATA : {};
        localStorage.setItem('users', JSON.stringify(defaultUsers));
        return defaultUsers;
    }

    const loginForm = document.getElementById('login-form');

    // Garante que o formulário existe antes de adicionar o evento.
    if (loginForm) {
        loginForm.addEventListener('submit', function(event) {
            event.preventDefault();
            
            const USERS = getUsers(); // Pega os usuários do storage.

            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const errorMessage = document.getElementById('error-message');

            const user = USERS[username];

            if (user && user.password === password) {
                const sessionData = {
                    username: username,
                    role: user.role,
                    name: user.name // Adiciona o nome à sessão.
                };
                sessionStorage.setItem('loggedInUser', JSON.stringify(sessionData));

                if (user.role === 'admin') {
                    window.location.href = 'admin.html';
                } else if (user.role === 'host') {
                    window.location.href = 'host-panel.html';
                }
            } else {
                errorMessage.style.display = 'block';
            }
        });
    }
});