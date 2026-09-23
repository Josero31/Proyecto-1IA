import type { ConnectionStatus } from '../core/types';

export const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Desconectado',
  connecting: 'Conectando…',
  open: 'En línea',
  closed: 'Desconectado',
  error: 'Sin conexión',
};

export interface BannerState {
  message: string;
  action: string;
}

export function bannerFor(
  status: ConnectionStatus,
  hasConnectedBefore: boolean,
): BannerState | null {
  if (status === 'error') {
    return { message: 'No se pudo conectar con el asistente.', action: 'Reintentar' };
  }
  if (status === 'closed' && hasConnectedBefore) {
    return { message: 'Se perdió la conexión con el asistente.', action: 'Reconectar' };
  }
  return null;
}
