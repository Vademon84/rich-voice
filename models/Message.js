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
    type: String  // username получателя
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', messageSchema);