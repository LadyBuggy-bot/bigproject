import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Конфигурация Prisma CLI.
 *
 * Две задачи:
 *
 * 1. Указать папку схемы. Схема разнесена по файлам (schema.prisma + crm.prisma
 *    и далее по модулю на файл), чтобы разработчики не воевали за один файл
 *    при параллельной работе — DEVELOPMENT.md п. 15 прямо про этот риск.
 *
 * 2. Подтянуть .env из корня репозитория. DEVELOPMENT.md п. 5 держит один .env
 *    на весь проект, а Prisma по умолчанию ищет его рядом с собой, в backend/.
 *    Без этого prisma db push и migrate падают на отсутствии DATABASE_URL.
 *    process.loadEnvFile — встроенный в Node 20.12+, отдельная зависимость
 *    не нужна (в проекте Node 24, см. .nvmrc).
 */

const rootEnv = path.join(__dirname, '..', '.env');

try {
  process.loadEnvFile(rootEnv);
} catch {
  // .env может отсутствовать — например в CI, где переменные приходят
  // из окружения. Это не ошибка: команды, которым нужна база, сообщат сами.
}

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema'),
});
