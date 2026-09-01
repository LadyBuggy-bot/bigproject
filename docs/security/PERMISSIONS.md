# Permissions Model

## 1. Назначение

Документ определяет модель авторизации и разграничения доступа корпоративной CRM.

Система использует комбинированную модель:

```text
RBAC
+
Object ACL
+
Field-level restrictions
+
Organizational scope
```

Проверка прав выполняется только на backend.

Frontend может скрывать недоступные элементы интерфейса, но это не считается защитой данных.

---

# 2. Основные понятия

## Authentication

Определяет:

```text
Кто пользователь?
```

Пример:

```text
User ID: uuid
```

---

## Authorization

Определяет:

```text
Что этот пользователь имеет право сделать?
```

Например:

```text
task.read

task.create

task.update

client.read

deal.update
```

---

# 3. Общая схема

```text
User
 ↓
Roles
 ↓
Permissions
 ↓
Organizational Scope
 ↓
Object ACL
 ↓
Field Restrictions
 ↓
Business Rule
 ↓
ALLOW / DENY
```

---

# 4. Базовые роли

На старте предусматриваются следующие системные роли:

```text
OWNER

ADMIN

MANAGER

EMPLOYEE

SALES_MANAGER

OBSERVER

GUEST
```

Пользовательские роли также должны поддерживаться.

---

# 5. OWNER

Владелец / Директор.

Имеет максимальные бизнес-права.

Основные возможности:

- просмотр всех данных компании;
- управление задачами;
- управление проектами;
- просмотр всей CRM;
- просмотр финансовых показателей;
- отчёты всей компании;
- настройка правил AI;
- просмотр Audit Log.

Технические настройки могут быть доступны также ADMIN.

---

# 6. ADMIN

Технический администратор.

Основные возможности:

- управление пользователями;
- роли;
- permissions;
- интеграции;
- справочники;
- рабочий календарь;
- системные настройки;
- Audit Log;
- мониторинг.

По умолчанию имеет доступ ко всем данным системы, если иное не определено политикой компании.

---

# 7. MANAGER

Руководитель подразделения или проекта.

Основной scope:

```text
собственное подразделение
+
подчинённые
+
проекты, которыми управляет
```

Может:

- создавать задачи;
- назначать исполнителей;
- изменять задачи сотрудников своего scope;
- управлять своими проектами;
- смотреть отчёты своего подразделения;
- получать AI-аналитику по своей области ответственности.

---

# 8. EMPLOYEE

Обычный сотрудник.

Основной scope:

```text
собственные задачи
+
задачи проектов, где он участник
+
доступные ему каналы
+
доступные клиенты
```

Не имеет доступа к административным данным.

---

# 9. SALES_MANAGER

Менеджер по продажам.

Основной scope:

```text
свои клиенты
+
свои сделки
```

Может:

- создавать клиентов;
- изменять своих клиентов;
- создавать сделки;
- менять свои сделки;
- работать с CRM pipeline;
- создавать задачи;
- просматривать связанные активности.

Доступ к чужим клиентам определяется дополнительными permissions.

---

# 10. OBSERVER

Роль только для просмотра.

Может получать доступ к явно выделенным:

```text
Projects

Tasks

Files

Reports
```

Не может изменять данные.

---

# 11. GUEST

Внешний участник.

Доступ только к явно предоставленным объектам:

```text
Channel

Task

File
```

По умолчанию доступ ко всей остальной системе запрещён.

---

# 12. Permission Naming Convention

Permission имеет формат:

```text
resource.action
```

Например:

```text
task.read

task.create

task.update

task.delete

task.assign

task.change_deadline

task.complete
```

---

# 13. Users Permissions

```text
user.read

user.create

user.update

user.block

user.dismiss

user.manage_roles

user.manage_sessions
```

---

# 14. Role Permissions

```text
role.read

role.create

role.update

role.delete

role.assign

permission.read

permission.manage
```

---

# 15. Task Permissions

```text
task.read

task.create

task.update

task.delete

task.assign

task.change_deadline

task.complete

task.accept

task.return_to_work

task.export
```

---

# 16. Project Permissions

```text
project.read

project.create

project.update

project.delete

project.archive

project.manage_members

project.manage_budget

project.export
```

---

# 17. CRM Permissions

