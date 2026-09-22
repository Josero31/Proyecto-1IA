export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: number;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface AgentTransport {
  readonly status: ConnectionStatus;
  connect(): Promise<void>;
  disconnect(): void;
  send(text: string): void;
  onMessage(handler: (message: ChatMessage) => void): () => void;
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void;
}
