import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentAction, ChatMessage, ConnectionStatus } from '../core/types';
import { WebSocketAgentTransport } from './websocket-transport';

class FakeSocket {
  static instances: FakeSocket[] = [];
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  receive(payload: unknown): void {
    this.onmessage?.({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) });
  }
}

const WebSocketImpl = FakeSocket as unknown as typeof WebSocket;
const URL_BASE = 'ws://localhost:8000/ws';
const CARD = {
  tmdbId: 438631,
  title: 'Dune',
  year: 2021,
  posterUrl: 'https://image.tmdb.org/t/p/w500/dune.jpg',
  overview: 'Paul Atreides llega a Arrakis.',
  rating: 7.8,
  imdbUrl: 'https://www.imdb.com/title/tt1160419/',
  tmdbUrl: 'https://www.themoviedb.org/movie/438631',
};

function setup(sessionId = 'sesion-de-prueba') {
  FakeSocket.instances = [];
  const transport = new WebSocketAgentTransport(URL_BASE, { sessionId, WebSocketImpl });
  const messages: ChatMessage[] = [];
  const actions: AgentAction[] = [];
  const statuses: ConnectionStatus[] = [];
  transport.onMessage((m) => messages.push(m));
  transport.onAction((a) => actions.push(a));
  transport.onStatusChange((s) => statuses.push(s));
  return { transport, messages, actions, statuses };
}

const socketAt = (index: number): FakeSocket => FakeSocket.instances[index] as FakeSocket;

