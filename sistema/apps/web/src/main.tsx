import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initSupabase } from '@aqua/shared';
import { App } from './App';
import './index.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const configured = Boolean(url && key && !url.includes('SEU-PROJECTO'));
if (configured) initSupabase(url, key);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {configured ? <App /> : (
      <div style={{ padding: 32, color: '#EADFC8', fontFamily: 'sans-serif' }}>
        <h1>Aqua Club</h1>
        <p>Falta configurar o Supabase. Cria <code>apps/web/.env.local</code> com <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (ver README, passo 3) e reinicia o servidor.</p>
      </div>
    )}
  </StrictMode>,
);
