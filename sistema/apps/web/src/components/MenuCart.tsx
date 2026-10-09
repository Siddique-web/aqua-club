import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { MenuCategory, MenuItem, Table } from '@aqua/shared';
import { useCart } from './cartStore';

const CATEGORIES: { id: MenuCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'Tudo' }, { id: 'sushi', label: 'Sushi' }, { id: 'marisco', label: 'Marisco fresco' },
  { id: 'cocktails', label: 'Cocktails de assinatura' }, { id: 'principais', label: 'Pratos principais' }, { id: 'sobremesas', label: 'Sobremesas' },
];

const mzn = (v: number) => new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN', maximumFractionDigits: 0 }).format(v);

interface Props {
  table: Table;
  items: MenuItem[];
  onSubmitOrder: (lines: ReturnType<typeof useCart.getState>['lines']) => Promise<void>;
}

export function MenuCart({ table, items, onSubmitOrder }: Props) {
  const [category, setCategory] = useState<MenuCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const cart = useCart();

  const visible = useMemo(() => items.filter((i) =>
    i.available && (category === 'all' || i.category === category) &&
    (i.name + i.ingredients.join(' ')).toLowerCase().includes(query.toLowerCase())), [items, category, query]);

  async function submit() {
    setSending(true);
    try { await onSubmitOrder(cart.lines); cart.clear(); setCartOpen(false); } finally { setSending(false); }
  }

  return (
    <div className="min-h-dvh bg-linear-to-b from-abyss via-lagoon to-abyss font-sans text-pearl">
      {/* Cabeçalho */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-abyss/70 px-5 pb-3 pt-5 backdrop-blur-glass">
        <p className="text-sm text-champagne/70">{table.code.replaceAll('-', ' ')}</p>
        <h1 className="font-display text-4xl font-medium tracking-wide">Aqua Club</h1>
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar prato ou ingrediente"
          className="mt-3 w-full rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm placeholder:text-champagne/50 focus:border-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
        />
        <nav className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1" aria-label="Categorias">
          {CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)} aria-pressed={category === c.id}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${category === c.id ? 'bg-gold text-abyss' : 'bg-white/10 text-champagne hover:bg-white/20'}`}>
              {c.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Lista de pratos */}
      <main className="space-y-4 px-5 pb-32 pt-5">
        {visible.length === 0 && <p className="py-16 text-center text-champagne/70">Nada encontrado. Experimente outra categoria ou palavra.</p>}
        {visible.map((item) => (
          <motion.article layout key={item.id} className="flex gap-4 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur-glass">
            <button onClick={() => setOpen(item)} className="shrink-0" aria-label={`Ver detalhes de ${item.name}`}>
              <Photo url={item.photoUrl} name={item.name} className="h-28 w-28" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
              <div>
                <h2 className="font-display text-2xl leading-tight">{item.name}</h2>
                <p className="mt-1 line-clamp-2 text-sm text-champagne/75">{item.sensoryDescription}</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gold">{mzn(item.priceMzn)}</span>
                <motion.button whileTap={{ scale: 0.94 }} onClick={() => cart.add(item)}
                  className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-abyss">Adicionar</motion.button>
              </div>
            </div>
          </motion.article>
        ))}
      </main>

      {/* Barra do carrinho */}
      <AnimatePresence>
        {cart.count() > 0 && !cartOpen && (
          <motion.button initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} onClick={() => setCartOpen(true)}
            className="fixed inset-x-4 bottom-5 z-30 flex items-center justify-between rounded-full bg-champagne px-6 py-4 font-semibold text-abyss shadow-2xl">
            <span>Ver pedido · {cart.count()} {cart.count() === 1 ? 'item' : 'itens'}</span>
            <span>{mzn(cart.total())}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Detalhe do prato */}
      <AnimatePresence>
        {open && (
          <Sheet onClose={() => setOpen(null)} title={open.name}>
            <Photo url={open.photoUrl} name={open.name} className="h-56 w-full" />
            <p className="mt-4 text-champagne/85">{open.sensoryDescription}</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="text-gold">Ingredientes</dt><dd>{open.ingredients.join(', ')}</dd></div>
              <div><dt className="text-gold">Alérgenos</dt><dd>{open.allergens.length ? open.allergens.join(', ') : 'Nenhum declarado'}</dd></div>
              {open.winePairing && <div><dt className="text-gold">Vinho sugerido</dt><dd>{open.winePairing}</dd></div>}
            </dl>
            <button onClick={() => { cart.add(open); setOpen(null); }} className="mt-6 w-full rounded-full bg-gold py-3 font-semibold text-abyss">
              Adicionar · {mzn(open.priceMzn)}
            </button>
          </Sheet>
        )}
      </AnimatePresence>

      {/* Carrinho */}
      <AnimatePresence>
        {cartOpen && (
          <Sheet onClose={() => setCartOpen(false)} title={`Pedido da ${table.code.replaceAll('-', ' ')}`}>
            <ul className="space-y-5">
              {cart.lines.map((l) => (
                <li key={l.menuItemId}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-display text-xl">{l.name}</span>
                    <div className="flex items-center gap-3">
                      <button aria-label="Menos" onClick={() => cart.setQty(l.menuItemId, l.quantity - 1)} className="h-8 w-8 rounded-full bg-white/10">−</button>
                      <span className="w-4 text-center">{l.quantity}</span>
                      <button aria-label="Mais" onClick={() => cart.setQty(l.menuItemId, l.quantity + 1)} className="h-8 w-8 rounded-full bg-white/10">+</button>
                    </div>
                  </div>
                  <input value={l.notes ?? ''} onChange={(e) => cart.setNotes(l.menuItemId, e.target.value)}
                    placeholder="Ex.: sem cebola, molho à parte"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder:text-champagne/40 focus:border-gold focus:outline-none" />
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-between border-t border-white/10 pt-4 text-lg">
              <span>Total</span><span className="text-gold">{mzn(cart.total())}</span>
            </div>
            <button disabled={sending} onClick={submit} className="mt-4 w-full rounded-full bg-gold py-3 font-semibold text-abyss disabled:opacity-60">
              {sending ? 'A enviar…' : 'Enviar pedido à cozinha'}
            </button>
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div className="fixed inset-0 z-40 flex items-end bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="max-h-[88dvh] w-full overflow-y-auto rounded-t-[2rem] border-t border-gold/40 bg-abyss/95 p-6 text-pearl backdrop-blur-glass">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="font-display text-3xl">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full bg-white/10 px-3 py-1">✕</button>
        </div>
        {children}
      </motion.section>
    </motion.div>
  );
}

function Photo({ url, name, className }: { url: string; name: string; className: string }) {
  if (!url) {
    return <div role="img" aria-label={name} className={`${className} flex items-center justify-center rounded-2xl bg-linear-to-br from-tide to-lagoon font-display text-4xl text-champagne`}>{name.charAt(0)}</div>;
  }
  return <img src={url} alt={name} loading="lazy" className={`${className} rounded-2xl object-cover`} />;
}
