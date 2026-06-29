// Модуль загрузки файлов
async function uploadToCloudinary(file, resourceType) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CONFIG.CLOUDINARY.uploadPreset);
    formData.append('cloud_name', CONFIG.CLOUDINARY.cloudName);
    
    try {
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CONFIG.CLOUDINARY.cloudName}/${resourceType}/upload`,
            { method: 'POST', body: formData }
        );
        
        const data = await response.json();
        
        if (data.secure_url) {
            return {
                success: true,
                url: data.secure_url,
                fileName: data.original_filename + '.' + data.format
            };
        } else {
            throw new Error(data.error?.message || 'Ошибка загрузки');
        }
    } catch (error) {
        console.error('Ошибка загрузки на Cloudinary:', error);
        return { success: false, error: error.message };
    }
}

async function handleAudioUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('🎵 Загрузка аудио:', file.name, (file.size / 1024 / 1024).toFixed(2), 'MB');
    
    const result = await uploadToCloudinary(file, 'video');
    
    if (result.success) {
        console.log('✅ Аудио загружено:', result.url);
        socket.emit('audio_upload', {
            username: currentUser,
            channel: currentChannel || 'болталка',
            fileUrl: result.url,
            fileName: result.fileName
        });
    } else {
        alert('Ошибка загрузки: ' + result.error);
    }
    
    event.target.value = '';
}

async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    console.log('🖼️ Загрузка изображения:', file.name, (file.size / 1024 / 1024).toFixed(2), 'MB');
    
    const result = await uploadToCloudinary(file, 'image');
    
    if (result.success) {
        console.log('✅ Изображение загружено:', result.url);
        socket.emit('image_upload', {
            username: currentUser,
            channel: currentChannel || 'болталка',
            fileUrl: result.url,
            fileName: result.fileName
        });
    } else {
        alert('Ошибка загрузки: ' + result.error);
    }
    
    event.target.value = '';
}

// ✅ НОВОЕ: Загрузка аватара
async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Проверяем размер (макс 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Файл слишком большой. Максимальный размер: 5MB');
        return;
    }
    
    // Проверяем тип файла
    if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите изображение');
        return;
    }
    
    console.log('🖼️ Загрузка аватара:', file.name, (file.size / 1024 / 1024).toFixed(2), 'MB');
    
    const result = await uploadToCloudinary(file, 'image');
    
    if (result.success) {
        console.log('✅ Аватар загружен:', result.url);
        
        // Обновляем аватар в базе данных
        const success = await updateUserAvatar(result.url);
        
        if (success) {
            showNotification('Аватар успешно обновлён!');
            // Закрываем модальное окно
            const modal = document.getElementById('avatarModal');
            if (modal) {
                modal.classList.remove('show');
            }
        } else {
            alert('Ошибка при сохранении аватара');
        }
    } else {
        alert('Ошибка загрузки: ' + result.error);
    }
    
    event.target.value = '';
}

// ✅ НОВОЕ: Открытие модального окна смены аватара
function openAvatarModal() {
    const modal = document.getElementById('avatarModal');
    if (modal) {
        modal.classList.add('show');
    }
}

// ✅ НОВОЕ: Закрытие модального окна смены аватара
function closeAvatarModal() {
    const modal = document.getElementById('avatarModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// ✅ НОВОЕ: Удаление аватара
async function removeAvatar() {
    if (!confirm('Удалить аватар?')) return;
    
    const success = await updateUserAvatar('');
    
    if (success) {
        showNotification('Аватар удалён');
        closeAvatarModal();
    } else {
        alert('Ошибка при удалении аватара');
    }
}