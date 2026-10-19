import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export async function hashPasscode(passcode: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(passcode, salt);
}

export async function verifyPasscode(passcode: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(passcode, hash);
  } catch {
    return false;
  }
}

export function generateMeetingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let randomPart = '';
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) {
    randomPart += chars[bytes[i] % chars.length];
  }
  return `DFC-${randomPart}`;
}

export function generatePasscode(): string {
  const num = crypto.randomInt(1000, 9999);
  return `TACTIC-${num}`;
}

export function generateSessionIdentifier(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function sanitizeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
