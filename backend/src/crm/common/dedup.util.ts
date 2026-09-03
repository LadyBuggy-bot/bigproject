/**
 * К-5: контроль дублей клиентов по названию, ИНН, телефону и e-mail.
 *
 * DATA_MODEL.md п. 59: «совпадение клиента может проверяться по name, inn,
 * phone, email через отдельный duplicate detection service». Это его ядро.
 *
 * Модуль намеренно не зависит ни от Prisma, ни от Nest: чистые функции,
 * которые можно прогнать тестами без базы и без поднятого приложения.
 */

export const DedupKeyType = {
  INN: 'INN',
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  NAME: 'NAME',
} as const;

export type DedupKeyType = (typeof DedupKeyType)[keyof typeof DedupKeyType];

export interface DedupKey {
  type: DedupKeyType;
  value: string;
}

/** Организационно-правовые формы, которые не участвуют в сравнении названий. */
const LEGAL_FORMS = new Set([
  'ооо', 'оао', 'зао', 'пао', 'ао', 'ип', 'нко', 'ано', 'гуп', 'муп',
  'ltd', 'llc', 'inc', 'gmbh', 'corp',
]);

/**
 * «ООО «Ромашка»» и «Ромашка ООО» должны давать одно значение,
 * иначе один и тот же контрагент заводится дважды.
 */
export function normalizeName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`]/g, ' ')
    .replace(/[^a-zа-я0-9 ]/g, ' ');

  return cleaned
    .split(/\s+/)
    .filter((word) => word.length > 0 && !LEGAL_FORMS.has(word))
    .join(' ')
    .trim();
}

/** Российские номера приводятся к +7XXXXXXXXXX, остальные — к цифрам с плюсом. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length >= 11) return `+${digits}`;

  return null;
}

export function normalizeEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value) ? value : null;
}

export function normalizeInn(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 12 ? digits : null;
}

export interface DedupSource {
  name: string;
  inn?: string | null;
  phones?: string[];
  emails?: string[];
}

/** Собирает набор ключей клиента для записи в ClientDedupKey. */
export function buildDedupKeys(input: DedupSource): DedupKey[] {
  const keys: DedupKey[] = [];

  const name = normalizeName(input.name);
  if (name) keys.push({ type: DedupKeyType.NAME, value: name });

  if (input.inn) {
    const inn = normalizeInn(input.inn);
    if (inn) keys.push({ type: DedupKeyType.INN, value: inn });
  }

  for (const phone of input.phones ?? []) {
    const value = normalizePhone(phone);
    if (value) keys.push({ type: DedupKeyType.PHONE, value });
  }

  for (const email of input.emails ?? []) {
    const value = normalizeEmail(email);
    if (value) keys.push({ type: DedupKeyType.EMAIL, value });
  }

  // Один ключ мог прийти дважды — из карточки клиента и из его контактов
  const seen = new Set<string>();
  return keys.filter((key) => {
    const id = `${key.type}:${key.value}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Вес совпадения. Совпавший ИНН — практически наверняка тот же контрагент,
 * совпавшее название — только повод показать карточку пользователю.
 */
export const DEDUP_WEIGHT: Record<DedupKeyType, number> = {
  INN: 100,
  PHONE: 60,
  EMAIL: 60,
  NAME: 25,
};

/** Начиная с этого веса создание блокируется до решения пользователя. */
export const DEDUP_BLOCK_THRESHOLD = 60;

export interface DuplicateCandidate {
  clientId: string;
  name: string;
  score: number;
  matchedOn: DedupKeyType[];
}

/** Складывает вес совпавших ключей по каждому клиенту-кандидату. */
export function scoreCandidates(
  matches: Array<{ clientId: string; clientName: string; type: DedupKeyType }>,
): DuplicateCandidate[] {
  const byClient = new Map<string, DuplicateCandidate>();

  for (const match of matches) {
    const current = byClient.get(match.clientId) ?? {
      clientId: match.clientId,
      name: match.clientName,
      score: 0,
      matchedOn: [],
    };

    current.score += DEDUP_WEIGHT[match.type];
    if (!current.matchedOn.includes(match.type)) current.matchedOn.push(match.type);

    byClient.set(match.clientId, current);
  }

  return [...byClient.values()].sort((a, b) => b.score - a.score);
}
