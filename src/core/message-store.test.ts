import { describe, expect, it, vi } from 'vitest';
import { MessageStore } from './message-store';
import type { ChatMessage } from './types';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'user',
    content: 'hola',
    status: 'complete',
    createdAt: 0,
    ...overrides,
  };
}

describe('MessageStore', () => {
  it('empieza vacío', () => {
    const store = new MessageStore();
    expect(store.getMessages()).toEqual([]);
  });

  it('agrega mensajes y notifica a los suscriptores', () => {
    const store = new MessageStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.add(makeMessage());

    expect(store.getMessages()).toHaveLength(1);
    expect(listener).toHaveBeenLastCalledWith([makeMessage()]);
  });

  it('llama al listener inmediatamente al suscribirse con el estado actual', () => {
    const store = new MessageStore();
    store.add(makeMessage());

    const listener = vi.fn();
    store.subscribe(listener);

    expect(listener).toHaveBeenCalledWith([makeMessage()]);
  });

  it('actualiza el contenido de un mensaje existente', () => {
    const store = new MessageStore();
    store.add(makeMessage({ content: 'a', status: 'streaming' }));

    store.updateContent('m1', 'ab', 'complete');

    expect(store.getMessages()[0]).toMatchObject({ content: 'ab', status: 'complete' });
  });

  it('ignora updateContent para un id inexistente', () => {
    const store = new MessageStore();
    store.add(makeMessage());

    store.updateContent('nope', 'x');

    expect(store.getMessages()[0]?.content).toBe('hola');
  });

  it('agrega contenido incremental con appendContent', () => {
    const store = new MessageStore();
    store.add(makeMessage({ content: 'Hola' }));

    store.appendContent('m1', ' mundo');

    expect(store.getMessages()[0]?.content).toBe('Hola mundo');
  });

  it('ignora appendContent para un id inexistente', () => {
    const store = new MessageStore();
    store.add(makeMessage({ content: 'Hola' }));

    store.appendContent('nope', ' mundo');

    expect(store.getMessages()[0]?.content).toBe('Hola');
  });

  it('actualiza el status de un mensaje', () => {
    const store = new MessageStore();
    store.add(makeMessage({ status: 'pending' }));

    store.setStatus('m1', 'error');

    expect(store.getMessages()[0]?.status).toBe('error');
  });

  it('ignora setStatus para un id inexistente', () => {
    const store = new MessageStore();
    store.add(makeMessage({ status: 'pending' }));

    store.setStatus('nope', 'error');

    expect(store.getMessages()[0]?.status).toBe('pending');
  });

  it('limpia todos los mensajes', () => {
    const store = new MessageStore();
    store.add(makeMessage());
    store.add(makeMessage({ id: 'm2' }));

    store.clear();

    expect(store.getMessages()).toEqual([]);
  });

  it('permite desuscribirse', () => {
    const store = new MessageStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    listener.mockClear();

    unsubscribe();
    store.add(makeMessage());

    expect(listener).not.toHaveBeenCalled();
  });

  it('getMessages devuelve una copia, no la referencia interna', () => {
    const store = new MessageStore();
    store.add(makeMessage());

    const snapshot = store.getMessages();
    snapshot.push(makeMessage({ id: 'm2' }));

    expect(store.getMessages()).toHaveLength(1);
  });
});
