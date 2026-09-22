import { createId } from '../core/id';
import type { AgentTransport, ChatMessage, ConnectionStatus } from '../core/types';

export interface MockAgentTransportOptions {
  /** Retardo simulado de conexión, en ms. */
  connectDelayMs?: number;
  /** Retardo simulado antes de empezar a responder, en ms. */
  replyDelayMs?: number;
  /** Intervalo entre "chunks" de streaming, en ms. */
  streamIntervalMs?: number;
  /** Respuesta simulada (soporta Markdown) que se hace streaming palabra por palabra. */
  scriptedReply?: string;
}

const DEFAULT_REPLY =
  '¡Hola! Soy un **agente simulado**.\n\n' +
  'Esta respuesta demuestra que el SDK puede renderizar `markdown`, incluyendo:\n\n' +
  '- Listas\n' +
  '- **Negritas** y _cursivas_\n' +
  '- Bloques de código\n\n' +
  '```js\nconsole.log("Hola AGIChat");\n```\n\n' +
  'En la Fase 2 este transporte se reemplaza por una conexión real a un agente.';

/**
 * Implementación simulada de {@link AgentTransport} respaldada por temporizadores
 * en memoria (sin red real). Sirve como contrato de referencia para que la UI
 * (Parte 2) se conecte hoy mismo, y para que en Fase 2 se sustituya por una
 * implementación real (p. ej. sobre WebSocket) sin tocar el resto del SDK.
 */
export class MockAgentTransport implements AgentTransport {
  private _status: ConnectionStatus = 'idle';
  private messageListeners = new Set<(message: ChatMessage) => void>();
  private statusListeners = new Set<(status: ConnectionStatus) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();

  private readonly connectDelayMs: number;
  private readonly replyDelayMs: number;
  private readonly streamIntervalMs: number;
  private readonly scriptedReply: string;

  constructor(options: MockAgentTransportOptions = {}) {
    this.connectDelayMs = options.connectDelayMs ?? 150;
    this.replyDelayMs = options.replyDelayMs ?? 250;
    this.streamIntervalMs = options.streamIntervalMs ?? 40;
    this.scriptedReply = options.scriptedReply ?? DEFAULT_REPLY;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  connect(): Promise<void> {
    if (this._status === 'open' || this._status === 'connecting') {
      return Promise.resolve();
    }
    this.setStatus('connecting');
    return new Promise((resolve) => {
      this.schedule(() => {
        this.setStatus('open');
        resolve();
      }, this.connectDelayMs);
    });
  }

  disconnect(): void {
    this.clearTimers();
    this.setStatus('closed');
  }

  send(text: string): void {
    if (this._status !== 'open') {
      throw new Error('No se puede enviar un mensaje: el transporte no está conectado.');
    }
    if (!text.trim()) {
      return;
    }

    this.schedule(() => {
      this.streamReply();
    }, this.replyDelayMs);
  }

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageListeners.add(handler);
    return () => this.messageListeners.delete(handler);
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(handler);
    return () => this.statusListeners.delete(handler);
  }

  private streamReply(): void {
    const id = createId('agent');
    const words = this.scriptedReply.split(' ');
    let index = 0;

    const emit = (content: string, status: ChatMessage['status']) => {
      const message: ChatMessage = {
        id,
        role: 'assistant',
        content,
        status,
        createdAt: Date.now(),
      };
      for (const listener of this.messageListeners) {
        listener(message);
      }
    };

    const step = () => {
      index += 1;
      const partial = words.slice(0, index).join(' ');
      const isDone = index >= words.length;
      emit(partial, isDone ? 'complete' : 'streaming');
      if (!isDone) {
        this.schedule(step, this.streamIntervalMs);
      }
    };

    step();
  }

  private setStatus(status: ConnectionStatus): void {
    this._status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private schedule(fn: () => void, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, delayMs);
    this.timers.add(timer);
  }

  private clearTimers(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }
}
