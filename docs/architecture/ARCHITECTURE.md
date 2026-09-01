# Архитектура корпоративной CRM с AI-помощником

## 1. Статус документа

Версия: 0.1  
Stage: 0 — Architecture  
Статус: Initial Architecture Decision

Документ определяет базовую техническую архитектуру проекта.

Изменения ключевых архитектурных решений должны обсуждаться командой и фиксироваться отдельным commit / Pull Request.

---

# 2. Архитектурный подход

На первом этапе система разрабатывается как:

**Modular Monolith**

То есть backend является одним приложением, но разделён на независимые функциональные модули.

Микросервисная архитектура на MVP не используется.

Причины:

- команда разработки состоит из 3 человек;
- ожидаемая нагрузка на старте — 10–50 пользователей;
- архитектурный запас — до 150 пользователей;
- уменьшение инфраструктурной сложности;
- упрощение локальной разработки;
- упрощение отладки;
- быстрый запуск MVP;
- возможность выделения отдельных модулей в сервисы в будущем.

---

# 3. Технологический стек

## Backend

- Node.js
- TypeScript
- NestJS

## Database

- PostgreSQL

## ORM

- Prisma ORM

## Cache / Queue

- Redis
- BullMQ

## Realtime

- WebSocket
- Socket.IO

## File Storage

- MinIO
- S3-compatible API

## Client Applications

- Flutter
- Dart

Целевые платформы:

- iOS
- Android
- Windows
- macOS

## API

- REST API
- OpenAPI
- Swagger

## AI

- AI Gateway внутри backend
- Provider abstraction
- поддержка смены AI-провайдера

## RAG / Vector Search

На первом этапе:

- PostgreSQL
- pgvector

## Infrastructure

- Docker
- Docker Compose

## Reverse Proxy

- Nginx

## CI/CD

- GitHub Actions

## Monitoring

Планируется:

- Prometheus
- Grafana

## Logs

На первом этапе:

- structured JSON logs

При необходимости:

- Loki

---

# 4. Общая архитектура

```text
┌───────────────────────────────────────┐
│          Client Applications          │
│                                       │
│ iOS │ Android │ Windows │ macOS       │
│                Flutter                │
└───────────────────┬───────────────────┘
                    │
              REST / WebSocket
                    │
                    ▼
┌───────────────────────────────────────┐
│           NestJS Backend              │
│                                       │
│ Auth                                  │
│ Users                                 │
│ Roles                                 │
│ Permissions                           │
│ Tasks                                 │
│ Projects                              │
│ CRM                                   │
│ Messenger                             │
│ Files                                 │
│ Notifications                         │
│ Automation                            │
│ Reports                               │
│ Audit                                 │
│ AI                                    │
│ Integrations                          │
└───────┬────────────┬────────────┬─────┘
        │            │            │
        ▼            ▼            ▼

   PostgreSQL      Redis        MinIO
   + pgvector      BullMQ       S3 API

        │
        │
        ▼
┌───────────────────────────────────────┐
│              AI Gateway               │
│                                       │
│ Context                               │
│ Tools                                 │
│ RAG                                   │
│ Risk Engine                           │
│ Provider Adapter                      │
└───────────────────┬───────────────────┘
                    │
                    ▼

               AI Provider

                    │
                    ▼

┌───────────────────────────────────────┐
│            Integrations               │
│                                       │
│ Telegram                              │
│ Email                                 │
│ Push                                  │
│ Calendar                              │
│ REST API                              │
│ Webhooks                              │
└───────────────────────────────────────┘
```

---

# 5. Backend Architecture

Backend является центральной точкой бизнес-логики.

Клиенты не имеют прямого доступа к:

- PostgreSQL;
- Redis;
- MinIO;
- AI Provider.

Все операции выполняются через backend.

Общий поток запроса:

```text
Client
  ↓
Controller
  ↓
Authentication
  ↓
Authorization
  ↓
Application Service
  ↓
Domain / Business Logic
  ↓
Repository / Prisma
  ↓
PostgreSQL
```

---

# 6. Backend Modules

Предварительная структура:

```text
backend/
└── src/

    ├── auth/
    ├── users/
    ├── roles/
    ├── permissions/
    ├── sessions/

    ├── tasks/
    ├── projects/

    ├── clients/
    ├── contacts/
    ├── deals/
    ├── pipelines/

    ├── messenger/

    ├── files/

    ├── notifications/

    ├── automation/

    ├── reports/

    ├── audit/

    ├── ai/

    ├── integrations/

    ├── common/

    └── config/
```

Каждый модуль должен содержать свою бизнес-логику и минимально зависеть от внутренних деталей других модулей.

---

# 7. Database

Основная СУБД:

**PostgreSQL**

ORM:

**Prisma**

PostgreSQL хранит:

- пользователей;
- роли;
- права;
- сессии;
- задачи;
- проекты;
- клиентов;
- контакты;
- сделки;
- сообщения;
- настройки;
- уведомления;
- журналы аудита;
- правила автоматизации;
- метаданные файлов.

