import { NextRequest, NextResponse } from 'next/server';
import { exchangeAuthorizationCode, extractMetadataFromIdToken, calculateExpirationDate } from '@/lib/oauth/openai-codex';
import { consumeOAuthState } from '@/lib/oauth/state-store';
import { createAIProvider, updateAIProvider, listAIProviders } from '@/lib/db';
import { encryptApiKey } from '@/lib/ai/encryption';
import { pool } from '@/lib/db-pool';

/**
 * POST /api/auth/openai/callback
 *
 * Handles manual OAuth callback when user pastes the redirect URL or code.
 * This is a fallback for when the automatic callback doesn't work (e.g., remote servers).
 *
 * Request body:
 * - redirectUrl: The full redirect URL from OpenAI (contains code and state)
 * - code: The authorization code (if providing directly)
 * - state: The state parameter (if providing code directly)
 *
 * Response:
 * - success: true if successful
 * - message: Status message
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { redirectUrl, code, state } = body as { redirectUrl?: string; code?: string; state?: string };

    let authCode: string;
    let authState: string;

    if (redirectUrl) {
      // Parse the redirect URL to extract code and state
      const url = new URL(redirectUrl);
      authCode = url.searchParams.get('code') || '';
      authState = url.searchParams.get('state') || '';
    } else if (code && state) {
      authCode = code;
      authState = state;
    } else {
      return NextResponse.json(
        { error: 'Missing required parameters: provide redirectUrl or (code and state)' },
        { status: 400 }
      );
    }

    if (!authCode || !authState) {
      return NextResponse.json(
        { error: 'Invalid redirect URL or parameters' },
        { status: 400 }
      );
    }

    // Consume and validate the state
    const stateData = consumeOAuthState(authState);

    if (!stateData) {
      return NextResponse.json(
        { error: 'Invalid or expired state parameter. Please try again.' },
        { status: 400 }
      );
    }

    // Exchange the authorization code for tokens
    const tokenResult = await exchangeAuthorizationCode(
      authCode,
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

    // Store OAuth tokens
    const providerName = accountId
      ? `OpenAI (${accountId})`
      : `OpenAI OAuth (${new Date().toLocaleDateString()})`;

    // Check if an OpenAI provider already exists
    const existing = await pool.query(
      'SELECT id FROM quorum_ai_providers WHERE provider_type = $1',
      ['openai']
    );

    let newProvider;

    if (existing.rows.length > 0) {
      // Update existing provider
      const updateResult = await pool.query(
        `UPDATE quorum_ai_providers
         SET oauth_token = $1, oauth_refresh_token = $2, oauth_expires_at = $3,
             metadata = $4, name = $5, updated_at = NOW()
         WHERE provider_type = $6
         RETURNING id, name`,
        [
          tokenResult.accessToken,
          tokenResult.refreshToken,
          expiresAt,
          JSON.stringify(metadata),
          providerName,
          'openai',
        ]
      );
      newProvider = updateResult.rows[0];
    } else {
      // Insert new provider
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
      newProvider = result.rows[0];
    }

    return NextResponse.json({
      success: true,
      message: `Connected OpenAI account: ${newProvider.name}`,
      provider: {
        id: newProvider.id,
        name: newProvider.name,
      }
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.json(
      {
        error: 'Authentication failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

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
