// Главный файл приложения
let socket = null;

function showChat() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('chatContainer').style.display = 'flex';
    document.getElementById('currentUser').textContent = currentUser;
    
    socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        maxHttpBufferSize: 1e8
    });
    
    socket.emit('user_join', currentUser);
    
    // Обработчики Socket.IO
    // Показываем сообщение только если оно из текущего канала
    socket.on('message', (data) => {
        if (data.channel === currentChannel) {
            displayMessage(data);
        }
    });
    
    socket.on('message_deleted', (data) => {
        const messageEl = document.getElementById(`msg_${data.messageId}`);
        if (messageEl) {
            messageEl.remove();
        }
    });
    
     // ✅ НОВОЕ: Обновление реакций на сообщения
    socket.on('reaction_update', (data) => {
        console.log(`📥 Получено обновление реакций для ${data.messageId}:`, data.reactions);
        
        // Обновляем реакции только если сообщение в текущем канале
        if (data.channel === currentChannel) {
            if (typeof renderReactions === 'function') {
                renderReactions(data.messageId, data.reactions);
                console.log(`✅ Реакции отображены для ${data.messageId}`);
            }
        } else {
            console.log(`⏭️ Пропускаем обновление - сообщение не в текущем канале`);
        }
    });
    
    socket.on('system_message', (data) => displaySystemMessage(data));
    socket.on('online_users', (users) => updateOnlineList(users));
    socket.on('audio_control', (data) => handleRemoteAudioControl(data));
    
    // Обработка ошибок от сервера
    socket.on('error_message', (message) => {
        console.error('❌ Ошибка сервера:', message);
        if (typeof showToast === 'function') {
            showToast(message);
        }
    });
    
    // ========== ПРИВАТНЫЕ СООБЩЕНИЯ (ЛС) ==========
    
    // Получение приватного сообщения
    socket.on('private_message', (data) => {
        // Показываем ЛС только если открыт чат с этим пользователем
        if (currentPrivateChat && 
            ((data.username === currentUser && data.recipient === currentPrivateChat) ||
             (data.username === currentPrivateChat && data.recipient === currentUser))) {
            displayPrivateMessage(data);
        }
    });
    
    // Загрузка истории ЛС
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
    
    // Уведомление о новом ЛС
    socket.on('private_notification', (data) => {
        if (typeof playNotificationSound === 'function') {
            playNotificationSound();
        }
        if (typeof showNotification === 'function') {
            showNotification(`Новое ЛС от ${data.from}`);
        }
    });
    
    // Уведомление об упоминании
    socket.on('mention_notification', (data) => {
        if (data.from !== currentUser) {
            if (typeof playNotificationSound === 'function') {
                playNotificationSound();
            }
            if (typeof showNotification === 'function') {
                showNotification(`${data.from} упомянул вас в ${data.channel}`);
            }
        }
    });
    
    // Голосовая комната
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
        console.log('📡 Получен сигнал от:', data.socketId);
        await handleSignal(data.socketId, data.signal);
    });
    
    socket.on('voice_ice_candidate', (data) => {
        handleIceCandidate(data.socketId, data.candidate);
    });
}

// Инициализация при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('richvoice_user');
    if (savedUser) {
        currentUser = savedUser;
        showChat();
        
        // Инициализация каналов (после подключения сокета)
        if (typeof initChannels === 'function') {
            initChannels();
        }
    }
    
    initEmojiPanel();
    initPTT();
    
    // Обработчики Enter
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    document.getElementById('passwordInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAuth();
    });
});