const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  // ✅ НОВОЕ: Аватар пользователя
  avatar: {
    type: String,
    default: '' // По умолчанию пустой (будем показывать дефолтный)
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('User', userSchema);