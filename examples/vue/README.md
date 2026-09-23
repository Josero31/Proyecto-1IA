# Ejemplo: Vue 3

`AgiChat.vue` envuelve `<agichat-widget>` en un componente de Vue con props tipadas y
eventos `open` / `close`.

```bash
pnpm add @agichat/widget-sdk
```

Indicarle a Vue que `agichat-widget` es un custom element (si no, intenta resolverlo como
componente de Vue y muestra una advertencia):

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === 'agichat-widget',
        },
      },
    }),
  ],
});
```

Uso:

```vue
<script setup lang="ts">
import { MockAgentTransport } from '@agichat/widget-sdk';
import AgiChat from './AgiChat.vue';

const transport = new MockAgentTransport();
</script>

<template>
  <AgiChat agent-name="Soporte Tienda" :transport="transport" @open="console.log('abierto')" />
</template>
```

Con Nuxt, envolver el componente en `<ClientOnly>`: los custom elements no existen en el
servidor.
