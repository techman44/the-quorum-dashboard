import { NextRequest, NextResponse } from 'next/server';
import { requestDeviceCode } from '@/lib/oauth/openai-device-code';
import { pool } from '@/lib/db-pool';

/**
 * POST /api/auth/openai/device/start
 *
 * Initiates the OpenAI device code OAuth flow.
 * This is the RECOMMENDED method for remote/headless environments.
 *
 * Request body:
 * - providerId: Optional existing provider ID to link OAuth to
 *
 * Response:
 * - userCode: The one-time code the user must enter
 * - verificationUri: The URL where the user enters the code
 * - verificationUriComplete: Pre-filled URL (can be used directly)
 * - expiresIn: Seconds until code expires
 * - deviceCodeId: ID to track this auth attempt
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { providerId } = body as { providerId?: string };

    // Request device code from OpenAI
    const deviceCodeResponse = await requestDeviceCode();

    // Store the device code in database for later verification
    // We'll poll on the server side when user confirms they've entered the code
    const result = await pool.query(
      `INSERT INTO quorum_oauth_device_codes (
        device_code,
        user_code,
        provider_id,
        expires_at,
        status
      ) VALUES ($1, $2, $3, NOW() + INTERVAL '900 seconds', 'pending')
      RETURNING id`,
      [deviceCodeResponse.deviceCode, deviceCodeResponse.userCode, providerId || null]
    );

    const deviceCodeId = result.rows[0].id;

    return NextResponse.json({
      userCode: deviceCodeResponse.userCode,
      verificationUri: deviceCodeResponse.verificationUri,
      verificationUriComplete: deviceCodeResponse.verificationUriComplete,
      expiresIn: deviceCodeResponse.expiresIn,
      deviceCodeId,
    });
  } catch (error) {
    console.error('Device code start error:', error);
    return NextResponse.json(
      {
        error: 'Failed to initiate device code flow',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
