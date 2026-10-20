import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export async function hashPasscode(passcode: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(passcode, salt);
}

export async function verifyPasscode(passcode: string, hash: string): Promise<boolean> {
  try {
    const raw = (passcode || '').trim();
    if (!raw) return false;
    // 1. Direct match
    if (await bcrypt.compare(raw, hash)) return true;
    // 2. Uppercase match
    if (await bcrypt.compare(raw.toUpperCase(), hash)) return true;
    // 3. Normalized TACTIC- prefix match
    if (!raw.toUpperCase().startsWith('TACTIC-')) {
      if (await bcrypt.compare(`TACTIC-${raw.toUpperCase()}`, hash)) return true;
    } else {
      // Stripped TACTIC- prefix match
      const stripped = raw.replace(/^TACTIC-/i, '').trim();
      if (stripped && (await bcrypt.compare(stripped, hash))) return true;
    }
    return false;
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
