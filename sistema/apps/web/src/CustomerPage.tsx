import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createOrder, fetchMenu, fetchTables, useCustomerCall, type MenuItem, type Table, type WaiterCallReason } from '@aqua/shared';
import { MenuCart } from './components/MenuCart';

const REASONS: { id: WaiterCallReason; label: string }[] = [
  { id: 'request_bill', label: 'Pedir a conta' }, { id: 'menu_question', label: 'Dúvida sobre o menu' },
  { id: 'new_order', label: 'Fazer novo pedido' }, { id: 'urgent_other', label: 'Urgente / outro' },
];

export function CustomerPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [table, setTable] = useState<Table | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchTables(), fetchMenu()]).then(([t, m]) => {
      setTables(t); setMenu(m);
      const code = new URLSearchParams(location.search).get('mesa'); // QR Code: /?mesa=Mesa-04-Rooftop
      setTable(t.find((x) => x.code === code) ?? null);
    }).catch((e) => setError(e.message ?? String(e)));
  }, []);

  if (error) return <p role="alert" className="p-8 text-red-300">Não foi possível ligar ao Supabase: {error}</p>;
  if (!tables.length) return <p className="p-8 text-champagne">A carregar…</p>;

  if (!table) {
    return (
      <main className="min-h-dvh bg-linear-to-b from-abyss to-lagoon p-6 font-sans text-pearl">
        <h1 className="font-display text-5xl">Aqua Club</h1>
        <p className="mt-2 text-champagne/80">Em que mesa está? Normalmente o QR Code da mesa abre esta página já na mesa certa.</p>
        <ul className="mt-6 grid gap-3">
          {tables.map((t) => (
            <li key={t.id}>
              <button onClick={() => setTable(t)} className="w-full rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-left backdrop-blur-glass hover:border-gold">
                <span className="font-display text-2xl">{t.code.replaceAll('-', ' ')}</span>
                <span className="ml-3 text-sm text-champagne/70">{t.seats} lugares</span>
              </button>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  return (
    <>
      <MenuCart table={table} items={menu} onSubmitOrder={async (lines) => { await createOrder(table, lines); }} />
      <CallWaiter table={table} />
    </>
  );
}

function CallWaiter({ table }: { table: Table }) {
  const { call, request, sending, message } = useCustomerCall(table);
  const [open, setOpen] = useState(false);
  const active = call && (call.status === 'pending' || call.status === 'accepted');

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Chamar garçom"
        className="fixed right-4 top-4 z-30 rounded-full border border-gold/60 bg-abyss/80 px-4 py-2 text-sm text-champagne backdrop-blur-glass">
        Chamar garçom
      </button>
      <AnimatePresence>
        {message && (
          <motion.p role="status" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
            className={`fixed inset-x-4 top-16 z-30 rounded-2xl px-4 py-3 text-center text-sm font-semibold ${call?.status === 'accepted' ? 'bg-gold text-abyss' : 'bg-champagne text-abyss'}`}>
            {message}
          </motion.p>
        )}
      </AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Chamar garçom" onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-[2rem] border-t border-gold/40 bg-abyss p-6 text-pearl">
            <h2 className="font-display text-3xl">Como podemos ajudar?</h2>
            <div className="mt-4 grid gap-3">
              {REASONS.map((r) => (
                <button key={r.id} disabled={sending || Boolean(active)}
                  onClick={async () => { await request(r.id); setOpen(false); }}
                  className="rounded-2xl bg-white/10 px-5 py-4 text-left hover:bg-white/20 disabled:opacity-50">
                  {r.label}
                </button>
              ))}
            </div>
            {active && <p className="mt-3 text-sm text-champagne/70">Já existe uma chamada em curso para esta mesa.</p>}
          </div>
        </div>
      )}
    </>
  );
}
