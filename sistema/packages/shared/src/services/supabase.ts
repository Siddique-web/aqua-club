import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Web: import.meta.env.VITE_*  |  RN: process.env.EXPO_PUBLIC_*  — injecta no arranque.
let client: SupabaseClient | null = null;

export function initSupabase(url: string, anonKey: string) {
  client = createClient(url, anonKey, { realtime: { params: { eventsPerSecond: 10 } } });
  return client;
}

export function supabase(): SupabaseClient {
  if (!client) throw new Error('Supabase não inicializado. Chama initSupabase() no arranque da app.');
  return client;
}
