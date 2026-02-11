// OpenAI provider implementation
import OpenAI from 'openai';
import type { ChatMessage, ChatOptions, AIProvider } from './base';

export interface OpenAICompletionResult {
  content: string;
  usage?: { promptTokens: number; completionTokens: number };
}

export class OpenAIProvider {
  private client: OpenAI;
  private provider: AIProvider;
  private oauthToken?: string;
  private providerId?: string;

  constructor(provider: AIProvider) {
    this.provider = provider;
    this.providerId = provider.id;

    // Determine authentication method: OAuth token or API key
    const authToken = provider.oauthToken || provider.apiKey || process.env.OPENAI_API_KEY;

    this.oauthToken = provider.oauthToken || undefined;

    this.client = new OpenAI({
      apiKey: authToken || 'dummy', // OAuth uses Bearer token, but SDK requires apiKey
      baseURL: provider.baseUrl || 'https://api.openai.com/v1',
      // For OAuth, we'll need to use a custom fetch that adds the Bearer token
      ...(this.oauthToken && {
        defaultHeaders: {
          Authorization: `Bearer ${this.oauthToken}`,
        },
      }),
    });
  }

  /**
   * Get a valid auth token, refreshing if necessary
   */
  private async getValidToken(): Promise<string> {
    if (!this.oauthToken) {
      return this.provider.apiKey || process.env.OPENAI_API_KEY || '';
    }

    // Check if token needs refresh
    const expiresAt = this.provider.oauthExpiresAt;
    const isExpired = expiresAt && new Date(expiresAt) < new Date(Date.now() + 5 * 60 * 1000);

    if (isExpired && this.providerId) {
      // Token refresh logic
      try {
        const { refreshAccessToken, calculateExpirationDate } = await import('@/lib/oauth/openai-codex');
        const { updateProviderOAuthTokens, getAIProvider } = await import('@/lib/db');

        const providerData = await getAIProvider(this.providerId);
        if (providerData?.oauthRefreshToken) {
          const newTokens = await refreshAccessToken(providerData.oauthRefreshToken);
          const expiresAt = calculateExpirationDate(newTokens.expiresIn);

          // Update database with new tokens
          await updateProviderOAuthTokens(this.providerId, {
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
            expiresAt,
          });

          // Update local state
          this.oauthToken = newTokens.accessToken;
          this.provider.oauthToken = newTokens.accessToken;
          this.provider.oauthExpiresAt = expiresAt;

          return newTokens.accessToken;
        }
      } catch (error) {
        console.error('Failed to refresh OAuth token:', error);
        throw new Error('OAuth token expired and refresh failed');
      }
    }

    return this.oauthToken;
  }

  /**
   * Make an authenticated API request with automatic token refresh
   */
  private async makeRequest<T>(endpoint: string, body: unknown): Promise<T> {
    const token = await this.getValidToken();

    const response = await fetch(
      `${this.provider.baseUrl || 'https://api.openai.com/v1'}${endpoint}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  /**
   * Generate a chat completion (non-streaming)
   */
  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<OpenAICompletionResult> {
    // If using OAuth, use custom request method
    if (this.oauthToken) {
      const response = await this.makeRequest<{ choices: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens: number; completion_tokens: number } }>(
        '/chat/completions',
        {
          model: this.provider.metadata?.model as string || 'gpt-4o',
          messages: messages.map(m => ({ role: m.role, content: m.content })),
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 4096,
          top_p: options.topP,
          stream: false,
        }
      );

      return {
        content: response.choices[0]?.message?.content || '',
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
        },
      };
    }

    // Use SDK for API key authentication
    const response = await this.client.chat.completions.create({
      model: this.provider.metadata?.model as string || 'gpt-4o',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP,
      stream: false,
    });

    return {
      content: response.choices[0]?.message?.content || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  /**
   * Generate a streaming chat completion
   */
  async *chatStream(messages: ChatMessage[], options: ChatOptions = {}): AsyncGenerator<string> {
    // If using OAuth, use custom streaming implementation
    if (this.oauthToken) {
      const token = await this.getValidToken();

      const response = await fetch(
        `${this.provider.baseUrl || 'https://api.openai.com/v1'}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            model: this.provider.metadata?.model as string || 'gpt-4o',
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 4096,
            top_p: options.topP,
            stream: true,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${error}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '' || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const content = data.choices[0]?.delta?.content || '';
              if (content) {
                yield content;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }

      return;
    }

    // Use SDK for API key authentication
    const stream = await this.client.chat.completions.create({
      model: this.provider.metadata?.model as string || 'gpt-4o',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      top_p: options.topP,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        yield content;
      }
    }
  }

  /**
   * Get available models from OpenAI API
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const token = await this.getValidToken();

      const response = await fetch(
        `${this.provider.baseUrl || 'https://api.openai.com/v1'}/models`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        console.error('Failed to fetch models:', response.status);
        return []; // Return empty on error, fall back to defaults
      }

      const data = await response.json();

      // Filter for chat models and extract model IDs
      const models = data.data
        .filter((m: any) => m.id.includes('gpt') || m.id.includes('o1') || m.id.includes('chatgpt'))
        .map((m: any) => m.id)
        .sort((a: string, b: string) => a.localeCompare(b));

      return models;
    } catch (error) {
      console.error('Error fetching models:', error);
      return [];
    }
  }

  /**
   * Test the connection
   */
  async test(): Promise<boolean> {
    try {
      if (this.oauthToken) {
        await this.makeRequest<{ choices: unknown[] }>(
          '/chat/completions',
          {
            model: this.provider.metadata?.model as string || 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 5,
          }
        );
        return true;
      }

      await this.client.chat.completions.create({
        model: this.provider.metadata?.model as string || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      });
      return true;
    } catch {
      return false;
    }
  }
}

export async function createOpenAIProvider(provider: AIProvider): Promise<OpenAIProvider> {
  return new OpenAIProvider(provider);
}