async function openTransport(transport: WebSocketAgentTransport): Promise<FakeSocket> {
  const connection = transport.connect();
  const socket = FakeSocket.instances.at(-1) as FakeSocket;
  socket.onopen?.();
  await connection;
  return socket;
}

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('WebSocketAgentTransport: conexión', () => {
  it('pasa por connecting → open → closed y manda la sesión en la URL', async () => {
    const { transport, statuses } = setup();
    const socket = await openTransport(transport);
    expect(socket.url).toBe(`${URL_BASE}?session=sesion-de-prueba`);
    expect(transport.status).toBe('open');

    socket.onclose?.();
    expect(statuses).toEqual(['connecting', 'open', 'closed']);
  });

  it('emite error y rechaza si la conexión falla', async () => {
    const { transport, statuses } = setup();
    const connection = transport.connect();
    const socket = socketAt(0);
    socket.onerror?.();
    socket.onclose?.();
    await expect(connection).rejects.toThrow();
    expect(transport.status).toBe('error');
    expect(statuses).toEqual(['connecting', 'error']);
  });

  it('emite error si el constructor del WebSocket lanza', async () => {
    const Throwing = class {
      constructor() {
        throw new Error('bloqueado');
      }
    } as unknown as typeof WebSocket;
    const transport = new WebSocketAgentTransport(URL_BASE, {
      sessionId: 'sesion-de-prueba',
      WebSocketImpl: Throwing,
    });
    await expect(transport.connect()).rejects.toThrow('bloqueado');
    expect(transport.status).toBe('error');
  });

  it('reutiliza la conexión en curso y la ya abierta', async () => {
    const { transport } = setup();
    const first = transport.connect();
    expect(transport.connect()).toBe(first);
    socketAt(0).onopen?.();
    await first;
    await transport.connect();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('disconnect cierra el socket, emite closed e ignora sus eventos tardíos', async () => {
    const { transport, messages } = setup();
    const socket = await openTransport(transport);
    transport.disconnect();
    expect(socket.closed).toBe(true);
    expect(transport.status).toBe('closed');

    socket.receive({ type: 'text', id: 'a', content: 'tarde', status: 'complete' });
    socket.onclose?.();
    expect(messages).toEqual([]);
    expect(transport.status).toBe('closed');
  });

  it('permite reconectar después de cerrarse', async () => {
    const { transport } = setup();
    const first = await openTransport(transport);
    first.onclose?.();
    const second = await openTransport(transport);
    expect(second).not.toBe(first);
    expect(transport.status).toBe('open');
  });

  it('cierra la promesa con error si el socket se cierra antes de abrir', async () => {
    const { transport } = setup();
    const connection = transport.connect();
    socketAt(0).onclose?.();
    await expect(connection).rejects.toThrow();
    expect(transport.status).toBe('closed');
  });
});

describe('WebSocketAgentTransport: envío', () => {
  it('send manda un user_message', async () => {
    const { transport } = setup();
    const socket = await openTransport(transport);
    transport.send('Recomiéndame algo');
    expect(JSON.parse(socket.sent[0] as string)).toEqual({
      type: 'user_message',
      text: 'Recomiéndame algo',
    });
  });

  it('send lanza si no está abierto', () => {
    const { transport } = setup();
    expect(() => transport.send('hola')).toThrow();
  });
});

describe('WebSocketAgentTransport: eventos del agente', () => {
  it('emite el texto acumulado como mensaje del asistente con el mismo id', async () => {
    const { transport, messages } = setup();
    const socket = await openTransport(transport);
    socket.receive({ type: 'text', id: 'agent-1', content: 'Te recomiendo', status: 'streaming' });
    socket.receive({
      type: 'text',
      id: 'agent-1',
      content: 'Te recomiendo Dune',
      status: 'complete',
    });

    expect(messages.map((m) => [m.id, m.role, m.content, m.status])).toEqual([
      ['agent-1', 'assistant', 'Te recomiendo', 'streaming'],
      ['agent-1', 'assistant', 'Te recomiendo Dune', 'complete'],
    ]);
    expect(messages[1]?.createdAt).toBe(messages[0]?.createdAt);
  });

  it('adjunta las tarjetas al mismo mensaje y lo vuelve a emitir completo', async () => {
    const { transport, messages } = setup();
    const socket = await openTransport(transport);
    socket.receive({ type: 'text', id: 'agent-1', content: 'Dune', status: 'complete' });
    socket.receive({ type: 'movie_card', messageId: 'agent-1', card: CARD });

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ id: 'agent-1', content: 'Dune', status: 'complete' });
    expect(messages[1]?.cards).toEqual([CARD]);
  });

  it('no duplica tmdbId y limita a 3 tarjetas por mensaje', async () => {
    const { transport, messages } = setup();
    const socket = await openTransport(transport);
    socket.receive({ type: 'text', id: 'agent-1', content: 'x', status: 'complete' });
    for (const tmdbId of [1, 1, 2, 3, 4]) {
      socket.receive({ type: 'movie_card', messageId: 'agent-1', card: { ...CARD, tmdbId } });
    }
    expect(messages.at(-1)?.cards?.map((c) => c.tmdbId)).toEqual([1, 2, 3]);
  });

  it('un texto posterior conserva las tarjetas ya recibidas', async () => {
    const { transport, messages } = setup();
    const socket = await openTransport(transport);
    socket.receive({ type: 'text', id: 'agent-1', content: 'a', status: 'complete' });
    socket.receive({ type: 'movie_card', messageId: 'agent-1', card: CARD });
    socket.receive({ type: 'text', id: 'agent-1', content: 'a b', status: 'complete' });
    expect(messages.at(-1)?.cards).toHaveLength(1);
  });

  it('descarta póster y enlaces de dominios no permitidos', async () => {
    const { transport, messages } = setup();
    const socket = await openTransport(transport);
    socket.receive({ type: 'text', id: 'agent-1', content: 'x', status: 'complete' });
    socket.receive({
      type: 'movie_card',
      messageId: 'agent-1',
      card: {
        ...CARD,
        posterUrl: 'https://evil.example/p.jpg',
        imdbUrl: 'https://evil.example/',
        tmdbUrl: 'https://evil.example/',
      },
    });
    expect(messages.at(-1)?.cards?.[0]).toMatchObject({
      posterUrl: null,
      imdbUrl: null,
      tmdbUrl: null,
    });
  });

  it('ignora tarjetas inválidas o de un mensaje desconocido', async () => {
    const { transport, messages } = setup();
    const socket = await openTransport(transport);
    socket.receive({ type: 'movie_card', messageId: 'no-existe', card: CARD });
    socket.receive({ type: 'text', id: 'agent-1', content: 'x', status: 'complete' });
    socket.receive({ type: 'movie_card', messageId: 'agent-1', card: { title: 'sin id' } });
    socket.receive({ type: 'movie_card', messageId: 42, card: CARD });
    expect(messages).toHaveLength(1);
  });

  it('emite open_url permitido por onAction y descarta los demás', async () => {
    const { transport, actions } = setup();
    const socket = await openTransport(transport);
    socket.receive({
      type: 'open_url',
      url: 'https://www.imdb.com/title/tt1160419/',
      site: 'imdb',
    });
    socket.receive({ type: 'open_url', url: 'https://evil.example/', site: 'imdb' });
    socket.receive({ type: 'open_url', url: 'http://www.imdb.com/', site: 'imdb' });
    expect(actions).toEqual([
      { type: 'open_url', url: 'https://www.imdb.com/title/tt1160419/', site: 'imdb' },
    ]);
  });

  it('ignora JSON inválido, tipos desconocidos y textos mal formados sin romper la conexión', async () => {
    const { transport, messages, actions } = setup();
    const socket = await openTransport(transport);
    socket.receive('esto no es json');
    socket.receive('null');
    socket.receive({ type: 'desconocido' });
    socket.receive({ type: 'text', id: 1, content: 'x', status: 'complete' });
    socket.receive({ type: 'text', id: 'a', content: 'x', status: 'raro' });
    socket.onmessage?.({ data: new ArrayBuffer(2) });
    expect(messages).toEqual([]);
    expect(actions).toEqual([]);
    expect(transport.status).toBe('open');
  });

  it('las funciones de baja dejan de notificar', async () => {
    const { transport } = setup();
    const handler = vi.fn();
    const off = transport.onMessage(handler);
    const offAction = transport.onAction(handler);
    off();
    offAction();
    const socket = await openTransport(transport);
    socket.receive({ type: 'text', id: 'a', content: 'x', status: 'complete' });
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('WebSocketAgentTransport: sesión', () => {
  it('genera un id y lo guarda en sessionStorage para reutilizarlo', () => {
    FakeSocket.instances = [];
    const first = new WebSocketAgentTransport(URL_BASE, { WebSocketImpl });
    void first.connect();
    const second = new WebSocketAgentTransport(URL_BASE, { WebSocketImpl });
    void second.connect();
    const sessionOf = (s: FakeSocket) => new URL(s.url).searchParams.get('session');
    expect(sessionOf(socketAt(0))).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(sessionOf(socketAt(1))).toBe(sessionOf(socketAt(0)));
  });

  it('funciona aunque sessionStorage no esté disponible', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    FakeSocket.instances = [];
    const transport = new WebSocketAgentTransport(URL_BASE, { WebSocketImpl });
    void transport.connect();
    expect(new URL(socketAt(0).url).searchParams.get('session')).toBeTruthy();
  });
});
