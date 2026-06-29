const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true
  },
  channel: {
    type: String,
    default: 'болталка',
    enum: ['болталка', 'музыка', 'игры', 'питница']
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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Message', messageSchema);