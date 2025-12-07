const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();

const hostname = '0.0.0.0';
const port = process.env.PORT || 3000;
// ==================== КОНФИГУРАЦИЯ ИГРЫ ====================
const GAME_CONFIG = {
    MODES: {
        CLASSIC: 'classic',
        WALLS: 'walls'
    },
    FIELD_SIZES: {
        SMALL: { width: 15, height: 15, gridSize: 25 },
        MEDIUM: { width: 20, height: 20, gridSize: 20 },
        LARGE: { width: 25, height: 25, gridSize: 16 }
    },
    BUFFS: {
        DOUBLE_POINTS: {
            type: 'double_points',
            duration: 10000,
            spawnScore: 100,
            color: '#FF00FF',
            points: 0
        }
    }
};

// ==================== КЛАСС БАЗЫ ДАННЫХ SQLite ====================
class Database {
    constructor() {
        // this.dbPath = path.join(__dirname, 'records.db');
        this.dbPath = ':memory:';
        this.db = null;
        this.init();
    }

    init() {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('Ошибка подключения к SQLite:', err.message);
                return;
            }
            console.log('Подключение к SQLite установлено');
            this.createTable();
        });
    }

    createTable() {
        const sql = `
            CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name TEXT NOT NULL,
                score INTEGER NOT NULL,
                snake_length INTEGER NOT NULL,
                game_duration INTEGER DEFAULT 0,
                food_eaten INTEGER NOT NULL,
                game_mode TEXT DEFAULT 'classic',
                field_size TEXT DEFAULT 'medium',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        
        this.db.run(sql, (err) => {
            if (err) {
                console.error('Ошибка создания таблицы:', err.message);
            } else {
                console.log('Таблица records готова');
            }
        });
    }

    addRecord(playerName, score, snakeLength, foodEaten, gameMode = 'classic', fieldSize = 'medium', callback) {
        const checkSql = `SELECT id FROM records WHERE player_name = ? AND score = ? AND game_mode = ? AND field_size = ?`;
        
        this.db.get(checkSql, [playerName, score, gameMode, fieldSize], (err, row) => {
            if (err) {
                console.error('Ошибка проверки дубликата:', err.message);
                callback(err, null);
                return;
            }

            if (row) {
                console.log(`Дубликат рекорда: ${playerName} - ${score} очков (${gameMode}, ${fieldSize})`);
                callback(null, null);
                return;
            }

            const insertSql = `
                INSERT INTO records (player_name, score, snake_length, food_eaten, game_mode, field_size)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            this.db.run(insertSql, [playerName, score, snakeLength, foodEaten, gameMode, fieldSize], function(err) {
                if (err) {
                    console.error('Ошибка добавления рекорда:', err.message);
                    callback(err, null);
                } else {
                    console.log(`Рекорд добавлен: ${playerName} - ${score} очков (${gameMode}, ${fieldSize})`);
                    callback(null, this.lastID);
                }
            });
        });
    }

    getTopRecords(limit = 10, gameMode = 'classic', fieldSize = 'medium', callback) {
        const sql = `
            SELECT * FROM records 
            WHERE game_mode = ? AND field_size = ?
            ORDER BY score DESC, created_at DESC 
            LIMIT ?
        `;
        
        this.db.all(sql, [gameMode, fieldSize, limit], (err, rows) => {
            if (err) {
                console.error('Ошибка получения рекордов:', err.message);
                callback(err, []);
            } else {
                console.log(`Получено ${rows.length} рекордов для режима ${gameMode}, размера ${fieldSize}`);
                callback(null, rows);
            }
        });
    }

    cleanupOldRecords(callback) {
        const sql = `
            DELETE FROM records 
            WHERE id NOT IN (
                SELECT id FROM records 
                ORDER BY score DESC, created_at DESC 
                LIMIT 100
            )
        `;
        
        this.db.run(sql, [], function(err) {
            if (err) {
                console.error('Ошибка очистки рекордов:', err.message);
                callback(err);
            } else {
                if (this.changes > 0) {
                    console.log(`Удалено ${this.changes} старых рекордов`);
                }
                callback(null);
            }
        });
    }

    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Ошибка закрытия БД:', err.message);
                } else {
                    console.log('Соединение с БД закрыто');
                }
            });
        }
    }
}

// ==================== ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ====================
const db = new Database();

// ==================== ХРАНИЛИЩЕ ИГРОКОВ И ИГР ====================
const players = new Map();
const games = new Map();

// ==================== ФУНКЦИИ ПРОВЕРКИ ПОЗИЦИЙ ====================

