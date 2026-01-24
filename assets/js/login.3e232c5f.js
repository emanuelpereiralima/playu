document.addEventListener('DOMContentLoaded', () => {
    const auth = window.auth;
    const db = window.db;

    if (!auth) {
        console.error("ERRO CRÍTICO: 'auth' não foi encontrado.");
        return;
    }

    // Configura persistência do Firebase para LOCAL (mantém mesmo fechando o navegador)
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .catch(error => console.error("Erro na persistência do Auth:", error));

    // Referências dos elementos
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterLink = document.getElementById('show-register-link');
    const showLoginLink = document.getElementById('show-login-link');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const appleLoginBtn = document.getElementById('apple-login-btn');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    // --- 1. LOGIN SOCIAL (Google/Apple) ---
    if(googleLoginBtn) {
        googleLoginBtn.addEventListener('click', () => {
            const googleProvider = new firebase.auth.GoogleAuthProvider();
            auth.signInWithPopup(googleProvider)
                .then(authResult => handleSuccessfulAuth(authResult.user))
                .catch(error => showError('login-error', error.message));
        });
    }
    
    if(appleLoginBtn) {
        appleLoginBtn.addEventListener('click', () => {
            const appleProvider = new firebase.auth.OAuthProvider('apple.com');
            appleProvider.addScope('email');
            appleProvider.addScope('name');
            auth.signInWithPopup(appleProvider)
                .then(authResult => handleSuccessfulAuth(authResult.user))
                .catch(error => showError('login-error', 'Erro no login Apple: ' + error.message));
        });
    }

    // --- 2. LOGIN COM EMAIL/SENHA ---
    if(loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            
            auth.signInWithEmailAndPassword(email, password)
                .then(authResult => {
                    const user = authResult.user;
                    if (!user.emailVerified) {
                        auth.signOut();
                        showError('login-error', 'Seu e-mail ainda não foi verificado. Por favor, verifique sua caixa de entrada.');
                        return;
                    }
                    handleSuccessfulAuth(user);
                })
                .catch(error => {
                    showError('login-error', getFriendlyErrorMessage(error));
                });
        });
    }

    // --- 3. CADASTRO ---
    if(registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-confirm-password').value;

            if (password.length < 6) return showError('register-error', 'A senha deve ter pelo menos 6 caracteres.');
            if (password !== confirmPassword) return showError('register-error', 'As senhas não conferem.');

            auth.createUserWithEmailAndPassword(email, password)
                .then(async (authResult) => {
                    const user = authResult.user;
                    try {
                        await user.updateProfile({ displayName: name });
                        await user.sendEmailVerification();
                        await db.collection('users').doc(user.uid).set({
                            username: user.uid,
                            name: name,
                            email: email,
                            role: 'user',
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        await auth.signOut();
                        alert(`Conta criada! Verifique o e-mail enviado para ${email}.`);
                        registerForm.reset();
                        registerForm.classList.add('hidden');
                        loginForm.classList.remove('hidden');
                        showError('login-error', 'Verifique seu e-mail para continuar.');
                    } catch (error) {
                        console.error("Erro pós-cadastro:", error);
                        showError('register-error', 'Erro ao salvar dados. Tente logar.');
                    }
                })
                .catch(error => showError('register-error', getFriendlyErrorMessage(error)));
        });
    }

    // --- FUNÇÕES AUXILIARES ---

    async function handleSuccessfulAuth(authUser, extraData = {}) {
        const userRef = db.collection('users').doc(authUser.uid);
        
        try {
            const doc = await userRef.get();
            let userData;

            if (!doc.exists) {
                userData = {
                    username: authUser.uid,
                    name: authUser.displayName || extraData.name || 'Usuário',
                    email: authUser.email,
                    role: extraData.role || 'user'
                };
                await userRef.set(userData);
            } else {
                userData = doc.data();
            }

            // LÓGICA DE PERSISTÊNCIA (2 DIAS)
            const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
            const sessionData = {
                ...userData,
                authExpiry: Date.now() + twoDaysInMs // Define data de validade
            };

            // Salva no localStorage (Persistente)
            localStorage.setItem('loggedInUser', JSON.stringify(sessionData));
            
            // Salva também no sessionStorage para compatibilidade imediata com scripts antigos
            sessionStorage.setItem('loggedInUser', JSON.stringify(userData));

            // Redirecionamento
            const redirectUrl = sessionStorage.getItem('redirectAfterLogin');
            if (redirectUrl) {
                sessionStorage.removeItem('redirectAfterLogin');
                window.location.href = redirectUrl;
            } else {
                if (userData.role === 'admin') window.location.href = 'admin.html';
                else if (userData.role === 'host') window.location.href = 'host-panel.html';
                else window.location.href = 'dashboard.html';
            }

        } catch (error) {
            console.error("Erro ao buscar dados do usuário:", error);
            showError('login-error', 'Erro ao conectar com o banco de dados.');
        }
    }

    if(showRegisterLink) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            loginError.classList.add('hidden');
        });
    }

    if(showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
            registerError.classList.add('hidden');
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
            case 'auth/user-not-found': return 'Nenhuma conta encontrada com este e-mail.';
            case 'auth/wrong-password': return 'Senha incorreta.';
            case 'auth/invalid-email': return 'O formato do e-mail é inválido.';
            case 'auth/email-already-in-use': return 'Este e-mail já está cadastrado.';
            case 'auth/weak-password': return 'A senha é muito fraca. Mínimo 6 caracteres.';
            default: return error.message;
        }
    }
});