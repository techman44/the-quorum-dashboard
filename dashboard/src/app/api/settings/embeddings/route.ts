import { NextRequest, NextResponse } from 'next/server';
import { getEmbeddingConfig, saveEmbeddingConfig, listAIProviders, getAIProvider } from '@/lib/db';
import { encryptApiKey, decryptApiKey } from '@/lib/ai/encryption';

// Available embedding models by provider type (fallbacks)
const EMBEDDING_MODELS: Record<string, { name: string; dimension: number }[]> = {
  ollama: [
    { name: 'mxbai-embed-large', dimension: 1024 },
    { name: 'nomic-embed-text', dimension: 768 },
    { name: 'all-minilm', dimension: 384 },
  ],
  openai: [
    { name: 'text-embedding-3-small', dimension: 1536 },
    { name: 'text-embedding-3-large', dimension: 3072 },
    { name: 'text-embedding-ada-002', dimension: 1536 },
  ],
  custom: [
    { name: 'custom-embedding', dimension: 1536 },
  ],
  openrouter: [
    { name: 'custom-embedding', dimension: 1536 },
  ],
};

/**
 * Discover available embedding models from a provider
 */
async function discoverEmbeddingModels(
  providerType: string,
  baseUrl?: string,
  apiKey?: string
): Promise<{ name: string; dimension: number }[]> {
  try {
    switch (providerType) {
      case 'ollama': {
        const host = baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
        const response = await fetch(`${host}/api/tags`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
          console.error(`Ollama models discovery failed: ${response.statusText}`);
          return EMBEDDING_MODELS.ollama;
        }

        const data = await response.json();
        // Filter for embedding models (common naming patterns)
        const embeddingModels = (data.models || [])
          .filter((m: any) => {
            const name = m.name?.toLowerCase() || '';
            return name.includes('embed') || name.includes('minilm') || name.includes('bge');
          })
          .map((m: any) => {
            // Detect dimension based on model name
            const name = m.name.toLowerCase();
            let dimension = 768; // Default

            if (name.includes('mxbai-embed-large')) {
              dimension = 1024;
            } else if (name.includes('mxbai-embed-small')) {
              dimension = 512;
            } else if (name.includes('nomic-embed-text')) {
              dimension = 768;
            } else if (name.includes('nomic-embed-large') || name.includes('nomic-embed-text-v1.5')) {
              dimension = 1536;
            } else if (name.includes('all-minilm')) {
              dimension = 384;
            } else if (name.includes('bge-large')) {
              dimension = 1024;
            } else if (name.includes('bge-small')) {
              dimension = 384;
            }

            return {
              name: m.name.replace(':latest', ''),
              dimension,
            };
          });

        return embeddingModels.length > 0 ? embeddingModels : EMBEDDING_MODELS.ollama;
      }

      case 'custom':
      case 'openrouter': {
        const url = baseUrl || 'https://api.openai.com/v1';
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${url}/models`, {
          method: 'GET',
          headers,
        });

        if (!response.ok) {
          console.error(`Custom provider models discovery failed: ${response.statusText}`);
          return EMBEDDING_MODELS.custom;
        }

        const data = await response.json();
        // Filter for embedding models
        const embeddingModels = (data.data || [])
          .filter((m: any) => {
            const id = m.id?.toLowerCase() || '';
            return id.includes('embed') || id.includes('embedding');
          })
          .map((m: any) => ({
            name: m.id,
            dimension: 1536, // Default dimension for OpenAI-compatible embeddings
          }));

        return embeddingModels.length > 0 ? embeddingModels : EMBEDDING_MODELS.custom;
      }

      case 'openai':
        // OpenAI has a fixed set of embedding models
        return EMBEDDING_MODELS.openai;

      default:
        return [];
    }
  } catch (error) {
    console.error('Model discovery error:', error);
    // Return fallback models on error
    return EMBEDDING_MODELS[providerType] || [];
  }
}

// Helper function to generate an embedding for testing
async function generateEmbeddingForTest(
  text: string,
  config: {
    providerType: string;
    model: string;
    baseUrl?: string;
    apiKey?: string;
  }
): Promise<number[]> {
  const { providerType, model, baseUrl, apiKey } = config;

  switch (providerType) {
    case 'ollama': {
      const host = baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
      const response = await fetch(`${host}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text }),
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding request failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.embedding;
    }

    case 'openai':
    case 'custom':
    case 'openrouter': {
      const url = baseUrl || 'https://api.openai.com/v1';

      // API key is optional for custom providers (e.g., LM Studio)
      if (providerType !== 'custom' && !apiKey) {
        throw new Error('API key is required for this provider type');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Only add Authorization header if we have an API key
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${url}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          input: text,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding request failed: ${error}`);
      }

      const data = await response.json();
      return data.data[0].embedding;
    }

    default:
      throw new Error(`Unsupported provider type: ${providerType}`);
  }
}

// GET /api/settings/embeddings - Get embedding configuration or discover models
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const discover = searchParams.get('discover') === 'true';
    const discoverProviderType = searchParams.get('providerType');
    const discoverBaseUrl = searchParams.get('baseUrl');

    // Handle model discovery
    if (discover && discoverProviderType) {
      const models = await discoverEmbeddingModels(
        discoverProviderType,
        discoverBaseUrl || undefined
      );
      return NextResponse.json({ models });
    }

    const config = await getEmbeddingConfig();

    if (!config) {
      // Return default Ollama config
      const ollamaHost = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
      return NextResponse.json({
        config: {
          id: 'default',
          providerType: 'ollama',
          name: 'Ollama (Default)',
          model: 'mxbai-embed-large',
          baseUrl: ollamaHost,
          enabled: true,
        },
        availableModels: EMBEDDING_MODELS,
      });
    }

    // Don't expose the encrypted API key
    const safeConfig = {
      ...config,
      apiKeyEncrypted: undefined,
      hasApiKey: !!(config as any).apiKeyEncrypted,
    };

    return NextResponse.json({
      config: safeConfig,
      availableModels: EMBEDDING_MODELS,
    });
  } catch (err) {
    console.error('Embedding config get error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/settings/embeddings - Save embedding configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerType, name, model, baseUrl, apiKey, providerId, enabled } = body as {
      providerType: string;
      name?: string;
      model: string;
      baseUrl?: string;
      apiKey?: string;
      providerId?: string;
      enabled?: boolean;
    };

    if (!providerType || !model) {
      return NextResponse.json(
        { error: 'Missing required fields: providerType, model' },
        { status: 400 }
      );
    }

    const validTypes = ['ollama', 'openai', 'custom', 'openrouter'];
    if (!validTypes.includes(providerType)) {
      return NextResponse.json(
        { error: `Invalid providerType. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Prepare config object
    const configToSave: Record<string, unknown> = {
      id: providerId || `${providerType}-${Date.now()}`,
      providerType,
      name: name || `${providerType.charAt(0).toUpperCase() + providerType.slice(1)} Embeddings`,
      model,
      enabled: enabled !== undefined ? enabled : true,
    };

    // Handle base URL
    if (providerType === 'ollama') {
      configToSave.baseUrl = baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
    } else if (providerType === 'custom' || providerType === 'openrouter') {
      if (baseUrl) {
        configToSave.baseUrl = baseUrl;
      }
      // For custom/openrouter with providerId, get baseUrl from stored provider
      if (providerId && !baseUrl) {
        const provider = await getAIProvider(providerId);
        if (provider?.baseUrl) {
          configToSave.baseUrl = provider.baseUrl;
        }
      }
    } else if (providerType === 'openai') {
      configToSave.baseUrl = 'https://api.openai.com/v1';
    }

    // Handle API key encryption
    if (apiKey) {
      configToSave.apiKeyEncrypted = encryptApiKey(apiKey);
    } else if (providerId && (providerType === 'openai' || providerType === 'custom' || providerType === 'openrouter')) {
      // Get API key from stored provider
      const provider = await getAIProvider(providerId);
      if (provider?.apiKeyEncrypted) {
        configToSave.apiKeyEncrypted = provider.apiKeyEncrypted;
      }
    }

    await saveEmbeddingConfig(configToSave as any);

    // Return safe config (without encrypted key)
    const { apiKeyEncrypted, ...safeConfig } = configToSave;

    return NextResponse.json({
      config: { ...safeConfig, hasApiKey: !!apiKeyEncrypted },
      success: true,
    });
  } catch (err) {
    console.error('Embedding config save error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/settings/embeddings/test - Test embedding provider
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerType, model, baseUrl, apiKey, providerId } = body as {
      providerType: string;
      model: string;
      baseUrl?: string;
      apiKey?: string;
      providerId?: string;
    };

    if (!providerType || !model) {
      return NextResponse.json(
        { error: 'Missing required fields: providerType, model' },
        { status: 400 }
      );
    }

    // Build the config for testing
    const testConfig: {
      providerType: string;
      model: string;
      baseUrl?: string;
      apiKey?: string;
    } = {
      providerType,
      model,
    };

    if (providerType === 'ollama') {
      testConfig.baseUrl = baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
    } else if (providerType === 'custom' || providerType === 'openrouter') {
      testConfig.baseUrl = baseUrl;
    }

    // Handle API key
    if (apiKey) {
      testConfig.apiKey = apiKey;
    } else if (providerId) {
      const provider = await getAIProvider(providerId);
      if (provider?.apiKeyEncrypted) {
        testConfig.apiKey = decryptApiKey(provider.apiKeyEncrypted);
      }
      if (provider?.baseUrl) {
        testConfig.baseUrl = provider.baseUrl;
      }
    } else if (providerType === 'openai') {
      testConfig.baseUrl = 'https://api.openai.com/v1';
    }

    // Test by generating an embedding
    try {
      const embedding = await generateEmbeddingForTest('test', testConfig);
      return NextResponse.json({
        success: true,
        dimension: embedding.length,
        message: 'Embedding generation successful',
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Embedding generation failed',
        },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error('Embedding test error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