function isPositionInWall(x, y, walls) {
    if (!walls || walls.length === 0) return false;
    
    for (const wall of walls) {
        if (x >= wall.x && x < wall.x + wall.width &&
            y >= wall.y && y < wall.y + wall.height) {
            return true;
        }
    }
    return false;
}

function isPositionOccupied(x, y, game, excludeFoodIndex = -1) {
    // Проверяем змейки всех игроков
    for (let playerId of game.players) {
        const player = players.get(playerId);
        if (player && player.snake) {
            for (const segment of player.snake) {
                if (segment.x === x && segment.y === y) {
                    return true;
                }
            }
        }
    }
    
    // Проверяем еду (исключая текущую еду если нужно)
    if (game.foods) {
        for (let i = 0; i < game.foods.length; i++) {
            if (i === excludeFoodIndex) continue;
            const food = game.foods[i];
            if (food.x === x && food.y === y) {
                return true;
            }
        }
    }
    
    // Проверяем баффы
    if (game.buffs) {
        for (const buff of game.buffs) {
            if (buff.x === x && buff.y === y) {
                return true;
            }
        }
    }
    
    return false;
}

function isValidPosition(x, y, game) {
    // Проверяем границы
    if (x < 0 || x >= game.width || y < 0 || y >= game.height) {
        return false;
    }
    
    // Проверяем стены
    if (game.gameMode === 'walls' && game.walls) {
        if (isPositionInWall(x, y, game.walls)) {
            return false;
        }
    }
    
    // Проверяем занятость
    if (isPositionOccupied(x, y, game)) {
        return false;
    }
    
    return true;
}

// ==================== ФУНКЦИИ ГЕНЕРАЦИИ СЛУЧАЙНЫХ СТЕН ====================

function generateRandomWalls(width, height, fieldSize) {
    const walls = [];
    
    let wallCount;
    let maxWallLength;
    
    switch (fieldSize) {
        case 'small':
            wallCount = 4 + Math.floor(Math.random() * 3);
            maxWallLength = 4;
            break;
        case 'medium':
            wallCount = 6 + Math.floor(Math.random() * 4);
            maxWallLength = 5;
            break;
        case 'large':
            wallCount = 8 + Math.floor(Math.random() * 5);
            maxWallLength = 6;
            break;
        default:
            wallCount = 6;
            maxWallLength = 5;
    }
    
    console.log(`Генерация ${wallCount} стен для поля ${width}x${height}, размер: ${fieldSize}`);
    
    for (let i = 0; i < wallCount; i++) {
        let wall;
        let attempts = 0;
        let validWall = false;
        
        while (!validWall && attempts < 20) {
            attempts++;
            
            const isHorizontal = Math.random() > 0.5;
            
            if (isHorizontal) {
                const wallLength = 2 + Math.floor(Math.random() * (maxWallLength - 1));
                const x = Math.floor(Math.random() * (width - wallLength));
                const y = Math.floor(Math.random() * height);
                
                wall = { x, y, width: wallLength, height: 1 };
            } else {
                const wallLength = 2 + Math.floor(Math.random() * (maxWallLength - 1));
                const x = Math.floor(Math.random() * width);
                const y = Math.floor(Math.random() * (height - wallLength));
                
                wall = { x, y, width: 1, height: wallLength };
            }
            
            const centerX = Math.floor(width / 2);
            const centerY = Math.floor(height / 2);
            const startZoneRadius = 3;
            
            const wallBlocksStartZone = 
                wall.x <= centerX + startZoneRadius && 
                wall.x + wall.width >= centerX - startZoneRadius &&
                wall.y <= centerY + startZoneRadius && 
                wall.y + wall.height >= centerY - startZoneRadius;
            
            const intersectsWithExisting = walls.some(existingWall => 
                wall.x < existingWall.x + existingWall.width &&
                wall.x + wall.width > existingWall.x &&
                wall.y < existingWall.y + existingWall.height &&
                wall.y + wall.height > existingWall.y
            );
            
            if (!wallBlocksStartZone && !intersectsWithExisting) {
                validWall = true;
            }
        }
        
        if (validWall && wall) {
            walls.push(wall);
        }
    }
    
    addLShapedWalls(walls, width, height, fieldSize);
    
    console.log(`Сгенерировано ${walls.length} случайных стен`);
    return walls;
}

