# AGENTS.md

Guía para cualquier herramienta de codeo agéntico (Claude Code, GitHub Copilot, Cursor,
etc.) que trabaje en este repositorio. El objetivo es que el código que genere un agente
sea indistinguible en estilo y estructura del código escrito por el equipo.

## Resumen del proyecto

SDK embebible de un widget de chat (`<agichat-widget>`) para AGIChat. Ver
[`README.md`](./README.md) para la arquitectura completa y el plan de trabajo por partes.

## Stack

- TypeScript (modo `strict`)
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
pnpm build              # build de producción a dist/
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
`pnpm lint`, `pnpm typecheck` y `pnpm test:coverage`, y dejarlos en verde. Estos mismos
pasos son los que corre el pipeline de CI (`.github/workflows/ci.yml`); si fallan
localmente, fallarán en el PR.

## Estructura y dónde agregar código nuevo

| Necesito...                                               | Va en...                                       |
| --------------------------------------------------------- | ---------------------------------------------- |
| Tipos compartidos, estado del chat, lógica sin DOM        | `src/core/`                                    |
| Una nueva forma de hablar con un agente (real, otro mock) | `src/transport/` (implementa `AgentTransport`) |
| UI del widget, subcomponentes visuales                    | `src/widget/`                                  |
| Algo que el paquete publicado debe exportar               | `src/index.ts`                                 |

Reglas duras:

- La capa `src/widget/` **nunca** debe hablar directamente con `WebSocket`, `fetch` u otra
  API de red. Siempre pasa por una implementación de `AgentTransport` inyectada.
- La capa `src/core/` **nunca** debe importar nada de `src/widget/` (debe poder probarse
  sin DOM).
- Cada archivo nuevo en `src/core` o `src/transport` debe llegar con un `*.test.ts` junto a
  él, siguiendo el patrón ya existente (`message-store.ts` / `message-store.test.ts`).
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
- Para el Custom Element, usar el entorno `jsdom` (ya configurado por defecto) e inyectar
  un transporte falso (`el.transport = fakeTransport`) **antes** de insertar el elemento en
  el DOM, ya que `connectedCallback` se dispara al insertarlo.

## Commits y Pull Requests

- Estrategia de ramas: **GitHub Flow** (ver README). Ramas cortas desde `main`:
  `feat/...`, `fix/...`, `docs/...`, `chore/...`.
- Mensajes de commit en estilo [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`).
- Todo PR requiere que pase el pipeline de CI y **al menos una revisión humana** antes de
  fusionar a `main`. Un agente no debe fusionar un PR por sí mismo.
- Usa la plantilla en `.github/PULL_REQUEST_TEMPLATE.md`.

## Roadmap (para no duplicar ni pisar trabajo de la Parte 2)

La Parte 1 (este estado del repo) entrega fundaciones, contrato de transporte, CI/CD y un
widget mínimo funcional. La Parte 2 (ver checklist en el README) se encarga del diseño
visual final según el wireframe, el renderizado de Markdown, estados de UX adicionales y el
empaquetado de distribución. Un agente que continúe la Parte 2 debe extender
`src/widget/agichat-widget.ts` (o dividirlo en subcomponentes dentro de
`src/widget/components/`) sin romper el contrato `AgentTransport` definido en
`src/core/types.ts`, para que el futuro transporte real de la Fase 2 del curso se conecte
sin tocar la UI.
