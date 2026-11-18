/* Pedidos e chamados vão para o Supabase (PostgreSQL na nuvem).
   AQUA_API vazio de propósito: o Express local (SQLite) deixa de ser a fonte. */
window.AQUA_API = window.AQUA_API || '';

/* Supabase (PostgreSQL). Preencha url + anonKey depois de correr o SQL v4 e o seed.
   Project Settings → API. Nunca cole a service_role aqui. */
window.AQUA_SUPABASE = window.AQUA_SUPABASE || {
  url: 'https://prsjpbbvqhqdggsdnzog.supabase.co',
  anonKey: 'sb_publishable_T-HIBZ_9CIqUoJQM4A5NMA_oFcpQpTz'
};
if (window.AQUA_SUPABASE.url && window.AQUA_SUPABASE.anonKey && typeof BACKEND !== 'undefined') {
  BACKEND.url = window.AQUA_SUPABASE.url;
  BACKEND.key = window.AQUA_SUPABASE.anonKey;
}
