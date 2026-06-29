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
const voiceRooms = new Map();

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

// Получение аватара пользователя
app.get('/api/user/avatar/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) {
      return res.status(404).json({ avatar: '' });
    }
    res.json({ avatar: user.avatar || '' });
  } catch (error) {
    console.error('❌ Ошибка получения аватара:', error);
    res.json({ avatar: '' });
  }
});

// Загрузка аватара
app.post('/api/user/avatar', async (req, res) => {
  try {
    const { username, avatarUrl } = req.body;
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    user.avatar = avatarUrl;
    await user.save();
    
    console.log(`✅ Аватар обновлён для ${username}`);
    res.json({ success: true, avatar: avatarUrl });
  } catch (error) {
    console.error('❌ Ошибка обновления аватара:', error);
    res.status(500).json({ error: 'Ошибка обновления аватара' });
  }
});

// Получение списка пользователей с аватарами
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username avatar');
    res.json(users);
  } catch (error) {
    console.error('❌ Ошибка получения пользователей:', error);
    res.status(500).json({ error: 'Ошибка получения пользователей' });
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

  // Индикатор "кто говорит"
  socket.on('voice_speaking', (data) => {
    const { roomId, isSpeaking } = data;
    
    // Рассылаем всем в комнате, кто сейчас говорит
    socket.broadcast.to(roomId).emit('voice_user_speaking', {
      socketId: socket.id,
      isSpeaking: isSpeaking
    });
  });

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
        text: data.text,
        reactions: {}  // ✅ Пустой объект реакций
      });
      await message.save();
      
      io.emit('message', {
        _id: message._id,
        username: data.username,
        channel: data.channel || 'болталка',
        type: 'text',
        text: data.text,
        reactions: {},  // ✅ Передаём пустые реакции
        createdAt: message.createdAt
      });
      
      // Проверяем @упоминания и уведомляем упомянутых
      const mentionRegex = /@(\w+)/g;
      let match;
      while ((match = mentionRegex.exec(data.text)) !== null) {
        const mentionedUsername = match[1];
        
        for (const [sid, uname] of onlineUsers.entries()) {
          if (uname === mentionedUsername && sid !== socket.id) {
            io.to(sid).emit('mention_notification', {
              from: data.username,
              text: data.text,
              channel: data.channel || 'болталка'
            });
          }
        }
      }
    } catch (error) {
      console.error('❌ Ошибка сохранения сообщения:', error);
    }
  });

  // ========== ПРИВАТНЫЕ СООБЩЕНИЯ (ЛС) ==========
  
  socket.on('private_message', async (data) => {
    console.log('🔒 ЛС от', data.username, 'к', data.recipient);
    
    try {
      const message = new Message({
        username: data.username,
        recipient: data.recipient,
        channel: 'private',
        type: 'text',
        text: data.text,
        isPrivate: true,
        reactions: {}
      });
      await message.save();
      
      const messageData = {
        _id: message._id,
        username: data.username,
        recipient: data.recipient,
        text: data.text,
        reactions: {},
        createdAt: message.createdAt
      };
      
      socket.emit('private_message', messageData);
      
      for (const [sid, uname] of onlineUsers.entries()) {
        if (uname === data.recipient) {
          io.to(sid).emit('private_message', messageData);
          io.to(sid).emit('private_notification', {
            from: data.username,
            text: data.text
          });
        }
      }
    } catch (error) {
      console.error('❌ Ошибка отправки ЛС:', error);
      socket.emit('error_message', 'Ошибка при отправке ЛС');
    }
  });

  socket.on('load_private_messages', async (data) => {
    try {
      const messages = await Message.find({
        channel: 'private',
        $or: [
          { username: data.user1, recipient: data.user2 },
          { username: data.user2, recipient: data.user1 }
        ]
      }).sort({ createdAt: -1 }).limit(50);
      
      socket.emit('private_messages_loaded', messages.reverse());
    } catch (error) {
      console.error('❌ Ошибка загрузки ЛС:', error);
      socket.emit('error_message', 'Ошибка при загрузке ЛС');
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

    // ========== РЕАКЦИИ НА СООБЩЕНИЯ ==========
  
  socket.on('toggle_reaction', async (data) => {
    const { messageId, emoji, username } = data;
    console.log(`👍 Реакция ${emoji} от ${username} на сообщение ${messageId}`);
    
    try {
      // Используем findOneAndUpdate для атомарного обновления
      const message = await Message.findById(messageId);
      
      if (!message) {
        socket.emit('error_message', 'Сообщение не найдено');
        return;
      }
      
      // Инициализируем reactions если его нет
      if (!message.reactions) {
        message.reactions = {};
      }
      
      // Если реакции на этот эмодзи ещё нет - создаём массив
      if (!message.reactions[emoji]) {
        message.reactions[emoji] = [];
      }
      
      // Проверяем, ставил ли уже этот пользователь реакцию
      const userIndex = message.reactions[emoji].indexOf(username);
      
      if (userIndex > -1) {
        // Убираем реакцию (toggle off)
        message.reactions[emoji].splice(userIndex, 1);
        
        // Если массив пустой - удаляем ключ
        if (message.reactions[emoji].length === 0) {
          delete message.reactions[emoji];
        }
        
        console.log(` ${username} убрал реакцию ${emoji}`);
      } else {
        // Добавляем реакцию (toggle on)
        message.reactions[emoji].push(username);
        console.log(`✅ ${username} поставил реакцию ${emoji}`);
      }
      
      // Сохраняем изменения
      await message.save();
      
      console.log(`💾 Сохранены реакции:`, message.reactions);
      
      // Отправляем обновление всем
      io.emit('reaction_update', {
        messageId: messageId,
        reactions: message.reactions,
        channel: message.channel
      });
    } catch (error) {
      console.error('❌ Ошибка обновления реакции:', error);
      socket.emit('error_message', 'Ошибка при добавлении реакции');
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
        channel: data.channel || 'болталка',
        type: 'image',
        fileUrl: fileUrl,
        fileName: data.fileName,
        reactions: {}  // ✅ Пустые реакции
      });
      await message.save();
      
      io.emit('message', {
        _id: message._id,
        username: data.username,
        channel: data.channel || 'болталка',
        type: 'image',
        fileUrl: fileUrl,
        fileName: data.fileName,
        reactions: {},  // ✅ Передаём пустые реакции
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
        channel: data.channel || 'болталка',
        type: 'audio',
        fileUrl: fileUrl,
        fileName: data.fileName,
        reactions: {}  // ✅ Пустые реакции
      });
      await message.save();
      
      io.emit('message', {
        _id: message._id,
        username: data.username,
        channel: data.channel || 'болталка',
        type: 'audio',
        fileUrl: fileUrl,
        fileName: data.fileName,
        reactions: {},  // ✅ Передаём пустые реакции
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
  
  socket.on('voice_join', (data) => {
    const { username, roomId } = data;
    console.log(`🎤 ${username} вошёл в голосовую комнату ${roomId}`);
    
    if (!voiceRooms.has(roomId)) {
      voiceRooms.set(roomId, new Map());
    }
    
    const room = voiceRooms.get(roomId);
    room.set(socket.id, { username, socketId: socket.id });
    
    socket.join(roomId);
    
    const participants = Array.from(room.values()).map(p => ({
      socketId: p.socketId,
      username: p.username
    }));
    
    socket.emit('voice_participants', participants);
    
    socket.broadcast.to(roomId).emit('voice_user_joined', {
      socketId: socket.id,
      username: username
    });
  });

  socket.on('voice_leave', (data) => {
    const { roomId } = data;
    const room = voiceRooms.get(roomId);
    
    if (room) {
      const user = room.get(socket.id);
      if (user) {
        console.log(`🔇 ${user.username} вышел из голосовой комнаты ${roomId}`);
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
    }
  });

  socket.on('voice_signal', (data) => {
    const { targetSocketId, signal, roomId } = data;
    io.to(targetSocketId).emit('voice_signal', {
      socketId: socket.id,
      signal: signal,
      roomId: roomId
    });
  });

  socket.on('voice_ice_candidate', (data) => {
    const { targetSocketId, candidate, roomId } = data;
    io.to(targetSocketId).emit('voice_ice_candidate', {
      socketId: socket.id,
      candidate: candidate,
      roomId: roomId
    });
  });

    // Индикатор "кто говорит"
  socket.on('voice_speaking', (data) => {
    const { roomId, isSpeaking } = data;
    
    socket.broadcast.to(roomId).emit('voice_user_speaking', {
      socketId: socket.id,
      isSpeaking: isSpeaking
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