// =====================================================================================
// NOTAS (31/10/2026) — bloco de anotações que abre de QUALQUER aba do BI.
// Botão flutuante no canto inferior direito (ou atalho Ctrl/Cmd + Shift + Y) abre um painel
// lateral com várias notas: criar, editar (salva sozinho), buscar, copiar e excluir.
//
// Onde fica salvo: SÓ neste navegador (localStorage `<appId>-notas`). De propósito NÃO vai pro
// Firestore: o documento config/settings hoje é legível por qualquer um (regras abertas) e nota
// pode ter nome/telefone/valor de cliente. Pra levar pra outro computador: "Exportar" / "Importar".
// Módulo independente — não depende de nada do resto do BI além do `appId` (se existir).
// =====================================================================================
(function () {
    const LS_KEY = `${typeof appId !== 'undefined' ? appId : 'audaz-bi-v1'}-notas`;
    let notas = [];          // [{ id, titulo, texto, criadaEm, atualizadaEm, fixada }]
    let notaAtualId = null;
    let busca = '';
    let salvarTimer = null;

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

    // ---------- utilidades ----------
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const novoId = () => 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
        if (typeof showToast === 'function') { showToast(msg, !!erro); return; }
        const el = document.getElementById('notasAviso'); if (!el) return;
        el.textContent = msg; el.style.opacity = '1'; setTimeout(() => { el.style.opacity = '0'; }, 1800);
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
        const css = document.createElement('style');
        css.textContent = `
            #notasFab { position: fixed; right: 20px; bottom: 20px; z-index: 70; height: 48px; padding: 0 16px; border-radius: 9999px;
                display: flex; align-items: center; gap: 8px; background: #f59e0b; color: #1c1917; font-weight: 800; font-size: 13px;
                border: 1px solid #fbbf24; box-shadow: 0 10px 25px -5px rgba(0,0,0,.6); cursor: pointer; transition: transform .15s; }
            #notasFab:hover { transform: translateY(-2px); }
            #notasFab .notas-badge { background: #1c1917; color: #fbbf24; border-radius: 9999px; font-size: 10px; padding: 1px 7px; }
            #notasOverlay { position: fixed; inset: 0; z-index: 71; background: rgba(2,6,23,.55); display: none; }
            #notasPainel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 72; width: min(560px, 100vw); background: #0f172a;
                border-left: 1px solid #334155; box-shadow: -20px 0 40px rgba(0,0,0,.5); display: none; flex-direction: column; color: #e2e8f0; }
            #notasRoot.aberto #notasOverlay { display: block; }
            #notasRoot.aberto #notasPainel { display: flex; }
            #notasPainel button { cursor: pointer; }
            .notas-btn { font-size: 11px; font-weight: 700; padding: 6px 10px; border-radius: 8px; border: 1px solid #334155; background: #1e293b; color: #cbd5e1; display: inline-flex; align-items: center; gap: 6px; }
            .notas-btn:hover { color: #fff; border-color: #475569; }
            .notas-btn.primario { background: #f59e0b; border-color: #fbbf24; color: #1c1917; }
            .notas-btn.perigo:hover { color: #fda4af; border-color: #e11d48; }
            .notas-item { padding: 10px 12px; border-radius: 10px; border: 1px solid #1e293b; background: #0b1222; cursor: pointer; }
            .notas-item:hover { border-color: #334155; }
            .notas-item.ativo { border-color: #f59e0b; background: rgba(245,158,11,.08); }
            #notasTexto { flex: 1; resize: none; background: #020617; border: 1px solid #1e293b; border-radius: 10px; padding: 12px;
                color: #e2e8f0; font-size: 14px; line-height: 1.55; outline: none; min-height: 180px; }
            #notasTexto:focus, #notasTitulo:focus, #notasBusca:focus { border-color: #f59e0b; }
            #notasTitulo, #notasBusca { background: #020617; border: 1px solid #1e293b; border-radius: 10px; padding: 8px 12px; color: #f8fafc; outline: none; width: 100%; }
            #notasTitulo { font-weight: 800; font-size: 15px; }
            #notasAviso { transition: opacity .3s; opacity: 0; }
            @media print { #notasFab, #notasRoot { display: none !important; } }
            @media (max-width: 640px) { #notasFab .notas-rotulo { display: none; } #notasFab { padding: 0 14px; } }
        `;
        document.head.appendChild(css);

        const fab = document.createElement('button');
        fab.id = 'notasFab'; fab.type = 'button';
        fab.title = 'Notas (Ctrl/Cmd + Shift + Y)';
        fab.innerHTML = `<i class="fa-solid fa-note-sticky"></i><span class="notas-rotulo">Notas</span><span class="notas-badge" id="notasContador">0</span>`;
        fab.onclick = () => abrir();
        document.body.appendChild(fab);

        const root = document.createElement('div');
        root.id = 'notasRoot';
        root.innerHTML = `
            <div id="notasOverlay"></div>
            <aside id="notasPainel" role="dialog" aria-label="Notas">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px;border-bottom:1px solid #1e293b">
                    <div>
                        <div style="font-weight:900;font-size:14px;color:#fff;letter-spacing:.04em;text-transform:uppercase"><i class="fa-solid fa-note-sticky" style="color:#f59e0b;margin-right:6px"></i>Notas</div>
                        <div style="font-size:10px;color:#64748b;margin-top:2px">Salvo automaticamente neste navegador · Esc fecha</div>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center">
                        <span id="notasAviso" style="font-size:10px;color:#fbbf24;font-weight:700"></span>
                        <button class="notas-btn primario" id="notasNova"><i class="fa-solid fa-plus"></i>Nova</button>
                        <button class="notas-btn" id="notasFechar" title="Fechar"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                </div>
                <div style="display:flex;flex:1;min-height:0;flex-direction:column">
                    <div style="padding:10px 16px 0">
                        <input id="notasBusca" placeholder="Buscar nas notas..." autocomplete="off">
                    </div>
                    <div id="notasLista" style="padding:10px 16px;display:flex;flex-direction:column;gap:6px;max-height:34vh;overflow-y:auto;border-bottom:1px solid #1e293b"></div>
                    <div id="notasEditor" style="flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;padding:12px 16px 16px"></div>
                </div>
                <div style="display:flex;gap:6px;justify-content:space-between;align-items:center;padding:10px 16px;border-top:1px solid #1e293b;font-size:10px;color:#64748b">
                    <span>Só neste navegador — use Exportar pra levar a outro computador.</span>
                    <span style="display:flex;gap:6px">
                        <button class="notas-btn" id="notasExportar" title="Baixar todas as notas num arquivo"><i class="fa-solid fa-download"></i>Exportar</button>
                        <button class="notas-btn" id="notasImportar" title="Trazer notas de um arquivo exportado"><i class="fa-solid fa-upload"></i>Importar</button>
                        <input type="file" id="notasArquivo" accept=".json,application/json" style="display:none">
                    </span>
                </div>
            </aside>`;
        document.body.appendChild(root);

        document.getElementById('notasOverlay').onclick = fechar;
        document.getElementById('notasFechar').onclick = fechar;
        document.getElementById('notasNova').onclick = () => nova();
        document.getElementById('notasBusca').oninput = e => { busca = e.target.value; renderLista(); };
        document.getElementById('notasExportar').onclick = exportar;
        document.getElementById('notasImportar').onclick = () => document.getElementById('notasArquivo').click();
        document.getElementById('notasArquivo').onchange = importar;

        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); estaAberto() ? fechar() : abrir(); }
            else if (e.key === 'Escape' && estaAberto()) fechar();
        });
        // Outra aba do mesmo navegador mexeu nas notas → recarrega pra não sobrescrever.
        window.addEventListener('storage', e => { if (e.key === LS_KEY) { carregar(); renderTudo(); } });
        atualizarContador();
    }

    const estaAberto = () => document.getElementById('notasRoot').classList.contains('aberto');
    function abrir() {
        carregar();
        if (!notaAtualId || !notas.some(n => n.id === notaAtualId)) notaAtualId = ordenadas()[0] ? ordenadas()[0].id : null;
        document.getElementById('notasRoot').classList.add('aberto');
        renderTudo();
        setTimeout(() => { const t = document.getElementById('notasTexto'); if (t) t.focus(); }, 30);
    }
    function fechar() { salvarAgora(); document.getElementById('notasRoot').classList.remove('aberto'); }

    function ordenadas() {
        return notas.slice().sort((a, b) => (b.fixada ? 1 : 0) - (a.fixada ? 1 : 0) || String(b.atualizadaEm).localeCompare(String(a.atualizadaEm)));
    }
    function atualizarContador() { const c = document.getElementById('notasContador'); if (c) c.textContent = notas.length; }
    function renderTudo() { renderLista(); renderEditor(); atualizarContador(); }

    function renderLista() {
        const el = document.getElementById('notasLista'); if (!el) return;
        const q = busca.trim().toLowerCase();
        const lista = ordenadas().filter(n => !q || (tituloDe(n) + ' ' + (n.texto || '')).toLowerCase().includes(q));
        if (!notas.length) { el.innerHTML = `<p style="font-size:12px;color:#64748b;text-align:center;padding:10px 0">Nenhuma nota ainda — clique em <b style="color:#fbbf24">Nova</b>.</p>`; return; }
        if (!lista.length) { el.innerHTML = `<p style="font-size:12px;color:#64748b;text-align:center;padding:10px 0">Nada encontrado pra "${esc(busca)}".</p>`; return; }
        el.innerHTML = lista.map(n => {
            const prev = (n.texto || '').replace(/\s+/g, ' ').trim().slice(0, 90);
            return `<div class="notas-item ${n.id === notaAtualId ? 'ativo' : ''}" data-id="${n.id}">
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">
                    <span style="font-size:13px;font-weight:800;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.fixada ? '<i class="fa-solid fa-thumbtack" style="color:#f59e0b;font-size:10px;margin-right:5px"></i>' : ''}${esc(tituloDe(n))}</span>
                    <span style="font-size:10px;color:#64748b;white-space:nowrap">${quando(n.atualizadaEm)}</span>
                </div>
                ${prev ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(prev)}</div>` : ''}
            </div>`;
        }).join('');
        el.querySelectorAll('.notas-item').forEach(it => it.onclick = () => { salvarAgora(); notaAtualId = it.dataset.id; renderTudo(); });
    }

    function renderEditor() {
        const el = document.getElementById('notasEditor'); if (!el) return;
        const n = notas.find(x => x.id === notaAtualId);
        if (!n) {
            el.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#64748b;font-size:12px">
                <i class="fa-regular fa-note-sticky" style="font-size:28px"></i>Selecione uma nota ou crie uma nova.
                <button class="notas-btn primario" onclick="window.AudazNotas.nova()"><i class="fa-solid fa-plus"></i>Nova nota</button></div>`;
            return;
        }
        el.innerHTML = `
            <input id="notasTitulo" placeholder="Título (opcional)" value="${esc(n.titulo || '')}" autocomplete="off">
            <textarea id="notasTexto" placeholder="Escreva aqui... (salva sozinho)">${esc(n.texto || '')}</textarea>
            <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:space-between">
                <span style="font-size:10px;color:#64748b" id="notasStatus">Criada ${quando(n.criadaEm)} · editada ${quando(n.atualizadaEm)}</span>
                <span style="display:flex;gap:6px">
                    <button class="notas-btn" id="notasFixar" title="Fixar no topo da lista"><i class="fa-solid fa-thumbtack"></i>${n.fixada ? 'Desafixar' : 'Fixar'}</button>
                    <button class="notas-btn primario" id="notasCopiar" title="Copiar o texto desta nota"><i class="fa-regular fa-copy"></i>Copiar</button>
                    <button class="notas-btn perigo" id="notasExcluir" title="Excluir esta nota"><i class="fa-regular fa-trash-can"></i>Excluir</button>
                </span>
            </div>`;
        const tit = document.getElementById('notasTitulo'), txt = document.getElementById('notasTexto');
        const editou = () => { n.titulo = tit.value; n.texto = txt.value; n.atualizadaEm = new Date().toISOString(); agendarSalvar(); };
        tit.oninput = editou; txt.oninput = editou;
        document.getElementById('notasCopiar').onclick = async () => {
            const conteudo = [n.titulo && n.titulo.trim(), n.texto].filter(Boolean).join('\n\n');
            aviso(conteudo ? ((await copiarTexto(conteudo)) ? 'Copiado!' : 'Não deu pra copiar — selecione e use Cmd+C.') : 'Nota vazia.', !conteudo);
        };
        document.getElementById('notasFixar').onclick = () => { n.fixada = !n.fixada; salvar(); renderTudo(); };
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
        salvarTimer = setTimeout(() => { salvarAgora(); renderLista(); }, 400);
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
        notas.push(n); salvar(); notaAtualId = n.id; busca = '';
        const b = document.getElementById('notasBusca'); if (b) b.value = '';
        if (!estaAberto()) document.getElementById('notasRoot').classList.add('aberto');
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