function addLShapedWalls(walls, width, height, fieldSize) {
    const lWallCount = fieldSize === 'small' ? 1 : fieldSize === 'medium' ? 2 : 3;
    
    for (let i = 0; i < lWallCount; i++) {
        let attempts = 0;
        let validLWall = false;
        
        while (!validLWall && attempts < 15) {
            attempts++;
            
            const baseX = Math.floor(Math.random() * (width - 3));
            const baseY = Math.floor(Math.random() * (height - 3));
            
            const orientation = Math.floor(Math.random() * 4);
            let lWalls = [];
            
            switch (orientation) {
                case 0:
                    lWalls = [
                        { x: baseX, y: baseY, width: 3, height: 1 },
                        { x: baseX, y: baseY + 1, width: 1, height: 2 }
                    ];
                    break;
                case 1:
                    lWalls = [
                        { x: baseX, y: baseY, width: 3, height: 1 },
                        { x: baseX + 2, y: baseY + 1, width: 1, height: 2 }
                    ];
                    break;
                case 2:
                    lWalls = [
                        { x: baseX, y: baseY + 2, width: 3, height: 1 },
                        { x: baseX, y: baseY, width: 1, height: 2 }
                    ];
                    break;
                case 3:
                    lWalls = [
                        { x: baseX, y: baseY + 2, width: 3, height: 1 },
                        { x: baseX + 2, y: baseY, width: 1, height: 2 }
                    ];
                    break;
            }
            
            const intersects = lWalls.some(newWall => 
                walls.some(existingWall =>
                    newWall.x < existingWall.x + existingWall.width &&
                    newWall.x + newWall.width > existingWall.x &&
                    newWall.y < existingWall.y + existingWall.height &&
                    newWall.y + newWall.height > existingWall.y
                )
            );
            
            const centerX = Math.floor(width / 2);
            const centerY = Math.floor(height / 2);
            const startZoneRadius = 3;
            
            const blocksStartZone = lWalls.some(wall =>
                wall.x <= centerX + startZoneRadius && 
                wall.x + wall.width >= centerX - startZoneRadius &&
                wall.y <= centerY + startZoneRadius && 
                wall.y + wall.height >= centerY - startZoneRadius
            );
            
            if (!intersects && !blocksStartZone) {
                walls.push(...lWalls);
                validLWall = true;
            }
        }
    }
}

// ==================== ФУНКЦИИ ГЕНЕРАЦИИ ЕДЫ И БАФФОВ ====================

function generateFood(game) {
    const types = [
        { points: 10, color: '#FF4444', type: 'apple' },
        { points: 20, color: '#FFA500', type: 'orange' },
        { points: 15, color: '#FFFF00', type: 'banana' }
    ];
    const type = types[Math.floor(Math.random() * types.length)];
    
    let x, y;
    let attempts = 0;
    let validPosition = false;
    
    // Сначала пытаемся найти случайную валидную позицию
    while (!validPosition && attempts < 100) {
        x = Math.floor(Math.random() * game.width);
        y = Math.floor(Math.random() * game.height);
        
        if (isValidPosition(x, y, game)) {
            validPosition = true;
        }
        
        attempts++;
    }
    
    // Если не нашли случайно, ищем последовательно
    if (!validPosition) {
        console.log(`Поиск валидной позиции для еды последовательно...`);
        for (x = 0; x < game.width && !validPosition; x++) {
            for (y = 0; y < game.height && !validPosition; y++) {
                if (isValidPosition(x, y, game)) {
                    validPosition = true;
                    break;
                }
            }
        }
    }
    
    // Если все еще не нашли, используем первую свободную позицию (игнорируя стены)
    if (!validPosition) {
        console.log(`Экстренный поиск позиции для еды (игнорируя стены)...`);
        for (x = 0; x < game.width && !validPosition; x++) {
            for (y = 0; y < game.height && !validPosition; y++) {
                if (!isPositionOccupied(x, y, game)) {
                    validPosition = true;
                    break;
                }
            }
        }
    }
    
    if (!validPosition) {
        console.log(`Не удалось найти валидную позицию для еды, использую случайную`);
        x = Math.floor(Math.random() * game.width);
        y = Math.floor(Math.random() * game.height);
    }
    
    console.log(`Создана еда в позиции (${x}, ${y}) в режиме ${game.gameMode}`);
    return {
        x: x,
        y: y,
        points: type.points,
        color: type.color,
        type: type.type
    };
}

function generateBuff(buffType, game) {
    const buffConfig = GAME_CONFIG.BUFFS[buffType.toUpperCase()];
    if (!buffConfig) return null;
    
    let x, y;
    let attempts = 0;
    let validPosition = false;
    
    while (!validPosition && attempts < 100) {
        x = Math.floor(Math.random() * (game.width - 2)) + 1;
        y = Math.floor(Math.random() * (game.height - 2)) + 1;
        
        if (isValidPosition(x, y, game)) {
            validPosition = true;
        }
        
        attempts++;
    }
    
    if (!validPosition) {
        console.log(`Не удалось найти валидную позицию для баффа`);
        return null;
    }
    
    return {
        x: x,
        y: y,
        type: buffConfig.type,
        duration: buffConfig.duration,
        color: buffConfig.color,
        points: buffConfig.points
    };
}

