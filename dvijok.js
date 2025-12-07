// ==================== НАСТРОЙКИ СКОРОСТИ ====================
const GAME_CONFIG = {
    UPDATE_INTERVAL: 120,
    SMOOTH_MOVEMENT: true
};

let lastUpdateTime = 0;
let pendingDirection = { dx: 0, dy: 0 };

// Получаем ссылки на элементы HTML
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const onlineCountElement = document.getElementById('onlineCount');
const playersCountElement = document.getElementById('playersCount');
const playersListElement = document.getElementById('playersList');
const connectBtn = document.getElementById('connectBtn');
const restartButton = document.getElementById('restartButton');
const gameOverScreen = document.getElementById('gameOver');
const finalScoreElement = document.getElementById('finalScore');
const playAgainButton = document.getElementById('playAgainButton');
const chatMessagesElement = document.getElementById('chatMessages');
const chatInputElement = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');
const recordsListElement = document.getElementById('recordsList');
const refreshRecordsBtn = document.getElementById('refreshRecords');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const serverAddressElement = document.getElementById('serverAddress');

// WebSocket соединение
let ws = null;
let playerId = null;
let gameState = null;
let playersList = [];
let currentPlayerName = '';
let currentGameMode = 'classic';
let currentFieldSize = 'medium';
let activeBuffs = new Set();
let pointsMultiplier = 1;
let buffTimers = new Map();

// Размеры поля по умолчанию
let gridSize = 20;
let fieldWidth = 20;
let fieldHeight = 20;

// Игровые переменные
let score = 0;
let direction = { dx: 0, dy: 0 };
let gameStarted = false; // Флаг начала игры

// Цвета игроков
const playerColors = {};


// ==================== ПРОСТОЙ ДИЗАЙН ЗМЕЙКИ ====================

function drawSimpleSnake(snake, color, isCurrentPlayer = false) {
    if (!snake || snake.length === 0) return;
    
    for (let i = 0; i < snake.length; i++) {
        const segment = snake[i];
        const x = segment.x * gridSize;
        const y = segment.y * gridSize;
        
        // Основной квадрат сегмента
        ctx.fillStyle = color;
        ctx.fillRect(x, y, gridSize, gridSize);
        
        // Темная обводка для лучшей видимости
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, gridSize, gridSize);
        
        // Голова - рисуем глаза и выделяем
        if (i === 0) {
            // Белая обводка для головы текущего игрока
            if (isCurrentPlayer) {
                ctx.strokeStyle = '#FFF';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, gridSize, gridSize);
            }
            
            // Простые глаза
            drawSimpleEyes(x, y);
        }
        
        // Для тела делаем легкий градиент
        if (i > 0) {
            ctx.fillStyle = adjustColorBrightness(color, -10);
            ctx.fillRect(x + 2, y + 2, gridSize - 4, gridSize - 4);
        }
    }
}

