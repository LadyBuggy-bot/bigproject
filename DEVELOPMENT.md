# Development Guide

Инструкция по подготовке локального окружения и работе с проектом.

---

## 1. Требования

Для разработки необходимо установить:

- Git
- Visual Studio Code
- Docker Desktop
- Node.js 24
- npm
- Flutter 3.47.x stable

Целевая ОС для основной локальной разработки:

```text
Windows 10 / Windows 11
```

---

## 2. Клонирование репозитория

```bash
git clone https://github.com/LadyBuggy-bot/bigproject.git
cd bigproject
```

---

## 3. Ветки

Основные ветки:

```text
main
develop
feature/*
hotfix/*
```

Назначение:

```text
main
```

Стабильная версия.

```text
develop
```

Общая ветка разработки.

```text
feature/*
```

Рабочие ветки разработчиков.

---

## 4. Начало новой задачи

Перед созданием новой ветки:

```bash
git checkout develop
git pull origin develop
```

Создать feature branch:

```bash
git checkout -b feature/task-name
```

Примеры:

```text
feature/stage-1-core
feature/stage-4-crm
feature/task-kanban
feature/auth-sessions
```

---

## 5. Environment Variables

Создать локальный `.env`:

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux / macOS:

```bash
cp .env.example .env
```

Файл:

```text
.env
```

не должен попадать в Git.

Проверка:

```bash
git status
```

`.env` не должен отображаться среди изменённых файлов.

---

## 6. Локальная инфраструктура

Инфраструктура запускается через Docker Compose.

Используются:

```text
PostgreSQL + pgvector
Valkey
SeaweedFS / S3 API
```

Запуск:

```bash
docker compose up -d
```

Проверка:

```bash
docker compose ps
```

Остановка:

```bash
docker compose stop
```

Полная остановка контейнеров:

```bash
docker compose down
```

---

## 7. Важно про Docker volumes

Команда:

```bash
docker compose down
```

не удаляет данные PostgreSQL.

Команда:

```bash
docker compose down -v
```

удаляет volumes и локальные данные.

Использовать `-v` только если действительно требуется полностью очистить локальную БД и хранилище.

---

## 8. PostgreSQL

Локальный PostgreSQL:

```text
Host:
localhost

Port:
5432

Database:
bigproject

User:
bigproject
```

Пароль берётся из локального `.env`.

Connection string:

```text
DATABASE_URL
```

---

## 9. pgvector

Расширение pgvector создаётся автоматически при первом создании PostgreSQL volume.

Проверка:

```bash
docker exec bigproject-postgres psql -U bigproject -d bigproject -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```

---

## 10. Valkey

Valkey используется для:

- cache;
- queues;
- rate limiting;
- realtime state;
- scheduled jobs.

Проверка:

```bash
docker exec bigproject-valkey valkey-cli -a change_me_local ping
```

Ожидаемый ответ:

```text
PONG
```

---

## 11. Object Storage

Для локальной разработки используется SeaweedFS.

S3 endpoint:

```text
http://localhost:8333
```

Master:

```text
http://localhost:9333
```

Приложение должно работать через S3-compatible API и не зависеть напрямую от реализации SeaweedFS.

---

## 12. Backend

Backend располагается:

```text
backend/
```

Технологии:

```text
Node.js 24
TypeScript
NestJS
Prisma
PostgreSQL
```

После инициализации backend установка зависимостей:

```bash
cd backend
npm ci
```

Для первого локального запуска, если `package-lock.json` ещё отсутствует:

```bash
npm install
```

После появления lock-файла он обязательно хранится в Git.

---

## 13. Backend Environment

Backend использует переменные окружения из конфигурации проекта.

Основные:

```text
DATABASE_URL

VALKEY_URL

JWT_ACCESS_SECRET

JWT_REFRESH_SECRET

S3_ENDPOINT

S3_ACCESS_KEY

S3_SECRET_KEY

S3_BUCKET
```

Настоящие пароли и токены не записываются в Git.

---

## 14. Prisma

Предполагаемое расположение:

```text
backend/prisma/schema.prisma
```

Основные команды:

```bash
npx prisma format
npx prisma validate
npx prisma generate
```

Создание migration:

```bash
npx prisma migrate dev --name migration_name
```

Запрещается изменять общую database schema вручную без migration.

---

## 15. Prisma перед изменением схемы

Перед созданием migration:

```bash
git checkout develop
git pull origin develop
```

После обновления своей feature branch необходимо убедиться, что используется актуальная версия:

```text
schema.prisma
```

Это особенно важно при параллельной работе разных разработчиков.

---

## 16. API

Base URL:

```text
/api/v1
```

Документация правил:

```text
docs/api/API_CONVENTIONS.md
```

