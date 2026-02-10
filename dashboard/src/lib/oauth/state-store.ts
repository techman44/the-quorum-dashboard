/**
 * OAuth State Storage
 *
 * Stores OAuth state parameters for PKCE flow validation.
 * Uses an in-memory Map with auto-cleanup for expired states.
 */

interface StoredOAuthState {
  codeVerifier: string;
  redirectUri: string;
  providerId?: string;
  createdAt: Date;
}

// In-memory storage with automatic cleanup
const stateStore = new Map<string, StoredOAuthState>();
const STATE_TTL = 10 * 60 * 1000; // 10 minutes

// Clean up expired states periodically
setInterval(() => {
  const now = Date.now();
  const expiredStates: string[] = [];

  for (const [state, data] of stateStore.entries()) {
    if (now - data.createdAt.getTime() > STATE_TTL) {
      expiredStates.push(state);
    }
  }

  for (const state of expiredStates) {
    stateStore.delete(state);
  }

  if (expiredStates.length > 0) {
    console.log(`Cleaned up ${expiredStates.length} expired OAuth states`);
  }
}, 60 * 1000); // Check every minute

/**
 * Store OAuth state parameters
 *
 * @param state - The state parameter from the authorization flow
 * @param codeVerifier - The PKCE code verifier
 * @param redirectUri - The redirect URI used
 * @param providerId - Optional provider ID to link after OAuth
 */
export function storeOAuthState(
  state: string,
  codeVerifier: string,
  redirectUri: string,
  providerId?: string
): void {
  stateStore.set(state, {
    codeVerifier,
    redirectUri,
    providerId,
    createdAt: new Date(),
  });
}

/**
 * Retrieve and remove OAuth state parameters
 *
 * @param state - The state parameter from the callback
 * @returns The stored state data or null if not found/expired
 */
export function consumeOAuthState(state: string): StoredOAuthState | null {
  const data = stateStore.get(state);

  if (!data) {
    return null;
  }

  // Check if expired
  const age = Date.now() - data.createdAt.getTime();
  if (age > STATE_TTL) {
    stateStore.delete(state);
    return null;
  }

  // Remove from store (consume it)
  stateStore.delete(state);

  return data;
}

/**
 * Check if a state exists without consuming it
 *
 * @param state - The state parameter
 * @returns True if the state exists and is valid
 */
export function hasValidState(state: string): boolean {
  const data = stateStore.get(state);

  if (!data) {
    return false;
  }

  const age = Date.now() - data.createdAt.getTime();
  return age <= STATE_TTL;
}