function drawSimpleEyes(x, y) {
    const eyeSize = gridSize / 5;
    
    // Два белых глаза с черными зрачками
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(x + gridSize * 0.3, y + gridSize * 0.3, eyeSize, 0, Math.PI * 2);
    ctx.arc(x + gridSize * 0.7, y + gridSize * 0.3, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(x + gridSize * 0.3, y + gridSize * 0.3, eyeSize/2, 0, Math.PI * 2);
    ctx.arc(x + gridSize * 0.7, y + gridSize * 0.3, eyeSize/2, 0, Math.PI * 2);
    ctx.fill();
}

function drawSimpleFood(x, y, color) {
    const centerX = x + gridSize / 2;
    const centerY = y + gridSize / 2;
    const foodRadius = gridSize / 2 - 1;
    
    // Простой круг с тенью
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, foodRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Сбрасываем тень
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Белый блик
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(centerX - foodRadius/3, centerY - foodRadius/3, foodRadius/3, 0, Math.PI * 2);
    ctx.fill();
}

function drawSimpleBuff(x, y, color) {
    const centerX = x + gridSize / 2;
    const centerY = y + gridSize / 2;
    const buffRadius = gridSize / 2 - 1;
    
    // Пульсация
    const time = Date.now() / 1000;
    const pulse = Math.sin(time * 4) * 0.3 + 0.7;
    
    // Яркий круг с свечением
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, buffRadius * pulse, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    
    // Иконка молнии
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', centerX, centerY);
}

// Функция для изменения яркости цвета (оставляем существующую)
function adjustColorBrightness(color, percent) {
    const num = parseInt(color.slice(1), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    
    return '#' + (
        0x1000000 +
        R * 0x10000 +
        G * 0x100 +
        B
    ).toString(16).slice(1);
}

// ==================== ОБНОВЛЕННАЯ ФУНКЦИЯ ОТРИСОВКИ ИГРЫ ====================

function drawGame() {
    if (!gameState) return;
    
    // Очищаем холст
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Рисуем сетку
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= fieldWidth; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gridSize, 0);
        ctx.lineTo(i * gridSize, canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i <= fieldHeight; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * gridSize);
        ctx.lineTo(canvas.width, i * gridSize);
        ctx.stroke();
    }
    
    // Рисуем стены (в режиме walls)
    if (gameState.walls && currentGameMode === 'walls') {
        ctx.fillStyle = '#555';
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 2;
        
        gameState.walls.forEach(wall => {
            ctx.fillRect(
                wall.x * gridSize, 
                wall.y * gridSize, 
                wall.width * gridSize, 
                wall.height * gridSize
            );
            ctx.strokeRect(
                wall.x * gridSize, 
                wall.y * gridSize, 
                wall.width * gridSize, 
                wall.height * gridSize
            );
        });
    }
    
    // Рисуем еду
    if (gameState.foods) {
        gameState.foods.forEach(food => {
            drawSimpleFood(food.x * gridSize, food.y * gridSize, food.color);
        });
    }
    
    // Рисуем баффы
    if (gameState.buffs) {
        gameState.buffs.forEach(buff => {
            if (buff.type === 'double_points') {
                drawSimpleBuff(buff.x * gridSize, buff.y * gridSize, buff.color);
            }
        });
    }
    
    // Рисуем всех змеек простым стилем
    if (gameState.players) {
        gameState.players.forEach(player => {
            if (!playerColors[player.id]) {
                playerColors[player.id] = player.color;
            }
            
            if (player.snake) {
                const isCurrentPlayer = player.id === playerId;
                drawSimpleSnake(player.snake, playerColors[player.id], isCurrentPlayer);
                
                // Имя игрока над головой
                if (player.snake.length > 0) {
                    const head = player.snake[0];
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 12px Arial';
                    ctx.textAlign = 'center';
                    ctx.shadowColor = '#000';
                    ctx.shadowBlur = 4;
                    ctx.fillText(
                        player.name, 
                        head.x * gridSize + gridSize/2, 
                        head.y * gridSize - 8
                    );
                    ctx.shadowBlur = 0;
                }
            }
        });
    }
    
    // Отображаем подсказку, если игра не начата
    if (!gameStarted) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('НАЖМИТЕ СТРЕЛКУ ДЛЯ НАЧАЛА ИГРЫ', canvas.width / 2, canvas.height / 2);
        
        ctx.font = '16px Arial';
        ctx.fillText('Используйте стрелки для управления', canvas.width / 2, canvas.height / 2 + 40);
    }
}
// ==================== СИСТЕМА РЕКОРДОВ ====================

async function loadRecords() {
    try {
        const response = await fetch(`/api/records?mode=${currentGameMode}&size=${currentFieldSize}`);
        const result = await response.json();
        
        if (result.success) {
            displayRecords(result.records);
        } else {
            throw new Error('Ошибка сервера');
        }
    } catch (error) {
        console.error('Ошибка загрузки рекордов:', error);
        recordsListElement.innerHTML = `
            <div style="text-align: center; color: #ff4444; padding: 20px;">
                Ошибка загрузки рекордов
            </div>
        `;
    }
}

