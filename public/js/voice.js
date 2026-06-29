// Модуль голосовой комнаты с PTT (Push-to-Talk)
let localStream = null;
let peerConnections = new Map();
let isInVoiceRoom = false;
let isMuted = false;
let isPTTActive = false; // Нажата ли клавиша PTT
let pttKey = localStorage.getItem('richvoice_ptt_key') || 'Space'; // По умолчанию пробел
let pttEnabled = localStorage.getItem('richvoice_ptt_enabled') === 'true';

// Инициализация PTT
function initPTT() {
    updatePTTButton();
    
    // Глобальные обработчики клавиш
    document.addEventListener('keydown', handlePTTKeyDown);
    document.addEventListener('keyup', handlePTTKeyUp);
}

function handlePTTKeyDown(e) {
    if (!isInVoiceRoom || !pttEnabled || !localStream) return;
    
    // Игнорируем, если фокус в поле ввода
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    const pressedKey = e.code === 'Space' ? 'Space' : e.key;
    
    if (pressedKey === pttKey && !isPTTActive) {
        e.preventDefault();
        isPTTActive = true;
        
        // Включаем микрофон
        localStream.getAudioTracks().forEach(track => {
            track.enabled = true;
        });
        
        updatePTTVisual(true);
        console.log('🎤 PTT: микрофон включён');
    }
}

function handlePTTKeyUp(e) {
    if (!isInVoiceRoom || !pttEnabled || !localStream) return;
    
    const releasedKey = e.code === 'Space' ? 'Space' : e.key;
    
    if (releasedKey === pttKey && isPTTActive) {
        e.preventDefault();
        isPTTActive = false;
        
        // Выключаем микрофон (если не в режиме обычного mute)
        if (!isMuted) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = false;
            });
        }
        
        updatePTTVisual(false);
        console.log('🔇 PTT: микрофон выключен');
    }
}

function updatePTTVisual(active) {
    const muteBtn = document.getElementById('muteBtn');
    if (active) {
        muteBtn.style.background = '#00d26a';
        muteBtn.textContent = '🎤 Говорю...';
        muteBtn.style.boxShadow = '0 0 15px rgba(0, 210, 106, 0.8)';
    } else {
        if (isMuted) {
            muteBtn.style.background = '#ed4245';
            muteBtn.textContent = '🔇 Выкл';
        } else {
            muteBtn.style.background = '#faa61a';
            muteBtn.textContent = '🎤 Вкл';
        }
        muteBtn.style.boxShadow = 'none';
    }
}

function updatePTTButton() {
    const pttToggleBtn = document.getElementById('pttToggleBtn');
    const pttKeyBtn = document.getElementById('pttKeyBtn');
    
    if (pttToggleBtn) {
        pttToggleBtn.textContent = pttEnabled ? '🎤 PTT: ВКЛ' : '🔕 PTT: ВЫКЛ';
        pttToggleBtn.style.background = pttEnabled ? '#00d26a' : '#40444b';
    }
    
    if (pttKeyBtn) {
        const displayName = pttKey === 'Space' ? 'Пробел' : pttKey;
        pttKeyBtn.textContent = `Клавиша: ${displayName}`;
    }
}

function togglePTT() {
    pttEnabled = !pttEnabled;
    localStorage.setItem('richvoice_ptt_enabled', pttEnabled);
    updatePTTButton();
    
    if (pttEnabled && isInVoiceRoom && localStream) {
        // При включении PTT сразу выключаем микрофон
        localStream.getAudioTracks().forEach(track => {
            track.enabled = false;
        });
        console.log('🎤 PTT включён - микрофон выключен до нажатия клавиши');
    }
}

function setPTTKey() {
    const pttKeyBtn = document.getElementById('pttKeyBtn');
    const originalText = pttKeyBtn.textContent;
    pttKeyBtn.textContent = '⏳ Нажмите клавишу...';
    pttKeyBtn.style.background = '#5865f2';
    
    const handler = (e) => {
        e.preventDefault();
        
        // Сохраняем клавишу
        pttKey = e.code === 'Space' ? 'Space' : e.key;
        localStorage.setItem('richvoice_ptt_key', pttKey);
        
        // Возвращаем кнопку
        pttKeyBtn.style.background = '#40444b';
        updatePTTButton();
        
        document.removeEventListener('keydown', handler);
        console.log('🎤 PTT клавиша установлена:', pttKey);
    };
    
    document.addEventListener('keydown', handler);
}

// Голосовая комната
async function toggleVoiceRoom() {
    if (isInVoiceRoom) {
        leaveVoiceRoom();
    } else {
        await joinVoiceRoom();
    }
}

async function joinVoiceRoom() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }, 
            video: false 
        });
        
        console.log('🎤 Микрофон получен');
        
        isInVoiceRoom = true;
        document.getElementById('voiceRoomPanel').classList.add('active');
        document.getElementById('joinVoiceBtn').textContent = '🎤 В комнате';
        
        // Если PTT включён - сразу выключаем микрофон
        if (pttEnabled) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = false;
            });
            console.log('🎤 PTT активен - микрофон выключен');
        }
        
        socket.emit('voice_join', { username: currentUser, roomId: CONFIG.ROOM_ID });
        console.log('🎤 Вошёл в голосовую комнату');
        
    } catch (error) {
        console.error('❌ Ошибка доступа к микрофону:', error);
        alert('Не удалось получить доступ к микрофону. Проверьте разрешения браузера.');
    }
}

