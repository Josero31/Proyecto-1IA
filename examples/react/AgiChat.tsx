import { useEffect, useRef } from 'react';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
// Importar el paquete registra <agichat-widget> como custom element.
import '@agichat/widget-sdk';
import type { AgentTransport, AgiChatWidgetElement } from '@agichat/widget-sdk';

type AgiChatWidgetAttributes = DetailedHTMLProps<
  HTMLAttributes<AgiChatWidgetElement>,
  AgiChatWidgetElement
> & {
  'agent-name'?: string;
  'welcome-message'?: string;
  placeholder?: string;
  position?: 'bottom-right' | 'bottom-left';
};

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'agichat-widget': AgiChatWidgetAttributes;
    }
  }
}

export interface AgiChatProps {
  agentName?: string;
  welcomeMessage?: string;
  placeholder?: string;
  position?: 'bottom-right' | 'bottom-left';
  /** Si se omite, el widget usa `MockAgentTransport`. */
  transport?: AgentTransport;
  onOpen?: () => void;
  onClose?: () => void;
}

export function AgiChat({
  agentName,
  welcomeMessage,
  placeholder,
  position,
  transport,
  onOpen,
  onClose,
}: AgiChatProps) {
  const ref = useRef<AgiChatWidgetElement>(null);

  // El elemento ya está montado cuando corre el efecto; el widget re-cablea sus
  // listeners al recibir un transporte nuevo, así que asignarlo aquí es seguro.
  useEffect(() => {
    if (ref.current && transport) {
      ref.current.transport = transport;
    }
  }, [transport]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleOpen = () => onOpen?.();
    const handleClose = () => onClose?.();
    el.addEventListener('agichat-open', handleOpen);
    el.addEventListener('agichat-close', handleClose);
    return () => {
      el.removeEventListener('agichat-open', handleOpen);
      el.removeEventListener('agichat-close', handleClose);
    };
  }, [onOpen, onClose]);

  return (
    <agichat-widget
      ref={ref}
      agent-name={agentName}
      welcome-message={welcomeMessage}
      placeholder={placeholder}
      position={position}
    />
  );
}
