import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initSupabase, isSupabaseConfigured } from '@aqua/shared';
import { App } from './App';
import './index.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (isSupabaseConfigured()) initSupabase(url, key);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
