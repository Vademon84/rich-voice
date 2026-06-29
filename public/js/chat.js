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

async function getUserAvatar(username) {
    const cached = localStorage.getItem(`avatar_${username}`);
    if (cached) {
        return cached;
    }
    
    try {
        const response = await fetch(`/api/user/avatar/${username}`);
        const data = await response.json();
        
        if (data.avatar) {
            localStorage.setItem(`avatar_${username}`, data.avatar);
            return data.avatar;
        }
        
        return '';
    } catch (error) {
        console.error('Ошибка получения аватара:', error);
        return '';
    }
}

function createAvatarHTML(username, avatarUrl, size = 'small') {
    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random&color=fff&size=128`;
    const src = avatarUrl || defaultAvatar;
    return `<img src="${src}" alt="${username}" class="avatar avatar-${size}" title="${username}">`;
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
                _id: msg._id,
                reactions: msg.reactions || {}
            });
        });
        
        console.log(`📚 Загружено ${messages.length} сообщений из канала ${targetChannel}`);
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}

function highlightMentions(text) {
    return text.replace(/@(\w+)/g, (match, username) => {
        return `<span class="mention" onclick="openPrivateChat('${username}')">${match}</span>`;
    });
}

function checkMention(text) {
    if (!text) return;
    const mentionPattern = new RegExp(`@${currentUser}\\b`, 'i');
    if (mentionPattern.test(text)) {
        playNotificationSound();
        showNotification(`Вас упомянули в сообщении`);
    }
}

function playNotificationSound() {
    try {
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

const REACTION_EMOJIS = ['❤️', '😂', '', '😮', '😢', '🎉'];

function renderReactions(messageId, reactions) {
    const reactionsDiv = document.getElementById(`reactions_${messageId}`);
    if (!reactionsDiv) return;
    
    reactionsDiv.innerHTML = '';
    
    if (!reactions || Object.keys(reactions).length === 0) return;
    
    for (const [emoji, users] of Object.entries(reactions)) {
        if (users.length === 0) continue;
        
        const reactionBtn = document.createElement('button');
        reactionBtn.className = 'reaction-btn';
        
        if (users.includes(currentUser)) {
            reactionBtn.classList.add('active');
        }
        
        reactionBtn.innerHTML = `${emoji} <span class="reaction-count">${users.length}</span>`;
        reactionBtn.title = users.join(', ');
        reactionBtn.onclick = () => toggleReaction(messageId, emoji);
        
        reactionsDiv.appendChild(reactionBtn);
    }
}

function showReactionPicker(messageId) {
    const existingPicker = document.querySelector('.reaction-picker');
    if (existingPicker) {
        existingPicker.remove();
        return;
    }
    
    const messageDiv = document.getElementById(`msg_${messageId}`);
    if (!messageDiv) return;
    
    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    
    REACTION_EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'reaction-picker-btn';
        btn.textContent = emoji;
        btn.onclick = (e) => {
            e.stopPropagation();
            toggleReaction(messageId, emoji);
        };
        picker.appendChild(btn);
    });
    
    messageDiv.appendChild(picker);
    
    setTimeout(() => {
        document.addEventListener('click', function closePicker(e) {
            if (!picker.contains(e.target)) {
                picker.remove();
                document.removeEventListener('click', closePicker);
            }
        });
    }, 100);
}

let lastReactionTime = 0;

function toggleReaction(messageId, emoji) {
    if (!socket) return;
    
    const now = Date.now();
    if (now - lastReactionTime < 300) return;
    lastReactionTime = now;
    
    socket.emit('toggle_reaction', {
        messageId: messageId,
        emoji: emoji,
        username: currentUser
    });
}

async function displayMessage(data) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.id = `msg_${data._id || Date.now()}`;
    
    const time = data.createdAt ? formatDateTime(data.createdAt) : 'Только что';
    
    let avatarHTML = '';
    if (data.username) {
        const avatarUrl = await getUserAvatar(data.username);
        avatarHTML = createAvatarHTML(data.username, avatarUrl, 'small');
    }
    
    let contentHtml = '';
    
    if (data.type === 'text') {
        const highlightedText = highlightMentions(escapeHtml(data.text));
        contentHtml = `<div class="message-content">${highlightedText}</div>`;
        
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
    
    const canDelete = data.username === currentUser && data._id;
    const deleteButton = canDelete ? `
        <div class="message-actions">
            <button class="message-delete-btn" onclick="deleteMessage('${data._id}')" title="Удалить сообщение">
                🗑️
            </button>
        </div>
    ` : '';
    
    const reactionButton = data._id ? `
        <button class="add-reaction-btn" onclick="showReactionPicker('${data._id}')" title="Добавить реакцию">
            😊
        </button>
    ` : '';
    
    const reactionsBlock = data._id ? `
        <div class="reactions-container" id="reactions_${data._id}"></div>
    ` : '';
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <div class="message-user-info">
                ${avatarHTML}
                <div class="message-username-group">
                    <div class="username">${escapeHtml(data.username)}</div>
                    <div class="message-time">${time}</div>
                </div>
            </div>
            <div class="message-header-actions">
                ${reactionButton}
                ${deleteButton}
            </div>
        </div>
        ${contentHtml}
        ${reactionsBlock}
    `;
    
    messagesDiv.appendChild(messageDiv);
    
    if (data._id && data.reactions) {
        renderReactions(data._id, data.reactions);
    }
    
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

async function updateOnlineList(users) {
    const onlineList = document.getElementById('onlineList');
    const onlineCount = document.getElementById('onlineCount');
    
    onlineList.innerHTML = '';
    
    for (const user of users) {
        const userDiv = document.createElement('div');
        userDiv.className = 'online-user';
        
        const avatarUrl = await getUserAvatar(user);
        const avatarHTML = createAvatarHTML(user, avatarUrl, 'tiny');
        
        const writeButton = user !== currentUser ? `
            <button class="write-btn" onclick="openPrivateChat('${user}')" title="Написать ЛС">
                ✉️
            </button>
        ` : '';
        
        userDiv.innerHTML = `
            ${avatarHTML}
            <span class="username-text">${user}</span>
            ${writeButton}
        `;
        onlineList.appendChild(userDiv);
    }
    
    onlineCount.textContent = `Онлайн: ${users.length}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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

function handleError(message) {
    console.error('❌', message);
    showToast(message);
}

let currentPrivateChat = null;

function openPrivateChat(username) {
    currentPrivateChat = username;
    
    const privateChatWindow = document.getElementById('privateChatWindow');
    const privateChatHeader = document.getElementById('privateChatHeader');
    privateChatHeader.textContent = `🔒 ЛС с ${username}`;
    privateChatWindow.style.display = 'flex';
    
    socket.emit('load_private_messages', {
        user1: currentUser,
        user2: username
    });
}

function closePrivateChat() {
    currentPrivateChat = null;
    document.getElementById('privateChatWindow').style.display = 'none';
}

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