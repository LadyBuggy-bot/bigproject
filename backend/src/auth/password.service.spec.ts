import { PasswordService } from './password.service';
test('password hashes are salted and reject incorrect/malformed credentials', async () => {
  const service = new PasswordService();
  const first = await service.hash('long test password');
  const second = await service.hash('long test password');
  expect(first).not.toBe(second);
  expect(await service.verify('long test password', first)).toBe(true);
  expect(await service.verify('wrong', first)).toBe(false);
  expect(await service.verify('wrong', undefined)).toBe(false);
  expect(await service.verify('wrong', 'malformed')).toBe(false);
});
