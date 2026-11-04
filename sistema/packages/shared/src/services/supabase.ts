import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Web: import.meta.env.VITE_*  |  RN: process.env.EXPO_PUBLIC_*  — injecta no arranque.
let client: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  const url = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_URL : undefined;
  const key = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_ANON_KEY : undefined;
  return Boolean(url && key && !url.includes('SEU-PROJECTO') && !url.includes('example.supabase.co'));
}

export function initSupabase(url: string, anonKey: string) {
  client = createClient(url, anonKey, { realtime: { params: { eventsPerSecond: 10 } } });
  return client;
}

export function supabase(): SupabaseClient {
  if (!client) throw new Error('Supabase não inicializado. Chama initSupabase() no arranque da app.');
  return client;
}
