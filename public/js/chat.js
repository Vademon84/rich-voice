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

async function loadMessages() {
    const messagesDiv = document.getElementById('messages');
    try {
        const response = await fetch('/api/messages');
        const messages = await response.json();
        
        messagesDiv.innerHTML = '';
        messages.forEach(msg => {
            displayMessage({
                username: msg.username,
                type: msg.type,
                text: msg.text,
                fileUrl: msg.fileUrl,
                fileName: msg.fileName,
                createdAt: msg.createdAt
            });
        });
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}

function displayMessage(data) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    
    const time = data.createdAt ? formatDateTime(data.createdAt) : 'Только что';
    
    let contentHtml = '';
    
    if (data.type === 'text') {
        contentHtml = `<div class="message-content">${escapeHtml(data.text)}</div>`;
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
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <div class="username">${escapeHtml(data.username)}</div>
            <div class="message-time">${time}</div>
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
        socket.emit('message', { username: currentUser, text: text });
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

function updateOnlineList(users) {
    const onlineList = document.getElementById('onlineList');
    const onlineCount = document.getElementById('onlineCount');
    
    onlineList.innerHTML = '';
    users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'online-user';
        userDiv.innerHTML = `
            <div class="status-dot"></div>
            <span>${user}</span>
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