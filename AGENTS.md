# AGENTS.md

Guía para cualquier herramienta de codeo agéntico (Claude Code, GitHub Copilot, Cursor,
etc.) que trabaje en este repositorio. El objetivo es que el código que genere un agente
sea indistinguible en estilo y estructura del código escrito por el equipo.

## Resumen del proyecto

SDK embebible de un widget de chat (`<agichat-widget>`) para AGIChat. Ver
[`README.md`](./README.md) para la arquitectura completa y el plan de trabajo por partes.

## Stack

- TypeScript (modo `strict`), Web Component nativo (Custom Element + Shadow DOM), sin
  framework de UI
- `marked` (Markdown → HTML) + `DOMPurify` (sanitización): únicas dependencias del bundle
- Vite (build en modo librería)
- Vitest + `@vitest/coverage-v8` (entorno `jsdom` para el widget)
- ESLint (flat config) + Prettier
- **Gestor de paquetes: pnpm.** No usar `npm install` ni `yarn` — pnpm bloquea scripts de
  instalación de dependencias transitivas no aprobados, lo cual es intencional por
  seguridad de la cadena de suministro. Si una instalación falla por
  `ERR_PNPM_IGNORED_BUILDS`, no lo evadas: revisa qué paquete pide ejecutar un script y
  corre `pnpm approve-builds <paquete>` solo si es una dependencia de build legítima y
  conocida (p. ej. `esbuild`).

## Comandos

```bash
pnpm install            # instalar dependencias
pnpm dev                # servidor de desarrollo
pnpm build              # build de producción a dist/ (JS + tipos .d.ts)
pnpm size               # presupuesto de tamaño del bundle (40 kB gzip por archivo)
pnpm test                # correr tests una vez
pnpm test:watch          # tests en modo watch
pnpm test:coverage       # tests + cobertura (debe mantenerse ≥ 80%)
pnpm lint                # ESLint
pnpm lint:fix             # ESLint con autofix
pnpm format               # Prettier (escribe)
pnpm format:check         # Prettier (solo verifica, usado en CI)
pnpm typecheck             # TypeScript sin emitir
```

Antes de dar por terminada cualquier tarea, un agente debe correr (en este orden)
`pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm build` y
`pnpm size`, y dejarlos en verde. Estos mismos
pasos son los que corre el pipeline de CI (`.github/workflows/ci.yml`); si fallan
localmente, fallarán en el PR.

## Estructura y dónde agregar código nuevo

| Necesito...                                               | Va en...                                       |
| --------------------------------------------------------- | ---------------------------------------------- |
| Tipos compartidos, estado del chat, lógica sin DOM        | `src/core/`                                    |
| Una nueva forma de hablar con un agente (real, otro mock) | `src/transport/` (implementa `AgentTransport`) |
| Orquestación del Custom Element (atributos, eventos)      | `src/widget/agichat-widget.ts`                 |
| Un subcomponente visual nuevo                             | `src/widget/components/<nombre>.ts`            |
| Colores, tipografía, espaciado, animaciones               | `src/widget/styles.ts` (custom props)          |
| Cambios en cómo se interpreta el Markdown del agente      | `src/widget/markdown.ts`                       |
| Un ejemplo de integración para otro stack                 | `examples/<stack>/`                            |
| Algo que el paquete publicado debe exportar               | `src/index.ts`                                 |

Reglas duras:

- La capa `src/widget/` **nunca** debe hablar directamente con `WebSocket`, `fetch` u otra
  API de red. Siempre pasa por una implementación de `AgentTransport` inyectada.
- La capa `src/core/` **nunca** debe importar nada de `src/widget/` (debe poder probarse
  sin DOM).
- Cada archivo nuevo en `src/` debe llegar con un `*.test.ts` junto a él, siguiendo el
  patrón ya existente (`message-store.ts` / `message-store.test.ts`).
- **Seguridad del HTML:** el contenido del agente solo se inserta con
  `innerHTML = renderMarkdown(...)`. Cualquier otro texto (mensajes del usuario, atributos
  como `agent-name`) se asigna con `textContent`. Nunca interpolar contenido dinámico en los
  templates de `innerHTML`. No agregar etiquetas ni atributos a la lista blanca de
  `markdown.ts` sin un test que pruebe que no abre un vector de XSS.
- **Estilos:** todo valor visual nuevo se declara como custom property `--agichat-*` en
  `:host` (con su variante en el bloque `prefers-color-scheme: dark`). Nada de estilos en
  línea salvo valores calculados en runtime (como la altura del textarea).
- **Accesibilidad:** todo control interactivo es un `<button>` o elemento nativo con nombre
  accesible (`aria-label` si solo tiene ícono); el foco debe ser visible; las animaciones
  deben apagarse con `prefers-reduced-motion`. Los textos visibles van en español.
