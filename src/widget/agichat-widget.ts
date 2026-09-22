import { createId } from '../core/id';
import { MessageStore } from '../core/message-store';
import { MockAgentTransport } from '../transport/mock-transport';
import type { AgentTransport, ConnectionStatus } from '../core/types';

export const AGICHAT_WIDGET_TAG = 'agichat-widget';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Desconectado',
  connecting: 'Conectando…',
  open: 'En línea',
  closed: 'Desconectado',
  error: 'Error de conexión',
};

/**
 * Web Component embebible del widget de chat de AGIChat.
 *
 * Esta es una implementación mínima y funcional (Parte 1) que prueba de
 * extremo a extremo el flujo: UI -> MessageStore -> AgentTransport.
 * El diseño visual final según el wireframe, el renderizado enriquecido de
 * Markdown y los estados adicionales de UX son responsabilidad de la Parte 2
 * (ver README.md, sección "Plan de trabajo").
 */
export class AgiChatWidgetElement extends HTMLElement {
  transport: AgentTransport;

  private store = new MessageStore();
  private isOpen = false;
  private unsubscribers: Array<() => void> = [];
  private panelEl!: HTMLDivElement;
  private listEl!: HTMLDivElement;
  private formEl!: HTMLFormElement;
  private inputEl!: HTMLInputElement;
  private statusEl!: HTMLSpanElement;
  private toggleEl!: HTMLButtonElement;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.transport = new MockAgentTransport();
  }

  connectedCallback(): void {
    this.renderShell();
    this.wireStore();
    this.wireTransport();
  }

  disconnectedCallback(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
    this.transport.disconnect();
  }

  private renderShell(): void {
    const root = this.shadowRoot;
    if (!root) return;

    root.innerHTML = `
      <style>
        :host { all: initial; font-family: system-ui, sans-serif; }
        .toggle { cursor: pointer; border-radius: 999px; padding: 12px 16px; border: none; }
        .panel { display: none; flex-direction: column; width: 320px; height: 420px; }
        .panel[data-open="true"] { display: flex; }
        .messages { flex: 1; overflow-y: auto; }
        .message { margin: 4px 0; }
        .message[data-role="user"] { text-align: right; }
        form { display: flex; }
        input { flex: 1; }
      </style>
      <button class="toggle" type="button" aria-expanded="false">Chat</button>
      <div class="panel" data-open="false" role="dialog" aria-label="AGIChat">
        <header>
          <span class="status">Desconectado</span>
        </header>
        <div class="messages" role="log" aria-live="polite"></div>
        <form>
          <input type="text" name="message" placeholder="Escribe un mensaje…" autocomplete="off" />
          <button type="submit">Enviar</button>
        </form>
      </div>
    `;

    this.toggleEl = root.querySelector('.toggle') as HTMLButtonElement;
    this.panelEl = root.querySelector('.panel') as HTMLDivElement;
    this.listEl = root.querySelector('.messages') as HTMLDivElement;
    this.formEl = root.querySelector('form') as HTMLFormElement;
    this.inputEl = root.querySelector('input') as HTMLInputElement;
    this.statusEl = root.querySelector('.status') as HTMLSpanElement;

    this.toggleEl.addEventListener('click', () => this.handleToggle());
    this.formEl.addEventListener('submit', (event) => this.handleSubmit(event));
  }

  private wireStore(): void {
    const unsubscribe = this.store.subscribe((messages) => {
      this.listEl.innerHTML = messages
        .map(
          (m) =>
            `<div class="message" data-role="${m.role}" data-status="${m.status}">${escapeHtml(m.content)}</div>`,
        )
        .join('');
      this.listEl.scrollTop = this.listEl.scrollHeight;
    });
    this.unsubscribers.push(unsubscribe);
  }

  private wireTransport(): void {
    this.unsubscribers.push(
      this.transport.onMessage((message) => {
        const existing = this.store.getMessages().find((m) => m.id === message.id);
        if (existing) {
          this.store.updateContent(message.id, message.content, message.status);
        } else {
          this.store.add(message);
        }
      }),
    );
    this.unsubscribers.push(
      this.transport.onStatusChange((status) => {
        this.statusEl.textContent = STATUS_LABEL[status];
      }),
    );
  }

  private async handleToggle(): Promise<void> {
    this.isOpen = !this.isOpen;
    this.panelEl.dataset.open = String(this.isOpen);
    this.toggleEl.setAttribute('aria-expanded', String(this.isOpen));

    if (this.isOpen && this.transport.status === 'idle') {
      await this.transport.connect();
    }
  }

  private handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.store.add({
      id: createId('user'),
      role: 'user',
      content: text,
      status: 'complete',
      createdAt: Date.now(),
    });
    this.inputEl.value = '';
    this.transport.send(text);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function defineAgiChatWidget(): void {
  if (!customElements.get(AGICHAT_WIDGET_TAG)) {
    customElements.define(AGICHAT_WIDGET_TAG, AgiChatWidgetElement);
  }
}
