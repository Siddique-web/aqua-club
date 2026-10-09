import { beforeEach, describe, expect, it } from 'vitest';
import { useCart } from './cartStore';
import type { MenuItem } from '@aqua/shared';

const item = (id: string, price: number): MenuItem => ({
  id, category: 'sushi', name: `Prato ${id}`, sensoryDescription: '', ingredients: [], allergens: [],
  priceMzn: price, photoUrl: '', available: true,
});

describe('carrinho', () => {
  beforeEach(() => useCart.getState().clear());

  it('soma quantidades do mesmo prato e calcula total', () => {
    const { add } = useCart.getState();
    add(item('a', 100)); add(item('a', 100)); add(item('b', 50));
    expect(useCart.getState().count()).toBe(3);
    expect(useCart.getState().total()).toBe(250);
  });

  it('remove a linha quando a quantidade chega a zero', () => {
    const s = useCart.getState();
    s.add(item('a', 100));
    s.setQty('a', 0);
    expect(useCart.getState().lines).toHaveLength(0);
  });

  it('guarda notas por item', () => {
    const s = useCart.getState();
    s.add(item('a', 100));
    s.setNotes('a', 'sem cebola');
    expect(useCart.getState().lines[0]?.notes).toBe('sem cebola');
  });
});
