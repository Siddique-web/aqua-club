"""Teste ponta a ponta (Chromium real) do fluxo cliente <-> garçom no modo demonstração.
Uso:  pip install playwright && playwright install chromium && python3 tests/e2e-demo.py
"""
import os, sys, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')
SHOTS = os.environ.get('SHOTS', '/tmp/aqua-shots'); os.makedirs(SHOTS, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{PORT}/index.html'

ok_n = fail_n = 0
errors = []
def check(cond, msg):
    global ok_n, fail_n
    if cond: ok_n += 1; print('  ✓', msg)
    else: fail_n += 1; print('  ✗ FALHOU:', msg)

def login(w, email, pw='demo1234'):
    w.fill('form[data-form=in] input[name=email]', email); w.fill('form[data-form=in] input[name=password]', pw)
    w.click('form[data-form=in] button[type=submit]')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, permissions=[])
    def watch(pg, name):
        pg.on('pageerror', lambda e: errors.append(f'[{name}] {e}'))
        pg.on('console', lambda m: errors.append(f'[{name}] console: {m.text}') if m.type == 'error' and 'fonts' not in m.text and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)

    print('\n[1] Barra inferior e site do cliente')
    cust = ctx.new_page(); watch(cust, 'cliente')
    cust.goto(URL + '?modo=demo&mesa=Mesa-04-Rooftop'); cust.wait_for_selector('#pn', timeout=8000); cust.wait_for_timeout(3200)
    check(cust.locator('#pn button').count() == 4, 'barra inferior com 4 botões (Início, Garçom, Estatísticas, Tema)')
    check(cust.locator('#pn button[aria-current=page]').get_attribute('data-k') == 'home', '"Início" está ativo por defeito')
    cust.screenshot(path=f'{SHOTS}/01-cliente-home.png')
    fb = cust.locator('#fabCall').bounding_box(); nb = cust.locator('#pn').bounding_box()
    check(fb['y'] + fb['height'] <= nb['y'] + 1, 'botão "Chamar garçom" fica acima da barra (sem sobreposição)')

    print('\n[2] Área do garçom: login')
    wt = ctx.new_page(); watch(wt, 'garcom')
    wt.goto(URL + '?modo=demo'); wt.wait_for_selector('#pn'); wt.wait_for_timeout(3000)
    wt.click('#pn button[data-k=garcom]'); wt.wait_for_selector('#gp:not([hidden]) form[data-form=in]')
    check(wt.locator('#gp .gp-demo').count() == 1, 'ecrã de login mostra as contas de demonstração')
    wt.screenshot(path=f'{SHOTS}/02-login.png')
    login(wt, 'garcom@aquaclub.demo'); wt.wait_for_selector('.gp-tab[data-t=calls]', timeout=6000)
    check('amélia' in wt.inner_text('.gp-who h2').lower(), 'login da Amélia abre o painel dela')
    check(wt.locator('.gc[data-urg]').count() == 0, 'sem chamados pendentes no início')
    wt.screenshot(path=f'{SHOTS}/03-garcom-vazio.png')

    print('\n[3] Cliente chama o garçom')
    cust.click('#fabCall'); cust.wait_for_selector('#callDlg[open]')
    cust.click('[data-reason="request_bill"]'); cust.wait_for_selector('#callStatus:not([hidden])')
    check('espera' in cust.inner_text('#csTitle').lower(), 'cliente vê "À espera de resposta"')
    cust.screenshot(path=f'{SHOTS}/04-cliente-espera.png')
    wt.wait_for_selector('.gc[data-urg]', timeout=7000)
    check('mesa 04' in wt.inner_text('.gc[data-urg] .gc-table').lower(), 'garçom vê o chamado da Mesa 04')
    check('conta' in wt.inner_text('.gc[data-urg] .gc-reason').lower(), 'garçom vê o motivo: Pedir a conta')
    check(wt.locator('#pnBd:not([hidden])').count() == 1, 'ícone Garçom mostra o contador de chamados')
    wt.screenshot(path=f'{SHOTS}/05-garcom-chamado.png')

    print('\n[4] Garçom aceita → cliente vê o novo estado')
    wt.click('button[data-act=accept]'); wt.wait_for_selector('.gc.mine', timeout=5000)
    check(wt.locator('.gc.mine .gc-state').count() == 1, 'cartão passa a "em curso comigo"')
    cust.wait_for_function("document.querySelector('#csSub').textContent.includes('Amélia')", timeout=8000)
    check('Respondido' in cust.inner_text('#csTitle'), 'cliente vê "Respondido!" com o nome da Amélia')
    cust.screenshot(path=f'{SHOTS}/06-cliente-aceite.png'); wt.screenshot(path=f'{SHOTS}/07-garcom-em-curso.png')

    print('\n[5] Recarregar a página do cliente a meio do chamado')
    cust.reload(); cust.wait_for_selector('#fabCall'); cust.wait_for_timeout(3500)
    cust.wait_for_function("document.querySelector('#fabCallTxt').textContent.includes('Amélia')", timeout=8000)
    check(True, 'após recarregar, o botão continua a mostrar "Amélia a caminho"')

    print('\n[6] Devolver e voltar a aceitar')
    wt.click('button[data-act=release]'); wt.wait_for_selector('.gc[data-urg]', timeout=5000)
    check(wt.locator('.gc[data-urg] .gp-chip.wait').count() == 1, 'chamado volta à fila marcado como "devolvido"')
    cust.wait_for_function("document.querySelector('#fabCallTxt').textContent.includes('aguardar')", timeout=8000)
    check(True, 'cliente vê que voltou a ficar à espera')
    wt.click('button[data-act=accept]'); wt.wait_for_selector('.gc.mine')

    print('\n[7] Concluir → cliente avalia')
    wt.click('button[data-act=complete]'); wt.wait_for_selector('.gc.done', timeout=5000)
    cust.click('#fabCall'); cust.wait_for_selector('#callDlg[open]'); cust.wait_for_selector('#csRate:not([hidden])', timeout=8000)
    check('concluído' in cust.inner_text('#csTitle').lower(), 'cliente vê "Atendimento concluído"')
    cust.click('#csRate .rt button[data-n="5"]'); cust.fill('#csRate input', 'Muito simpático!'); cust.screenshot(path=f'{SHOTS}/08-cliente-avaliar.png')
    cust.click('#csRate .btn'); cust.wait_for_function("document.querySelector('#csRate').textContent.includes('Obrigado')", timeout=5000)
    check(True, 'avaliação de 5 estrelas enviada')

    print('\n[8] Estatísticas do garçom')
    wt.click('#pn button[data-k=stats]'); wt.wait_for_selector('.gp-ring', timeout=5000)
    check(wt.locator('#pn button[aria-current=page]').get_attribute('data-k') == 'stats', 'botão Estatísticas fica ativo')
    check(wt.locator('.gp-kpi').count() >= 4 and wt.locator('.gp-bars .col').count() >= 7, 'KPIs e gráficos desenhados')
    check('Muito simpático' in wt.inner_text('#gpc'), 'comentário do cliente aparece nas estatísticas')
    wt.screenshot(path=f'{SHOTS}/09-estatisticas.png', full_page=False)
    wt.click('.gp-tab[data-t=hist]'); wt.wait_for_selector('.gp-item')
    check(wt.locator('.gp-item').count() >= 1, 'histórico lista os atendimentos')
    wt.click('.gp-tab[data-t=profile]'); wt.wait_for_selector('form[data-form=profile]')
    wt.fill('form[data-form=profile] input[name=phone]', '849998877'); wt.click('form[data-form=profile] button[type=submit]'); wt.wait_for_timeout(500)
    check('guardados' in wt.inner_text('form[data-form=profile] .gp-msg'), 'perfil: dados guardados')
    wt.screenshot(path=f'{SHOTS}/10-perfil.png')

    print('\n[9] Cliente cancela um chamado pendente')
    cust.reload(); cust.wait_for_selector('#fabCall'); cust.wait_for_timeout(3300)
    cust.click('#fabCall'); cust.wait_for_selector('#callDlg[open]'); cust.click('[data-reason="new_order"]'); cust.wait_for_selector('#callStatus:not([hidden])')
    wt.click('.gp-tab[data-t=calls]'); wt.wait_for_selector('.gc[data-urg]', timeout=7000)
    cust.click('#callCancel'); cust.wait_for_function("document.querySelector('#csTitle').textContent.includes('cancelada')")
    wt.wait_for_function("document.querySelectorAll('.gc[data-urg]').length === 0", timeout=8000)
    check(True, 'chamado cancelado pelo cliente desaparece da fila do garçom')
    cust.click('#callClose')

    print('\n[10] Novo garçom: registo → pendente → aprovação do admin')
    nw = ctx.new_page(); watch(nw, 'novo')
    nw.goto(URL + '?modo=demo#garcom'); nw.wait_for_selector('#gp:not([hidden]) form[data-form=in]', timeout=8000)
    nw.click('.gp-seg [data-v=up]')
    nw.fill('form[data-form=up] input[name=name]', 'Nádia Machava'); nw.fill('form[data-form=up] input[name=email]', 'nadia@exemplo.co.mz')
    nw.fill('form[data-form=up] input[name=phone]', '845551234'); nw.fill('form[data-form=up] input[name=password]', 'segredo123'); nw.fill('form[data-form=up] input[name=password2]', 'segredo123')
    nw.click('form[data-form=up] button[type=submit]'); nw.wait_for_selector('text=A aguardar aprovação', timeout=6000)
    check(True, 'conta nova fica "A aguardar aprovação"')
    nw.screenshot(path=f'{SHOTS}/11-pendente.png')
    ad = ctx.new_page(); watch(ad, 'admin'); ad.goto(URL + '?modo=demo#garcom'); ad.wait_for_selector('form[data-form=in]', timeout=8000); ad.wait_for_timeout(3000)
    login(ad, 'admin@aquaclub.demo'); ad.wait_for_selector('.gp-tab[data-t=team]', timeout=6000)
    ad.click('.gp-tab[data-t=team]'); ad.wait_for_selector('button[data-do=approve]', timeout=5000)
    ad.screenshot(path=f'{SHOTS}/12-equipa.png')
    ad.click('button[data-do=approve]'); ad.wait_for_timeout(600)
    check(ad.locator('button[data-do=approve]').count() == 0, 'admin aprova a Nádia')
    nw.wait_for_selector('.gp-tab[data-t=calls]', timeout=12000)
    check('nádia' in nw.inner_text('.gp-who h2').lower(), 'a página pendente abre sozinha depois da aprovação')

    print('\n[11] Segurança do ecrã: texto malicioso não executa')
    cust.evaluate("""() => new Promise(r => { const d = JSON.parse(localStorage.getItem('aqd.v1')); d.calls.push({id:'x-1', table_code:'Mesa-01-Rooftop', zone:'rooftop', reason:'new_order', note:'<img src=x onerror=window.__xss=1>', status:'pending', created_at:new Date().toISOString(), accepted_at:null, completed_at:null, accepted_by_name:null, accepted_by_user:null, rating:null, rating_comment:'', released_count:0}); localStorage.setItem('aqd.v1', JSON.stringify(d)); new BroadcastChannel('aqua-demo').postMessage(1); r(); })""")
    wt.click('.gp-tab[data-t=calls]'); wt.wait_for_selector('.gc-note', timeout=8000)
    check(wt.evaluate('window.__xss') is None, 'nota com HTML malicioso é mostrada como texto (sem executar)')

    print('\n[12] Tema escuro e ecrã grande')
    wt.click('#pn button[data-k=theme]'); wt.wait_for_timeout(300)
    check(wt.evaluate("document.documentElement.dataset.theme") == 'dark', 'botão da lua ativa o tema escuro')
    wt.screenshot(path=f'{SHOTS}/13-escuro-garcom.png')
    wt.click('#pn button[data-k=home]'); wt.wait_for_timeout(700); wt.screenshot(path=f'{SHOTS}/14-escuro-site.png')
    wt.click('#pn button[data-k=theme]')
    big = b.new_context(viewport={'width': 1366, 'height': 800}); dp = big.new_page(); dp.goto(URL + '?modo=demo'); dp.wait_for_selector('#pn'); dp.wait_for_timeout(3200)
    dp.screenshot(path=f'{SHOTS}/15-desktop-home.png')
    dp.click('#pn button[data-k=garcom]'); dp.wait_for_timeout(500); dp.screenshot(path=f'{SHOTS}/16-desktop-portal.png')

    print('\n[13] Modo WhatsApp (sem backend) continua a funcionar')
    wa = b.new_context(viewport={'width': 390, 'height': 844}).new_page(); watch(wa, 'whatsapp'); wa.goto(URL); wa.wait_for_selector('#pn'); wa.wait_for_timeout(3000)
    wa.click('#pn button[data-k=garcom]'); wa.wait_for_selector('text=modo')
    check(wa.locator('a[href*="modo=demo"]').count() >= 1, 'sem backend: Área do garçom explica e oferece a demonstração')
    wa.screenshot(path=f'{SHOTS}/17-sem-backend.png')
    b.close()

print('\nErros de JavaScript na consola:', errors if errors else 'nenhum')
print(f'\nResultado: {ok_n} certos, {fail_n} falhados')
sys.exit(1 if (fail_n or errors) else 0)
