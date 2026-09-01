# Data Model

## 1. Назначение

Документ фиксирует базовую модель данных корпоративной CRM.

Это архитектурная модель Stage 0.

Она определяет:

- основные сущности;
- ключевые связи;
- владельцев данных;
- обязательные системные поля;
- правила идентификаторов;
- правила удаления;
- границы модулей.

Финальная Prisma Schema создаётся разработчиками соответствующих модулей на основании этого документа.

---

# 2. Database

Основная СУБД:

**PostgreSQL**

ORM:

**Prisma ORM**

Расширение для vector search:

**pgvector**

---

# 3. ID Strategy

Для основных бизнес-сущностей используются:

```text
UUID
```

Пример:

```text
550e8400-e29b-41d4-a716-446655440000
```

UUID применяется минимум для:

```text
User
Role
Task
Project
Client
Contact
Deal
Pipeline
PipelineStage
Channel
Message
File
Notification
AutomationRule
AuditLog
```

---

# 4. Общие системные поля

Большинство сущностей должны содержать:

```text
id

createdAt

updatedAt
```

Для объектов с soft delete:

```text
deletedAt
```

Для отслеживания владельца или автора при необходимости:

```text
createdById

updatedById
```

---

# 5. Soft Delete

Soft delete используется для сущностей, удаление которых не должно разрушать историю.

Минимально рассматривается для:

```text
User
Task
Project
Client
Deal
Message
File
```

Физическое удаление допускается только для технических данных, где история не требуется.

---

# 6. Основные домены

Система разделяется на следующие группы данных:

```text
Identity & Access

Tasks

Projects

CRM

Messenger

Files

Notifications

Automation

Audit

AI
```

---

# 7. Общая схема связей

```text
User
 ├── Roles / Permissions
 ├── Sessions
 ├── Tasks
 ├── Projects
 ├── Clients
 ├── Deals
 ├── Messages
 ├── Files
 └── Notifications


Client
 ├── Contacts
 ├── Deals
 ├── Tasks
 ├── Projects
 ├── Files
 └── Activity


Project
 ├── Members
 ├── Milestones
 ├── Tasks
 ├── Files
 ├── Risks
 └── Channel


Task
 ├── Assignee
 ├── CoAssignees
 ├── Watchers
 ├── Project
 ├── Client
 ├── Deal
 ├── Checklist
 ├── Comments
 ├── Files
 ├── Dependencies
 └── History


Channel
 ├── Members
 ├── Messages
 └── Threads
```

---

# 8. Identity & Access

## User

Основная сущность пользователя.

Предлагаемые поля:

```text
id

email

phone

firstName

lastName

passwordHash

status

departmentId

managerId

createdAt

updatedAt

deletedAt
```

Возможные значения `status`:

```text
ACTIVE

BLOCKED

DISMISSED
```

Пароль никогда не хранится в открытом виде.

---

# 9. Department

Организационное подразделение.

```text
Department

id

name

parentId

managerId

createdAt

updatedAt
```

Поддерживает иерархию:

```text
Company

 ├── Sales

 ├── Production

 └── Administration
```

---

# 10. Role

```text
Role

id

name

description

isSystem

createdAt

updatedAt
```

Примеры:

```text
OWNER

ADMIN

MANAGER

EMPLOYEE

SALES_MANAGER

OBSERVER

GUEST
```

Система должна поддерживать пользовательские роли.

---

# 11. Permission

```text
Permission

id

code

description
```

Примеры:

```text
task.read

task.create

task.update

task.delete

task.change_deadline

client.read

client.create

client.update

deal.read

deal.update

user.manage

report.export
```

---

# 12. UserRole

Связь пользователей и ролей.

```text
UserRole

userId

roleId
```

Допускается наличие нескольких ролей у пользователя.

---

# 13. RolePermission

Связь:

```text
Role
 ↕
Permission
```

Структура:

```text
RolePermission

roleId

permissionId
```

---

# 14. ObjectPermission

Дополнительные объектные права.

```text
ObjectPermission

id

userId

objectType

objectId

permission

createdAt
```

Пример:

```text
User:
Ivan

Object:
Project 123

Permission:
READ
```

---

# 15. Session

Пользовательская сессия.

