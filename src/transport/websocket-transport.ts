import { createId } from '../core/id';
import type {
  AgentAction,
  AgentTransport,
  ChatMessage,
  ConnectionStatus,
  MessageStatus,
} from '../core/types';
import { MAX_CARDS_PER_MESSAGE, parseMovieCard, parseOpenUrl } from '../core/validation';

export interface WebSocketAgentTransportOptions {
  sessionId?: string;
  /** Permite inyectar un WebSocket falso en los tests. */
  WebSocketImpl?: typeof WebSocket;
}

const SESSION_STORAGE_KEY = 'agichat-session';
const TEXT_STATUSES: readonly MessageStatus[] = ['streaming', 'complete', 'error'];

function loadOrCreateSessionId(): string {
  try {
    const saved = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) return saved;
    const created = createId('sess');
    sessionStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return createId('sess');
  }
}

/** {@link AgentTransport} sobre el WebSocket del gateway de AGIChat. */
export class WebSocketAgentTransport implements AgentTransport {
  private _status: ConnectionStatus = 'idle';
  private socket: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private messages = new Map<string, ChatMessage>();
  private messageListeners = new Set<(message: ChatMessage) => void>();
  private actionListeners = new Set<(action: AgentAction) => void>();
  private statusListeners = new Set<(status: ConnectionStatus) => void>();

  private readonly endpoint: string;
  private readonly WebSocketImpl: typeof WebSocket;

  constructor(url: string, options: WebSocketAgentTransportOptions = {}) {
    const endpoint = new URL(url);
    endpoint.searchParams.set('session', options.sessionId ?? loadOrCreateSessionId());
    this.endpoint = endpoint.toString();
    this.WebSocketImpl = options.WebSocketImpl ?? WebSocket;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  connect(): Promise<void> {
    if (this._status === 'open') return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.setStatus('connecting');
    this.connecting = new Promise<void>((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new this.WebSocketImpl(this.endpoint);
      } catch (error) {
        this.setStatus('error');
        reject(error);
        return;
      }
      this.socket = socket;

      socket.onopen = () => {
        if (this.socket !== socket) return;
        this.setStatus('open');
        resolve();
      };
      socket.onerror = () => {
        if (this.socket !== socket) return;
        this.setStatus('error');
        reject(new Error('No se pudo conectar con el agente.'));
      };
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        if (this._status !== 'error') this.setStatus('closed');
        reject(new Error('La conexión con el agente se cerró.'));
      };
      socket.onmessage = (event) => {
        if (this.socket === socket) this.handleRaw(event.data);
      };
    }).finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  disconnect(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.setStatus('closed');
  }

  send(text: string): void {
    if (this._status !== 'open' || !this.socket) {
      throw new Error('No se puede enviar un mensaje: el transporte no está conectado.');
    }
    this.socket.send(JSON.stringify({ type: 'user_message', text }));
  }

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageListeners.add(handler);
    return () => this.messageListeners.delete(handler);
  }

  onAction(handler: (action: AgentAction) => void): () => void {
    this.actionListeners.add(handler);
    return () => this.actionListeners.delete(handler);
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(handler);
    return () => this.statusListeners.delete(handler);
  }

  private handleRaw(data: unknown): void {
    if (typeof data !== 'string') return;
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof event !== 'object' || event === null) return;
    const raw = event as Record<string, unknown>;

    if (raw.type === 'text') this.handleText(raw);
    else if (raw.type === 'movie_card') this.handleCard(raw);
    else if (raw.type === 'open_url') this.handleOpenUrl(raw);
  }

  private handleText(raw: Record<string, unknown>): void {
    const { id, content, status } = raw;
    if (typeof id !== 'string' || typeof content !== 'string') return;
    if (!TEXT_STATUSES.includes(status as MessageStatus)) return;

    const previous = this.messages.get(id);
    this.emit({
      id,
      role: 'assistant',
      content,
      status: status as MessageStatus,
      createdAt: previous?.createdAt ?? Date.now(),
      ...(previous?.cards && { cards: previous.cards }),
    });
  }

  private handleCard(raw: Record<string, unknown>): void {
    const message =
      typeof raw.messageId === 'string' ? this.messages.get(raw.messageId) : undefined;
    const card = parseMovieCard(raw.card);
    if (!message || !card) return;

    const cards = message.cards ?? [];
    if (cards.length >= MAX_CARDS_PER_MESSAGE || cards.some((c) => c.tmdbId === card.tmdbId)) {
      return;
    }
    this.emit({ ...message, cards: [...cards, card] });
  }

  private handleOpenUrl(raw: Record<string, unknown>): void {
    const action = parseOpenUrl(raw);
    if (!action) return;
    for (const listener of this.actionListeners) listener(action);
  }

  private emit(message: ChatMessage): void {
    this.messages.set(message.id, message);
    for (const listener of this.messageListeners) listener(message);
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}
