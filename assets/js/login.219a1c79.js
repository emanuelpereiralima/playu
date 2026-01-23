// assets/js/login.js

document.addEventListener('DOMContentLoaded', () => {
    const auth = window.auth;
    const db = window.db;

    if (!auth) {
        console.error("ERRO CRÍTICO: 'auth' não foi encontrado.");
        return;
    }

    // Referências dos elementos
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterLink = document.getElementById('show-register-link');
    const showLoginLink = document.getElementById('show-login-link');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const appleLoginBtn = document.getElementById('apple-login-btn');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');

    // --- 1. LOGIN SOCIAL (Google/Apple) - Não exige verificação manual ---
    
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

    // --- 2. LOGIN COM EMAIL/SENHA (Com verificação de E-mail) ---
    if(loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            
            auth.signInWithEmailAndPassword(email, password)
                .then(authResult => {
                    const user = authResult.user;

                    // VERIFICAÇÃO DE E-MAIL
                    if (!user.emailVerified) {
                        // Se não verificou, desloga e mostra erro
                        auth.signOut();
                        showError('login-error', 'Seu e-mail ainda não foi verificado. Por favor, verifique sua caixa de entrada (e spam).');
                        
                        // Opcional: Link para reenviar
                        // Você pode adicionar um botão aqui para user.sendEmailVerification() se quiser sofisticar
                        return;
                    }

                    // Se verificado, prossegue
                    handleSuccessfulAuth(user);
                })
                .catch(error => {
                    showError('login-error', getFriendlyErrorMessage(error));
                });
        });
    }

    // --- 3. CADASTRO COM EMAIL/SENHA (Envia E-mail e Bloqueia Acesso) ---
    if(registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const name = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-confirm-password').value;

            if (password.length < 6) {
                showError('register-error', 'A senha deve ter pelo menos 6 caracteres.');
                return;
            }
            if (password !== confirmPassword) {
                showError('register-error', 'As senhas não conferem.');
                return;
            }

            // Cria o usuário
            auth.createUserWithEmailAndPassword(email, password)
                .then(async (authResult) => {
                    const user = authResult.user;

                    try {
                        // 1. Atualiza o nome no Auth
                        await user.updateProfile({ displayName: name });

                        // 2. Envia o E-mail de Verificação
                        await user.sendEmailVerification();

                        // 3. Cria o registro no Firestore (Importante criar agora para salvar o nome)
                        await db.collection('users').doc(user.uid).set({
                            username: user.uid,
                            name: name,
                            email: email,
                            role: 'user',
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });

                        // 4. Desloga o usuário imediatamente (para impedir acesso ao dashboard)
                        await auth.signOut();

                        // 5. Feedback visual e troca para tela de login
                        alert(`Conta criada com sucesso! Um e-mail de verificação foi enviado para ${email}. Verifique sua caixa de entrada antes de fazer login.`);
                        
                        // Limpa form e volta para login
                        registerForm.reset();
                        registerForm.classList.add('hidden');
                        loginForm.classList.remove('hidden');
                        showError('login-error', 'Verifique seu e-mail para continuar.'); // Mensagem verde ou informativa seria melhor, mas usa o container de erro por enquanto

                    } catch (error) {
                        console.error("Erro no processo de pós-cadastro:", error);
                        showError('register-error', 'Conta criada, mas houve um erro ao enviar o e-mail. Tente logar.');
                    }
                })
                .catch(error => {
                    showError('register-error', getFriendlyErrorMessage(error));
                });
        });
    }

    // --- FUNÇÕES AUXILIARES ---

    async function handleSuccessfulAuth(authUser, extraData = {}) {
        // Sincroniza ou atualiza dados no Firestore
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

            sessionStorage.setItem('loggedInUser', JSON.stringify(userData));

            // Redirecionamento
            // Verifica se havia uma intenção de redirecionamento (do game-page.js)
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
            case 'auth/too-many-requests': return 'Muitas tentativas. Tente novamente mais tarde.';
            default: return error.message;
        }
    }
});