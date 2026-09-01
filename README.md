# Corporate CRM with AI Assistant

Корпоративная CRM-система со встроенным мессенджером, управлением задачами и проектами, CRM-модулем, автоматизацией процессов и цифровым ИИ-помощником.

> Статус проекта: **Development / MVP**
>
> Версия требований: **ТЗ v1.0 от 01.09.2026**

---

## 📌 О проекте

Цель проекта — создать единую рабочую среду компании вместо набора разрозненных инструментов: мессенджеров, таблиц, почты, заметок и отдельных систем постановки задач.

Система должна объединять:

* корпоративный мессенджер;
* задачи;
* проекты;
* клиентов;
* сделки и воронки продаж;
* документы и файлы;
* календарь;
* уведомления;
* отчётность;
* бизнес-автоматизацию;
* Telegram;
* ИИ-помощника.

Основной принцип:

```text
Коммуникация
    ↓
Задачи
    ↓
Проекты
    ↓
Клиенты / Сделки
    ↓
Аналитика
    ↓
ИИ-помощник
```

Все данные должны находиться в единой системе и быть связаны между собой.

---

# 🎯 Цели проекта

После запуска система должна обеспечить:

* перенос не менее 80% рабочей коммуникации внутрь CRM;
* наличие ответственного и срока у 100% рабочих задач;
* повышение доли задач, выполненных вовремя;
* снижение времени руководителей на ручной сбор статусов;
* ведение единой клиентской базы;
* автоматическое формирование отчётности;
* автоматическое выявление рисков и просрочек;
* контроль нагрузки сотрудников.

---

# 👥 Пользователи

Первоначальная нагрузка:

```text
10–50 пользователей
```

Архитектура должна предусматривать рост минимум до:

```text
150 пользователей
```

Ожидаемый объём данных первого года:

* до 100 000 сообщений;
* до 30 000 задач;
* до 5 000 клиентов;
* до 100 ГБ файлов.

---

# 📱 Клиенты системы

Обязательные платформы:

### Mobile

* iOS;
* Android.

### Desktop

* Windows;
* macOS.

### Дополнительные интерфейсы

* Telegram Bot;
* Web-приложение — отдельный дополнительный этап.

Все клиенты используют:

```text
Единая учётная запись
        ↓
Единый API
        ↓
Единая база данных
```

Изменения на одном устройстве должны отражаться на остальных клиентах.

---

# 🏗 Общая архитектура

Финальный технологический стек определяется на этапе проектирования.

Предполагаемая логическая архитектура:

```text
┌───────────────────────────────┐
│       Client Applications     │
│                               │
│ iOS │ Android │ Win │ macOS   │
└───────────────┬───────────────┘
                │
                │ REST / WebSocket
                ▼
┌───────────────────────────────┐
│            Backend            │
│                               │
│ Auth                          │
│ Users                         │
│ Tasks                         │
│ Projects                      │
│ CRM                           │
│ Messenger                     │
│ Files                         │
│ Notifications                 │
│ Automation                    │
│ Reports                       │
└───────────────┬───────────────┘
                │
      ┌─────────┴───────────┐
      ▼                     ▼
┌──────────────┐      ┌──────────────┐
│ Database     │      │ File Storage │
└──────────────┘      └──────────────┘

                │
                ▼
┌───────────────────────────────┐
│         AI Service            │
│                               │
│ AI Gateway                    │
│ Context Engine                │
│ Risk Engine                   │
│ RAG / Knowledge Base          │
│ Reports                       │
│ Recommendations               │
└───────────────────────────────┘

                │
                ▼
┌───────────────────────────────┐
│         Integrations          │
│                               │
│ Telegram                      │
│ Email                         │
│ Push                          │
│ Calendar                      │
│ Telephony                     │
│ 1C                            │
│ External API                  │
└───────────────────────────────┘
```

---

# 🧩 Основные модули

## 1. Пользователи и права

