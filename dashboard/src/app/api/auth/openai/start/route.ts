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
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { providerId } = body as { providerId?: string };

    // Build the redirect URI based on the request origin
    const url = new URL(request.url);
    const origin = url.origin;
    const redirectUri = `${origin}/api/auth/openai/callback`;

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
