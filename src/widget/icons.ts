const svg = (path: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;

export const ICON_CHAT = svg(
  '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z"/><path d="M8.5 9.5h.01M12 9.5h.01M15.5 9.5h.01"/>',
);
export const ICON_CLOSE = svg('<path d="M6 6l12 12M18 6L6 18"/>');
export const ICON_SEND = svg('<path d="M5 12h13M13 6l6 6-6 6"/>');
export const ICON_MINIMIZE = svg('<path d="M6 9l6 6 6-6"/>');
