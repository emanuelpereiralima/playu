document.getElementById('login-form').addEventListener('submit', function(event) {
    event.preventDefault(); // Impede o envio do formulário

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');

    // Validação de login (SIMULAÇÃO - NENHUMA SEGURANÇA)
    if (username === 'admin' && password === 'admin') {
        // Redireciona para o painel de admin em caso de sucesso
        window.location.href = 'admin.html';
    } else {
        // Mostra a mensagem de erro
        errorMessage.style.display = 'block';
    }
});