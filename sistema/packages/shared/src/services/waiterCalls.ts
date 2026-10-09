import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { WaiterCall, WaiterCallReason, Table } from '../types';

/* Linha da BD (snake_case) → modelo de domínio */
interface Row {
  id: string; table_id: string; table_code: string; zone: WaiterCall['zone'];
  reason: WaiterCallReason; note: string | null; status: WaiterCall['status'];
  created_at: string; accepted_at: string | null; completed_at: string | null;
  accepted_by_id: string | null; accepted_by_name: string | null;
}

const toCall = (r: Row): WaiterCall => ({
  id: r.id, tableId: r.table_id, tableCode: r.table_code, zone: r.zone,
  reason: r.reason, note: r.note ?? undefined, status: r.status,
  createdAt: r.created_at, acceptedAt: r.accepted_at ?? undefined, completedAt: r.completed_at ?? undefined,
  acceptedBy: r.accepted_by_id ? { id: r.accepted_by_id, name: r.accepted_by_name ?? '' } : undefined,
});

/** Cliente: cria uma chamada em nome da mesa. */
export async function createWaiterCall(table: Table, reason: WaiterCallReason, note?: string): Promise<WaiterCall> {
  const { data, error } = await supabase()
    .from('waiter_calls')
    .insert({ table_id: table.id, table_code: table.code, zone: table.zone, reason, note, status: 'pending' })
    .select().single();
  if (error) throw error;
  return toCall(data as Row);
}

/**
 * Garçom: aceita a chamada de forma ATÓMICA.
 * O filtro `.eq('status','pending')` garante que, se dois garçons tocarem ao mesmo tempo,
 * só um UPDATE afecta uma linha — o outro recebe `null` (já foi atendida).
 */
export async function acceptWaiterCall(callId: string, waiter: { id: string; name: string }): Promise<WaiterCall | null> {
  const { data, error } = await supabase()
    .from('waiter_calls')
    .update({ status: 'accepted', accepted_by_id: waiter.id, accepted_by_name: waiter.name, accepted_at: new Date().toISOString() })
    .eq('id', callId).eq('status', 'pending')
    .select().maybeSingle();
  if (error) throw error;
  return data ? toCall(data as Row) : null;
}

export async function completeWaiterCall(callId: string): Promise<void> {
  const { error } = await supabase().from('waiter_calls')
    .update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', callId);
  if (error) throw error;
}

/** Subscrição genérica; devolve a função de cleanup. */
export function subscribeToCalls(
  filter: string | undefined,
  onChange: (call: WaiterCall, event: 'INSERT' | 'UPDATE') => void,
): () => void {
  const channel: RealtimeChannel = supabase()
    .channel(`waiter_calls:${filter ?? 'all'}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'waiter_calls', ...(filter ? { filter } : {}) },
      (p) => { if (p.eventType !== 'DELETE') onChange(toCall(p.new as Row), p.eventType as 'INSERT' | 'UPDATE'); })
    .subscribe();
  return () => { void supabase().removeChannel(channel); };
}

export async function fetchPendingCalls(): Promise<WaiterCall[]> {
  const { data, error } = await supabase().from('waiter_calls').select('*')
    .in('status', ['pending', 'accepted']).order('created_at', { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(toCall);
}
