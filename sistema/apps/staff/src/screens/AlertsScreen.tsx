import { useEffect, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { useStaffCalls, type WaiterCall, type WaiterCallReason } from '@aqua/shared';

const REASON_LABEL: Record<WaiterCallReason, string> = {
  request_bill: 'Pedir conta', menu_question: 'Dúvida sobre o menu', new_order: 'Novo pedido', urgent_other: 'Urgente',
};
const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });
const C = { abyss: '#07203A', lagoon: '#0F4C6B', champagne: '#EADFC8', gold: '#C9A66B', warn: '#E0A030', danger: '#D9534F', ok: '#3FA37A' };

/** Cronómetro partilhado: um único setInterval para todos os cartões. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
// < 2 min normal · 2–5 min âmbar · > 5 min vermelho
const urgencyColor = (s: number) => (s > 300 ? C.danger : s > 120 ? C.warn : C.champagne);

export function AlertsScreen({ waiter }: { waiter: { id: string; name: string } }) {
  const { calls, accept, complete } = useStaffCalls(waiter);
  const now = useNow();

  const pending = calls.filter((c) => c.status === 'pending');
  const mine = calls.filter((c) => c.status === 'accepted' && c.acceptedBy?.id === waiter.id);

  async function onAccept(id: string) {
    const res = await accept(id);
    if (res.ok) Vibration.vibrate(40);
    else Alert.alert('Já atendida', 'Outro colega aceitou esta requisição primeiro.');
  }

  const renderCard = ({ item }: { item: WaiterCall }) => {
    const waited = Math.max(0, Math.floor((now - new Date(item.createdAt).getTime()) / 1000));
    const isMine = item.status === 'accepted';
    const color = isMine ? C.ok : urgencyColor(waited);
    return (
      <View style={[s.card, { borderLeftColor: color }]}>
        <View style={s.row}>
          <Text style={s.table}>{item.tableCode.replace(/-/g, ' ')}</Text>
          <Text style={[s.timer, { color }]}>{fmt(waited)}</Text>
        </View>
        <Text style={s.reason}>{REASON_LABEL[item.reason]}</Text>
        {item.note ? <Text style={s.note}>“{item.note}”</Text> : null}
        {isMine ? (
          <Pressable style={[s.btn, s.btnDone]} onPress={() => complete(item.id)} accessibilityRole="button">
            <Text style={s.btnTxt}>Marcar como concluída</Text>
          </Pressable>
        ) : (
          <Pressable style={s.btn} onPress={() => onAccept(item.id)} accessibilityRole="button" accessibilityLabel={`Aceitar requisição da ${item.tableCode}`}>
            <Text style={s.btnTxt}>Aceitar requisição</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <Text style={s.title}>Olá, {waiter.name}</Text>
      <Text style={s.sub}>{pending.length} por atender · {mine.length} consigo</Text>
      <FlatList
        data={[...mine, ...pending]}
        keyExtractor={(c) => c.id}
        renderItem={renderCard}
        extraData={now}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={<Text style={s.empty}>Sem chamadas neste momento. Novas aparecem aqui sozinhas.</Text>}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.abyss, paddingHorizontal: 18, paddingTop: 56 },
  title: { color: C.champagne, fontSize: 30, fontFamily: SERIF },
  sub: { color: C.gold, marginTop: 2, marginBottom: 18 },
  card: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: 16, marginBottom: 12, borderLeftWidth: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  table: { color: '#FAF7F0', fontSize: 22, fontFamily: SERIF },
  timer: { fontSize: 22, fontVariant: ['tabular-nums'], fontWeight: '700' },
  reason: { color: C.champagne, fontSize: 16, marginTop: 4 },
  note: { color: C.champagne, opacity: 0.7, marginTop: 6, fontStyle: 'italic' },
  btn: { marginTop: 14, backgroundColor: C.gold, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  btnDone: { backgroundColor: C.ok },
  btnTxt: { color: C.abyss, fontWeight: '700', fontSize: 16 },
  empty: { color: C.champagne, opacity: 0.6, textAlign: 'center', marginTop: 80 },
});
