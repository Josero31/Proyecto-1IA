/**
 * Paleta "bosque y ámbar": verde profundo como color de marca (confiable, poco común en
 * widgets de chat, que suelen ser azules o morados) y ámbar para lo que requiere atención
 * (foco, "escribiendo…", estado conectando). Los pares de color cumplen WCAG AA: texto
 * ≥ 4.5:1 y anillo de foco ≥ 3:1, tanto en modo claro como oscuro.
 *
 * Todos los valores son custom properties `--agichat-*`, por lo que el sitio del cliente
 * puede sobrescribirlos desde afuera del Shadow DOM:
 * `agichat-widget { --agichat-primary: #0a4d8c; }`.
 */
export const WIDGET_STYLES = `
:host {
  --agichat-primary: #16423c;
  --agichat-primary-hover: #0f302b;
  --agichat-on-primary: #ffffff;
  --agichat-accent: #b86e0b;
  --agichat-surface: #ffffff;
  --agichat-surface-muted: #eef3f1;
  --agichat-border: #d5dfdb;
  --agichat-text: #1a2421;
  --agichat-text-muted: #56635f;
  --agichat-danger: #b42318;
  --agichat-danger-surface: #fdecea;
  --agichat-code-bg: #1d2b28;
  --agichat-inline-code-bg: rgb(22 66 60 / 10%);
  --agichat-code-text: #e6efe9;
  --agichat-font: 'Segoe UI Variable Text', 'Avenir Next', 'Helvetica Neue', system-ui, sans-serif;
  --agichat-font-mono: ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace;
  --agichat-radius: 18px;
  --agichat-z-index: 2147483000;

  all: initial;
  display: block;
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: var(--agichat-z-index);
  font-family: var(--agichat-font);
  font-size: 15px;
  line-height: 1.5;
  color: var(--agichat-text);
}

:host([position='bottom-left']) {
  right: auto;
  left: 24px;
}

@media (prefers-color-scheme: dark) {
  :host {
    --agichat-primary: #2f7a6d;
    --agichat-primary-hover: #3a8f80;
    --agichat-surface: #141c1a;
    --agichat-surface-muted: #1f2a27;
    --agichat-border: #2e3b37;
    --agichat-text: #e8efec;
    --agichat-text-muted: #a3b2ad;
    --agichat-danger: #ff8a7a;
    --agichat-danger-surface: #3a1d1a;
    --agichat-accent: #e9a23b;
    --agichat-code-bg: #0b1210;
    --agichat-inline-code-bg: rgb(255 255 255 / 10%);
  }
}

*, *::before, *::after { box-sizing: border-box; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

button { font: inherit; color: inherit; }

:focus-visible {
  outline: 3px solid var(--agichat-accent);
  outline-offset: 2px;
}

/* Lanzador */
.launcher {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  margin-left: auto;
  border: none;
  border-radius: 20px;
  background: var(--agichat-primary);
  color: var(--agichat-on-primary);
  cursor: pointer;
  box-shadow: 0 10px 24px -8px rgb(22 66 60 / 55%);
  transition: background-color 150ms ease, border-radius 200ms ease;
}
:host([position='bottom-left']) .launcher { margin-left: 0; }
.launcher:hover { background: var(--agichat-primary-hover); }
.launcher[aria-expanded='true'] { border-radius: 50%; }
.launcher .icon-close, .launcher[aria-expanded='true'] .icon-chat { display: none; }
.launcher[aria-expanded='true'] .icon-close { display: block; }

/* Panel */
.panel {
  position: absolute;
  right: 0;
  bottom: 76px;
  display: flex;
  flex-direction: column;
  width: min(384px, calc(100vw - 32px));
  height: min(620px, calc(100vh - 120px));
  background: var(--agichat-surface);
  border: 1px solid var(--agichat-border);
  border-radius: var(--agichat-radius);
  box-shadow: 0 24px 48px -16px rgb(10 30 27 / 35%);
  overflow: hidden;
  transform-origin: bottom right;
  transition: opacity 180ms ease, transform 180ms ease, visibility 0s linear 0s;
}
:host([position='bottom-left']) .panel { right: auto; left: 0; transform-origin: bottom left; }
.panel[data-open='false'] {
  visibility: hidden;
  opacity: 0;
  transform: translateY(12px) scale(0.98);
  transition: opacity 150ms ease, transform 150ms ease, visibility 0s linear 150ms;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px 14px 16px;
  background: var(--agichat-primary);
  color: var(--agichat-on-primary);
}
.avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: rgb(255 255 255 / 14%);
  font-weight: 700;
  font-size: 17px;
}
.heading { flex: 1; min-width: 0; }
.title {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0 0;
  font-size: 13px;
  opacity: 0.85;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #9aa8a4;
}
.status-dot[data-status='open'] { background: #5ee0a0; }
.status-dot[data-status='connecting'] { background: var(--agichat-accent); animation: pulse 1s ease-in-out infinite; }
.status-dot[data-status='error'] { background: #ff8a7a; }

.icon-button {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.icon-button:hover { background: rgb(255 255 255 / 14%); }

/* Aviso de conexión */
.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: var(--agichat-danger-surface);
  color: var(--agichat-danger);
  font-size: 14px;
}
.banner[hidden] { display: none; }
.banner-retry {
  flex: none;
  padding: 6px 12px;
  border: 1px solid currentColor;
  border-radius: 999px;
  background: transparent;
  font-weight: 600;
  cursor: pointer;
}

/* Conversación */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  scroll-behavior: smooth;
  overscroll-behavior: contain;
}
.list { display: flex; flex-direction: column; gap: 10px; }

.empty { margin: auto 0; padding: 24px 8px; color: var(--agichat-text-muted); }
.empty[hidden] { display: none; }
.empty-title { margin: 0 0 4px; font-size: 20px; font-weight: 650; color: var(--agichat-text); }
.empty-text { margin: 0; }

.message { display: flex; flex-direction: column; max-width: 85%; }
.message[data-role='user'] { align-self: flex-end; align-items: flex-end; }
.message[data-role='assistant'], .message[data-role='system'] { align-self: flex-start; }

.bubble {
  padding: 10px 14px;
  border-radius: 16px;
  overflow-wrap: anywhere;
}
.message[data-role='user'] .bubble {
  background: var(--agichat-primary);
  color: var(--agichat-on-primary);
  border-bottom-right-radius: 4px;
  white-space: pre-wrap;
}
.message[data-role='assistant'] .bubble {
  background: var(--agichat-surface-muted);
  border-bottom-left-radius: 4px;
}
.message[data-role='system'] .bubble {
  background: transparent;
  border: 1px dashed var(--agichat-border);
  color: var(--agichat-text-muted);
  font-size: 14px;
}
.message[data-status='pending'] .bubble { opacity: 0.6; }
.message[data-status='error'] .bubble { outline: 1px solid var(--agichat-danger); }
.message[data-status='streaming'] .bubble-content > :last-child::after {
  content: '';
  display: inline-block;
  width: 7px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--agichat-accent);
  animation: blink 900ms steps(2) infinite;
}

.message-error {
  margin: 4px 2px 0;
  font-size: 13px;
  color: var(--agichat-danger);
}
.link-button {
  padding: 0;
  border: none;
  background: none;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}

/* Markdown del agente */
.bubble-content > :first-child { margin-top: 0; }
.bubble-content > :last-child { margin-bottom: 0; }
.bubble-content p, .bubble-content ul, .bubble-content ol, .bubble-content pre,
.bubble-content blockquote, .bubble-content table { margin: 0 0 10px; }
.bubble-content h1, .bubble-content h2, .bubble-content h3,
.bubble-content h4, .bubble-content h5, .bubble-content h6 {
  margin: 12px 0 6px;
  font-size: 1em;
  font-weight: 700;
}
.bubble-content ul, .bubble-content ol { padding-left: 20px; }
.bubble-content li + li { margin-top: 2px; }
.bubble-content a { color: var(--agichat-primary); font-weight: 600; }
.bubble-content blockquote {
  padding-left: 10px;
  border-left: 3px solid var(--agichat-border);
  color: var(--agichat-text-muted);
}
.bubble-content code {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--agichat-inline-code-bg);
  font-family: var(--agichat-font-mono);
  font-size: 0.88em;
}
.bubble-content pre {
  padding: 12px;
  border-radius: 10px;
  background: var(--agichat-code-bg);
  color: var(--agichat-code-text);
  overflow-x: auto;
}
.bubble-content pre code { padding: 0; background: none; font-size: 13px; }
.bubble-content table { border-collapse: collapse; display: block; overflow-x: auto; font-size: 14px; }
.bubble-content th, .bubble-content td { padding: 4px 8px; border: 1px solid var(--agichat-border); text-align: left; }
.bubble-content hr { border: none; border-top: 1px solid var(--agichat-border); }

/* Indicador "escribiendo…" */
.typing {
  display: inline-flex;
  gap: 4px;
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  background: var(--agichat-surface-muted);
}
.typing[hidden] { display: none; }
.typing-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--agichat-accent);
  animation: bounce 1.2s ease-in-out infinite;
}
.typing-dot:nth-child(3) { animation-delay: 150ms; }
.typing-dot:nth-child(4) { animation-delay: 300ms; }

/* Caja de texto */
.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin: 0 12px;
  padding: 8px 8px 8px 14px;
  border: 1px solid var(--agichat-border);
  border-radius: 16px;
  background: var(--agichat-surface);
}
.composer:focus-within { border-color: var(--agichat-primary); }
.composer textarea {
  flex: 1;
  min-height: 24px;
  max-height: 140px;
  padding: 6px 0;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--agichat-text);
  font: inherit;
}
.composer textarea::placeholder { color: var(--agichat-text-muted); }
.send {
  display: grid;
  place-items: center;
  flex: none;
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 12px;
  background: var(--agichat-primary);
  color: var(--agichat-on-primary);
  cursor: pointer;
}
.send:hover { background: var(--agichat-primary-hover); }
.send svg { width: 20px; height: 20px; }

.footer {
  margin: 0;
  padding: 8px 16px 10px;
  text-align: center;
  font-size: 12px;
  color: var(--agichat-text-muted);
}

@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-4px); opacity: 1; }
}
@keyframes blink { to { visibility: hidden; } }
@keyframes pulse { 50% { opacity: 0.4; } }

@media (max-width: 480px) {
  :host { right: 16px; bottom: 16px; }
  :host([position='bottom-left']) { left: 16px; }
  .launcher[aria-expanded='true'] { display: none; }
  .panel {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
    border-radius: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
`;
