import { createId } from '../core/id';
import { MessageStore } from '../core/message-store';
import { MockAgentTransport } from '../transport/mock-transport';
import type { AgentTransport, ConnectionStatus } from '../core/types';
import { Composer } from './components/composer';
import { MessageListView } from './components/message-list';
import { bannerFor, STATUS_LABEL } from './connection-state';
import { ICON_CHAT, ICON_CLOSE, ICON_MINIMIZE, ICON_SEND } from './icons';
import { WIDGET_STYLES } from './styles';

export const AGICHAT_WIDGET_TAG = 'agichat-widget';

export const DEFAULTS = {
  agentName: 'Asistente AGIChat',
  welcomeMessage: 'Escribe tu pregunta y el asistente te responderá aquí mismo.',
  placeholder: 'Escribe un mensaje…',
} as const;

/** Tiempo máximo de espera para que el transporte quede en `open`. */
export const CONNECT_TIMEOUT_MS = 10_000;

export type AgiChatWidgetEventName = 'agichat-open' | 'agichat-close';

/**
 * Web Component embebible del widget de chat de AGIChat.
 *
 * Orquesta tres piezas sin conocer los detalles de ninguna: el estado (`MessageStore`),
 * el transporte inyectable (`AgentTransport`) y los subcomponentes visuales de
 * `./components`. Cambiar el mock por un agente real (Fase 2) solo requiere asignar
 * otra implementación a `transport` antes de insertar el elemento en el DOM.
 */
