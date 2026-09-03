import {
  buildDedupKeys,
  DEDUP_BLOCK_THRESHOLD,
  DedupKeyType,
  normalizeEmail,
  normalizeInn,
  normalizeName,
  normalizePhone,
  scoreCandidates,
} from './dedup.util';

describe('normalizeName', () => {
  it('убирает организационно-правовую форму и кавычки', () => {
    expect(normalizeName('ООО «Ромашка»')).toBe('ромашка');
    expect(normalizeName('Ромашка')).toBe('ромашка');
    expect(normalizeName('ЗАО "РОМАШКА"')).toBe('ромашка');
  });

  it('приводит ё к е', () => {
    expect(normalizeName('Артём и партнёры')).toBe('артем и партнеры');
  });

  it('схлопывает лишние пробелы и знаки', () => {
    expect(normalizeName('  Ромашка -  Строй  ')).toBe('ромашка строй');
  });

  it('не склеивает разные компании', () => {
    expect(normalizeName('ООО Ромашка')).not.toBe(normalizeName('ООО Василёк'));
  });
});

describe('normalizePhone', () => {
  it('приводит российские номера к единому виду', () => {
    const expected = '+79991234567';
    expect(normalizePhone('8 999 123-45-67')).toBe(expected);
    expect(normalizePhone('+7 (999) 123-45-67')).toBe(expected);
    expect(normalizePhone('79991234567')).toBe(expected);
    expect(normalizePhone('9991234567')).toBe(expected);
  });

  it('отбрасывает то, что телефоном не является', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('не телефон')).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('приводит к нижнему регистру и обрезает пробелы', () => {
    expect(normalizeEmail('  Ivan@Romashka.RU ')).toBe('ivan@romashka.ru');
  });

  it('отбрасывает невалидные адреса', () => {
    expect(normalizeEmail('ivan@')).toBeNull();
    expect(normalizeEmail('ivan.romashka.ru')).toBeNull();
  });
});

describe('normalizeInn', () => {
  it('принимает 10 и 12 цифр', () => {
    expect(normalizeInn('7701234567')).toBe('7701234567');
    expect(normalizeInn('770123456789')).toBe('770123456789');
    expect(normalizeInn('77 01 23 45 67')).toBe('7701234567');
  });

  it('отбрасывает неверную длину', () => {
    expect(normalizeInn('77012345')).toBeNull();
  });
});

describe('buildDedupKeys', () => {
  it('собирает ключи всех четырёх типов', () => {
    const keys = buildDedupKeys({
      name: 'ООО «Ромашка»',
      inn: '7701234567',
      phones: ['8 999 123-45-67'],
      emails: ['Ivan@Romashka.RU'],
    });

    expect(keys).toEqual(
      expect.arrayContaining([
        { type: DedupKeyType.NAME, value: 'ромашка' },
        { type: DedupKeyType.INN, value: '7701234567' },
        { type: DedupKeyType.PHONE, value: '+79991234567' },
        { type: DedupKeyType.EMAIL, value: 'ivan@romashka.ru' },
      ]),
    );
    expect(keys).toHaveLength(4);
  });

  it('не дублирует одинаковые ключи', () => {
    const keys = buildDedupKeys({
      name: 'Ромашка',
      phones: ['8 999 123-45-67', '+7 (999) 123-45-67'],
    });

    expect(keys.filter((k) => k.type === DedupKeyType.PHONE)).toHaveLength(1);
  });

  it('молча пропускает мусорные значения', () => {
    const keys = buildDedupKeys({
      name: 'Ромашка',
      inn: 'нет',
      phones: ['123'],
      emails: ['ivan@'],
    });

    expect(keys).toEqual([{ type: DedupKeyType.NAME, value: 'ромашка' }]);
  });

  it('два написания одной компании дают одинаковый набор ключей', () => {
    const a = buildDedupKeys({ name: 'ООО «Ромашка»', inn: '7701234567' });
    const b = buildDedupKeys({ name: 'Ромашка ООО', inn: '77 01 23 45 67' });

    expect(a).toEqual(b);
  });
});

describe('scoreCandidates', () => {
  it('складывает веса и сортирует по убыванию', () => {
    const result = scoreCandidates([
      { clientId: 'a', clientName: 'Ромашка', type: DedupKeyType.NAME },
      { clientId: 'b', clientName: 'Ромашка-Строй', type: DedupKeyType.INN },
      { clientId: 'b', clientName: 'Ромашка-Строй', type: DedupKeyType.PHONE },
    ]);

    expect(result[0].clientId).toBe('b');
    expect(result[0].score).toBe(160);
    expect(result[1].score).toBe(25);
  });

  it('совпадение только по названию не блокирует создание', () => {
    const [candidate] = scoreCandidates([
      { clientId: 'a', clientName: 'Ромашка', type: DedupKeyType.NAME },
    ]);

    expect(candidate.score).toBeLessThan(DEDUP_BLOCK_THRESHOLD);
  });

  it('совпадение по ИНН блокирует создание', () => {
    const [candidate] = scoreCandidates([
      { clientId: 'a', clientName: 'Ромашка', type: DedupKeyType.INN },
    ]);

    expect(candidate.score).toBeGreaterThanOrEqual(DEDUP_BLOCK_THRESHOLD);
  });

  it('не повторяет тип в matchedOn', () => {
    const [candidate] = scoreCandidates([
      { clientId: 'a', clientName: 'Ромашка', type: DedupKeyType.PHONE },
      { clientId: 'a', clientName: 'Ромашка', type: DedupKeyType.PHONE },
    ]);

    expect(candidate.matchedOn).toEqual([DedupKeyType.PHONE]);
  });
});
