import { describe, expect, it } from 'vitest';
import { createMessageElement, updateMessageElement } from './message-view';
import type { ChatMessage } from '../../core/types';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'user',
    content: 'hola',
    status: 'complete',
    createdAt: 0,
    ...overrides,
  };
}

describe('message-view', () => {
  it('crea la burbuja con rol, estado y etiqueta para lectores de pantalla', () => {
    const el = createMessageElement(message());
    expect(el.dataset.id).toBe('m1');
    expect(el.dataset.role).toBe('user');
    expect(el.dataset.status).toBe('complete');
    expect(el.querySelector('.sr-only')?.textContent).toBe('Tú: ');
  });

  it('etiqueta los mensajes de sistema y los muestra como texto', () => {
    const el = createMessageElement(message({ role: 'system', content: '**aviso**' }));
    expect(el.querySelector('.sr-only')?.textContent).toBe('Aviso: ');
    expect(el.querySelector('.bubble-content')?.textContent).toBe('**aviso**');
  });

  it('muestra un botón de reintento solo en mensajes del usuario con error', () => {
    const el = createMessageElement(message({ status: 'error' }));
    const retry = el.querySelector<HTMLButtonElement>('[data-action="retry"]');
    expect(el.querySelector('.message-error')?.textContent).toContain('No se envió.');
    expect(retry?.dataset.id).toBe('m1');
    expect(retry?.type).toBe('button');
  });

  it('muestra un texto de error propio para avisos de sistema', () => {
    const el = createMessageElement(message({ role: 'system', status: 'error' }));
    expect(el.querySelector('.message-error')?.textContent).toBe('No se pudo mostrar este aviso.');
  });

  it('quita la fila de error cuando el mensaje se recupera', () => {
    const el = createMessageElement(message({ status: 'error' }));
    updateMessageElement(el, message({ status: 'complete' }));
    expect(el.querySelector('.message-error')).toBeNull();
    expect(el.dataset.status).toBe('complete');
  });

  it('nunca muestra dos filas de error a la vez', () => {
    const el = createMessageElement(message({ status: 'error' }));
    updateMessageElement(el, message({ status: 'error' }));
    expect(el.querySelectorAll('.message-error')).toHaveLength(1);
  });
});