Swagger после появления backend:

```text
/api/docs
```

---

## 17. Data Model

Базовая модель данных описана:

```text
docs/database/DATA_MODEL.md
```

Перед созданием новой общей сущности необходимо проверить этот документ.

Общие сущности нельзя дублировать в разных модулях.

---

## 18. Permissions

Модель доступа:

```text
docs/security/PERMISSIONS.md
```

Используется:

```text
RBAC
+
ACL
+
Scope
+
Field-level restrictions
```

Права всегда проверяются backend.

---

## 19. Architecture

Главный архитектурный документ:

```text
docs/architecture/ARCHITECTURE.md
```

Основной подход:

```text
Modular Monolith
```

Новые микросервисы не создаются без отдельного архитектурного решения.

---

## 20. Client

Клиент располагается:

```text
client/
```

Технология:

```text
Flutter
```

Целевые платформы:

```text
iOS
Android
Windows
macOS
```

Проверка Flutter:

```bash
flutter doctor
```

---

## 21. AI

AI-функциональность должна работать через:

```text
Backend
 ↓
Permission check
 ↓
AI Gateway
 ↓
AI Provider
```

Запрещается:

```text
Frontend → AI Provider
```

и:

```text
AI Provider → Database
```

---

## 22. Code Quality

После появления соответствующих scripts backend должен поддерживать:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Эти проверки выполняются CI.

---

## 23. Git Commit Convention

Формат:

```text
type(scope): description
```

Примеры:

```text
feat(auth): add refresh token sessions

feat(crm): add client creation

fix(tasks): validate deadline change reason

docs(api): update client endpoints

test(auth): add login integration tests

chore(deps): update dependencies
```

Основные типы:

```text
feat
fix
docs
test
refactor
chore
ci
perf
```

---

## 24. Pull Requests

Feature branch должна направляться:

```text
feature/*
     ↓
develop
```

Не:

```text
feature/*
     ↓
main
```

Production merge:

```text
develop
   ↓
main
```

Срочное исправление:

```text
hotfix/*
   ↓
main
```

---

## 25. Перед Pull Request

Необходимо:

```bash
git status
```

Убедиться, что нет случайных файлов.

Затем выполнить доступные проверки проекта:

```text
lint
typecheck
tests
build
```

После чего:

```bash
git push
```

и открыть Pull Request.

---

## 26. CI

GitHub Actions автоматически проверяет Pull Requests.

Pipeline:

```text
Checkout
 ↓
Repository validation
 ↓
Secrets validation
 ↓
Docker Compose validation
 ↓
npm ci
 ↓
Lint
 ↓
Type Check
 ↓
Tests
 ↓
Build
```

Backend-проверки автоматически активируются после появления:

```text
backend/package.json
backend/package-lock.json
```

---

## 27. Запрещено коммитить

Нельзя добавлять в Git:

```text
.env

API keys

JWT secrets

passwords

private keys

production certificates

Telegram tokens

SMTP passwords

AI provider credentials
```

При обнаружении утёкшего секрета недостаточно удалить его новым commit.

Секрет необходимо немедленно отозвать или заменить.

---

## 28. Обновление своей feature branch

Перед значительной новой работой:

```bash
git checkout develop
git pull origin develop
```

Затем:

```bash
git checkout feature/your-branch
git merge develop
```

При конфликтах они должны быть разрешены локально до Pull Request.

---

## 29. Полезные команды

Состояние Git:

```bash
git status
```

Текущая ветка:

```bash
git branch
```

Все ветки:

```bash
git branch -a
```

Последние commits:

```bash
git log --oneline --decorate -10
```

Состояние Docker:

```bash
docker compose ps
```

Логи:

```bash
docker compose logs
```

Логи одного сервиса:

```bash
docker compose logs postgres
```

---

## 30. Быстрый старт

Для разработчика, который впервые получил проект:

```text
1. Clone repository
2. Checkout develop
3. Create feature branch
4. Copy .env.example → .env
5. Start Docker Desktop
6. docker compose up -d
7. docker compose ps
8. Install module dependencies
9. Start development
```

---

## 31. Документация проекта

```text
README.md
    Общая информация

DEVELOPMENT.md
    Настройка локальной разработки

docs/architecture/ARCHITECTURE.md
    Архитектура

docs/api/API_CONVENTIONS.md
    API conventions

docs/database/DATA_MODEL.md
    Data model

docs/security/PERMISSIONS.md
    Permissions model
```

---

## 32. Главное правило команды

Перед созданием новой фундаментальной сущности, API-подхода или архитектурного компонента необходимо проверить существующую документацию.

Архитектурные изменения не должны выполняться незаметно внутри feature-задачи.

Такие изменения обсуждаются командой и фиксируются через Pull Request.