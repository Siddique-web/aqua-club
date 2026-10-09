import type { Analytics } from '@aqua/shared';

/** DADOS DE DEMONSTRAÇÃO. Substituir por views SQL/RPC quando houver histórico real. */
export function getMockAnalytics(): Analytics {
  const now = new Date();
  const hours = Array.from({ length: 12 }, (_, i) => {
    const hour = 12 + i;
    const peak = Math.exp(-Math.pow((hour - 19.5) / 3, 2));
    return { hour, rooftop: Math.round(25 + 65 * peak), piscina: Math.round(35 + 50 * Math.exp(-Math.pow((hour - 15) / 3, 2))), salaPrincipal: Math.round(20 + 55 * peak) };
  });
  return {
    range: { from: new Date(now.getTime() - 864e5).toISOString(), to: now.toISOString() },
    kpis: { occupiedTables: 14, totalTables: 22, avgServiceSeconds: 148, revenueTodayMzn: 186400, openCalls: 3 },
    waiters: [
      { waiterId: '1', waiterName: 'Amélia', callsHandled: 42, avgResponseSeconds: 62, salesMzn: 58200, avgRating: 4.8 },
      { waiterId: '2', waiterName: 'Joaquim', callsHandled: 37, avgResponseSeconds: 95, salesMzn: 49100, avgRating: 4.5 },
      { waiterId: '3', waiterName: 'Nádia', callsHandled: 31, avgResponseSeconds: 78, salesMzn: 44800, avgRating: 4.7 },
    ],
    popularItems: [
      { menuItemId: 'a', name: 'Lagostim do Índico grelhado', category: 'marisco', unitsSold: 38, revenueMzn: 91200 },
      { menuItemId: 'b', name: 'Aqua Blue', category: 'cocktails', unitsSold: 33, revenueMzn: 21450 },
      { menuItemId: 'c', name: 'Uramaki Aqua', category: 'sushi', unitsSold: 27, revenueMzn: 32400 },
      { menuItemId: 'd', name: 'Peixe do dia com caril de coco', category: 'principais', unitsSold: 21, revenueMzn: 34650 },
      { menuItemId: 'e', name: 'Mochi de manga e coco', category: 'sobremesas', unitsSold: 18, revenueMzn: 9900 },
    ],
    occupancyByHour: hours,
    satisfaction: { average: 4.6, count: 128, distribution: { 5: 84, 4: 31, 3: 9, 2: 3, 1: 1 } },
  };
}
