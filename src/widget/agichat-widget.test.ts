import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AGICHAT_WIDGET_TAG, AgiChatWidgetElement, defineAgiChatWidget } from './agichat-widget';
import type { AgentTransport, ChatMessage, ConnectionStatus } from '../core/types';

class FakeTransport implements AgentTransport {
  status: ConnectionStatus = 'idle';
  connect = vi.fn(async () => {
    this.status = 'open';
  });
  disconnect = vi.fn(() => {
    this.status = 'closed';
  });
  send = vi.fn();
  private messageHandlers = new Set<(message: ChatMessage) => void>();
  private statusHandlers = new Set<(status: ConnectionStatus) => void>();

  onMessage(handler: (message: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatusChange(handler: (status: ConnectionStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  emitMessage(message: ChatMessage): void {
    for (const handler of this.messageHandlers) handler(message);
  }

  emitStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const handler of this.statusHandlers) handler(status);
  }

  get messageHandlerCount(): number {
    return this.messageHandlers.size;
  }
}

function mount(): { el: AgiChatWidgetElement; transport: FakeTransport } {
  const el = document.createElement(AGICHAT_WIDGET_TAG) as AgiChatWidgetElement;
  const transport = new FakeTransport();
  el.transport = transport;
  document.body.appendChild(el);
  return { el, transport };
}

describe('AgiChatWidgetElement', () => {
  beforeAll(() => {
    defineAgiChatWidget();
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('se registra como custom element', () => {
    expect(customElements.get(AGICHAT_WIDGET_TAG)).toBe(AgiChatWidgetElement);
  });

  it('renderiza el panel cerrado por defecto', () => {
    const { el } = mount();
    const panel = el.shadowRoot?.querySelector('.panel') as HTMLElement;
    expect(panel.dataset.open).toBe('false');
  });

  it('abre el panel y conecta el transporte al hacer click en el toggle', async () => {
    const { el, transport } = mount();
    const toggle = el.shadowRoot?.querySelector('.toggle') as HTMLButtonElement;

    toggle.click();
    await Promise.resolve();
    await Promise.resolve();

    const panel = el.shadowRoot?.querySelector('.panel') as HTMLElement;
    expect(panel.dataset.open).toBe('true');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(transport.connect).toHaveBeenCalledTimes(1);
  });

  it('no reconecta si el transporte ya está abierto', async () => {
    const { el, transport } = mount();
    transport.status = 'open';
    const toggle = el.shadowRoot?.querySelector('.toggle') as HTMLButtonElement;

    toggle.click();
    await Promise.resolve();

    expect(transport.connect).not.toHaveBeenCalled();
  });

  it('envía un mensaje del usuario y lo renderiza optimistamente', async () => {
    const { el, transport } = mount();
    const form = el.shadowRoot?.querySelector('form') as HTMLFormElement;
    const input = el.shadowRoot?.querySelector('input') as HTMLInputElement;

    input.value = 'Hola agente';
    form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }));

    const userMessage = el.shadowRoot?.querySelector('[data-role="user"]');
    expect(userMessage?.textContent).toBe('Hola agente');
    expect(transport.send).toHaveBeenCalledWith('Hola agente');
    expect(input.value).toBe('');
  });

  it('ignora el envío de mensajes vacíos', () => {
    const { el, transport } = mount();
    const form = el.shadowRoot?.querySelector('form') as HTMLFormElement;
    const input = el.shadowRoot?.querySelector('input') as HTMLInputElement;

    input.value = '   ';
    form.dispatchEvent(new SubmitEvent('submit', { cancelable: true }));

    expect(transport.send).not.toHaveBeenCalled();
    expect(el.shadowRoot?.querySelectorAll('.message')).toHaveLength(0);
  });

  it('renderiza mensajes entrantes del agente y actualiza el streaming por id', () => {
    const { el, transport } = mount();

    transport.emitMessage({
      id: 'a1',
      role: 'assistant',
      content: 'Hola',
      status: 'streaming',
      createdAt: 0,
    });
    transport.emitMessage({
      id: 'a1',
      role: 'assistant',
      content: 'Hola mundo',
      status: 'complete',
      createdAt: 0,
    });

    const messages = el.shadowRoot?.querySelectorAll('[data-role="assistant"]');
    expect(messages).toHaveLength(1);
    expect(messages?.[0]?.textContent).toBe('Hola mundo');
    expect(messages?.[0]?.getAttribute('data-status')).toBe('complete');
  });

  it('escapa HTML en el contenido de los mensajes', () => {
    const { el, transport } = mount();

    transport.emitMessage({
      id: 'a1',
      role: 'assistant',
      content: '<img src=x onerror="alert(1)">',
      status: 'complete',
      createdAt: 0,
    });

    const rendered = el.shadowRoot?.querySelector('[data-role="assistant"]')?.innerHTML;
    expect(rendered).not.toContain('<img');
    expect(rendered).toContain('&lt;img');
  });

  it('refleja los cambios de estado de conexión en la UI', () => {
    const { el, transport } = mount();
    transport.emitStatus('open');

    const statusEl = el.shadowRoot?.querySelector('.status');
    expect(statusEl?.textContent).toBe('En línea');
  });

  it('al desconectar el elemento del DOM, limpia listeners y desconecta el transporte', () => {
    const { el, transport } = mount();
    expect(transport.messageHandlerCount).toBeGreaterThan(0);

    el.remove();

    expect(transport.disconnect).toHaveBeenCalledTimes(1);
  });
});