## Clients

```text
client.read

client.create

client.update

client.delete

client.export

client.merge
```

## Contacts

```text
contact.read

contact.create

contact.update

contact.delete
```

## Deals

```text
deal.read

deal.create

deal.update

deal.delete

deal.change_stage

deal.export
```

## Pipelines

```text
pipeline.read

pipeline.manage
```

---

# 18. Messenger Permissions

```text
channel.read

channel.create

channel.update

channel.delete

channel.manage_members

message.read

message.create

message.update_own

message.delete_own

message.moderate
```

---

# 19. Files Permissions

```text
file.read

file.upload

file.update

file.delete

file.download
```

---

# 20. Reports Permissions

```text
report.read_own

report.read_department

report.read_company

report.create

report.export

report.schedule
```

---

# 21. AI Permissions

```text
ai.use

ai.read_sources

ai.create_task_draft

ai.propose_actions

ai.execute_confirmed_action

ai.manage_personal_settings

ai.manage_department_settings

ai.manage_company_settings
```

---

# 22. Audit Permissions

```text
audit.read

audit.export
```

По умолчанию:

```text
OWNER
ADMIN
```

---

# 23. Scope Model

Одного permission недостаточно.

Например пользователь имеет:

```text
client.read
```

Но необходимо определить область:

```text
OWN

DEPARTMENT

PROJECT

ASSIGNED

EXPLICIT

ALL
```

---

# 24. OWN

Пользователь имеет доступ только к объектам, владельцем или ответственным за которые является он сам.

Например:

```text
Client.responsibleUserId == currentUser.id
```

---

# 25. DEPARTMENT

Пользователь получает доступ к объектам сотрудников своего подразделения.

Например:

```text
client.responsibleUser.departmentId
==
currentUser.departmentId
```

Для руководителя может учитываться иерархия подразделений.

---

# 26. PROJECT

Пользователь получает доступ к объекту, если является участником соответствующего проекта.

Пример:

```text
ProjectMember
```

---

# 27. ASSIGNED

Пользователь получает доступ, если непосредственно назначен на сущность.

Например:

```text
Task.assigneeId == user.id
```

или является:

```text
CO_ASSIGNEE
WATCHER
```

---

# 28. EXPLICIT

Доступ предоставлен через ObjectPermission.

Пример:

```text
User 10

Project 100

READ
```

---

# 29. ALL

Доступ ко всем объектам данного типа.

Пример:

```text
OWNER

ADMIN
```

---

# 30. Permission Evaluation

Каждый запрос должен проходить следующие проверки:

```text
1. User authenticated?

2. User active?

3. Has base permission?

4. Is object in allowed scope?

5. Is object explicitly denied?

6. Are requested fields allowed?

7. Does business rule allow action?
```

Только после этого выполняется операция.

---

# 31. Example — Reading Client

Запрос:

```text
GET /api/v1/clients/{id}
```

Backend:

```text
Authentication
 ↓
client.read ?
 ↓
load access scope
 ↓
ALL?
OWN?
DEPARTMENT?
EXPLICIT?
 ↓
Field filtering
 ↓
Return Client
```

---

# 32. Example — Updating Client

```text
PATCH /api/v1/clients/{id}
```

Требуется:

```text
client.update
+
object access
+
field permissions
```

---

# 33. CRM Rule

SALES_MANAGER по умолчанию должен видеть:

```text
своих клиентов

свои сделки
```

Руководитель:

```text
свои
+
клиентов подчинённых
```

OWNER / ADMIN:

```text
всех
```

---

# 34. Manager Hierarchy

Для определения подчинённых используется:

```text
User.managerId
```

и/или:

```text
Department.managerId
```

Необходимо поддерживать функцию получения всех подчинённых пользователя.

Например:

```text
getSubordinateUserIds(managerId)
```

---

# 35. Task Access Rules

## OWNER / ADMIN

```text
ALL
```

## MANAGER

```text
свои задачи
+
задачи подчинённых
+
задачи управляемых проектов
```

## EMPLOYEE

```text
созданные им
+
назначенные ему
+
где он co-assignee
+
где он watcher
+
задачи доступного проекта
```

## OBSERVER

```text
только явно выделенные
```

## GUEST

```text
только явно выделенные
```