function generateFoods(game, count) {
    const foods = [];
    
    for (let i = 0; i < count; i++) {
        const food = generateFood(game);
        foods.push(food);
    }
    
    console.log(`Сгенерировано ${foods.length} единиц еды для игры ${game.id}`);
    return foods;
}

// ==================== ОСНОВНЫЕ ФУНКЦИИ ИГРЫ ====================

function getGame(gameMode, fieldSize) {
    const gameId = `${gameMode}_${fieldSize}`;
    
    if (!games.get(gameId)) {
        const config = GAME_CONFIG.FIELD_SIZES[fieldSize.toUpperCase()];
        
        const walls = gameMode === 'walls' ? 
            generateRandomWalls(config.width, config.height, fieldSize) : [];
        
        const newGame = {
            id: gameId,
            gameMode: gameMode,
            fieldSize: fieldSize,
            width: config.width,
            height: config.height,
            gridSize: config.gridSize,
            foods: [],
            buffs: [],
            players: new Set(),
            walls: walls
        };
        
        games.set(gameId, newGame);
        
        newGame.foods = generateFoods(newGame, 10);
        
        console.log(`Создана новая игра: ${gameId} со ${walls.length} стенами`);
    }
    return games.get(gameId);
}

function resetPlayer(player) {
    const game = getGame(player.gameMode, player.fieldSize);
    if (!game) return;
    
    let startX, startY;
    let attempts = 0;
    let validPosition = false;
    
    while (!validPosition && attempts < 100) {
        startX = Math.floor(Math.random() * (game.width - 6)) + 3;
        startY = Math.floor(Math.random() * (game.height - 6)) + 3;
        validPosition = true;
        
        const snakeSegments = [
            { x: startX, y: startY },
            { x: startX - 1, y: startY },
            { x: startX - 2, y: startY }
        ];
        
        for (const segment of snakeSegments) {
            if (!isValidPosition(segment.x, segment.y, game)) {
                validPosition = false;
                break;
            }
        }
        
        attempts++;
    }
    
    if (!validPosition) {
        console.log(`Не удалось найти валидную стартовую позицию, использую центр`);
        startX = Math.floor(game.width / 2);
        startY = Math.floor(game.height / 2);
    }
    
    player.snake = [
        { x: startX, y: startY },
        { x: startX - 1, y: startY },
        { x: startX - 2, y: startY }
    ];
    player.direction = { dx: 1, dy: 0 };
    player.score = 0;
    player.foodEaten = 0;
    player.recordSaved = false;
    player.isAlive = true;
    
    player.activeBuffs.clear();
    player.buffExpireTimers.forEach(timer => clearTimeout(timer));
    player.buffExpireTimers.clear();
    
    console.log(`Игрок ${player.name} создан в позиции (${startX}, ${startY})`);
}

function generatePlayerId() {
    return Math.random().toString(36).substr(2, 9);
}

function generateRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// ==================== HTTP СЕРВЕР ====================
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    if (pathname === '/api/records' && method === 'GET') {
        const limit = parseInt(parsedUrl.query.limit) || 10;
        const gameMode = parsedUrl.query.mode || 'classic';
        const fieldSize = parsedUrl.query.size || 'medium';
        
        db.getTopRecords(limit, gameMode, fieldSize, (err, records) => {
            if (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Ошибка базы данных' 
                }));
                return;
            }
            
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(JSON.stringify({
                success: true,
                records: records,
                total: records.length,
                gameMode: gameMode,
                fieldSize: fieldSize
            }));
        });
        return;
    }
    
    if (pathname === '/api/records' && method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            try {
                const recordData = JSON.parse(body);
                
                if (!recordData.playerName || !recordData.score) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: 'Отсутствуют обязательные поля: playerName, score' 
                    }));
                    return;
                }
                
                const gameMode = recordData.gameMode || 'classic';
                const fieldSize = recordData.fieldSize || 'medium';
                
                db.addRecord(
                    recordData.playerName,
                    recordData.score,
                    recordData.snakeLength || 1,
                    recordData.foodEaten || Math.floor(recordData.score / 10),
                    gameMode,
                    fieldSize,
                    (err, recordId) => {
                        if (err) {
                            res.statusCode = 500;
                            res.setHeader('Content-Type', 'application/json');
                            res.setHeader('Access-Control-Allow-Origin', '*');
                            res.end(JSON.stringify({ 
                                success: false, 
                                error: 'Ошибка базы данных' 
                            }));
                            return;
                        }
                        
                        if (recordId === null) {
                            res.statusCode = 200;
                            res.setHeader('Content-Type', 'application/json');
                            res.setHeader('Access-Control-Allow-Origin', '*');
                            res.end(JSON.stringify({ 
                                success: true,
                                message: 'Дубликат рекорда (уже сохранен ранее)'
                            }));
                        } else {
                            res.statusCode = 200;
                            res.setHeader('Content-Type', 'application/json');
                            res.setHeader('Access-Control-Allow-Origin', '*');
                            res.end(JSON.stringify({ 
                                success: true,
                                message: 'Рекорд сохранен',
                                recordId: recordId
                            }));
                            
                            db.cleanupOldRecords((err) => {
                                if (err) {
                                    console.error('Ошибка очистки рекордов:', err);
                                }
                            });
                        }
                    }
                );
                
            } catch (error) {
                console.error('Ошибка парсинга JSON:', error);
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'Неверный формат JSON' 
                }));
            }
        });
        return;
    }
    
    if (method === 'OPTIONS') {
        res.statusCode = 200;
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.end();
        return;
    }

    let filePath = pathname === '/' ? 'public/verstka.html' : pathname;
    filePath = path.join(__dirname, filePath);
    
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(`
                <!DOCTYPE html>
                <html>
                <head><title>404</title></head>
                <body>
                    <h1>404 - Страница не найдена</h1>
                    <a href="/">Вернуться к игре</a>
                </body>
                </html>
            `);
            return;
        }
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.statusCode = 500;
                res.end('Ошибка сервера');
                return;
            }
            
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.ico': 'image/x-icon'
            };
            const mimeType = mimeTypes[ext] || 'text/plain';
            
            res.statusCode = 200;
            res.setHeader('Content-Type', mimeType);
            
            if (mimeType === 'text/html') {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
            }
            
            res.end(data);
        });
    });
});

