# Personal Platform BE

Базовий backend-каркас модульного моноліту на Node.js, Express, TypeScript, Prisma, PostgreSQL, Zod, Swagger/OpenAPI, Vitest і Supertest.

## Вимоги

- Node.js 20+
- npm
- Локальний PostgreSQL на Windows

Docker у цьому проєкті не використовується.

## Встановлення

```bash
npm install
```

## Локальна PostgreSQL база

Приклад через `psql`:

```sql
CREATE DATABASE personal_platform;
```

Якщо потрібен окремий користувач:

```sql
CREATE USER personal_platform_user WITH PASSWORD 'strong_password';
GRANT ALL PRIVILEGES ON DATABASE personal_platform TO personal_platform_user;
```

## Environment

Створи `.env` на основі `.env.example`:

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/personal_platform
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
```

Сервер не стартує, якщо обов'язкові змінні середовища некоректні.

## Prisma

```bash
npm run prisma:generate
```

На цьому етапі Prisma schema містить тільки `generator` і `datasource`, без бізнес-моделей.

## Запуск

```bash
npm run dev
```

Production build:

```bash
npm run build
npm start
```

## Тести

```bash
npm test
```

Тести використовують Supertest напряму проти Express application і не відкривають реальний HTTP-порт.

## URL

- Health: `http://localhost:4000/api/v1/health`
- Swagger UI: `http://localhost:4000/api/docs`

## Доступні scripts

- `npm run dev`
- `npm run build`
- `npm start`
- `npm run typecheck`
- `npm run lint`
- `npm run format`
- `npm run format:check`
- `npm test`
- `npm run test:watch`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:studio`
# personal-platform-be
