export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error';

export interface MovieCard {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string;
  rating: number | null;
  imdbUrl: string | null;
  tmdbUrl: string | null;
}

export type AgentActionSite = 'imdb' | 'google_books';

export interface AgentAction {
  type: 'open_url';
  url: string;
  site: AgentActionSite;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: number;
  cards?: MovieCard[];
}

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface AgentTransport {
  readonly status: ConnectionStatus;
  connect(): Promise<void>;
  disconnect(): void;
  send(text: string): void;
  onMessage(handler: (message: ChatMessage) => void): () => void;
  onAction?(handler: (action: AgentAction) => void): () => void;
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void;
}