// ==================== WEB SOCKET СЕРВЕР ====================
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    console.log('Новое WebSocket соединение');
    
    const playerId = generatePlayerId();
    let playerName = `Игрок${Math.floor(Math.random() * 1000)}`;
    
    const player = {
        id: playerId,
        name: playerName,
        ws: ws,
        gameMode: 'classic',
        fieldSize: 'medium',
        snake: [],
        direction: { dx: 1, dy: 0 },
        score: 0,
        color: generateRandomColor(),
        ip: req.socket.remoteAddress,
        recordSaved: false,
        activeBuffs: new Map(),
        buffExpireTimers: new Map(),
        isAlive: true,
        foodEaten: 0
    };
    
    players.set(playerId, player);
    
    resetPlayer(player);
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleWebSocketMessage(player, message);
        } catch (error) {
            console.error('Ошибка парсинга сообщения:', error);
        }
    });

    ws.on('close', () => {
        console.log(`Игрок ${player.name} отключился`);
        
        player.buffExpireTimers.forEach(timer => clearTimeout(timer));
        
        const game = getGame(player.gameMode, player.fieldSize);
        if (game) {
            game.players.delete(playerId);
        }
        
        players.delete(playerId);
        
        broadcastToGame(player.gameMode, player.fieldSize, {
            type: 'player_left',
            playerId: playerId,
            playerName: player.name,
            players: getPlayersList(player.gameMode, player.fieldSize)
        });
    });
    
    ws.on('error', (error) => {
        console.error(`WebSocket ошибка у игрока ${player.name}:`, error);
    });
});

// ==================== ОБРАБОТКА WEB SOCKET СООБЩЕНИЙ ====================

function handleWebSocketMessage(player, message) {
    switch (message.type) {
        case 'join_game':
            handleJoinGame(player, message);
            break;
        case 'player_move':
            if (player.isAlive) {
                handlePlayerMove(player, message);
            }
            break;
        case 'chat_message':
            handleChatMessage(player, message);
            break;
        case 'change_game_mode':
            handleChangeGameMode(player, message.mode);
            break;
        case 'change_field_size':
            handleChangeFieldSize(player, message.size);
            break;
        case 'restart_game':
            handleRestartGame(player);
            break;
    }
}

function handleJoinGame(player, message) {
    if (message.playerName) {
        player.name = message.playerName;
    }
    
    if (message.gameMode && GAME_CONFIG.MODES[message.gameMode.toUpperCase()]) {
        player.gameMode = message.gameMode;
    }
    
    if (message.fieldSize && GAME_CONFIG.FIELD_SIZES[message.fieldSize.toUpperCase()]) {
        player.fieldSize = message.fieldSize;
    }
    
    const newGame = getGame(player.gameMode, player.fieldSize);
    if (newGame) {
        const oldGameId = `${player.gameMode}_${player.fieldSize}`;
        const oldGame = games.get(oldGameId);
        if (oldGame) {
            oldGame.players.delete(player.id);
        }
        newGame.players.add(player.id);
        
        resetPlayer(player);
    }
    
    player.ws.send(JSON.stringify({
        type: 'game_joined',
        playerId: player.id,
        playerName: player.name,
        gameMode: player.gameMode,
        fieldSize: player.fieldSize,
        gameState: getGameState(player.gameMode, player.fieldSize)
    }));
    
    broadcastToGame(player.gameMode, player.fieldSize, {
        type: 'player_joined',
        playerId: player.id,
        playerName: player.name,
        players: getPlayersList(player.gameMode, player.fieldSize)
    });
    
    console.log(`Игрок ${player.name} присоединился к режиму ${player.gameMode}, размер ${player.fieldSize}`);
}

