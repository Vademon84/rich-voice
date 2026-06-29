// Главный файл приложения
let socket = null;
let currentChannel = 'general';
let currentPrivateChat = null;

// Конфигурация (подставьте свой backend URL)
const CONFIG = {
    ROOM_ID: 'main-voice-room',
    ICE_SERVERS: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

function showChat() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('chatContainer').style.display = 'flex';

    if (typeof loadUserAvatar === 'function' && typeof updateCurrentUserAvatar === 'function') {
        loadUserAvatar(currentUser).then(avatarUrl => {
            updateCurrentUserAvatar(avatarUrl);
        });
    } else {
        document.getElementById('currentUser').textContent = currentUser;
    }

    socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        maxHttpBufferSize: 1e8
    });

    socket.emit('user_join', currentUser);

    socket.on('message', (data) => {
        if (data.channel === currentChannel) {
            displayMessage(data);
        }
    });

    socket.on('message_deleted', (data) => {
        const messageEl = document.getElementById(`msg_${data.messageId}`);
        if (messageEl) messageEl.remove();
    });

    socket.on('reaction_update', (data) => {
        console.log(`📥 Получено обновление реакций для ${data.messageId}:`, data.reactions);
        if (data.channel === currentChannel) {
            if (typeof renderReactions === 'function') {
                renderReactions(data.messageId, data.reactions);
            }
        }
    });

    socket.on('system_message', (data) => displaySystemMessage(data));
    socket.on('online_users', (users) => updateOnlineList(users));
    socket.on('audio_control', (data) => handleRemoteAudioControl(data));

    socket.on('error_message', (message) => {
        console.error('Ошибка сервера:', message);
        if (typeof showToast === 'function') showToast(message);
    });

    socket.on('private_message', (data) => {
        if (currentPrivateChat &&
            ((data.username === currentUser && data.recipient === currentPrivateChat) ||
             (data.username === currentPrivateChat && data.recipient === currentUser))) {
            displayPrivateMessage(data);
        }
    });

    socket.on('private_messages_loaded', (messages) => {
        const messagesDiv = document.getElementById('privateMessages');
        if (messagesDiv) {
            messagesDiv.innerHTML = '';
            messages.forEach(msg => {
                displayPrivateMessage({
                    _id: msg._id,
                    username: msg.username,
                    recipient: msg.recipient,
                    text: msg.text,
                    createdAt: msg.createdAt
                });
            });
        }
    });

    socket.on('private_notification', (data) => {
        if (typeof playNotificationSound === 'function') playNotificationSound();
        if (typeof showNotification === 'function') {
            showNotification(`Новое ЛС от ${data.from}`);
        }
    });

    socket.on('mention_notification', (data) => {
        if (data.from !== currentUser) {
            if (typeof playNotificationSound === 'function') playNotificationSound();
            if (typeof showNotification === 'function') {
                showNotification(`${data.from} упомянул вас в ${data.channel}`);
            }
        }
    });

    socket.on('voice_participants', async (participants) => {
        console.log('📋 Участники комнаты:', participants);
        updateVoiceParticipants(participants);
        for (const p of participants) {
            if (p.socketId !== socket.id) {
                console.log('🔗 Создаю соединение с:', p.username);
                await createPeerConnection(p.socketId, p.username, true);
            }
        }
    });

    socket.on('voice_user_joined', async (data) => {
        console.log('🎤 Новый участник в комнате:', data.username);
        await createPeerConnection(data.socketId, data.username, false);
    });

    socket.on('voice_user_left', (data) => {
        console.log('🔇 Участник вышел:', data.username);
        closePeerConnection(data.socketId);
    });

    socket.on('voice_signal', async (data) => {
        console.log('Получен сигнал от:', data.socketId);
        await handleSignal(data.socketId, data.signal);
    });

    socket.on('voice_ice_candidate', (data) => {
        handleIceCandidate(data.socketId, data.candidate);
    });

    socket.on('voice_user_speaking', (data) => {
        if (typeof handleUserSpeaking === 'function') handleUserSpeaking(data);
    });
}

// ========== Вспомогательные функции ==========
function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !socket) return;
    socket.emit('message', {
        username: currentUser,
        text: text,
        channel: currentChannel
    });
    input.value = '';
}

