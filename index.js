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

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

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
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB лимит
});

// Хранилище онлайн пользователей
const onlineUsers = new Map();

// Хранилище голосовых комнат
const voiceRooms = new Map(); // roomId -> Map of socketId -> {username, socketId}

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

// Получение истории сообщений по каналу
app.get('/api/messages', async (req, res) => {
  try {
    const channel = req.query.channel || 'болталка';
    const messages = await Message.find({ channel: channel })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(messages.reverse());
  } catch (error) {
    console.error('❌ Ошибка получения сообщений:', error);
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

  // Переключение канала
  socket.on('channel_switch', (data) => {
    console.log(`📺 ${data.username} переключился на канал ${data.channel}`);
  });

  // Текстовое сообщение с каналом
  socket.on('message', async (data) => {
    console.log('📨 Сообщение в канал', data.channel + ':', data);
    
    try {
      const message = new Message({
        username: data.username,
        channel: data.channel || 'болталка',
        type: 'text',
        text: data.text
      });
      await message.save();
      
      // ✅ ДОБАВЛЕНО: передаём _id для возможности удаления
      io.emit('message', {
        _id: message._id,
        username: data.username,
        channel: data.channel || 'болталка',
        type: 'text',
        text: data.text,
        createdAt: message.createdAt
      });
    } catch (error) {
      console.error('❌ Ошибка сохранения сообщения:', error);
    }
  });

  // Удаление сообщения
  socket.on('delete_message', async (data) => {
    console.log('🗑️ Удаление сообщения:', data.messageId, 'пользователем', data.username);
    
    try {
      const message = await Message.findById(data.messageId);
      
      if (!message) {
        socket.emit('error_message', 'Сообщение не найдено');
        return;
      }
      
      // Разрешаем удалять только свои сообщения
      if (message.username !== data.username) {
        socket.emit('error_message', 'Можно удалять только свои сообщения');
        return;
      }
      
      await Message.findByIdAndDelete(data.messageId);
      
      io.emit('message_deleted', {
        messageId: data.messageId,
        channel: message.channel
      });
    } catch (error) {
      console.error('❌ Ошибка удаления сообщения:', error);
      socket.emit('error_message', 'Ошибка при удалении');
    }
  });

  // Загрузка изображения
  socket.on('image_upload', async (data) => {
    console.log('🖼️ Загрузка изображения от:', data.username, 'в канал:', data.channel);
    
    try {
      let fileUrl = data.fileUrl;
      
      if (data.fileUrl.length > 3000000) {
        console.log('📤 Большое изображение, загружаю через Cloudinary...');
        
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload(data.fileUrl, {
            resource_type: 'auto',
            folder: 'rich-voice'
          }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          });
        });
        
        fileUrl = uploadResult.secure_url;
        console.log('✅ Cloudinary URL:', fileUrl);
      }
      
      const message = new Message({
        username: data.username,
        channel: data.channel || 'болталка',  // ✅ ДОБАВЛЕНО
        type: 'image',
        fileUrl: fileUrl,
        fileName: data.fileName
      });
      await message.save();
      
      // ✅ ДОБАВЛЕНО: передаём _id и channel
      io.emit('message', {
        _id: message._id,
        username: data.username,
        channel: data.channel || 'болталка',
        type: 'image',
        fileUrl: fileUrl,
        fileName: data.fileName,
        createdAt: message.createdAt
      });
    } catch (error) {
      console.error('❌ Ошибка загрузки изображения:', error);
    }
  });

  // Загрузка аудио
  socket.on('audio_upload', async (data) => {
    console.log('🎵 Загрузка аудио от:', data.username, 'в канал:', data.channel);
    
    try {
      let fileUrl = data.fileUrl;
      
      if (data.fileUrl.length > 3000000) {
        console.log('📤 Большой файл, загружаю через Cloudinary...');
        
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload(data.fileUrl, {
            resource_type: 'auto',
            folder: 'rich-voice'
          }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          });
        });
        
        fileUrl = uploadResult.secure_url;
        console.log('✅ Cloudinary URL:', fileUrl);
      }
      
      const message = new Message({
        username: data.username,
        channel: data.channel || 'болталка',  // ✅ ДОБАВЛЕНО
        type: 'audio',
        fileUrl: fileUrl,
        fileName: data.fileName
      });
      await message.save();
      
      // ✅ ДОБАВЛЕНО: передаём _id и channel
      io.emit('message', {
        _id: message._id,
        username: data.username,
        channel: data.channel || 'болталка',
        type: 'audio',
        fileUrl: fileUrl,
        fileName: data.fileName,
        createdAt: message.createdAt
      });
    } catch (error) {
      console.error('❌ Ошибка загрузки аудио:', error);
    }
  });

  // Управление воспроизведением аудио
  socket.on('audio_control', (data) => {
    console.log('🎮 Управление аудио:', data);
    socket.broadcast.emit('audio_control', data);
  });

  // ========== ГОЛОСОВАЯ КОМНАТА ==========
  
  // Пользователь вошёл в голосовую комнату
  socket.on('voice_join', (data) => {
    const { username, roomId } = data;
    console.log(`🎤 ${username} вошёл в голосовую комнату ${roomId}`);
    
    if (!voiceRooms.has(roomId)) {
      voiceRooms.set(roomId, new Map());
    }
    
    const room = voiceRooms.get(roomId);
    room.set(socket.id, { username, socketId: socket.id });
    
    // Присоединяем к комнате Socket.IO
    socket.join(roomId);
    
    // Отправляем новому пользователю список всех участников
    const participants = Array.from(room.values()).map(p => ({
      socketId: p.socketId,
      username: p.username
    }));
    
    socket.emit('voice_participants', participants);
    
    // Отправляем всем остальным, что новый пользователь вошёл
    socket.broadcast.to(roomId).emit('voice_user_joined', {
      socketId: socket.id,
      username: username
    });
  });

  // Пользователь вышел из голосовой комнаты
  socket.on('voice_leave', (data) => {
    const { roomId } = data;
    const room = voiceRooms.get(roomId);
    
    if (room) {
      const user = room.get(socket.id);
      if (user) {
        console.log(`🔇 ${user.username} вышел из голосовой комнаты ${roomId}`);
        room.delete(socket.id);
        
        // Уведомляем остальных
        socket.broadcast.to(roomId).emit('voice_user_left', {
          socketId: socket.id,
          username: user.username
        });
        
        // Обновляем список участников
        const participants = Array.from(room.values()).map(p => ({
          socketId: p.socketId,
          username: p.username
        }));
        
        io.to(roomId).emit('voice_participants', participants);
      }
    }
  });

  // Обмен WebRTC сигналами (SDP offers/answers)
  socket.on('voice_signal', (data) => {
    const { targetSocketId, signal, roomId } = data;
    
    // Пересылаем сигнал конкретному пользователю
    io.to(targetSocketId).emit('voice_signal', {
      socketId: socket.id,
      signal: signal,
      roomId: roomId
    });
  });

  // ICE candidate
  socket.on('voice_ice_candidate', (data) => {
    const { targetSocketId, candidate, roomId } = data;
    
    io.to(targetSocketId).emit('voice_ice_candidate', {
      socketId: socket.id,
      candidate: candidate,
      roomId: roomId
    });
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
    
    // Удаляем из всех голосовых комнат
    voiceRooms.forEach((room, roomId) => {
      if (room.has(socket.id)) {
        const user = room.get(socket.id);
        room.delete(socket.id);
        
        socket.broadcast.to(roomId).emit('voice_user_left', {
          socketId: socket.id,
          username: user.username
        });
        
        const participants = Array.from(room.values()).map(p => ({
          socketId: p.socketId,
          username: p.username
        }));
        
        io.to(roomId).emit('voice_participants', participants);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});