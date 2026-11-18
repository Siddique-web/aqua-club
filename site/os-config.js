/* Pedidos e chamados vão para o Supabase (PostgreSQL na nuvem).
   AQUA_API vazio: o SQLite local não é a fonte.
   anonKey é chave pública (RLS). Nunca cole service_role nem códigos da equipa. */
window.AQUA_API = window.AQUA_API || '';

/* Project Settings → API → anon / publishable. */
window.AQUA_SUPABASE = window.AQUA_SUPABASE || {
  url: 'https://prsjpbbvqhqdggsdnzog.supabase.co',
  anonKey: 'sb_publishable_T-HIBZ_9CIqUoJQM4A5NMA_oFcpQpTz'
};
if (window.AQUA_SUPABASE.url && window.AQUA_SUPABASE.anonKey && typeof BACKEND !== 'undefined') {
  BACKEND.url = window.AQUA_SUPABASE.url;
  BACKEND.key = window.AQUA_SUPABASE.anonKey;
}
if (window.AquaUI && typeof AquaUI.initBackend === 'function') {
  AquaUI.initBackend();
}
