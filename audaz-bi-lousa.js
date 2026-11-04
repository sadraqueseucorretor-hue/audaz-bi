// =====================================================================================
// LOUSA (04/11/2026) — quadro para desenhar e escrever com o mouse (ou dedo/caneta), de
// QUALQUER aba do BI. Botão "Lousa" à esquerda da Calculadora.
// - Ferramentas: caneta, marca-texto, borracha, texto (clica onde quer escrever), linha, seta,
//   retângulo; cores, espessura, desfazer/refazer (Cmd/Ctrl+Z / Shift+Z), limpar.
// - Fundo escuro, branco ou quadriculado. Janela flutuante (arrasta pelo topo, redimensiona pelo
//   canto) ou tela cheia. "Baixar" salva PNG; "Copiar" põe a imagem na área de transferência.
// - O desenho fica salvo SÓ neste navegador (localStorage `<appId>-lousa`) — não vai pra nuvem.
// =====================================================================================
(function () {
    const PREFIXO = typeof appId !== 'undefined' ? appId : 'audaz-bi-v1';
    const LS_DESENHO = `${PREFIXO}-lousa`;
    const LS_JANELA = `${PREFIXO}-lousa-janela`;
    const CORES = ['#f8fafc', '#facc15', '#f87171', '#4ade80', '#38bdf8', '#c084fc', '#fb923c', '#0f172a'];
    const FUNDOS = { escuro: '#0b1222', branco: '#ffffff', quadriculado: '#0b1222' };
    let janela = { x: null, y: null, w: 720, h: 480, cheia: false, fundo: 'escuro' };
    let ferramenta = 'caneta', cor = CORES[1], espessura = 4;
    let canvas, ctx, desenhando = false, ini = null, ultimo = null, snapshotForma = null;
    let historico = [], refazer = [];
    let canvasIniciado = false;
    const LIMITE_HIST = 40;
    const ehCelular = () => window.innerWidth < 640;

    try { Object.assign(janela, JSON.parse(localStorage.getItem(LS_JANELA) || '{}')); } catch (e) {}
    const salvarJanela = () => { try { localStorage.setItem(LS_JANELA, JSON.stringify(janela)); } catch (e) {} };

    function montar() {
        if (document.getElementById('lousaRoot')) return;
        const css = document.createElement('style');
        css.textContent = `
            #lousaFab { position: fixed; bottom: 20px; right: 230px; z-index: 70; height: 44px; padding: 0 14px; border-radius: 9999px;
                display: flex; align-items: center; gap: 8px; background: #a855f7; color: #1e0b33; font-weight: 800; font-size: 13px;
                border: 1px solid #c084fc; box-shadow: 0 10px 25px -5px rgba(0,0,0,.6); cursor: pointer; transition: transform .15s; }
            #lousaFab:hover { transform: translateY(-2px); }
            #lousaRoot.aberto #lousaFab { display: none; }
            #lousaPainel { position: fixed; z-index: 74; background: #0f172a; border: 1px solid #a855f766; border-radius: 14px;
                box-shadow: 0 20px 45px -10px rgba(0,0,0,.8); display: none; flex-direction: column; overflow: hidden;
                resize: both; min-width: 360px; min-height: 280px; max-width: 98vw; max-height: 96vh; }
            #lousaRoot.aberto #lousaPainel { display: flex; }
            #lousaPainel.cheia { left: 8px !important; top: 8px !important; width: calc(100vw - 16px) !important; height: calc(100vh - 16px) !important; resize: none; }
            #lousaTopo { display: flex; align-items: center; gap: 6px; padding: 6px 8px 6px 12px; background: #1a1030; border-bottom: 1px solid #1e293b;
                cursor: move; user-select: none; -webkit-user-select: none; touch-action: none; }
            #lousaPainel.cheia #lousaTopo { cursor: default; }
            #lousaBarra { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px 8px; background: #0c1426; border-bottom: 1px solid #1e293b; }
            .lousa-b { height: 30px; min-width: 30px; padding: 0 7px; border-radius: 8px; border: 1px solid #1e293b; background: #111c33; color: #cbd5e1;
                display: inline-flex; align-items: center; justify-content: center; gap: 5px; font-size: 12px; font-weight: 700; cursor: pointer; }
            .lousa-b:hover { border-color: #475569; color: #fff; }
            .lousa-b.ativo { border-color: #c084fc; background: rgba(168,85,247,.18); color: #fff; }
            .lousa-cor { width: 22px; height: 22px; border-radius: 9999px; border: 2px solid #334155; cursor: pointer; padding: 0; }
            .lousa-cor.ativo { border-color: #fff; box-shadow: 0 0 0 2px #a855f7; }
            .lousa-sep { width: 1px; height: 22px; background: #1e293b; margin: 0 3px; }
            #lousaArea { position: relative; flex: 1; min-height: 0; overflow: hidden; }
            #lousaCanvas { position: absolute; left: 0; top: 0; touch-action: none; cursor: crosshair; }
            #lousaArea.quadriculado { background-image: linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(90deg, #1e293b 1px, transparent 1px); background-size: 24px 24px; }
            #lousaTexto { position: absolute; z-index: 2; min-width: 120px; background: rgba(15,23,42,.85); border: 1px dashed #c084fc; border-radius: 6px;
                outline: none; padding: 2px 6px; font-family: Inter, system-ui, sans-serif; font-weight: 700; display: none; }
            #lousaAviso { font-size: 10px; font-weight: 700; color: #d8b4fe; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: opacity .3s; opacity: 0; }
            @media print { #lousaRoot { display: none !important; } }
            @media (max-width: 640px) {
                #lousaFab .lousa-rotulo { display: none; } #lousaFab { right: 148px; }
                #lousaPainel { left: 4px !important; top: 4px !important; width: calc(100vw - 8px) !important; height: calc(100vh - 8px) !important; resize: none; min-width: 0; }
            }
        `;
        document.head.appendChild(css);

        const ferr = [
            ['caneta', 'fa-pen', 'Caneta'], ['marca', 'fa-highlighter', 'Marca-texto'], ['borracha', 'fa-eraser', 'Borracha'],
            ['texto', 'fa-font', 'Texto: clique onde quer escrever'], ['linha', 'fa-minus', 'Linha'], ['seta', 'fa-arrow-right-long', 'Seta'], ['ret', 'fa-square', 'Retângulo']
        ];
        const root = document.createElement('div');
        root.id = 'lousaRoot';
        root.innerHTML = `
            <button id="lousaFab" type="button" title="Lousa — desenhar e escrever"><i class="fa-solid fa-chalkboard"></i><span class="lousa-rotulo">Lousa</span></button>
            <section id="lousaPainel" role="dialog" aria-label="Lousa">
                <div id="lousaTopo" title="Arraste para mover">
                    <i class="fa-solid fa-chalkboard" style="color:#c084fc;font-size:12px"></i>
                    <span style="font-weight:900;font-size:11px;color:#fff;letter-spacing:.06em;text-transform:uppercase">Lousa</span>
                    <span id="lousaAviso"></span>
                    <button class="lousa-b" id="lousaCopiar" title="Copiar imagem"><i class="fa-regular fa-copy"></i></button>
                    <button class="lousa-b" id="lousaBaixar" title="Baixar PNG"><i class="fa-solid fa-download"></i></button>
                    <button class="lousa-b" id="lousaCheia" title="Tela cheia"><i class="fa-solid fa-expand"></i></button>
                    <button class="lousa-b" id="lousaFechar" title="Fechar (Esc)"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div id="lousaBarra">
                    ${ferr.map(([k, ico, t]) => `<button class="lousa-b" data-ferr="${k}" title="${t}"><i class="fa-solid ${ico}"></i></button>`).join('')}
                    <span class="lousa-sep"></span>
                    ${CORES.map(c => `<button class="lousa-cor" data-cor="${c}" title="Cor" style="background:${c}"></button>`).join('')}
                    <span class="lousa-sep"></span>
                    <input id="lousaEsp" type="range" min="1" max="30" value="${espessura}" title="Espessura" style="width:80px;accent-color:#a855f7">
                    <span class="lousa-sep"></span>
                    <button class="lousa-b" id="lousaDesfazer" title="Desfazer (Cmd/Ctrl+Z)"><i class="fa-solid fa-rotate-left"></i></button>
                    <button class="lousa-b" id="lousaRefazer" title="Refazer (Cmd/Ctrl+Shift+Z)"><i class="fa-solid fa-rotate-right"></i></button>
                    <select id="lousaFundo" class="lousa-b" title="Fundo" style="padding:0 4px">
                        <option value="escuro">Fundo escuro</option><option value="branco">Fundo branco</option><option value="quadriculado">Quadriculado</option>
                    </select>
                    <button class="lousa-b" id="lousaLimpar" title="Limpar tudo"><i class="fa-regular fa-trash-can"></i>Limpar</button>
                </div>
                <div id="lousaArea"><canvas id="lousaCanvas"></canvas><div id="lousaTexto" contenteditable="true" spellcheck="false"></div></div>
            </section>`;
        document.body.appendChild(root);

        canvas = document.getElementById('lousaCanvas');
        ctx = canvas.getContext('2d');
        document.getElementById('lousaFab').onclick = abrir;
        document.getElementById('lousaFechar').onclick = fechar;
        document.getElementById('lousaCheia').onclick = () => { janela.cheia = !janela.cheia; salvarJanela(); posicionar(); };
        document.getElementById('lousaLimpar').onclick = () => { confirmarTexto(); empilhar(); pintarFundo(); salvarDesenho(); aviso('Lousa limpa — Cmd/Ctrl+Z desfaz'); };
        document.getElementById('lousaDesfazer').onclick = desfazer;
        document.getElementById('lousaRefazer').onclick = refazerAcao;
        document.getElementById('lousaBaixar').onclick = baixar;
        document.getElementById('lousaCopiar').onclick = copiar;
        document.getElementById('lousaEsp').oninput = e => { espessura = +e.target.value; };
        const fundoSel = document.getElementById('lousaFundo');
        fundoSel.value = janela.fundo;
        fundoSel.onchange = () => trocarFundo(fundoSel.value);
        document.getElementById('lousaBarra').addEventListener('click', e => {
            const f = e.target.closest('[data-ferr]'); if (f) { confirmarTexto(); ferramenta = f.dataset.ferr; marcarAtivos(); return; }
            const c = e.target.closest('[data-cor]'); if (c) { cor = c.dataset.cor; const t = document.getElementById('lousaTexto'); if (t.style.display === 'block') t.style.color = cor; if (ferramenta === 'borracha') ferramenta = 'caneta'; marcarAtivos(); }
        });
        prepararDesenho();
        prepararArrasto();
        document.addEventListener('keydown', teclas);
        const painel = document.getElementById('lousaPainel');
        if (window.ResizeObserver) {
            let t = null;
            new ResizeObserver(() => {
                if (!estaAberto()) return;
                ajustarCanvas();
                if (janela.cheia || ehCelular()) return;
                clearTimeout(t); t = setTimeout(() => { janela.w = painel.offsetWidth; janela.h = painel.offsetHeight; salvarJanela(); }, 250);
            }).observe(painel);
        }
        window.addEventListener('resize', () => { if (estaAberto()) posicionar(); alinharFab(); });
        marcarAtivos();
        alinharFab();
        const calc = document.getElementById('calcFab'), notas = document.getElementById('notasFab');
        if (window.ResizeObserver) [calc, notas].forEach(el => el && new ResizeObserver(alinharFab).observe(el));
        if (calc && window.MutationObserver) new MutationObserver(alinharFab).observe(calc, { attributes: true, attributeFilter: ['style'] });
        setTimeout(alinharFab, 600);
    }

    // Fica à esquerda da Calculadora (que fica à esquerda de Notas).
    function alinharFab() {
        const fab = document.getElementById('lousaFab'); if (!fab || ehCelular()) return;
        const ref = document.getElementById('calcFab') || document.getElementById('notasFab');
        if (!ref || !ref.offsetWidth) return;
        const r = ref.getBoundingClientRect();
        fab.style.right = Math.round(window.innerWidth - r.left + 10) + 'px';
    }
    function marcarAtivos() {
        document.querySelectorAll('#lousaBarra [data-ferr]').forEach(b => b.classList.toggle('ativo', b.dataset.ferr === ferramenta));
        document.querySelectorAll('#lousaBarra [data-cor]').forEach(b => b.classList.toggle('ativo', b.dataset.cor === cor && ferramenta !== 'borracha'));
        canvas.style.cursor = ferramenta === 'texto' ? 'text' : ferramenta === 'borracha' ? 'cell' : 'crosshair';
    }

    // ---------- canvas ----------
    function corFundo() { return FUNDOS[janela.fundo] || FUNDOS.escuro; }
    function pintarFundo() {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (janela.fundo === 'quadriculado') ctx.clearRect(0, 0, canvas.width, canvas.height);
        else { ctx.fillStyle = corFundo(); ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.restore();
    }
    function trocarFundo(novo) {
        // Repinta o que já foi desenhado sobre o fundo novo (mantém os traços).
        const antigo = janela.fundo;
        janela.fundo = novo; salvarJanela();
        document.getElementById('lousaArea').classList.toggle('quadriculado', novo === 'quadriculado');
        const img = canvas.toDataURL();
        const im = new Image();
        im.onload = () => {
            pintarFundo();
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
            if (antigo !== 'quadriculado' && novo === 'quadriculado') { ctx.drawImage(im, 0, 0); removerCor(FUNDOS[antigo]); }
            else if (antigo === 'quadriculado' || FUNDOS[antigo] === FUNDOS[novo]) ctx.drawImage(im, 0, 0);
            else { const tmp = document.createElement('canvas'); tmp.width = canvas.width; tmp.height = canvas.height; const t = tmp.getContext('2d'); t.drawImage(im, 0, 0); trocarCorPixels(t, FUNDOS[antigo], FUNDOS[novo]); ctx.drawImage(tmp, 0, 0); }
            ctx.restore(); salvarDesenho();
        };
        im.src = img;
    }
    const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    function trocarCorPixels(c, de, para) {
        const d = c.getImageData(0, 0, canvas.width, canvas.height), a = hexRgb(de), b = hexRgb(para);
        for (let i = 0; i < d.data.length; i += 4) if (d.data[i] === a[0] && d.data[i + 1] === a[1] && d.data[i + 2] === a[2]) { d.data[i] = b[0]; d.data[i + 1] = b[1]; d.data[i + 2] = b[2]; }
        c.putImageData(d, 0, 0);
    }
    function removerCor(de) {
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height), a = hexRgb(de);
        for (let i = 0; i < d.data.length; i += 4) if (d.data[i] === a[0] && d.data[i + 1] === a[1] && d.data[i + 2] === a[2]) d.data[i + 3] = 0;
        ctx.putImageData(d, 0, 0);
    }
    function ajustarCanvas() {
        const area = document.getElementById('lousaArea');
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(area.clientWidth * dpr)), h = Math.max(1, Math.round(area.clientHeight * dpr));
        if (canvas.width === w && canvas.height === h) return;
        // Preserva o desenho ao redimensionar (a lousa só cresce; encolher não corta o que existe).
        const old = canvasIniciado ? canvas.toDataURL() : null;
        canvas.width = canvasIniciado ? Math.max(w, canvas.width) : w; canvas.height = canvasIniciado ? Math.max(h, canvas.height) : h;
        const primeira = !canvasIniciado; canvasIniciado = true;
        canvas.style.width = (canvas.width / dpr) + 'px'; canvas.style.height = (canvas.height / dpr) + 'px';
        const src = primeira ? carregarDesenho() : old;
        if (!src) { pintarFundo(); return; }
        // A imagem carrega de forma assíncrona: desenha POR BAIXO (destination-over) pra não apagar
        // traços feitos enquanto ela carregava; o fundo entra por último, também por baixo.
        const im = new Image();
        im.onload = () => {
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'destination-over'; ctx.globalAlpha = 1;
            ctx.drawImage(im, 0, 0);
            if (janela.fundo !== 'quadriculado') { ctx.fillStyle = corFundo(); ctx.fillRect(0, 0, canvas.width, canvas.height); }
            ctx.restore();
        };
        im.onerror = () => pintarFundo();
        im.src = src;
    }
    function carregarDesenho() { try { return localStorage.getItem(LS_DESENHO); } catch (e) { return null; } }
    let salvarT = null;
    function salvarDesenho() {
        clearTimeout(salvarT);
        salvarT = setTimeout(() => {
            try { localStorage.setItem(LS_DESENHO, canvas.toDataURL('image/png')); }
            catch (e) { aviso('Lousa muito grande para salvar no navegador — baixe o PNG'); }
        }, 400);
    }
    function empilhar() {
        try { historico.push(ctx.getImageData(0, 0, canvas.width, canvas.height)); } catch (e) { return; }
        if (historico.length > LIMITE_HIST) historico.shift();
        refazer = [];
    }
    function desfazer() {
        confirmarTexto();
        if (!historico.length) { aviso('Nada para desfazer'); return; }
        refazer.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        restaurar(historico.pop());
    }
    function refazerAcao() {
        if (!refazer.length) { aviso('Nada para refazer'); return; }
        historico.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        restaurar(refazer.pop());
    }
    function restaurar(img) {
        if (img.width !== canvas.width || img.height !== canvas.height) { pintarFundo(); }
        ctx.putImageData(img, 0, 0); salvarDesenho();
    }

    function ponto(e) {
        const r = canvas.getBoundingClientRect(), dpr = canvas.width / r.width;
        return { x: (e.clientX - r.left) * dpr, y: (e.clientY - r.top) * dpr, p: e.pressure && e.pointerType === 'pen' ? e.pressure : 0.5 };
    }
    function estilo() {
        const dpr = window.devicePixelRatio || 1;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        if (ferramenta === 'borracha') {
            ctx.lineWidth = espessura * 4 * dpr;
            if (janela.fundo === 'quadriculado') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; }
            else ctx.strokeStyle = corFundo();
        } else if (ferramenta === 'marca') {
            ctx.lineWidth = espessura * 4 * dpr; ctx.strokeStyle = cor; ctx.globalAlpha = 0.35; ctx.lineCap = 'butt';
        } else { ctx.lineWidth = espessura * dpr; ctx.strokeStyle = cor; ctx.fillStyle = cor; }
    }
    function prepararDesenho() {
        canvas.addEventListener('pointerdown', e => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            const p = ponto(e);
            if (ferramenta === 'texto') { e.preventDefault(); abrirTexto(e, p); return; }
            confirmarTexto();
            empilhar();
            desenhando = true; ini = p; ultimo = p;
            try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
            if (ferramenta === 'marca') snapshotForma = ctx.getImageData(0, 0, canvas.width, canvas.height);
            if (['linha', 'seta', 'ret'].includes(ferramenta)) snapshotForma = ctx.getImageData(0, 0, canvas.width, canvas.height);
            else { estilo(); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.01, p.y + 0.01); ctx.stroke(); }
            pontosMarca = [p];
        });
        canvas.addEventListener('pointermove', e => {
            if (!desenhando) return;
            let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; if (!evs.length) evs = [e];
            if (['linha', 'seta', 'ret'].includes(ferramenta)) { forma(ponto(e)); return; }
            if (ferramenta === 'marca') {
                // Marca-texto: redesenha o traço inteiro com transparência uniforme (sem "manchas" nas sobreposições).
                evs.forEach(ev => pontosMarca.push(ponto(ev)));
                ctx.putImageData(snapshotForma, 0, 0); estilo();
                ctx.beginPath(); ctx.moveTo(pontosMarca[0].x, pontosMarca[0].y); pontosMarca.forEach(q => ctx.lineTo(q.x, q.y)); ctx.stroke();
                ctx.globalAlpha = 1; return;
            }
            estilo();
            evs.forEach(ev => {
                const p = ponto(ev);
                ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y);
                const mx = (ultimo.x + p.x) / 2, my = (ultimo.y + p.y) / 2;
                ctx.quadraticCurveTo(ultimo.x, ultimo.y, mx, my); ctx.lineTo(p.x, p.y); ctx.stroke();
                ultimo = p;
            });
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        });
        const fim = e => {
            if (!desenhando) return;
            if (['linha', 'seta', 'ret'].includes(ferramenta) && e && e.clientX != null && snapshotForma) forma(ponto(e));
            desenhando = false; snapshotForma = null; pontosMarca = [];
            ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
            salvarDesenho();
        };
        canvas.addEventListener('pointerup', fim);
        canvas.addEventListener('pointercancel', fim);
    }
    let pontosMarca = [];
    function forma(p) {
        ctx.putImageData(snapshotForma, 0, 0); estilo();
        ctx.beginPath();
        if (ferramenta === 'ret') ctx.strokeRect(ini.x, ini.y, p.x - ini.x, p.y - ini.y);
        else {
            ctx.moveTo(ini.x, ini.y); ctx.lineTo(p.x, p.y); ctx.stroke();
            if (ferramenta === 'seta') {
                const ang = Math.atan2(p.y - ini.y, p.x - ini.x), tam = Math.max(12, ctx.lineWidth * 3.5);
                ctx.beginPath(); ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - tam * Math.cos(ang - Math.PI / 7), p.y - tam * Math.sin(ang - Math.PI / 7));
                ctx.lineTo(p.x - tam * Math.cos(ang + Math.PI / 7), p.y - tam * Math.sin(ang + Math.PI / 7));
                ctx.closePath(); ctx.fillStyle = cor; ctx.fill();
            }
        }
    }

    // ---------- texto ----------
    let textoPos = null;
    function tamanhoFonte() { return Math.max(14, espessura * 4); }
    function abrirTexto(e, p) {
        confirmarTexto();
        const t = document.getElementById('lousaTexto'), area = document.getElementById('lousaArea').getBoundingClientRect();
        textoPos = p;
        t.style.left = (e.clientX - area.left) + 'px';
        t.style.top = (e.clientY - area.top - tamanhoFonte() * 0.6) + 'px';
        t.style.fontSize = tamanhoFonte() + 'px';
        t.style.color = cor; t.textContent = ''; t.style.display = 'block';
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        const focar = () => { t.focus(); const sel = window.getSelection(); if (sel) { const rg = document.createRange(); rg.selectNodeContents(t); rg.collapse(false); sel.removeAllRanges(); sel.addRange(rg); } };
        focar(); setTimeout(focar, 30); setTimeout(focar, 150);
    }
    function confirmarTexto() {
        const t = document.getElementById('lousaTexto');
        if (!t || t.style.display !== 'block') return false;
        const txt = t.innerText.replace(/\n$/, '');
        t.style.display = 'none';
        if (!txt.trim() || !textoPos) return false;
        empilhar();
        const dpr = window.devicePixelRatio || 1, fs = parseFloat(t.style.fontSize) * dpr;
        ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.fillStyle = t.style.color || cor; ctx.font = `700 ${fs}px Inter, system-ui, sans-serif`; ctx.textBaseline = 'middle';
        txt.split('\n').forEach((linha, i) => ctx.fillText(linha, textoPos.x + 6 * dpr, textoPos.y + i * fs * 1.25));
        ctx.restore();
        textoPos = null; salvarDesenho();
        return true;
    }

    // ---------- exportar ----------
    function imagemFinal() {
        // Achata o fundo (quadriculado vira escuro liso) pra exportar.
        const tmp = document.createElement('canvas'); tmp.width = canvas.width; tmp.height = canvas.height;
        const t = tmp.getContext('2d');
        t.fillStyle = janela.fundo === 'branco' ? '#ffffff' : '#0b1222'; t.fillRect(0, 0, tmp.width, tmp.height);
        t.drawImage(canvas, 0, 0);
        return tmp;
    }
    function baixar() {
        confirmarTexto();
        const a = document.createElement('a');
        a.href = imagemFinal().toDataURL('image/png');
        a.download = `lousa-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        aviso('PNG baixado');
    }
    function copiar() {
        confirmarTexto();
        if (!navigator.clipboard || !window.ClipboardItem) { aviso('Navegador não deixa copiar imagem — use Baixar'); return; }
        imagemFinal().toBlob(b => navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(() => aviso('Imagem copiada — cole no WhatsApp/e-mail')).catch(() => aviso('Não deu pra copiar — use Baixar')));
    }

    function teclas(e) {
        if (!estaAberto()) return;
        const t = document.getElementById('lousaTexto');
        const editandoTexto = document.activeElement === t;
        if (e.key === 'Escape') { if (editandoTexto) { confirmarTexto(); e.preventDefault(); return; } if (document.getElementById('lousaPainel').contains(document.activeElement) || document.activeElement === document.body) fechar(); return; }
        if (editandoTexto) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmarTexto(); } return; }
        const alvoCampo = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '') && document.activeElement.id !== 'lousaEsp';
        if (alvoCampo) return;
        if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? refazerAcao() : desfazer(); return; }
    }
    function aviso(msg) {
        const el = document.getElementById('lousaAviso'); if (!el) return;
        el.textContent = msg; el.style.opacity = '1';
        clearTimeout(aviso._t); aviso._t = setTimeout(() => { el.style.opacity = '0'; }, 2200);
    }

    // ---------- janela ----------
    const estaAberto = () => document.getElementById('lousaRoot').classList.contains('aberto');
    function abrir() {
        document.getElementById('lousaRoot').classList.add('aberto');
        document.getElementById('lousaArea').classList.toggle('quadriculado', janela.fundo === 'quadriculado');
        posicionar();
        ajustarCanvas();
    }
    function fechar() { confirmarTexto(); salvarDesenho(); document.getElementById('lousaRoot').classList.remove('aberto'); }
    function posicionar() {
        const p = document.getElementById('lousaPainel'); if (!p) return;
        p.classList.toggle('cheia', !!janela.cheia);
        const b = document.getElementById('lousaCheia');
        if (b) { b.title = janela.cheia ? 'Sair da tela cheia' : 'Tela cheia'; b.innerHTML = `<i class="fa-solid ${janela.cheia ? 'fa-compress' : 'fa-expand'}"></i>`; }
        if (janela.cheia || ehCelular()) { ajustarCanvas(); return; }
        const vw = window.innerWidth, vh = window.innerHeight;
        const w = Math.min(Math.max(janela.w || 720, 360), vw - 16), h = Math.min(Math.max(janela.h || 480, 280), vh - 16);
        p.style.width = w + 'px'; p.style.height = h + 'px';
        let x = janela.x == null ? (vw - w) / 2 : janela.x, y = janela.y == null ? (vh - h) / 2 : janela.y;
        x = Math.min(Math.max(8, x), vw - w - 8); y = Math.min(Math.max(8, y), vh - h - 8);
        p.style.left = x + 'px'; p.style.top = y + 'px';
        ajustarCanvas();
    }
    function prepararArrasto() {
        const topo = document.getElementById('lousaTopo'), p = document.getElementById('lousaPainel');
        let ini2 = null;
        topo.addEventListener('pointerdown', e => {
            if (janela.cheia || ehCelular() || e.button !== 0 || e.target.closest('button')) return;
            const r = p.getBoundingClientRect(); ini2 = { dx: e.clientX - r.left, dy: e.clientY - r.top };
            topo.setPointerCapture(e.pointerId); e.preventDefault();
        });
        topo.addEventListener('pointermove', e => {
            if (!ini2) return;
            p.style.left = Math.min(Math.max(8, e.clientX - ini2.dx), window.innerWidth - p.offsetWidth - 8) + 'px';
            p.style.top = Math.min(Math.max(8, e.clientY - ini2.dy), window.innerHeight - p.offsetHeight - 8) + 'px';
        });
        const soltar = () => { if (!ini2) return; ini2 = null; janela.x = parseInt(p.style.left, 10); janela.y = parseInt(p.style.top, 10); salvarJanela(); };
        topo.addEventListener('pointerup', soltar); topo.addEventListener('pointercancel', soltar);
        topo.addEventListener('dblclick', e => { if (!e.target.closest('button')) { janela.cheia = !janela.cheia; salvarJanela(); posicionar(); } });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
