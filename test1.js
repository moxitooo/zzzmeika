// test_database.js
const Database = require('./database.js');

const db = new Database();

setTimeout(() => {
    runTests();
}, 1000);

async function runTests() {
    console.log('Начало тестирования базы данных...\n');

    try {
        await testAddRecords();
        await testGetTopRecords();
        await testGetPlayerRecords();
        await testGetPlayerBest();
        await testGetPlayerRank();
        await testGetStats();
        await testDuplicateRecords();
        await testCleanup();
        
        console.log('Все тесты завершены успешно!');
        
    } catch (error) {
        console.error('Ошибка при тестировании:', error);
    } finally {
        setTimeout(() => {
            db.close();
        }, 500);
    }
}

function testAddRecords() {
    return new Promise((resolve, reject) => {
        console.log('1. Тестирование добавления рекордов');
        
        const testRecords = [
            { name: 'Player1', score: 100, length: 5, food: 10 },
            { name: 'Player2', score: 150, length: 7, food: 15 },
            { name: 'Player3', score: 80, length: 4, food: 8 },
            { name: 'Player1', score: 200, length: 10, food: 20 },
            { name: 'Player4', score: 300, length: 15, food: 30 }
        ];

        let completed = 0;
        
        testRecords.forEach(record => {
            db.addRecord(record.name, record.score, record.length, record.food, (err, id) => {
                if (err) {
                    console.error('Ошибка добавления рекорда ' + record.name + ':', err.message);
                    reject(err);
                    return;
                }
                
                if (id) {
                    console.log('Добавлен рекорд: ' + record.name + ' - ' + record.score + ' очков (ID: ' + id + ')');
                }
                
                completed++;
                if (completed === testRecords.length) {
                    console.log('Все рекорды добавлены\n');
                    resolve();
                }
            });
        });
    });
}

function testGetTopRecords() {
    return new Promise((resolve, reject) => {
        console.log('2. Тестирование получения топ-рекордов');
        
        db.getTopRecords(3, (err, records) => {
            if (err) {
                console.error('Ошибка получения топ-рекордов:', err.message);
                reject(err);
                return;
            }
            
            console.log('Получено ' + records.length + ' топ-рекордов:');
            records.forEach((record, index) => {
                console.log((index + 1) + '. ' + record.player_name + ' - ' + record.score + ' очков');
            });
            console.log();
            resolve();
        });
    });
}

function testGetPlayerRecords() {
    return new Promise((resolve, reject) => {
        console.log('3. Тестирование получения рекордов игрока');
        
        db.getPlayerRecords('Player1', (err, records) => {
            if (err) {
                console.error('Ошибка получения рекордов игрока:', err.message);
                reject(err);
                return;
            }
            
            console.log('Рекорды Player1 (' + records.length + ' записей):');
            records.forEach(record => {
                console.log('- ' + record.score + ' очков, длина: ' + record.snake_length + ', еда: ' + record.food_eaten);
            });
            console.log();
            resolve();
        });
    });
}

function testGetPlayerBest() {
    return new Promise((resolve, reject) => {
        console.log('4. Тестирование получения лучшего рекорда');
        
        db.getPlayerBest('Player1', (err, record) => {
            if (err) {
                console.error('Ошибка получения лучшего рекорда:', err.message);
                reject(err);
                return;
            }
            
            if (record) {
                console.log('Лучший рекорд Player1: ' + record.score + ' очков');
            } else {
                console.log('Рекорды не найдены');
            }
            console.log();
            resolve();
        });
    });
}

function testGetPlayerRank() {
    return new Promise((resolve, reject) => {
        console.log('5. Тестирование получения позиции в рейтинге');
        
        db.getPlayerRank('Player1', (err, rank) => {
            if (err) {
                console.error('Ошибка получения позиции:', err.message);
                reject(err);
                return;
            }
            
            console.log('Позиция Player1 в рейтинге: ' + rank);
            console.log();
            resolve();
        });
    });
}

function testGetStats() {
    return new Promise((resolve, reject) => {
        console.log('6. Тестирование получения статистики');
        
        db.getStats((err, stats) => {
            if (err) {
                console.error('Ошибка получения статистики:', err.message);
                reject(err);
                return;
            }
            
            console.log('Статистика:');
            console.log('- Всего записей: ' + stats.total_records);
            console.log('- Уникальных игроков: ' + stats.unique_players);
            console.log('- Лучший счет: ' + stats.best_score);
            console.log('- Средний счет: ' + Math.round(stats.average_score));
            console.log();
            resolve();
        });
    });
}

function testDuplicateRecords() {
    return new Promise((resolve, reject) => {
        console.log('7. Тестирование защиты от дубликатов');
        
        db.addRecord('Player1', 200, 10, 20, (err, id) => {
            if (err) {
                console.error('Ошибка при тесте дубликатов:', err.message);
                reject(err);
                return;
            }
            
            if (id === null) {
                console.log('Дубликат успешно отклонен');
            } else {
                console.log('Дубликат был добавлен');
            }
            console.log();
            resolve();
        });
    });
}

function testCleanup() {
    return new Promise((resolve, reject) => {
        console.log('8. Тестирование очистки старых рекордов');
        
        const addPromises = [];
        for (let i = 0; i < 10; i++) {
            addPromises.push(new Promise((resolveAdd) => {
                db.addRecord('TestPlayer' + i, 50 + i, 3, 5, (err) => {
                    resolveAdd();
                });
            }));
        }
        
        Promise.all(addPromises).then(() => {
            db.cleanupOldRecords((err) => {
                if (err) {
                    console.error('Ошибка очистки:', err.message);
                    reject(err);
                    return;
                }
                
                console.log('Очистка завершена');
                
                db.getTopRecords(100, (err, records) => {
                    if (err) {
                        console.error('Ошибка проверки:', err.message);
                        reject(err);
                        return;
                    }
                    
                    console.log('Осталось записей после очистки: ' + records.length);
                    console.log();
                    resolve();
                });
            });
        });
    });
}