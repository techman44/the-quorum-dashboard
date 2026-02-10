import { NextRequest, NextResponse } from 'next/server';
import { createAIProvider, getAIProvider, listAIProviders, updateAIProvider, deleteAIProvider } from '@/lib/db';
import { encryptApiKey, decryptApiKey } from '@/lib/ai/encryption';

// Fallback models for providers that don't support discovery
const FALLBACK_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1-preview', 'o1-mini'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250514'],
  google: ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'],
  openrouter: [], // Discovery only
  custom: [], // Discovery only
};

/**
 * Discover available models from a provider
 */
async function discoverModels(providerId: string): Promise<string[]> {
  const provider = await getAIProvider(providerId);
  if (!provider) return [];

  const providerType = provider.providerType;
  const baseUrl = provider.baseUrl;

  // For providers without model discovery APIs, return fallback
  if (providerType === 'openai' || providerType === 'anthropic' || providerType === 'google') {
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
      hasApiKey: !!p.api_key_encrypted || !!p.oauth_token,
      hasOAuth: !!p.oauth_token,
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
