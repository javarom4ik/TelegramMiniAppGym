# Telegram Gym Tracker

Мобильный прототип личного дневника силовых тренировок для Telegram Mini Apps.

## Что уже работает

- запуск и восстановление активной тренировки;
- живой таймер без фонового серверного процесса;
- быстрый ввод `вес × повторения`;
- независимые значения «Лучшее» и «Прошлый раз»;
- определение нового рекорда;
- завершение тренировки и история;
- выбор и создание нескольких программ;
- добавление, удаление и изменение порядка упражнений в программе;
- создание пользовательского упражнения с названием и группой мышц;
- безопасное удаление пользовательского упражнения из каталога и программ;
- защищённый API, сохраняющий программы, упражнения и результаты в Neon;
- автоматическое создание базового каталога и трёх стартовых тренировок для нового пользователя;
- локальный демонстрационный режим с `localStorage` для работы без ключей;
- схема Neon/PostgreSQL и SQL-миграции;
- серверная проверка подписи Telegram `initData`;
- allowlist Telegram ID;
- защищённый webhook бота с кнопкой открытия приложения.

По умолчанию локальная разработка работает в демонстрационном режиме. При `NEXT_PUBLIC_DEMO_MODE=false` интерфейс получает состояние через `/api/app`; каждый запрос проверяет Telegram `initData`, allowlist и принадлежность данных пользователю.

## Локальный запуск

Нужен Node.js `20.9` или новее.

```bash
npm install
npm run dev
```

Откройте `http://localhost:3000`.

Полезные проверки:

```bash
npm test
npm run typecheck
npm run build
```

## Переменные окружения

Скопируйте `.env.example` в `.env.local` и заполните:

```dotenv
DATABASE_URL=postgresql://...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
ALLOWED_TELEGRAM_IDS=123456789,987654321
NEXT_PUBLIC_APP_URL=https://your-project.vercel.app
NEXT_PUBLIC_DEMO_MODE=false
```

- `DATABASE_URL` — pooled connection string из Neon.
- `TELEGRAM_WEBHOOK_SECRET` — случайная строка из букв, цифр, `_` и `-`.
- `ALLOWED_TELEGRAM_IDS` — закрытый список пользователей через запятую.
- `NEXT_PUBLIC_DEMO_MODE=true` — локальный прототип без базы.
- `NEXT_PUBLIC_DEMO_MODE=false` — рабочий режим Telegram + Neon; именно его нужно задать в Vercel.

## Neon

1. Создайте проект Neon в Vercel Marketplace или напрямую в Neon.
2. Добавьте `DATABASE_URL` в Vercel Environment Variables.
3. Примените миграцию:

```bash
npm run db:migrate
```

Схема находится в `lib/db/schema.ts`, миграция — в `drizzle/`.

Основные таблицы:

- `users`;
- `exercises`;
- `programs`;
- `program_exercises`;
- `workouts`;
- `workout_exercises`;
- `workout_results`.

База гарантирует одну активную тренировку на пользователя и один максимальный результат упражнения внутри тренировки. Таблица `workout_exercises` хранит снимок состава запущенной тренировки, поэтому последующее редактирование программы не меняет уже начатую тренировку.

## Vercel

1. Поместите проект в личный GitHub-репозиторий.
2. Импортируйте репозиторий в Vercel.
3. Добавьте перечисленные выше Environment Variables.
4. Установите `NEXT_PUBLIC_DEMO_MODE=false`.
5. Выполните deployment.
6. Примените миграции командой `npm run db:migrate` из окружения с тем же `DATABASE_URL`.
7. Проверьте `https://<project>.vercel.app/api/health`.

В ответе `ok`, `databaseReachable`, `telegramConfigured` и `appUrlConfigured` должны быть `true`.

## Telegram

После создания бота через BotFather зарегистрируйте webhook и кнопку меню:

```bash
npm run telegram:setup
```

Команда использует `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` и `NEXT_PUBLIC_APP_URL`, настраивает webhook `/api/telegram/webhook` и кнопку «Открыть дневник». В BotFather также можно назначить приложение как Main Mini App.

## Безопасность

- токен бота и строка Neon существуют только в серверных переменных Vercel;
- frontend не доверяет `initDataUnsafe`;
- сервер проверяет HMAC-подпись и свежесть `Telegram.WebApp.initData`;
- после проверки подписи применяется allowlist Telegram ID;
- API на каждом действии повторно проверяет пользователя и принадлежность программ/упражнений;
- webhook отдельно проверяет `X-Telegram-Bot-Api-Secret-Token`.

## Продуктовые решения

Полный зафиксированный объём прототипа находится в [PRODUCT_SPEC.md](./PRODUCT_SPEC.md).
