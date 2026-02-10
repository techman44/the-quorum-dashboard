-- Add index for OAuth account lookups
-- This improves performance when finding providers by their OAuth account ID

CREATE INDEX IF NOT EXISTS idx_quorum_ai_providers_oauth_account_id
  ON quorum_ai_providers((metadata->>'oauthAccountId'))
  WHERE metadata->>'oauthAccountId' IS NOT NULL;
