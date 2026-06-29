// Модуль эмодзи
function initEmojiPanel() {
    const emojiGrid = document.getElementById('emojiGrid');
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'emoji-btn';
        btn.textContent = emoji;
        btn.onclick = () => insertEmoji(emoji);
        emojiGrid.appendChild(btn);
    });
}

function toggleEmojiPanel() {
    document.getElementById('emojiPanel').classList.toggle('show');
}

function insertEmoji(emoji) {
    const messageInput = document.getElementById('messageInput');
    messageInput.value += emoji;
    messageInput.focus();
}