function handlePlayerMove(player, message) {
    if (!message.direction || !player.isAlive) return;
    
    const newDirection = message.direction;
    if ((player.direction.dx !== 0 && newDirection.dx === -player.direction.dx) ||
        (player.direction.dy !== 0 && newDirection.dy === -player.direction.dy)) {
        return;
    }
    
    player.direction = newDirection;
    
    const game = getGame(player.gameMode, player.fieldSize);
    if (!game) return;
    
    const head = player.snake[0];
    const newHead = {
        x: head.x + player.direction.dx,
        y: head.y + player.direction.dy
    };
    
    if (player.gameMode === 'classic') {
        if (newHead.x < 0) newHead.x = game.width - 1;
        if (newHead.x >= game.width) newHead.x = 0;
        if (newHead.y < 0) newHead.y = game.height - 1;
        if (newHead.y >= game.height) newHead.y = 0;
    } else {
        if (newHead.x < 0 || newHead.x >= game.width || newHead.y < 0 || newHead.y >= game.height) {
            handlePlayerDeath(player);
            return;
        }
    }
    
    if (player.gameMode === 'walls' && game.walls) {
        for (const wall of game.walls) {
            if (newHead.x >= wall.x && newHead.x < wall.x + wall.width &&
                newHead.y >= wall.y && newHead.y < wall.y + wall.height) {
                console.log(`Игрок ${player.name} врезался в стену в позиции (${newHead.x}, ${newHead.y})`);
                handlePlayerDeath(player);
                return;
            }
        }
    }
    
    for (let i = 0; i < player.snake.length; i++) {
        if (player.snake[i].x === newHead.x && player.snake[i].y === newHead.y) {
            handlePlayerDeath(player);
            return;
        }
    }
    
    let ateFood = false;
    const foodIndex = game.foods.findIndex(food => 
        food.x === newHead.x && food.y === newHead.y
    );
    
    if (foodIndex !== -1) {
        const food = game.foods[foodIndex];
        
        const pointsMultiplier = player.activeBuffs.has('double_points') ? 2 : 1;
        const pointsEarned = food.points * pointsMultiplier;
        
        player.score += pointsEarned;
        player.foodEaten += 1;
        ateFood = true;
        
        game.foods.splice(foodIndex, 1);
        // ВАЖНО: Создаем новую еду с учетом текущей игры
        const newFood = generateFood(game);
        game.foods.push(newFood);
        console.log(`Создана новая еда в позиции (${newFood.x}, ${newFood.y})`);
        
        player.ws.send(JSON.stringify({
            type: 'score_update',
            score: player.score,
            pointsEarned: pointsEarned,
            multiplier: pointsMultiplier,
            foodEaten: player.foodEaten
        }));
        
        if (player.score >= GAME_CONFIG.BUFFS.DOUBLE_POINTS.spawnScore && 
            !game.buffs.some(buff => buff.type === 'double_points')) {
            const newBuff = generateBuff('double_points', game);
            if (newBuff) {
                game.buffs.push(newBuff);
                console.log(`Бафф удвоения очков появился в позиции (${newBuff.x}, ${newBuff.y})`);
            }
        }
        
        broadcastToGame(player.gameMode, player.fieldSize, {
            type: 'players_update',
            players: getPlayersList(player.gameMode, player.fieldSize)
        });
    }
    
    const buffIndex = game.buffs.findIndex(buff => 
        buff.x === newHead.x && buff.y === newHead.y
    );
    
    if (buffIndex !== -1) {
        const buff = game.buffs[buffIndex];
        applyBuff(player, buff);
        game.buffs.splice(buffIndex, 1);
        
        player.ws.send(JSON.stringify({
            type: 'buff_collected',
            buffType: buff.type,
            duration: buff.duration
        }));
        
        console.log(`Игрок ${player.name} подобрал бафф ${buff.type}`);
    }
    
    player.snake.unshift(newHead);
    
    if (!ateFood) {
        player.snake.pop();
    }
    
    broadcastGameState(player.gameMode, player.fieldSize);
}

