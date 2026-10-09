import { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Analytics } from '@aqua/shared';
import { getMockAnalytics } from '../data/mockAnalytics';

type Range = 'today' | '7d' | '30d';
const COLORS = { abyss: '#07203A', lagoon: '#0F4C6B', tide: '#2C7A91', champagne: '#EADFC8', gold: '#C9A66B' };
const mzn = (v: number) => new Intl.NumberFormat('pt-MZ', { style: 'currency', currency: 'MZN', maximumFractionDigits: 0 }).format(v);
const mmss = (s: number) => `${Math.floor(s / 60)}m ${Math.round(s % 60).toString().padStart(2, '0')}s`;

/** Dados de demonstração. Troca por uma RPC/view do Supabase quando houver histórico real. */
async function fetchAnalytics(_range: Range): Promise<Analytics> {
  return getMockAnalytics();
}

function useAnalytics(range: Range) {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    const load = () => fetchAnalytics(range).then((d) => alive && setData(d)).catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(load, 15_000); // KPIs quase em tempo real
    return () => { alive = false; clearInterval(t); };
  }, [range]);
  return { data, error };
}

export function AdminDashboard() {
  const [range, setRange] = useState<Range>('today');
  const { data, error } = useAnalytics(range);

  if (error) return <p role="alert" className="p-8 text-red-300">{error}</p>;
  if (!data) return <p className="p-8 text-champagne/70">A carregar métricas…</p>;

  const { kpis, waiters, popularItems, occupancyByHour, satisfaction } = data;
  const byResponse = [...waiters].sort((a, b) => a.avgResponseSeconds - b.avgResponseSeconds);

  return (
    <div className="min-h-dvh bg-abyss p-6 font-sans text-pearl md:p-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-5xl">Aqua Club</h1>
          <p className="text-champagne/70">Painel de operações</p>
        </div>
        <div role="group" aria-label="Período" className="flex gap-1 rounded-full bg-white/10 p-1">
          {(['today', '7d', '30d'] as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} aria-pressed={range === r}
              className={`rounded-full px-4 py-1.5 text-sm ${range === r ? 'bg-gold text-abyss' : 'text-champagne'}`}>
              {r === 'today' ? 'Hoje' : r === '7d' ? '7 dias' : '30 dias'}
            </button>
          ))}
        </div>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Mesas ocupadas" value={`${kpis.occupiedTables}/${kpis.totalTables}`} hint={`${kpis.totalTables - kpis.occupiedTables} livres`} />
        <Kpi label="Tempo médio de atendimento" value={mmss(kpis.avgServiceSeconds)} />
        <Kpi label="Faturamento do dia" value={mzn(kpis.revenueTodayMzn)} />
        <Kpi label="Chamadas em aberto" value={String(kpis.openCalls)} />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Performance por garçom */}
        <Card title="Tempo médio de resposta por garçom" subtitle="Menor é melhor">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byResponse} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid stroke="rgba(255,255,255,.08)" horizontal={false} />
              <XAxis type="number" stroke={COLORS.champagne} tickFormatter={(v) => `${Math.round(v)}s`} />
              <YAxis type="category" dataKey="waiterName" stroke={COLORS.champagne} width={90} />
              <Tooltip formatter={(v) => mmss(Number(v))} contentStyle={tip} />
              <Bar dataKey="avgResponseSeconds" name="Resposta média" radius={[0, 8, 8, 0]}>
                {byResponse.map((w, i) => <Cell key={w.waiterId} fill={i === 0 ? COLORS.gold : COLORS.tide} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Chamadas atendidas e vendas por garçom">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={waiters}>
              <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
              <XAxis dataKey="waiterName" stroke={COLORS.champagne} />
              <YAxis yAxisId="l" stroke={COLORS.champagne} />
              <YAxis yAxisId="r" orientation="right" stroke={COLORS.gold} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip contentStyle={tip} formatter={(v, n) => (n === 'Vendas' ? mzn(Number(v)) : String(v))} />
              <Legend />
              <Bar yAxisId="l" dataKey="callsHandled" name="Chamadas" fill={COLORS.tide} radius={[8, 8, 0, 0]} />
              <Line yAxisId="r" dataKey="salesMzn" name="Vendas" stroke={COLORS.gold} strokeWidth={3} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        {/* Picos de ocupação */}
        <Card title="Ocupação por hora e zona" subtitle="% de mesas ocupadas">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={occupancyByHour}>
              <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
              <XAxis dataKey="hour" stroke={COLORS.champagne} tickFormatter={(h) => `${h}h`} />
              <YAxis stroke={COLORS.champagne} domain={[0, 100]} />
              <Tooltip contentStyle={tip} labelFormatter={(h) => `${h}:00`} />
              <Legend />
              <Area dataKey="rooftop" name="Rooftop" stroke={COLORS.gold} fill={COLORS.gold} fillOpacity={0.25} />
              <Area dataKey="piscina" name="Piscina" stroke={COLORS.tide} fill={COLORS.tide} fillOpacity={0.3} />
              <Area dataKey="salaPrincipal" name="Sala principal" stroke={COLORS.champagne} fill={COLORS.champagne} fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Pratos populares */}
        <Card title="Pratos mais pedidos">
          <ol className="space-y-3">
            {popularItems.slice(0, 6).map((p) => (
              <li key={p.menuItemId}>
                <div className="flex justify-between text-sm"><span>{p.name}</span><span className="text-gold">{p.unitsSold} un · {mzn(p.revenueMzn)}</span></div>
                <div className="mt-1 h-2 rounded-full bg-white/10">
                  <div className="h-2 rounded-full bg-gold" style={{ width: `${(p.unitsSold / popularItems[0].unitsSold) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </Card>

        {/* Satisfação */}
        <Card title="Satisfação dos clientes" subtitle={`${satisfaction.count} avaliações`}>
          <div className="flex items-center gap-8">
            <p className="font-display text-7xl text-gold">{satisfaction.average.toFixed(1)}</p>
            <ul className="flex-1 space-y-1.5 text-sm">
              {([5, 4, 3, 2, 1] as const).map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <span className="w-3">{n}</span>
                  <div className="h-2 flex-1 rounded-full bg-white/10">
                    <div className="h-2 rounded-full bg-tide" style={{ width: `${(satisfaction.distribution[n] / Math.max(1, satisfaction.count)) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        {/* Ranking de garçons */}
        <Card title="Ranking de garçons" subtitle="Avaliação média dos clientes">
          <table className="w-full text-left text-sm">
            <thead className="text-champagne/60"><tr><th className="pb-2 font-normal">Garçom</th><th className="font-normal">Chamadas</th><th className="font-normal">Resposta</th><th className="font-normal">Nota</th></tr></thead>
            <tbody>
              {[...waiters].sort((a, b) => b.avgRating - a.avgRating).map((w) => (
                <tr key={w.waiterId} className="border-t border-white/10">
                  <td className="py-2">{w.waiterName}</td><td>{w.callsHandled}</td><td>{mmss(w.avgResponseSeconds)}</td><td className="text-gold">{w.avgRating.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

const tip = { background: COLORS.abyss, border: `1px solid ${COLORS.gold}`, borderRadius: 12, color: '#FAF7F0' };

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.07] p-5 backdrop-blur-glass">
      <p className="text-sm text-champagne/70">{label}</p>
      <p className="mt-2 font-display text-4xl">{value}</p>
      {hint && <p className="mt-1 text-sm text-gold">{hint}</p>}
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.07] p-6 backdrop-blur-glass">
      <h2 className="font-display text-2xl">{title}</h2>
      {subtitle && <p className="mb-4 text-sm text-champagne/60">{subtitle}</p>}
      <div className={subtitle ? '' : 'mt-4'}>{children}</div>
    </section>
  );
}
