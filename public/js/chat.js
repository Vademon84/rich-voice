// Модуль чата
function formatDateTime(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();
    
    const time = date.toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    if (isToday) {
        return `Сегодня, ${time}`;
    } else if (isYesterday) {
        return `Вчера, ${time}`;
    } else {
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }) + ', ' + time;
    }
}

async function loadMessages(channel) {
    const messagesDiv = document.getElementById('messages');
    const targetChannel = channel || currentChannel || 'болталка';
    
    try {
        const response = await fetch(`/api/messages?channel=${targetChannel}`);
        const messages = await response.json();
        
        messagesDiv.innerHTML = '';
        messages.forEach(msg => {
            displayMessage({
                username: msg.username,
                channel: msg.channel,
                type: msg.type,
                text: msg.text,
                fileUrl: msg.fileUrl,
                fileName: msg.fileName,
                createdAt: msg.createdAt,
                _id: msg._id
            });
        });
        
        console.log(`📚 Загружено ${messages.length} сообщений из канала ${targetChannel}`);
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}

// ✅ НОВОЕ: Подсветка @упоминаний
function highlightMentions(text) {
    return text.replace(/@(\w+)/g, (match, username) => {
        return `<span class="mention" onclick="openPrivateChat('${username}')">${match}</span>`;
    });
}

// ✅ НОВОЕ: Проверка, упомянули ли нас
function checkMention(text) {
    if (!text) return;
    const mentionPattern = new RegExp(`@${currentUser}\\b`, 'i');
    if (mentionPattern.test(text)) {
        playNotificationSound();
        showNotification(`Вас упомянули в сообщении`);
    }
}

// ✅ НОВОЕ: Звуковое уведомление
function playNotificationSound() {
    try {
        // Создаём короткий звуковой сигнал
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        console.log('Не удалось воспроизвести звук:', error);
    }
}

// ✅ НОВОЕ: Всплывающее уведомление
function showNotification(text) {
    const notification = document.createElement('div');
    notification.className = 'notification-popup';
    notification.textContent = text;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function displayMessage(data) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.id = `msg_${data._id || Date.now()}`;
    
    const time = data.createdAt ? formatDateTime(data.createdAt) : 'Только что';
    
    let contentHtml = '';
    
    if (data.type === 'text') {
        // ✅ ИСПРАВЛЕНО: добавлена подсветка упоминаний
        const highlightedText = highlightMentions(escapeHtml(data.text));
        contentHtml = `<div class="message-content">${highlightedText}</div>`;
        
        // ✅ НОВОЕ: Проверяем, упомянули ли нас
        if (data.text && data.username !== currentUser) {
            checkMention(data.text);
        }
    } else if (data.type === 'image') {
        contentHtml = `
            <div class="message-content">🖼️ ${escapeHtml(data.fileName)}</div>
            <img src="${data.fileUrl}" class="message-image" onclick="window.open('${data.fileUrl}', '_blank')">
        `;
    } else if (data.type === 'audio') {
        const safeFileName = escapeHtml(data.fileName).replace(/'/g, "\\'");
        contentHtml = `
            <div class="message-content">🎵 ${escapeHtml(data.fileName)}</div>
            <div class="audio-player">
                <audio src="${data.fileUrl}" controls data-filename="${escapeHtml(data.fileName)}"></audio>
                <div class="audio-controls">
                    <button onclick="broadcastAudioControl('${safeFileName}', 'play')">▶️ Играть для всех</button>
                    <button onclick="broadcastAudioControl('${safeFileName}', 'pause')">⏸️ Пауза для всех</button>
                </div>
            </div>
        `;
    }
    
    // Кнопка удаления (только для своих сообщений)
    const canDelete = data.username === currentUser && data._id;
    const deleteButton = canDelete ? `
        <div class="message-actions">
            <button class="message-delete-btn" onclick="deleteMessage('${data._id}')" title="Удалить сообщение">
                🗑️
            </button>
        </div>
    ` : '';
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <div class="message-username-group">
                <div class="username">${escapeHtml(data.username)}</div>
                <div class="message-time">${time}</div>
            </div>
            ${deleteButton}
        </div>
        ${contentHtml}
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displaySystemMessage(data) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message ' + (data.type || '');
    messageDiv.textContent = data.text;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const text = messageInput.value.trim();
    if (text && currentUser && socket) {
        socket.emit('message', { 
            username: currentUser, 
            text: text,
            channel: currentChannel || 'болталка'
        });
        messageInput.value = '';
    }
}

function broadcastAudioControl(fileName, action) {
    console.log(`🎮 Управление аудио: ${action} для ${fileName}`);
    
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
        const audioFileName = audio.getAttribute('data-filename');
        if (audioFileName && audioFileName === fileName) {
            if (action === 'play') {
                audio.play().catch(err => console.error('Ошибка воспроизведения:', err));
            } else if (action === 'pause') {
                audio.pause();
            }
        }
    });
    
    socket.emit('audio_control', {
        fileName: fileName,
        action: action,
        username: currentUser,
        timestamp: Date.now()
    });
}

