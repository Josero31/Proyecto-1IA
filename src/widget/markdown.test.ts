import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

function toFragment(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container;
}

describe('renderMarkdown', () => {
  it('convierte negritas, cursivas y código en línea', () => {
    const el = toFragment(renderMarkdown('**negrita**, _cursiva_ y `codigo`'));
    expect(el.querySelector('strong')?.textContent).toBe('negrita');
    expect(el.querySelector('em')?.textContent).toBe('cursiva');
    expect(el.querySelector('code')?.textContent).toBe('codigo');
  });

  it('convierte listas ordenadas y no ordenadas', () => {
    const el = toFragment(renderMarkdown('- a\n- b\n\n1. uno\n2. dos'));
    expect(el.querySelectorAll('ul li')).toHaveLength(2);
    expect(el.querySelectorAll('ol li')).toHaveLength(2);
  });

  it('conserva el lenguaje del bloque de código como clase', () => {
    const el = toFragment(renderMarkdown('```js\nconsole.log("hola");\n```'));
    const code = el.querySelector('pre code');
    expect(code?.className).toBe('language-js');
    expect(code?.textContent).toBe('console.log("hola");\n');
  });

  it('soporta tablas GFM', () => {
    const el = toFragment(renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |'));
    expect(el.querySelectorAll('th')).toHaveLength(2);
    expect(el.querySelectorAll('td')).toHaveLength(2);
  });

  it('respeta saltos de línea simples (breaks)', () => {
    const el = toFragment(renderMarkdown('línea 1\nlínea 2'));
    expect(el.querySelector('br')).not.toBeNull();
  });

  it('abre los enlaces en otra pestaña sin dar acceso a window.opener', () => {
    const el = toFragment(renderMarkdown('[AGIChat](https://agichat.example)'));
    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://agichat.example');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer nofollow');
  });

  it('elimina scripts, manejadores de eventos, imágenes e iframes', () => {
    const html = renderMarkdown(
      '<script>alert(1)</script><img src=x onerror="alert(2)"><iframe src="https://x"></iframe>' +
        '<p onclick="alert(3)">texto</p>',
    );
    expect(html).not.toMatch(/<script|<img|<iframe|onerror|onclick/);
    expect(html).toContain('texto');
  });

  it('neutraliza enlaces javascript:', () => {
    const el = toFragment(renderMarkdown('[clic](javascript:alert(1))'));
    expect(el.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript:');
  });

  it('tolera Markdown incompleto durante el streaming', () => {
    const el = toFragment(renderMarkdown('```js\nconst a ='));
    expect(el.querySelector('pre code')?.textContent).toContain('const a =');
  });

  it('devuelve una cadena vacía para contenido vacío', () => {
    expect(renderMarkdown('')).toBe('');
  });
});
