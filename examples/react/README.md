# Ejemplo: React

`AgiChat.tsx` envuelve `<agichat-widget>` en un componente de React con props tipadas.

```bash
pnpm add @agichat/widget-sdk
```

```tsx
import { useMemo } from 'react';
import { MockAgentTransport } from '@agichat/widget-sdk';
import { AgiChat } from './AgiChat';

export function App() {
  // useMemo evita crear (y reconectar) un transporte nuevo en cada render.
  const transport = useMemo(() => new MockAgentTransport({ streamIntervalMs: 25 }), []);

  return (
    <>
      <h1>Mi tienda</h1>
      <AgiChat
        agentName="Soporte Tienda"
        welcomeMessage="Pregunta por tu pedido, envíos o devoluciones."
        transport={transport}
        onOpen={() => console.log('chat abierto')}
      />
    </>
  );
}
```

Notas:

- Funciona con React 18 y 19. En React 19 los atributos (`agent-name`, etc.) se pasan tal
  cual al custom element; en React 18 también, porque son strings.
- El transporte se asigna como **propiedad** (no atributo) desde un `useEffect`. El widget
  admite cambiar el transporte después de montarse.
- Con Next.js, renderizar el componente solo en el cliente (`'use client'` y/o
  `dynamic(() => import('./AgiChat'), { ssr: false })`), porque los custom elements no
  existen en el servidor.
