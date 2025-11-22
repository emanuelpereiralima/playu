// assets/js/login.js

document.addEventListener('DOMContentLoaded', () => {
    // --- A CORREÇÃO: Puxamos explicitamente do objeto global window ---
    const auth = window.auth;
    const db = window.db;

    // Debug: Verifica no console se carregou
    if (!auth) {
        console.error("ERRO CRÍTICO: 'auth' não foi encontrado. Verifique o firebase-config.js");
        return; // Para a execução se não houver auth
    }

    // Referências dos formulários
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    // Links de alternância
    const showRegisterLink = document.getElementById('show-register-link');
    const showLoginLink = document.getElementById('show-login-link');
    
    // Botões sociais
    const googleLoginBtn = document.getElementById('google-login-btn');
    const appleLoginBtn = document.getElementById('apple-login-btn');

    // Mensagens de erro
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    // --- LÓGICA DE AUTENTICAÇÃO ---

    // 1. Provedor Google
    const googleProvider = new firebase.auth.GoogleAuthProvider();
    
    if(googleLoginBtn) {
        googleLoginBtn.addEventListener('click', () => {
            auth.signInWithPopup(googleProvider)
                .then(authResult => {
                    console.log('Login com Google bem-sucedido', authResult.user);
                    handleSuccessfulAuth(authResult.user);
                })
                .catch(error => {
                    console.error("Erro Google:", error);
                    showError('login-error', error.message);
                });
        });
    }
    
    // 2. Provedor Apple
    if(appleLoginBtn) {
        appleLoginBtn.addEventListener('click', () => {
            const appleProvider = new firebase.auth.OAuthProvider('apple.com');
            appleProvider.addScope('email');
            appleProvider.addScope('name');

            auth.signInWithPopup(appleProvider)
                .then(authResult => {
                    console.log('Login com Apple bem-sucedido', authResult.user);
                    handleSuccessfulAuth(authResult.user);
                })
                .catch(error => {
                    if (error.code === 'auth/cancelled-popup-request' || error.code === 'auth/popup-closed-by-user') {
                        showError('login-error', 'Login com Apple cancelado.');
                    } else {
                        console.error('Erro Apple:', error);
                        showError('login-error', 'Erro ao logar com Apple. Verifique se está em um domínio seguro (HTTPS).');
                    }
                });
        });
    }

    // 3. Login com Email/Senha
    if(loginForm) {
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
    }

// 4. Cadastro com Email/Senha
    if(registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Pega os valores dos campos
            const name = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-confirm-password').value; // NOVO

            // Validação 1: Tamanho da senha
            if (password.length < 6) {
                showError('register-error', 'A senha deve ter pelo menos 6 caracteres.');
                return;
            }

            // Validação 2: Senhas iguais (NOVO)
            if (password !== confirmPassword) {
                showError('register-error', 'As senhas não conferem. Por favor, verifique.');
                return;
            }

            // Se passou nas validações, cria a conta no Firebase
            auth.createUserWithEmailAndPassword(email, password)
                .then(authResult => {
                    console.log('Cadastro bem-sucedido', authResult.user);
                    return authResult.user.updateProfile({
                        displayName: name
                    }).then(() => {
                        handleSuccessfulAuth(authResult.user, {
                            name: name,
                            email: email,
                            role: 'user'
                        });
                    });
                })
                .catch(error => {
                    showError('register-error', getFriendlyErrorMessage(error));
                });
        });
    }

    /**
     * Pega o objeto do usuário (do Auth) e sincroniza com o Firestore.
     * Salva o usuário final no sessionStorage e REDIRECIONA BASEADO NO CARGO.
     */
    async function handleSuccessfulAuth(authUser, extraData = {}) {
        const userRef = db.collection('users').doc(authUser.uid);
        const doc = await userRef.get();

        let userData;

        if (!doc.exists) {
            // É um novo usuário
            console.log('Novo usuário. Criando registro no Firestore...');
            userData = {
                username: authUser.uid,
                name: authUser.displayName || extraData.name,
                email: authUser.email || extraData.email,
                role: extraData.role || 'user'
            };
            
            await userRef.set(userData);
        } else {
            // Usuário existente
            console.log('Usuário existente. Carregando dados do Firestore...');
            userData = doc.data();
        }

        // Salva na sessão
        sessionStorage.setItem('loggedInUser', JSON.stringify(userData));

        // --- LÓGICA DE REDIRECIONAMENTO ---
        if (userData.role === 'admin') {
            window.location.href = 'admin.html';
        } else if (userData.role === 'host') {
            window.location.href = 'host-panel.html';
        } else {
            window.location.href = 'dashboard.html';
        }
    }

    // --- FUNÇÕES AUXILIARES ---

    if(showRegisterLink) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
        });
    }

    if(showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
        });
    }

    function showError(elementId, message) {
        const errorEl = document.getElementById(elementId);
        if(errorEl) {
            errorEl.textContent = message;
            errorEl.classList.remove('hidden');
        }
    }

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