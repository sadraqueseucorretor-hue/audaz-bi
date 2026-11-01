// =====================================================================================
// CALCULADORA (31/10/2026) — janelinha flutuante que abre de QUALQUER aba do BI, ao lado de Notas.
// Botão "Calc" à esquerda do botão de Notas. Arrasta pelo topo, minimiza, fecha com Esc.
// Sem fundo escuro — o BI continua clicável por trás.
// - Digita pelo teclado ou pelos botões; aceita número no formato BR ("R$ 267.900,50") e colar.
// - % como na calculadora de celular: 1000 + 10% = 1100 · 1000 - 10% = 900 · 1000 × 10% = 100.
// - "+ Seleção" joga na conta o último número selecionado no BI (ex.: um VGV de uma tabela).
// - Copiar resultado; histórico das últimas 30 contas (clique reaproveita).
// Conta é avaliada por um parser próprio (sem eval). Histórico/posição: só neste navegador.
// =====================================================================================
(function () {
    const PREFIXO = typeof appId !== 'undefined' ? appId : 'audaz-bi-v1';
    const LS_HIST = `${PREFIXO}-calc-historico`;
    const LS_JANELA = `${PREFIXO}-calc-janela`;
    let historico = [];      // [{ conta, resultado }]
    let ultimaSelecao = '';
    let janela = { x: null, y: null, min: false };
    const ehCelular = () => window.innerWidth < 640;
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    try { historico = JSON.parse(localStorage.getItem(LS_HIST) || '[]'); if (!Array.isArray(historico)) historico = []; } catch (e) { historico = []; }
    try { Object.assign(janela, JSON.parse(localStorage.getItem(LS_JANELA) || '{}')); } catch (e) {}
    const salvarHist = () => { try { localStorage.setItem(LS_HIST, JSON.stringify(historico.slice(0, 30))); } catch (e) {} };
    const salvarJanela = () => { try { localStorage.setItem(LS_JANELA, JSON.stringify(janela)); } catch (e) {} };

    // ---------- números BR ----------
    // "267.900,50" → 267900.5 · "1.234" → 1234 · "1.5" → 1.5 · "0,5" → 0.5
    function lerNumero(tok) {
        let t = String(tok);
        if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
        else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
        const n = parseFloat(t);
        if (!isFinite(n)) throw new Error('número inválido');
        return n;
    }
    function formatar(n) {
        if (!isFinite(n)) return 'Erro';
        const arred = Math.round(n * 1e10) / 1e10;
        return arred.toLocaleString('pt-BR', { maximumFractionDigits: 10 });
    }

    // ---------- parser (sem eval) ----------
    function tokens(expr) {
        const s = String(expr).replace(/R\$\s*/gi, '').replace(/[×x*]/g, '*').replace(/[÷:]/g, '/').replace(/[−–]/g, '-').replace(/\s+/g, '');
        const out = []; let i = 0;
        while (i < s.length) {
            const c = s[i];
            if (/[\d.,]/.test(c)) { let j = i; while (j < s.length && /[\d.,]/.test(s[j])) j++; out.push({ t: 'n', v: lerNumero(s.slice(i, j)) }); i = j; }
            else if ('+-*/()%^'.includes(c)) { out.push({ t: c }); i++; }
            else throw new Error(`caractere "${c}"`);
        }
        return out;
    }
    function avaliar(expr) {
        const tk = tokens(expr); let p = 0;
        const ver = () => tk[p] && tk[p].t;
        // valor com flag pct (terminou em %): usado pra "a + b%" = a + a·b/100
        function primario() {
            let r;
            if (ver() === '-') { p++; r = primario(); return { v: -r.v, pct: r.pct }; }
            if (ver() === '+') { p++; return primario(); }
            if (ver() === 'n') r = { v: tk[p++].v, pct: false };
            else if (ver() === '(') { p++; r = { v: soma().v, pct: false }; if (ver() !== ')') throw new Error('falta )'); p++; }
            else throw new Error('conta incompleta');
            if (ver() === '^') { p++; const e = primario(); r = { v: Math.pow(r.v, e.v), pct: false }; }
            while (ver() === '%') { p++; r = { v: r.v, pct: true }; }
            return r;
        }
        function produto() {
            let a = primario();
            if (a.pct) a = { v: a.v / 100, pct: true };
            while (ver() === '*' || ver() === '/') {
                const op = tk[p++].t; let b = primario();
                const bv = b.pct ? b.v / 100 : b.v;
                if (op === '/' && bv === 0) throw new Error('divisão por zero');
                a = { v: op === '*' ? a.v * bv : a.v / bv, pct: false };
            }
            return a;
        }
        function soma() {
            let a = produto();
            while (ver() === '+' || ver() === '-') {
                const op = tk[p++].t; const b = produto();
                // b.pct (sozinho, ex. "10%") = porcentagem do valor à esquerda
                const bv = b.pct ? a.v * b.v : b.v;
                a = { v: op === '+' ? a.v + bv : a.v - bv, pct: false };
            }
            return a;
        }
        if (!tk.length) throw new Error('vazio');
        const r = soma();
        if (p < tk.length) throw new Error('conta inválida');
        return r.v;
    }

    // ---------- interface ----------
    function montar() {
        if (document.getElementById('calcRoot')) return;
        const css = document.createElement('style');
        css.textContent = `
            #calcFab { position: fixed; bottom: 20px; right: 130px; z-index: 70; height: 44px; padding: 0 14px; border-radius: 9999px;
                display: flex; align-items: center; gap: 8px; background: #0ea5e9; color: #082f49; font-weight: 800; font-size: 13px;
                border: 1px solid #38bdf8; box-shadow: 0 10px 25px -5px rgba(0,0,0,.6); cursor: pointer; transition: transform .15s; }
            #calcFab:hover { transform: translateY(-2px); }
            #calcRoot.aberto #calcFab { display: none; }
            #calcPainel { position: fixed; z-index: 73; width: 268px; background: #0f172a; border: 1px solid #0ea5e966; border-radius: 14px;
                box-shadow: 0 20px 45px -10px rgba(0,0,0,.75); display: none; flex-direction: column; color: #e2e8f0; overflow: hidden; }
            #calcRoot.aberto #calcPainel { display: flex; }
            #calcPainel.min #calcCorpo { display: none; }
            #calcTopo { display: flex; align-items: center; gap: 6px; padding: 8px 8px 8px 12px; background: #0c1a30; border-bottom: 1px solid #1e293b;
                cursor: move; user-select: none; -webkit-user-select: none; touch-action: none; }
            #calcPainel.min #calcTopo { border-bottom: 0; }
            .calc-ico { width: 28px; height: 28px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: #94a3b8;
                display: inline-flex; align-items: center; justify-content: center; font-size: 12px; cursor: pointer; }
            .calc-ico:hover, .calc-ico.ativo { color: #fff; background: #1e293b; border-color: #334155; }
            #calcCorpo { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
            #calcVisor { background: #020617; border: 1px solid #1e293b; border-radius: 10px; padding: 8px 10px; }
            #calcVisor:focus-within { border-color: #0ea5e9; }
            #calcExpr { width: 100%; background: transparent; border: 0; outline: none; color: #cbd5e1; font-size: 14px; text-align: right; font-family: ui-monospace, Menlo, monospace; }
            #calcRes { text-align: right; font-size: 24px; font-weight: 900; color: #fff; min-height: 30px; word-break: break-all; line-height: 1.2; }
            #calcRes.erro { color: #fda4af; font-size: 12px; font-weight: 700; }
            #calcTeclas { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
            .calc-k { height: 38px; border-radius: 9px; border: 1px solid #1e293b; background: #1e293b; color: #f1f5f9; font-weight: 800; font-size: 15px; cursor: pointer; }
            .calc-k:hover { border-color: #475569; background: #273449; }
            .calc-k.op { background: #0c4a6e; border-color: #075985; color: #bae6fd; }
            .calc-k.fn { background: #111827; color: #94a3b8; font-size: 13px; }
            .calc-k.ig { background: #0ea5e9; border-color: #38bdf8; color: #082f49; }
            .calc-acao { flex: 1; font-size: 11px; font-weight: 700; padding: 6px 8px; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: #cbd5e1;
                display: inline-flex; align-items: center; justify-content: center; gap: 5px; cursor: pointer; white-space: nowrap; }
            .calc-acao:hover { color: #fff; border-color: #475569; }
            #calcHist { max-height: 150px; overflow-y: auto; display: none; flex-direction: column; gap: 4px; }
            #calcHist.ver { display: flex; }
            .calc-h { text-align: right; padding: 5px 8px; border-radius: 8px; background: #0b1222; border: 1px solid #1e293b; cursor: pointer; }
            .calc-h:hover { border-color: #0ea5e9; }
            #calcAviso { font-size: 10px; font-weight: 700; color: #7dd3fc; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: opacity .3s; opacity: 0; }
            @media print { #calcRoot { display: none !important; } }
            @media (max-width: 640px) {
                #calcFab .calc-rotulo { display: none; } #calcFab { right: 84px; }
                #calcPainel { left: 8px !important; right: 8px !important; top: auto !important; bottom: 8px !important; width: auto !important; }
                #calcTopo { cursor: default; }
            }
        `;
        document.head.appendChild(css);

        const root = document.createElement('div');
        root.id = 'calcRoot';
        const teclas = [
            ['C', 'fn', 'limpar'], ['(', 'fn'], [')', 'fn'], ['⌫', 'fn', 'apagar'],
            ['7'], ['8'], ['9'], ['÷', 'op'],
            ['4'], ['5'], ['6'], ['×', 'op'],
            ['1'], ['2'], ['3'], ['−', 'op'],
            ['0'], [',', ''], ['%', 'op'], ['+', 'op']
        ];
        root.innerHTML = `
            <button id="calcFab" type="button" title="Calculadora"><i class="fa-solid fa-calculator"></i><span class="calc-rotulo">Calc</span></button>
            <section id="calcPainel" role="dialog" aria-label="Calculadora">
                <div id="calcTopo" title="Arraste para mover">
                    <i class="fa-solid fa-calculator" style="color:#38bdf8;font-size:12px"></i>
                    <span style="font-weight:900;font-size:11px;color:#fff;letter-spacing:.06em;text-transform:uppercase">Calculadora</span>
                    <span id="calcAviso"></span>
                    <button class="calc-ico" id="calcBtnHist" title="Histórico"><i class="fa-solid fa-clock-rotate-left"></i></button>
                    <button class="calc-ico" id="calcMin" title="Minimizar"><i class="fa-solid fa-minus"></i></button>
                    <button class="calc-ico" id="calcFechar" title="Fechar (Esc)"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div id="calcCorpo">
                    <div id="calcHist"></div>
                    <div id="calcVisor">
                        <input id="calcExpr" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0">
                        <div id="calcRes">0</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="calc-acao" id="calcCopiar" title="Copiar o resultado"><i class="fa-regular fa-copy"></i>Copiar</button>
                        <button class="calc-acao" id="calcSelecao" title="Usar o número selecionado no BI"><i class="fa-solid fa-i-cursor"></i>+ Seleção</button>
                    </div>
                    <div id="calcTeclas">
                        ${teclas.map(([k, cls, acao]) => `<button type="button" class="calc-k ${cls || ''}" data-k="${esc(k)}" ${acao ? `data-acao="${acao}"` : ''}>${k}</button>`).join('')}
                        <button type="button" class="calc-k ig" data-acao="igual" style="grid-column: span 4">=</button>
                    </div>
                </div>
            </section>`;
        document.body.appendChild(root);

        const painel = document.getElementById('calcPainel');
        const expr = document.getElementById('calcExpr');
        document.getElementById('calcFab').onclick = abrir;
        document.getElementById('calcFechar').onclick = fechar;
        document.getElementById('calcMin').onclick = alternarMin;
        document.getElementById('calcBtnHist').onclick = () => { document.getElementById('calcHist').classList.toggle('ver'); document.getElementById('calcBtnHist').classList.toggle('ativo'); renderHist(); posicionar(); };
        document.getElementById('calcCopiar').onclick = copiarResultado;
        document.getElementById('calcSelecao').onclick = usarSelecao;
        document.getElementById('calcTeclas').addEventListener('click', e => {
            const b = e.target.closest('.calc-k'); if (!b) return;
            const acao = b.dataset.acao;
            if (acao === 'limpar') { expr.value = ''; }
            else if (acao === 'apagar') { expr.value = expr.value.slice(0, -1); }
            else if (acao === 'igual') { igual(); return; }
            else inserir(b.dataset.k);
            atualizar();
        });
        expr.addEventListener('input', atualizar);
        expr.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); igual(); }
            else if (e.key === 'Escape') { e.preventDefault(); fechar(); }
        });
        document.getElementById('calcHist').addEventListener('click', e => {
            const h = e.target.closest('.calc-h'); if (!h) return;
            const item = historico[+h.dataset.i]; if (!item) return;
            expr.value = e.target.closest('.calc-h-conta') ? item.conta : item.resultado;
            atualizar(); expr.focus();
        });
        // Lembra o último texto selecionado no BI (fora da calculadora) pro "+ Seleção".
        document.addEventListener('selectionchange', () => {
            const sel = window.getSelection(); if (!sel || sel.isCollapsed) return;
            const no = sel.anchorNode; if (no && painel.contains(no.nodeType === 1 ? no : no.parentNode)) return;
            const t = sel.toString().trim(); if (t) ultimaSelecao = t;
        });
        prepararArrasto();
        window.addEventListener('resize', () => { if (estaAberto()) posicionar(); });
        alinharFab();
        const nf = document.getElementById('notasFab');
        if (nf && window.ResizeObserver) new ResizeObserver(alinharFab).observe(nf); else setTimeout(alinharFab, 800);
        window.addEventListener('resize', alinharFab);
    }

    // Fica sempre à esquerda do botão de Notas (que tem largura variável por causa do contador).
    function alinharFab() {
        const fab = document.getElementById('calcFab'), notas = document.getElementById('notasFab');
        if (!fab || ehCelular()) return;
        if (notas && notas.offsetWidth) fab.style.right = (20 + notas.offsetWidth + 10) + 'px';
    }

    function inserir(k) {
        const expr = document.getElementById('calcExpr');
        const ini = expr.selectionStart ?? expr.value.length, fim = expr.selectionEnd ?? expr.value.length;
        if (document.activeElement !== expr) { expr.value += k; return; }
        expr.value = expr.value.slice(0, ini) + k + expr.value.slice(fim);
        expr.setSelectionRange(ini + k.length, ini + k.length);
    }
    function calcular() {
        const v = document.getElementById('calcExpr').value.trim();
        if (!v) return { ok: true, valor: null };
        try { return { ok: true, valor: avaliar(v) }; } catch (e) { return { ok: false, erro: e.message }; }
    }
    function atualizar() {
        const res = document.getElementById('calcRes');
        const r = calcular();
        res.classList.toggle('erro', !r.ok);
        res.textContent = !r.ok ? '…' : r.valor == null ? '0' : formatar(r.valor);
        res.title = r.ok ? '' : r.erro;
    }
    function igual() {
        const expr = document.getElementById('calcExpr');
        const r = calcular();
        if (!r.ok) { const res = document.getElementById('calcRes'); res.classList.add('erro'); res.textContent = 'Conta inválida: ' + r.erro; return; }
        if (r.valor == null) return;
        const resultado = formatar(r.valor);
        if (expr.value.trim() !== resultado) {
            historico.unshift({ conta: expr.value.trim(), resultado });
            historico = historico.slice(0, 30); salvarHist(); renderHist();
        }
        expr.value = resultado; atualizar();
    }
    function renderHist() {
        const el = document.getElementById('calcHist'); if (!el || !el.classList.contains('ver')) return;
        el.innerHTML = historico.length
            ? historico.map((h, i) => `<div class="calc-h" data-i="${i}" title="Clique na conta ou no resultado para reaproveitar"><div class="calc-h-conta" style="font-size:10px;color:#64748b">${esc(h.conta)} =</div><div style="font-size:13px;font-weight:800;color:#e2e8f0">${esc(h.resultado)}</div></div>`).join('')
              + `<button class="calc-acao" id="calcLimparHist" style="flex:none"><i class="fa-regular fa-trash-can"></i>Limpar histórico</button>`
            : '<div style="font-size:11px;color:#64748b;text-align:center;padding:6px">Sem contas ainda.</div>';
        const b = document.getElementById('calcLimparHist');
        if (b) b.onclick = e => { e.stopPropagation(); historico = []; salvarHist(); renderHist(); };
    }
    async function copiarResultado() {
        const r = calcular();
        if (!r.ok || r.valor == null) { aviso('Nada para copiar'); return; }
        const txt = formatar(r.valor);
        try { await navigator.clipboard.writeText(txt); }
        catch (e) {
            const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) {} ta.remove();
        }
        aviso('Copiado: ' + txt);
    }
    function usarSelecao() {
        const m = /-?\s*(?:R\$\s*)?\d[\d.,]*/.exec(ultimaSelecao || '');
        if (!m) { aviso('Selecione um número no BI primeiro'); return; }
        let num = m[0].replace(/R\$|\s/g, '').replace(/[.,]$/, '');
        const expr = document.getElementById('calcExpr');
        const precisaOp = expr.value && /[\d)%]$/.test(expr.value.trim());
        expr.value = expr.value.trim() + (precisaOp ? '+' : '') + num;
        atualizar(); expr.focus();
        aviso('Adicionado: ' + num);
    }
    function aviso(msg) {
        const el = document.getElementById('calcAviso'); if (!el) return;
        el.textContent = msg; el.style.opacity = '1';
        clearTimeout(aviso._t); aviso._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
    }

    // ---------- janela ----------
    const estaAberto = () => document.getElementById('calcRoot').classList.contains('aberto');
    function abrir() {
        document.getElementById('calcRoot').classList.add('aberto');
        if (janela.min) { janela.min = false; salvarJanela(); }
        posicionar(); atualizar();
        setTimeout(() => document.getElementById('calcExpr').focus(), 30);
    }
    function fechar() { document.getElementById('calcRoot').classList.remove('aberto'); }
    function alternarMin() {
        janela.min = !janela.min; salvarJanela();
        const b = document.getElementById('calcMin');
        if (b) { b.title = janela.min ? 'Expandir' : 'Minimizar'; b.innerHTML = `<i class="fa-solid ${janela.min ? 'fa-up-right-and-down-left-from-center' : 'fa-minus'}"></i>`; }
        posicionar();
    }
    function posicionar() {
        const p = document.getElementById('calcPainel'); if (!p) return;
        p.classList.toggle('min', !!janela.min);
        if (ehCelular()) return;
        const vw = window.innerWidth, vh = window.innerHeight;
        const w = p.offsetWidth || 268, h = p.offsetHeight || 420;
        let x = janela.x == null ? vw - w - 380 : janela.x;
        let y = janela.y == null ? vh - h - 76 : janela.y;
        x = Math.min(Math.max(8, x), vw - w - 8);
        y = Math.min(Math.max(8, y), vh - h - 8);
        p.style.left = x + 'px'; p.style.top = y + 'px';
    }
    function prepararArrasto() {
        const topo = document.getElementById('calcTopo'), p = document.getElementById('calcPainel');
        let ini = null;
        topo.addEventListener('pointerdown', e => {
            if (ehCelular() || e.button !== 0 || e.target.closest('button')) return;
            const r = p.getBoundingClientRect();
            ini = { dx: e.clientX - r.left, dy: e.clientY - r.top };
            topo.setPointerCapture(e.pointerId); e.preventDefault();
        });
        topo.addEventListener('pointermove', e => {
            if (!ini) return;
            const x = Math.min(Math.max(8, e.clientX - ini.dx), window.innerWidth - p.offsetWidth - 8);
            const y = Math.min(Math.max(8, e.clientY - ini.dy), window.innerHeight - p.offsetHeight - 8);
            p.style.left = x + 'px'; p.style.top = y + 'px';
        });
        const soltar = () => { if (!ini) return; ini = null; janela.x = parseInt(p.style.left, 10); janela.y = parseInt(p.style.top, 10); salvarJanela(); };
        topo.addEventListener('pointerup', soltar);
        topo.addEventListener('pointercancel', soltar);
        topo.addEventListener('dblclick', e => { if (!e.target.closest('button')) alternarMin(); });
    }

    window.calcAvaliar = avaliar; // usado só pra teste no console
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
