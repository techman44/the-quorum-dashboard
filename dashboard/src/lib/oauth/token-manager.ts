/**
 * OAuth Token Manager
 *
 * Manages automatic token refresh for OAuth-enabled providers.
 * Can be called periodically or before API requests to ensure valid tokens.
 */

import { getAIProvider, listAIProviders, updateProviderOAuthTokens } from '@/lib/db';
import { refreshAccessToken, calculateExpirationDate } from './openai-codex';

interface TokenRefreshResult {
  providerId: string;
  success: boolean;
  error?: string;
}

/**
 * Refresh OAuth token for a specific provider if needed
 *
 * @param providerId - The provider ID
 * @returns True if the token is valid (either not expired or successfully refreshed)
 */
export async function ensureValidToken(providerId: string): Promise<boolean> {
  const provider = await getAIProvider(providerId);

  if (!provider?.oauthRefreshToken) {
    return false;
  }

  // Check if token needs refresh (within 5 minutes of expiration)
  const expiresAt = provider.oauthExpiresAt;
  const isExpired = !expiresAt || new Date(expiresAt) < new Date(Date.now() + 5 * 60 * 1000);

  if (!isExpired) {
    return true; // Token is still valid
  }

  // Token needs refresh
  try {
    const newTokens = await refreshAccessToken(provider.oauthRefreshToken);
    const expiresAt = calculateExpirationDate(newTokens.expiresIn);

    await updateProviderOAuthTokens(providerId, {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresAt,
    });

    return true;
  } catch (error) {
    console.error(`Failed to refresh token for provider ${providerId}:`, error);
    return false;
  }
}

/**
 * Refresh all expired OAuth tokens for all providers
 *
 * @returns Results of the refresh operation for each provider
 */
export async function refreshExpiredTokens(): Promise<TokenRefreshResult[]> {
  const providers = await listAIProviders();
  const oauthProviders = providers.filter(
    (p) => p.providerType === 'openai' && p.oauthRefreshToken
  );

  const results: TokenRefreshResult[] = [];

  for (const provider of oauthProviders) {
    const expiresAt = provider.oauthExpiresAt;
    const isExpired = !expiresAt || new Date(expiresAt) < new Date(Date.now() + 5 * 60 * 1000);

    if (isExpired) {
      try {
        const newTokens = await refreshAccessToken(provider.oauthRefreshToken!);
        const expiresAt = calculateExpirationDate(newTokens.expiresIn);

        await updateProviderOAuthTokens(provider.id, {
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken,
          expiresAt,
        });

        results.push({ providerId: provider.id, success: true });
      } catch (error) {
        results.push({
          providerId: provider.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  return results;
}

/**
 * Get a valid access token for a provider, refreshing if necessary
 *
 * @param providerId - The provider ID
 * @returns The access token or null if unavailable
 */
export async function getAccessToken(providerId: string): Promise<string | null> {
  const provider = await getAIProvider(providerId);

  if (!provider?.oauthToken) {
    return null;
  }

  // Ensure token is valid
  const isValid = await ensureValidToken(providerId);

  if (!isValid) {
    return null;
  }

  // Get fresh provider data
  const freshProvider = await getAIProvider(providerId);
  return freshProvider?.oauthToken || null;
}
