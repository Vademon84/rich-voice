// Модуль управления каналами
let currentChannel = localStorage.getItem('richvoice_channel') || 'болталка';

const CHANNELS = [
    { id: 'болталка', name: 'Болталка', icon: '💬' },
    { id: 'музыка', name: 'Музыка', icon: '🎵' },
    { id: 'игры', name: 'Игры', icon: '🎮' },
    { id: 'питница', name: 'Питница', icon: '🍺' }
];

function initChannels() {
    renderChannelsList();
    loadChannelMessages(currentChannel);
}

function renderChannelsList() {
    const channelsList = document.getElementById('channelsList');
    if (!channelsList) return;
    
    channelsList.innerHTML = '';
    
    CHANNELS.forEach(channel => {
        const channelDiv = document.createElement('div');
        channelDiv.className = 'channel' + (channel.id === currentChannel ? ' active' : '');
        channelDiv.onclick = () => switchChannel(channel.id);
        channelDiv.innerHTML = `
            <span class="channel-icon">${channel.icon}</span>
            <span class="channel-name">${channel.name}</span>
        `;
        channelsList.appendChild(channelDiv);
    });
}

function switchChannel(channelId) {
    if (!CHANNELS.find(c => c.id === channelId)) {
        console.error('Неизвестный канал:', channelId);
        return;
    }
    
    console.log('📺 Переключение на канал:', channelId);
    currentChannel = channelId;
    localStorage.setItem('richvoice_channel', channelId);
    
    // Обновляем UI
    renderChannelsList();
    
    // Обновляем заголовок
    const channelHeader = document.getElementById('channelHeader');
    if (channelHeader) {
        const channel = CHANNELS.find(c => c.id === channelId);
        channelHeader.textContent = `${channel.icon} ${channel.name}`;
    }
    
    // Загружаем сообщения канала
    loadChannelMessages(channelId);
    
    // Уведомляем сервер о смене канала
    if (socket) {
        socket.emit('channel_switch', { 
            username: currentUser, 
            channel: channelId 
        });
    }
}

async function loadChannelMessages(channelId) {
    const messagesDiv = document.getElementById('messages');
    if (!messagesDiv) return;
    
    try {
        const response = await fetch(`/api/messages?channel=${channelId}`);
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
                reactions: msg.reactions || {}  // ✅ ДОБАВЛЕНО: передаём реакции
            });
        });
        
        console.log(`📚 Загружено ${messages.length} сообщений из канала ${channelId}`);
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}

function getCurrentChannel() {
    return currentChannel;
}