function displayRecords(records) {
    if (records.length === 0) {
        recordsListElement.innerHTML = `
            <div style="text-align: center; color: #ccc; padding: 20px;">
                Рекордов пока нет
            </div>
        `;
        return;
    }
    
    recordsListElement.innerHTML = records.map((record, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const date = new Date(record.created_at).toLocaleDateString('ru-RU');
        const modeBadge = record.game_mode === 'walls' ? ' 🧱' : '';
        const sizeBadge = getSizeBadge(record.field_size);
        
        return `
            <div class="record-item">
                <div class="record-position">${medal}</div>
                <div class="record-info">
                    <div class="record-player">${record.player_name}${modeBadge}${sizeBadge}</div>
                    <div class="record-details">
                        <span class="record-score">🎯 ${record.score} очков</span>
                        <span>🍎 ${record.food_eaten} еды</span>
                        <span>📅 ${date}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getSizeBadge(size) {
    const badges = {
        'small': ' 🔹',
        'medium': ' 🔸', 
        'large': ' 🔷'
    };
    return badges[size] || '';
}

function saveRecordOnDeath(playerName, score, snakeLength) {
    if (score <= 0) {
        console.log('Счет 0, рекорд не сохраняем');
        return;
    }
    
    const recordData = {
        playerName: playerName,
        score: score,
        snakeLength: snakeLength,
        foodEaten: Math.floor(score / 10),
        gameMode: currentGameMode,
        fieldSize: currentFieldSize
    };
    
    console.log('Сохраняем рекорд:', recordData);
    
    fetch('/api/records', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(recordData)
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            console.log('Рекорд успешно сохранен');
            setTimeout(loadRecords, 1000);
        } else {
            console.error('Ошибка сохранения рекорда:', result.error);
        }
    })
    .catch(error => {
        console.error('Ошибка отправки рекорда:', error);
    });
}

// ==================== УПРАВЛЕНИЕ РЕЖИМАМИ И РАЗМЕРАМИ ====================

function createGameSettings() {
    const settings = document.createElement('div');
    settings.className = 'game-settings';
    settings.innerHTML = `
        <div class="panel" style="margin-bottom: 20px;">
            <h3>🎮 НАСТРОЙКИ ИГРЫ</h3>
            
            <div class="setting-group">
                <h4>Режим игры</h4>
                <div class="mode-buttons">
                    <button id="classicMode" class="mode-btn active">КЛАССИКА</button>
                    <button id="wallsMode" class="mode-btn">СТЕНЫ</button>
                </div>
                <div class="mode-description" id="modeDescription">
                    Бесконечные стены, телепортация через границы
                </div>
            </div>
            
            <div class="setting-group">
                <h4>Размер поля</h4>
                <div class="size-buttons">
                    <button id="smallSize" class="size-btn">МАЛЕНЬКИЙ</button>
                    <button id="mediumSize" class="size-btn active">СРЕДНИЙ</button>
                    <button id="largeSize" class="size-btn">БОЛЬШОЙ</button>
                </div>
                <div class="size-description" id="sizeDescription">
                    20x20 клеток - оптимальный размер
                </div>
            </div>
            
            <div class="active-buffs" id="activeBuffs">
                <div style="text-align: center; color: #ccc; padding: 10px;">Нет активных баффов</div>
            </div>
        </div>
    `;
    
    const firstPanel = document.querySelector('.sidebar .panel');
    firstPanel.parentNode.insertBefore(settings, firstPanel);
    
    // Добавляем стили
    const style = document.createElement('style');
    style.textContent = `
        .setting-group {
            margin-bottom: 20px;
        }
        
        .setting-group h4 {
            color: #4CAF50;
            margin-bottom: 10px;
            font-size: 1rem;
        }
        
        .mode-buttons, .size-buttons {
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
        }
        
        .mode-btn, .size-btn {
            flex: 1;
            padding: 10px;
            background: rgba(255, 255, 255, 0.1);
            border: 2px solid transparent;
            border-radius: 6px;
            color: white;
            cursor: pointer;
            transition: all 0.3s;
            font-weight: bold;
            font-size: 0.9rem;
        }
        
        .mode-btn.active, .size-btn.active {
            background: linear-gradient(135deg, #4CAF50, #45a049);
            border-color: #4CAF50;
            box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
        }
        
        .mode-btn:hover:not(.active), .size-btn:hover:not(.active) {
            background: rgba(255, 255, 255, 0.2);
            transform: translateY(-2px);
        }
        
        .mode-description, .size-description {
            text-align: center;
            color: #ccc;
            font-size: 0.8rem;
            min-height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .active-buffs {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-top: 15px;
        }
        
        .buff-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            border-left: 4px solid #FF00FF;
        }
        
        .buff-icon {
            font-size: 1.2rem;
        }
        
        .buff-info {
            flex: 1;
        }
        
        .buff-name {
            font-weight: bold;
            color: #FF00FF;
            font-size: 0.9rem;
        }
        
        .buff-timer {
            font-size: 0.7rem;
            color: #ccc;
        }
        
        .buff-progress {
            height: 3px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 2px;
            overflow: hidden;
            margin-top: 4px;
        }
        
        .buff-progress-bar {
            height: 100%;
            background: #FF00FF;
            transition: width 1s linear;
        }
        
        @media (max-width: 768px) {
            .mode-buttons, .size-buttons {
                flex-direction: column;
            }
        }
    `;
    document.head.appendChild(style);
    
    // Обработчики событий
    document.getElementById('classicMode').addEventListener('click', () => changeGameMode('classic'));
    document.getElementById('wallsMode').addEventListener('click', () => changeGameMode('walls'));
    
    document.getElementById('smallSize').addEventListener('click', () => changeFieldSize('small'));
    document.getElementById('mediumSize').addEventListener('click', () => changeFieldSize('medium'));
    document.getElementById('largeSize').addEventListener('click', () => changeFieldSize('large'));
}

function changeGameMode(mode) {
    if (currentGameMode === mode) return;
    
    document.getElementById('classicMode').classList.toggle('active', mode === 'classic');
    document.getElementById('wallsMode').classList.toggle('active', mode === 'walls');
    
    const description = document.getElementById('modeDescription');
    if (mode === 'classic') {
        description.textContent = 'Бесконечные стены, телепортация через границы';
    } else {
        description.textContent = 'Непроходимые стены, смерть при столкновении';
    }
    
    currentGameMode = mode;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'change_game_mode',
            mode: mode
        }));
    }
    
    loadRecords();
    console.log(`Переключен режим игры на: ${mode}`);
}

function changeFieldSize(size) {
    if (currentFieldSize === size) return;
    
    document.getElementById('smallSize').classList.toggle('active', size === 'small');
    document.getElementById('mediumSize').classList.toggle('active', size === 'medium');
    document.getElementById('largeSize').classList.toggle('active', size === 'large');
    
    const description = document.getElementById('sizeDescription');
    const sizes = {
        'small': '15x15 клеток - для быстрых игр',
        'medium': '20x20 клеток - оптимальный размер', 
        'large': '25x25 клеток - для долгих сессий'
    };
    description.textContent = sizes[size];
    
    currentFieldSize = size;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'change_field_size',
            size: size
        }));
    }
    
    loadRecords();
    console.log(`Переключен размер поля на: ${size}`);
}

function updateActiveBuffs(buffs) {
    const activeBuffsElement = document.getElementById('activeBuffs');
    activeBuffs.clear();
    
    if (buffs.length === 0) {
        activeBuffsElement.innerHTML = '<div style="text-align: center; color: #ccc; padding: 10px;">Нет активных баффов</div>';
        pointsMultiplier = 1;
        return;
    }
    
    activeBuffsElement.innerHTML = buffs.map(buffType => {
        if (buffType === 'double_points') {
            pointsMultiplier = 2;
            return `
                <div class="buff-item">
                    <div class="buff-icon">⚡</div>
                    <div class="buff-info">
                        <div class="buff-name">Удвоение очков</div>
                        <div class="buff-timer">10 сек</div>
                        <div class="buff-progress">
                            <div class="buff-progress-bar" style="width: 100%"></div>
                        </div>
                    </div>
                </div>
            `;
        }
        return '';
    }).join('');
    
    buffs.forEach(buffType => {
        if (buffType === 'double_points' && !buffTimers.has('double_points')) {
            startBuffTimer('double_points', 10);
        }
    });
}

function startBuffTimer(buffType, duration) {
    if (buffTimers.has(buffType)) {
        clearInterval(buffTimers.get(buffType));
    }
    
    const progressBar = document.querySelector(`.buff-progress-bar`);
    if (!progressBar) return;
    
    let timeLeft = duration;
    progressBar.style.width = '100%';
    
    const timer = setInterval(() => {
        timeLeft--;
        const progress = (timeLeft / duration) * 100;
        progressBar.style.width = `${progress}%`;
        
        if (timeLeft <= 0) {
            clearInterval(timer);
            buffTimers.delete(buffType);
        }
    }, 1000);
    
    buffTimers.set(buffType, timer);
}

// ==================== ОСНОВНОЙ КОД ИГРЫ ====================

function updateConnectionStatus(status) {
    statusDot.className = 'status-dot';
    switch (status) {
        case 'connected':
            statusDot.classList.add('connected');
            statusText.textContent = 'Подключено';
            connectBtn.textContent = '✅ ПОДКЛЮЧЕНО';
            connectBtn.classList.add('connected');
            break;
        case 'connecting':
            statusDot.classList.add('connecting');
            statusText.textContent = 'Подключаемся...';
            connectBtn.textContent = '🔄 ПОДКЛЮЧАЕМСЯ...';
            break;
        case 'disconnected':
            statusText.textContent = 'Не подключено';
            connectBtn.textContent = '🎮 ПОДКЛЮЧИТЬСЯ К ИГРЕ';
            connectBtn.classList.remove('connected');
            break;
        case 'error':
            statusText.textContent = 'Ошибка подключения';
            connectBtn.textContent = '❌ ОШИБКА ПОДКЛЮЧЕНИЯ';
            break;
    }
}

function connectToServer() {
    const playerName = prompt('Введите ваше имя:', 'Игрок' + Math.floor(Math.random() * 1000));
    if (!playerName) return;
    
    currentPlayerName = playerName;
    
    const serverUrl = 'ws://' + window.location.hostname + ':3000';
    console.log('Подключаемся к:', serverUrl);
    
    updateConnectionStatus('connecting');
    
    ws = new WebSocket(serverUrl);
    
    ws.onopen = () => {
        console.log('Подключение к серверу установлено');
        updateConnectionStatus('connected');
        serverAddressElement.textContent = `Сервер: ${serverUrl}`;
        
        ws.send(JSON.stringify({
            type: 'join_game',
            playerName: playerName,
            gameMode: currentGameMode,
            fieldSize: currentFieldSize
        }));
    };
    
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleServerMessage(message);
        } catch (error) {
            console.error('Ошибка парсинга сообщения:', error);
        }
    };
    
    ws.onclose = () => {
        console.log('Соединение с сервером разорвано');
        updateConnectionStatus('disconnected');
    };
    
    ws.onerror = (error) => {
        console.error('Ошибка WebSocket:', error);
        updateConnectionStatus('error');
        setTimeout(() => {
            updateConnectionStatus('disconnected');
        }, 3000);
    };
}

// ==================== БЛОКИРОВКА ПРОКРУТКИ СТРАНИЦЫ ====================

// Блокировка прокрутки страницы при нажатии стрелок
document.addEventListener('keydown', (event) => {
    // Проверяем, что нажата одна из стрелок
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
        // Предотвращаем стандартное поведение браузера
        event.preventDefault();
    }
});

// Дополнительно блокируем прокрутку при фокусе на канвасе
canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
}, { passive: false });

// Блокируем контекстное меню на канвасе (правый клик)
canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

// Фокус на канвасе при клике для лучшего управления
canvas.addEventListener('click', () => {
    canvas.focus();
});

// Устанавливаем атрибуты для лучшей фокусировки
canvas.setAttribute('tabindex', '0');
canvas.style.outline = 'none'; // Убираем стандартную обводку при фокусе

// Добавляем стиль для скролла страницы
const scrollStyle = document.createElement('style');
scrollStyle.textContent = `
    body {
        overflow: hidden;
        position: fixed;
        width: 100%;
        height: 100%;
    }
    
    .container {
        overflow-y: auto;
        max-height: 100vh;
        padding: 10px;
    }
    
    /* Скрываем скроллбар но оставляем возможность скролла */
    .container::-webkit-scrollbar {
        width: 8px;
    }
    
    .container::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
    }
    
    .container::-webkit-scrollbar-thumb {
        background: rgba(76, 175, 80, 0.6);
        border-radius: 4px;
    }
    
    .container::-webkit-scrollbar-thumb:hover {
        background: rgba(76, 175, 80, 0.8);
    }
`;
document.head.appendChild(scrollStyle);

function handleServerMessage(message) {
    switch (message.type) {
        case 'game_joined':
            playerId = message.playerId;
            gameState = message.gameState;
            currentGameMode = message.gameMode || 'classic';
            currentFieldSize = message.fieldSize || 'medium';
            gameStarted = false; // Сбрасываем флаг начала игры
            direction = { dx: 0, dy: 0 }; // Сбрасываем направление
            updateGameSettingsUI();
            updateCanvasSize();
            console.log('Присоединились к игре, ID:', playerId, 'Режим:', currentGameMode, 'Размер:', currentFieldSize);
            break;
            
        case 'game_state':
            gameState = message;
            updateCanvasSize();
            drawGame();
            break;
            
        case 'player_joined':
            playersList = message.players || [];
            updatePlayersList();
            addChatMessage('⚡', `Игрок ${message.playerName} присоединился к игре`);
            break;
            
        case 'player_left':
            playersList = playersList.filter(p => p.id !== message.playerId);
            updatePlayersList();
            addChatMessage('👋', `Игрок ${message.playerName} покинул игру`);
            break;
            
        case 'players_update':
            playersList = message.players || [];
            updatePlayersList();
            break;
            
        case 'score_update':
            score = message.score;
            scoreElement.textContent = score;
            
            if (message.pointsEarned) {
                showPointsPopup(message.pointsEarned, message.multiplier || 1);
            }
            break;
            
        case 'player_died':
            if (message.playerId === playerId) {
                console.log('Игрок умер, сохраняем рекорд...');
                showGameOver(message.score);
                saveRecordOnDeath(currentPlayerName, message.score, 0);
                gameStarted = false; // Сбрасываем флаг начала игры
            } else {
                addChatMessage('💀', `Игрок ${message.playerName} умер со счетом ${message.score}`);
            }
            break;
            
        case 'player_respawn':
            console.log('Возрождение...');
            hideGameOver();
            activeBuffs.clear();
            pointsMultiplier = 1;
            updateActiveBuffs([]);
            gameStarted = false; // Сбрасываем флаг начала игры при возрождении
            direction = { dx: 0, dy: 0 }; // Сбрасываем направление
            break;
            
        case 'chat_message':
            addChatMessage(message.playerName, message.message);
            break;
            
        case 'game_mode_changed':
            currentGameMode = message.gameMode;
            gameState = message.gameState;
            gameStarted = false; // Сбрасываем флаг начала игры
            direction = { dx: 0, dy: 0 }; // Сбрасываем направление
            updateGameSettingsUI();
            updateCanvasSize();
            console.log('Режим игры изменен на:', currentGameMode);
            break;
            
        case 'field_size_changed':
            currentFieldSize = message.fieldSize;
            gameState = message.gameState;
            gameStarted = false; // Сбрасываем флаг начала игры
            direction = { dx: 0, dy: 0 }; // Сбрасываем направление
            updateGameSettingsUI();
            updateCanvasSize();
            console.log('Размер поля изменен на:', currentFieldSize);
            break;
            
        case 'buff_collected':
            addChatMessage('⚡', `Вы подобрали бафф: ${getBuffName(message.buffType)}`);
            activeBuffs.add(message.buffType);
            updateActiveBuffs(Array.from(activeBuffs));
            break;
            
        case 'buff_expired':
            addChatMessage('⚡', `Бафф "${getBuffName(message.buffType)}" закончился`);
            activeBuffs.delete(message.buffType);
            updateActiveBuffs(Array.from(activeBuffs));
            break;

        case 'game_restarted':
            gameState = message.gameState;
            updateCanvasSize();
            drawGame();
            console.log('Игра перезапущена с новыми стенами');
            break;
    }
}

function updateCanvasSize() {
    if (gameState && gameState.width && gameState.height && gameState.gridSize) {
        fieldWidth = gameState.width;
        fieldHeight = gameState.height;
        gridSize = gameState.gridSize;
        
        canvas.width = fieldWidth * gridSize;
        canvas.height = fieldHeight * gridSize;
        
        console.log(`Размер холста обновлен: ${canvas.width}x${canvas.height}, сетка: ${gridSize}px`);
    }
}

function updateGameSettingsUI() {
    const classicBtn = document.getElementById('classicMode');
    const wallsBtn = document.getElementById('wallsMode');
    const modeDescription = document.getElementById('modeDescription');
    
    const smallBtn = document.getElementById('smallSize');
    const mediumBtn = document.getElementById('mediumSize');
    const largeBtn = document.getElementById('largeSize');
    const sizeDescription = document.getElementById('sizeDescription');
    
    if (classicBtn && wallsBtn) {
        classicBtn.classList.toggle('active', currentGameMode === 'classic');
        wallsBtn.classList.toggle('active', currentGameMode === 'walls');
        
        if (currentGameMode === 'classic') {
            modeDescription.textContent = 'Бесконечные стены, телепортация через границы';
        } else {
            modeDescription.textContent = 'Непроходимые стены, смерть при столкновении';
        }
    }
    
    if (smallBtn && mediumBtn && largeBtn) {
        smallBtn.classList.toggle('active', currentFieldSize === 'small');
        mediumBtn.classList.toggle('active', currentFieldSize === 'medium');
        largeBtn.classList.toggle('active', currentFieldSize === 'large');
        
        const sizes = {
            'small': '15x15 клеток - для быстрых игр',
            'medium': '20x20 клеток - оптимальный размер',
            'large': '25x25 клеток - для долгих сессий'
        };
        sizeDescription.textContent = sizes[currentFieldSize];
    }
}

function getBuffName(buffType) {
    const buffNames = {
        'double_points': 'Удвоение очков'
    };
    return buffNames[buffType] || buffType;
}

function showPointsPopup(points, multiplier) {
    const popup = document.createElement('div');
    popup.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: ${20 + points / 10}px;
        font-weight: bold;
        color: ${multiplier > 1 ? '#FF00FF' : '#4CAF50'};
        text-shadow: 0 0 10px ${multiplier > 1 ? 'rgba(255, 0, 255, 0.8)' : 'rgba(76, 175, 80, 0.8)'};
        z-index: 1000;
        pointer-events: none;
        animation: floatUp 1s ease-out forwards;
    `;
    
    popup.textContent = `+${points}${multiplier > 1 ? ' (x' + multiplier + ')' : ''}`;
    
    if (!document.querySelector('#pointsAnimation')) {
        const style = document.createElement('style');
        style.id = 'pointsAnimation';
        style.textContent = `
            @keyframes floatUp {
                0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, -100px) scale(1.5); }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(popup);
    
    setTimeout(() => {
        if (popup.parentNode) {
            popup.parentNode.removeChild(popup);
        }
    }, 1000);
}

function showGameOver(finalScore) {
    finalScoreElement.textContent = finalScore;
    gameOverScreen.style.display = 'block';
}

function hideGameOver() {
    gameOverScreen.style.display = 'none';
}

function drawGame() {
    if (!gameState) return;
    
    // Очищаем холст
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Рисуем сетку
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= fieldWidth; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gridSize, 0);
        ctx.lineTo(i * gridSize, canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i <= fieldHeight; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * gridSize);
        ctx.lineTo(canvas.width, i * gridSize);
        ctx.stroke();
    }
    
    // Рисуем стены (в режиме walls)
    if (gameState.walls && currentGameMode === 'walls') {
        ctx.fillStyle = '#666';
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        
        gameState.walls.forEach(wall => {
            ctx.fillRect(
                wall.x * gridSize, 
                wall.y * gridSize, 
                wall.width * gridSize, 
                wall.height * gridSize
            );
            ctx.strokeRect(
                wall.x * gridSize, 
                wall.y * gridSize, 
                wall.width * gridSize, 
                wall.height * gridSize
            );
        });
    }
    
    // Рисуем еду
    if (gameState.foods) {
        gameState.foods.forEach(food => {
            drawBeautifulFood(food.x * gridSize, food.y * gridSize, food.color, food.type);
        });
    }
    
    // Рисуем баффы
    if (gameState.buffs) {
        gameState.buffs.forEach(buff => {
            if (buff.type === 'double_points') {
                drawBeautifulBuff(buff.x * gridSize, buff.y * gridSize, buff.color);
            }
        });
    }
    
    // Рисуем всех змеек с гипер-детализацией
    if (gameState.players) {
        gameState.players.forEach(player => {
            if (!playerColors[player.id]) {
                playerColors[player.id] = player.color;
            }
            
            if (player.snake) {
                const isCurrentPlayer = player.id === playerId;
                drawSimpleSnake(player.snake, playerColors[player.id], isCurrentPlayer);
                
                // Имя игрока над головой
                if (player.snake.length > 0) {
                    const head = player.snake[0];
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 10px Arial';
                    ctx.textAlign = 'center';
                    ctx.shadowColor = '#000';
                    ctx.shadowBlur = 3;
                    ctx.fillText(
                        player.name, 
                        head.x * gridSize + gridSize/2, 
                        head.y * gridSize - 5
                    );
                    ctx.shadowBlur = 0;
                }
            }
        });
    }
    
    // Отображаем подсказку, если игра не начата
    if (!gameStarted) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('НАЖМИТЕ СТРЕЛКУ ДЛЯ НАЧАЛА ИГРЫ', canvas.width / 2, canvas.height / 2);
        
        ctx.font = '16px Arial';
        ctx.fillText('Используйте стрелки для управления', canvas.width / 2, canvas.height / 2 + 30);
    }
}

// Функция для рисования красивой еды
function drawBeautifulFood(x, y, color, type) {
    const centerX = x + gridSize / 2;
    const centerY = y + gridSize / 2;
    const foodRadius = gridSize / 2 - 2;
    
    // Градиент для еды
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, foodRadius);
    gradient.addColorStop(0, adjustColorBrightness(color, 30));
    gradient.addColorStop(1, adjustColorBrightness(color, -10));
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, foodRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Обводка
    ctx.strokeStyle = adjustColorBrightness(color, -20);
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Блики
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(centerX - foodRadius/3, centerY - foodRadius/3, foodRadius/4, 0, Math.PI * 2);
    ctx.fill();
    
    // Свечение
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
}

// Функция для рисования красивого баффа
function drawBeautifulBuff(x, y, color) {
    const centerX = x + gridSize / 2;
    const centerY = y + gridSize / 2;
    const buffRadius = gridSize / 2 - 2;
    
    // Анимированное свечение
    const time = Date.now() / 1000;
    const pulse = Math.sin(time * 3) * 0.3 + 0.7;
    
    // Градиент баффа
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, buffRadius);
    gradient.addColorStop(0, adjustColorBrightness(color, 40));
    gradient.addColorStop(1, adjustColorBrightness(color, -20));
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, buffRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Свечение
    ctx.shadowColor = color;
    ctx.shadowBlur = 15 * pulse;
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // Иконка молнии
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', centerX, centerY);
}

function updatePlayersList() {
    const totalPlayers = playersList.length;
    playersCountElement.textContent = totalPlayers;
    onlineCountElement.textContent = totalPlayers;
    
    if (playersList.length === 0) {
        playersListElement.innerHTML = `
            <div class="player-item">
                <span class="player-name">Ожидание игроков...</span>
            </div>
        `;
    } else {
        playersListElement.innerHTML = playersList.map(player => {
            const buffIcons = player.activeBuffs && player.activeBuffs.length > 0 ? 
                player.activeBuffs.map(buff => buff === 'double_points' ? '⚡' : '').join('') : '';
            
            return `<div class="player-item" style="border-left-color: ${player.color || '#4CAF50'}">
                <span class="player-name">${player.name} ${buffIcons}</span>
                <span class="player-score">${player.score} очков</span>
            </div>`;
        }).join('');
    }
}

// ==================== ОБРАБОТКА КЛАВИШ ====================

document.addEventListener('keydown', (event) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    // Устанавливаем флаг начала игры при первом нажатии стрелки
    if (!gameStarted && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        gameStarted = true;
    }
    
    // Обрабатываем движение только если игра начата
    if (gameStarted) {
        switch (event.key) {
            case 'ArrowUp':
                if (direction.dy !== 1) {
                    pendingDirection = { dx: 0, dy: -1 };
                }
                break;
            case 'ArrowDown':
                if (direction.dy !== -1) {
                    pendingDirection = { dx: 0, dy: 1 };
                }
                break;
            case 'ArrowLeft':
                if (direction.dx !== 1) {
                    pendingDirection = { dx: -1, dy: 0 };
                }
                break;
            case 'ArrowRight':
                if (direction.dx !== -1) {
                    pendingDirection = { dx: 1, dy: 0 };
                }
                break;
        }
        
        direction = { ...pendingDirection };
        sendMove();
    }
});

function sendMove() {
    // Не отправляем движение, если игра не начата
    if (!gameStarted) return;
    
    const now = Date.now();
    
    if (now - lastUpdateTime < GAME_CONFIG.UPDATE_INTERVAL) {
        return;
    }
    
    if (ws && ws.readyState === WebSocket.OPEN && (direction.dx !== 0 || direction.dy !== 0)) {
        ws.send(JSON.stringify({
            type: 'player_move',
            direction: direction
        }));
        lastUpdateTime = now;
    }
}

function sendChatMessage() {
    const text = chatInputElement.value.trim();
    if (ws && ws.readyState === WebSocket.OPEN && text) {
        ws.send(JSON.stringify({
            type: 'chat_message',
            text: text
        }));
        chatInputElement.value = '';
    }
}

function addChatMessage(playerName, message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `<strong>${playerName}:</strong> ${message}`;
    chatMessagesElement.appendChild(messageElement);
    chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
    
    if (chatMessagesElement.children.length > 50) {
        chatMessagesElement.removeChild(chatMessagesElement.firstChild);
    }
}

function restartGame() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        hideGameOver();
        gameStarted = false; // Сбрасываем флаг начала игры
        direction = { dx: 0, dy: 0 }; // Сбрасываем направление
        
        // Отправляем сообщение о перезапуске игры на сервер
        ws.send(JSON.stringify({
            type: 'restart_game'
        }));
    }
}

function gameLoop() {
    sendMove();
    requestAnimationFrame(gameLoop);
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

connectBtn.addEventListener('click', connectToServer);
restartButton.addEventListener('click', restartGame);
playAgainButton.addEventListener('click', restartGame);

sendChatBtn.addEventListener('click', sendChatMessage);
chatInputElement.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
});

refreshRecordsBtn.addEventListener('click', loadRecords);

document.addEventListener('DOMContentLoaded', () => {
    createGameSettings();
});

loadRecords();
gameLoop();

console.log('Мультиплеер змейка готова! Нажмите "Подключиться к игре"');
console.log('Режимы игры: Classic, Walls');
console.log('Размеры поля: Small (15x15), Medium (20x20), Large (25x25)');
console.log('Баффы: Удвоение очков (появляется после 100 очков)');

serverAddressElement.textContent = `Сервер: ws://${window.location.hostname}:3000`;