function applyBuff(player, buff) {
    const now = Date.now();
    const expireTime = now + buff.duration;
    
    player.activeBuffs.set(buff.type, expireTime);
    
    const timer = setTimeout(() => {
        player.activeBuffs.delete(buff.type);
        player.buffExpireTimers.delete(buff.type);
        
        player.ws.send(JSON.stringify({
            type: 'buff_expired',
            buffType: buff.type
        }));
        
        console.log(`Бафф ${buff.type} у игрока ${player.name} закончился`);
    }, buff.duration);
    
    player.buffExpireTimers.set(buff.type, timer);
}

function handleChatMessage(player, message) {
    if (!message.text || message.text.trim() === '') return;
    
    broadcastToGame(player.gameMode, player.fieldSize, {
        type: 'chat_message',
        playerId: player.id,
        playerName: player.name,
        message: message.text.trim(),
        timestamp: Date.now()
    });
}

function handlePlayerDeath(player) {
    if (!player.isAlive) return;
    
    console.log(`Игрок ${player.name} умер со счетом ${player.score} в режиме ${player.gameMode}, размер ${player.fieldSize}`);
    player.isAlive = false;
    
    if (player.score > 0 && !player.recordSaved) {
        const snakeLength = player.snake.length;
        const foodEaten = player.foodEaten;
        
        db.addRecord(player.name, player.score, snakeLength, foodEaten, player.gameMode, player.fieldSize, (err, recordId) => {
            if (err) {
                console.error('Ошибка сохранения рекорда:', err);
            } else if (recordId) {
                player.recordSaved = true;
                console.log(`Рекорд сохранен в БД (ID: ${recordId}, режим: ${player.gameMode}, размер: ${player.fieldSize})`);
            } else {
                console.log('Дубликат рекорда, не сохраняем');
            }
        });
    }
    
    player.ws.send(JSON.stringify({
        type: 'player_died',
        score: player.score
    }));
    
    broadcastToGame(player.gameMode, player.fieldSize, {
        type: 'player_died',
        playerId: player.id,
        playerName: player.name,
        score: player.score
    });
    
    setTimeout(() => {
        resetPlayer(player);
        player.isAlive = true;
        
        player.ws.send(JSON.stringify({
            type: 'player_respawn'
        }));
        
        broadcastToGame(player.gameMode, player.fieldSize, {
            type: 'players_update',
            players: getPlayersList(player.gameMode, player.fieldSize)
        });
        
        broadcastGameState(player.gameMode, player.fieldSize);
    }, 2000);
}

function handleChangeGameMode(player, newMode) {
    if (!GAME_CONFIG.MODES[newMode.toUpperCase()]) return;
    
    console.log(`Игрок ${player.name} меняет режим с ${player.gameMode} на ${newMode}`);
    
    const oldGame = getGame(player.gameMode, player.fieldSize);
    if (oldGame) {
        oldGame.players.delete(player.id);
        broadcastToGame(player.gameMode, player.fieldSize, {
            type: 'player_left',
            playerId: player.id,
            playerName: player.name,
            players: getPlayersList(player.gameMode, player.fieldSize)
        });
    }
    
    player.gameMode = newMode;
    const newGame = getGame(newMode, player.fieldSize);
    if (newGame) {
        newGame.players.add(player.id);
        resetPlayer(player);
        
        player.ws.send(JSON.stringify({
            type: 'game_mode_changed',
            gameMode: newMode,
            fieldSize: player.fieldSize,
            gameState: getGameState(newMode, player.fieldSize)
        }));
        
        broadcastToGame(newMode, player.fieldSize, {
            type: 'player_joined',
            playerId: player.id,
            playerName: player.name,
            players: getPlayersList(newMode, player.fieldSize)
        });
    }
}

function handleChangeFieldSize(player, newSize) {
    if (!GAME_CONFIG.FIELD_SIZES[newSize.toUpperCase()]) return;
    
    console.log(`Игрок ${player.name} меняет размер поля с ${player.fieldSize} на ${newSize}`);
    
    const oldGame = getGame(player.gameMode, player.fieldSize);
    if (oldGame) {
        oldGame.players.delete(player.id);
        broadcastToGame(player.gameMode, player.fieldSize, {
            type: 'player_left',
            playerId: player.id,
            playerName: player.name,
            players: getPlayersList(player.gameMode, player.fieldSize)
        });
    }
    
    player.fieldSize = newSize;
    const newGame = getGame(player.gameMode, newSize);
    if (newGame) {
        newGame.players.add(player.id);
        resetPlayer(player);
        
        player.ws.send(JSON.stringify({
            type: 'field_size_changed',
            gameMode: player.gameMode,
            fieldSize: newSize,
            gameState: getGameState(player.gameMode, newSize)
        }));
        
        broadcastToGame(player.gameMode, newSize, {
            type: 'player_joined',
            playerId: player.id,
            playerName: player.name,
            players: getPlayersList(player.gameMode, newSize)
        });
    }
}

