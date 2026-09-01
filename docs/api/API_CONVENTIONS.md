# API Conventions

## 1. Назначение

Документ определяет единые правила REST API и realtime-событий проекта.

Все backend-модули должны соблюдать эти правила.

Основные потребители API:

- Flutter Client;
- Telegram Bot;
- AI Layer;
- внешние интеграции;
- административные инструменты.

---

# 2. Base URL

Все REST endpoints используют версионирование.

Базовый путь:

```text
/api/v1
```

Примеры:

```text
/api/v1/auth/login
/api/v1/users
/api/v1/tasks
/api/v1/projects
/api/v1/clients
/api/v1/deals
```

Версия API является частью URL.

При несовместимых изменениях создаётся следующая версия:

```text
/api/v2
```

---

# 3. Формат URL

Используются:

- lowercase;
- существительные;
- множественное число;
- kebab-case для составных ресурсов.

Правильно:

```text
GET /api/v1/users

GET /api/v1/tasks

GET /api/v1/task-templates
```

Неправильно:

```text
GET /api/v1/getUsers

GET /api/v1/GetTasks

GET /api/v1/task_templates
```

---

# 4. HTTP Methods

Используются стандартные HTTP methods.

## GET

Получение данных.

```text
GET /api/v1/tasks
GET /api/v1/tasks/{id}
```

## POST

Создание сущности или выполнение отдельной команды.

```text
POST /api/v1/tasks
```

## PATCH

Частичное изменение объекта.

```text
PATCH /api/v1/tasks/{id}
```

## DELETE

Удаление объекта.

```text
DELETE /api/v1/tasks/{id}
```

## PUT

Используется только там, где требуется полная замена ресурса.

В большинстве CRUD-сценариев предпочтителен PATCH.

---

# 5. Resource Naming

Основные ресурсы:

```text
auth

users

roles

permissions

sessions

tasks

projects

clients

contacts

deals

pipelines

messages

channels

files

notifications

reports

audit

automation
```

---

# 6. Nested Resources

Вложенные endpoints допускаются, когда ресурс логически принадлежит другому объекту.

Пример:

```text
GET /api/v1/projects/{projectId}/tasks
```

или:

```text
GET /api/v1/clients/{clientId}/deals
```

Не допускается чрезмерная вложенность.

Нежелательно:

```text
/api/v1/projects/1/tasks/2/comments/3/files/4
```

В таких случаях используется отдельный endpoint ресурса.

---

# 7. Request Format

Все JSON запросы используют:

```text
Content-Type: application/json
```

Названия полей:

```text
camelCase
```

Пример:

```json
{
  "title": "Подготовить смету",
  "assigneeId": "uuid",
  "deadline": "2026-09-05T18:00:00Z"
}
```

---

# 8. Date and Time

Все даты передаются в формате:

```text
ISO 8601
```

Пример:

```text
2026-09-05T18:00:00Z
```

Backend хранит даты в UTC.

Клиент самостоятельно отображает время в локальной временной зоне пользователя.

---

# 9. Entity IDs

Основные сущности используют UUID.

Пример:

```text
550e8400-e29b-41d4-a716-446655440000
```

ID передаётся как строка.

---

# 10. Successful Response

Для одиночной сущности API возвращает сам ресурс внутри `data`.

