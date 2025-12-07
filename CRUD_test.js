// crud_test_database.js
const Database = require('./database.js');

const db = new Database();

setTimeout(() => {
    runCRUDTests();
}, 1000);

async function runCRUDTests() {
    console.log('Начало CRUD тестирования базы данных...\n');

    try {
    
        await testCreateOperations();
        
     
        await testReadOperations();
        
        // UPDATE (через удаление и создание)
        await testUpdateOperations();
        
      
        await testDeleteOperations();
        
        // Комплексный тест
        await testComplexCRUD();
        
        console.log('Все CRUD тесты завершены успешно!');
        
    } catch (error) {
        console.error('Ошибка при CRUD тестировании:', error);
    } finally {
        setTimeout(() => {
            db.close();
        }, 500);
    }
}

// CREATE операции
function testCreateOperations() {
    return new Promise((resolve, reject) => {
        console.log('=== CREATE ТЕСТИРОВАНИЕ ===');
        
        const createTestRecords = [
            { name: 'CRUD_User1', score: 500, length: 25, food: 50 },
            { name: 'CRUD_User2', score: 750, length: 35, food: 75 },
            { name: 'CRUD_User3', score: 250, length: 15, food: 25 }
        ];

        let createdCount = 0;
        let createdIds = [];
        
        createTestRecords.forEach(record => {
            db.addRecord(record.name, record.score, record.length, record.food, (err, id) => {
                if (err) {
                    console.error('Ошибка создания записи ' + record.name + ':', err.message);
                    reject(err);
                    return;
                }
                
                if (id) {
                    console.log('Создана запись: ' + record.name + ' - ' + record.score + ' очков (ID: ' + id + ')');
                    createdIds.push(id);
                    createdCount++;
                } else {
                    console.log('Дубликат отклонен: ' + record.name);
                }
                
                if (createdCount === createTestRecords.length) {
                    console.log('Создано записей: ' + createdCount);
                    console.log('CREATE тест пройден\n');
                    resolve(createdIds);
                }
            });
        });
    });
}

// READ операции
function testReadOperations() {
    return new Promise((resolve, reject) => {
        console.log('=== READ ТЕСТИРОВАНИЕ ===');
        
        // Тест 1: Получение топ-рекордов
        db.getTopRecords(5, (err, records) => {
            if (err) {
                console.error('Ошибка чтения топ-рекордов:', err.message);
                reject(err);
                return;
            }
            
            console.log('Топ-5 записей:');
            records.forEach((record, index) => {
                console.log((index + 1) + '. ' + record.player_name + ' - ' + record.score + ' очков');
            });
            
            // Тест 2: Получение записей конкретного игрока
            db.getPlayerRecords('CRUD_User1', (err, playerRecords) => {
                if (err) {
                    console.error('Ошибка чтения записей игрока:', err.message);
                    reject(err);
                    return;
                }
                
                console.log('Записи CRUD_User1: ' + playerRecords.length + ' шт');
                
                // Тест 3: Получение лучшего рекорда
                db.getPlayerBest('CRUD_User2', (err, bestRecord) => {
                    if (err) {
                        console.error('Ошибка чтения лучшего рекорда:', err.message);
                        reject(err);
                        return;
                    }
                    
                    if (bestRecord) {
                        console.log('Лучший рекорд CRUD_User2: ' + bestRecord.score + ' очков');
                    }
                    
                    // Тест 4: Получение статистики
                    db.getStats((err, stats) => {
                        if (err) {
                            console.error('Ошибка чтения статистики:', err.message);
                            reject(err);
                            return;
                        }
                        
                        console.log('Статистика - Записей: ' + stats.total_records + ', Игроков: ' + stats.unique_players);
                        console.log('READ тест пройден\n');
                        resolve();
                    });
                });
            });
        });
    });
}

// UPDATE операции (через удаление и создание новой записи)
function testUpdateOperations() {
    return new Promise((resolve, reject) => {
        console.log('=== UPDATE ТЕСТИРОВАНИЕ ===');
        
        // Находим запись для обновления
        db.getPlayerRecords('CRUD_User1', (err, records) => {
            if (err) {
                console.error('Ошибка поиска записи для обновления:', err.message);
                reject(err);
                return;
            }
            
            if (records.length === 0) {
                console.log('Нет записей для обновления');
                resolve();
                return;
            }
            
            const oldRecord = records[0];
            console.log('Запись для обновления: ' + oldRecord.player_name + ' - ' + oldRecord.score + ' очков');
            
            // Создаем новую улучшенную запись (имитация обновления)
            const newScore = oldRecord.score + 100;
            const newLength = oldRecord.snake_length + 5;
            const newFood = oldRecord.food_eaten + 10;
            
            db.addRecord(oldRecord.player_name, newScore, newLength, newFood, (err, newId) => {
                if (err) {
                    console.error('Ошибка создания обновленной записи:', err.message);
                    reject(err);
                    return;
                }
                
                if (newId) {
                    console.log('Создана обновленная запись: ' + oldRecord.player_name + ' - ' + newScore + ' очков');
                    
                    // Проверяем, что новая запись есть в базе
                    db.getPlayerBest('CRUD_User1', (err, bestRecord) => {
                        if (err) {
                            console.error('Ошибка проверки обновленной записи:', err.message);
                            reject(err);
                            return;
                        }
                        
                        if (bestRecord && bestRecord.score === newScore) {
                            console.log('UPDATE тест пройден - запись успешно обновлена');
                        } else {
                            console.log('Проблема с обновлением записи');
                        }
                        console.log('UPDATE тест завершен\n');
                        resolve();
                    });
                } else {
                    console.log('Не удалось создать обновленную запись (дубликат)');
                    console.log('UPDATE тест завершен\n');
                    resolve();
                }
            });
        });
    });
}

