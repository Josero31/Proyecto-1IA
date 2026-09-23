import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Composer } from './composer';

describe('Composer', () => {
  let form: HTMLFormElement;
  let textarea: HTMLTextAreaElement;
  let onSubmit: ReturnType<typeof vi.fn<(text: string) => void>>;
  let composer: Composer;

  beforeEach(() => {
    document.body.innerHTML = '';
    form = document.createElement('form');
    textarea = document.createElement('textarea');
    form.append(textarea);
    document.body.append(form);
    onSubmit = vi.fn<(text: string) => void>();
    composer = new Composer(form, textarea, onSubmit);
  });

  const pressEnter = (init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, ...init });
    textarea.dispatchEvent(event);
    return event;
  };

  it('Enter envía el texto recortado y limpia el campo', () => {
    textarea.value = '  hola  ';
    const event = pressEnter();
    expect(onSubmit).toHaveBeenCalledWith('hola');
    expect(textarea.value).toBe('');
    expect(event.defaultPrevented).toBe(true);
  });

  it('Shift+Enter no envía (permite escribir varias líneas)', () => {
    textarea.value = 'hola';
    const event = pressEnter({ shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('no envía mientras un IME está componiendo texto', () => {
    textarea.value = 'hola';
    pressEnter({ isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('otras teclas no envían', () => {
    textarea.value = 'hola';
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('el submit del formulario también envía y evita recargar la página', () => {
    textarea.value = 'hola';
    const event = new SubmitEvent('submit', { cancelable: true });
    form.dispatchEvent(event);
    expect(onSubmit).toHaveBeenCalledWith('hola');
    expect(event.defaultPrevented).toBe(true);
  });

  it('no envía texto vacío', () => {
    textarea.value = '   ';
    pressEnter();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('crece con el contenido hasta un máximo', () => {
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 60 });
    textarea.dispatchEvent(new Event('input'));
    expect(textarea.style.height).toBe('60px');

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 500 });
    textarea.dispatchEvent(new Event('input'));
    expect(textarea.style.height).toBe('140px');
  });

  it('expone focus y placeholder', () => {
    composer.setPlaceholder('Escribe…');
    composer.focus();
    expect(textarea.placeholder).toBe('Escribe…');
    expect(document.activeElement).toBe(textarea);
  });
});
