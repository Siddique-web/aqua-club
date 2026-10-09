import { supabase } from './supabase';
import type { MenuItem, OrderLine, Table } from '../types';

export async function fetchTables(): Promise<Table[]> {
  const { data, error } = await supabase().from('tables').select('*').order('code');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, code: r.code, zone: r.zone, seats: r.seats, status: r.status,
    mapPosition: { x: r.map_x ?? 0, y: r.map_y ?? 0 },
  }));
}

export async function fetchMenu(): Promise<MenuItem[]> {
  const { data, error } = await supabase().from('menu_items').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, category: r.category, name: r.name, sensoryDescription: r.sensory_description,
    ingredients: r.ingredients ?? [], allergens: r.allergens ?? [], winePairing: r.wine_pairing ?? undefined,
    priceMzn: Number(r.price_mzn), photoUrl: r.photo_url ?? '', available: r.available,
  }));
}

export async function createOrder(table: Table, lines: OrderLine[]): Promise<string> {
  const total = lines.reduce((s, l) => s + l.unitPriceMzn * l.quantity, 0);
  const { data, error } = await supabase().from('orders')
    .insert({ table_id: table.id, table_code: table.code, lines, total_mzn: total, status: 'received' })
    .select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function fetchStaff(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase().from('staff').select('id,name').eq('active', true).order('name');
  if (error) throw error;
  return data ?? [];
}
