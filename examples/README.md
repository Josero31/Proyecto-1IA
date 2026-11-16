# Ejemplos de integración

Tres formas de agregar `<agichat-widget>` al sitio de un cliente de AGIChat. Ninguno de estos
archivos forma parte del paquete publicado (`dist/`) ni del build; son referencia para
integradores.

| Carpeta              | Stack                    | Qué muestra                                                 |
| -------------------- | ------------------------ | ----------------------------------------------------------- |
| [`html/`](./html/)   | HTML plano, sin build    | Etiqueta + script, personalización por atributos y tema CSS |
| [`react/`](./react/) | React 18/19              | Componente envoltorio, transporte inyectado y eventos       |
| [`vue/`](./vue/)     | Vue 3 (`<script setup>`) | Componente envoltorio y configuración de `isCustomElement`  |

## API común a los tres ejemplos

Atributos (todos opcionales):

| Atributo          | Valor por defecto                                              |
| ----------------- | -------------------------------------------------------------- |
| `agent-name`      | `Asistente AGIChat`                                            |
| `welcome-message` | `Escribe tu pregunta y el asistente te responderá aquí mismo.` |
| `placeholder`     | `Escribe un mensaje…`                                          |
| `position`        | `bottom-right` (también `bottom-left`)                         |

Propiedad `transport`: cualquier objeto que implemente `AgentTransport`. Si no se asigna, se
usa `MockAgentTransport`. Se puede asignar antes o después de insertar el elemento en el DOM.

Métodos: `openPanel()`, `closePanel()`, `toggle()` y la propiedad de solo lectura `open`.

Eventos (burbujean y cruzan el Shadow DOM): `agichat-open`, `agichat-close`.

Tema: sobrescribe las custom properties `--agichat-*` desde el CSS de tu página, por ejemplo
`agichat-widget { --agichat-primary: #0a4d8c; }`. La lista completa está en
[`src/widget/styles.ts`](../src/widget/styles.ts).

## Conectar con el backend real

`WebSocketAgentTransport` habla con el gateway de AGIChat. El sitio desde el que se carga el
widget debe estar en `ALLOWED_ORIGINS` del gateway.

```ts
import { WebSocketAgentTransport } from '@agichat/widget-sdk';

widget.transport = new WebSocketAgentTransport('wss://chat.ejemplo.com/ws');
```

Con el transporte real el widget muestra las tarjetas con póster y abre IMDb o Google Books
cuando el agente lo decide. Si el navegador bloquea la pestaña, aparece un botón para abrirla.
Para la demo, permite las ventanas emergentes del sitio. En `index.html` y `examples/html/`
basta con agregar `?ws=ws://localhost:8000/ws` a la URL.

En el atributo `welcome-message` conviene usar el mismo texto que `WELCOME_MESSAGE` del backend
(`backend/src/agichat/agents/prompts.py`), para anunciar desde el inicio que el agente compara
películas con libros.

## Probar el ejemplo de HTML localmente

```bash
pnpm build
pnpm dlx serve .    # o cualquier servidor estático en la raíz del repo
# abrir http://localhost:3000/examples/html/
```
