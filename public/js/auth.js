// Модуль авторизации
let currentUser = null;
let isLoginMode = true;

function switchAuthMode() {
    isLoginMode = !isLoginMode;
    const errorMessage = document.getElementById('errorMessage');
    const authTitle = document.getElementById('authTitle');
    const authButton = document.getElementById('authButton');
    const switchLink = document.getElementById('switchLink');
    
    errorMessage.textContent = '';
    
    if (isLoginMode) {
        authTitle.textContent = 'Вход в RICH-VOICE';
        authButton.textContent = 'Войти';
        switchLink.textContent = 'Нет аккаунта? Зарегистрироваться';
    } else {
        authTitle.textContent = 'Регистрация в RICH-VOICE';
        authButton.textContent = 'Зарегистрироваться';
        switchLink.textContent = 'Уже есть аккаунт? Войти';
    }
}

async function handleAuth() {
    const usernameInput = document.getElementById('usernameInput');
    const passwordInput = document.getElementById('passwordInput');
    const errorMessage = document.getElementById('errorMessage');
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    
    if (!username || !password) {
        errorMessage.textContent = 'Заполните все поля';
        return;
    }
    
    const endpoint = isLoginMode ? '/api/login' : '/api/register';
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('richvoice_user', data.username);
            currentUser = data.username;
            showChat();
        } else {
            errorMessage.textContent = data.error;
        }
    } catch (error) {
        errorMessage.textContent = 'Ошибка подключения к серверу';
        console.error(error);
    }
}

function logout() {
    if (typeof isInVoiceRoom !== 'undefined' && isInVoiceRoom) {
        leaveVoiceRoom();
    }
    if (typeof socket !== 'undefined' && socket) {
        socket.disconnect();
    }
    localStorage.removeItem('richvoice_user');
    currentUser = null;
    document.getElementById('chatContainer').style.display = 'none';
    document.getElementById('authContainer').style.display = 'flex';
    document.getElementById('usernameInput').value = '';
    document.getElementById('passwordInput').value = '';
    document.getElementById('errorMessage').textContent = '';
}