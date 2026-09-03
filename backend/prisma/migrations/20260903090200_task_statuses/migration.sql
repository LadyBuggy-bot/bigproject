BEGIN;

INSERT INTO "TaskStatus" ("code", "name", "isTerminal") VALUES
('NEW', 'Новая', false),
('IN_PROGRESS', 'В работе', false),
('REVIEW', 'На проверке', false),
('DONE', 'Выполнена', true),
('CANCELLED', 'Отменена', true);

COMMIT;
