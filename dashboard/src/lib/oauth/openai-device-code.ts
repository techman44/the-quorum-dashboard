/**
 * OpenAI Device Code OAuth Implementation
 *
 * Implements the device code flow for OpenAI OAuth (ChatGPT subscription login)
 * This is the RECOMMENDED method for remote/headless environments.
 *
 * Flow:
 * 1. Server requests device code from OpenAI
 * 2. User is shown a URL and one-time code
 * 3. User opens URL in browser and enters code
 * 4. Server polls for token completion
 * 5. Tokens are returned when user completes auth
 *
 * Based on: https://developers.openai.com/codex/auth/
 */

const OPENAI_OAUTH_CONFIG = {
  clientId: process.env.OPENAI_OAUTH_CLIENT_ID || 'app_EMoamEEZ73f0CkXaXp7hrann',
  deviceCodeUrl: 'https://auth.openai.com/oauth/device/code',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  scope: 'openid profile email offline_access',
};

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  idToken?: string;
}

export interface DeviceAuthPollResult {
  status: 'pending' | 'complete' | 'error' | 'expired' | 'slow_down';
  tokens?: DeviceTokenResponse;
  error?: string;
}

/**
 * Step 1: Request a device code from OpenAI
 *
 * Note: This endpoint is protected by Cloudflare and may block requests from
 * server environments. Consider using the PKCE flow instead for better reliability.
 *
 * @returns Device code response with user code and verification URL
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const response = await fetch(OPENAI_OAUTH_CONFIG.deviceCodeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Origin': 'https://chat.openai.com',
      'Referer': 'https://chat.openai.com/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
    },
    body: new URLSearchParams({
      client_id: OPENAI_OAUTH_CONFIG.clientId,
      scope: OPENAI_OAUTH_CONFIG.scope,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    // Check for Cloudflare challenge page
    if (errorText.includes('Just a moment') || errorText.includes('cf_chl_opt')) {
      throw new Error(
        'Device code flow is blocked by Cloudflare protection. ' +
        'Please use the browser-based OAuth flow instead by clicking "Connect with OpenAI" ' +
        'which will open a browser window for authentication.'
      );
    }

    throw new Error(`Device code request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    verificationUriComplete: data.verification_uri_complete,
    expiresIn: data.expires_in,
    interval: data.interval || 5, // Default to 5 seconds if not provided
  };
}

/**
 * Step 2: Poll for token completion
 *
 * The server polls this endpoint until the user completes auth in browser.
 *
 * @param deviceCode - The device code from requestDeviceCode()
 * @param signal - Optional AbortSignal to cancel polling
 * @returns Token response when auth is complete
 */
export async function pollForToken(
  deviceCode: string,
  signal?: AbortSignal
): Promise<DeviceTokenResponse> {
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes with 5-second intervals
  const intervalMs = 5000; // 5 seconds

  while (attempts < maxAttempts) {
    if (signal?.aborted) {
      throw new Error('Polling aborted');
    }

    const response = await fetch(OPENAI_OAUTH_CONFIG.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Origin': 'https://chat.openai.com',
        'Referer': 'https://chat.openai.com/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
      },
      body: new URLSearchParams({
        client_id: OPENAI_OAUTH_CONFIG.clientId,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: deviceCode,
      }),
      signal,
    });

    const data = await response.json();

    if (response.ok) {
      // Success! User completed auth
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        idToken: data.id_token,
      };
    }

    // Handle errors
    const error = data.error;

    if (error === 'authorization_pending') {
      // User hasn't completed auth yet, wait and retry
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      attempts++;
      continue;
    }

    if (error === 'slow_down') {
      // Polling too fast, increase interval
      await new Promise((resolve) => setTimeout(resolve, intervalMs * 2));
      attempts++;
      continue;
    }

    if (error === 'expired_token') {
      throw new Error('Device code has expired. Please restart the authentication.');
    }

    if (error === 'access_denied') {
      throw new Error('Authentication was denied by the user.');
    }

    // Unknown error
    throw new Error(`Token polling error: ${error || data.error_description || 'Unknown error'}`);
  }

  throw new Error('Authentication timed out. Please try again.');
}

/**
 * Verify a device code (one-time check, doesn't poll)
 *
 * Use this for manual status checks from the frontend.
 *
 * @param deviceCode - The device code to verify
 * @returns Poll result with status
 */
export async function verifyDeviceCode(deviceCode: string): Promise<DeviceAuthPollResult> {
  const response = await fetch(OPENAI_OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Origin': 'https://chat.openai.com',
      'Referer': 'https://chat.openai.com/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
    },
    body: new URLSearchParams({
      client_id: OPENAI_OAUTH_CONFIG.clientId,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
    }),
  });

  if (response.ok) {
    const data = await response.json();
    return {
      status: 'complete',
      tokens: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        idToken: data.id_token,
      },
    };
  }

  const data = await response.json();
  const error = data.error;

  if (error === 'authorization_pending') {
    return { status: 'pending' };
  }

  if (error === 'slow_down') {
    return { status: 'slow_down' };
  }

  if (error === 'expired_token') {
    return { status: 'expired', error: 'Device code has expired' };
  }

  if (error === 'access_denied') {
    return { status: 'error', error: 'Authentication was denied' };
  }

  return { status: 'error', error: data.error_description || 'Unknown error' };
}

/**
 * Refresh an expired access token (same as PKCE flow)
 *
 * @param refreshToken - The refresh token from the initial exchange
 * @returns New access token and refresh token
 */
export async function refreshDeviceAccessToken(
  refreshToken: string
): Promise<DeviceTokenResponse> {
  const response = await fetch(OPENAI_OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Origin': 'https://chat.openai.com',
      'Referer': 'https://chat.openai.com/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
    },
    body: new URLSearchParams({
      client_id: OPENAI_OAUTH_CONFIG.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in,
    idToken: data.id_token,
  };
}

/**
 * Decode a JWT token (without verification, for metadata extraction)
 *
 * @param token - The JWT token to decode
 * @returns The decoded payload
 */
export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

/**
 * Extract metadata from an OpenAI ID token
 *
 * @param idToken - The OpenID Connect ID token
 * @returns Extracted user metadata
 */
export function extractMetadataFromIdToken(idToken: string): {
  accountId?: string;
  email?: string;
  name?: string;
} {
  const payload = decodeJwt(idToken);

  if (!payload) {
    return {};
  }

  return {
    accountId: payload.sub as string | undefined,
    email: payload.email as string | undefined,
    name: payload.name as string | undefined,
  };
}

/**
 * Calculate the expiration date from expiresIn seconds
 *
 * @param expiresIn - Seconds until expiration
 * @returns The expiration Date
 */
export function calculateExpirationDate(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}

/**
 * Validate if an access token is expired or close to expiration
 *
 * @param expiresAt - The expiration timestamp
 * @param bufferSeconds - Buffer time in seconds (default: 300 = 5 minutes)
 * @returns True if the token is expired or close to expiration
 */
export function isTokenExpired(
  expiresAt: Date | string | null,
  bufferSeconds: number = 300
): boolean {
  if (!expiresAt) {
    return true;
  }

  const expirationTime = typeof expiresAt === 'string'
    ? new Date(expiresAt)
    : expiresAt;

  const now = new Date();
  const bufferTime = new Date(now.getTime() + bufferSeconds * 1000);

  return bufferTime >= expirationTime;
}