Система поддерживает роли:

* Владелец / Директор;
* Администратор;
* Руководитель;
* Сотрудник;
* Менеджер по продажам;
* Наблюдатель;
* Внешний гость.

Необходима поддержка:

* пользовательских ролей;
* RBAC;
* объектных прав;
* ограничения отдельных действий;
* ограничения отдельных полей;
* журналирования изменений прав.

Базовые действия:

```text
VIEW
CREATE
UPDATE
DELETE
EXPORT
ASSIGN
CHANGE_DEADLINE
COMPLETE
```

---

# 🔐 Authentication & Security

Необходимо реализовать:

* login/password;
* 2FA;
* управление активными сессиями;
* принудительный logout;
* серверную проверку прав;
* TLS;
* шифрование хранимых данных;
* Audit Log;
* защиту от массовой выгрузки информации.

Для мобильных клиентов:

* PIN;
* Face ID / Touch ID / biometrics;
* автоблокировка.

---

# ✅ Tasks

Задача является одной из основных сущностей системы.

Основные поля:

```text
Title
Description
Author
Assignee
Co-assignees
Watchers
Project
Client
Deal
Priority
Status
Created At
Deadline
Estimated Time
Actual Time
Tags
Checklist
Attachments
Dependencies
Comments
History
```

---

## Возможности задач

* создание вручную;
* создание из сообщения;
* создание через Telegram;
* создание голосом;
* создание через ИИ;
* подзадачи;
* зависимости;
* повторяющиеся задачи;
* чек-листы;
* делегирование;
* контроль выполнения;
* учёт рабочего времени;
* шаблоны;
* массовые действия.

---

## Представления

Необходимо реализовать:

```text
List
Kanban
Table
Calendar
Gantt
My Day
```

---

# ⏰ Deadline Management

Изменение срока требует указания причины.

Система хранит:

```text
Original Deadline
Current Deadline
Deadline Change Count
Deadline Change History
```

При расчётах необходимо учитывать:

* рабочее время;
* выходные;
* праздники;
* отпуска.

---

# 📁 Projects

Проект включает:

* цель;
* клиента;
* руководителя;
* команду;
* даты;
* бюджет;
* задачи;
* документы;
* этапы;
* риски.

---

## Project Features

```text
Project
 ├── Milestones
 ├── Tasks
 ├── Team
 ├── Files
 ├── Risks
 ├── Budget
 ├── Time Tracking
 └── Messenger Channel
```

Необходимы:

* Gantt;
* зависимости задач;
* критический путь;
* проектный dashboard;
* портфель проектов;
* шаблоны проектов;
* архив проектов.

---

# 💼 CRM

CRM-модуль включает:

```text
Client
 ├── Contacts
 ├── Deals
 ├── Calls
 ├── Emails
 ├── Messages
 ├── Meetings
 ├── Tasks
 ├── Documents
 └── Payments
```

---

## Clients

Карточка клиента содержит:

* название;
* тип;
* реквизиты;
* контактных лиц;
* каналы связи;
* источник;
* менеджера;
* теги;
* сегмент;
* комментарии.

---

## Deals

Сделка содержит:

```text
Client
Pipeline
Stage
Amount
Probability
Expected Close Date
Manager
Next Action
```

Поддерживаются:

* несколько воронок;
* настраиваемые этапы;
* Kanban;
* drag-and-drop;
* автоматизация переходов;
* причины отказа.

Основное бизнес-правило:

```text
Активная сделка
        ↓
обязательно
        ↓
имеет следующий запланированный шаг
```

---

# 💬 Messenger

Встроенный корпоративный мессенджер.

Поддерживаются:

* личные сообщения;
* групповые каналы;
* публичные каналы;
* закрытые каналы;
* системные каналы;
* threads;
* mentions;
* reactions;
* quotes;
* forward;
* attachments;
* voice messages;
* search;
* typing status;
* online status;
* delivery status;
* read status.

