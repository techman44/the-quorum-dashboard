import { NextRequest, NextResponse } from 'next/server';
import { createAIProvider, getAIProvider, listAIProviders, updateAIProvider, deleteAIProvider } from '@/lib/db';
import { encryptApiKey, decryptApiKey } from '@/lib/ai/encryption';
import { getAccessToken } from '@/lib/oauth/token-manager';

// Model lists aligned with OpenClaw's available models
// OAuth tokens cannot access /models endpoint due to scope limitations,
// so we maintain a curated static list of current, usable models
const FALLBACK_MODELS: Record<string, string[]> = {
  // OpenAI models - curated list of current models (as of February 2025)
  openai: [
    // GPT-5 series (Kodak models - latest)
    'gpt-5.1',
    'gpt-5.1-codex-max',
    'gpt-5.1-mini',
    'gpt-5.1-nano',
    'gpt-5.2',
    'gpt-5.2-mini',
    'gpt-5.2-nano',
    'gpt-5',
    // GPT-4.1 series
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    // GPT-4o series
    'gpt-4o',
    'gpt-4o-mini',
    // O1 series (reasoning models)
    'o1',
    'o1-mini',
    // O3 series (reasoning models)
    'o3',
    'o3-mini',
    'o3-mini-high',
  ],
  // Anthropic Claude models
  anthropic: [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'claude-3-7-sonnet',
    'claude-3-5-sonnet',
    'claude-3-5-haiku',
    'claude-3-opus',
  ],
  // Google Gemini models
  google: [
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-thinking-exp',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ],
  openrouter: [], // Discovery only
  custom: [], // Discovery only
};

/**
 * Discover available models from a provider
 */
async function discoverModels(providerId: string): Promise<string[]> {
  const provider = await getAIProvider(providerId);
  if (!provider) {
    console.error(`[discoverModels] Provider not found: ${providerId}`);
    return [];
  }

  console.log(`[discoverModels] Provider:`, {
    id: provider.id,
    providerType: provider.providerType,
    hasOauthToken: !!provider.oauthToken,
    oauthTokenLength: provider.oauthToken?.length || 0,
    hasApiKeyEncrypted: !!provider.apiKeyEncrypted,
    baseUrl: provider.baseUrl,
  });

  const providerType = provider.providerType;
  const baseUrl = provider.baseUrl;

  // OpenAI providers with OAuth or API key - use /models endpoint
  if (providerType === 'openai') {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Use OAuth token if available (with automatic refresh), otherwise try API key
      let accessToken: string | null = null;
      if (provider.oauthToken) {
        console.log(`[discoverModels] Getting valid OAuth token (with automatic refresh if needed)`);
        accessToken = await getAccessToken(providerId);
        if (accessToken) {
          console.log(`[discoverModels] Using OAuth token for authentication`);
          headers['Authorization'] = `Bearer ${accessToken}`;
        } else {
          console.error(`[discoverModels] Failed to get valid OAuth token (may be expired and refresh failed)`);
        }
      }

      // Fall back to API key if OAuth is not available or failed
      if (!accessToken && provider.apiKeyEncrypted) {
        console.log(`[discoverModels] Using encrypted API key for authentication`);
        try {
          const apiKey = decryptApiKey(provider.apiKeyEncrypted);
          headers['Authorization'] = `Bearer ${apiKey}`;
        } catch {
          console.error(`[discoverModels] Failed to decrypt API key`);
        }
      }

      // Check if we have any authentication method
      if (!headers['Authorization']) {
        console.error(`[discoverModels] No valid OAuth token or API key available for OpenAI provider`);
        return FALLBACK_MODELS[providerType] || [];
      }

      const fetchUrl = `${baseUrl || 'https://api.openai.com/v1'}/models`;
      console.log(`[discoverModels] Fetching models from: ${fetchUrl}`);

      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers,
      });

      console.log(`[discoverModels] Response status: ${response.status}, ok: ${response.ok}`);

      if (response.ok) {
        const data = await response.json();
        console.log(`[discoverModels] Got ${data.data?.length || 0} models from OpenAI`);
        // Filter for relevant models (gpt, o1, o3, chatgpt, codex)
        const models = data.data
          .filter((m: any) => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('o3') || m.id.includes('chatgpt') || m.id.includes('codex'))
          .map((m: any) => m.id)
          .sort((a: string, b: string) => a.localeCompare(b));
        console.log(`[discoverModels] Filtered to ${models.length} GPT models`);
        return models;
      } else {
        const errorText = await response.text();
        console.error(`[discoverModels] OpenAI API error: ${response.status} - ${errorText}`);
        // Check for specific error: missing api.model.read scope
        if (errorText.includes('api.model.read')) {
          console.warn(`[discoverModels] OAuth token missing api.model.read scope. User needs to re-authenticate with updated scopes.`);
        }
      }
    } catch (error) {
      console.error(`[discoverModels] OpenAI model discovery error:`, error);
    }
    // Fall back to defaults on error
    console.log(`[discoverModels] Falling back to default models`);
    return FALLBACK_MODELS[providerType] || [];
  }

  // Anthropic, Google - use fallback for now (they have different APIs)
  if (providerType === 'anthropic' || providerType === 'google') {
    return FALLBACK_MODELS[providerType] || [];
  }

  // Custom/OpenRouter providers support /v1/models
  if (providerType === 'custom' || providerType === 'openrouter') {
    if (!baseUrl) return FALLBACK_MODELS[providerType] || [];

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add API key if available
      if (provider.apiKeyEncrypted) {
        try {
          const apiKey = decryptApiKey(provider.apiKeyEncrypted);
          headers['Authorization'] = `Bearer ${apiKey}`;
        } catch {
          // Decryption failed, proceed without auth
        }
      }

      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        console.error(`Model discovery failed for ${provider.name}: ${response.statusText}`);
        return FALLBACK_MODELS[providerType] || [];
      }

      const data = await response.json();
      const models = data.data?.map((m: any) => m.id) || [];
      return models.sort((a: string, b: string) => a.localeCompare(b));
    } catch (error) {
      console.error(`Model discovery error for ${provider.name}:`, error);
      return FALLBACK_MODELS[providerType] || [];
    }
  }

  return FALLBACK_MODELS[providerType] || [];
}

