import { useCallback, useEffect, useState } from 'react';
import { acceptWaiterCall, completeWaiterCall, createWaiterCall, fetchPendingCalls, subscribeToCalls } from './waiterCalls';
import type { Table, WaiterCall, WaiterCallReason } from '../types';

/* ───────── STAFF: feed de chamadas + aceitar ───────── */
export function useStaffCalls(waiter: { id: string; name: string }) {
  const [calls, setCalls] = useState<WaiterCall[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPendingCalls().then((c) => alive && setCalls(c)).catch((e) => setError(String(e)));

    const off = subscribeToCalls(undefined, (call) => {
      setCalls((prev) => {
        const rest = prev.filter((c) => c.id !== call.id);
        if (call.status === 'completed' || call.status === 'cancelled') return rest;
        // aceite por outro garçom → sai do meu feed (evita atendimento duplicado)
        if (call.status === 'accepted' && call.acceptedBy?.id !== waiter.id) return rest;
        return [...rest, call].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
    });
    return () => { alive = false; off(); };
  }, [waiter.id]);

  const accept = useCallback(async (callId: string) => {
    // UI optimista; reverte se outro garçom ganhou a corrida
    setCalls((p) => p.map((c) => c.id === callId ? { ...c, status: 'accepted', acceptedBy: waiter } : c));
    const result = await acceptWaiterCall(callId, waiter);
    if (!result) {
      setCalls((p) => p.filter((c) => c.id !== callId));
      return { ok: false as const, reason: 'already_taken' as const };
    }
    return { ok: true as const };
  }, [waiter]);

  const complete = useCallback((id: string) => completeWaiterCall(id), []);
  return { calls, accept, complete, error };
}

/* ───────── CLIENTE: chamar garçom e seguir o estado ───────── */
export function useCustomerCall(table: Table) {
  const [call, setCall] = useState<WaiterCall | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!call) return;
    return subscribeToCalls(`id=eq.${call.id}`, (updated) => setCall(updated));
  }, [call?.id]);

  const request = useCallback(async (reason: WaiterCallReason, note?: string) => {
    setSending(true);
    try { setCall(await createWaiterCall(table, reason, note)); } finally { setSending(false); }
  }, [table]);

  const message =
    !call ? null :
    call.status === 'pending' ? 'Pedido enviado. A equipa já foi avisada.' :
    call.status === 'accepted' ? `${call.acceptedBy?.name} já está a caminho!` :
    call.status === 'completed' ? 'Atendimento concluído.' : null;

  return { call, request, sending, message };
}
