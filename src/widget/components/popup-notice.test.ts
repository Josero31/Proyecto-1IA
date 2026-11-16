import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentAction } from '../../core/types';
import { openInNewTab } from './popup-notice';

const action: AgentAction = {
  type: 'open_url',
  url: 'https://www.imdb.com/title/tt1160419/',
  site: 'imdb',
};

describe('openInNewTab', () => {
  let notice: HTMLElement;

  beforeEach(() => {
    notice = document.createElement('div');
    notice.hidden = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('abre la pestaña, corta el vínculo con el opener y no muestra aviso', () => {
    const popup = { opener: window } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);

    openInNewTab(action, notice);

    expect(open).toHaveBeenCalledWith(action.url, '_blank');
    expect(popup.opener).toBeNull();
    expect(notice.hidden).toBe(true);
  });

  it('si el navegador la bloquea, muestra un botón de respaldo que abre al hacer clic', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    openInNewTab(action, notice);

    expect(notice.hidden).toBe(false);
    const button = notice.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('Abrir en IMDb');

    const popup = { opener: window } as unknown as Window;
    open.mockReturnValue(popup);
    button.click();

    expect(open).toHaveBeenLastCalledWith(action.url, '_blank');
    expect(popup.opener).toBeNull();
    expect(notice.hidden).toBe(true);
  });

  it('el botón de respaldo nombra Google Books y tolera un segundo bloqueo', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openInNewTab(
      { ...action, url: 'https://books.google.com/books?id=x', site: 'google_books' },
      notice,
    );

    const button = notice.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toBe('Abrir en Google Books');
    button.click();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('oculta un aviso anterior cuando una apertura posterior sí funciona', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openInNewTab(action, notice);
    expect(notice.hidden).toBe(false);

    open.mockReturnValue({ opener: window } as unknown as Window);
    openInNewTab(action, notice);
    expect(notice.hidden).toBe(true);
  });
});
