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
            channel: currentChannel || 'болталка',  // ← ДОБАВЛЕНО
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
            channel: currentChannel || 'болталка',  // ← ДОБАВЛЕНО
            fileUrl: result.url,
            fileName: result.fileName
        });
    } else {
        alert('Ошибка загрузки: ' + result.error);
    }
    
    event.target.value = '';
}