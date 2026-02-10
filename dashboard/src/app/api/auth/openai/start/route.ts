import { NextRequest, NextResponse } from 'next/server';
import { createAuthorizationFlow } from '@/lib/oauth/openai-codex';
import { storeOAuthState } from '@/lib/oauth/state-store';

/**
 * POST /api/auth/openai/start
 *
 * Initiates the OpenAI OAuth flow.
 * Returns the authorization URL for the client to redirect the user to.
 *
 * Request body:
 * - redirectUri: Optional custom redirect URI (defaults to current origin + /api/auth/openai/callback)
 * - providerId: Optional existing provider ID to link OAuth to
 *
 * Response:
 * - url: The authorization URL to redirect to
 * - state: The state parameter for CSRF protection
 */
/**
 * GET /api/auth/openai/start
 *
 * Convenience endpoint that initiates OAuth flow without body params.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { providerId } = body as { providerId?: string };

    // Build the redirect URI
    // NOTE: OpenAI's public OAuth client (app_EMoamEEZ73f0CkXaXp7hrann) only accepts
    // callbacks to http://127.0.0.1:1455, so we use that and handle the callback manually
    const redirectUri = 'http://127.0.0.1:1455/auth/callback';

    // Create the authorization flow
    const { url: authUrl, state, codeVerifier } = await createAuthorizationFlow(
      redirectUri
    );

    // Store the state and code verifier for the callback
    storeOAuthState(state, codeVerifier, redirectUri, providerId);

    return NextResponse.json({
      url: authUrl,
      state,
    });
  } catch (error) {
    console.error('OAuth start error:', error);
    return NextResponse.json(
      {
        error: 'Failed to initiate OAuth flow',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
