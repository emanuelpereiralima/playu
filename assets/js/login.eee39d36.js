document.addEventListener('DOMContentLoaded', () => {
    // Referências dos formulários
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    // Links de alternância
    const showRegisterLink = document.getElementById('show-register-link');
    const showLoginLink = document.getElementById('show-login-link');
    
    // Botões sociais
    const googleLoginBtn = document.getElementById('google-login-btn');
    const appleLoginBtn = document.getElementById('apple-login-btn'); // MUDANÇA

    // Mensagens de erro
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    // --- LÓGICA DE AUTENTICAÇÃO ---

    // 1. Provedor Google
    const googleProvider = new firebase.auth.GoogleAuthProvider();
    googleLoginBtn.addEventListener('click', () => {
        auth.signInWithPopup(googleProvider)
            .then(authResult => {
                console.log('Login com Google bem-sucedido', authResult.user);
                handleSuccessfulAuth(authResult.user);
            })
            .catch(error => {
                showError('login-error', error.message);
            });
    });
    
    // 2. Provedor Apple (requer configuração complexa)
    appleLoginBtn.addEventListener('click', () => {
        // AVISO: Isto só funcionará após a configuração completa
        // no portal de desenvolvedores da Apple e no Firebase.
        // Não funciona em localhost.
        
        const appleProvider = new firebase.auth.OAuthProvider('apple.com');
        
        // Opcional: Adicionar escopos para pedir nome e email
        // A Apple só fornece o nome na PRIMEIRA vez que o usuário se cadastra.
        appleProvider.addScope('email');
        appleProvider.addScope('name');

        auth.signInWithPopup(appleProvider)
            .then(authResult => {
                console.log('Login com Apple bem-sucedido', authResult.user);
                handleSuccessfulAuth(authResult.user);
            })
            .catch(error => {
                // Trata erros comuns do Apple login
                if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
                    showError('login-error', 'Login com Apple cancelado.');
                } else if (error.code === 'auth/account-exists-with-different-credential') {
                    showError('login-error', 'Já existe uma conta com este e-mail, mas usando um método de login diferente.');
                } else {
                    console.error('Erro Apple:', error);
                    showError('login-error', 'Erro ao logar com Apple. Verifique a configuração do console ou se está em um domínio válido.');
                }
            });
    });

    // 3. Login com Email/Senha
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        auth.signInWithEmailAndPassword(email, password)
            .then(authResult => {
                console.log('Login com Email/Senha bem-sucedido', authResult.user);
                handleSuccessfulAuth(authResult.user);
            })
            .catch(error => {
                showError('login-error', getFriendlyErrorMessage(error));
            });
    });

    // 4. Cadastro com Email/Senha
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        if (password.length < 6) {
            showError('register-error', 'A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        auth.createUserWithEmailAndPassword(email, password)
            .then(authResult => {
                console.log('Cadastro bem-sucedido', authResult.user);
                // Salva o nome do usuário no perfil
                return authResult.user.updateProfile({
                    displayName: name
                }).then(() => {
                    // Passa o usuário para o manipulador
                    handleSuccessfulAuth(authResult.user, {
                        name: name,
                        email: email,
                        role: 'user' // Define a role padrão
                    });
                });
            })
            .catch(error => {
                showError('register-error', getFriendlyErrorMessage(error));
            });
    });

    async function handleSuccessfulAuth(authUser, extraData = {}) {
    const userRef = db.collection('users').doc(authUser.uid);
    const doc = await userRef.get();

    let userData;

    if (!doc.exists) {
        // É um novo usuário (seja do Google, Apple ou cadastro por email)
        console.log('Novo usuário. Criando registro no Firestore...');
        userData = {
            username: authUser.uid, // Usamos o UID do Firebase como username
            name: authUser.displayName || extraData.name,
            email: authUser.email || extraData.email,
            role: extraData.role || 'user' // Padrão é 'user'
        };
        
        if (!userData.email) {
             console.warn("Usuário da Apple não forneceu email.");
        }
        
        await userRef.set(userData);
    } else {
        // Usuário existente, apenas carrega os dados
        console.log('Usuário existente. Carregando dados do Firestore...');
        userData = doc.data();
    }

    // Salva na sessão
    sessionStorage.setItem('loggedInUser', JSON.stringify(userData));

    // --- LÓGICA DE REDIRECIONAMENTO POR CARGO ---
    // (Esta é a nova parte)
    if (userData.role === 'admin') {
        // Se for admin, vai para o painel de admin
        window.location.href = 'admin.html';
    } else if (userData.role === 'host') {
        // Se for host, vai para o painel de host (que criaremos)
        window.location.href = 'host-panel.html';
    } else {
        // Se for 'user' (jogador), vai para o dashboard de agendamento
        window.location.href = 'dashboard.html';
    }
}

    // --- FUNÇÕES AUXILIARES ---

    // Alternar entre formulários
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });

    // Mostrar mensagens de erro
    function showError(elementId, message) {
        const errorEl = document.getElementById(elementId);
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    // Traduzir erros do Firebase
    function getFriendlyErrorMessage(error) {
        switch (error.code) {
            case 'auth/user-not-found':
                return 'Nenhuma conta encontrada com este e-mail.';
            case 'auth/wrong-password':
                return 'Senha incorreta. Tente novamente.';
            case 'auth/invalid-email':
                return 'O formato do e-mail é inválido.';
            case 'auth/email-already-in-use':
                return 'Este e-mail já está cadastrado. Tente fazer login.';
            case 'auth/weak-password':
                return 'A senha é muito fraca. Use pelo menos 6 caracteres.';
            default:
                return error.message;
        }
    }
});