function displayMessage(data) {
    const messages = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'message';
    div.id = `msg_${data._id || Date.now()}`;
    div.innerHTML = `
        <div class="message-header">
            <span class="username">${escapeHtml(data.username)}</span>
            <span class="message-time">${new Date(data.createdAt || Date.now()).toLocaleTimeString()}</span>
        </div>
        <div class="message-content">${escapeHtml(data.text)}</div>
    `;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

function displaySystemMessage(data) {
    const messages = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = 'system-message ' + (data.type || '');
    div.textContent = data.text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

function updateOnlineList(users) {
    const list = document.getElementById('onlineList');
    const count = document.getElementById('onlineCount');
    list.innerHTML = '';
    users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'online-user';
        div.innerHTML = `
            <div class="status-dot"></div>
            <span class="username-text">${escapeHtml(u)}</span>
            <button class="write-btn" onclick="openPrivateChat('${u}')">✉️</button>
        `;
        list.appendChild(div);
    });
    count.textContent = `Онлайн: ${users.length}`;
}

function openPrivateChat(username) {
    currentPrivateChat = username;
    document.getElementById('privateChatUser').textContent = username;
    document.getElementById('privateChatWindow').style.display = 'flex';
    if (socket) socket.emit('load_private_messages', { username: currentUser, recipient: username });
}

function closePrivateChat() {
    currentPrivateChat = null;
    document.getElementById('privateChatWindow').style.display = 'none';
}

function sendPrivateMessage() {
    const input = document.getElementById('privateMessageInput');
    const text = input.value.trim();
    if (!text || !currentPrivateChat || !socket) return;
    socket.emit('private_message', {
        username: currentUser,
        recipient: currentPrivateChat,
        text: text
    });
    input.value = '';
}

function displayPrivateMessage(data) {
    const messages = document.getElementById('privateMessages');
    const div = document.createElement('div');
    div.className = 'private-message ' + (data.username === currentUser ? 'own' : 'other');
    div.innerHTML = `
        <div class="private-message-header">
            <span class="private-message-username">${escapeHtml(data.username)}</span>
            <span class="private-message-time">${new Date(data.createdAt || Date.now()).toLocaleTimeString()}</span>
        </div>
        <div class="private-message-content">${escapeHtml(data.text)}</div>
    `;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function showNotification(message) {
    const popup = document.getElementById('notificationPopup');
    popup.textContent = message;
    popup.classList.add('show');
    setTimeout(() => popup.classList.remove('show'), 3000);
}

function playNotificationSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) {}
}

function initEmojiPanel() {
    const emojis = ['😀','😂','😍','😎','😢','😡','👍','👎','❤️','🔥','🎉','🎤','🎵','🚀','💯','✅','❌','⭐'];
    const grid = document.getElementById('emojiGrid');
    emojis.forEach(e => {
        const btn = document.createElement('button');
        btn.className = 'emoji-btn';
        btn.textContent = e;
        btn.onclick = () => {
            document.getElementById('messageInput').value += e;
        };
        grid.appendChild(btn);
    });
}

function toggleEmojiPanel() {
    document.getElementById('emojiPanel').classList.toggle('show');
}

function initChannels() {
    const list = document.getElementById('channelsList');
    list.innerHTML = '';
    ['general', 'random', 'music'].forEach(name => {
        const div = document.createElement('div');
        div.className = 'channel' + (name === currentChannel ? ' active' : '');
        div.innerHTML = `<span class="channel-icon">💬</span><span class="channel-name">${name}</span>`;
        div.onclick = () => {
            currentChannel = name;
            document.getElementById('channelTitle').textContent = '💬 ' + name;
            document.querySelectorAll('.channel').forEach(c => c.classList.remove('active'));
            div.classList.add('active');
        };
        list.appendChild(div);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Заглушки для функций, которые могут вызываться
function handleFileUpload(e) { console.log('file', e.target.files[0]); }
function handleAudioUpload(e) { console.log('audio', e.target.files[0]); }
function handleRemoteAudioControl(data) { console.log('audio control', data); }
function renderReactions(id, reactions) { console.log('reactions', id, reactions); }

window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('richvoice_user');
    if (savedUser) {
        currentUser = savedUser;
        showChat();
        if (typeof initChannels === 'function') initChannels();
    }

    initEmojiPanel();
    initPTT();

    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    document.getElementById('passwordInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAuth();
    });
    document.getElementById('privateMessageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendPrivateMessage();
    });
});