```text
Session

id

userId

refreshTokenHash

deviceName

userAgent

ipAddress

createdAt

expiresAt

revokedAt
```

Используется для:

- refresh token;
- списка устройств;
- завершения конкретной сессии;
- logout from all devices.

---

# 16. Tasks Domain

## Task

Основная сущность рабочего задания.

```text
Task

id

title

description

authorId

assigneeId

projectId

clientId

dealId

priority

status

plannedHours

actualHours

originalDeadline

deadline

deadlineChangeCount

createdAt

updatedAt

completedAt

deletedAt
```

---

# 17. Task Priority

Предлагаемые значения:

```text
LOW

NORMAL

HIGH

CRITICAL
```

Точные значения могут быть сделаны настраиваемым справочником позднее.

---

# 18. Task Status

Статусы должны быть настраиваемыми.

Базовые значения:

```text
NEW

IN_PROGRESS

REVIEW

DONE

CANCELLED
```

---

# 19. TaskParticipant

Для соисполнителей и наблюдателей:

```text
TaskParticipant

taskId

userId

type
```

Тип:

```text
CO_ASSIGNEE

WATCHER
```

Основной исполнитель хранится отдельно:

```text
Task.assigneeId
```

---

# 20. TaskChecklist

```text
TaskChecklistItem

id

taskId

title

isCompleted

position

completedAt

completedById
```

---

# 21. TaskComment

Комментарий задачи.

```text
TaskComment

id

taskId

authorId

message

createdAt

updatedAt

deletedAt
```

В будущем комментарии могут быть унифицированы с messenger threads.

---

# 22. TaskDependency

Связь зависимостей задач.

```text
TaskDependency

id

sourceTaskId

targetTaskId

type
```

Тип:

```text
BLOCKS
```

Логика:

```text
Task A
 BLOCKS
Task B
```

означает:

```text
Task B is blocked by Task A
```

---

# 23. Deadline History

Все изменения дедлайна должны храниться отдельно.

```text
TaskDeadlineHistory

id

taskId

oldDeadline

newDeadline

reason

changedById

createdAt
```

Это позволяет хранить:

- первоначальный срок;
- историю переносов;
- причину каждого переноса;
- количество переносов.

---

# 24. Task Time Tracking

```text
TaskTimeEntry

id

taskId

userId

startedAt

endedAt

minutes

source

createdAt
```

Источник:

```text
TIMER

MANUAL
```

---

# 25. Project Domain

## Project

```text
Project

id

name

description

goal

clientId

managerId

status

startDate

endDate

plannedBudget

actualBudget

createdAt

updatedAt

archivedAt
```

---

# 26. ProjectMember

```text
ProjectMember

projectId

userId

role
```

---

# 27. ProjectMilestone

```text
ProjectMilestone

id

projectId

name

description

responsibleUserId

deadline

completedAt

createdAt

updatedAt
```

---

# 28. ProjectRisk

```text
ProjectRisk

id

projectId

description

responsibleUserId

status

createdAt

updatedAt
```

---

# 29. CRM Domain

## Client

Карточка клиента.

```text
Client

id

type

name

inn

kpp

ogrn

legalAddress

actualAddress

email

phone

source

segment

responsibleUserId

comment

createdAt

updatedAt

deletedAt
```

Тип:

```text
LEGAL_ENTITY

INDIVIDUAL
```

---

# 30. ClientContact

У одного клиента может быть несколько контактных лиц.

```text
Contact

id

clientId

firstName

lastName

position

phone

email

isPrimary

createdAt

updatedAt
```

---

# 31. Client Tags

Используется универсальная система тегов.

```text
Tag

id

name

type
```

и связующая таблица:

```text
ClientTag

clientId

tagId
```

---

# 32. Pipeline

Воронка продаж.

```text
Pipeline

id

name

isDefault

createdAt

updatedAt
```

---

# 33. PipelineStage

```text
PipelineStage

id

pipelineId

name

position

color

isFinal

createdAt

updatedAt
```

Порядок этапов задаётся через:

```text
position
```

---

# 34. Deal

```text
Deal

id

clientId

pipelineId

stageId

name

amount

probability

expectedCloseDate

responsibleUserId

nextActionAt

nextActionDescription

lossReasonId

status

createdAt

updatedAt

closedAt

deletedAt
```

