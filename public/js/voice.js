// Модуль голосовой комнаты с PTT
let localStream = null;
let peerConnections = new Map();
let isInVoiceRoom = false;
let isMuted = false;
let isPTTActive = false;
let pttKey = localStorage.getItem('richvoice_ptt_key') || 'Space';
let pttEnabled = localStorage.getItem('richvoice_ptt_enabled') === 'true';

// Для индикатора "кто говорит"
let audioContext = null;
let analyser = null;
let dataArray = null;
let speakingTimeout = null;
const SPEAKING_THRESHOLD = 30;
const SPEAKING_DEBOUNCE = 500;

function initPTT() {
    updatePTTButton();
    document.addEventListener('keydown', handlePTTKeyDown);
    document.addEventListener('keyup', handlePTTKeyUp);
}

function handlePTTKeyDown(e) {
    if (!isInVoiceRoom || !pttEnabled || !localStream) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const pressedKey = e.code === 'Space' ? 'Space' : e.key;

    if (pressedKey === pttKey && !isPTTActive) {
        e.preventDefault();
        isPTTActive = true;
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
        localStream.getAudioTracks().forEach(track => {
            track.enabled = false;
        });
    }
}

function setPTTKey() {
    const pttKeyBtn = document.getElementById('pttKeyBtn');
    pttKeyBtn.textContent = '⏳ Нажмите клавишу...';
    pttKeyBtn.style.background = '#5865f2';
    const handler = (e) => {
        e.preventDefault();
        pttKey = e.code === 'Space' ? 'Space' : e.key;
        localStorage.setItem('richvoice_ptt_key', pttKey);
        pttKeyBtn.style.background = '#40444b';
        updatePTTButton();
        document.removeEventListener('keydown', handler);
    };
    document.addEventListener('keydown', handler);
}

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

        initAudioAnalyzer();

        if (pttEnabled) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = false;
            });
        }

        socket.emit('voice_join', { username: currentUser, roomId: CONFIG.ROOM_ID });
        console.log('🎤 Вошёл в голосовую комнату');
    } catch (error) {
        console.error('❌ Ошибка доступа к микрофону:', error);
        alert('Не удалось получить доступ к микрофону.');
    }
}

// ========== ИНДИКАТОР "КТО ГОВОРИТ" ==========
function initAudioAnalyzer() {
    if (!localStream) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(localStream);
        source.connect(analyser);
        analyser.fftSize = 256;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        monitorSpeaking();
    } catch (error) {
        console.error('Ошибка инициализации анализатора:', error);
    }
}

function monitorSpeaking() {
    if (!analyser || !isInVoiceRoom) return;
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
    }
    const average = sum / dataArray.length;
    const isSpeaking = average > SPEAKING_THRESHOLD;

    if (isSpeaking) {
        socket.emit('voice_speaking', {
            roomId: CONFIG.ROOM_ID,
            isSpeaking: true
        });
        if (speakingTimeout) clearTimeout(speakingTimeout);
        speakingTimeout = setTimeout(() => {
            socket.emit('voice_speaking', {
                roomId: CONFIG.ROOM_ID,
                isSpeaking: false
            });
        }, SPEAKING_DEBOUNCE);
    }

    requestAnimationFrame(monitorSpeaking);
}

function handleUserSpeaking(data) {
    const participant = document.getElementById(`participant_${data.socketId}`);
    if (participant) {
        if (data.isSpeaking) {
            participant.classList.add('speaking');
        } else {
            participant.classList.remove('speaking');
        }
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
    if (audioContext) {
        audioContext.close();
        audioContext = null;
        analyser = null;
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
    if (pttEnabled) {
        alert('PTT включён. Используйте клавишу.');
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

        addVolumeControl(targetSocketId, targetUsername);

        event.streams[0].onremovetrack = () => {
            audio.remove();
            const volumeControl = document.getElementById(`volume-control_${targetSocketId}`);
            if (volumeControl) volumeControl.remove();
        };
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
        } catch (error) {
            console.error('Ошибка создания offer:', error);
        }
    }
}

// ========== ГРОМКОСТЬ ==========
function addVolumeControl(socketId, username) {
    const participant = document.getElementById(`participant_${socketId}`);
    if (!participant) return;
    const volumeControl = document.createElement('div');
    volumeControl.id = `volume-control_${socketId}`;
    volumeControl.className = 'volume-control';
    volumeControl.innerHTML = `
        <span class="volume-icon">🔊</span>
        <input type="range" min="0" max="100" value="100"
               class="volume-slider"
               data-socket-id="${socketId}"
               onchange="setVolume('${socketId}', this.value)">
    `;
    participant.appendChild(volumeControl);
}

function setVolume(socketId, value) {
    const audio = document.getElementById(`audio_${socketId}`);
    if (audio) {
        audio.volume = value / 100;
        const icon = document.querySelector(`#volume-control_${socketId} .volume-icon`);
        if (icon) {
            if (value == 0) icon.textContent = '🔇';
            else if (value < 50) icon.textContent = '🔉';
            else icon.textContent = '🔊';
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
            addVolumeControl(socketId, 'Пользователь');
            event.streams[0].onremovetrack = () => {
                audio.remove();
                const volumeControl = document.getElementById(`volume-control_${socketId}`);
                if (volumeControl) volumeControl.remove();
            };
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
    } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
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
        const volumeControl = document.getElementById(`volume-control_${socketId}`);
        if (volumeControl) volumeControl.remove();
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
        myDiv.id = 'participant_me';
        myDiv.innerHTML = `
            <span class="mic-icon">${(isMuted || pttEnabled) ? '🔇' : '🎤'}</span>
            <span>${currentUser} (вы)</span>
        `;
        voiceParticipants.appendChild(myDiv);
    }
}