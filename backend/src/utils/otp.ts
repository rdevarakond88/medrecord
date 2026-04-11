import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SALT_ROUNDS = 10;
const TEST_BYPASS_OTP = '000000';

// ─── OTP (low entropy — use bcrypt) ──────────────────────────────────────────

export function generateOtp(): string {
  // Cryptographically random 6-digit number
  const buf = crypto.randomBytes(3);
  const num = ((buf[0] << 16) | (buf[1] << 8) | buf[2]) % 1_000_000;
  return num.toString().padStart(6, '0');
}

export function generateOtpToken(): string {
  return 'tok_' + crypto.randomBytes(16).toString('hex');
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, SALT_ROUNDS);
}

export async function checkOtp(otp: string, hash: string): Promise<boolean> {
  if (process.env.TEST_OTP_BYPASS === 'true' && otp === TEST_BYPASS_OTP) {
    return true;
  }
  return bcrypt.compare(otp, hash);
}

// ─── Refresh tokens (high entropy — SHA-256 is sufficient) ───────────────────

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
