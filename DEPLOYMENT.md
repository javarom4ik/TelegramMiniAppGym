# Развёртывание Vercel + Neon + Telegram

Секреты не нужно отправлять в чат. Храните их в `.env.local` и в Vercel Environment Variables.

## 1. Подготовить доступы

Понадобятся:

- pooled `DATABASE_URL` из Neon;
- токен бота из BotFather;
- ваш числовой Telegram ID и ID остальных разрешённых пользователей;
- случайный `TELEGRAM_WEBHOOK_SECRET` из букв, цифр, `_` или `-`;
- итоговый HTTPS-адрес проекта Vercel.

## 2. Заполнить локальное окружение

Скопируйте `.env.example` в `.env.local` и заполните значения. Для рабочего режима установите:

```dotenv
NEXT_PUBLIC_DEMO_MODE=false
```

Файл `.env.local` исключён из Git.

## 3. Создать таблицы Neon

```bash
npm run db:migrate
```

При первом входе пользователя API автоматически создаст базовый каталог и три стартовые тренировки.

## 4. Опубликовать проект

Текущая папка ещё не является Git-репозиторием. Создайте приватный репозиторий GitHub, добавьте туда проект и импортируйте его в Vercel.

В Vercel добавьте все переменные из `.env.example`, установив `NEXT_PUBLIC_DEMO_MODE=false`. После появления постоянного домена запишите его в `NEXT_PUBLIC_APP_URL` и выполните повторный deployment.

## 5. Подключить Telegram

После обновления `NEXT_PUBLIC_APP_URL` в `.env.local` выполните:

```bash
npm run telegram:setup
```

Скрипт зарегистрирует защищённый webhook и добавит боту кнопку меню «Открыть дневник».

## 6. Финальная проверка

Откройте:

```text
https://<ваш-домен>/api/health
```

Поля `ok`, `databaseReachable`, `telegramConfigured` и `appUrlConfigured` должны быть `true`. Затем отправьте боту `/start`, откройте Mini App и сохраните одну тестовую тренировку.
