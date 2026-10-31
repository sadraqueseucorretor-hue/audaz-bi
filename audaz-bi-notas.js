// =====================================================================================
// NOTAS (31/10/2026) — bloco de anotações que abre de QUALQUER aba do BI.
// Botão flutuante no canto inferior direito (ou atalho Ctrl/Cmd + Shift + Y) abre uma JANELINHA
// flutuante e compacta: arrasta pelo topo, redimensiona pelo canto, minimiza. Sem fundo escuro —
// o BI continua clicável/selecionável por trás, pra copiar nomes e números pra nota.
// "+ Seleção" joga na nota o último texto selecionado no BI (fora da janela).
// Várias notas: criar, editar (salva sozinho), buscar, copiar, fixar e excluir.
//
// Onde fica salvo: SÓ neste navegador (localStorage `<appId>-notas`). De propósito NÃO vai pro
// Firestore: o documento config/settings hoje é legível por qualquer um (regras abertas) e nota
// pode ter nome/telefone/valor de cliente. Pra levar pra outro computador: "Exportar" / "Importar".
// Posição/tamanho/minimizado da janela: `<appId>-notas-janela`.
// Módulo independente — não depende de nada do resto do BI além do `appId` (se existir).
// =====================================================================================
(function () {
    const PREFIXO = typeof appId !== 'undefined' ? appId : 'audaz-bi-v1';
    const LS_KEY = `${PREFIXO}-notas`;
    const LS_JANELA = `${PREFIXO}-notas-janela`;
    let notas = [];          // [{ id, titulo, texto, criadaEm, atualizadaEm, fixada }]
    let notaAtualId = null;
    let busca = '';
    let salvarTimer = null;
    let modo = 'editor';     // 'editor' | 'lista'
    let ultimaSelecao = '';  // último texto selecionado no BI (fora da janela)
    let janela = { x: null, y: null, w: 340, h: 420, min: false };

    // ---------- persistência ----------
    function carregar() {
        try {
            const v = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
            notas = Array.isArray(v) ? v : [];
        } catch (e) { notas = []; }
    }
    function salvar() {
        try { localStorage.setItem(LS_KEY, JSON.stringify(notas)); }
        catch (e) { aviso('Não deu pra salvar (armazenamento do navegador cheio ou bloqueado).', true); }
    }
    function carregarJanela() {
        try { Object.assign(janela, JSON.parse(localStorage.getItem(LS_JANELA) || '{}')); } catch (e) {}
    }
    function salvarJanela() {
        try { localStorage.setItem(LS_JANELA, JSON.stringify(janela)); } catch (e) {}
    }

    // ---------- utilidades ----------
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const novoId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ehCelular = () => window.innerWidth < 640;
    function quando(iso) {
        const d = new Date(iso); if (isNaN(d)) return '';
        const hoje = new Date(); const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
        const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        if (d.toDateString() === hoje.toDateString()) return `hoje ${hm}`;
        if (d.toDateString() === ontem.toDateString()) return `ontem ${hm}`;
        return d.toLocaleDateString('pt-BR') + ' ' + hm;
    }
    const tituloDe = n => (n.titulo || '').trim() || ((n.texto || '').trim().split('\n')[0].slice(0, 60)) || 'Nota sem título';
    function aviso(msg, erro) {
        const el = document.getElementById('notasAviso');
        if (el && estaAberto()) { el.textContent = msg; el.style.color = erro ? '#fda4af' : '#fbbf24'; el.style.opacity = '1'; clearTimeout(aviso._t); aviso._t = setTimeout(() => { el.style.opacity = '0'; }, 1800); return; }
        if (typeof showToast === 'function') showToast(msg, !!erro);
    }
    async function copiarTexto(txt) {
        try { await navigator.clipboard.writeText(txt); return true; }
        catch (e) {
            const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
            ta.remove(); return ok;
        }
    }

    // ---------- interface ----------
    function montar() {
        if (document.getElementById('notasRoot')) return;
        carregarJanela();
        const css = document.createElement('style');
        css.textContent = `
            #notasFab { position: fixed; right: 20px; bottom: 20px; z-index: 70; height: 44px; padding: 0 14px; border-radius: 9999px;
                display: flex; align-items: center; gap: 8px; background: #f59e0b; color: #1c1917; font-weight: 800; font-size: 13px;
                border: 1px solid #fbbf24; box-shadow: 0 10px 25px -5px rgba(0,0,0,.6); cursor: pointer; transition: transform .15s; }
            #notasFab:hover { transform: translateY(-2px); }
            #notasFab .notas-badge { background: #1c1917; color: #fbbf24; border-radius: 9999px; font-size: 10px; padding: 1px 7px; }
            #notasRoot.aberto #notasFab { display: none; }
            #notasPainel { position: fixed; z-index: 72; background: #0f172a; border: 1px solid #f59e0b66; border-radius: 14px;
                box-shadow: 0 20px 45px -10px rgba(0,0,0,.75); display: none; flex-direction: column; color: #e2e8f0;
                overflow: hidden; resize: both; min-width: 260px; min-height: 220px; max-width: 95vw; max-height: 92vh; }
            #notasRoot.aberto #notasPainel { display: flex; }
            #notasPainel.min { resize: none; min-height: 0; height: auto !important; }
            #notasPainel.min #notasCorpo { display: none; }
            #notasPainel button { cursor: pointer; }
            #notasTopo { display: flex; align-items: center; gap: 6px; padding: 8px 8px 8px 12px; background: #111c33; border-bottom: 1px solid #1e293b;
                cursor: move; user-select: none; -webkit-user-select: none; touch-action: none; }
            #notasPainel.min #notasTopo { border-bottom: 0; }
            .notas-ico { width: 28px; height: 28px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: #94a3b8;
                display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
            .notas-ico:hover { color: #fff; background: #1e293b; border-color: #334155; }
            .notas-ico.ativo { color: #fbbf24; background: rgba(245,158,11,.12); border-color: #f59e0b55; }
            .notas-btn { font-size: 11px; font-weight: 700; padding: 5px 8px; border-radius: 7px; border: 1px solid #334155; background: #1e293b; color: #cbd5e1; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
            .notas-btn:hover { color: #fff; border-color: #475569; }
            .notas-btn.primario { background: #f59e0b; border-color: #fbbf24; color: #1c1917; }
            .notas-btn.perigo:hover { color: #fda4af; border-color: #e11d48; }
            #notasCorpo { flex: 1; min-height: 0; display: flex; flex-direction: column; }
            .notas-item { padding: 8px 10px; border-radius: 9px; border: 1px solid #1e293b; background: #0b1222; cursor: pointer; }
            .notas-item:hover { border-color: #334155; }
            .notas-item.ativo { border-color: #f59e0b; background: rgba(245,158,11,.08); }
            #notasTexto { flex: 1; resize: none; background: #020617; border: 1px solid #1e293b; border-radius: 9px; padding: 10px;
                color: #e2e8f0; font-size: 13px; line-height: 1.5; outline: none; min-height: 80px; }
            #notasTexto:focus, #notasTitulo:focus, #notasBusca:focus { border-color: #f59e0b; }
            #notasTitulo, #notasBusca { background: #020617; border: 1px solid #1e293b; border-radius: 9px; padding: 6px 10px; color: #f8fafc; outline: none; width: 100%; font-size: 13px; }
            #notasTitulo { font-weight: 800; }
            #notasAviso { transition: opacity .3s; opacity: 0; font-size: 10px; font-weight: 700; color: #fbbf24; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            @media print { #notasFab, #notasRoot { display: none !important; } }
            @media (max-width: 640px) {
                #notasFab .notas-rotulo { display: none; } #notasFab { padding: 0 14px; }
                #notasPainel { left: 8px !important; right: 8px !important; top: auto !important; bottom: 8px !important; width: auto !important; height: 55vh !important; resize: none; }
                #notasPainel.min { height: auto !important; }
                #notasTopo { cursor: default; }
            }
        `;
        document.head.appendChild(css);

        const root = document.createElement('div');
        root.id = 'notasRoot';
        root.innerHTML = `
            <button id="notasFab" type="button" title="Notas (Ctrl/Cmd + Shift + Y)"><i class="fa-solid fa-note-sticky"></i><span class="notas-rotulo">Notas</span><span class="notas-badge" id="notasContador">0</span></button>
            <section id="notasPainel" role="dialog" aria-label="Notas">
                <div id="notasTopo" title="Arraste para mover">
                    <i class="fa-solid fa-note-sticky" style="color:#f59e0b;font-size:12px"></i>
                    <span style="font-weight:900;font-size:11px;color:#fff;letter-spacing:.06em;text-transform:uppercase">Notas</span>
                    <span id="notasAviso" style="flex:1;min-width:0"></span>
                    <button class="notas-ico" id="notasLista" title="Todas as notas"><i class="fa-solid fa-list"></i></button>
                    <button class="notas-ico" id="notasNova" title="Nova nota"><i class="fa-solid fa-plus"></i></button>
                    <button class="notas-ico" id="notasMin" title="Minimizar"><i class="fa-solid fa-minus"></i></button>
                    <button class="notas-ico" id="notasFechar" title="Fechar (Esc)"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div id="notasCorpo"></div>
            </section>`;
        document.body.appendChild(root);

        document.getElementById('notasFab').onclick = () => abrir();
        document.getElementById('notasFechar').onclick = fechar;
        document.getElementById('notasNova').onclick = () => nova();
        document.getElementById('notasLista').onclick = () => { salvarAgora(); modo = modo === 'lista' ? 'editor' : 'lista'; if (janela.min) alternarMin(); renderTudo(); };
        document.getElementById('notasMin').onclick = alternarMin;
        prepararArrasto();

        const painel = document.getElementById('notasPainel');
        // Guarda o tamanho quando o usuário redimensiona pelo canto.
        if (window.ResizeObserver) {
            let t = null;
            new ResizeObserver(() => {
                if (!estaAberto() || janela.min || ehCelular()) return;
                clearTimeout(t);
                t = setTimeout(() => { janela.w = painel.offsetWidth; janela.h = painel.offsetHeight; salvarJanela(); }, 250);
            }).observe(painel);
        }

        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); estaAberto() ? fechar() : abrir(); }
            else if (e.key === 'Escape' && estaAberto() && painel.contains(document.activeElement)) fechar();
        });
        // Lembra o último texto selecionado no BI (fora da janela) pro botão "+ Seleção".
        document.addEventListener('selectionchange', () => {
            const sel = window.getSelection(); if (!sel || sel.isCollapsed) return;
            const no = sel.anchorNode; if (no && painel.contains(no.nodeType === 1 ? no : no.parentNode)) return;
            const t = sel.toString().trim(); if (t) ultimaSelecao = t;
        });
        window.addEventListener('resize', () => { if (estaAberto()) posicionar(); });
        // Outra aba do mesmo navegador mexeu nas notas → recarrega pra não sobrescrever.
        window.addEventListener('storage', e => { if (e.key === LS_KEY) { carregar(); renderTudo(); } });
        atualizarContador();
    }

    // ---------- janela: posição, arrasto, minimizar ----------
    function posicionar() {
        const p = document.getElementById('notasPainel'); if (!p) return;
        p.classList.toggle('min', !!janela.min);
        if (ehCelular()) return; // no celular o CSS fixa embaixo
        const vw = window.innerWidth, vh = window.innerHeight;
        const w = Math.min(Math.max(janela.w || 340, 260), vw - 16);
        const h = Math.min(Math.max(janela.h || 420, 220), vh - 16);
        p.style.width = w + 'px';
        if (!janela.min) p.style.height = h + 'px';
        let x = janela.x == null ? vw - w - 20 : janela.x;
        let y = janela.y == null ? vh - h - 20 : janela.y;
        const altura = janela.min ? p.offsetHeight || 46 : h;
        x = Math.min(Math.max(8, x), vw - w - 8);
        y = Math.min(Math.max(8, y), vh - altura - 8);
        p.style.left = x + 'px'; p.style.top = y + 'px';
    }
    function prepararArrasto() {
        const topo = document.getElementById('notasTopo'), p = document.getElementById('notasPainel');
        let ini = null;
        topo.addEventListener('pointerdown', e => {
            if (ehCelular() || e.button !== 0 || e.target.closest('button')) return;
            const r = p.getBoundingClientRect();
            ini = { dx: e.clientX - r.left, dy: e.clientY - r.top };
            topo.setPointerCapture(e.pointerId);
            e.preventDefault();
        });
        topo.addEventListener('pointermove', e => {
            if (!ini) return;
            const vw = window.innerWidth, vh = window.innerHeight;
            const x = Math.min(Math.max(8, e.clientX - ini.dx), vw - p.offsetWidth - 8);
            const y = Math.min(Math.max(8, e.clientY - ini.dy), vh - p.offsetHeight - 8);
            p.style.left = x + 'px'; p.style.top = y + 'px';
        });
        const soltar = () => {
            if (!ini) return; ini = null;
            janela.x = parseInt(p.style.left, 10); janela.y = parseInt(p.style.top, 10); salvarJanela();
        };
        topo.addEventListener('pointerup', soltar);
        topo.addEventListener('pointercancel', soltar);
        topo.addEventListener('dblclick', e => { if (!e.target.closest('button')) alternarMin(); });
    }
    function alternarMin() {
        salvarAgora();
        janela.min = !janela.min; salvarJanela();
        const b = document.getElementById('notasMin');
        if (b) { b.title = janela.min ? 'Expandir' : 'Minimizar'; b.innerHTML = `<i class="fa-solid ${janela.min ? 'fa-up-right-and-down-left-from-center' : 'fa-minus'}"></i>`; }
        posicionar();
    }

    const estaAberto = () => document.getElementById('notasRoot').classList.contains('aberto');
    function abrir() {
        carregar();
        if (!notaAtualId || !notas.some(n => n.id === notaAtualId)) notaAtualId = ordenadas()[0] ? ordenadas()[0].id : null;
        if (!notaAtualId) modo = 'editor';
        document.getElementById('notasRoot').classList.add('aberto');
        if (janela.min) { janela.min = false; salvarJanela(); }
        posicionar();
        renderTudo();
        setTimeout(() => { const t = document.getElementById('notasTexto'); if (t) t.focus(); }, 30);
    }
    function fechar() { salvarAgora(); document.getElementById('notasRoot').classList.remove('aberto'); }

    function ordenadas() {
        return notas.slice().sort((a, b) => (b.fixada ? 1 : 0) - (a.fixada ? 1 : 0) || String(b.atualizadaEm).localeCompare(String(a.atualizadaEm)));
    }
    function atualizarContador() { const c = document.getElementById('notasContador'); if (c) c.textContent = notas.length; }
    function renderTudo() {
        const b = document.getElementById('notasLista'); if (b) b.classList.toggle('ativo', modo === 'lista');
        if (modo === 'lista') renderLista(); else renderEditor();
        atualizarContador();
    }

    function renderLista() {
        const el = document.getElementById('notasCorpo'); if (!el) return;
        el.innerHTML = `
            <div style="padding:8px 10px 0"><input id="notasBusca" placeholder="Buscar nas notas..." autocomplete="off" value="${esc(busca)}"></div>
            <div id="notasItens" style="flex:1;min-height:0;overflow-y:auto;padding:8px 10px;display:flex;flex-direction:column;gap:5px"></div>
            <div style="display:flex;gap:6px;justify-content:space-between;align-items:center;padding:8px 10px;border-top:1px solid #1e293b">
                <span style="font-size:10px;color:#64748b">Só neste navegador</span>
                <span style="display:flex;gap:6px">
                    <button class="notas-btn" id="notasExportar" title="Baixar todas as notas num arquivo"><i class="fa-solid fa-download"></i>Exportar</button>
                    <button class="notas-btn" id="notasImportar" title="Trazer notas de um arquivo exportado"><i class="fa-solid fa-upload"></i>Importar</button>
                    <input type="file" id="notasArquivo" accept=".json,application/json" style="display:none">
                </span>
            </div>`;
        const inp = document.getElementById('notasBusca');
        inp.oninput = e => { busca = e.target.value; renderItens(); };
        document.getElementById('notasExportar').onclick = exportar;
        document.getElementById('notasImportar').onclick = () => document.getElementById('notasArquivo').click();
        document.getElementById('notasArquivo').onchange = importar;
        renderItens();
        setTimeout(() => inp.focus(), 30);
    }
    function renderItens() {
        const el = document.getElementById('notasItens'); if (!el) return;
        const q = busca.trim().toLowerCase();
        const lista = ordenadas().filter(n => !q || (tituloDe(n) + ' ' + (n.texto || '')).toLowerCase().includes(q));
        if (!notas.length) { el.innerHTML = `<p style="font-size:12px;color:#64748b;text-align:center;padding:10px 0">Nenhuma nota ainda — clique no <b style="color:#fbbf24">+</b>.</p>`; return; }
        if (!lista.length) { el.innerHTML = `<p style="font-size:12px;color:#64748b;text-align:center;padding:10px 0">Nada encontrado pra "${esc(busca)}".</p>`; return; }
        el.innerHTML = lista.map(n => {
            const prev = (n.texto || '').replace(/\s+/g, ' ').trim().slice(0, 80);
            return `<div class="notas-item ${n.id === notaAtualId ? 'ativo' : ''}" data-id="${n.id}">
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
                    <span style="font-size:12px;font-weight:800;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.fixada ? '<i class="fa-solid fa-thumbtack" style="color:#f59e0b;font-size:9px;margin-right:5px"></i>' : ''}${esc(tituloDe(n))}</span>
                    <span style="font-size:10px;color:#64748b;white-space:nowrap">${quando(n.atualizadaEm)}</span>
                </div>
                ${prev ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(prev)}</div>` : ''}
            </div>`;
        }).join('');
        el.querySelectorAll('.notas-item').forEach(it => it.onclick = () => { notaAtualId = it.dataset.id; modo = 'editor'; renderTudo(); });
    }

    function renderEditor() {
        const el = document.getElementById('notasCorpo'); if (!el) return;
        const n = notas.find(x => x.id === notaAtualId);
        if (!n) {
            el.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#64748b;font-size:12px;padding:16px;text-align:center">
                <i class="fa-regular fa-note-sticky" style="font-size:24px"></i>Nenhuma nota aberta.
                <button class="notas-btn primario" id="notasNovaVazia"><i class="fa-solid fa-plus"></i>Nova nota</button></div>`;
            document.getElementById('notasNovaVazia').onclick = () => nova();
            return;
        }
        el.innerHTML = `
            <div style="flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;padding:8px 10px">
                <input id="notasTitulo" placeholder="Título (opcional)" value="${esc(n.titulo || '')}" autocomplete="off">
                <textarea id="notasTexto" placeholder="Escreva aqui... (salva sozinho)&#10;Dica: selecione nomes no BI e clique em + Seleção">${esc(n.texto || '')}</textarea>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;justify-content:space-between;padding:0 10px 8px">
                <span style="display:flex;gap:5px;flex-wrap:wrap">
                    <button class="notas-btn primario" id="notasColarSel" title="Selecione um texto no BI e clique aqui pra colar na nota"><i class="fa-solid fa-arrow-right-to-bracket"></i>+ Seleção</button>
                    <button class="notas-btn" id="notasCopiar" title="Copiar o texto desta nota"><i class="fa-regular fa-copy"></i>Copiar</button>
                </span>
                <span style="display:flex;gap:5px">
                    <button class="notas-ico ${n.fixada ? 'ativo' : ''}" id="notasFixar" title="${n.fixada ? 'Desafixar' : 'Fixar no topo da lista'}"><i class="fa-solid fa-thumbtack"></i></button>
                    <button class="notas-ico" id="notasExcluir" title="Excluir esta nota"><i class="fa-regular fa-trash-can"></i></button>
                </span>
            </div>
            <div style="font-size:10px;color:#64748b;padding:0 10px 8px" id="notasStatus">Editada ${quando(n.atualizadaEm)}</div>`;
        const tit = document.getElementById('notasTitulo'), txt = document.getElementById('notasTexto');
        const editou = () => { n.titulo = tit.value; n.texto = txt.value; n.atualizadaEm = new Date().toISOString(); agendarSalvar(); };
        tit.oninput = editou; txt.oninput = editou;
        const bSel = document.getElementById('notasColarSel');
        bSel.onmousedown = e => e.preventDefault(); // não perde a seleção do BI ao clicar
        bSel.onclick = () => {
            const sel = window.getSelection();
            const agora = sel && !sel.isCollapsed && !document.getElementById('notasPainel').contains(sel.anchorNode) ? sel.toString().trim() : '';
            const t = agora || ultimaSelecao;
            if (!t) { aviso('Selecione um texto no BI primeiro.', true); return; }
            const ini = txt.selectionStart != null && document.activeElement === txt ? txt.selectionStart : txt.value.length;
            const fim = document.activeElement === txt ? txt.selectionEnd : ini;
            const antes = txt.value.slice(0, ini), depois = txt.value.slice(fim);
            const sep = antes && !antes.endsWith('\n') ? '\n' : '';
            txt.value = antes + sep + t + depois;
            const pos = (antes + sep + t).length;
            txt.focus(); txt.setSelectionRange(pos, pos);
            editou(); aviso('Colado na nota!');
        };
        document.getElementById('notasCopiar').onclick = async () => {
            const conteudo = [n.titulo && n.titulo.trim(), n.texto].filter(Boolean).join('\n\n');
            aviso(conteudo ? ((await copiarTexto(conteudo)) ? 'Copiado!' : 'Não deu pra copiar — use Cmd+C.') : 'Nota vazia.', !conteudo);
        };
        document.getElementById('notasFixar').onclick = () => { n.fixada = !n.fixada; salvar(); renderTudo(); aviso(n.fixada ? 'Fixada no topo.' : 'Desafixada.'); };
        document.getElementById('notasExcluir').onclick = () => {
            if (!confirm(`Excluir a nota "${tituloDe(n)}"? Não dá pra desfazer.`)) return;
            notas = notas.filter(x => x.id !== n.id); salvar();
            notaAtualId = ordenadas()[0] ? ordenadas()[0].id : null;
            renderTudo(); aviso('Nota excluída.');
        };
    }

    function agendarSalvar() {
        clearTimeout(salvarTimer);
        const st = document.getElementById('notasStatus'); if (st) st.textContent = 'Salvando...';
        salvarTimer = setTimeout(salvarAgora, 400);
    }
    function salvarAgora() {
        if (!salvarTimer) return;
        clearTimeout(salvarTimer); salvarTimer = null;
        salvar(); atualizarContador();
        const st = document.getElementById('notasStatus'), n = notas.find(x => x.id === notaAtualId);
        if (st && n) st.textContent = `Salvo · editada ${quando(n.atualizadaEm)}`;
    }

    function nova(textoInicial) {
        salvarAgora();
        const agora = new Date().toISOString();
        const n = { id: novoId(), titulo: '', texto: textoInicial || '', criadaEm: agora, atualizadaEm: agora, fixada: false };
        notas.push(n); salvar(); notaAtualId = n.id; busca = ''; modo = 'editor';
        if (!estaAberto()) { document.getElementById('notasRoot').classList.add('aberto'); posicionar(); }
        if (janela.min) alternarMin();
        renderTudo();
        setTimeout(() => { const t = document.getElementById('notasTexto'); if (t) t.focus(); }, 30);
    }

    function exportar() {
        salvarAgora();
        const blob = new Blob([JSON.stringify({ tipo: 'audaz-bi-notas', exportadoEm: new Date().toISOString(), notas }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `notas-audaz-bi-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    function importar(e) {
        const f = e.target.files && e.target.files[0]; e.target.value = '';
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
            try {
                const dados = JSON.parse(r.result);
                const lista = Array.isArray(dados) ? dados : dados.notas;
                if (!Array.isArray(lista)) throw new Error('formato');
                const ids = new Set(notas.map(n => n.id));
                let add = 0;
                lista.forEach(n => { if (n && typeof n.texto === 'string' && !ids.has(n.id)) { notas.push({ id: n.id || novoId(), titulo: n.titulo || '', texto: n.texto, criadaEm: n.criadaEm || new Date().toISOString(), atualizadaEm: n.atualizadaEm || new Date().toISOString(), fixada: !!n.fixada }); add++; } });
                salvar(); renderTudo(); aviso(add ? `${add} nota(s) importada(s).` : 'Nenhuma nota nova no arquivo.');
            } catch (err) { aviso('Arquivo inválido — use um exportado pelas Notas do BI.', true); }
        };
        r.readAsText(f);
    }

    window.AudazNotas = { abrir, fechar, nova };
    carregar();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