---

# 36. Deadline Permission

Изменение дедлайна требует:

```text
task.change_deadline
```

и обязательного:

```text
reason
```

Backend должен:

1. проверить permission;
2. проверить доступ к задаче;
3. потребовать reason;
4. сохранить старый deadline;
5. создать TaskDeadlineHistory;
6. увеличить deadlineChangeCount;
7. записать AuditLog.

---

# 37. Project Access

OWNER / ADMIN:

```text
ALL
```

MANAGER:

```text
managed projects
+
projects where member
```

EMPLOYEE:

```text
projects where member
```

OBSERVER:

```text
explicitly assigned projects
```

GUEST:

```text
explicitly shared projects if allowed
```

---

# 38. Object ACL

Для исключений используется:

```text
ObjectPermission
```

Пример:

```text
id

userId

objectType

objectId

permission

effect
```

`effect`:

```text
ALLOW

DENY
```

---

# 39. DENY Priority

Явный DENY имеет более высокий приоритет, чем ALLOW.

Например:

```text
Role:
client.read = ALL

ObjectPermission:
Client 123 = DENY
```

Результат:

```text
Client 123 недоступен
```

---

# 40. Supported Object Types

Минимально:

```text
TASK

PROJECT

CLIENT

DEAL

CHANNEL

FILE
```

---

# 41. Field-Level Permissions

Некоторые поля могут быть скрыты.

Например:

```text
Deal.amount

Project.plannedBudget

Project.actualBudget

Client.personalData
```

---

# 42. Field Permission Example

Разрешение:

```text
deal.field.amount.read
```

или политика:

```text
RoleFieldRestriction
```

Пример:

```text
SALES_MANAGER

Deal.amount

READ
```

---

# 43. Field Filtering

Backend обязан фильтровать данные до формирования ответа API.

Нельзя:

```text
Backend → отдаёт amount
Frontend → скрывает amount
```

Правильно:

```text
Backend
 ↓
Permission check
 ↓
Field filtering
 ↓
API response
```

---

# 44. Sensitive Fields

Независимо от permissions API никогда не отдаёт:

```text
passwordHash

refreshTokenHash

TOTP secret

API secrets

SMTP password

Telegram token

AI provider key
```

---

# 45. Export Permissions

Экспорт является отдельным действием.

Наличие:

```text
client.read
```

не означает автоматически:

```text
client.export
```

То же касается:

```text
task.export

deal.export

report.export
```

---

# 46. AI Permission Model

AI работает от имени текущего пользователя.

Принцип:

```text
User asks AI
 ↓
AI Tool
 ↓
Current User Context
 ↓
Permission Service
 ↓
Business Service
 ↓
Database
```

AI не получает административные права автоматически.

---

# 47. AI Example

EMPLOYEE спрашивает:

```text
Покажи сделки Иванова.
```

Если у EMPLOYEE отсутствует доступ:

```text
deal.read
```

или scope не включает сделки Иванова:

```text
AI получает отказ от Permission Service
```

AI не должен получать данные сделки вообще.

---

# 48. AI Write Action

Например:

```text
Перенеси задачу на пятницу.
```

Необходимы:

```text
task.change_deadline
+
object access
+
user confirmation
+
reason
```

После выполнения:

```text
TaskDeadlineHistory

AuditLog

AIAction
```

---

# 49. Files Access

Доступ к файлу зависит не только от:

```text
file.read
```

но и от объекта, к которому файл привязан.

Например файл связан с:

```text
Client 123
```

Если пользователь не имеет доступа к Client 123:

```text
File также недоступен
```

---

# 50. Messenger Access

Пользователь может читать сообщения только каналов, членом которых он является, либо к которым его роль имеет доступ.

Проверка:

```text
ChannelMember
```

или системная политика канала.

---

# 51. Direct Messages

Личный диалог доступен только его участникам.

ADMIN не должен автоматически использовать UI мессенджера для чтения личных сообщений, если отдельная организационная политика не определяет иное.

Техническое администрирование и бизнес-доступ необходимо разделять.

---

# 52. Audit

Изменения прав обязательно журналируются.

Audit должен фиксировать:

```text
кто изменил

кому изменил

что изменил

старое значение

новое значение

дата

IP

requestId
```

---

# 53. User Blocking