---

# 35. Deal Business Rule

Для активной сделки:

```text
nextActionAt
```

или:

```text
nextActionDescription
```

должны быть заполнены согласно бизнес-правилу CRM.

---

# 36. Deal Stage History

История движения сделки:

```text
DealStageHistory

id

dealId

fromStageId

toStageId

changedById

createdAt
```

---

# 37. LossReason

Справочник причин отказа.

```text
LossReason

id

name

isActive
```

---

# 38. Contract

Договор клиента.

```text
Contract

id

clientId

dealId

number

date

amount

status

fileId

createdAt

updatedAt
```

---

# 39. Invoice

```text
Invoice

id

clientId

dealId

number

date

amount

paymentStatus

dueDate

fileId

createdAt

updatedAt
```

---

# 40. Activity Timeline

CRM должна иметь единую историю взаимодействий.

Предлагается унифицированная сущность:

```text
Activity

id

clientId

dealId

userId

type

entityType

entityId

summary

createdAt
```

Типы:

```text
CALL

EMAIL

MESSAGE

MEETING

TASK

DOCUMENT

DEAL_CHANGE

NOTE
```

Activity может формироваться автоматически по событиям других модулей.

---

# 41. Messenger Domain

## Channel

```text
Channel

id

name

type

projectId

clientId

taskId

createdById

createdAt

updatedAt

deletedAt
```

Типы:

```text
DIRECT

PUBLIC

PRIVATE

SYSTEM
```

---

# 42. ChannelMember

```text
ChannelMember

channelId

userId

role

joinedAt
```

---

# 43. Message

```text
Message

id

channelId

authorId

parentMessageId

text

createdAt

updatedAt

deletedAt
```

`parentMessageId` используется для threads / replies.

---

# 44. MessageReaction

```text
MessageReaction

messageId

userId

reaction
```

---

# 45. MessageRead

```text
MessageRead

messageId

userId

readAt
```

---

# 46. Files Domain

## File

```text
File

id

originalName

storageKey

mimeType

size

ownerId

createdAt

updatedAt

deletedAt
```

Физическое содержимое хранится в MinIO.

---

# 47. File Relation

Для связи файлов с бизнес-объектами используется:

```text
FileLink

id

fileId

entityType

entityId

createdAt
```

Пример:

```text
File

 → Task
 → Project
 → Client
 → Deal
 → Message
```

---

# 48. Notifications

## Notification

```text
Notification

id

userId

type

title

message

entityType

entityId

isRead

createdAt

readAt
```

---

# 49. Notification Delivery

Отдельно фиксируется доставка по каналам:

```text
NotificationDelivery

id

notificationId

channel

status

sentAt

error
```

Channels:

```text
IN_APP

PUSH

TELEGRAM

EMAIL
```

---

# 50. Automation

## AutomationRule

```text
AutomationRule

id

name

isActive

triggerType

conditions

actions

createdById

createdAt

updatedAt
```

`conditions` и `actions` могут храниться в JSONB.

---

# 51. AutomationRun

История выполнения автоматизации.

```text
AutomationRun

id

ruleId

status

input

result

startedAt

finishedAt

error
```

---

# 52. Audit

## AuditLog

```text
AuditLog

id

userId

action

entityType

entityId

oldValue

newValue

requestId

ipAddress

createdAt
```

`oldValue` / `newValue` допускается хранить в JSONB.

---

# 53. AI Domain

## AIConversation

```text
AIConversation

id

userId

contextType

contextId

createdAt

updatedAt
```

---

# 54. AIMessage

```text
AIMessage

id

conversationId

role

content

provider

model

inputTokens

outputTokens

createdAt
```

---

# 55. AIAction

Действия, предложенные или выполненные AI.

```text
AIAction

id

userId

conversationId

type

payload

status

confirmedAt

executedAt

createdAt
```

Статусы:

```text
PROPOSED

CONFIRMED

EXECUTED

REJECTED

FAILED
```

---

# 56. AI Sources

Для ссылки AI-ответа на источники:

```text
AIMessageSource

id

aiMessageId

entityType

entityId

label
```

Пример:

```text
AI response
 ├── Task #123
 ├── Project #25
 └── Document #12
```

