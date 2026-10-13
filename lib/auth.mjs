import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export function hashPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 200) {
    throw new Error('Das Passwort muss zwischen 12 und 200 Zeichen lang sein.');
  }
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
}
export function checkPassword(value, stored) {
  if (typeof value !== 'string' || value.length > 200) return false;
  const [salt, hash] = stored.split(':');
  const actual = scryptSync(value, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export function canRead(user, visibility, realms = []) {
  if (typeof realms === 'string') { try { realms = JSON.parse(realms); } catch { realms = []; } }
  return user.role === 'gm' || visibility === 'public' ||
    (visibility === 'empire' && !!user.empire_id && Array.isArray(realms) && realms.includes(user.empire_id));
}
export function canReadRecord(user, record) {
  return !!record && (user.role === 'gm' || ((record.kind !== 'report' || record.status === 'published') && canRead(user, record.visibility, record.visibility_realms)));
}
