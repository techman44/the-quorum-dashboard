-- Migration for OpenAI OAuth device code flow
-- Stores pending device codes for server-side polling

CREATE TABLE IF NOT EXISTS quorum_oauth_device_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_code TEXT NOT NULL UNIQUE,
  user_code TEXT NOT NULL,
  provider_id UUID REFERENCES quorum_ai_providers(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  -- Status values: 'pending', 'complete', 'expired', 'error'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_oauth_device_codes_user_code ON quorum_oauth_device_codes(user_code);
CREATE INDEX IF NOT EXISTS idx_oauth_device_codes_status ON quorum_oauth_device_codes(status);

-- Clean up expired codes periodically (optional)
-- DELETE FROM quorum_oauth_device_codes WHERE expires_at < NOW() AND status = 'pending';