---

## Messenger ↔ CRM

Канал может быть связан с:

```text
Project
Task
Client
Deal
```

Из сообщения должна существовать возможность создать задачу.

Пример:

```text
Message
   ↓
Create Task
   ↓
Task #123
```

В исходном сообщении сохраняется ссылка на созданную задачу.

---

# 🤖 AI Assistant

ИИ-помощник является частью системы, а не отдельным внешним чат-ботом.

Он доступен:

* отдельным диалогом;
* внутри карточки задачи;
* внутри проекта;
* внутри клиента;
* внутри сделки;
* через Telegram.

---

# 🧠 Основные принципы AI

## 1. No hallucinations

Ответ должен строиться на данных системы.

Если данных недостаточно:

```text
AI → сообщает, что информации нет
```

а не выдумывает ответ.

---

## 2. Permissions

ИИ работает только с информацией, доступной пользователю.

```text
User
 ↓
Permissions
 ↓
Context
 ↓
AI
```

---

## 3. Sources

Ответы по данным системы должны содержать ссылки на источники:

```text
Task #123
Project #22
Client #15
Message #1234
Document #44
```

---

## 4. Confirmation before action

ИИ может предложить:

```text
Create task
Move deadline
Delegate task
Send message
Change status
```

Но изменение выполняется только после подтверждения пользователя, если администратором явно не настроено исключение.

---

# 🛠 AI Tools

Предполагаемый интерфейс инструментов:

```text
getTasks()

getTask()

getProjects()

getProject()

getClients()

getClient()

getDeals()

searchMessages()

searchDocuments()

getEmployeeWorkload()

createTask()

updateTask()

sendMessage()
```

Write-операции должны учитывать механизм подтверждения.

---

# ⚠ AI Risk Engine

ИИ должен автоматически искать риски.

Пример:

```text
Task
 ↓
Deadline
 ↓
Activity
 ↓
Dependencies
 ↓
Employee Workload
 ↓
Risk Score
```

Пример результата:

```text
Risk: HIGH

Причины:

- дедлайн завтра;
- задача не изменялась 3 дня;
- исполнитель перегружен;
- зависимая задача просрочена.
```

---

# 👤 Workload Analysis

Система анализирует загрузку сотрудников.

```text
Available Time
      VS
Estimated Task Time
```

ИИ должен определять:

* перегруз;
* простой;
* конфликтующие дедлайны;
* потенциальный риск срыва.

---

# 📝 AI Task Assistant

Пользователь может поставить задачу естественным языком.

Пример:

```text
Подготовить смету клиенту Ромашка
до пятницы, ответственный Иван.
```

ИИ должен предложить:

```text
Title:
Подготовить смету

Client:
Ромашка

Assignee:
Иван

Deadline:
Friday
```

После подтверждения создаётся задача.

---

# ✂ Task Decomposition

ИИ должен иметь возможность преобразовать:

```text
Большая задача
```

в:

```text
Task
 ├── Subtask 1
 ├── Subtask 2
 ├── Subtask 3
 └── Subtask 4
```

с предложением:

* исполнителей;
* сроков;
* порядка выполнения.

---

# 📚 Knowledge Base / RAG

Система содержит корпоративную базу знаний.

ИИ должен иметь возможность отвечать на вопросы по:

* инструкциям;
* регламентам;
* документам;
* корпоративным правилам.

Ответ должен содержать ссылку на исходный документ.

Логическая схема:

```text
Documents
   ↓
Parsing
   ↓
Chunks
   ↓
Index
   ↓
Search
   ↓
AI
```

---

# 🔔 Notifications

Каналы доставки:

```text
Mobile Push
Desktop Notification
Telegram
Email
```

События:

* новая задача;
* изменение статуса;
* новый исполнитель;
* приближение срока;
* просрочка;
* упоминание;
* новый комментарий;
* риск;
* критический сигнал.

---

# 🤖 Automation Engine

