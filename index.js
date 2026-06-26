const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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
    const messages = await Message.find().sort({ createdAt: 1 }).limit(50);
    res.json(messages);
  } catch (error) {
    console.error('❌ Ошибка получения сообщений:', error);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
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
  console.log('👤 Пользователь подключился:', socket.id);

  socket.on('message', async (data) => {
    console.log('📨 Сообщение:', data);
    
    // Сохраняем сообщение в базу
    try {
      const message = new Message({
        username: data.username,
        text: data.text
      });
      await message.save();
    } catch (error) {
      console.error('❌ Ошибка сохранения сообщения:', error);
    }
    
    // Рассылаем всем
    io.emit('message', data);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Пользователь отключился:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});