function leaveVoiceRoom() {
    if (!isInVoiceRoom) return;
    
    peerConnections.forEach((pc) => pc.close());
    peerConnections.clear();
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    socket.emit('voice_leave', { roomId: CONFIG.ROOM_ID });
    
    isInVoiceRoom = false;
    isPTTActive = false;
    document.getElementById('voiceRoomPanel').classList.remove('active');
    document.getElementById('joinVoiceBtn').textContent = '🎤 Голосовая комната';
    document.getElementById('voiceParticipants').innerHTML = '';
    
    console.log('🚪 Вышел из голосовой комнаты');
}

function toggleMute() {
    if (!localStream) return;
    
    // Если PTT включён - не даём менять mute вручную
    if (pttEnabled) {
        alert('PTT включён. Используйте клавишу для управления микрофоном.');
        return;
    }
    
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
    });
    
    const muteBtn = document.getElementById('muteBtn');
    if (isMuted) {
        muteBtn.textContent = '🔇 Выкл';
        muteBtn.style.background = '#ed4245';
    } else {
        muteBtn.textContent = '🎤 Вкл';
        muteBtn.style.background = '#faa61a';
    }
}

async function createPeerConnection(targetSocketId, targetUsername, isInitiator) {
    const pc = new RTCPeerConnection({ iceServers: CONFIG.ICE_SERVERS });
    
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('voice_ice_candidate', {
                targetSocketId: targetSocketId,
                candidate: event.candidate,
                roomId: CONFIG.ROOM_ID
            });
        }
    };
    
    pc.ontrack = (event) => {
        console.log(`🔊 Получен аудио поток от ${targetUsername}`);
        
        const audio = document.createElement('audio');
        audio.id = `audio_${targetSocketId}`;
        audio.srcObject = event.streams[0];
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        
        event.streams[0].onremovetrack = () => audio.remove();
    };
    
    pc.onconnectionstatechange = () => {
        console.log(`Состояние соединения с ${targetUsername}:`, pc.connectionState);
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            closePeerConnection(targetSocketId);
        }
    };
    
    peerConnections.set(targetSocketId, pc);
    
    if (isInitiator) {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            socket.emit('voice_signal', {
                targetSocketId: targetSocketId,
                signal: offer,
                roomId: CONFIG.ROOM_ID
            });
            
            console.log('📤 Отправлен offer для', targetUsername);
        } catch (error) {
            console.error('Ошибка создания offer:', error);
        }
    }
}

async function handleSignal(socketId, signal) {
    let pc = peerConnections.get(socketId);
    
    if (!pc) {
        pc = new RTCPeerConnection({ iceServers: CONFIG.ICE_SERVERS });
        
        if (localStream) {
            localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
            });
        }
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('voice_ice_candidate', {
                    targetSocketId: socketId,
                    candidate: event.candidate,
                    roomId: CONFIG.ROOM_ID
                });
            }
        };
        
        pc.ontrack = (event) => {
            console.log(`🔊 Получен аудио поток от ${socketId}`);
            
            const audio = document.createElement('audio');
            audio.id = `audio_${socketId}`;
            audio.srcObject = event.streams[0];
            audio.autoplay = true;
            audio.style.display = 'none';
            document.body.appendChild(audio);
        };
        
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                closePeerConnection(socketId);
            }
        };
        
        peerConnections.set(socketId, pc);
    }
    
    if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('voice_signal', {
            targetSocketId: socketId,
            signal: answer,
            roomId: CONFIG.ROOM_ID
        });
        
        console.log('📤 Отправлен answer для', socketId);
    } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        console.log('✅ Получен answer от', socketId);
    }
}

function handleIceCandidate(socketId, candidate) {
    const pc = peerConnections.get(socketId);
    if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(err => console.error('Ошибка добавления ICE candidate:', err));
    }
}

function closePeerConnection(socketId) {
    const pc = peerConnections.get(socketId);
    if (pc) {
        pc.close();
        peerConnections.delete(socketId);
        
        const audio = document.getElementById(`audio_${socketId}`);
        if (audio) audio.remove();
    }
}

function updateVoiceParticipants(participants) {
    const voiceParticipants = document.getElementById('voiceParticipants');
    voiceParticipants.innerHTML = '';
    
    participants.forEach(p => {
        const div = document.createElement('div');
        div.className = 'voice-participant';
        div.id = `participant_${p.socketId}`;
        div.innerHTML = `
            <span class="mic-icon">🎤</span>
            <span>${p.username}</span>
        `;
        voiceParticipants.appendChild(div);
    });
    
    if (isInVoiceRoom) {
        const myDiv = document.createElement('div');
        myDiv.className = 'voice-participant' + (isMuted || pttEnabled ? ' muted' : '');
        myDiv.innerHTML = `
            <span class="mic-icon">${(isMuted || pttEnabled) ? '🔇' : '🎤'}</span>
            <span>${currentUser} (вы)</span>
        `;
        voiceParticipants.appendChild(myDiv);
    }
}