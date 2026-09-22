import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockAgentTransport } from './mock-transport';

/**
 * Con fake timers, el reloj nunca avanza por sí solo: hay que disparar
 * `connect()` y avanzar el tiempo en paralelo, no esperar uno y luego el otro.
 */
async function connectAndAdvance(transport: MockAgentTransport, delayMs: number): Promise<void> {
  const promise = transport.connect();
  await vi.advanceTimersByTimeAsync(delayMs);
  await promise;
}

describe('MockAgentTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('empieza en estado idle', () => {
    const transport = new MockAgentTransport();
    expect(transport.status).toBe('idle');
  });

  it('connect() pasa por connecting y termina en open, notificando a los listeners', async () => {
    const transport = new MockAgentTransport({ connectDelayMs: 100 });
    const statuses: string[] = [];
    transport.onStatusChange((status) => statuses.push(status));

    expect(transport.status).toBe('idle');
    await connectAndAdvance(transport, 100);

    expect(transport.status).toBe('open');
    expect(statuses).toEqual(['connecting', 'open']);
  });

  it('connect() es idempotente si ya está abierto o conectando', async () => {
    const transport = new MockAgentTransport({ connectDelayMs: 50 });
    const first = transport.connect();
    const second = transport.connect();
    await vi.advanceTimersByTimeAsync(50);
    await Promise.all([first, second]);

    expect(transport.status).toBe('open');

    const third = await transport.connect();
    expect(third).toBeUndefined();
    expect(transport.status).toBe('open');
  });

  it('disconnect() cancela temporizadores pendientes y marca closed', async () => {
    const transport = new MockAgentTransport({ connectDelayMs: 10, replyDelayMs: 10 });
    await connectAndAdvance(transport, 10);

    const onMessage = vi.fn();
    transport.onMessage(onMessage);
    transport.send('hola');
    transport.disconnect();

    await vi.advanceTimersByTimeAsync(1000);

    expect(transport.status).toBe('closed');
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('send() lanza un error si el transporte no está conectado', () => {
    const transport = new MockAgentTransport();
    expect(() => transport.send('hola')).toThrow(/no está conectado/);
  });

  it('send() con texto vacío no agenda respuesta', async () => {
    const transport = new MockAgentTransport({ connectDelayMs: 0, replyDelayMs: 10 });
    await connectAndAdvance(transport, 0);

    const onMessage = vi.fn();
    transport.onMessage(onMessage);
    transport.send('   ');

    await vi.advanceTimersByTimeAsync(1000);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('send() transmite la respuesta simulada en streaming hasta completarse', async () => {
    const transport = new MockAgentTransport({
      connectDelayMs: 0,
      replyDelayMs: 10,
      streamIntervalMs: 5,
      scriptedReply: 'uno dos tres',
    });
    await connectAndAdvance(transport, 0);

    const received: Array<{ content: string; status: string }> = [];
    transport.onMessage((message) =>
      received.push({ content: message.content, status: message.status }),
    );

    transport.send('hola');
    await vi.advanceTimersByTimeAsync(10 + 5 * 3);

    expect(received.map((m) => m.content)).toEqual(['uno', 'uno dos', 'uno dos tres']);
    expect(received.at(-1)?.status).toBe('complete');
    expect(received[0]?.status).toBe('streaming');
  });

  it('permite desuscribirse de mensajes y de cambios de estado', async () => {
    const transport = new MockAgentTransport({
      connectDelayMs: 0,
      replyDelayMs: 5,
      streamIntervalMs: 5,
      scriptedReply: 'hola',
    });
    const onMessage = vi.fn();
    const onStatus = vi.fn();
    const unsubMessage = transport.onMessage(onMessage);
    const unsubStatus = transport.onStatusChange(onStatus);

    unsubMessage();
    unsubStatus();

    await connectAndAdvance(transport, 0);
    transport.send('hola');
    await vi.advanceTimersByTimeAsync(20);

    expect(onMessage).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });
});