Если:

```text
User.status == BLOCKED
```

новые запросы пользователя запрещаются.

Активные sessions должны быть отозваны.

---

# 54. User Dismissal

При увольнении:

```text
User.status = DISMISSED
```

Пользователь не удаляется физически.

Необходимо:

```text
revoke sessions

disable login

transfer tasks

transfer clients

transfer deals
```

История:

```text
Messages

Tasks

Audit

Activity
```

сохраняется.

---

# 55. Default Deny

Основной принцип:

```text
Если право явно не предоставлено — доступ запрещён.
```

То есть:

```text
DEFAULT = DENY
```

---

# 56. Backend Implementation

Рекомендуемый поток NestJS:

```text
Controller

 ↓

JwtAuthGuard

 ↓

PermissionGuard

 ↓

ObjectAccessService

 ↓

Service

 ↓

Prisma
```

---

# 57. Permission Service

Предусматривается единый сервис:

```text
PermissionService
```

Пример методов:

```text
hasPermission()

canRead()

canCreate()

canUpdate()

canDelete()

canAccessObject()

getAllowedScope()

filterFields()
```

---

# 58. Forbidden Pattern

Не допускается дублировать логику прав в каждом модуле вручную.

Плохо:

```text
ClientsService:

if user.role === ADMIN ...


DealsService:

if user.role === ADMIN ...


TasksService:

if user.role === ADMIN ...
```

Необходимо использовать централизованный:

```text
PermissionService
```

---

# 59. Role Management

Администратор может создавать пользовательские роли.

Пример:

```text
Role:

Senior Sales Manager
```

Permissions:

```text
client.read

client.update

deal.read

deal.update

report.read_department
```

---

# 60. Initial Role Matrix

Предварительная матрица.

| Action | OWNER | ADMIN | MANAGER | EMPLOYEE | SALES_MANAGER | OBSERVER | GUEST |
|---|---|---|---|---|---|---|---|
| Users manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Audit read | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Task create | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Task read | ALL | ALL | SCOPE | SCOPE | SCOPE | EXPLICIT | EXPLICIT |
| Task deadline change | ✅ | ✅ | SCOPE | SCOPE | SCOPE | ❌ | ❌ |
| Project create | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Project read | ALL | ALL | SCOPE | MEMBER | MEMBER | EXPLICIT | EXPLICIT |
| Client read | ALL | ALL | DEPARTMENT | LIMITED | OWN | EXPLICIT | ❌ |
| Deal read | ALL | ALL | DEPARTMENT | LIMITED | OWN | EXPLICIT | ❌ |
| Export | ✅ | ✅ | LIMITED | ❌ | OWN | ❌ | ❌ |
| Company reports | ✅ | ✅ | DEPARTMENT | OWN | OWN | EXPLICIT | ❌ |
| AI settings | COMPANY | COMPANY | DEPARTMENT | OWN | OWN | ❌ | ❌ |

`LIMITED`, `SCOPE`, `OWN`, `DEPARTMENT` и `EXPLICIT` должны определяться соответствующей политикой доступа.

---

# 61. Permission Cache

Permissions допускается кэшировать в Redis.

Но Redis не является источником истины.

Источник истины:

```text
PostgreSQL
```

После изменения роли или permissions cache должен инвалидироваться.

---

# 62. Testing

Для permissions обязательны automated tests.

Минимальные сценарии:

```text
OWNER can access all allowed company data

ADMIN can manage users

MANAGER can access subordinate data

MANAGER cannot access unrelated department data

EMPLOYEE can access assigned task

EMPLOYEE cannot access unrelated task

SALES_MANAGER can access own client

SALES_MANAGER cannot access foreign client

OBSERVER cannot modify object

GUEST cannot access non-shared object

AI cannot bypass permissions

Export requires separate permission
```

---

# 63. Security Principles

1. Default deny.
2. Authentication does not equal authorization.
3. Permissions checked on backend.
4. Object scope checked separately from base permission.
5. Sensitive fields filtered on backend.
6. Export is a separate permission.
7. AI uses permissions of current user.
8. File access inherits business object restrictions.
9. Explicit DENY overrides ALLOW.
10. Permission changes are audited.
11. Disabled users lose active sessions.
12. Business history is not deleted with user.