const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true
  },
  channel: {
    type: String,
    default: 'болталка',
    enum: ['болталка', 'музыка', 'игры', 'питница', 'private']
  },
  type: {
    type: String,
    enum: ['text', 'image', 'audio'],
    default: 'text'
  },
  text: {
    type: String
  },
  fileUrl: {
    type: String
  },
  fileName: {
    type: String
  },
  // Для приватных сообщений
  recipient: {
    type: String
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  // ✅ НОВОЕ: Реакции на сообщения
  reactions: {
    type: Object,
    default: {}
    // Формат: { "❤️": ["user1", "user2"], "😂": ["user3"], ... }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', messageSchema);