Пример:

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "Подготовить смету",
    "status": "NEW"
  }
}
```

---

# 11. Collection Response

Для списка используется формат:

```json
{
  "data": [
    {
      "id": "uuid-1",
      "title": "Task 1"
    },
    {
      "id": "uuid-2",
      "title": "Task 2"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 125,
    "totalPages": 7
  }
}
```

---

# 12. Pagination

Стандартная пагинация:

```text
?page=1&pageSize=20
```

Пример:

```text
GET /api/v1/tasks?page=1&pageSize=20
```

Значения по умолчанию:

```text
page = 1

pageSize = 20
```

Максимальный `pageSize`:

```text
100
```

Для realtime/message history в будущем допускается cursor pagination.

---

# 13. Filtering

Фильтры передаются через query parameters.

Пример:

```text
GET /api/v1/tasks?status=IN_PROGRESS
```

Несколько фильтров:

```text
GET /api/v1/tasks?status=IN_PROGRESS&assigneeId={uuid}
```

Пример CRM:

```text
GET /api/v1/deals?pipelineId={uuid}&stageId={uuid}
```

---

# 14. Sorting

Используется:

```text
sortBy
sortOrder
```

Пример:

```text
GET /api/v1/tasks?sortBy=deadline&sortOrder=asc
```

Допустимые значения:

```text
asc
desc
```

---

# 15. Search

Полнотекстовый или частичный поиск передаётся параметром:

```text
search
```

Пример:

```text
GET /api/v1/clients?search=Ромашка
```

---

# 16. HTTP Status Codes

Используются стандартные HTTP status codes.

## 200 OK

Успешное получение или изменение.

## 201 Created

Сущность успешно создана.

## 204 No Content

Успешное удаление или действие без тела ответа.

## 400 Bad Request

Некорректный запрос.

## 401 Unauthorized

Пользователь не аутентифицирован.

## 403 Forbidden

Пользователь аутентифицирован, но не имеет прав.

## 404 Not Found

Ресурс не найден либо недоступен пользователю согласно политике безопасности.

## 409 Conflict

Конфликт данных.

Примеры:

```text
duplicate client

invalid state transition

version conflict
```

## 422 Unprocessable Entity

Запрос синтаксически корректен, но нарушает бизнес-правило.

## 429 Too Many Requests

Превышен rate limit.

## 500 Internal Server Error

Непредвиденная внутренняя ошибка.

---

# 17. Error Format

Все API ошибки имеют одинаковую структуру.

Пример:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "deadline",
        "message": "deadline is required"
      }
    ],
    "requestId": "01HXYZ..."
  }
}
```

---

# 18. Error Codes

Примеры системных кодов:

```text
VALIDATION_ERROR

UNAUTHORIZED

FORBIDDEN

RESOURCE_NOT_FOUND

RESOURCE_ALREADY_EXISTS

CONFLICT

BUSINESS_RULE_VIOLATION

RATE_LIMIT_EXCEEDED

INTERNAL_ERROR
```

Модуль может определять собственные бизнес-коды.

Например:

```text
TASK_INVALID_STATUS_TRANSITION

TASK_DEADLINE_REASON_REQUIRED

CLIENT_DUPLICATE_DETECTED

DEAL_NEXT_ACTION_REQUIRED
```

---

# 19. Request ID

Каждый входящий запрос получает уникальный:

```text
requestId
```

Request ID используется:

- в логах;
- в ошибках;
- для диагностики;
- для Audit;
- для трассировки проблем.

---

# 20. Authentication

Защищённые endpoints используют:

```text
Authorization: Bearer <access_token>
```

Access Token:

```text
JWT
```

Refresh Token используется только через специальные auth endpoints.

---

# 21. Authentication Endpoints

Предварительные endpoints:

```text
POST /api/v1/auth/login

POST /api/v1/auth/refresh

POST /api/v1/auth/logout

POST /api/v1/auth/logout-all

POST /api/v1/auth/2fa/verify

GET /api/v1/users/me
```

---

# 22. Authorization

Каждый защищённый endpoint должен выполнять:

```text
Authentication
      ↓
Role / Permission Check
      ↓
Object Access Check
      ↓
Business Logic
```

Проверка прав только на frontend запрещена.

---

# 23. Validation

Backend обязан валидировать:

- типы;
- обязательные поля;
- enum;
- UUID;
- даты;
- размеры строк;
- файлы;
- бизнес-ограничения.

Frontend validation не заменяет backend validation.

---

# 24. DTO

NestJS API использует DTO.

Пример:

```text
CreateTaskDto

UpdateTaskDto

TaskFilterDto
```

DTO не должен использоваться как database model напрямую.

---

# 25. API Model Separation

Необходимо разделять:

```text
API DTO
```

и:

```text
Database Model
```

Backend не должен автоматически отдавать наружу всю Prisma entity.

Причины:

- безопасность;
- контроль контрактов;
- скрытие внутренних полей;
- независимость API от схемы БД.

---

# 26. Sensitive Fields

API никогда не возвращает:

```text
passwordHash

refreshTokenHash

internalSecrets

AI API keys

SMTP passwords

Telegram bot token
```

Даже администратору.

---

# 27. Soft Delete

Если сущность использует soft delete:

```text
deletedAt
```

она по умолчанию не возвращается обычными endpoints.

Доступ к удалённым объектам должен быть отдельным административным сценарием.

---

# 28. Example — Create Task

Endpoint:

```text
POST /api/v1/tasks
```

Request:

```json
{
  "title": "Подготовить смету",
  "description": "Подготовить предварительную смету для клиента",
  "assigneeId": "550e8400-e29b-41d4-a716-446655440000",
  "deadline": "2026-09-05T18:00:00Z",
  "priority": "HIGH"
}
```

Response:

```json
{
  "data": {
    "id": "0bbd7f85-a098-4ddc-b249-d3e93997dcdd",
    "title": "Подготовить смету",
    "description": "Подготовить предварительную смету для клиента",
    "assigneeId": "550e8400-e29b-41d4-a716-446655440000",
    "deadline": "2026-09-05T18:00:00Z",
    "priority": "HIGH",
    "status": "NEW",
    "createdAt": "2026-09-01T20:00:00Z",
    "updatedAt": "2026-09-01T20:00:00Z"
  }
}
```

Status:

```text
201 Created
```

---

# 29. Example — Validation Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "title",
        "message": "title must not be empty"
      }
    ],
    "requestId": "01HXYZ123"
  }
}
```

Status:

```text
400 Bad Request
```

---

# 30. Example — Permission Error

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action",
    "requestId": "01HXYZ124"
  }
}
```

