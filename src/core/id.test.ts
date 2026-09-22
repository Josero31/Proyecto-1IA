import { describe, expect, it } from 'vitest';
import { createId } from './id';

describe('createId', () => {
  it('usa el prefijo por defecto "msg"', () => {
    expect(createId()).toMatch(/^msg_/);
  });

  it('usa el prefijo indicado', () => {
    expect(createId('agent')).toMatch(/^agent_/);
  });

  it('genera ids distintos en llamadas sucesivas', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createId()));
    expect(ids.size).toBe(20);
  });
});
