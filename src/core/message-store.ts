import type { ChatMessage, MessageStatus } from './types';

type Listener = (messages: ChatMessage[]) => void;

/**
 * Estado central de mensajes del widget, independiente de la capa de
 * presentación. Permite que Parte 2 (UI) reaccione a cambios sin acoplar
 * la lógica de mensajes al DOM.
 */
export class MessageStore {
  private messages: ChatMessage[] = [];
  private listeners = new Set<Listener>();

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  add(message: ChatMessage): void {
    this.messages.push(message);
    this.notify();
  }

  updateContent(id: string, content: string, status?: MessageStatus): void {
    const message = this.messages.find((m) => m.id === id);
    if (!message) {
      return;
    }
    message.content = content;
    if (status) {
      message.status = status;
    }
    this.notify();
  }

  appendContent(id: string, chunk: string): void {
    const message = this.messages.find((m) => m.id === id);
    if (!message) {
      return;
    }
    message.content += chunk;
    this.notify();
  }

  setStatus(id: string, status: MessageStatus): void {
    const message = this.messages.find((m) => m.id === id);
    if (!message) {
      return;
    }
    message.status = status;
    this.notify();
  }

  clear(): void {
    this.messages = [];
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getMessages());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getMessages();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
