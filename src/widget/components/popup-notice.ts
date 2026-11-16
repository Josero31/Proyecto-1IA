import type { AgentAction } from '../../core/types';

const SITE_LABEL: Record<AgentAction['site'], string> = {
  imdb: 'IMDb',
  google_books: 'Google Books',
};

/**
 * Abre la pestaña que pidió el agente. Los navegadores solo permiten `window.open` sin clic
 * poco después de la última interacción; si lo bloquean, se muestra un aviso con un botón
 * cuyo clic sí es un gesto del usuario. No se pasa 'noopener' como tercer argumento porque
 * entonces `window.open` siempre devuelve null y no se podría detectar el bloqueo.
 */
export function openInNewTab(action: AgentAction, notice: HTMLElement): void {
  const win = window.open(action.url, '_blank');
  if (win) {
    win.opener = null;
    notice.hidden = true;
    return;
  }
  showBlockedNotice(action, notice);
}

function showBlockedNotice(action: AgentAction, notice: HTMLElement): void {
  const site = SITE_LABEL[action.site];
  const text = document.createElement('span');
  text.textContent = 'Tu navegador bloqueó la pestaña nueva.';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'link-button';
  button.textContent = `Abrir en ${site}`;
  button.addEventListener('click', () => {
    const win = window.open(action.url, '_blank');
    if (win) win.opener = null;
    notice.hidden = true;
  });

  notice.replaceChildren(text, ' ', button);
  notice.hidden = false;
}
