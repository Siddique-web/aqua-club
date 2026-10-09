import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { fetchStaff, initSupabase } from '@aqua/shared';
import { AlertsScreen } from './src/screens/AlertsScreen';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const configured = Boolean(url && key && !url.includes('SEU-PROJECTO'));
if (configured) initSupabase(url, key);

type Waiter = { id: string; name: string };

export default function App() {
  const [staff, setStaff] = useState<Waiter[] | null>(null);
  const [waiter, setWaiter] = useState<Waiter | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) return;
    fetchStaff().then(setStaff).catch((e) => setError(e.message ?? String(e)));
  }, []);

  if (!configured) return <Centered><Text style={s.text}>Falta configurar o Supabase: cria apps/staff/.env (ver README, passo 3) e reinicia com "npx expo start -c".</Text></Centered>;
  if (error) return <Centered><Text style={s.text}>Erro de ligação: {error}</Text></Centered>;
  if (!staff) return <Centered><ActivityIndicator color="#C9A66B" /></Centered>;
  if (waiter) return (<><StatusBar style="light" /><AlertsScreen waiter={waiter} /></>);

  // Login de DESENVOLVIMENTO: escolher o nome. Em produção, usar Supabase Auth (email + palavra-passe).
  return (
    <Centered>
      <StatusBar style="light" />
      <Text style={s.title}>Aqua Club</Text>
      <Text style={s.text}>Quem está de serviço?</Text>
      {staff.map((w) => (
        <Pressable key={w.id} style={s.btn} onPress={() => setWaiter(w)} accessibilityRole="button">
          <Text style={s.btnTxt}>{w.name}</Text>
        </Pressable>
      ))}
    </Centered>
  );
}

const Centered = ({ children }: { children: React.ReactNode }) => <View style={s.center}>{children}</View>;
const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#07203A', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { color: '#EADFC8', fontSize: 40, fontFamily: 'serif' },
  text: { color: '#EADFC8', textAlign: 'center', fontSize: 16 },
  btn: { backgroundColor: '#C9A66B', borderRadius: 999, paddingVertical: 14, paddingHorizontal: 40, minWidth: 220, alignItems: 'center' },
  btnTxt: { color: '#07203A', fontWeight: '700', fontSize: 18 },
});
