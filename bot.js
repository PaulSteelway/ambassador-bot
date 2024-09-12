require('dotenv').config();
const { Telegraf } = require('telegraf');
const db = require('./database');
const bot = new Telegraf(process.env.BOT_TOKEN);
const admins = JSON.parse(process.env.ADMINS);

// Проверка, является ли пользователь админом
const isAdmin = (id) => admins.includes(id.toString());

// Команда для добавления нового канала
bot.command('add', (ctx) => {
    const [channel_name, nickname] = ctx.message.text.split(' ').slice(1);
    const executor = ctx.from.username;

    if (!channel_name || !nickname) {
        return ctx.reply('Usage: /add_ambassador {channel_name} {nickname}');
    }

    db.run(
        `INSERT INTO channels (channel_name, nickname, executor) VALUES (?, ?, ?)`,
        [channel_name, nickname, executor],
        function (err) {
            if (err) {
                return ctx.reply('Ошибка: такой канал уже существует.');
            }
            ctx.reply(`Канал ${channel_name} добавлен с амбассадором ${nickname}. Статус: new.`);
        }
    );
});

// Команда для проверки, существует ли канал
bot.command('check', (ctx) => {
    const channel_name = ctx.message.text.split(' ')[1];

    if (!channel_name) {
        return ctx.reply('Используй: /check_channel {channel_name}');
    }

    db.get(
        `SELECT * FROM channels WHERE channel_name = ?`,
        [channel_name],
        (err, row) => {
            if (err) return ctx.reply('Ошибка базы данных.');
            if (row) {
                return ctx.reply(`Канал: ${row.channel_name}, Амбассадор: ${row.nickname}, Статус: ${row.status}`);
            }
            ctx.reply('Такого канала не существует.');
        }
    );
});

// Команда для изменения статуса
bot.command('change', (ctx) => {
    const [channel_name, new_status] = ctx.message.text.split(' ').slice(1);
    const username = ctx.from.username;

    if (!channel_name || !new_status) {
        return ctx.reply('Используй: /change_status {channel_name} {new_status}');
    }

    db.get(
        `SELECT * FROM channels WHERE channel_name = ?`,
        [channel_name],
        (err, row) => {
            if (err) return ctx.reply('Ошибка базы данных.');
            if (!row) return ctx.reply('Канал не найден.');
            if (row.executor === username || isAdmin(ctx.from.id)) {
                db.run(
                    `UPDATE channels SET status = ? WHERE channel_name = ?`,
                    [new_status, channel_name],
                    (err) => {
                        if (err) return ctx.reply('Ошибка при обновлении статуса.');
                        ctx.reply(`Статус канала ${channel_name} изменён на ${new_status}.`);
                    }
                );
            } else {
                ctx.reply('Вы не имеете права изменять статус этого канала.');
            }
        }
    );
});

// Команда для удаления канала
bot.command('delete', (ctx) => {
    const channel_name = ctx.message.text.split(' ')[1];

    if (!channel_name) {
        return ctx.reply('Используй: /delete_channel {channel_name}');
    }

    db.get(
        `SELECT * FROM channels WHERE channel_name = ?`,
        [channel_name],
        (err, row) => {
            if (err) return ctx.reply('Ошибка базы данных.');
            if (!row) return ctx.reply('Канал не найден.');
            if (isAdmin(ctx.from.id)) {
                db.run(
                    `DELETE FROM channels WHERE channel_name = ?`,
                    [channel_name],
                    (err) => {
                        if (err) return ctx.reply('Ошибка при удалении канала.');
                        ctx.reply(`Канал ${channel_name} и амбассадор ${row.nickname} удалены.`);
                    }
                );
            } else {
                ctx.reply('Вы не имеете права удалять этот канал.');
            }
        }
    );
});

// Включаем инлайн режим
bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query;

    db.all(
        `SELECT * FROM channels WHERE channel_name LIKE ?`,
        [`%${query}%`],
        (err, rows) => {
            if (err) return;
            const results = rows.map((row) => ({
                type: 'article',
                id: row.id.toString(),
                title: row.channel_name,
                description: `Амбассадор: ${row.nickname}, Статус: ${row.status}`,
                input_message_content: {
                    message_text: `Канал: ${row.channel_name}\nАмбассадор: ${row.nickname}\nСтатус: ${row.status}`
                }
            }));
            ctx.answerInlineQuery(results);
        }
    );
});
bot.command('list', async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username;
    const isAdmin = process.env.ADMINS.split(',').includes(userId.toString()); // Сравниваем с массивом ID админов из .env

    // Если пользователь админ, выгружаем всех амбассадоров в файл
    if (isAdmin) {
        db.all('SELECT * FROM channels', (err, rows) => {
            if (err) {
                return ctx.reply('Ошибка при получении данных.');
            }

            if (rows.length === 0) {
                return ctx.reply('Нет амбассадоров в базе данных.');
            }

            // Формируем данные для файла
            const data = rows.map(row => `Канал: ${row.channel_name}, Амбассадор: ${row.nickname}, Статус: ${row.status}, Исполнитель: ${row.executor}`).join('\n');

            // Путь к временному файлу
            const filePath = path.join(__dirname, 'ambassadors_list.txt');

            // Записываем данные в текстовый файл
            fs.writeFileSync(filePath, data);

            // Отправляем файл админу
            ctx.replyWithDocument({ source: filePath, filename: 'ambassadors_list.txt' }).then(() => {
                // Удаляем файл после отправки
                fs.unlinkSync(filePath);
            }).catch((err) => {
                console.error('Ошибка отправки файла:', err);
                ctx.reply('Ошибка при отправке файла.');
            });
        });
    } 
    // Если пользователь не админ, выводим его амбассадоров
    else {
        db.all('SELECT * FROM channels WHERE executor = ?', [username], (err, rows) => {
            if (err) {
                return ctx.reply('Ошибка при получении данных.');
            }

            if (rows.length === 0) {
                return ctx.reply('У вас нет амбассадоров.');
            }

            if (rows.length > 20) {
                // Формируем данные для файла
                const data = rows.map(row => `Канал: ${row.channel_name}, Амбассадор: ${row.nickname}, Статус: ${row.status}`).join('\n');

                // Путь к временному файлу
                const filePath = path.join(__dirname, 'your_ambassadors_list.txt');

                // Записываем данные в текстовый файл
                fs.writeFileSync(filePath, data);

                // Отправляем файл пользователю
                ctx.replyWithDocument({ source: filePath, filename: 'your_ambassadors_list.txt' }).then(() => {
                    // Удаляем файл после отправки
                    fs.unlinkSync(filePath);
                }).catch((err) => {
                    console.error('Ошибка отправки файла:', err);
                    ctx.reply('Ошибка при отправке файла.');
                });
            } else {
                // Формируем сообщение для пользователя
                const ambassadorsList = rows.map(row => `Канал: ${row.channel_name}, Амбассадор: ${row.nickname}, Статус: ${row.status}`).join('\n');
                ctx.reply(`Ваши амбассадоры:\n${ambassadorsList}`);
            }
        });
    }
});
// Запуск бота
bot.launch();
console.log('Бот запущен');
