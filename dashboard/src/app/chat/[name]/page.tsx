import { notFound } from 'next/navigation';
import { getAgentMetadata } from '@/lib/agent-discovery';
import { toLegacyAgent } from '@/lib/use-agents';
import { getChatHistory } from '@/lib/db';
import { ChatPanel } from '@/components/chat-panel';

export const dynamic = 'force-dynamic';

export default async function ChatPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const agentMetadata = await getAgentMetadata(name);

  if (!agentMetadata) {
    notFound();
  }

  // Convert to legacy format for compatibility with ChatPanel
  const agent = toLegacyAgent(agentMetadata);

  const history = await getChatHistory(name, 100);

  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)] flex-col md:h-[calc(100vh-1rem)]">
      <div className="flex items-center gap-3 border-b border-zinc-800 px-6 py-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: agent.color }}
        >
          {agent.displayName.charAt(0)}
        </div>
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">
            {agent.displayName}
          </h1>
          <p className="text-sm text-zinc-500">{agent.description}</p>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatPanel
          agentName={agent.name}
          agentDisplayName={agent.displayName}
          agentColor={agent.color}
          initialMessages={history}
        />
      </div>
    </div>
  );
}