Необходимо реализовать систему правил:

```text
IF condition

THEN action
```

Пример:

```text
IF
task is overdue

THEN
notify assignee

AFTER 24h
notify manager
```

---

## Triggers

```text
task.created
task.updated
task.status_changed
task.deadline
task.overdue

deal.created
deal.stage_changed

message.created

date.reached

email.received
```

---

## Actions

```text
createTask

sendNotification

updateField

assignUser

startTemplate

callAI
```

Правила должны создаваться администратором без изменения исходного кода.

---

# 📊 Analytics

## Dashboard руководителя

Должен отображать:

* задачи;
* просрочки;
* риски;
* загрузку;
* проекты;
* продажи;
* KPI;
* динамику.

---

## Dashboard сотрудника

```text
My Tasks
My Deadlines
My Workload
My Productivity
```

---

# 📑 Reports

Минимальный набор:

* ежедневный отчёт руководителя;
* отчёт по сотруднику;
* отчёт по подразделению;
* отчёт по проекту;
* отчёт по просрочкам;
* отчёт по загрузке;
* отчёт по продажам;
* отчёт по клиенту;
* отчёт по трудозатратам;
* отчёт по качеству постановки задач;
* отчёт по работе ИИ.

---

# 📤 Export

Поддерживаются:

```text
XLSX
CSV
PDF
```

Экспорт обязан учитывать права пользователя.

---

# 🔌 Integrations

## Mandatory

### Telegram

Используется для:

* уведомлений;
* просмотра задач;
* постановки задач;
* завершения задач;
* получения отчётов;
* работы с ИИ.

### Email

```text
IMAP
SMTP
```

Функции:

* получение почты;
* привязка письма к клиенту;
* отправка письма;
* отправка отчёта.

### AI Provider

ИИ подключается через отдельный слой:

```text
Application
    ↓
AI Gateway
    ↓
AI Provider
```

Поставщик модели должен заменяться без переписывания основной системы.

### Push

```text
APNs
FCM
```

### REST API

Система должна предоставлять документированный API.

### Webhooks

Предусматривается интеграция с внешними системами.

---

# 🔌 Optional Integrations

В дальнейшем могут быть добавлены:

* телефония;
* Google Calendar;
* Microsoft 365;
* 1С;
* WhatsApp;
* ЭДО.

---

# 🗂 Files

Файловая система должна поддерживать:

* папки;
* права;
* версии;
* загрузку;
* скачивание;
* preview;
* привязку к сущностям.

Файл может быть связан с:

```text
Task
Project
Client
Deal
```

---

# 📅 Calendar

В календаре отображаются:

* задачи;
* встречи;
* вехи;
* отпуска;
* дедлайны.

Планируется возможность интеграции с внешними календарями.

---

# 🔎 Audit Log

Журналируются значимые действия:

```text
Login
Logout
Permission Change
Export
Object Delete
Deadline Change
AI Request
AI Response
AI Action
```

---

# 🛡 AI Security

ИИ не должен обходить основной механизм авторизации.

Неправильно:

```text
AI
 ↓
Database
```

Правильно:

```text
AI
 ↓
Application Services
 ↓
Permission Check
 ↓
Data
```

---

# 🇷🇺 Personal Data

При работе с персональными данными необходимо учитывать требования законодательства РФ.

В частности:

* хранение;
* разграничение доступа;
* аудит;
* удаление;
* сроки хранения;
* территориальное размещение данных.

---

# 🧪 Testing

Проект должен включать:

### Unit Tests

```text
Services
Domain Logic
Permissions
AI Tools
Automation
```

### Integration Tests

```text
API
Database
Messenger
External integrations
```

### E2E Tests

Сквозные пользовательские сценарии.

---

# ✅ Acceptance Criteria

Перед вводом системы в эксплуатацию должны быть проверены:

