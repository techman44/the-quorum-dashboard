/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth
 * Used for secure OAuth flows without client secrets
 */

/**
 * Generate cryptographically random bytes
 */
function generateRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Base64URL encode a string or bytes
 */
function base64UrlEncode(data: string | Uint8Array | ArrayBuffer): string {
  let str: string;
  if (typeof data === 'string') {
    str = data;
  } else if (data instanceof ArrayBuffer) {
    str = String.fromCharCode(...new Uint8Array(data));
  } else {
    str = String.fromCharCode(...data);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * SHA-256 hash of a string
 */
async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

/**
 * Generate PKCE verifier and challenge
 *
 * The verifier is a cryptographically random string.
 * The challenge is the base64url-encoded SHA-256 hash of the verifier.
 */
export async function generatePKCE(): Promise<{
  verifier: string;
  challenge: string;
}> {
  // Verifier: 43-128 characters (we use 64 random bytes, base64url encoded)
  const randomBytes = generateRandomBytes(64);
  const verifier = base64UrlEncode(randomBytes);
  const challenge = base64UrlEncode(await sha256(verifier));
  return { verifier, challenge };
}

/**
 * Generate a random state parameter for CSRF protection
 */
export function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