Status:

```text
403 Forbidden
```

---

# 31. Example — Business Rule Error

Например изменение дедлайна без причины:

```json
{
  "error": {
    "code": "TASK_DEADLINE_REASON_REQUIRED",
    "message": "Deadline change reason is required",
    "requestId": "01HXYZ125"
  }
}
```

Status:

```text
422 Unprocessable Entity
```

---

# 32. API Idempotency

Для операций, где повторный запрос может привести к дублированию критических данных, в будущем допускается:

```text
Idempotency-Key
```

Особенно для:

- платежных операций;
- интеграций;
- webhook handlers;
- AI actions;
- Telegram actions.

---

# 33. Swagger / OpenAPI

Backend обязан публиковать актуальную спецификацию OpenAPI.

Development endpoint:

```text
/api/docs
```

Предпочтительно также предоставлять JSON:

```text
/api/docs-json
```

Swagger должен содержать:

- endpoints;
- DTO;
- параметры;
- ответы;
- error codes;
- security scheme.

---

# 34. WebSocket

Realtime transport:

```text
Socket.IO
```

REST является источником CRUD API.

WebSocket используется для событий.

---

# 35. WebSocket Event Naming

Имена событий:

```text
resource.action
```

Примеры:

```text
message.created

message.updated

message.deleted

message.read

task.created

task.updated

task.deleted

deal.updated

notification.created

typing.started

typing.stopped

user.online

user.offline
```

---

# 36. WebSocket Event Payload

Событие должно иметь стандартную оболочку.

```json
{
  "event": "task.updated",
  "data": {
    "id": "uuid"
  },
  "timestamp": "2026-09-01T20:00:00Z"
}
```

---

# 37. WebSocket Security

WebSocket connection должна проходить authentication.

Пользователь получает только те события, которые ему разрешено видеть.

Запрещается broadcast конфиденциальных сущностей всем подключённым пользователям.

---

# 38. Webhooks

Внешние webhooks должны иметь:

- подпись;
- идентификатор события;
- timestamp;
- retry policy;
- защиту от повторной обработки.

Пример события:

```text
deal.updated
```

Payload:

```json
{
  "id": "event-uuid",
  "type": "deal.updated",
  "createdAt": "2026-09-01T20:00:00Z",
  "data": {
    "dealId": "uuid"
  }
}
```

---

# 39. API Compatibility

Изменения считаются breaking changes, если:

- удаляется endpoint;
- удаляется поле;
- меняется тип поля;
- меняется значение enum;
- меняется обязательность поля;
- меняется семантика endpoint.

Breaking changes запрещены внутри текущей версии API без согласования.

---

# 40. Adding Fields

Добавление необязательного поля считается backward-compatible изменением.

Например:

```json
{
  "name": "Client",
  "segment": "VIP"
}
```

если `segment` ранее отсутствовал и является optional.

---

# 41. Enum Changes

Удаление или переименование значения enum является breaking change.

Добавление нового значения требует проверки клиентских приложений.

---

# 42. API Review

Новый публичный endpoint должен проходить review.

Перед merge необходимо проверить:

- naming;
- permissions;
- DTO;
- validation;
- response;
- error codes;
- Swagger;
- tests.

---

# 43. API Tests

Для критических endpoints требуются integration tests.

Минимально проверяется:

```text
successful request

validation error

unauthorized

forbidden

not found

business rule violation
```

---

# 44. API Contract Ownership

Backend-разработчик отвечает за реализацию контракта.

Изменение публичного API, используемого другим разработчиком, не должно выполняться молча.

Изменения согласуются через:

```text
Pull Request
```

и обновление:

```text
OpenAPI / Swagger
```

при необходимости — этого документа.

---

# 45. Initial Domain API

Предварительные группы API:

```text
/api/v1/auth

/api/v1/users

/api/v1/roles

/api/v1/permissions

/api/v1/tasks

/api/v1/projects

/api/v1/clients

/api/v1/contacts

/api/v1/deals

/api/v1/pipelines

/api/v1/channels

/api/v1/messages

/api/v1/files

/api/v1/notifications

/api/v1/reports

/api/v1/automation
```

Детальные endpoints каждого модуля определяются при его проектировании.

---

# 46. Основное правило

API является контрактом между компонентами системы.

После публикации endpoint его структура не должна произвольно изменяться разработчиком.

Изменение контракта требует:

1. оценки влияния;
2. обновления документации;
3. обновления Swagger;
4. проверки зависимых клиентов;
5. Pull Request review.