* обязательные требования;
* права доступа;
* AI permissions;
* производительность;
* резервное копирование;
* восстановление;
* мобильные приложения;
* desktop приложения;
* Telegram;
* API.

Минимум:

```text
60 E2E scenarios
```

из них:

```text
15 AI scenarios
```

---

# ⚡ Performance Requirements

Целевые показатели:

```text
Main Screen     ≤ 2 sec

Message         ≤ 1 sec

Standard Report ≤ 10 sec

AI Response     ≤ 15 sec
```

Нагрузочное тестирование:

```text
50 concurrent active users
```

Архитектурный запас:

```text
150 users
```

---

# 💾 Backup

Требования:

```text
Backup: daily

Retention:
≥ 30 days

RTO:
≤ 4 hours

RPO:
≤ 1 hour
```

Процедура восстановления должна регулярно проверяться.

---

# 👨‍💻 Development Team

На текущем этапе разработка разбита между тремя направлениями.

---

## Developer 1 — Backend / Database / Architecture

Ответственность:

```text
Backend
Database
Auth
RBAC
Users
Tasks
Projects
CRM
Messenger Backend
REST API
WebSocket
Audit
Files
```

---

## Developer 2 — Client Applications / UI

Ответственность:

```text
Application UI
Mobile
Desktop
Tasks UI
Projects UI
CRM UI
Messenger UI
AI UI
Notifications UI
Dashboards
```

---

## Developer 3 — AI / Integrations / Automation

Ответственность:

```text
AI Gateway
AI Tools
RAG
Risk Engine
Task Assistant
Telegram Bot
Email
Automation Engine
Notifications
Reports
Integrations
```

---

# 🚀 Development Roadmap

## Stage 0 — Architecture

```text
Architecture
Database
API contracts
Permissions
Design System
AI architecture
Development environment
CI/CD
```

---

## Stage 1 — Core

```text
Users
Auth
Roles
Permissions
Audit
Files
Notifications
```

---

## Stage 2 — Tasks

```text
Tasks
Subtasks
Checklist
Comments
Deadlines
History
Kanban
Filters
```

---

## Stage 3 — Projects

```text
Projects
Milestones
Dependencies
Gantt
Risks
Dashboard
```

---

## Stage 4 — CRM

```text
Clients
Contacts
Deals
Pipelines
CRM Kanban
Documents
```

---

## Stage 5 — Messenger

```text
Direct Messages
Channels
Threads
Reactions
Attachments
Voice
Realtime
```

---

## Stage 6 — AI

```text
AI Chat
AI Tools
Task Parsing
Risk Engine
RAG
Reports
Recommendations
```

---

## Stage 7 — Automation

```text
Triggers
Conditions
Actions
Escalations
Scheduled Jobs
```

---

## Stage 8 — Integrations

```text
Telegram
Email
Push
Calendar
REST API
Webhooks
```

---

## Stage 9 — Production

```text
Migration
Security Testing
Load Testing
Backup Test
Documentation
Deployment
Store Publication
Training
```

---

# 🏁 MVP

Первый рабочий MVP должен включать:

```text
Auth
Users
Roles
Tasks
Projects
Clients
Deals
Basic Messenger
Files
Notifications
Telegram
Basic AI Assistant
```

---

# 🤖 MVP AI

Первая версия ИИ должна уметь:

```text
Create Task from Text
Find Tasks
Find Overdue Tasks
Summarize Project
Summarize Client
Generate Daily Summary
Answer Using System Data
```

Более сложные возможности реализуются последующими этапами:

```text
Risk Engine
RAG
Workload Analysis
Recommendations
Retrospective
Advanced Reports
```

---

# 🔄 Development Process

Работа ведётся спринтами:

```text
Sprint duration: 2 weeks
```

После каждого спринта:

1. демонстрация результата;
2. проверка выполненных задач;
3. фиксация замечаний;
4. актуализация backlog;
5. планирование следующего спринта.

---

# 🌿 Git Workflow

Рекомендуемая модель веток:

