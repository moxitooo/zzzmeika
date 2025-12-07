const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ==================== КЛАСС БАЗЫ ДАННЫХ SQLite ====================
class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'records.db');
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        
        this.db.run(sql, (err) => {
            if (err) {
                console.error('Ошибка создания таблицы:', err.message);
            } else {
                console.log('Таблица records готова');
                // Проверяем структуру таблицы
                this.checkTableStructure();
            }
        });
    }

    // Проверка структуры таблицы
    checkTableStructure() {
        this.db.all("PRAGMA table_info(records)", (err, rows) => {
            if (err) {
                console.error('Ошибка проверки структуры таблицы:', err);
                return;
            }
            console.log('Структура таблицы records:');
            rows.forEach(row => {
                console.log(`- ${row.name} (${row.type})`);
            });
        });
    }

    // Добавление нового рекорда
    addRecord(playerName, score, snakeLength, foodEaten, gameMode = 'classic', callback) {
        // Проверяем, нет ли уже такого же рекорда у игрока
        const checkSql = `SELECT id FROM records WHERE player_name = ? AND score = ? AND game_mode = ?`;
        
        this.db.get(checkSql, [playerName, score, gameMode], (err, row) => {
            if (err) {
                console.error('Ошибка проверки дубликата:', err.message);
                callback(err, null);
                return;
            }

            if (row) {
                console.log(`Дубликат рекорда: ${playerName} - ${score} очков (${gameMode})`);
                callback(null, null);
                return;
            }

            // Добавляем новый рекорд
            const insertSql = `
                INSERT INTO records (player_name, score, snake_length, food_eaten, game_mode)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            this.db.run(insertSql, [playerName, score, snakeLength, foodEaten, gameMode], function(err) {
                if (err) {
                    console.error('Ошибка добавления рекорда:', err.message);
                    callback(err, null);
                } else {
                    console.log(`Рекорд добавлен: ${playerName} - ${score} очков (${gameMode})`);
                    callback(null, this.lastID);
                }
            });
        });
    }

    // Получение топ-N рекордов для определенного режима
    getTopRecords(limit = 10, gameMode = 'classic', callback) {
        const sql = `
            SELECT * FROM records 
            WHERE game_mode = ?
            ORDER BY score DESC, created_at DESC 
            LIMIT ?
        `;
        
        this.db.all(sql, [gameMode, limit], (err, rows) => {
            if (err) {
                console.error('Ошибка получения рекордов:', err.message);
                callback(err, []);
            } else {
                console.log(`Получено ${rows.length} рекордов для режима ${gameMode}`);
                callback(null, rows);
            }
        });
    }

    // Удаление старых рекордов
    cleanupOldRecords(callback) {
        const sql = `
            DELETE FROM records 
            WHERE id NOT IN (
                SELECT id FROM records 
                ORDER BY score DESC, created_at DESC 
                LIMIT 50
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

module.exports = Database;