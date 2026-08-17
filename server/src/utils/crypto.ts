import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_secret_key_32_characters_long_!!';
const IV_LENGTH = 16;

/**
 * Encrypts a string value using AES-256-CBC.
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypts a hex-encoded string back to plaintext. Falls back to raw value on error.
 */
export function decrypt(text: string): string {
  if (!text) return '';
  
  // Basic validation to see if format matches 'iv:encrypted'
  if (!text.includes(':')) {
    return text; // Return raw value if not encrypted
  }

  try {
    const textParts = text.split(':');
    const ivHex = textParts.shift();
    const encryptedHex = textParts.join(':');

    if (!ivHex || !encryptedHex) return text;

    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    // Graceful fallback to return the raw input string if decryption fails
    return text;
  }
}