---

# 8. ID Strategy

Для основных сущностей используются UUID.

Пример:

```text
User.id
Task.id
Project.id
Client.id
Deal.id
Message.id
File.id
```

Причина:

- отсутствие зависимости от последовательных ID;
- удобство распределённой работы;
- безопаснее для внешнего API;
- упрощает потенциальное масштабирование.

---

# 9. Базовые поля сущностей

Для большинства основных сущностей предусматриваются:

```text
id
createdAt
updatedAt
```

Для сущностей, где требуется сохранение истории и восстановление:

```text
deletedAt
```

Используется soft delete там, где физическое удаление может привести к потере истории.

---

# 10. Database Migrations

Все изменения схемы БД выполняются исключительно через Prisma migrations.

Запрещается вручную менять production-схему БД без миграции.

Каждое изменение Prisma schema должно сопровождаться migration.

---

# 11. Redis

Redis не является основной базой данных.

Используется для:

- cache;
- queues;
- rate limiting;
- временных состояний;
- realtime presence;
- фоновых заданий;
- scheduled jobs.

---

# 12. Background Jobs

Для фоновой обработки используется:

**BullMQ**

Примеры задач:

```text
send-notification
send-email
send-telegram
generate-report
process-file
transcribe-audio
execute-ai-request
check-deadlines
check-overdue-tasks
calculate-risk
```

---

# 13. Realtime Architecture

Realtime реализуется через:

**Socket.IO / WebSocket**

WebSocket используется для:

- новых сообщений;
- статусов прочтения;
- typing indicator;
- online status;
- realtime notifications;
- обновлений задач;
- обновлений сделок.

Обычные CRUD-операции выполняются через REST API.

Пример:

```text
POST /api/v1/tasks

GET /api/v1/clients

PATCH /api/v1/deals/{id}
```

Realtime events:

```text
message.created

message.updated

message.read

typing.started

typing.stopped

user.online

user.offline

task.updated

deal.updated

notification.created
```

---

# 14. File Storage

Файлы не хранятся непосредственно в PostgreSQL.

Используется:

**MinIO**

Backend работает с ним через S3 API.

PostgreSQL хранит только метаданные:

```text
File

id
originalName
storageKey
mimeType
size
ownerId
createdAt
```

Файл может быть связан с:

- Task;
- Project;
- Client;
- Deal;
- Message.

---

# 15. Authentication

Планируемая модель:

```text
Login + Password
       ↓
      2FA
       ↓
Access Token
       +
Refresh Token
```

Используется:

- JWT Access Token;
- Refresh Token;
- TOTP 2FA.

---

# 16. Sessions

Refresh Token представляет отдельную пользовательскую сессию.

Пример:

```text
Session

id
userId
refreshTokenHash
device
ipAddress
userAgent
createdAt
expiresAt
revokedAt
```

Это позволяет реализовать:

- список активных устройств;
- завершение конкретной сессии;
- logout со всех устройств;
- аудит входов.

---

# 17. Authorization

Используется комбинированная модель:

**RBAC + ACL**

## RBAC

```text
User
 ↓
Role
 ↓
Permission
```

Примеры permissions:

```text
task.read
task.create
task.update
task.delete

client.read
client.create
client.update

deal.read
deal.create
deal.update

user.manage

report.export
```

## ACL

Дополнительные права могут задаваться на конкретный объект.

Например:

```text
User 15

Project 100

Permission:
READ
```

---

# 18. Security Rule

Проверка прав выполняется на стороне backend.

Недостаточно скрыть элемент интерфейса.

Правильный поток:

```text
Request
 ↓
Authentication
 ↓
Permission Check
 ↓
Object Access Check
 ↓
Business Logic
 ↓
Database
```

---

# 19. Audit

Значимые действия записываются в Audit Log.

Минимальный набор:

```text
LOGIN

LOGOUT

PERMISSION_CHANGED

USER_CREATED

USER_BLOCKED

DATA_EXPORTED

OBJECT_DELETED

DEADLINE_CHANGED

ASSIGNEE_CHANGED

AI_REQUEST

AI_RESPONSE

AI_ACTION
```

---

# 20. AI Architecture

ИИ не имеет прямого доступа к PostgreSQL.

Запрещённая схема:

```text
AI
 ↓
Database
```

Используемая схема:

```text
User
 ↓
Backend
 ↓
Permissions
 ↓
AI Gateway
 ↓
AI Tools
 ↓
Application Services
 ↓
Database
```

---

# 21. AI Gateway

ИИ вызывается через abstraction layer.

Пример интерфейса:

```text
AIProvider

chat()

structuredOutput()

embeddings()

transcribe()
```

Бизнес-логика системы не должна зависеть напрямую от конкретного AI-провайдера.

Это позволяет менять поставщика модели без переписывания CRM.

---

# 22. AI Tools

AI получает системные данные только через разрешённые инструменты.

