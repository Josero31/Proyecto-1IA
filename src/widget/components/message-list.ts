import type { ChatMessage, MessageStatus } from '../../core/types';
import { createMessageElement, updateMessageElement } from './message-view';

interface RenderedMessage {
  el: HTMLElement;
  content: string;
  status: MessageStatus;
}

const STICK_TO_BOTTOM_THRESHOLD_PX = 48;

/**
 * Reconciliación por id: durante el streaming solo se vuelve a pintar la burbuja que
 * cambió, en lugar de regenerar toda la conversación en cada chunk (lo que además
 * haría perder la selección de texto y el scroll del usuario).
 */
export class MessageListView {
  private rendered = new Map<string, RenderedMessage>();

  constructor(
    private readonly scroller: HTMLElement,
    private readonly list: HTMLElement,
    private readonly emptyState: HTMLElement,
  ) {}

  render(messages: ChatMessage[]): void {
    const shouldStick = this.isNearBottom();
    const ids = new Set(messages.map((m) => m.id));

    for (const [id, entry] of this.rendered) {
      if (!ids.has(id)) {
        entry.el.remove();
        this.rendered.delete(id);
      }
    }

    for (const message of messages) {
      const entry = this.rendered.get(message.id);
      if (!entry) {
        const el = createMessageElement(message);
        this.list.append(el);
        this.rendered.set(message.id, { el, content: message.content, status: message.status });
      } else if (entry.content !== message.content || entry.status !== message.status) {
        updateMessageElement(entry.el, message);
        entry.content = message.content;
        entry.status = message.status;
      }
    }

    this.emptyState.hidden = messages.length > 0;
    if (shouldStick) {
      this.scrollToBottom();
    }
  }

  scrollToBottom(): void {
    this.scroller.scrollTop = this.scroller.scrollHeight;
  }

  private isNearBottom(): boolean {
    const { scrollHeight, scrollTop, clientHeight } = this.scroller;
    return scrollHeight - scrollTop - clientHeight <= STICK_TO_BOTTOM_THRESHOLD_PX;
  }
}
