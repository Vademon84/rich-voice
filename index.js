// Подключаем библиотеки
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// Проверка подключения к MongoDB
console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Найдена' : 'НЕ найдена');
if (process.env.MONGODB_URI) {
  console.log('Начало строки:', process.env.MONGODB_URI.substring(0, 30) + '...');
}

// Создаем приложение Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Подключаем middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Подключаемся к MongoDB
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('✅ MongoDB подключен'))
.catch(err => console.error('❌ Ошибка MongoDB:', err));

// Простой маршрут для проверки
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');  // <-- Изменено
});

// Socket.io - обработка подключений
io.on('connection', (socket) => {
  console.log(' Пользователь подключился:', socket.id);

  // Когда пользователь отправляет сообщение
  socket.on('message', (data) => {
    console.log('📨 Сообщение:', data);
    // Рассылаем всем подключенным пользователям
    io.emit('message', data);
  });

  // Когда пользователь отключается
  socket.on('disconnect', () => {
    console.log(' Пользователь отключился:', socket.id);
  });
});

// Запускаем сервер
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});