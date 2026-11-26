        // ====== VISÃO GERAL (página inicial — 26/11/2026) ======
        // Painel regional numa tela só: período (mês comercial), estrutura, KPIs com comparação ao mês
        // anterior, meta regional, gestores, composição de cada equipe (integrantes + funil + VGV),
        // ranking de equipes, saúde da regional, próximas ações e próximas visitas.
        // Tudo calculado direto da base (planilha + Agenda + Prospecção), por MÊS COMERCIAL, sem
        // depender dos filtros do Painel — a Visão Geral é sempre a regional inteira.
        let visaoMesSel = null;      // 'Novembro/2026'
        let visaoEquipeSel = null;   // id do gerente da aba aberta em "Composição das equipes"

        function visaoMesesOrdenados() {
            return (mesesComerciais || []).filter(m => m && m.inicio && m.fim).slice().sort((a, b) => a.inicio.localeCompare(b.inicio));
        }
        function visaoMesAtual() {
            const lista = visaoMesesOrdenados();
            const chave = m => `${m.nome}/${m.ano}`;
            if (visaoMesSel && lista.some(m => chave(m) === visaoMesSel)) return lista.find(m => chave(m) === visaoMesSel);
            const atual = getMesComercialAtualPorData();
            const m = atual && lista.find(x => x.nome === atual.nome && x.ano === atual.ano);
            return m || lista[lista.length - 1] || null;
        }
        function visaoMesAnterior(mes) {
            const lista = visaoMesesOrdenados();
            const i = lista.findIndex(m => m.nome === mes.nome && m.ano === mes.ano);
            return i > 0 ? lista[i - 1] : null;
        }
        function setVisaoMes(v) { visaoMesSel = v; renderVisaoGeral(); }
        function visaoSelecionarEquipe(id, rolar) {
            visaoEquipeSel = id; renderVisaoGeral();
            if (rolar) { const el = document.getElementById('visaoComposicao'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
        }

        const visaoBateMes = (valor, mes) => !!valor && normalizeMes(String(valor)) === mes.nome && (getMesAno(String(valor)) || mes.ano) === mes.ano;
        const visaoIso = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
        const visaoNaJanela = (d, mes) => { const iso = visaoIso(d); return !!iso && iso >= mes.inicio && iso <= mes.fim; };

        // Números do mês: total da regional e por equipe (vínculo corretor → gerente → equipe do organograma).
        function visaoMetricas(mes) {
            const zero = () => ({ leads: 0, agendamentos: 0, visitas: 0, analises: 0, aprovacoes: 0, vendas: 0, vgv: 0 });
            const tot = zero(), porEquipe = {}, vendedores = new Set();
            if (!mes) return { tot, porEquipe, vendedores };
            const eqDe = nome => (nome && getRankingTeamForBroker(nome)) || null;
            const add = (eq, k, v = 1) => { tot[k] += v; if (eq) (porEquipe[eq] = porEquipe[eq] || zero())[k] += v; };
            (dataset || []).forEach(r => {
                const eq = eqDe(r.Corretor);
                if (visaoBateMes(r['Mês Cadastro'], mes)) add(eq, 'analises');
                if (isAprovado(r['Situação - Analise']) && visaoBateMes(r['Mês Aprovação'] || (r['Data Aprovação'] ? '' : r['Mês Cadastro']), mes)) add(eq, 'aprovacoes');
                if (isVendaModo(r) && visaoBateMes(r['Mês Ganho'], mes)) {
                    add(eq, 'vendas'); add(eq, 'vgv', getVGV(r));
                    if (r.Corretor) vendedores.add(orgPersonKey(r.Corretor));
                }
            });
            (typeof agendaDataset !== 'undefined' ? agendaDataset : []).forEach(r => {
                const eq = eqDe(r.Corretor);
                if (visaoNaJanela(parseDate(agendaDateForMetric(r, 'agendamentos')), mes)) add(eq, 'agendamentos');
                if (isCompareceu(r) && visaoNaJanela(parseDate(agendaDateForMetric(r, 'compareceu')), mes)) add(eq, 'visitas');
            });
            (prospeccaoDataset || []).forEach(r => { if (visaoBateMes(r._MesComercialNorm, mes)) add(eqDe(r.Corretor), 'leads'); });
            return { tot, porEquipe, vendedores };
        }

        // Estrutura ativa do organograma: gerentes na ordem definida + integrantes de cada um.
        function visaoEstrutura() {
            const ativos = new Set(getActiveCorretores().filter(n => !orgPessoaInativa(n)).map(orgPersonKey));
            const gerentes = orgGerentesAtivos().filter(m => ativos.has(orgPersonKey(m.name)));
            return gerentes.map((m, i) => ({
                manager: m,
                cor: orgCorGerente(m, i),
                equipe: (m.equipe && (canonicalRankingTeamName(m.equipe) || m.equipe)) || m.name,
                brokers: organograma.filter(n => n.role !== 'Gerente' && ativos.has(orgPersonKey(n.name)) && orgGerenteEfetivo(n, gerentes) === m.id)
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
            }));
        }

        function visaoDelta(atual, anterior, temAnterior) {
            if (!temAnterior) return '';
            if (!anterior) return atual ? '<span class="vg-delta vg-up"><i class="fa-solid fa-arrow-up"></i> novo</span>' : '';
            const p = Math.round((atual - anterior) / anterior * 100);
            if (!p) return '<span class="vg-delta vg-eq">= mês anterior</span>';
            return `<span class="vg-delta ${p > 0 ? 'vg-up' : 'vg-down'}"><i class="fa-solid fa-arrow-${p > 0 ? 'up' : 'down'}"></i> ${p > 0 ? '+' : ''}${p}%</span>`;
        }
        const visaoNum = n => String(n).padStart(2, '0');
        const visaoBRL = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);

        function renderVisaoGeral() {
            const root = document.getElementById('visaoRoot'); if (!root) return;
            const mes = visaoMesAtual();
            if (!mes) { root.innerHTML = '<p class="text-sm text-slate-500 p-8 text-center">Cadastre os meses comerciais pra ver a Visão Geral.</p>'; return; }
            const ant = visaoMesAnterior(mes);
            const M = visaoMetricas(mes), A = visaoMetricas(ant);
            const temAnt = !!ant;
            const estrutura = visaoEstrutura();
            const totalIntegrantes = estrutura.reduce((s, t) => s + t.brokers.length, 0);
            const totalPessoas = estrutura.length + totalIntegrantes;
            // Produtividade = integrantes ativos (gerente incluído) com ao menos uma venda no mês — mesma regra do Ranking de Equipes.
            estrutura.forEach(t => {
                const pessoas = [t.manager, ...t.brokers];
                t.produtivos = pessoas.filter(p => M.vendedores.has(orgPersonKey(p.name))).length;
                t.pessoas = pessoas.length;
                t.pct = t.pessoas ? Math.round(t.produtivos / t.pessoas * 100) : 0;
                t.m = M.porEquipe[t.equipe] || { leads: 0, agendamentos: 0, visitas: 0, analises: 0, aprovacoes: 0, vendas: 0, vgv: 0 };
                t.a = A.porEquipe[t.equipe] || { vgv: 0 };
            });
            const produtivosReg = estrutura.reduce((s, t) => s + t.produtivos, 0);
            const pctReg = totalPessoas ? Math.round(produtivosReg / totalPessoas * 100) : 0;
            const metaVgv = Number(metasMensais && metasMensais.vgv) || 0;
            const pctMeta = metaVgv ? Math.round(M.tot.vgv / metaVgv * 100) : 0;
            if (!estrutura.some(t => t.manager.id === visaoEquipeSel)) visaoEquipeSel = estrutura[0]?.manager.id || null;
            const sel = estrutura.find(t => t.manager.id === visaoEquipeSel);
            const chaveMes = `${mes.nome}/${mes.ano}`;

            // ---- Topo: título + período ----
            const opcoesMes = visaoMesesOrdenados().slice().reverse().map(m => `<option value="${m.nome}/${m.ano}" ${`${m.nome}/${m.ano}` === chaveMes ? 'selected' : ''}>${m.nome} / ${m.ano}</option>`).join('');
            const topo = `<div class="flex flex-wrap items-center justify-between gap-3">
                <div class="text-[11px] sm:text-xs font-bold tracking-[.25em] text-slate-400 uppercase">Painel Regional <span class="text-slate-600 mx-1.5">•</span> Direcional Engenharia</div>
                <label class="vg-card flex items-center gap-3 !py-2 !px-3 text-xs"><span class="text-slate-400">Período:</span>
                    <select onchange="setVisaoMes(this.value)" class="bg-transparent text-white font-bold outline-none cursor-pointer">${opcoesMes}</select></label>
            </div>`;

            // ---- Regional + estrutura ----
            const stat = (ico, val, rot, ouro) => `<div class="flex items-center gap-3 min-w-0"><i class="fa-solid ${ico} text-2xl ${ouro ? 'text-amber-400' : 'text-sky-400'}"></i><div><div class="text-3xl font-black text-white leading-none tabular-nums">${val}</div><div class="text-[11px] text-slate-400 mt-1">${rot}</div></div></div>`;
            const regional = `<div class="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4">
                <div class="vg-regional">
                    <div class="shrink-0 vg-regional-foto">${corretorAvatarInner('Sadraque Ribeiro', 'h-24 w-24', 'text-2xl')}</div>
                    <div class="min-w-0"><div class="text-[11px] font-extrabold tracking-[.2em] text-amber-400">REGIONAL</div>
                        <div class="text-2xl sm:text-3xl font-black text-white leading-tight">Sadraque Ribeiro</div>
                        <div class="text-sm text-slate-300 mt-0.5">Gerente Regional</div>
                        <div class="text-xs text-slate-400 mt-1"><i class="fa-solid fa-people-group text-sky-400 mr-1"></i>Audaz Squad</div></div>
                </div>
                <div class="vg-card grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
                    ${stat('fa-user-tie', visaoNum(estrutura.length), 'Gestores')}
                    ${stat('fa-users', visaoNum(totalIntegrantes), 'Corretores')}
                    ${stat('fa-people-group', visaoNum(totalPessoas), 'Pessoas')}
                    ${stat('fa-bullseye', pctReg + '%', 'Produtivos', true)}
                </div>
            </div>`;

            // ---- KPIs + meta regional ----
            const kpi = (ico, cor, rot, val, a) => `<div class="vg-card vg-kpi"><div class="flex items-center gap-2 text-[12px] text-slate-300"><i class="fa-solid ${ico} ${cor}"></i>${rot}</div><div class="text-3xl font-black text-white mt-1 tabular-nums">${val}</div>${a}</div>`;
            const kpis = `<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_1.8fr] gap-3">
                ${kpi('fa-coins', 'text-amber-400', 'VGV Vendido', `<span class="text-2xl">${visaoBRL(M.tot.vgv)}</span>`, visaoDelta(M.tot.vgv, A.tot.vgv, temAnt))}
                ${kpi('fa-key', 'text-amber-400', 'Vendas', visaoNum(M.tot.vendas), visaoDelta(M.tot.vendas, A.tot.vendas, temAnt))}
                ${kpi('fa-calendar-check', 'text-amber-400', 'Agendamentos', visaoNum(M.tot.agendamentos), visaoDelta(M.tot.agendamentos, A.tot.agendamentos, temAnt))}
                ${kpi('fa-eye', 'text-amber-400', 'Visitas', visaoNum(M.tot.visitas), visaoDelta(M.tot.visitas, A.tot.visitas, temAnt))}
                ${kpi('fa-file-circle-check', 'text-amber-400', 'Aprovações', visaoNum(M.tot.aprovacoes), visaoDelta(M.tot.aprovacoes, A.tot.aprovacoes, temAnt))}
                <div class="vg-card col-span-2 md:col-span-3 xl:col-span-1">
                    <div class="flex items-center gap-2 text-[12px] text-slate-300"><i class="fa-solid fa-bullseye text-amber-400"></i>Meta Regional (Mês)</div>
                    <div class="text-2xl font-black text-white mt-1">${metaVgv ? visaoBRL(metaVgv) : '<span class="text-base text-slate-500">Meta de VGV não cadastrada</span>'}</div>
                    <div class="flex items-center gap-2 mt-2"><div class="flex-1 h-2.5 rounded-full bg-slate-800 overflow-hidden"><div class="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300" style="width:${Math.min(100, pctMeta)}%"></div></div><span class="text-sm font-black text-white tabular-nums">${pctMeta}%</span></div>
                    <div class="flex flex-wrap justify-between gap-x-3 text-[11px] text-slate-400 mt-1.5"><span>${visaoBRL(M.tot.vgv)} realizados</span>${metaVgv ? `<span>${visaoBRL(Math.max(0, metaVgv - M.tot.vgv))} a realizar</span>` : ''}</div>
                </div>
            </div>`;

            // ---- Estrutura gerencial ----
            const gestores = `<div class="vg-titulo-faixa"><span>Estrutura Gerencial – ${visaoNum(estrutura.length)} Gestores</span></div>
                <div class="grid gap-3" style="grid-template-columns:repeat(auto-fit,minmax(175px,1fr))">${estrutura.map(t => {
                    const barra = t.pct >= 50 ? 'bg-emerald-500' : t.pct > 0 ? 'bg-amber-400' : 'bg-slate-600';
                    return `<button type="button" onclick="visaoSelecionarEquipe('${orgEsc(t.manager.id)}', true)" class="vg-gestor text-left ${t.manager.id === visaoEquipeSel ? 'vg-gestor-sel' : ''}" style="--cor:${t.cor}">
                        <div class="flex items-center gap-2.5"><span class="vg-gestor-foto shrink-0">${corretorAvatarInner(t.manager.name, 'h-12 w-12', 'text-xs')}</span>
                            <div class="min-w-0"><div class="text-[13px] font-extrabold text-white leading-tight break-words">${orgEsc(t.manager.name)}</div><div class="text-[11px] text-slate-400">Gerente de Equipe</div></div></div>
                        <div class="text-center mt-2.5"><span class="vg-equipe-chip">${orgEsc(t.equipe)}</span></div>
                        <div class="text-[12px] text-slate-300 mt-2"><i class="fa-solid fa-user-group text-slate-400 mr-1"></i>${t.brokers.length} ${t.brokers.length === 1 ? 'integrante' : 'integrantes'}</div>
                        <div class="flex items-center justify-between text-[11px] text-slate-400 mt-2">Produtividade<b class="text-white text-xs">${t.pct}%</b></div>
                        <div class="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1" title="${t.produtivos} de ${t.pessoas} (gerente incluído) com venda no mês"><div class="h-full rounded-full ${barra}" style="width:${t.pct}%"></div></div>
                    </button>`;
                }).join('')}</div>`;

            // ---- Composição das equipes (abas) ----
            let composicao = '';
            if (sel) {
                const membros = [sel.manager, ...sel.brokers];
                const funil = [['fa-users', 'Leads', sel.m.leads], ['fa-calendar-check', 'Agendamentos', sel.m.agendamentos], ['fa-eye', 'Visitas', sel.m.visitas], ['fa-file-circle-check', 'Aprovações', sel.m.aprovacoes], ['fa-key', 'Vendas', sel.m.vendas]];
                const metaVd = getMetaEquipe(sel.equipe, 'vdMes');
                const pctVd = metaVd ? Math.round(sel.m.vendas / metaVd * 100) : 0;
                const circ = 2 * Math.PI * 34;
                composicao = `<div id="visaoComposicao" class="vg-card scroll-mt-4">
                    <div class="text-sm font-black tracking-wider text-white uppercase mb-3">Composição das Equipes</div>
                    <div class="flex gap-1.5 overflow-x-auto pb-1">${estrutura.map(t => `<button type="button" onclick="visaoSelecionarEquipe('${orgEsc(t.manager.id)}')" class="vg-aba ${t === sel ? 'vg-aba-sel' : ''}">${orgEsc(t.equipe)} (${t.brokers.length})</button>`).join('')}</div>
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">
                        <div class="vg-sub">
                            <div class="flex items-center gap-2.5 mb-2"><i class="fa-solid fa-people-group text-2xl" style="color:${sel.cor}"></i><div><div class="text-base font-black text-white">Equipe ${orgEsc(sel.equipe)}</div><div class="text-[11px] text-slate-400">Gestor: ${orgEsc(sel.manager.name)}</div></div></div>
                            <div class="space-y-1 max-h-56 overflow-y-auto pr-1">${membros.map(p => {
                                const vendeu = M.vendedores.has(orgPersonKey(p.name));
                                return `<div class="flex items-center gap-2 py-1 border-b border-slate-800/60 last:border-0"><span class="shrink-0">${corretorAvatarInner(p.name, 'h-7 w-7', 'text-[9px]')}</span><div class="min-w-0 flex-1"><div class="text-[12px] text-slate-100 truncate">${orgEsc(p.name)}</div><div class="text-[10px] text-slate-500">${orgEsc(p.role === 'Gerente' ? 'Gerente' : (p.role || 'Corretor'))}${vendeu ? ' · <span class="text-amber-300">vendeu no mês</span>' : ''}</div></div><span class="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-2 py-0.5"><span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1 align-middle"></span>Ativo</span></div>`;
                            }).join('')}</div>
                        </div>
                        <div class="vg-sub">
                            <div class="text-[13px] font-bold text-white mb-2">Funil da Equipe – ${orgEsc(sel.equipe)}</div>
                            <div class="space-y-1.5">${funil.map(([ico, rot, v], i) => `<div class="vg-funil" style="margin:0 ${i * 5}%; opacity:${1 - i * 0.06}"><span><i class="fa-solid ${ico} mr-2"></i>${rot}</span><b class="tabular-nums">${visaoNum(v)}</b></div>`).join('')}</div>
                        </div>
                        <div class="vg-sub">
                            <div class="text-[13px] text-slate-300">VGV da Equipe</div>
                            <div class="text-3xl font-black text-white mt-1">${visaoBRL(sel.m.vgv)}</div>
                            <div class="mt-1">${visaoDelta(sel.m.vgv, sel.a.vgv, temAnt) || '<span class="text-[11px] text-slate-500">—</span>'}${temAnt ? ' <span class="text-[10px] text-slate-500">vs. mês anterior</span>' : ''}</div>
                            <div class="flex items-center gap-4 mt-3">
                                <svg viewBox="0 0 80 80" class="h-24 w-24 shrink-0 -rotate-90"><circle cx="40" cy="40" r="34" fill="none" stroke="#1e293b" stroke-width="8"/><circle cx="40" cy="40" r="34" fill="none" stroke="#22c55e" stroke-width="8" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - Math.min(100, pctVd) / 100)}"/></svg>
                                <div><div class="text-2xl font-black text-white">${metaVd ? pctVd + '%' : '—'}</div><div class="text-[11px] text-slate-400">${metaVd ? `da meta de vendas<br><b class="text-slate-200">${sel.m.vendas} de ${metaVd}</b>` : 'Meta de vendas da equipe<br>não cadastrada (Rankings → Metas por Equipe)'}</div></div>
                            </div>
                        </div>
                    </div>
                </div>`;
            }

            // ---- Ranking de equipes (VGV) ----
            const rank = estrutura.slice().sort((a, b) => b.m.vgv - a.m.vgv || b.m.vendas - a.m.vendas);
            const ranking = `<div class="vg-card">
                <div class="flex items-center gap-2 mb-3"><i class="fa-solid fa-trophy text-amber-400"></i><span class="text-base font-black text-white">Ranking de Equipes</span><span class="text-xs text-slate-400">(VGV)</span></div>
                <div class="space-y-1.5">${rank.map((t, i) => `<button type="button" onclick="visaoSelecionarEquipe('${orgEsc(t.manager.id)}', true)" class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition hover:bg-slate-800/60 ${i === 0 ? 'bg-amber-500/10 border border-amber-500/40' : 'border border-transparent'}">
                    <span class="w-7 text-sm font-black ${i === 0 ? 'text-amber-300' : 'text-slate-300'}">${i + 1}º</span><i class="fa-solid fa-people-group" style="color:${t.cor}"></i>
                    <span class="flex-1 text-[13px] font-bold text-white truncate">${orgEsc(t.equipe)}</span><span class="text-[13px] font-bold tabular-nums ${t.m.vgv ? 'text-white' : 'text-slate-500'}">${visaoBRL(t.m.vgv)}</span></button>`).join('')}</div>
            </div>`;

            // ---- Saúde, próximas ações, agenda, meta nacional ----
            const saude = pctReg >= 50 ? ['Saudável', 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'] : pctReg >= 30 ? ['Atenção', 'bg-amber-500/15 text-amber-300 border-amber-500/40'] : ['Crítico', 'bg-rose-500/15 text-rose-300 border-rose-500/40'];
            const focos = [];
            if (estrutura.some(t => !t.brokers.length)) focos.push('ativação das equipes sem integrantes');
            if (temAnt && M.tot.agendamentos < A.tot.agendamentos) focos.push('aumento de agendamentos');
            if (M.tot.agendamentos && M.tot.visitas / M.tot.agendamentos < 0.5) focos.push('conversão de agendamento em visita');
            if (pctReg < 50) focos.push('ativação do time em vendas');
            const acoes = [];
            estrutura.filter(t => !t.brokers.length).forEach(t => acoes.push(`Ativar equipe ${t.equipe} (sem integrantes)`));
            estrutura.filter(t => t.brokers.length && !t.m.vendas).forEach(t => acoes.push(`Acompanhar ${t.equipe}: nenhuma venda no mês`));
            if (temAnt && M.tot.agendamentos < A.tot.agendamentos) acoes.push(`Reforçar agendamentos: ${M.tot.agendamentos} vs ${A.tot.agendamentos} no mês anterior`);
            if (M.tot.agendamentos && M.tot.visitas / M.tot.agendamentos < 0.5) acoes.push(`Confirmar visitas: ${Math.round(M.tot.visitas / M.tot.agendamentos * 100)}% dos agendamentos viraram visita`);
            if (metaVgv && pctMeta < 100) acoes.push(`Faltam ${visaoBRL(metaVgv - M.tot.vgv)} para a meta regional`);
            let feitas = {};
            try { feitas = JSON.parse(localStorage.getItem(`${appId}-visao-acoes-${chaveMes}`) || '{}') || {}; } catch (e) {}
            const hojeIso = visaoIso(new Date());
            const proximas = (typeof agendaDataset !== 'undefined' ? agendaDataset : [])
                .filter(r => String(r.Data || '').slice(0, 10) >= hojeIso && !isCompareceu(r))
                .sort((a, b) => String(a.Data).localeCompare(String(b.Data)) || String(a['Horário'] || '').localeCompare(String(b['Horário'] || '')))
                .slice(0, 5);
            const rodape = `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div class="vg-card"><div class="flex items-center justify-between gap-2 mb-3"><span class="text-[14px] font-bold text-white"><i class="fa-solid fa-heart-pulse text-sky-400 mr-2"></i>Saúde da Regional</span><span class="text-[11px] font-bold border rounded-full px-2.5 py-0.5 ${saude[1]}">${saude[0]}</span></div>
                    <p class="text-[13px] text-slate-300 leading-relaxed"><b class="text-white">${pctReg}%</b> da equipe produtiva (${produtivosReg} de ${totalPessoas} com venda no mês).${focos.length ? ` Foco em ${focos.slice(0, 2).join(' e ')}.` : ' Ritmo bom — manter.'}</p></div>
                <div class="vg-card"><div class="text-[14px] font-bold text-white mb-2"><i class="fa-regular fa-square-check text-sky-400 mr-2"></i>Próximas Ações</div>
                    ${acoes.length ? `<div class="space-y-1.5">${acoes.slice(0, 5).map((a, i) => `<label class="flex items-start gap-2 text-[12px] cursor-pointer ${feitas[a] ? 'text-slate-500 line-through' : 'text-slate-200'}"><input type="checkbox" ${feitas[a] ? 'checked' : ''} onchange="marcarVisaoAcao('${chaveMes}', ${i})" class="mt-0.5 accent-amber-500">${orgEsc(a)}</label>`).join('')}</div>` : '<p class="text-[12px] text-slate-500">Nada pendente — tudo em dia.</p>'}</div>
                <div class="vg-card"><div class="text-[14px] font-bold text-white mb-2"><i class="fa-regular fa-calendar text-sky-400 mr-2"></i>Agenda da Regional</div>
                    ${proximas.length ? `<div class="space-y-1.5">${proximas.map(r => `<div class="flex items-start gap-2 text-[11px]"><span class="shrink-0 rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 font-bold text-slate-200 tabular-nums">${dataAgendaBr(r.Data).slice(0, 5)}</span><span class="text-slate-300 min-w-0"><b class="text-slate-100">${orgEsc(r.Cliente || 'Cliente')}</b> · ${orgEsc(r.Corretor || '')}${r.Empreendimento ? ` <span class="text-slate-500">· ${orgEsc(r.Empreendimento)}</span>` : ''}</span></div>`).join('')}</div>` : '<p class="text-[12px] text-slate-500">Nenhuma visita agendada daqui pra frente.</p>'}</div>
                <div class="vg-card"><div class="text-[14px] font-bold text-white mb-2"><i class="fa-solid fa-medal text-amber-400 mr-2"></i>Meta Nacional</div>
                    <div class="vg-nacional"><i class="fa-solid fa-award text-amber-400 text-2xl"></i><div><div class="text-xl font-black text-amber-300 leading-tight">Título Nacional</div><div class="text-[12px] text-slate-300">Direcional Engenharia</div></div></div></div>
            </div>`;
            window.__visaoAcoes = acoes.slice(0, 5);

            root.innerHTML = `${topo}${regional}${kpis}${gestores}<div class="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-3">${composicao}${ranking}</div>${rodape}`;
        }
        function marcarVisaoAcao(chaveMes, i) {
            const txt = (window.__visaoAcoes || [])[i]; if (!txt) return;
            const k = `${appId}-visao-acoes-${chaveMes}`;
            let feitas = {};
            try { feitas = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) {}
            if (feitas[txt]) delete feitas[txt]; else feitas[txt] = true;
            try { localStorage.setItem(k, JSON.stringify(feitas)); } catch (e) {}
            renderVisaoGeral();
        }
