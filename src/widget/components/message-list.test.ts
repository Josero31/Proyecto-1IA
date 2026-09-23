import { beforeEach, describe, expect, it } from 'vitest';
import { MessageListView } from './message-list';
import type { ChatMessage } from '../../core/types';

function message(overrides: Partial<ChatMessage> & { id: string }): ChatMessage {
  return { role: 'assistant', content: 'hola', status: 'complete', createdAt: 0, ...overrides };
}

function setScrollMetrics(el: HTMLElement, scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
}

describe('MessageListView', () => {
  let scroller: HTMLElement;
  let list: HTMLElement;
  let empty: HTMLElement;
  let view: MessageListView;

  beforeEach(() => {
    scroller = document.createElement('div');
    list = document.createElement('div');
    empty = document.createElement('div');
    scroller.append(empty, list);
    view = new MessageListView(scroller, list, empty);
  });

  it('muestra el estado vacío solo cuando no hay mensajes', () => {
    view.render([]);
    expect(empty.hidden).toBe(false);
    view.render([message({ id: '1' })]);
    expect(empty.hidden).toBe(true);
  });

  it('agrega mensajes en orden', () => {
    view.render([message({ id: '1' }), message({ id: '2', role: 'user' })]);
    expect([...list.children].map((el) => (el as HTMLElement).dataset.id)).toEqual(['1', '2']);
  });

  it('reutiliza el mismo nodo al actualizar un mensaje por id', () => {
    const msg = message({ id: '1', content: 'Ho', status: 'streaming' });
    view.render([msg]);
    const node = list.firstElementChild;

    view.render([{ ...msg, content: 'Hola', status: 'complete' }]);

    expect(list.firstElementChild).toBe(node);
    expect(node?.textContent).toContain('Hola');
  });

  it('no vuelve a pintar un mensaje que no cambió', () => {
    const msg = message({ id: '1' });
    view.render([msg]);
    const content = list.querySelector('.bubble-content') as HTMLElement;
    content.dataset.marker = 'intacto';

    view.render([{ ...msg }]);

    expect((list.querySelector('.bubble-content') as HTMLElement).dataset.marker).toBe('intacto');
  });

  it('quita los nodos de mensajes que ya no están en el estado', () => {
    view.render([message({ id: '1' }), message({ id: '2' })]);
    view.render([message({ id: '2' })]);
    expect(list.children).toHaveLength(1);
    expect((list.firstElementChild as HTMLElement).dataset.id).toBe('2');
  });

  it('baja el scroll si el usuario ya estaba al final', () => {
    setScrollMetrics(scroller, 500, 300);
    scroller.scrollTop = 200;
    view.render([message({ id: '1' })]);
    expect(scroller.scrollTop).toBe(500);
  });

  it('no mueve el scroll si el usuario está leyendo mensajes anteriores', () => {
    setScrollMetrics(scroller, 1000, 300);
    scroller.scrollTop = 100;
    view.render([message({ id: '1' })]);
    expect(scroller.scrollTop).toBe(100);
  });
});