// GET /api/settings/providers - List all AI providers or discover models
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const discover = searchParams.get('discover') === 'true';
    const providerId = searchParams.get('providerId');

    // Handle model discovery
    if (discover && providerId) {
      const models = await discoverModels(providerId);
      return NextResponse.json({ models });
    }

    const providers = await listAIProviders();

    // Return providers without exposing decrypted API keys
    // Note: database returns snake_case, need to map to camelCase for response
    const safeProviders = providers.map((p: any) => ({
      id: p.id,
      providerType: p.provider_type || p.providerType,
      name: p.name,
      isEnabled: p.is_enabled !== undefined ? p.is_enabled : p.isEnabled,
      baseUrl: p.base_url || p.baseUrl,
      hasApiKey: !!(p.api_key_encrypted || p.apiKeyEncrypted) || !!(p.oauth_token || p.oauthToken),
      hasOAuth: !!(p.oauth_token || p.oauthToken),
      metadata: p.metadata || {},
      createdAt: p.created_at || p.createdAt,
      updatedAt: p.updated_at || p.updatedAt,
    }));

    return NextResponse.json({ providers: safeProviders });
  } catch (err) {
    console.error('Providers list API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/settings/providers - Create a new AI provider
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerType, name, apiKey, baseUrl, isEnabled, metadata } = body as {
      providerType: string;
      name: string;
      apiKey?: string;
      baseUrl?: string;
      isEnabled?: boolean;
      metadata?: Record<string, unknown>;
    };

    if (!providerType || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: providerType, name' },
        { status: 400 }
      );
    }

    const validTypes = ['openai', 'anthropic', 'google', 'openrouter', 'custom'];
    if (!validTypes.includes(providerType)) {
      return NextResponse.json(
        { error: `Invalid providerType. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Encrypt API key if provided
    const apiKeyEncrypted = apiKey ? encryptApiKey(apiKey) : undefined;

    const provider = await createAIProvider({
      providerType,
      name,
      apiKeyEncrypted,
      baseUrl,
      isEnabled,
      metadata,
    });

    // Database returns snake_case, map to camelCase for response
    return NextResponse.json({
      id: provider.id,
      providerType: (provider as any).provider_type || provider.providerType,
      name: provider.name,
      isEnabled: (provider as any).is_enabled !== undefined ? (provider as any).is_enabled : provider.isEnabled,
      baseUrl: (provider as any).base_url || provider.baseUrl,
      hasApiKey: !!((provider as any).api_key_encrypted || provider.apiKeyEncrypted) || !!((provider as any).oauth_token || provider.oauthToken),
      hasOAuth: !!((provider as any).oauth_token || provider.oauthToken),
      metadata: provider.metadata || {},
    });
  } catch (err) {
    console.error('Provider create API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/providers - Update an AI provider
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, apiKey, isEnabled, baseUrl, metadata } = body as {
      id: string;
      name?: string;
      apiKey?: string;
      isEnabled?: boolean;
      baseUrl?: string;
      metadata?: Record<string, unknown>;
    };

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    // Encrypt API key if provided
    const apiKeyEncrypted = apiKey ? encryptApiKey(apiKey) : undefined;

    const updates: {
      name?: string;
      apiKeyEncrypted?: string;
      isEnabled?: boolean;
      baseUrl?: string;
      metadata?: Record<string, unknown>;
    } = {};
    if (name !== undefined) updates.name = name;
    if (apiKeyEncrypted !== undefined) updates.apiKeyEncrypted = apiKeyEncrypted;
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;
    if (baseUrl !== undefined) updates.baseUrl = baseUrl;
    if (metadata !== undefined) updates.metadata = metadata;

    const provider = await updateAIProvider(id, updates);

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider not found' },
        { status: 404 }
      );
    }

    // Database returns snake_case, map to camelCase for response
    return NextResponse.json({
      id: provider.id,
      providerType: (provider as any).provider_type || provider.providerType,
      name: provider.name,
      isEnabled: (provider as any).is_enabled !== undefined ? (provider as any).is_enabled : provider.isEnabled,
      baseUrl: (provider as any).base_url || provider.baseUrl,
      hasApiKey: !!((provider as any).api_key_encrypted || provider.apiKeyEncrypted) || !!((provider as any).oauth_token || provider.oauthToken),
      hasOAuth: !!((provider as any).oauth_token || provider.oauthToken),
      metadata: provider.metadata || {},
    });
  } catch (err) {
    console.error('Provider update API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/settings/providers - Delete an AI provider
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }

    const deleted = await deleteAIProvider(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Provider not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Provider delete API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
