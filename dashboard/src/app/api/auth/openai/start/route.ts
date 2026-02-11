import { NextRequest, NextResponse } from 'next/server';
import { createAuthorizationFlow } from '@/lib/oauth/openai-codex';
import { storeOAuthState } from '@/lib/oauth/state-store';

/**
 * POST /api/auth/openai/start
 *
 * Initiates the OpenAI OAuth PKCE flow.
 * Returns the authorization URL for the user to click.
 *
 * Request body:
 * - providerId: Optional existing provider ID to link OAuth to
 *
 * Response:
 * - url: The authorization URL to open
 * - state: The state parameter for CSRF protection
 * - instructions: Human-readable instructions for the user
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
    const { providerId, redirectUri: customRedirectUri } = body as { providerId?: string; redirectUri?: string };

    // Build the redirect URI
    // Use custom redirect if provided, otherwise use localhost callback
    const redirectUri = customRedirectUri || 'http://localhost:1455/auth/callback';

    // Create the authorization flow
    const { url: authUrl, state, codeVerifier } = await createAuthorizationFlow(
      redirectUri
    );

    // Store the state and code verifier for the callback
    // Store with a longer TTL since the user might take time to complete auth
    storeOAuthState(state, codeVerifier, redirectUri, providerId);

    return NextResponse.json({
      url: authUrl,
      state,
      instructions: {
        step1: 'Click the link below to open OpenAI authorization',
        step2: 'Sign in to your ChatGPT account',
        step3: 'Click "Authorize" to grant access to Quorum Dashboard',
        step4: 'After authorization, copy the redirect URL from your browser address bar',
        step5: 'Paste the redirect URL into the input field below',
      },
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
