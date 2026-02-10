import { NextRequest, NextResponse } from 'next/server';
import { exchangeAuthorizationCode, extractMetadataFromIdToken, calculateExpirationDate } from '@/lib/oauth/openai-codex';
import { consumeOAuthState } from '@/lib/oauth/state-store';
import { createAIProvider, updateAIProvider, listAIProviders } from '@/lib/db';
import { encryptApiKey } from '@/lib/ai/encryption';

/**
 * GET /api/auth/openai/callback
 *
 * Handles the OAuth callback from OpenAI.
 * Exchanges the authorization code for tokens and stores them.
 *
 * Query parameters:
 * - code: The authorization code
 * - state: The state parameter from the authorization flow
 * - error: Error code if authorization failed
 *
 * Redirects to the settings page with success or error status.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
      console.error('OAuth error:', error, errorDescription);
      return redirectToSettings('error', errorDescription || error);
    }

    // Validate required parameters
    if (!code || !state) {
      return redirectToSettings('error', 'Missing required parameters');
    }

    // Consume and validate the state
    const stateData = consumeOAuthState(state);

    if (!stateData) {
      return redirectToSettings('error', 'Invalid or expired state parameter');
    }

    // Exchange the authorization code for tokens
    const tokenResult = await exchangeAuthorizationCode(
      code,
      stateData.codeVerifier,
      stateData.redirectUri
    );

    // Extract metadata from ID token if available
    let metadata: Record<string, unknown> = {};
    let accountId: string | undefined;

    if (tokenResult.idToken) {
      const extracted = extractMetadataFromIdToken(tokenResult.idToken);
      accountId = extracted.accountId;
      metadata = {
        ...extracted,
        oauthProvider: 'openai',
        connectedAt: new Date().toISOString(),
      };
    } else {
      metadata = {
        oauthProvider: 'openai',
        connectedAt: new Date().toISOString(),
      };
    }

    // Calculate token expiration
    const expiresAt = calculateExpirationDate(tokenResult.expiresIn);

    // Check if we're linking to an existing provider or creating a new one
    if (stateData.providerId) {
      // Update existing provider with OAuth credentials
      const existingProvider = await updateAIProvider(stateData.providerId, {
        metadata: {
          ...metadata,
          oauthAccessToken: tokenResult.accessToken,
          oauthRefreshToken: tokenResult.refreshToken,
          oauthExpiresAt: expiresAt.toISOString(),
          oauthAccountId: accountId,
        },
      });

      if (!existingProvider) {
        return redirectToSettings('error', 'Provider not found');
      }

      // Store OAuth tokens in the database (we'll add these columns)
      // For now, store in metadata as a fallback
      await pool.query(
        `UPDATE quorum_ai_providers
         SET oauth_token = $1,
             oauth_refresh_token = $2,
             oauth_expires_at = $3,
             metadata = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [
          tokenResult.accessToken,
          tokenResult.refreshToken,
          expiresAt,
          JSON.stringify(metadata),
          stateData.providerId,
        ]
      );

      return redirectToSettings('success', 'OAuth credentials linked to provider');
    } else {
      // Create a new provider with OAuth credentials
      const providerName = accountId
        ? `OpenAI (${accountId})`
        : `OpenAI OAuth (${new Date().toLocaleDateString()})`;

      // Check if a provider with this account already exists
      const existingProviders = await listAIProviders();
      const existingProvider = existingProviders.find(
        (p) => p.metadata?.oauthAccountId === accountId
      );

      if (existingProvider) {
        // Update existing provider
        await pool.query(
          `UPDATE quorum_ai_providers
           SET oauth_token = $1,
               oauth_refresh_token = $2,
               oauth_expires_at = $3,
               metadata = $4,
               updated_at = NOW()
           WHERE id = $5`,
          [
            tokenResult.accessToken,
            tokenResult.refreshToken,
            expiresAt,
            JSON.stringify({
              ...existingProvider.metadata,
              ...metadata,
              oauthAccessToken: tokenResult.accessToken,
              oauthRefreshToken: tokenResult.refreshToken,
              oauthExpiresAt: expiresAt.toISOString(),
            }),
            existingProvider.id,
          ]
        );

        return redirectToSettings('success', 'OAuth credentials updated');
      }

      // Create new provider with OAuth
      const result = await pool.query(
        `INSERT INTO quorum_ai_providers
         (provider_type, name, is_enabled, oauth_token, oauth_refresh_token, oauth_expires_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name`,
        [
          'openai',
          providerName,
          true,
          tokenResult.accessToken,
          tokenResult.refreshToken,
          expiresAt,
          JSON.stringify(metadata),
        ]
      );

      const newProvider = result.rows[0];
      return redirectToSettings(
        'success',
        `Connected OpenAI account: ${newProvider.name}`
      );
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    return redirectToSettings(
      'error',
      error instanceof Error ? error.message : 'Authentication failed'
    );
  }
}

/**
 * Redirect to the settings page with a status message
 */
function redirectToSettings(status: 'success' | 'error', message: string): NextResponse {
  const url = new URL('/settings', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  url.searchParams.set('oauth_status', status);
  url.searchParams.set('oauth_message', message);

  return NextResponse.redirect(url);
}

// Import pool for direct database access
import { pool } from '@/lib/db';