Пример:

```text
getTask()

searchTasks()

getProject()

getClient()

searchClients()

getDeal()

getEmployeeWorkload()

searchMessages()

searchDocuments()

createTaskDraft()
```

Каждый Tool обязан учитывать права пользователя.

---

# 23. AI Write Operations

ИИ не должен самостоятельно выполнять критические изменения.

Пример:

```text
AI
 ↓
предлагает создать Task
 ↓
User confirms
 ↓
Backend creates Task
```

Подтверждение требуется для:

- создания задачи;
- изменения дедлайна;
- делегирования;
- изменения статуса;
- отправки сообщения;
- изменения CRM-данных.

---

# 24. RAG

На первом этапе отдельная Vector Database не используется.

Используется:

```text
PostgreSQL
+
pgvector
```

Схема:

```text
Document
 ↓
Text Extraction
 ↓
Chunking
 ↓
Embeddings
 ↓
pgvector
 ↓
Semantic Search
 ↓
AI Context
```

При увеличении объёма данных Vector Search может быть вынесен в отдельный сервис.

---

# 25. Flutter Client

Для клиентских приложений используется:

**Flutter**

Одна основная кодовая база должна обеспечивать:

- iOS;
- Android;
- Windows;
- macOS.

Предварительная структура:

```text
client/
└── lib/

    ├── core/

    ├── auth/

    ├── tasks/

    ├── projects/

    ├── crm/

    ├── messenger/

    ├── files/

    ├── notifications/

    ├── ai/

    └── settings/
```

---

# 26. API

Основной API:

**REST**

Версионирование:

```text
/api/v1/
```

Примеры:

```text
POST   /api/v1/auth/login

GET    /api/v1/users/me

GET    /api/v1/tasks

POST   /api/v1/tasks

GET    /api/v1/clients

POST   /api/v1/clients

GET    /api/v1/deals
```

Полная спецификация API фиксируется отдельно в:

```text
docs/api/
```

---

# 27. API Documentation

Используется:

**OpenAPI / Swagger**

Swagger должен автоматически формироваться из backend-кода.

---

# 28. Integrations

Внешние сервисы не имеют прямого доступа к БД.

Схема:

```text
External Service
       ↓
Integration Adapter
       ↓
Application Service
       ↓
Database
```

Основные интеграции:

- Telegram;
- Email;
- Push;
- AI Provider;
- Calendar;
- REST API;
- Webhooks.

---

# 29. Docker

Для локальной разработки используется:

**Docker Compose**

Минимальный набор инфраструктуры:

```text
postgres
redis
minio
```

Backend во время разработки допускается запускать локально для удобства debug.

---

# 30. Development Environment

Планируемая локальная схема:

```text
Windows

├── VS Code
├── Git
├── Node.js
├── Flutter
└── Docker Desktop

Docker:

├── PostgreSQL
├── Redis
└── MinIO
```

---

# 31. Production

На первой версии Kubernetes не используется.

Предварительная схема:

```text
Internet
   ↓
Nginx
   ↓
NestJS Backend
   │
   ├── PostgreSQL
   ├── Redis
   └── MinIO
```

Все основные компоненты разворачиваются через Docker.

---

# 32. CI/CD

Используется:

**GitHub Actions**

Pull Request должен запускать:

```text
Install
 ↓
Lint
 ↓
Type Check
 ↓
Unit Tests
 ↓
Integration Tests
 ↓
Build
```

При ошибке CI merge должен быть запрещён.

---

# 33. Git Branches

Основные ветки:

```text
main

develop

feature/*
```

Назначение:

```text
main
```

production / стабильная версия.

```text
develop
```

общая ветка текущей разработки.

```text
feature/*
```

изолированная работа над задачами.

---

# 34. Current Development Branches

```text
feature/stage-0-architecture

feature/stage-1-core

feature/stage-4-crm
```

---

# 35. Architectural Principles

Команда придерживается следующих принципов:

1. Modular Monolith first.
2. Database access only through backend.
3. AI cannot access database directly.
4. Permission checks are server-side.
5. REST for CRUD.
6. WebSocket for realtime.
7. Files outside PostgreSQL.
8. Background operations through queues.
9. AI Provider must be replaceable.
10. API must be documented.
11. Database changes only through migrations.
12. Secrets must not be committed to Git.
13. Critical architectural changes require Pull Request and review.

---

# 36. Возможное развитие

При росте нагрузки из modular monolith могут быть выделены отдельные сервисы:

```text
Messenger Service

Notification Service

AI Service

File Processing Service

Reporting Service
```

Но это выполняется только при наличии объективной необходимости.

Преждевременное разделение на микросервисы не допускается.

---

# 37. Следующие решения Stage 0

После утверждения данного документа необходимо определить:

1. API conventions.
2. Database entity model.
3. Permission matrix.
4. Environment variables.
5. Docker Compose.
6. Repository coding conventions.
7. CI pipeline.
8. Development startup instructions.