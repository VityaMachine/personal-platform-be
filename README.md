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
BCRYPT_SALT_ROUNDS=12
EMAIL_VERIFICATION_TOKEN_TTL_MINUTES=60
FRONTEND_URL=http://localhost:3000
```

Сервер не стартує, якщо обов'язкові змінні середовища некоректні.

## Prisma

```bash
npm run prisma:generate
npx prisma migrate dev
npm run prisma:studio
```

Initial migration `init_auth_models` creates the first Auth data layer:

- `User`
- `Profile`
- `UserSettings`
- `AuthSession`
- `ExternalAccount`
- `EmailVerificationToken`

Use `npx prisma migrate dev --name init_auth_models` when creating the migration locally. Use `npm run prisma:studio` to inspect the local PostgreSQL structure after migration.
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


## Auth register

`POST /api/v1/auth/register` creates a user with email/password, default profile, default settings, and an email verification token hash. It does not issue JWTs or create sessions yet.

```bash
curl -i -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"StrongPassword1!","displayName":"Test User"}'
```

In development the console email provider prints a verification URL like `http://localhost:3000/verify-email?token=...`. The raw token is not stored in the database.

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

## Health response and HTTP logs

`GET /api/v1/health` returns public runtime status only:

```json
{
  "status": "ok",
  "version": "0.1.0",
  "environment": "development",
  "timestamp": "2026-07-14T12:00:00.000Z",
  "uptime": 120.5
}
```

HTTP request logs are compact by default and include request id, method, URL, status code, response time, and remote address when available. Request/response headers, bodies, cookies, and authorization data are not logged by default.
