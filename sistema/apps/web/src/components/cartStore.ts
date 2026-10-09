import { create } from 'zustand';
import type { MenuItem, OrderLine } from '@aqua/shared';

interface CartState {
  lines: OrderLine[];
  add: (item: MenuItem) => void;
  setQty: (menuItemId: string, qty: number) => void;
  setNotes: (menuItemId: string, notes: string) => void;
  clear: () => void;
  total: () => number;
  count: () => number;
}

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  add: (item) => set(({ lines }) => {
    const found = lines.find((l) => l.menuItemId === item.id);
    return found
      ? { lines: lines.map((l) => l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l) }
      : { lines: [...lines, { menuItemId: item.id, name: item.name, unitPriceMzn: item.priceMzn, quantity: 1 }] };
  }),
  setQty: (id, qty) => set(({ lines }) => ({
    lines: qty <= 0 ? lines.filter((l) => l.menuItemId !== id) : lines.map((l) => l.menuItemId === id ? { ...l, quantity: qty } : l),
  })),
  setNotes: (id, notes) => set(({ lines }) => ({ lines: lines.map((l) => l.menuItemId === id ? { ...l, notes } : l) })),
  clear: () => set({ lines: [] }),
  total: () => get().lines.reduce((s, l) => s + l.unitPriceMzn * l.quantity, 0),
  count: () => get().lines.reduce((s, l) => s + l.quantity, 0),
}));
