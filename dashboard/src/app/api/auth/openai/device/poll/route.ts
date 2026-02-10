import { NextRequest, NextResponse } from 'next/server';
import { verifyDeviceCode, extractMetadataFromIdToken, calculateExpirationDate } from '@/lib/oauth/openai-device-code';
import { pool } from '@/lib/db-pool';

/**
 * POST /api/auth/openai/device/poll
 *
 * Polls to check if the user has completed authentication.
 * Called by the frontend after the user enters the code.
 *
 * Request body:
 * - deviceCodeId: The ID returned from /device/start
 *
 * Response:
 * - status: 'pending' | 'complete' | 'error' | 'expired'
 * - provider: The created/updated provider (when complete)
 * - error: Error message (when error)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceCodeId } = body as { deviceCodeId: string };

    if (!deviceCodeId) {
      return NextResponse.json(
        { error: 'deviceCodeId is required' },
        { status: 400 }
      );
    }

    // Get the device code from database
    const deviceCodeResult = await pool.query(
      `SELECT id, device_code, user_code, provider_id, expires_at, status
       FROM quorum_oauth_device_codes
       WHERE id = $1`,
      [deviceCodeId]
    );

    const deviceCodeRecord = deviceCodeResult.rows[0];

    if (!deviceCodeRecord) {
      return NextResponse.json(
        { error: 'Invalid device code ID' },
        { status: 404 }
      );
    }

    // Check if expired
    if (new Date() > new Date(deviceCodeRecord.expires_at)) {
      await pool.query(
        `UPDATE quorum_oauth_device_codes SET status = 'expired' WHERE id = $1`,
        [deviceCodeId]
      );
      return NextResponse.json({
        status: 'expired',
        error: 'Device code has expired. Please start a new authentication.',
      });
    }

    // Verify with OpenAI
    const result = await verifyDeviceCode(deviceCodeRecord.device_code);

    if (result.status === 'pending') {
      return NextResponse.json({ status: 'pending' });
    }

    if (result.status === 'slow_down') {
      // Still pending, just polling too fast
      return NextResponse.json({ status: 'pending' });
    }

    if (result.status === 'error' || result.status === 'expired') {
      await pool.query(
        `UPDATE quorum_oauth_device_codes SET status = 'error' WHERE id = $1`,
        [deviceCodeId]
      );
      return NextResponse.json({
        status: result.status,
        error: result.error,
      });
    }

    // Success! User completed authentication
    if (result.status === 'complete' && result.tokens) {
      const { accessToken, refreshToken, idToken } = result.tokens;

      // Extract user metadata from ID token
      const metadata = idToken ? extractMetadataFromIdToken(idToken) : {};
      const expiresAt = calculateExpirationDate(result.tokens.expiresIn);

      // Update or create provider
      let providerId = deviceCodeRecord.provider_id;

      if (providerId) {
        // Update existing provider
        await pool.query(
          `UPDATE quorum_ai_providers
           SET oauth_token = $1,
               oauth_refresh_token = $2,
               oauth_expires_at = $3,
               metadata = COALESCE(metadata, '{}'::jsonb) || '{"oauth_type": "device_code"}'::jsonb,
               updated_at = NOW()
           WHERE id = $4`,
          [accessToken, refreshToken, expiresAt.toISOString(), providerId]
        );
      } else {
        // Create new provider
        const insertResult = await pool.query(
          `INSERT INTO quorum_ai_providers (
            provider_type,
            name,
            is_enabled,
            oauth_token,
            oauth_refresh_token,
            oauth_expires_at,
            metadata
          ) VALUES (
            'openai',
            $1,
            true,
            $2,
            $3,
            $4,
            $5
          ) RETURNING id`,
          [
            metadata.email ? `OpenAI (${metadata.email})` : 'OpenAI (OAuth)',
            accessToken,
            refreshToken,
            expiresAt.toISOString(),
            JSON.stringify({
              ...metadata,
              oauthType: 'device_code',
            }),
          ]
        );
        providerId = insertResult.rows[0].id;
      }

      // Mark device code as complete
      await pool.query(
        `UPDATE quorum_oauth_device_codes SET status = 'complete', provider_id = $1 WHERE id = $2`,
        [providerId, deviceCodeId]
      );

      // Fetch the provider to return
      const providerResult = await pool.query(
        `SELECT id, provider_type, name, is_enabled, created_at, updated_at
         FROM quorum_ai_providers
         WHERE id = $1`,
        [providerId]
      );

      const provider = providerResult.rows[0];

      return NextResponse.json({
        status: 'complete',
        provider: {
          id: provider.id,
          providerType: provider.provider_type,
          name: provider.name,
          isEnabled: provider.is_enabled,
          hasOAuth: true,
          hasApiKey: false,
          createdAt: provider.created_at,
          updatedAt: provider.updated_at,
        },
      });
    }

    return NextResponse.json({
      status: 'error',
      error: 'Unknown error occurred',
    });
  } catch (error) {
    console.error('Device code poll error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