- El widget nunca debe llamar a `transport.send()` si el transporte no está en `open`:
  usa `ensureConnected()` en `agichat-widget.ts`.
- No agregues dependencias nuevas al bundle del SDK (`dependencies`) sin justificarlo: es
  código que se descarga en el navegador del cliente final de Maxine, el tamaño importa.
  Herramientas de desarrollo van en `devDependencies`.

## Estilo de código

- Sin comentarios que expliquen el "qué" (el nombre de la variable/función ya lo dice).
  Solo comentar el "por qué" cuando no sea obvio (p. ej. el comentario en
  `mock-transport.test.ts` sobre el orden de fake timers).
- Exports nombrados, no `default export`.
- Una responsabilidad por archivo.
- No agregues abstracciones, flags de features, ni manejo de errores para casos que no
  pueden ocurrir. Si algo no se necesita todavía, no lo escribas.
- Sigue el estilo que ya impone Prettier/ESLint (`pnpm lint` y `pnpm format:check` son la
  fuente de verdad, no una preferencia personal).

## Tests y cobertura

- El umbral de cobertura (80% en líneas/funciones/ramas/statements) está en
  `vite.config.ts` (`test.coverage.thresholds`) y se aplica sobre todo `src/**/*.ts`
  excepto los propios `*.test.ts`, `src/index.ts` (barril de exports) y
  `src/core/types.ts` (solo declaraciones de tipos, sin código en runtime).
- Para código con temporizadores (`setTimeout`), usar `vi.useFakeTimers()` y avanzar el
  reloj con `vi.advanceTimersByTimeAsync(ms)` **en paralelo** con la promesa que depende de
  ese temporizador (no hacer `await promesaQueDependeDeUnTimer()` antes de avanzar el
  reloj: con fake timers eso cuelga la prueba). Ver el helper `connectAndAdvance` en
  `src/transport/mock-transport.test.ts`.
- Para el Custom Element, usar el entorno `jsdom` (ya configurado por defecto) y el
  `FakeTransport` de `src/widget/agichat-widget.test.ts` (permite simular `connect()` que
  resuelve, falla o se cuelga, y emitir mensajes y estados). Inyectarlo con
  `el.transport = fakeTransport` antes de insertar el elemento en el DOM; asignarlo después
  también funciona, pero es lo que se prueba en el bloque "cambio de transporte".
- Para esperar los `await` internos del widget sin fake timers, usar el helper `flush()`
  (`setTimeout(0)`) de ese mismo archivo.
- Para lógica de scroll o de altura en jsdom (que no calcula layout), definir
  `scrollHeight`/`clientHeight` con `Object.defineProperty`, como en
  `message-list.test.ts` y `composer.test.ts`.
- Probar comportamiento visible (atributos `data-*`, `aria-*`, texto, foco), no detalles
  internos privados.

## Commits y Pull Requests

- Estrategia de ramas: **GitHub Flow** (ver README). Ramas cortas desde `main`:
  `feat/...`, `fix/...`, `docs/...`, `chore/...`.
- Mensajes de commit en estilo [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`).
- Todo PR requiere que pase el pipeline de CI y **al menos una revisión humana** antes de
  fusionar a `main`. Un agente no debe fusionar un PR por sí mismo.
- Usa la plantilla en `.github/PULL_REQUEST_TEMPLATE.md`.
- Todo cambio visible para integradores se anota en `CHANGELOG.md`, sección "Sin
  publicar". Para liberar una versión: PR que sube `version` en `package.json` y mueve las
  notas a la nueva versión; después de fusionar, crear el tag `vX.Y.Z` (dispara
  `release.yml`). Un agente no crea tags ni publica versiones por su cuenta.

## Roadmap (para no duplicar ni pisar trabajo)

- **Parte 1 (hecha):** fundaciones, contrato `AgentTransport`, mock, CI/CD, widget mínimo.
- **Parte 2 (hecha, v1.0.0):** diseño visual, Markdown sanitizado, estados de UX,
  accesibilidad, ejemplos, empaquetado y release.
- **Fase 2 del curso (siguiente):** crear `src/transport/websocket-transport.ts` (o
  similar) que implemente `AgentTransport` con su test, y exportarlo en `src/index.ts`.
  **No hace falta tocar `src/widget/`**: el widget ya maneja todos los estados de
  `ConnectionStatus`, reintentos y timeout. El transporte debe:
  - emitir `connecting` → `open` al conectar, `error` si falla y `closed` si se cierra;
  - emitir por `onMessage` los mensajes del agente con un `id` estable por respuesta,
    `status: 'streaming'` para los parciales y `'complete'` (o `'error'`) al final, con el
    **contenido acumulado** (no solo el delta), igual que el mock;
  - lanzar una excepción en `send()` si no está `open`.