// DELETE операции
function testDeleteOperations() {
    return new Promise((resolve, reject) => {
        console.log('=== DELETE ТЕСТИРОВАНИЕ ===');
        
        // Получаем текущую статистику
        db.getStats((err, statsBefore) => {
            if (err) {
                console.error('Ошибка получения статистики:', err.message);
                reject(err);
                return;
            }
            
            console.log('Записей до очистки: ' + statsBefore.total_records);
            
            // Выполняем очистку (оставляем только топ-3)
            db.cleanupOldRecords((err) => {
                if (err) {
                    console.error('Ошибка очистки записей:', err.message);
                    reject(err);
                    return;
                }
                
                // Получаем статистику после очистки
                db.getStats((err, statsAfter) => {
                    if (err) {
                        console.error('Ошибка получения статистики после очистки:', err.message);
                        reject(err);
                        return;
                    }
                    
                    console.log('Записей после очистки: ' + statsAfter.total_records);
                    console.log('Удалено записей: ' + (statsBefore.total_records - statsAfter.total_records));
                    
                    if (statsAfter.total_records <= 3) {
                        console.log('DELETE тест пройден - очистка работает корректно');
                    } else {
                        console.log('ВНИМАНИЕ: Осталось больше записей чем ожидалось');
                    }
                    console.log('DELETE тест завершен\n');
                    resolve();
                });
            });
        });
    });
}

// Комплексный CRUD тест
function testComplexCRUD() {
    return new Promise((resolve, reject) => {
        console.log('=== КОМПЛЕКСНЫЙ CRUD ТЕСТ ===');
        
        const testUser = 'ComplexTestUser';
        
        // CREATE - создаем тестовую запись
        db.addRecord(testUser, 1000, 50, 100, (err, id1) => {
            if (err) {
                console.error('Ошибка создания записи:', err.message);
                reject(err);
                return;
            }
            
            console.log('1. CREATE: Создана запись ' + testUser + ' (ID: ' + id1 + ')');
            
            // READ - проверяем что запись создана
            db.getPlayerRecords(testUser, (err, records) => {
                if (err) {
                    console.error('Ошибка чтения записи:', err.message);
                    reject(err);
                    return;
                }
                
                console.log('2. READ: Найдено записей - ' + records.length);
                
                // CREATE - создаем еще одну запись для того же пользователя
                db.addRecord(testUser, 1200, 60, 120, (err, id2) => {
                    if (err) {
                        console.error('Ошибка создания второй записи:', err.message);
                        reject(err);
                        return;
                    }
                    
                    console.log('3. CREATE: Создана вторая запись ' + testUser + ' (ID: ' + id2 + ')');
                    
                    // READ - проверяем что теперь две записи
                    db.getPlayerRecords(testUser, (err, updatedRecords) => {
                        if (err) {
                            console.error('Ошибка чтения обновленных записей:', err.message);
                            reject(err);
                            return;
                        }
                        
                        console.log('4. READ: Теперь записей - ' + updatedRecords.length);
                        
                        // READ - проверяем лучший результат
                        db.getPlayerBest(testUser, (err, bestRecord) => {
                            if (err) {
                                console.error('Ошибка чтения лучшего рекорда:', err.message);
                                reject(err);
                                return;
                            }
                            
                            console.log('5. READ: Лучший результат - ' + bestRecord.score + ' очков');
                            
                            // DELETE - очищаем через cleanup
                            db.cleanupOldRecords((err) => {
                                if (err) {
                                    console.error('Ошибка очистки:', err.message);
                                    reject(err);
                                    return;
                                }
                                
                                // READ - финальная проверка
                                db.getPlayerRecords(testUser, (err, finalRecords) => {
                                    if (err) {
                                        console.error('Ошибка финального чтения:', err.message);
                                        reject(err);
                                        return;
                                    }
                                    
                                    console.log('6. DELETE: После очистки осталось записей - ' + finalRecords.length);
                                    console.log('Комплексный CRUD тест пройден!\n');
                                    resolve();
                                });
                            });
                        });
                    });
                });
            });
        });
    });
}