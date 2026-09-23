import type { ChatMessage } from '../../core/types';
import { renderMarkdown } from '../markdown';

const SPEAKER_LABEL: Record<ChatMessage['role'], string> = {
  user: 'Tú',
  assistant: 'Asistente',
  system: 'Aviso',
};

const ERROR_TEXT: Record<ChatMessage['role'], string> = {
  user: 'No se envió.',
  assistant: 'La respuesta se interrumpió.',
  system: 'No se pudo mostrar este aviso.',
};

export function createMessageElement(message: ChatMessage): HTMLElement {
  const el = document.createElement('div');
  el.className = 'message';
  el.dataset.id = message.id;
  el.dataset.role = message.role;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const speaker = document.createElement('span');
  speaker.className = 'sr-only';
  speaker.textContent = `${SPEAKER_LABEL[message.role]}: `;

  const content = document.createElement('div');
  content.className = 'bubble-content';

  bubble.append(speaker, content);
  el.append(bubble);
  updateMessageElement(el, message);
  return el;
}

export function updateMessageElement(el: HTMLElement, message: ChatMessage): void {
  el.dataset.status = message.status;
  el.setAttribute('aria-busy', String(message.status === 'streaming'));

  const content = el.querySelector('.bubble-content') as HTMLElement;
  // Solo el agente responde en Markdown; lo que escribe el usuario se muestra tal cual.
  if (message.role === 'assistant') {
    content.innerHTML = renderMarkdown(message.content);
  } else {
    content.textContent = message.content;
  }

  el.querySelector('.message-error')?.remove();
  if (message.status === 'error') {
    el.append(createErrorRow(message));
  }
}

function createErrorRow(message: ChatMessage): HTMLElement {
  const row = document.createElement('p');
  row.className = 'message-error';
  row.textContent = ERROR_TEXT[message.role];

  if (message.role === 'user') {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'link-button';
    retry.dataset.action = 'retry';
    retry.dataset.id = message.id;
    retry.textContent = 'Reintentar';
    row.append(' ', retry);
  }
  return row;
}