function handleRestartGame(player) {
    console.log(`Игрок ${player.name} перезапускает игру`);
    
    if (player.gameMode === 'walls') {
        regenerateWalls(player.gameMode, player.fieldSize);
    }
    
    resetPlayer(player);
    
    player.ws.send(JSON.stringify({
        type: 'game_restarted',
        gameState: getGameState(player.gameMode, player.fieldSize)
    }));
    
    broadcastToGame(player.gameMode, player.fieldSize, {
        type: 'players_update',
        players: getPlayersList(player.gameMode, player.fieldSize)
    });
    
    broadcastGameState(player.gameMode, player.fieldSize);
}

function regenerateWalls(gameMode, fieldSize) {
    if (gameMode !== 'walls') return;
    
    const gameId = `${gameMode}_${fieldSize}`;
    const game = games.get(gameId);
    
    if (game) {
        const config = GAME_CONFIG.FIELD_SIZES[fieldSize.toUpperCase()];
        const newWalls = generateRandomWalls(config.width, config.height, fieldSize);
        
        game.walls = newWalls;
        
        console.log(`Перегенерированы стены для игры ${gameId}: ${newWalls.length} стен`);
        
        broadcastGameState(gameMode, fieldSize);
    }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function getGameState(gameMode, fieldSize) {
    const game = getGame(gameMode, fieldSize);
    if (!game) return { foods: [], players: [], walls: [], buffs: [], width: 20, height: 20, gridSize: 20 };
    
    const gamePlayers = [];
    for (let playerId of game.players) {
        const player = players.get(playerId);
        if (player && player.ws.readyState === WebSocket.OPEN) {
            gamePlayers.push({
                id: player.id,
                name: player.name,
                snake: player.snake,
                score: player.score,
                color: player.color,
                activeBuffs: Array.from(player.activeBuffs.keys())
            });
        }
    }
    
    return {
        foods: game.foods,
        players: gamePlayers,
        walls: game.walls || [],
        buffs: game.buffs || [],
        width: game.width,
        height: game.height,
        gridSize: game.gridSize
    };
}

function getPlayersList(gameMode, fieldSize) {
    const playersList = [];
    const game = getGame(gameMode, fieldSize);
    if (!game) return playersList;
    
    for (let playerId of game.players) {
        const player = players.get(playerId);
        if (player && player.ws.readyState === WebSocket.OPEN) {
            playersList.push({
                id: player.id,
                name: player.name,
                score: player.score,
                color: player.color,
                activeBuffs: Array.from(player.activeBuffs.keys())
            });
        }
    }
    
    return playersList.sort((a, b) => b.score - a.score);
}

function broadcastToGame(gameMode, fieldSize, message) {
    const game = getGame(gameMode, fieldSize);
    if (!game) return;
    
    for (let playerId of game.players) {
        const player = players.get(playerId);
        if (player && player.ws.readyState === WebSocket.OPEN) {
            try {
                player.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error(`Ошибка отправки игроку ${player.name}:`, error);
            }
        }
    }
}

function broadcastGameState(gameMode, fieldSize) {
    broadcastToGame(gameMode, fieldSize, {
        type: 'game_state',
        ...getGameState(gameMode, fieldSize)
    });
}

function getLocalIP() {
    const interfaces = require('os').networkInterfaces();
    for (let name of Object.keys(interfaces)) {
        for (let interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    return 'localhost';
}

// ==================== ЗАПУСК СЕРВЕРА ====================

server.listen(port, hostname, () => {
    const localIP = getLocalIP();
    console.log('='.repeat(70));
    console.log('МУЛЬТИПЛЕЕР ЗМЕЙКА ЗАПУЩЕНА!');
    console.log('='.repeat(70));
    console.log(`Локальный доступ: http://localhost:${port}/`);
    console.log(`Сетевой доступ:   http://${localIP}:${port}/`);
    console.log('Режимы игры: Classic, Walls');
    console.log('Размеры поля: Small (15x15), Medium (20x20), Large (25x25)');
    console.log('Баффы: Удвоение очков (появляется после 100 очков)');
    console.log('Механика: Змейка растет при съедании еды');
    console.log('='.repeat(70));
});

process.on('SIGINT', () => {
    console.log('\nСервер останавливается...');
    server.close(() => {
        console.log('Сервер успешно остановлен');
        db.close();
        process.exit(0);
    });
});