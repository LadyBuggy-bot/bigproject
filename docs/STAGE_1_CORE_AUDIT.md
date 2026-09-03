# Stage 1 Core — аудит и порядок реализации

Проверка 2026-09-03. Исходный develop: `45be53ab77fff9268d984ed3b8d4808604d29223`.
CRM PR #8 открыт, не слит: `ff1da76cfdb135584cc017de15f3840b72563f9f`.
Локальная `feature/stage-1-core` основана на этом CRM commit для проверки совместимости.
Это зависимая ветка: перед PR в develop нужно согласовать порядок слияния #8.

## Найдено до изменений

- В develop backend содержит только `.gitkeep`; миграций и реализации Core нет.
- PR #8 добавляет NestJS 11, Prisma 6, Node 24, модульную Prisma schema,
  health endpoint, Swagger и dedup utility с 18 тестами.
- CRM User ID пока скаляры без FK. Нужны Client/Deal responsibleUser,
  DealStageHistory.changedBy и Activity.user.
- Activity.occurredAt уже обязательное поле, с индексами для ленты. Его не нужно добавлять второй раз.
- Deal.nextActionAt — дата, НЕ внешний ключ на Task. Связь должна идти через Task.dealId.
- Миграций в PR нет; добавление первой миграции требует различать новую БД и БД после db push.
- PERMISSIONS.md требует effect ALLOW/DENY для ACL, DATA_MODEL его не перечисляет.
- Task относится к Stage 2. Здесь нужен минимальный контракт данных, не весь модуль задач.
- Полный Stage 1 в README также включает Files/Notifications; текущая работа сначала закрывает перечисленные зависимости CRM.

## Этапы

1. Core schema: User/Department/Roles/Permissions/ACL/Session/AuditLog; FK и миграции.
2. Auth: password hashing, access JWT, ротация refresh, отзыв сессий, CurrentUser и guards.
3. PermissionService: базовые права, scope, рекурсивные подчинённые, DENY priority,
   фильтрация полей; Users/Roles operations с транзакционным аудитом.
4. EventsGateway: авторизация Socket.IO, персональные комнаты; BullMQ queue `crm`.
5. Минимальная Task schema и проверка Activity.occurredAt; контракт для CRM.
6. Проверки schema, lint, types, tests, build. Интеграционные проверки PostgreSQL/Valkey
   отдельно, только на выделенной тестовой базе.

## Решения для ревью команды

- ACL effect берётся из PERMISSIONS.md, default DENY.
- Для пользовательских ролей область доступа по умолчанию EXPLICIT; расширять её
  нужно явно. Наличие permission само по себе не означает ALL.
- occurredAt сохраняет исходную дату события. Исторические даты нельзя восстанавливать
  из createdAt без пометки о приблизительности; миграция не должна их выдумывать.
- Остальные 10 предложений CRM остаются на обсуждении, использование PR как базы не означает их утверждение.

Удалённые ветки и общая БД в ходе аудита не изменялись.

## Результат локальной реализации

Реализованы зависимости CRM, административные операции, 2FA, Files и Notifications.
Добавлены 4 миграции: CRM baseline, Core/Task/FK, начальные статусы Task,
security/files/notifications. Все изменения остаются локальными.
Prisma validate, TypeScript, ESLint и build проходят; 59 автоматических тестов проходят.
SQL миграций дополнительно применён к отдельному PostgreSQL-движку PGlite в памяти:
проверены внешние ключи, запрет удаления пользователей с историей, статусы Task,
обязательная фактическая дата Activity и default DENY.
Сквозной Nest HTTP-тест работает с настоящим Prisma поверх PGlite PostgreSQL-протокола:
проверены роли, 2FA, файлы/ACL, inbox и увольнение с передачей ответственности.
AWS S3 SDK проверен на изолированном HTTP fixture. После разрешённой установки Docker/WSL
и перезагрузки прошёл отдельный opt-in тест настоящих PostgreSQL/Valkey/SeaweedFS:
конкурентный CAS сессии, выполнение задания BullMQ, S3 upload/read/delete.
Все 4 миграции применены к пустой тестовой базе. Исправлена обнаруженная ошибка настройки:
prisma.config.ts теперь явно указывает папку migrations для разнесённой схемы.
Стенд: backend/test/compose.infrastructure.yml, доступ только через loopback.

Полный состав, ограничения и инструкция: [STAGE_1_CORE_HANDOFF.md](STAGE_1_CORE_HANDOFF.md).
