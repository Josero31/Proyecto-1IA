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

## Probar el ejemplo de HTML localmente

```bash
pnpm build
pnpm dlx serve .    # o cualquier servidor estático en la raíz del repo
# abrir http://localhost:3000/examples/html/
```