export class AgiChatWidgetElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['agent-name', 'welcome-message', 'placeholder'];
  }

  private _transport: AgentTransport;
  private store = new MessageStore();
  private isOpen = false;
  private hasConnected = false;
  private connectionStatus: ConnectionStatus = 'idle';
  private pendingConnection: Promise<boolean> | null = null;
  private storeUnsubscribe: (() => void) | null = null;
  private transportUnsubscribers: Array<() => void> = [];

  private shellReady = false;
  private launcherEl!: HTMLButtonElement;
  private panelEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private avatarEl!: HTMLElement;
  private statusDotEl!: HTMLElement;
  private statusLabelEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private bannerTextEl!: HTMLElement;
  private bannerRetryEl!: HTMLButtonElement;
  private scrollerEl!: HTMLElement;
  private emptyTextEl!: HTMLElement;
  private typingEl!: HTMLElement;
  private listView!: MessageListView;
  private composer!: Composer;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._transport = new MockAgentTransport();
  }

  get transport(): AgentTransport {
    return this._transport;
  }

  /**
   * Se puede asignar antes o después de insertar el elemento en el DOM. Asignarlo después
   * es lo normal en frameworks como React o Vue (el ref existe cuando el elemento ya está
   * montado), así que aquí se re-cablean los listeners hacia el nuevo transporte.
   */
  set transport(next: AgentTransport) {
    if (next === this._transport) return;
    const previous = this._transport;
    this._transport = next;
    if (!this.isConnected || !this.shellReady) return;

    this.unwireTransport();
    previous.disconnect();
    this.pendingConnection = null;
    this.hasConnected = false;
    this.wireTransport();
    this.renderConnection(next.status);
    if (this.isOpen && next.status !== 'open' && next.status !== 'connecting') {
      void this.ensureConnected();
    }
  }

  connectedCallback(): void {
    this.renderShell();
    this.wireStore();
    this.wireTransport();
  }

  disconnectedCallback(): void {
    this.storeUnsubscribe?.();
    this.storeUnsubscribe = null;
    this.unwireTransport();
    this.transport.disconnect();
  }

  attributeChangedCallback(): void {
    if (this.shellReady) {
      this.applyTexts();
    }
  }

  get open(): boolean {
    return this.isOpen;
  }

  async openPanel(): Promise<void> {
    if (this.isOpen) return;
    this.setOpen(true);
    this.composer.focus();
    if (this.transport.status !== 'open' && this.transport.status !== 'connecting') {
      await this.ensureConnected();
    }
  }

  closePanel(options: { restoreFocus?: boolean } = {}): void {
    if (!this.isOpen) return;
    this.setOpen(false);
    if (options.restoreFocus) {
      this.launcherEl.focus();
    }
  }

  async toggle(): Promise<void> {
    if (this.isOpen) {
      this.closePanel();
    } else {
      await this.openPanel();
    }
  }

  private renderShell(): void {
    const root = this.shadowRoot as ShadowRoot;

    root.innerHTML = `
      <style>${WIDGET_STYLES}</style>
      <section class="panel" id="agichat-panel" data-open="false" role="dialog"
        aria-modal="false" aria-labelledby="agichat-title">
        <header class="header">
          <div class="avatar" aria-hidden="true"></div>
          <div class="heading">
            <h2 class="title" id="agichat-title"></h2>
            <p class="status" role="status">
              <span class="status-dot" data-status="idle"></span>
              <span class="status-label">${STATUS_LABEL.idle}</span>
            </p>
          </div>
          <button class="icon-button minimize" type="button" aria-label="Minimizar chat">
            ${ICON_MINIMIZE}
          </button>
        </header>
        <div class="banner" role="alert" hidden>
          <span class="banner-text"></span>
          <button class="banner-retry" type="button"></button>
        </div>
        <div class="messages" role="log" aria-live="polite" aria-label="Conversación" tabindex="0">
          <div class="empty">
            <p class="empty-title">¿En qué te ayudo?</p>
            <p class="empty-text"></p>
          </div>
          <div class="list"></div>
          <div class="typing" hidden>
            <span class="sr-only">El asistente está escribiendo…</span>
            <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
          </div>
        </div>
        <form class="composer">
          <label class="sr-only" for="agichat-input">Mensaje para el asistente</label>
          <textarea id="agichat-input" name="message" rows="1" autocomplete="off"></textarea>
          <button class="send" type="submit" aria-label="Enviar mensaje">${ICON_SEND}</button>
        </form>
        <p class="footer">Funciona con AGIChat</p>
      </section>
      <button class="launcher" type="button" aria-expanded="false" aria-controls="agichat-panel"
        aria-label="Abrir chat">
        <span class="icon-chat">${ICON_CHAT}</span>
        <span class="icon-close">${ICON_CLOSE}</span>
      </button>
    `;

    const $ = <T extends Element>(selector: string) => root.querySelector(selector) as T;
    this.launcherEl = $('.launcher');
    this.panelEl = $('.panel');
    this.titleEl = $('.title');
    this.avatarEl = $('.avatar');
    this.statusDotEl = $('.status-dot');
    this.statusLabelEl = $('.status-label');
    this.bannerEl = $('.banner');
    this.bannerTextEl = $('.banner-text');
    this.bannerRetryEl = $('.banner-retry');
    this.scrollerEl = $('.messages');
    this.emptyTextEl = $('.empty-text');
    this.typingEl = $('.typing');
    this.listView = new MessageListView(this.scrollerEl, $('.list'), $('.empty'));
    this.composer = new Composer($('form'), $('textarea'), (text) => {
      void this.sendText(text);
    });

    this.launcherEl.addEventListener('click', () => {
      void this.toggle();
    });
    $<HTMLButtonElement>('.minimize').addEventListener('click', () =>
      this.closePanel({ restoreFocus: true }),
    );
    this.panelEl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.closePanel({ restoreFocus: true });
      }
    });
    this.bannerRetryEl.addEventListener('click', () => {
      void this.ensureConnected();
    });
    this.scrollerEl.addEventListener('click', (event) => this.handleListClick(event));

    this.shellReady = true;
    this.applyTexts();
    this.renderConnection(this.transport.status);
  }

  private applyTexts(): void {
    const agentName = this.getAttribute('agent-name') || DEFAULTS.agentName;
    this.titleEl.textContent = agentName;
    this.avatarEl.textContent = agentName.trim().charAt(0).toUpperCase();
    this.emptyTextEl.textContent = this.getAttribute('welcome-message') || DEFAULTS.welcomeMessage;
    this.composer.setPlaceholder(this.getAttribute('placeholder') || DEFAULTS.placeholder);
  }

  private wireStore(): void {
    this.storeUnsubscribe = this.store.subscribe((messages) => this.listView.render(messages));
  }

  private wireTransport(): void {
    this.transportUnsubscribers.push(
      this.transport.onMessage((message) => {
        const existing = this.store.getMessages().find((m) => m.id === message.id);
        if (existing) {
          this.store.updateContent(message.id, message.content, message.status);
        } else {
          this.store.add(message);
        }
        if (message.role === 'assistant') {
          this.setAwaitingReply(false);
        }
      }),
    );
    this.transportUnsubscribers.push(
      this.transport.onStatusChange((status) => this.renderConnection(status)),
    );
  }

  private unwireTransport(): void {
    for (const unsubscribe of this.transportUnsubscribers) {
      unsubscribe();
    }
    this.transportUnsubscribers = [];
  }

  private setOpen(open: boolean): void {
    this.isOpen = open;
    this.panelEl.dataset.open = String(open);
    this.launcherEl.setAttribute('aria-expanded', String(open));
    this.launcherEl.setAttribute('aria-label', open ? 'Cerrar chat' : 'Abrir chat');
    const eventName: AgiChatWidgetEventName = open ? 'agichat-open' : 'agichat-close';
    this.dispatchEvent(new CustomEvent(eventName, { bubbles: true, composed: true }));
  }

  private renderConnection(status: ConnectionStatus): void {
    this.connectionStatus = status;
    if (status === 'open') {
      this.hasConnected = true;
    }
    this.statusDotEl.dataset.status = status;
    this.statusLabelEl.textContent = STATUS_LABEL[status];

    const banner = bannerFor(status, this.hasConnected);
    this.bannerEl.hidden = banner === null;
    if (banner) {
      this.bannerTextEl.textContent = banner.message;
      this.bannerRetryEl.textContent = banner.action;
      this.setAwaitingReply(false);
    }
  }

  /**
   * Resuelve `true` cuando el transporte queda en `open`. Se apoya en `onStatusChange`
   * y no solo en la promesa de `connect()` porque un transporte real puede resolver
   * `connect()` antes de estar listo (o quedarse colgado), así que también hay timeout.
   */
  private ensureConnected(): Promise<boolean> {
    if (this.transport.status === 'open') return Promise.resolve(true);
    if (this.pendingConnection) return this.pendingConnection;

    const transport = this.transport;
    this.pendingConnection = new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        stopListening();
        if (transport !== this.transport) {
          resolve(false);
          return;
        }
        this.pendingConnection = null;
        const finalStatus: ConnectionStatus = ok ? 'open' : 'error';
        if (this.connectionStatus !== finalStatus) {
          this.renderConnection(finalStatus);
        }
        resolve(ok);
      };
      const stopListening = transport.onStatusChange((status) => {
        if (status === 'open') settle(true);
        if (status === 'error' || status === 'closed') settle(false);
      });
      const timer = setTimeout(() => settle(false), CONNECT_TIMEOUT_MS);

      if (transport.status !== 'connecting') {
        this.renderConnection('connecting');
        transport.connect().then(
          () => {
            if (transport.status === 'open') settle(true);
          },
          () => settle(false),
        );
      }
    });
    return this.pendingConnection;
  }

  private async sendText(text: string, retryId?: string): Promise<void> {
    const id = retryId ?? createId('user');
    if (retryId) {
      this.store.setStatus(id, 'pending');
    } else {
      this.store.add({ id, role: 'user', content: text, status: 'pending', createdAt: Date.now() });
    }
    this.listView.scrollToBottom();

    const connected = await this.ensureConnected();
    if (!connected) {
      this.store.setStatus(id, 'error');
      return;
    }

    try {
      this.transport.send(text);
      this.store.setStatus(id, 'complete');
      this.setAwaitingReply(true);
    } catch {
      this.store.setStatus(id, 'error');
    }
  }

  private handleListClick(event: Event): void {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('button[data-action="retry"]');
    if (!button) return;
    const message = this.store.getMessages().find((m) => m.id === button.dataset.id);
    if (message) {
      void this.sendText(message.content, message.id);
    }
  }

  private setAwaitingReply(value: boolean): void {
    this.typingEl.hidden = !value;
    if (value) {
      this.listView.scrollToBottom();
    }
  }
}

export function defineAgiChatWidget(): void {
  if (!customElements.get(AGICHAT_WIDGET_TAG)) {
    customElements.define(AGICHAT_WIDGET_TAG, AgiChatWidgetElement);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'agichat-widget': AgiChatWidgetElement;
  }
}
