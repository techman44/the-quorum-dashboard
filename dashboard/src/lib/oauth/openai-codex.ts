/**
 * OpenAI Codex OAuth Implementation
 *
 * Implements PKCE flow for OpenAI OAuth (ChatGPT subscription login)
 * Allows users to authenticate with their ChatGPT account instead of API keys
 *
 * Based on OpenAI's OAuth 2.0 specification:
 * - Authorization URL: https://auth.openai.com/oauth/authorize
 * - Token URL: https://auth.openai.com/oauth/token
 * - Uses PKCE (Proof Key for Code Exchange) for security
 */

// OpenAI OAuth configuration
// To use OAuth, you need to create your own OAuth app at: https://platform.openai.com/docs/quickstart
const OPENAI_OAUTH_CONFIG = {
  // Use environment variable for custom OAuth app, or the Codex CLI client as fallback
  clientId: process.env.OPENAI_OAUTH_CLIENT_ID || '',
  clientSecret: process.env.OPENAI_OAUTH_CLIENT_SECRET || '',
  authorizationUrl: 'https://auth.openai.com/oauth/authorize',
  tokenUrl: 'https://auth.openai.com/oauth/token',
  scope: 'openid profile email offline_access',
  // Redirect will be set dynamically based on the request
};

export interface OAuthState {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  providerId?: string; // Optional: link to existing provider
}

export interface AuthorizationFlowResult {
  url: string;
  state: string;
}

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  idToken?: string;
}

export interface OpenAIMetadata {
  accountId?: string;
  email?: string;
  name?: string;
}

/**
 * Create an authorization URL for OpenAI OAuth flow
 *
 * @param redirectUri - The callback URL (e.g., /api/auth/openai/callback)
 * @param state - Optional custom state string (generated if not provided)
 * @returns The authorization URL and state parameter
 */
export async function createAuthorizationFlow(
  redirectUri: string,
  state?: string
): Promise<AuthorizationFlowResult & { codeVerifier: string }> {
  // Import PKCE functions
  const { generatePKCE, generateState } = await import('./pkce');

  // Generate PKCE verifier and challenge
  const { verifier, challenge } = await generatePKCE();

  // Generate or use provided state
  const authState = state || generateState();

  // Build authorization URL
  // Use the same parameters as OpenClaw for compatibility
  const params = new URLSearchParams({
    client_id: OPENAI_OAUTH_CONFIG.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OPENAI_OAUTH_CONFIG.scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: authState,
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    originator: 'quorum-dashboard',
  });

  const url = `${OPENAI_OAUTH_CONFIG.authorizationUrl}?${params.toString()}`;

  return {
    url,
    state: authState,
    codeVerifier: verifier,
  };
}

/**
 * Exchange authorization code for access tokens
 *
 * @param code - The authorization code from the callback
 * @param codeVerifier - The PKCE code verifier from the authorization flow
 * @param redirectUri - The same redirect URI used in the authorization flow
 * @returns The tokens and metadata
 */
export async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<TokenExchangeResult> {
  const bodyParams: Record<string, string> = {
    client_id: OPENAI_OAUTH_CONFIG.clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  };

  // Include client_secret if available (for confidential OAuth apps)
  if (OPENAI_OAUTH_CONFIG.clientSecret) {
    bodyParams.client_secret = OPENAI_OAUTH_CONFIG.clientSecret;
  } else {
    // Public client (PKCE) - include code verifier
    bodyParams.code_verifier = codeVerifier;
  }

  const response = await fetch(OPENAI_OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(bodyParams),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    idToken: data.id_token,
  };
}

/**
 * Refresh an expired access token
 *
 * @param refreshToken - The refresh token from the initial exchange
 * @returns New access token and refresh token
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<TokenExchangeResult> {
  const response = await fetch(OPENAI_OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
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
    refreshToken: data.refresh_token || refreshToken, // Some providers don't rotate refresh tokens
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
    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode the payload (middle part)
    const payload = parts[1];

    // Base64URL decode
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');

    // Decode to string and parse JSON
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
export function extractMetadataFromIdToken(idToken: string): OpenAIMetadata {
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

/**
 * Calculate the expiration date from expiresIn seconds
 *
 * @param expiresIn - Seconds until expiration
 * @returns The expiration Date
 */
export function calculateExpirationDate(expiresIn: number): Date {
  return new Date(Date.now() + expiresIn * 1000);
}
