import { describe, expect, it } from 'vitest';
import { bannerFor, STATUS_LABEL } from './connection-state';
import type { ConnectionStatus } from '../core/types';

describe('connection-state', () => {
  it('tiene una etiqueta legible para cada estado', () => {
    const statuses: ConnectionStatus[] = ['idle', 'connecting', 'open', 'closed', 'error'];
    for (const status of statuses) {
      expect(STATUS_LABEL[status]).toBeTruthy();
    }
  });

  it('pide reintentar cuando hay error', () => {
    expect(bannerFor('error', false)).toEqual({
      message: 'No se pudo conectar con el asistente.',
      action: 'Reintentar',
    });
  });

  it('pide reconectar solo si la conexión ya se había abierto antes', () => {
    expect(bannerFor('closed', true)?.action).toBe('Reconectar');
    expect(bannerFor('closed', false)).toBeNull();
  });

  it('no muestra aviso en estados normales', () => {
    expect(bannerFor('idle', false)).toBeNull();
    expect(bannerFor('connecting', true)).toBeNull();
    expect(bannerFor('open', true)).toBeNull();
  });
});