function handleRemoteAudioControl(data) {
    if (data.username === currentUser) return;
    
    const audioElements = document.querySelectorAll('audio');
    audioElements.forEach(audio => {
        const fileName = audio.getAttribute('data-filename');
        if (fileName && fileName === data.fileName) {
            if (data.action === 'play') {
                audio.play().catch(err => console.error('Ошибка воспроизведения:', err));
            } else if (data.action === 'pause') {
                audio.pause();
            }
        }
    });
}

// ✅ ИСПРАВЛЕНО: добавлена кнопка "Написать ЛС"
function updateOnlineList(users) {
    const onlineList = document.getElementById('onlineList');
    const onlineCount = document.getElementById('onlineCount');
    
    onlineList.innerHTML = '';
    users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'online-user';
        
        // ✅ НОВОЕ: кнопка "Написать" для ЛС (не для себя)
        const writeButton = user !== currentUser ? `
            <button class="write-btn" onclick="openPrivateChat('${user}')" title="Написать ЛС">
                ✉️
            </button>
        ` : '';
        
        userDiv.innerHTML = `
            <div class="status-dot"></div>
            <span class="username-text">${user}</span>
            ${writeButton}
        `;
        onlineList.appendChild(userDiv);
    });
    onlineCount.textContent = `Онлайн: ${users.length}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Удаление сообщения
async function deleteMessage(messageId) {
    if (!confirm('Удалить сообщение?')) return;
    
    try {
        socket.emit('delete_message', {
            messageId: messageId,
            username: currentUser
        });
    } catch (error) {
        console.error('Ошибка удаления:', error);
        showToast('Ошибка при удалении сообщения');
    }
}

// Показ уведомления
function showToast(message) {
    let toast = document.getElementById('toastNotification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastNotification';
        toast.className = 'toast-notification';
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Обработка ошибки от сервера
function handleError(message) {
    console.error('❌', message);
    showToast(message);
}

// ========== ПРИВАТНЫЕ СООБЩЕНИЯ (ЛС) ==========

let currentPrivateChat = null; // С кем сейчас ведём ЛС

// ✅ НОВОЕ: Открытие окна ЛС
function openPrivateChat(username) {
    currentPrivateChat = username;
    
    // Показываем окно ЛС
    const privateChatWindow = document.getElementById('privateChatWindow');
    const privateChatHeader = document.getElementById('privateChatHeader');
    privateChatHeader.textContent = `🔒 ЛС с ${username}`;
    privateChatWindow.style.display = 'flex';
    
    // Загружаем историю
    socket.emit('load_private_messages', {
        user1: currentUser,
        user2: username
    });
}

// ✅ НОВОЕ: Закрытие окна ЛС
function closePrivateChat() {
    currentPrivateChat = null;
    document.getElementById('privateChatWindow').style.display = 'none';
}

// ✅ НОВОЕ: Отправка приватного сообщения
function sendPrivateMessage() {
    const input = document.getElementById('privateMessageInput');
    const text = input.value.trim();
    
    if (text && currentPrivateChat && socket) {
        socket.emit('private_message', {
            username: currentUser,
            recipient: currentPrivateChat,
            text: text
        });
        input.value = '';
    }
}

// ✅ НОВОЕ: Отображение приватного сообщения
function displayPrivateMessage(data) {
    const messagesDiv = document.getElementById('privateMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'private-message';
    
    const isOwn = data.username === currentUser;
    messageDiv.classList.add(isOwn ? 'own' : 'other');
    
    const time = data.createdAt ? formatDateTime(data.createdAt) : 'Только что';
    
    messageDiv.innerHTML = `
        <div class="private-message-header">
            <span class="private-message-username">${escapeHtml(data.username)}</span>
            <span class="private-message-time">${time}</span>
        </div>
        <div class="private-message-content">${highlightMentions(escapeHtml(data.text))}</div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}