```text
main
│
├── develop
│
├── feature/*
├── fix/*
├── refactor/*
├── release/*
└── hotfix/*
```

Пример:

```bash
git checkout develop

git checkout -b feature/task-kanban
```

После завершения:

```text
feature/*
    ↓
Pull Request
    ↓
Code Review
    ↓
develop
```

Production release:

```text
develop
   ↓
release/*
   ↓
main
```

---

# 📝 Commit Convention

Рекомендуемый формат:

```text
type(scope): description
```

Примеры:

```text
feat(tasks): add task dependencies

feat(ai): add task creation tool

feat(crm): add deal pipeline

fix(auth): fix session expiration

fix(messenger): fix duplicated messages

refactor(tasks): simplify deadline service

docs(api): update API documentation

test(ai): add permission tests
```

Типы:

```text
feat
fix
refactor
docs
test
chore
perf
security
```

---

# 🔀 Pull Requests

Каждый PR должен содержать:

```text
What was changed

Why

How to test

Affected modules

Database changes

API changes

Screenshots if UI changed
```

PR не должен объединяться без:

* успешной сборки;
* прохождения тестов;
* code review;
* отсутствия критических ошибок.

---

# 🗃 Suggested Repository Structure

Фактическая структура зависит от выбранного технологического стека.

Логически проект может быть организован следующим образом:

```text
/
├── apps/
│   ├── client/
│   └── telegram-bot/
│
├── backend/
│
│   ├── auth/
│   ├── users/
│   ├── permissions/
│   ├── tasks/
│   ├── projects/
│   ├── crm/
│   ├── messenger/
│   ├── files/
│   ├── notifications/
│   ├── automation/
│   ├── reports/
│   └── audit/
│
├── ai/
│
│   ├── gateway/
│   ├── tools/
│   ├── context/
│   ├── rag/
│   ├── risk/
│   └── prompts/
│
├── integrations/
│
│   ├── telegram/
│   ├── email/
│   ├── push/
│   └── calendar/
│
├── docs/
│
│   ├── architecture/
│   ├── api/
│   ├── database/
│   ├── security/
│   └── requirements/
│
├── tests/
│
└── README.md
```

---

# 📚 Documentation

По мере разработки в `/docs` необходимо поддерживать:

```text
Architecture

Database Schema

API Documentation

Permissions Matrix

AI Architecture

Deployment Guide

Backup Guide

Administrator Guide

User Guide
```

---

# ⚠️ Important

Особенно критичные части проекта:

1. система прав;
2. безопасность;
3. realtime messenger;
4. синхронизация клиентов;
5. deadline engine;
6. AI permissions;
7. AI sources;
8. AI hallucination control;
9. automation engine;
10. backup / restore.

Изменение этих компонентов должно обязательно проходить code review.

---

# 📌 Current Status

```text
Project: Corporate CRM with AI Assistant

Requirements:
✅ ТЗ v1.0 получено

Architecture:
🟡 In progress

Development:
🟡 Preparing

MVP:
⬜ Not released

Production:
⬜ Not released
```

---

# 📄 License / Rights

Проект является корпоративной разработкой.

Исключительные права на:

* исходный код;
* дизайн;
* документацию;
* схемы данных;
* разработанные компоненты

должны принадлежать Заказчику в соответствии с условиями проекта.

Использование сторонних библиотек допускается только при наличии лицензии, разрешающей необходимый вариант коммерческого использования.

---

# 🔒 Confidentiality

Исходный код, документация и корпоративные данные являются конфиденциальной информацией.

Данные компании не должны использоваться для обучения внешних ИИ-моделей.

---

# 📞 Project Contacts

```text
Product Owner:
TBD

Project Manager:
TBD

Backend:
TBD

Client:
TBD

AI / Integrations:
TBD
```

---

**Corporate CRM with AI Assistant**

`CRM • Tasks • Projects • Messenger • Automation • AI`
