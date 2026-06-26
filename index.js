const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Настройка multer для загрузки файлов
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB лимит
});

// Хранилище онлайн пользователей
const onlineUsers = new Map();

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Регистрация
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Введите имя пользователя и пароль' });
    }
    
    if (password.length < 4) {
      return res.status(400).json({ error: 'Пароль должен быть минимум 4 символа' });
    }
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    
    console.log(`✅ Пользователь зарегистрирован: ${username}`);
    res.json({ success: true, username });
  } catch (error) {
    console.error('❌ Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка регистрации' });
  }
});

// Вход
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Неверный пароль' });
    }
    
    console.log(`✅ Пользователь вошёл: ${username}`);
    res.json({ success: true, username });
  } catch (error) {
    console.error('❌ Ошибка входа:', error);
    res.status(500).json({ error: 'Ошибка входа' });
  }
});

// Получение истории сообщений
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 }).limit(50);
    res.json(messages.reverse());
  } catch (error) {
    console.error(' Ошибка получения сообщений:', error);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
});

// Получение списка онлайн пользователей
app.get('/api/online', (req, res) => {
  res.json(Array.from(onlineUsers.values()));
});

// Подключаемся к MongoDB
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB подключен'))
    .catch(err => console.error('❌ Ошибка MongoDB:', err));
} else {
  console.log('⚠️ MONGODB_URI не найден, работаем без базы данных');
}

// Socket.IO
io.on('connection', (socket) => {
  console.log('👤 Новое соединение:', socket.id);

  socket.on('user_join', (username) => {
    console.log(`🟢 ${username} подключился`);
    onlineUsers.set(socket.id, username);
    io.emit('online_users', Array.from(onlineUsers.values()));
    socket.broadcast.emit('system_message', {
      text: `${username} присоединился к чату`,
      type: 'join'
    });
  });

  // Текстовое сообщение
  socket.on('message', async (data) => {
    console.log('📨 Сообщение:', data);
    
    try {
      const message = new Message({
        username: data.username,
        type: 'text',
        text: data.text
      });
      await message.save();
      
      io.emit('message', {
        username: data.username,
        type: 'text',
        text: data.text,
        createdAt: message.createdAt
      });
    } catch (error) {
      console.error('❌ Ошибка сохранения сообщения:', error);
    }
  });

  // Загрузка изображения
  socket.on('image_upload', async (data) => {
    console.log('🖼️ Загрузка изображения от:', data.username);
    
    try {
      const message = new Message({
        username: data.username,
        type: 'image',
        fileUrl: data.fileUrl,
        fileName: data.fileName
      });
      await message.save();
      
      io.emit('message', {
        username: data.username,
        type: 'image',
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        createdAt: message.createdAt
      });
    } catch (error) {
      console.error('❌ Ошибка сохранения изображения:', error);
    }
  });

  // Загрузка аудио
  socket.on('audio_upload', async (data) => {
    console.log('🎵 Загрузка аудио от:', data.username);
    
    try {
      const message = new Message({
        username: data.username,
        type: 'audio',
        fileUrl: data.fileUrl,
        fileName: data.fileName
      });
      await message.save();
      
      io.emit('message', {
        username: data.username,
        type: 'audio',
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        createdAt: message.createdAt
      });
    } catch (error) {
      console.error('❌ Ошибка сохранения аудио:', error);
    }
  });

  // Управление воспроизведением аудио
  socket.on('audio_control', (data) => {
    console.log('🎮 Управление аудио:', data);
    socket.broadcast.emit('audio_control', data);
  });

  socket.on('disconnect', () => {
    const username = onlineUsers.get(socket.id);
    if (username) {
      console.log(`🔴 ${username} отключился`);
      onlineUsers.delete(socket.id);
      io.emit('online_users', Array.from(onlineUsers.values()));
      socket.broadcast.emit('system_message', {
        text: `${username} покинул чат`,
        type: 'leave'
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(` Сервер запущен на порту ${PORT}`);
});