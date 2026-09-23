# Changelog

Todos los cambios relevantes de `@agichat/widget-sdk` se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Pendiente (Fase 2 del curso)

- `WebSocketAgentTransport` que implemente `AgentTransport` para conectar con el agente real.

## [1.0.0] - 2026-09-22

Primera versión lista para distribución a la lista de espera de AGIChat.

### Agregado

- Diseño visual definitivo del widget: lanzador flotante, panel con cabecera, burbujas de
  conversación y caja de texto. Paleta "bosque y ámbar" configurable con custom properties
  `--agichat-*`, modo oscuro automático (`prefers-color-scheme`) y panel a pantalla completa
  en pantallas de hasta 480 px.
- Renderizado de Markdown en los mensajes del agente (negritas, cursivas, listas, enlaces,
  bloques de código, citas y tablas GFM) con `marked`, sanitizado con `DOMPurify`. Se bloquean
  scripts, manejadores de eventos, imágenes, iframes y enlaces `javascript:`; los enlaces se
  abren en otra pestaña con `rel="noopener noreferrer nofollow"`.
- Estados de UX: estado vacío con mensaje de bienvenida, indicador "escribiendo…", cursor de
  streaming, mensaje del usuario "pendiente" hasta que el transporte lo acepta, aviso de
  conexión con botón "Reintentar"/"Reconectar", reintento por mensaje fallido y timeout de
  conexión de 10 s.
- Accesibilidad: foco en la caja de texto al abrir, `Escape` cierra y devuelve el foco al
  lanzador, `Enter` envía y `Shift+Enter` agrega una línea, anillo de foco visible con
  contraste ≥ 3:1, `role="log"`/`aria-live` en la conversación, `aria-busy` durante el
  streaming, etiquetas para lectores de pantalla y respeto de `prefers-reduced-motion`.
- API pública del elemento: atributos `agent-name`, `welcome-message`, `placeholder` y
  `position`; métodos `openPanel()`, `closePanel()` y `toggle()`; propiedad `open`; eventos
  `agichat-open` y `agichat-close`. `renderMarkdown` también se exporta desde el paquete.
- La propiedad `transport` puede asignarse después de montar el elemento (necesario para
  React y Vue): el widget re-cablea sus listeners y desconecta el transporte anterior.
- Ejemplos de integración en `examples/` para HTML plano, React y Vue.
- Página de demo para `pnpm dev` (`index.html`), con un modo que simula fallos de conexión.
- Presupuesto de tamaño del bundle (`pnpm size`, 40 kB gzip por archivo) verificado en CI.
- Workflow de release: al empujar un tag `vX.Y.Z` se crea un GitHub Release con el paquete
  (`.tgz`) y los archivos de `dist/`.

### Cambiado

- El widget se dividió en subcomponentes (`src/widget/components/`) y módulos de estilos,
  íconos, Markdown y estado de conexión.
- La lista de mensajes se actualiza por id en lugar de regenerarse completa en cada chunk.
- El scroll solo baja automáticamente si el usuario ya estaba al final de la conversación.

### Corregido

- `pnpm build` borraba los archivos `.d.ts` (Vite vacía `dist/` después de que `tsc` los
  generaba), por lo que el paquete no publicaba sus tipos. Ahora `tsc` corre después de Vite.

### Dependencias

- `marked` y `dompurify` como `dependencies` del bundle (≈ 32–36 kB gzip en total para el
  SDK). Justificación en el README, sección "Decisiones de la Parte 2".

## [0.1.0] - 2026-09-22

### Agregado

- Parte 1: scaffolding (TypeScript + Vite + Vitest + pnpm), `MessageStore`, contrato
  `AgentTransport`, `MockAgentTransport` con streaming, widget mínimo, CI con lint, formato,
  typecheck, cobertura ≥ 80 % y build, plantilla de PR, README y `AGENTS.md`.

[Sin publicar]: https://github.com/Josero31/Proyecto-1IA/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Josero31/Proyecto-1IA/releases/tag/v1.0.0
[0.1.0]: https://github.com/Josero31/Proyecto-1IA/tree/ce67279
