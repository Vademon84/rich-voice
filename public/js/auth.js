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

// ✅ НОВОЕ: Загрузка аватара пользователя
async function loadUserAvatar(username) {
    try {
        const response = await fetch(`/api/user/avatar/${username}`);
        const data = await response.json();
        
        if (data.avatar) {
            // Сохраняем в localStorage
            localStorage.setItem('richvoice_avatar', data.avatar);
            return data.avatar;
        }
        
        return '';
    } catch (error) {
        console.error('Ошибка загрузки аватара:', error);
        return '';
    }
}

// ✅ НОВОЕ: Обновление аватара
async function updateUserAvatar(avatarUrl) {
    try {
        const response = await fetch('/api/user/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser,
                avatarUrl: avatarUrl
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('richvoice_avatar', avatarUrl);
            updateCurrentUserAvatar(avatarUrl);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Ошибка обновления аватара:', error);
        return false;
    }
}

// ✅ НОВОЕ: Отображение аватара текущего пользователя
function updateCurrentUserAvatar(avatarUrl) {
    const currentUserDisplay = document.getElementById('currentUser');
    if (!currentUserDisplay) return;
    
    // Очищаем текущее содержимое
    currentUserDisplay.innerHTML = '';
    
    if (avatarUrl) {
        // Показываем аватар + имя
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.className = 'current-user-avatar';
        img.alt = currentUser;
        currentUserDisplay.appendChild(img);
    }
    
    // Добавляем имя
    const span = document.createElement('span');
    span.textContent = currentUser;
    span.className = 'username-text';
    currentUserDisplay.appendChild(span);
}