---

# 57. Documents / RAG

## DocumentChunk

```text
DocumentChunk

id

fileId

chunkIndex

content

embedding

createdAt
```

`embedding` хранится через:

```text
pgvector
```

---

# 58. Indexing

Необходимо предусмотреть индексы минимум для часто используемых полей.

Примеры:

```text
User.email

Client.inn

Client.phone

Client.email

Task.assigneeId

Task.status

Task.deadline

Project.managerId

Deal.clientId

Deal.stageId

Deal.responsibleUserId

Message.channelId

Message.createdAt

Notification.userId

AuditLog.userId

AuditLog.createdAt
```

---

# 59. Unique Constraints

Минимальные ограничения:

```text
User.email UNIQUE

Permission.code UNIQUE
```

Для CRM контроль дублей не ограничивается простым UNIQUE.

Например совпадение клиента может проверяться по:

```text
name

inn

phone

email
```

через отдельный duplicate detection service.

---

# 60. Foreign Keys

Связи между основными сущностями должны обеспечиваться foreign keys там, где это возможно.

Например:

```text
Task.assigneeId
    ↓
User.id
```

```text
Deal.clientId
    ↓
Client.id
```

```text
Contact.clientId
    ↓
Client.id
```

---

# 61. Delete Behaviour

Cascade delete должен использоваться очень осторожно.

Запрещается автоматически каскадно удалять значимые бизнес-данные.

Например удаление пользователя не должно удалять:

```text
Tasks

Messages

Deals

Audit Logs
```

Вместо этого пользователь переводится в статус:

```text
DISMISSED
```

а связанные сущности сохраняются.

---

# 62. Ownership Rules

## Stage 1 owns

Разработчик Core отвечает за:

```text
User

Department

Role

Permission

UserRole

RolePermission

ObjectPermission

Session

AuditLog

File

Notification
```

---

# 63. Stage 4 owns

Разработчик CRM отвечает за:

```text
Client

Contact

Tag

ClientTag

Pipeline

PipelineStage

Deal

DealStageHistory

LossReason

Contract

Invoice

Activity
```

---

# 64. Shared Entities

Эти сущности используются несколькими модулями:

```text
User

File

AuditLog

Notification
```

Их schema нельзя дублировать внутри других модулей.

Например CRM использует:

```text
Client.responsibleUserId
```

связанный с:

```text
User.id
```

но не создаёт собственную таблицу пользователей.

---

# 65. Module Dependency Rule

Разрешённая зависимость:

```text
CRM
 ↓
Users
```

Неправильно:

```text
CRM
 ↓
собственная копия User
```

То же правило применяется к:

```text
Files

Audit

Notifications
```

---

# 66. Migration Ownership

Если разработчику Stage 4 требуется изменение таблицы, принадлежащей Stage 1, изменение должно быть согласовано через Pull Request.

Нельзя параллельно создавать две несовместимые версии одной сущности.

---

# 67. Prisma

Предполагаемое расположение:

```text
backend/
└── prisma/
    ├── schema.prisma
    └── migrations/
```

На первом этапе используется одна общая Prisma schema.

---

# 68. Prisma Migration Rules

Разработчик перед созданием migration обязан:

```text
git pull

обновить свою branch

проверить schema.prisma
```

После изменения:

```text
prisma format

prisma validate

prisma migrate dev
```

Migration обязательно добавляется в Git.

---

# 69. Database Naming

В Prisma:

```text
PascalCase
```

для моделей:

```text
User

Task

Client

PipelineStage
```

Поля:

```text
camelCase
```

Например:

```text
responsibleUserId

createdAt

updatedAt
```

---

# 70. Data Model Principles

1. UUID для основных сущностей.
2. PostgreSQL является источником истины.
3. Redis не используется как постоянное бизнес-хранилище.
4. Файлы не хранятся бинарно в PostgreSQL.
5. Значимая история не удаляется каскадом.
6. Пользователь после увольнения не удаляется физически.
7. Изменение дедлайна задачи журналируется.
8. Изменение этапа сделки журналируется.
9. AI имеет ссылки на источники.
10. Database schema изменяется только через migrations.
11. Общие сущности не дублируются между модулями.
12. Все права проверяются backend.