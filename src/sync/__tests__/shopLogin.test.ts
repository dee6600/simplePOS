import { formatPhone, normalizePhone, personCredentials } from '../shopLogin';

test('accepts the ways people type an Indian mobile number', () => {
  for (const input of ['9876543210', '98765 43210', '+91 98765 43210', '+91-98765-43210', '09876543210', '919876543210']) {
    expect(normalizePhone(input)).toBe('919876543210');
  }
});

test('rejects things that are not a mobile number', () => {
  for (const input of ['', '12345', '1234567890', '98765432', '9876543210123', 'abc']) {
    expect(normalizePhone(input)).toBeNull();
  }
});

test('each person gets a stable login derived from their number', () => {
  const a = personCredentials('919876543210');
  expect(a).toEqual(personCredentials('919876543210'));
  expect(a.email).toBe('919876543210@family.simplepos.app');
  expect(a.password.length).toBeGreaterThanOrEqual(6); // Firebase minimum
  expect(personCredentials('919123456789').email).not.toBe(a.email);
  expect(formatPhone('919876543210')).toBe('98765 43210');
});
