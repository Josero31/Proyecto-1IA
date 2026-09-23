import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGICHAT_WIDGET_TAG,
  AgiChatWidgetElement,
  CONNECT_TIMEOUT_MS,
  DEFAULTS,
  defineAgiChatWidget,
} from './agichat-widget';
import type { AgentTransport, ChatMessage, ConnectionStatus } from '../core/types';

type ConnectMode = 'open' | 'reject' | 'hang';

class FakeTransport implements AgentTransport {
  status: ConnectionStatus = 'idle';
  connectMode: ConnectMode = 'open';
  connect = vi.fn(async () => {
    if (this.connectMode === 'reject') throw new Error('sin red');
    if (this.connectMode === 'hang') return new Promise<void>(() => {});
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

  emitMessage(message: Partial<ChatMessage> & { id: string }): void {
    const full: ChatMessage = {
      role: 'assistant',
      content: '',
      status: 'complete',
      createdAt: 0,
      ...message,
    };
    for (const handler of this.messageHandlers) handler(full);
  }

  emitStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const handler of this.statusHandlers) handler(status);
  }

  get messageHandlerCount(): number {
    return this.messageHandlers.size;
  }
}

function mount(attributes: Record<string, string> = {}) {
  const el = document.createElement(AGICHAT_WIDGET_TAG);
  for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
  const transport = new FakeTransport();
  el.transport = transport;
  document.body.appendChild(el);
  const root = el.shadowRoot as ShadowRoot;
  const q = <T extends Element = HTMLElement>(selector: string) =>
    root.querySelector(selector) as T;
  return { el, transport, root, q };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function submit(q: ReturnType<typeof mount>['q'], text: string): void {
  q<HTMLTextAreaElement>('textarea').value = text;
  q<HTMLFormElement>('form').dispatchEvent(new SubmitEvent('submit', { cancelable: true }));
}

describe('AgiChatWidgetElement', () => {
  beforeAll(() => {
    defineAgiChatWidget();
  });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('registro y estado inicial', () => {
    it('se registra como custom element y no falla si se define dos veces', () => {
      defineAgiChatWidget();
      expect(customElements.get(AGICHAT_WIDGET_TAG)).toBe(AgiChatWidgetElement);
    });

    it('renderiza el panel cerrado, el estado vacío y los textos por defecto', () => {
      const { el, q } = mount();
      expect(el.open).toBe(false);
      expect(q('.panel').dataset.open).toBe('false');
      expect(q('.launcher').getAttribute('aria-expanded')).toBe('false');
      expect(q('.launcher').getAttribute('aria-label')).toBe('Abrir chat');
      expect(q('.title').textContent).toBe(DEFAULTS.agentName);
      expect(q('.avatar').textContent).toBe('A');
      expect(q('.empty-text').textContent).toBe(DEFAULTS.welcomeMessage);
      expect(q('.empty').hidden).toBe(false);
      expect(q<HTMLTextAreaElement>('textarea').placeholder).toBe(DEFAULTS.placeholder);
      expect(q('.typing').hidden).toBe(true);
      expect(q('.banner').hidden).toBe(true);
    });

    it('usa el transporte mock por defecto si no se inyecta ninguno', () => {
      const el = document.createElement(AGICHAT_WIDGET_TAG);
      expect(el.transport.status).toBe('idle');
    });
  });

  describe('atributos de personalización', () => {
    it('aplica agent-name, welcome-message y placeholder', () => {
      const { q } = mount({
        'agent-name': 'soporte Shop',
        'welcome-message': 'Pregunta por tu pedido',
        placeholder: 'Tu pregunta…',
      });
      expect(q('.title').textContent).toBe('soporte Shop');
      expect(q('.avatar').textContent).toBe('S');
      expect(q('.empty-text').textContent).toBe('Pregunta por tu pedido');
      expect(q<HTMLTextAreaElement>('textarea').placeholder).toBe('Tu pregunta…');
    });

    it('actualiza los textos si los atributos cambian después de montar', () => {
      const { el, q } = mount();
      el.setAttribute('agent-name', 'Nova');
      expect(q('.title').textContent).toBe('Nova');
    });

    it('no escapa del Shadow DOM con HTML en los atributos', () => {
      const { q } = mount({ 'agent-name': '<b>x</b>' });
      expect(q('.title').innerHTML).toBe('&lt;b&gt;x&lt;/b&gt;');
    });
  });

  describe('abrir y cerrar el panel', () => {
    it('abre el panel, enfoca la caja de texto, emite agichat-open y conecta', async () => {
      const { el, transport, root, q } = mount();
      const onOpen = vi.fn();
      el.addEventListener('agichat-open', onOpen);

      q<HTMLButtonElement>('.launcher').click();
      await flush();

      expect(el.open).toBe(true);
      expect(q('.panel').dataset.open).toBe('true');
      expect(q('.launcher').getAttribute('aria-expanded')).toBe('true');
      expect(q('.launcher').getAttribute('aria-label')).toBe('Cerrar chat');
      expect(root.activeElement).toBe(q('textarea'));
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(transport.connect).toHaveBeenCalledTimes(1);
      expect(q('.status-label').textContent).toBe('En línea');
    });

    it('no reconecta si el transporte ya está abierto', async () => {
      const { transport, q } = mount();
      transport.status = 'open';
      q<HTMLButtonElement>('.launcher').click();
      await flush();
      expect(transport.connect).not.toHaveBeenCalled();
    });

    it('el lanzador alterna el panel y emite agichat-close al cerrar', async () => {
      const { el, q } = mount();
      const onClose = vi.fn();
      el.addEventListener('agichat-close', onClose);

      await el.toggle();
      await el.toggle();

      expect(el.open).toBe(false);
      expect(q('.panel').dataset.open).toBe('false');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Escape cierra el panel y devuelve el foco al lanzador', async () => {
      const { el, root, q } = mount();
      await el.openPanel();

      q('textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(el.open).toBe(false);
      expect(root.activeElement).toBe(q('.launcher'));
    });

    it('ignora otras teclas dentro del panel', async () => {
      const { el, q } = mount();
      await el.openPanel();
      q('.panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(el.open).toBe(true);
    });

    it('el botón de minimizar cierra el panel', async () => {
      const { el, q } = mount();
      await el.openPanel();
      q<HTMLButtonElement>('.minimize').click();
      expect(el.open).toBe(false);
    });

    it('openPanel y closePanel son idempotentes', async () => {
      const { el, transport } = mount();
      const events = vi.fn();
      el.addEventListener('agichat-open', events);
      el.addEventListener('agichat-close', events);

      el.closePanel();
      await el.openPanel();
      await el.openPanel();

      expect(events).toHaveBeenCalledTimes(1);
      expect(transport.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('envío de mensajes', () => {
    it('renderiza el mensaje del usuario de inmediato y lo envía al transporte', async () => {
      const { transport, q } = mount();
      transport.status = 'open';

      submit(q, 'Hola agente');

      const bubble = q('[data-role="user"] .bubble-content');
      expect(bubble.textContent).toBe('Hola agente');
      expect(q<HTMLTextAreaElement>('textarea').value).toBe('');
      expect(q('.empty').hidden).toBe(true);

      await flush();
      expect(transport.send).toHaveBeenCalledWith('Hola agente');
      expect(q('[data-role="user"]').dataset.status).toBe('complete');
    });

    it('conecta primero si el transporte todavía no está abierto', async () => {
      const { transport, q } = mount();
      submit(q, 'Hola');
      expect(q('[data-role="user"]').dataset.status).toBe('pending');

      await flush();

      expect(transport.connect).toHaveBeenCalledTimes(1);
      expect(transport.send).toHaveBeenCalledWith('Hola');
    });

    it('espera a que un transporte en "connecting" pase a "open" antes de enviar', async () => {
      const { transport, q } = mount();
      transport.status = 'connecting';

      submit(q, 'Hola');
      await flush();
      expect(transport.send).not.toHaveBeenCalled();
      expect(transport.connect).not.toHaveBeenCalled();

      transport.emitStatus('open');
      await flush();
      expect(transport.send).toHaveBeenCalledWith('Hola');
    });

    it('comparte una sola conexión pendiente entre varios envíos', async () => {
      const { transport, q } = mount();
      submit(q, 'uno');
      submit(q, 'dos');
      await flush();
      expect(transport.connect).toHaveBeenCalledTimes(1);
      expect(transport.send).toHaveBeenCalledTimes(2);
    });

    it('ignora mensajes vacíos', () => {
      const { transport, q } = mount();
      submit(q, '   ');
      expect(transport.send).not.toHaveBeenCalled();
      expect(q('.list').children).toHaveLength(0);
    });

    it('muestra el mensaje del usuario como texto plano, sin interpretar Markdown', () => {
      const { q } = mount();
      submit(q, '**hola** <i>x</i>');
      const bubble = q('[data-role="user"] .bubble-content');
      expect(bubble.textContent).toBe('**hola** <i>x</i>');
      expect(bubble.querySelector('strong, i')).toBeNull();
    });
  });

  describe('indicador "escribiendo…"', () => {
    it('aparece al enviar y desaparece con el primer chunk del agente', async () => {
      const { transport, q } = mount();
      transport.status = 'open';

      submit(q, 'Hola');
      await flush();
      expect(q('.typing').hidden).toBe(false);

      transport.emitMessage({ id: 'a1', content: 'Hola', status: 'streaming' });
      expect(q('.typing').hidden).toBe(true);
    });

    it('no se oculta por mensajes que no son del agente', async () => {
      const { transport, q } = mount();
      transport.status = 'open';
      submit(q, 'Hola');
      await flush();

      transport.emitMessage({ id: 's1', role: 'system', content: 'Aviso' });
      expect(q('.typing').hidden).toBe(false);
    });
  });

  describe('respuestas del agente', () => {
    it('actualiza el streaming por id y renderiza Markdown al completar', () => {
      const { transport, q, root } = mount();

      transport.emitMessage({ id: 'a1', content: 'Hola **mun', status: 'streaming' });
      expect(q('[data-role="assistant"]').getAttribute('aria-busy')).toBe('true');

      transport.emitMessage({
        id: 'a1',
        content: 'Hola **mundo**\n\n- uno\n- dos\n\n```js\nconsole.log(1);\n```',
        status: 'complete',
      });

      const messages = root.querySelectorAll('[data-role="assistant"]');
      expect(messages).toHaveLength(1);
      const content = q('[data-role="assistant"] .bubble-content');
      expect(content.querySelector('strong')?.textContent).toBe('mundo');
      expect(content.querySelectorAll('li')).toHaveLength(2);
      expect(content.querySelector('pre code')?.textContent).toContain('console.log(1);');
      expect(q('[data-role="assistant"]').dataset.status).toBe('complete');
      expect(q('[data-role="assistant"]').getAttribute('aria-busy')).toBe('false');
    });

    it('sanitiza el HTML peligroso que venga en la respuesta', () => {
      const { transport, q } = mount();
      transport.emitMessage({
        id: 'a1',
        content: '<img src=x onerror="alert(1)"><script>alert(2)</script>[x](javascript:alert(3))',
      });

      const html = q('[data-role="assistant"] .bubble-content').innerHTML;
      expect(html).not.toContain('<img');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('onerror');
      expect(html).not.toContain('javascript:');
    });

    it('marca una respuesta interrumpida por error', () => {
      const { transport, q } = mount();
      transport.emitMessage({ id: 'a1', content: 'Parcial', status: 'error' });
      expect(q('[data-role="assistant"] .message-error')?.textContent).toBe(
        'La respuesta se interrumpió.',
      );
      expect(q('[data-role="assistant"] [data-action="retry"]')).toBeNull();
    });
  });

  describe('estado de conexión y errores', () => {
    it('refleja los cambios de estado en la cabecera', () => {
      const { transport, q } = mount();
      transport.emitStatus('open');
      expect(q('.status-label').textContent).toBe('En línea');
      expect(q('.status-dot').dataset.status).toBe('open');
    });

    it('muestra un aviso con "Reintentar" cuando el transporte reporta error', async () => {
      const { transport, q } = mount();
      transport.emitStatus('error');

      expect(q('.banner').hidden).toBe(false);
      expect(q('.banner-text').textContent).toBe('No se pudo conectar con el asistente.');
      expect(q('.banner-retry').textContent).toBe('Reintentar');

      q<HTMLButtonElement>('.banner-retry').click();
      await flush();

      expect(transport.connect).toHaveBeenCalledTimes(1);
      expect(q('.banner').hidden).toBe(true);
    });

    it('ofrece "Reconectar" si se pierde una conexión que ya estaba abierta', () => {
      const { transport, q } = mount();
      transport.emitStatus('open');
      transport.emitStatus('closed');
      expect(q('.banner-retry').textContent).toBe('Reconectar');
    });

    it('oculta el indicador "escribiendo…" si se cae la conexión', async () => {
      const { transport, q } = mount();
      transport.status = 'open';
      submit(q, 'Hola');
      await flush();

      transport.emitStatus('error');
      expect(q('.typing').hidden).toBe(true);
    });

    it('si connect() falla, marca el mensaje con error y permite reintentarlo', async () => {
      const { transport, q } = mount();
      transport.connectMode = 'reject';

      submit(q, 'Hola');
      await flush();

      const message = q('[data-role="user"]');
      expect(message.dataset.status).toBe('error');
      expect(q('.banner').hidden).toBe(false);
      expect(transport.send).not.toHaveBeenCalled();

      transport.connectMode = 'open';
      q<HTMLButtonElement>('[data-action="retry"]').click();
      await flush();

      expect(transport.send).toHaveBeenCalledWith('Hola');
      expect(q('[data-role="user"]').dataset.status).toBe('complete');
      expect(q('.list').children).toHaveLength(1);
    });

    it('si el transporte pasa a "closed" mientras conecta, el envío falla', async () => {
      const { transport, q } = mount();
      transport.status = 'connecting';
      submit(q, 'Hola');
      transport.emitStatus('closed');
      await flush();
      expect(q('[data-role="user"]').dataset.status).toBe('error');
    });

    it('si send() lanza una excepción, el mensaje queda en error', async () => {
      const { transport, q } = mount();
      transport.status = 'open';
      transport.send.mockImplementation(() => {
        throw new Error('fallo');
      });

      submit(q, 'Hola');
      await flush();

      expect(q('[data-role="user"]').dataset.status).toBe('error');
      expect(q('.typing').hidden).toBe(true);
    });

    it('da la conexión por fallida si no abre antes del timeout', async () => {
      vi.useFakeTimers();
      const { transport, q } = mount();
      transport.connectMode = 'hang';

      submit(q, 'Hola');
      await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);

      expect(q('[data-role="user"]').dataset.status).toBe('error');
      expect(q('.status-label').textContent).toBe('Sin conexión');
    });

    it('ignora clicks en la conversación que no son de reintento', () => {
      const { transport, q } = mount();
      transport.emitMessage({ id: 'a1', content: 'Hola' });
      q('[data-role="assistant"] .bubble').click();
      expect(transport.send).not.toHaveBeenCalled();
    });

    it('ignora un reintento de un mensaje que ya no existe', () => {
      const { transport, q } = mount();
      const orphan = document.createElement('button');
      orphan.dataset.action = 'retry';
      orphan.dataset.id = 'no-existe';
      q('.list').append(orphan);
      orphan.click();
      expect(transport.send).not.toHaveBeenCalled();
    });
  });

  describe('cambio de transporte después de montar (React, Vue)', () => {
    it('re-cablea los listeners y desconecta el transporte anterior', () => {
      const { el, transport: previous, q } = mount();
      const next = new FakeTransport();

      el.transport = next;

      expect(el.transport).toBe(next);
      expect(previous.disconnect).toHaveBeenCalledTimes(1);
      expect(previous.messageHandlerCount).toBe(0);

      previous.emitMessage({ id: 'viejo', content: 'no debe verse' });
      next.emitMessage({ id: 'nuevo', content: 'sí debe verse' });
      expect(q('.list').textContent).not.toContain('no debe verse');
      expect(q('.list').textContent).toContain('sí debe verse');
    });

    it('conecta el nuevo transporte si el panel ya estaba abierto', async () => {
      const { el } = mount();
      await el.openPanel();
      const next = new FakeTransport();

      el.transport = next;
      await flush();

      expect(next.connect).toHaveBeenCalledTimes(1);
    });

    it('asignar el mismo transporte no hace nada', () => {
      const { el, transport } = mount();
      el.transport = transport;
      expect(transport.disconnect).not.toHaveBeenCalled();
    });

    it('ignora el resultado de una conexión de un transporte ya reemplazado', async () => {
      const { el, transport: previous, q } = mount();
      previous.connectMode = 'reject';
      const sending = (async () => submit(q, 'Hola'))();
      el.transport = new FakeTransport();
      await sending;
      await flush();

      expect(q('.status-label').textContent).toBe('Desconectado');
      expect(q('.banner').hidden).toBe(true);
    });

    it('antes de montar solo guarda el transporte', () => {
      const el = document.createElement(AGICHAT_WIDGET_TAG);
      const first = new FakeTransport();
      el.transport = first;
      el.transport = new FakeTransport();
      expect(first.disconnect).not.toHaveBeenCalled();
    });
  });

  it('al desconectarse del DOM limpia listeners y desconecta el transporte', () => {
    const { el, transport } = mount();
    expect(transport.messageHandlerCount).toBeGreaterThan(0);

    el.remove();

    expect(transport.messageHandlerCount).toBe(0);
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
  });
});
