import { isSupabaseConfigured, supabase } from './supabase';
import type { MenuItem, OrderLine, Table } from '../types';

const DEMO_TABLES: Table[] = [
  { id: 'm1', code: 'Mesa-04-Rooftop', zone: 'rooftop', seats: 4, status: 'free', mapPosition: { x: 18, y: 28 } },
  { id: 'm2', code: 'Mesa-06-Piscina', zone: 'piscina', seats: 6, status: 'occupied', mapPosition: { x: 48, y: 40 } },
  { id: 'm3', code: 'Mesa-02-Sala-Principal', zone: 'sala-principal', seats: 2, status: 'reserved', mapPosition: { x: 68, y: 60 } },
];

const DEMO_MENU: MenuItem[] = [
  { id: 'm-1', category: 'sushi', name: 'Sashimi de Atum', sensoryDescription: 'Peixe fresco, limão e salmoura delicada.', ingredients: ['atum', 'salsa', 'limão'], allergens: ['peixe'], winePairing: 'Sauvignon Blanc', priceMzn: 720, photoUrl: '', available: true },
  { id: 'm-2', category: 'principais', name: 'Pescada ao Forno', sensoryDescription: 'Pescada com ervas aromáticas e batata assada.', ingredients: ['pescada', 'batata', 'ervas'], allergens: ['peixe'], priceMzn: 890, photoUrl: '', available: true },
  { id: 'm-3', category: 'cocktails', name: 'Aqua Sunrise', sensoryDescription: 'Citrinos, gengibre e um toque tropical.', ingredients: ['laranja', 'gengibre', 'rum'], allergens: [], priceMzn: 320, photoUrl: '', available: true },
  { id: 'm-4', category: 'sobremesas', name: 'Mousse de Maracujá', sensoryDescription: 'Leve, cítrica e equilibrada.', ingredients: ['maracujá', 'nata', 'açúcar'], allergens: ['laticínios'], priceMzn: 260, photoUrl: '', available: true },
  { id: 'm-5', category: 'marisco', name: 'Lagosta ao Molho de Coentros', sensoryDescription: 'Marisco elegante e aromático.', ingredients: ['lagosta', 'coentros', 'butter sauce'], allergens: ['crustáceos', 'laticínios'], priceMzn: 1200, photoUrl: '', available: true },
];

export async function fetchTables(): Promise<Table[]> {
  if (!isSupabaseConfigured()) return DEMO_TABLES;
  try {
    const { data, error } = await supabase().from('tables').select('*').order('code');
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, code: r.code, zone: r.zone, seats: r.seats, status: r.status,
      mapPosition: { x: r.map_x ?? 0, y: r.map_y ?? 0 },
    }));
  } catch {
    return DEMO_TABLES;
  }
}

export async function fetchMenu(): Promise<MenuItem[]> {
  if (!isSupabaseConfigured()) return DEMO_MENU;
  try {
    const { data, error } = await supabase().from('menu_items').select('*').order('name');
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, category: r.category, name: r.name, sensoryDescription: r.sensory_description,
      ingredients: r.ingredients ?? [], allergens: r.allergens ?? [], winePairing: r.wine_pairing ?? undefined,
      priceMzn: Number(r.price_mzn), photoUrl: r.photo_url ?? '', available: r.available,
    }));
  } catch {
    return DEMO_MENU;
  }
}

export async function createOrder(table: Table, lines: OrderLine[]): Promise<string> {
  if (!isSupabaseConfigured()) return `demo-order-${Date.now()}`;
  const total = lines.reduce((s, l) => s + l.unitPriceMzn * l.quantity, 0);
  const { data, error } = await supabase().from('orders')
    .insert({ table_id: table.id, table_code: table.code, lines, total_mzn: total, status: 'received' })
    .select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function fetchStaff(): Promise<{ id: string; name: string }[]> {
  if (!isSupabaseConfigured()) return [{ id: 'w1', name: 'Amélia' }, { id: 'w2', name: 'João' }];
  try {
    const { data, error } = await supabase().from('staff').select('id,name').eq('active', true).order('name');
    if (error) throw error;
    return data ?? [];
  } catch {
    return [{ id: 'w1', name: 'Amélia' }, { id: 'w2', name: 'João' }];
  }
}
