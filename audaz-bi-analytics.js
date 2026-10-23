// ===== SELEÇÃO MANUAL DE MESES =====
        const IPC_MESES_LS_KEY = 'audaz-bi-v1-ipc-meses';
        let ipcMesesCustom = [];   // ex.: ['junho/2026','julho/2026']; vazio = automático

        function loadIpcMesesCustom() {
            try {
                const raw = localStorage.getItem(IPC_MESES_LS_KEY);
                ipcMesesCustom = raw ? JSON.parse(raw) : [];
                if (!Array.isArray(ipcMesesCustom)) ipcMesesCustom = [];
            } catch (e) { ipcMesesCustom = []; }
        }
        function saveIpcMesesCustom() {
            try { saveLocalSetting(IPC_MESES_LS_KEY, JSON.stringify(ipcMesesCustom)); } catch (e) {}
        }
        function ipcModoAutomatico() { return ipcMesesCustom.length === 0; }

        // Converte 'junho/2026' no formato interno { nome, ano, idx }.
        function ipcMesStrParaObj(mesStr) {
            const nome = normalizeMes(mesStr);
            const ano = getMesAno(mesStr);
            const idx = MESES_IDX[nome];
            if (idx === undefined || ano === null) return null;
            return { nome, ano, idx };
        }
        const ipcChaveMes = m => `${m.nome}/${m.ano}`;

        // Janela de 3 meses que TERMINA no mês dado (mais antigo → mais recente).
        function ipcJanelaAteMes(ref) {
            const meses = [];
            for (let i = IPC_MESES_JANELA - 1; i >= 0; i--) {
                const d = new Date(ref.ano, ref.idx - i, 1);
                meses.push({ nome: getMesName(d.getMonth() + 1), ano: d.getFullYear(), idx: d.getMonth() });
            }
            return meses;
        }

        // Janela MANUAL (a mesma pra todos), ou null no modo automático.
        function getJanelaIPCManual() {
            if (ipcModoAutomatico()) return null;
            const meses = ipcMesesCustom.map(ipcMesStrParaObj).filter(Boolean)
                .sort((a, b) => (a.ano - b.ano) || (a.idx - b.idx));
            return meses.length ? meses : null;   // seleção inválida → cai no automático
        }

        // Monta os chips de mês a partir da MESMA lista de meses comerciais dos filtros do topo
        // (#filterMes reúne Mês Cadastro + Mês Ganho) — uma única noção de "meses disponíveis".
        function renderIpcMesesPicker() {
            const box = document.getElementById('ipcMesesPicker');
            if (!box) return;
            const select = document.getElementById('filterMes');
            if (!select) return;
            const opts = Array.from(select.options).map(o => o.value).filter(Boolean)
                .map(v => ({ v, o: ipcMesStrParaObj(v) })).filter(x => x.o)
                .sort((a, b) => (b.o.ano - a.o.ano) || (b.o.idx - a.o.idx));   // mais recentes primeiro
            const auto = ipcModoAutomatico();
            const manual = getJanelaIPCManual();

            const btnAuto = `<button type="button" onclick="ipcUsarAutomatico()" title="Regra oficial: janela móvel do mês atual — 3 meses anteriores; o mês atual entra pra quem tem venda nele"
                class="px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${auto
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'}">
                <i class="fa-solid fa-bolt-lightning mr-1" style="font-size:9px"></i>Automático · mês atual</button>
                <span class="h-4 w-px bg-slate-800 mx-0.5"></span>
                <span class="text-[9px] font-bold text-slate-600 uppercase tracking-wider">ou fixar meses:</span>`;

            const chips = opts.map(({ v }) => {
                const escolhido = !auto && ipcMesesCustom.includes(v);
                const cls = escolhido
                    ? 'bg-brand-600 border-brand-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200';
                return `<button type="button" onclick="ipcToggleMes('${v.replace(/'/g, "\\'")}')"
                    class="px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${cls}">${mesLabelAbbrev(v)}</button>`;
            }).join('');

            box.innerHTML = btnAuto + chips;

            const aviso = document.getElementById('ipcMesesAviso');
            if (aviso) {
                aviso.textContent = auto
                    ? 'Automático: janela dos 3 meses anteriores ao mês atual. Quem tem venda no mês atual usa mês atual + 2 anteriores (o mês atual entra, o mais antigo sai).'
                    : (manual && manual.length === 1
                        ? 'Meses fixados a mão: 1 mês, o mesmo pra todos, dividindo por 1.'
                        : `Meses fixados a mão: ${manual ? manual.length : 0} meses, os mesmos pra todos, dividindo por ${manual ? manual.length : 1}.`);
                aviso.className = auto ? 'text-[10px] text-emerald-500/80' : 'text-[10px] text-brand-400 font-semibold';
            }
        }

        function ipcToggleMes(mesStr) {
            const i = ipcMesesCustom.indexOf(mesStr);
            if (i >= 0) ipcMesesCustom.splice(i, 1); else ipcMesesCustom.push(mesStr);
            saveIpcMesesCustom();
            drawTables();
        }
        function ipcUsarAutomatico() {
            ipcMesesCustom = [];
            saveIpcMesesCustom();
            drawTables();
        }

        function fmtIPC(v) {
            return (v || 0).toFixed(2).replace('.', ',');
        }

        // Rótulo curto da janela, ex.: "Jul + Ago + Set/2026"
        function ipcJanelaTexto(janela) {
            if (!janela || !janela.length) return '—';
            return janela.map(m => m.nome.slice(0, 3)).join(' + ') + '/' + janela[janela.length - 1].ano;
        }
        const ipcMesCurto = m => m ? `${m.nome.slice(0, 3)}/${String(m.ano).slice(-2)}` : '—';

        // Faixa do corretor em relação à média da equipe — a MESMA escala na barra, no badge e na
        // legenda. IPC 0,00 é CRÍTICO, não "neutro": num KPI de produtividade, zero é a informação
        // mais forte que existe.
        function ipcFaixa(ipc, media) {
            if (media > 0 && ipc >= media * 1.25) return 'otimo';
            if (media > 0 && ipc >= media) return 'bom';
            if (ipc > 0 && media > 0 && ipc >= media * 0.6) return 'atencao';
            return 'critico';
        }
        const IPC_CORES = {
            otimo:   { badge: 'bg-emerald-500/15 text-emerald-400', barra: 'bg-emerald-500', texto: 'text-emerald-400' },
            bom:     { badge: 'bg-brand-500/15 text-brand-400',     barra: 'bg-brand-500',   texto: 'text-brand-400' },
            atencao: { badge: 'bg-amber-500/15 text-amber-400',     barra: 'bg-amber-500',   texto: 'text-amber-400' },
            critico: { badge: 'bg-rose-500/15 text-rose-400',       barra: 'bg-rose-500',    texto: 'text-rose-400' }
        };
        function ipcBadge(ipc, media) {
            return IPC_CORES[ipcFaixa(ipc, media)].badge;
        }

        // Snapshot do render atual — calculado uma vez em drawTables() e reaproveitado pela tabela do
        // Ranking Geral, pela seção do IPC e pela Tela (TV).
        let ipcSnapshot = { modo: 'auto', janelaManual: null, divisor: 3, lista: [], porCorretor: {}, mediaEquipe: 0, totalVendas: 0 };

        function calcularIPC(refDate) {
            const janelaManual = getJanelaIPCManual();
            const modo = janelaManual ? 'manual' : 'auto';
            const novo = nome => ({ corretor: nome, ativo: true, vendas3m: 0, vgv3m: 0, ipc: 0, porMes: {},
                                    ultimaVenda: null, mesReferencia: null, janela: null, divisor: IPC_MESES_JANELA });
            const mapa = {};
            // Roster: SÓ corretores ATIVOS, pré-cadastrados com IPC 0,00 — produtividade zero é
            // informação de gestão, não um vazio.
            // ⚠️ EXCEÇÃO à regra "DESATIVAR ≠ EXCLUIR" (pedido do usuário em 09/09/2026, mesma do Mapa
            // de Calor): o desativado NÃO entra no IPC mesmo tendo vendido — o IPC é KPI da equipe
            // ATUAL; manter quem saiu distorceria a média e cobraria produtividade de quem não vende
            // mais. O histórico dele segue intacto em todo o resto do BI.
            getActiveCorretores().forEach(nome => { mapa[nome] = novo(nome); });

            // 1) Coleta as vendas de cada corretor ativo (só GANHO/VENDA, por Mês Ganho).
            const vendasPor = {};
            (filteredDataset || []).forEach(row => {
                const c = row.Corretor;
                if (!c || !isCorretorActive(c)) return;
                if (!isVendaModo(row)) return;             // nunca lead, visita, análise ou proposta
                const m = ipcMesStrParaObj(row['Mês Ganho']);
                if (!m) return;
                if (!mapa[c]) mapa[c] = novo(c);
                (vendasPor[c] = vendasPor[c] || []).push({ row, m, data: parseDate(row['Data Ganho']) });
            });

            // Mês ATUAL da operação = mês comercial em foco no BI. Mês anterior = âncora de quem
            // não tem resultado no atual.
            const base = refDate || currentRefDate || new Date();
            const mesAtual = { nome: getMesName(base.getMonth() + 1), ano: base.getFullYear(), idx: base.getMonth() };
            const dAnt = new Date(base.getFullYear(), base.getMonth() - 1, 1);
            const mesAnterior = { nome: getMesName(dAnt.getMonth() + 1), ano: dAnt.getFullYear(), idx: dAnt.getMonth() };
            const chaveAtual = ipcChaveMes(mesAtual);

            // 2) Janela de cada corretor + contagem dentro dela.
            Object.values(mapa).forEach(c => {
                const vendas = vendasPor[c.corretor] || [];
                // Última venda (data real): só informação pra tabela — NÃO é a âncora da janela.
                vendas.forEach(v => { if (v.data && (!c.ultimaVenda || v.data > c.ultimaVenda)) c.ultimaVenda = v.data; });
                // Tem resultado no mês atual? Então o mês atual entra na janela e o mais antigo sai.
                c.temNoMesAtual = vendas.some(v => ipcChaveMes(v.m) === chaveAtual);
                c.mesReferencia = c.temNoMesAtual ? mesAtual : mesAnterior;
                c.janela = modo === 'manual' ? janelaManual : ipcJanelaAteMes(c.mesReferencia);
                if (c.janela) {
                    c.janela.forEach(m => { c.porMes[ipcChaveMes(m)] = 0; });
                    vendas.forEach(v => {
                        const k = ipcChaveMes(v.m);
                        if (k in c.porMes) { c.porMes[k]++; c.vendas3m++; c.vgv3m += getVGV(v.row); }
                    });
                }
                // Divisor = quantidade de meses da janela (3 no automático; o escolhido no manual).
                // O IPC é média mensal — dividir por 3 uma janela de 2 ou 6 meses não teria sentido.
                c.divisor = Math.max(1, c.janela ? c.janela.length : IPC_MESES_JANELA);
                c.ipc = c.vendas3m / c.divisor;
            });

            const lista = Object.values(mapa).sort((a, b) =>
                (b.ipc - a.ipc) || (b.vgv3m - a.vgv3m) ||
                ((b.ultimaVenda ? b.ultimaVenda.getTime() : 0) - (a.ultimaVenda ? a.ultimaVenda.getTime() : 0)) ||
                a.corretor.localeCompare(b.corretor));
            lista.forEach((c, i) => { c.posicao = i + 1; });
            const totalVendas = lista.reduce((s, c) => s + c.vendas3m, 0);
            // Média da equipe = IPC médio entre os corretores listados (régua da comparação visual).
            const mediaEquipe = lista.length ? lista.reduce((s, c) => s + c.ipc, 0) / lista.length : 0;
            const porCorretor = {};
            lista.forEach(c => { porCorretor[c.corretor] = c; });
            const divisor = janelaManual ? Math.max(1, janelaManual.length) : IPC_MESES_JANELA;
            return { modo, janelaManual, divisor, lista, porCorretor, mediaEquipe, totalVendas };
        }

        // Tabela do IPC (o que o usuário pediu pra ver): Ranking · Corretor · Última venda · Mês de
        // referência · Mês 1/2/3 (com as vendas de cada um) · Vendas 3M · IPC com barra comparativa
        // contra a média da equipe. Lê o ipcSnapshot já calculado em drawTables().
        function renderIPCComparativo() {
            const box = document.getElementById('ipcRankingList');
            if (!box) return;
            const snap = ipcSnapshot || { lista: [], mediaEquipe: 0, totalVendas: 0, divisor: 3, modo: 'auto' };
            const media = snap.mediaEquipe || 0;
            const auto = snap.modo !== 'manual';
            const divisor = snap.divisor || IPC_MESES_JANELA;

            const hint = document.getElementById('ipcJanelaHint');
            if (hint) hint.textContent = auto ? 'Janela móvel do mês atual, individual por corretor.' : 'Janela fixa: ' + ipcJanelaTexto(snap.janelaManual);
            const formula = document.getElementById('ipcFormulaHint');
            if (formula) {
                formula.textContent = auto
                    ? 'Média dos 3 meses: os 3 anteriores ao mês atual — ou mês atual + 2 anteriores pra quem vendeu neste mês. Vendas ÷ 3.'
                    : (divisor === 1
                        ? 'Vendas do mês fixado ÷ 1 = média de vendas por mês.'
                        : `Vendas dos ${divisor} meses fixados ÷ ${divisor} = média de vendas por mês.`);
            }
            renderIpcMesesPicker();
            const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            setTxt('ipcMediaEquipe', fmtIPC(media));
            setTxt('ipcTotalVendas', snap.totalVendas || 0);
            setTxt('ipcTotalVendasLabel', `Vendas ${divisor}M`);
            const thJanela = document.getElementById('thVendasJanelaIPC');
            if (thJanela) {
                thJanela.textContent = `Vendas ${divisor}M`;
                thJanela.title = auto
                    ? 'Vendas na janela do IPC: 3 meses anteriores ao atual, ou mês atual + 2 anteriores se o corretor vendeu neste mês (independente do período filtrado acima)'
                    : `Vendas em ${ipcJanelaTexto(snap.janelaManual)} — janela fixa do IPC, independente do período filtrado acima`;
            }
            setTxt('ipcAcimaCount', snap.lista.filter(c => c.ipc >= media && media > 0).length);
            setTxt('ipcAbaixoCount', snap.lista.filter(c => c.ipc < media).length);

            if (!snap.lista.length) {
                box.innerHTML = `<p class="text-center py-6 text-slate-500 text-xs">Sem corretores para calcular o IPC neste recorte.</p>`;
                return;
            }
            // Escala das barras: o maior IPC ocupa 100%, piso 1,00 pra não inflar um trimestre fraco.
            const maxIpc = Math.max(1, ...snap.lista.map(c => c.ipc));
            const pctMedia = (media / maxIpc) * 100;
            const hojeIPC = isMockDataActive ? new Date(2026, 5, 9) : new Date();
            hojeIPC.setHours(0, 0, 0, 0);

            // Mês 1 = mês de referência (o mais recente da janela), Mês 2 = anterior, Mês 3 = o mais antigo.
            const celMes = (c, k) => {
                const m = c.janela ? c.janela[c.janela.length - 1 - k] : null;
                if (!m) return `<td class="py-2 text-center text-slate-700">—</td>`;
                const v = c.porMes[ipcChaveMes(m)] || 0;
                return `<td class="py-2 text-center whitespace-nowrap">
                    <span class="text-[10px] text-slate-500">${ipcMesCurto(m)}</span>
                    <span class="ml-1 font-extrabold tabular-nums ${v > 0 ? 'text-emerald-400' : 'text-slate-600'}">${v}</span>
                </td>`;
            };
            const colsMes = auto ? 3 : Math.max(1, divisor);

            const linhas = snap.lista.map(c => {
                const cor = IPC_CORES[ipcFaixa(c.ipc, media)];
                const pct = c.ipc > 0 ? Math.max(2, (c.ipc / maxIpc) * 100) : 0;
                const diasDesde = c.ultimaVenda ? Math.round((hojeIPC - c.ultimaVenda) / 86400000) : null;
                // Última venda antiga (>45/>90 dias) em destaque: informação de gestão (a janela NÃO depende dela).
                const corUltima = diasDesde === null ? 'text-slate-600' : (diasDesde > 90 ? 'text-rose-400' : (diasDesde > 45 ? 'text-amber-400' : 'text-slate-200'));
                const ultimaTxt = c.ultimaVenda ? formatDate(c.ultimaVenda) : 'nunca';
                const ultimaSub = diasDesde === null ? '' : `<span class="block text-[9px] text-slate-500">há ${diasDesde} dia${diasDesde === 1 ? '' : 's'}</span>`;
                const mesesTds = Array.from({ length: colsMes }, (_, k) => celMes(c, k)).join('');
                return `
                <tr class="border-b border-slate-800/40 hover:bg-slate-900/40 transition">
                    <td class="py-2 pl-2 text-[11px] font-black ${c.posicao <= 3 ? 'text-amber-400' : 'text-slate-500'}">${c.posicao}º</td>
                    <td class="py-2 text-[11px] font-semibold text-slate-200 whitespace-nowrap">${c.corretor}</td>
                    <td class="py-2 text-center text-[11px] font-bold tabular-nums ${corUltima}">${ultimaTxt}${ultimaSub}</td>
                    <td class="py-2 text-center text-[11px] font-bold text-slate-300">${ipcMesCurto(c.mesReferencia)}</td>
                    ${mesesTds}
                    <td class="py-2 text-center text-[11px] font-extrabold text-slate-300 tabular-nums">${c.vendas3m}</td>
                    <td class="py-2 pr-2">
                        <div class="flex items-center gap-2">
                            <div class="flex-1 h-4 bg-slate-950/70 rounded-md relative overflow-hidden border border-slate-800/60 min-w-[70px]">
                                <div class="h-full ${cor.barra} rounded-md transition-all duration-500" style="width:${pct}%"></div>
                                ${media > 0 ? `<div class="absolute top-0 bottom-0 w-px bg-white/70" style="left:${Math.min(99.5, pctMedia)}%"></div>` : ''}
                            </div>
                            <span class="w-11 text-right text-[12px] font-black tabular-nums ${cor.texto}">${fmtIPC(c.ipc)}</span>
                        </div>
                    </td>
                </tr>`;
            }).join('');

            const thMeses = Array.from({ length: colsMes }, (_, k) =>
                `<th class="pb-2 text-center" title="${k === 0 ? 'Mês de referência (o mais recente da janela)' : k + ' mês(es) antes da referência'}">Mês ${k + 1}</th>`).join('');

            box.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="border-b border-slate-800/80 text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                            <th class="pb-2 pl-2">Rank</th>
                            <th class="pb-2">Corretor</th>
                            <th class="pb-2 text-center" title="Data Ganho da venda mais recente — só informação, NÃO é a âncora da janela">Última venda</th>
                            <th class="pb-2 text-center" title="Mês que fecha a janela: o mês atual se o corretor vendeu nele, senão o mês anterior">Mês ref.</th>
                            ${thMeses}
                            <th class="pb-2 text-center">Vendas ${divisor}M</th>
                            <th class="pb-2 pr-2 w-[26%]">IPC ${divisor}M · vs média da equipe</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>`;
        }

        // Ordenação dos rankings (corretores e equipes)
        let rankSort = 'vgv'; // vgv | vendas | aprovacoes | analises | agendamentos | compareceu | ipc
        function rankSorter(a, b) {
            const diff = (b[rankSort] || 0) - (a[rankSort] || 0);
            if (diff !== 0) return diff;
            // tie-breakers
            return (b.vgv - a.vgv) || (b.vendas - a.vendas) || (b.analises - a.analises);
        }
        function setRankSort(campo) {
            rankSort = campo;
            // atualiza visual dos botões
            ['analises','aprovacoes','vendas','agendamentos','compareceu','vgv','ipc'].forEach(k => {
                const b = document.getElementById('rankSort-' + k);
                if (b) b.className = (k === campo)
                    ? 'rank-sort-btn px-2 py-0.5 rounded text-[10px] font-bold bg-brand-500 text-white transition'
                    : 'rank-sort-btn px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 hover:text-slate-200 transition';
            });
            drawTables();
        }

        // Cache das linhas (clientes) por trás de cada número dos Rankings Comerciais — usado pelo
        // clique nas colunas Análises/Aprovações/Vendas pra abrir o detalhamento (ver openRankingDetail).
        let rankingRowsCache = { corretor: {}, equipe: {} };

        function openRankingDetail(tipo, nome, metrica) {
            const cache = rankingRowsCache[tipo] && rankingRowsCache[tipo][nome];
            const rows = (cache && cache[metrica]) || [];
            const metricaLbl = { analises: 'Análises', aprovacoes: 'Aprovações', vendas: 'Vendas' }[metrica] || metrica;
            showDetailModal({
                label1: tipo === 'corretor' ? 'Corretor' : 'Equipe',
                label2: 'Métrica',
                nome: tipo === 'corretor' ? nome : `Equipe ${nome}`,
                dataStr: metricaLbl,
                rows, showCorretor: tipo === 'equipe',
                totalLabel: `${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}`
            });
        }

        // Abre o detalhamento de clientes por trás do número "Feito" de um card dos Rankings
        // Rápidos (Prospecção/Agendamentos/Compareceu/Análises/Aprovações/Vendas × Hoje/Semana/
        // Mês) — lê de quickRankingRowsCache, preenchido linha a linha dentro de drawQuickRankings()
        // com os MESMOS critérios usados pra contar, então o modal sempre bate com o número clicado.
        function openQuickRankingDetail(cardKey, nome, cardTitle) {
            const cache = quickRankingRowsCache[cardKey] && quickRankingRowsCache[cardKey][nome];
            const rows = cache || [];
            showDetailModal({
                label1: 'Corretor', label2: 'Período',
                nome, dataStr: cardTitle || cardKey,
                rows, showCorretor: false,
                totalLabel: `${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}`
            });
        }

        function drawTables() {
            const searchCorretorTerm = document.getElementById('searchCorretor').value.toLowerCase();
            const searchEquipeTerm = document.getElementById('searchEquipe').value.toLowerCase();
            const selectedTeamFilter = document.getElementById('filterEquipe').value;

            const refDateTables = currentRefDate;
            rankingRowsCache = { corretor: {}, equipe: {} };
            const getCorrCache = nome => (rankingRowsCache.corretor[nome] = rankingRowsCache.corretor[nome] || { analises: [], aprovacoes: [], vendas: [], agendamentos: [], compareceu: [] });
            const getEqCache = nome => (rankingRowsCache.equipe[nome] = rankingRowsCache.equipe[nome] || { analises: [], aprovacoes: [], vendas: [] });

            let corretoresMap = {};
            // Pré-cadastra todos os corretores ATIVOS (assim os pré-cadastrados aparecem com 0)
            getActiveCorretores().forEach(nome => {
                if (!personMatchesOrgDashboardScope(nome)) return;
                if (selectedTeamFilter && rankingTeamKey(getRankingTeamForBroker(nome)) !== rankingTeamKey(selectedTeamFilter)) return;
                corretoresMap[nome] = { corretor: nome, analises: 0, aprovacoes: 0, vendas: 0, agendamentos: 0, compareceu: 0, vgv: 0 };
            });

            filteredDataset.forEach(row => {
                const c = row.Corretor;
                if (!personMatchesOrgDashboardScope(c)) return;
                if (selectedTeamFilter && rankingTeamKey(getRankingTeamForBroker(c)) !== rankingTeamKey(selectedTeamFilter)) return;
                // DESATIVAR ≠ EXCLUIR: a produção já realizada (análises, aprovações, vendas, VGV)
                // continua contando aqui mesmo se o corretor foi desativado depois. Só os ATIVOS são
                // pré-cadastrados com zero acima, então quem saiu deixa de aparecer nos períodos em
                // que não produziu, sem nunca sumir do histórico em que produziu.

                // Análises/Aprovações: por safra (Mês Cadastro)
                if (metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', refDateTables)) {
                    if (!corretoresMap[c]) corretoresMap[c] = { corretor: c, analises: 0, aprovacoes: 0, vendas: 0, agendamentos: 0, compareceu: 0, vgv: 0 };
                    corretoresMap[c].analises++;
                    getCorrCache(c).analises.push(row);
                }
                // Aprovações: por DATA DE APROVAÇÃO (quando aprovou)
                if (isAprovadoNoPeriodo(row, refDateTables)) {
                    if (!corretoresMap[c]) corretoresMap[c] = { corretor: c, analises: 0, aprovacoes: 0, vendas: 0, agendamentos: 0, compareceu: 0, vgv: 0 };
                    corretoresMap[c].aprovacoes++;
                    getCorrCache(c).aprovacoes.push(row);
                }

                // Vendas/VGV: conforme o modo (toggle), por Mês Ganho (faturamento)
                if (isVendaModo(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', refDateTables)) {
                    if (!corretoresMap[c]) corretoresMap[c] = { corretor: c, analises: 0, aprovacoes: 0, vendas: 0, agendamentos: 0, compareceu: 0, vgv: 0 };
                    corretoresMap[c].vendas++;
                    corretoresMap[c].vgv += getVGV(row);
                    getCorrCache(c).vendas.push(row);
                }
            });

            // Agendamentos contam pela data em que foram marcados; visitas pela data em que ocorreram.
            // A composição do time vem do organograma, igual ao filtro e ao ranking de equipes.
            const refDateAgendaRank = currentRefDateAgenda || refDateTables;
            filteredAgendaDataset.forEach(row => {
                const nome = row.Corretor;
                if (!nome || !personMatchesOrgDashboardScope(nome)) return;
                if (selectedTeamFilter && rankingTeamKey(getRankingTeamForBroker(nome)) !== rankingTeamKey(selectedTeamFilter)) return;
                const agendado = agendaMatchesRef(row, refDateAgendaRank, 'agendamentos');
                const visitou = isCompareceu(row) && agendaMatchesRef(row, refDateAgendaRank, 'compareceu');
                if (!agendado && !visitou) return;
                if (!corretoresMap[nome]) corretoresMap[nome] = { corretor: nome, analises: 0, aprovacoes: 0, vendas: 0, agendamentos: 0, compareceu: 0, vgv: 0 };
                if (agendado) { corretoresMap[nome].agendamentos++; getCorrCache(nome).agendamentos.push(row); }
                if (visitou) { corretoresMap[nome].compareceu++; getCorrCache(nome).compareceu.push(row); }
            });

            // IPC (janela móvel de 3 meses comerciais) — calculado uma vez por render e anexado a
            // cada corretor da tabela. Repare que é uma janela DIFERENTE da das colunas Análises/
            // Aprovações/Vendas (que seguem o período filtrado): o IPC é sempre trimestral.
            ipcSnapshot = calcularIPC(refDateTables);
            Object.values(corretoresMap).forEach(c => {
                const ipcRow = ipcSnapshot.porCorretor[c.corretor];
                c.vendas3m = ipcRow ? ipcRow.vendas3m : 0;
                c.ipc = ipcRow ? ipcRow.ipc : 0;
                c.ipcJanelaTxt = ipcRow ? ipcJanelaTexto(ipcRow.janela) : '—';
                c.ipcDivisor = ipcRow ? ipcRow.divisor : IPC_MESES_JANELA;
                // O corretor desativado continua na tabela pelo histórico (Análises/Aprovações/
                // Vendas/VGV), mas o IPC não se aplica a ele — mostrar "0,00" seria mentira, pois
                // ele pode ter vendido dentro da janela. Marca pra renderizar "—".
                c.ipcNaoSeAplica = !isCorretorActive(c.corretor);
            });

            let rankingCorretores = Object.values(corretoresMap)
                .filter(c => c.corretor && personMatchesOrgDashboardScope(c.corretor) && (!selectedTeamFilter || rankingTeamKey(getRankingTeamForBroker(c.corretor)) === rankingTeamKey(selectedTeamFilter)) && c.corretor.toLowerCase().includes(searchCorretorTerm))
                .sort(rankSorter);

            const corrBody = document.getElementById('rankingCorretoresBody');
            corrBody.innerHTML = '';

            if (rankingCorretores.length === 0) {
                corrBody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-slate-500">Nenhum corretor encontrado.</td></tr>`;
            } else {
                rankingCorretores.forEach((c, index) => {
                    const conversao = c.analises > 0 ? ((c.vendas / c.analises) * 100).toFixed(1) : 0;
                    let badgeClass = "text-slate-400";
                    if (index === 0) badgeClass = "text-amber-400 font-extrabold";
                    if (index === 1) badgeClass = "text-slate-300 font-extrabold";
                    if (index === 2) badgeClass = "text-amber-600 font-extrabold";
                    const nomeEsc = c.corretor.replace(/'/g, "\\'");

                    const rowHtml = `
                        <tr class="hover:bg-slate-900/30 transition border-b border-slate-800/20">
                            <td class="py-3 pl-2 font-bold ${badgeClass}">${index + 1}º</td>
                            <td class="py-3 font-semibold text-slate-200">${c.corretor}</td>
                            <td class="py-3 text-center text-slate-400 ${c.analises > 0 ? 'cursor-pointer hover:text-white hover:underline' : ''}" ${c.analises > 0 ? `onclick="openRankingDetail('corretor','${nomeEsc}','analises')"` : ''} title="${c.analises > 0 ? 'Ver clientes' : ''}">${c.analises}</td>
                            <td class="py-3 text-center text-amber-500 font-semibold ${c.aprovacoes > 0 ? 'cursor-pointer hover:text-amber-300 hover:underline' : ''}" ${c.aprovacoes > 0 ? `onclick="openRankingDetail('corretor','${nomeEsc}','aprovacoes')"` : ''} title="${c.aprovacoes > 0 ? 'Ver clientes' : ''}">${c.aprovacoes}</td>
                            <td class="py-3 text-center text-brand-500 font-bold ${c.vendas > 0 ? 'cursor-pointer hover:text-brand-300 hover:underline' : ''}" ${c.vendas > 0 ? `onclick="openRankingDetail('corretor','${nomeEsc}','vendas')"` : ''} title="${c.vendas > 0 ? 'Ver clientes' : ''}">${c.vendas}</td>
                            <td class="py-3 text-center text-violet-400 font-semibold">${c.agendamentos || 0}</td>
                            <td class="py-3 text-center text-cyan-400 font-semibold">${c.compareceu || 0}</td>
                            <td class="py-3 text-center font-medium">${conversao}%</td>
                            <td class="py-3 text-center text-slate-400">${c.ipcNaoSeAplica ? '<span class="text-slate-600">—</span>' : (c.vendas3m || 0)}</td>
                            <td class="py-3 text-center">
                                ${c.ipcNaoSeAplica
                                    ? `<span class="inline-block min-w-[3rem] px-1.5 py-0.5 rounded text-slate-600" title="Corretor desativado — o IPC mede a produtividade da equipe atual e não se aplica a ele. O histórico dele segue nas demais colunas.">—</span>`
                                    : `<span class="inline-block min-w-[3rem] px-1.5 py-0.5 rounded font-extrabold tabular-nums ${ipcBadge(c.ipc, ipcSnapshot.mediaEquipe)}" title="${(c.vendas3m || 0)} venda(s) em ${c.ipcJanelaTxt} ÷ ${c.ipcDivisor} — média da equipe: ${fmtIPC(ipcSnapshot.mediaEquipe)}">${fmtIPC(c.ipc)}</span>`}
                            </td>
                            <td class="py-3 text-right pr-2 font-bold text-indigo-400 whitespace-nowrap">${formatBRL(c.vgv)}</td>
                        </tr>
                    `;
                    corrBody.insertAdjacentHTML('beforeend', rowHtml);
                });
            }

            renderIPCComparativo();

            const configuredRankingTeams = getConfiguredRankingTeams();
            let equipesMap = Object.fromEntries(configuredRankingTeams.map(team => [team, { equipe:team, agendamentos:0, compareceu:0, analises:0, aprovacoes:0, vendas:0, vgv:0 }]));
            filteredDataset.forEach(row => {
                // Usa o vínculo corretor → gerente → equipe do organograma como fonte única.
                // getRankingTeamForBroker também canonicaliza variantes como IMPARÁVEIS/IMPARAVEIS.
                const eq = row.Corretor ? getRankingTeamForBroker(row.Corretor) : '';
                if (!eq) return;

                // Análises/Aprovações: por safra (Mês Cadastro)
                if (metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', refDateTables)) {
                    if (!equipesMap[eq]) equipesMap[eq] = { equipe: eq, agendamentos: 0, compareceu: 0, analises: 0, aprovacoes: 0, vendas: 0, vgv: 0 };
                    equipesMap[eq].analises++;
                    getEqCache(eq).analises.push(row);
                }
                // Aprovações: por DATA DE APROVAÇÃO (quando aprovou)
                if (isAprovadoNoPeriodo(row, refDateTables)) {
                    if (!equipesMap[eq]) equipesMap[eq] = { equipe: eq, agendamentos: 0, compareceu: 0, analises: 0, aprovacoes: 0, vendas: 0, vgv: 0 };
                    equipesMap[eq].aprovacoes++;
                    getEqCache(eq).aprovacoes.push(row);
                }

                // Vendas/VGV: conforme o modo (toggle), por Mês Ganho (faturamento)
                if (isVendaModo(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', refDateTables)) {
                    if (!equipesMap[eq]) equipesMap[eq] = { equipe: eq, agendamentos: 0, compareceu: 0, analises: 0, aprovacoes: 0, vendas: 0, vgv: 0 };
                    equipesMap[eq].vendas++;
                    equipesMap[eq].vgv += getVGV(row);
                    getEqCache(eq).vendas.push(row);
                }
            });

            // Agendamentos e visitas vêm da Agenda de Visitas, mas usam o mesmo vínculo
            // corretor → gerente → equipe do organograma usado pelas demais colunas.
            filteredAgendaDataset.forEach(row => {
                if (!agendaMatchesRef(row, currentRefDateAgenda || refDateTables, 'agendamentos') && !(isCompareceu(row) && agendaMatchesRef(row, currentRefDateAgenda || refDateTables, 'compareceu'))) return;
                const eq = row.Corretor ? getRankingTeamForBroker(row.Corretor) : '';
                if (!eq || (selectedTeamFilter && rankingTeamKey(eq) !== rankingTeamKey(selectedTeamFilter))) return;
                if (!equipesMap[eq]) equipesMap[eq] = { equipe: eq, agendamentos: 0, compareceu: 0, analises: 0, aprovacoes: 0, vendas: 0, vgv: 0 };
                if (agendaMatchesRef(row, currentRefDateAgenda || refDateTables, 'agendamentos')) equipesMap[eq].agendamentos++;
                if (isCompareceu(row) && agendaMatchesRef(row, currentRefDateAgenda || refDateTables, 'compareceu')) equipesMap[eq].compareceu++;
            });

            let rankingEquipes = Object.values(equipesMap)
                .filter(eq => eq.equipe.toLowerCase().includes(searchEquipeTerm))
                .sort(rankSorter);

            const eqBody = document.getElementById('rankingEquipesBody');
            eqBody.innerHTML = '';

            if (rankingEquipes.length === 0) {
                eqBody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-slate-500">Nenhuma equipe encontrada.</td></tr>`;
            } else {
                rankingEquipes.forEach((eq, index) => {
                    const conversao = eq.analises > 0 ? ((eq.vendas / eq.analises) * 100).toFixed(1) : 0;
                    let badgeClass = "text-slate-400";
                    if (index === 0) badgeClass = "text-amber-400 font-extrabold";
                    if (index === 1) badgeClass = "text-slate-300 font-extrabold";
                    const eqEsc = eq.equipe.replace(/'/g, "\\'");

                    const rowHtml = `
                        <tr class="hover:bg-slate-900/30 transition border-b border-slate-800/20">
                            <td class="py-3 pl-2 font-bold ${badgeClass}">${index + 1}º</td>
                            <td class="py-3 font-semibold text-slate-200">Equipe ${eq.equipe}</td>
                            <td class="py-3 text-center text-violet-400 font-semibold">${eq.agendamentos || 0}</td>
                            <td class="py-3 text-center text-cyan-400 font-semibold">${eq.compareceu || 0}</td>
                            <td class="py-3 text-center text-slate-400 ${eq.analises > 0 ? 'cursor-pointer hover:text-white hover:underline' : ''}" ${eq.analises > 0 ? `onclick="openRankingDetail('equipe','${eqEsc}','analises')"` : ''} title="${eq.analises > 0 ? 'Ver clientes' : ''}">${eq.analises}</td>
                            <td class="py-3 text-center text-amber-500 font-semibold ${eq.aprovacoes > 0 ? 'cursor-pointer hover:text-amber-300 hover:underline' : ''}" ${eq.aprovacoes > 0 ? `onclick="openRankingDetail('equipe','${eqEsc}','aprovacoes')"` : ''} title="${eq.aprovacoes > 0 ? 'Ver clientes' : ''}">${eq.aprovacoes}</td>
                            <td class="py-3 text-center text-brand-500 font-bold ${eq.vendas > 0 ? 'cursor-pointer hover:text-brand-300 hover:underline' : ''}" ${eq.vendas > 0 ? `onclick="openRankingDetail('equipe','${eqEsc}','vendas')"` : ''} title="${eq.vendas > 0 ? 'Ver clientes' : ''}">${eq.vendas}</td>
                            <td class="py-3 text-center font-medium">${conversao}%</td>
                            <td class="py-3 text-right pr-2 font-bold text-indigo-400 whitespace-nowrap">${formatBRL(eq.vgv)}</td>
                        </tr>
                    `;
                    eqBody.insertAdjacentHTML('beforeend', rowHtml);
                });
            }
        }

        let charts = {};

        // ===== PERFORMANCE DOS GRÁFICOS =====
        // São 9 gráficos Chart.js responsivos na tela. No padrão do Chart.js cada um anima 1000ms a
        // cada (re)desenho — então esconder a barra lateral ou trocar de aba disparava 9 animações
        // de 1 segundo ao mesmo tempo (o layout muda → todos re-renderizam), o que travava a
        // interface visivelmente. Medido: cada troca de aba gerava "long tasks" de 74-93ms.
        // Animação curta (250ms) mantém a sensação de fluidez, e no RESIZE ela é zerada — redesenhar
        // por mudança de tamanho não precisa de animação nenhuma, é justamente o caso que travava.
        if (window.Chart && Chart.defaults) {
            Chart.defaults.animation.duration = 250;
            if (Chart.defaults.transitions && Chart.defaults.transitions.resize) {
                Chart.defaults.transitions.resize.animation.duration = 0;
            }
        }

        // Mini gráfico de linha (SVG puro, sem Chart.js) usado dentro dos cards de tendência.
        function renderSparklineSvg(serie, color) {
            if (!serie || serie.length < 2) return '';
            const colorHex = { sky: '#38bdf8', amber: '#fbbf24', brand: '#10b981', indigo: '#818cf8', pink: '#f472b6', violet: '#a78bfa', cyan: '#22d3ee' }[color] || '#94a3b8';
            const w = 64, h = 32, pad = 3;
            const max = Math.max(...serie, 1);
            const min = Math.min(...serie, 0);
            const range = (max - min) || 1;
            const step = (w - pad * 2) / (serie.length - 1);
            const pts = serie.map((v, i) => {
                const x = pad + i * step;
                const y = h - pad - ((v - min) / range) * (h - pad * 2);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            }).join(' ');
            return `<svg viewBox="0 0 ${w} ${h}" class="w-full h-full"><polyline points="${pts}" fill="none" stroke="${colorHex}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
        }

        // Ordem/identidade visual das 6 etapas do funil, reaproveitada pelos cards de tendência,
        // pela tabela de conversão e pelas atividades recentes — mesmas cores/ícones do Funil de
        // Vendas (drawFunnel) e dos Rankings Rápidos, pra nunca ter uma cor "nova" pra mesma etapa.
        const FUNIL_ETAPAS = [
            { key: 'prospeccao',   label: 'Prospecção',   icon: 'fa-bullhorn',              color: 'pink' },
            { key: 'agendamentos', label: 'Agendamentos', icon: 'fa-calendar-check',        color: 'violet' },
            { key: 'compareceu',   label: 'Compareceu',   icon: 'fa-door-open',             color: 'cyan' },
            { key: 'analises',     label: 'Análises',      icon: 'fa-file-invoice-dollar',   color: 'sky' },
            { key: 'aprovacoes',   label: 'Aprovações',    icon: 'fa-circle-check',          color: 'amber' },
            { key: 'vendas',       label: 'Vendas',        icon: 'fa-house-circle-check',    color: 'brand' }
        ];
        const FUNIL_CORES = {
            pink:   { text: 'text-pink-400',   border: 'border-pink-500/20',   bar: 'bg-pink-500', tint: 'bg-pink-500/10', solid: 'bg-pink-500', gradient: 'from-pink-600 to-pink-400', progress: 'from-pink-500 to-pink-300', hex: '#ec4899' },
            violet: { text: 'text-violet-400', border: 'border-violet-500/20', bar: 'bg-violet-500', tint: 'bg-violet-500/10', solid: 'bg-violet-500', gradient: 'from-violet-700 to-violet-500', progress: 'from-violet-500 to-violet-300', hex: '#8b5cf6' },
            cyan:   { text: 'text-cyan-400',   border: 'border-cyan-500/20',   bar: 'bg-cyan-500', tint: 'bg-cyan-500/10', solid: 'bg-cyan-500', gradient: 'from-cyan-700 to-cyan-500', progress: 'from-cyan-500 to-cyan-300', hex: '#06b6d4' },
            sky:    { text: 'text-sky-400',    border: 'border-sky-500/20',    bar: 'bg-sky-500', tint: 'bg-sky-500/10', solid: 'bg-sky-500', gradient: 'from-sky-700 to-sky-500', progress: 'from-sky-500 to-sky-300', hex: '#0ea5e9' },
            amber:  { text: 'text-amber-400',  border: 'border-amber-500/20',  bar: 'bg-amber-500', tint: 'bg-amber-500/10', solid: 'bg-amber-500', gradient: 'from-amber-700 to-amber-500', progress: 'from-amber-500 to-amber-300', hex: '#f59e0b' },
            brand:  { text: 'text-brand-400',  border: 'border-brand-500/20',  bar: 'bg-brand-500', tint: 'bg-brand-500/10', solid: 'bg-brand-500', gradient: 'from-brand-700 to-brand-500', progress: 'from-brand-500 to-brand-300', hex: '#10b981' }
        };

        // 6 cards de tendência (uma por etapa do funil completo): valor do mês mais recente da
        // janela, variação vs mês anterior, sparkline e barra de progresso da meta (quando houver).
        function renderEvolucaoTrendCards(janela) {
            const container = document.getElementById('evolucaoTrendCards');
            if (!container) return;
            if (!janela.length) { container.innerHTML = ''; return; }

            const atual = janela[janela.length - 1];
            const anterior = janela.length > 1 ? janela[janela.length - 2] : null;

            function trend(valAtual, valAnterior) {
                if (!anterior) return null;
                if (valAnterior === 0) return valAtual > 0 ? 100 : 0;
                return ((valAtual - valAnterior) / valAnterior) * 100;
            }

            const cards = FUNIL_ETAPAS.map(e => ({
                label: e.label,
                icon: e.icon,
                color: e.color,
                valor: atual[e.key],
                meta: getDashboardMeta(e.key, 'Mes', metasMensais[e.key] || 0),
                trendPct: trend(atual[e.key], anterior ? anterior[e.key] : 0),
                serie: janela.map(m => m[e.key])
            }));

            container.innerHTML = cards.map(c => {
                const cl = FUNIL_CORES[c.color];
                const valorTxt = Math.round(c.valor);
                const metaPct = c.meta ? Math.min(100, (c.valor / c.meta) * 100) : null;
                const trendHtml = c.trendPct === null ? '' : `
                    <span class="text-[10px] font-bold ${c.trendPct >= 0 ? 'text-emerald-400' : 'text-rose-400'} flex items-center gap-0.5 shrink-0">
                        <i class="fa-solid ${c.trendPct >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}" style="font-size:8px"></i>${Math.abs(c.trendPct).toFixed(0)}%
                    </span>`;
                return `
                    <div class="bg-slate-950/50 rounded-xl border ${cl.border} p-3">
                        <p class="text-[9px] font-bold ${cl.text} uppercase tracking-wider flex items-center gap-1.5 mb-1.5 truncate"><i class="fa-solid ${c.icon}"></i> ${c.label}</p>
                        <div class="flex items-end justify-between gap-2">
                            <p class="text-xl font-extrabold text-slate-100">${valorTxt}</p>
                            ${trendHtml}
                        </div>
                        <div class="w-full h-6 mt-1.5">${renderSparklineSvg(c.serie, c.color)}</div>
                        ${c.meta ? `
                        <div class="mt-1.5">
                            <div class="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div class="h-full ${cl.bar} rounded-full" style="width:${metaPct}%"></div></div>
                            <p class="text-[9px] text-slate-500 mt-1">Meta: ${Math.round(c.meta)} · ${metaPct.toFixed(0)}%</p>
                        </div>` : ''}
                    </div>
                `;
            }).join('');
        }

        // Tabela de Taxa de Conversão por mês. O funil tem 2 RAMOS independentes que só se
        // encontram na Prospecção lá atrás — Documentação (Análise→Aprovação→Venda) e Agendamento &
        // Visita (Agendamento→Compareceu→Venda) — não é uma cadeia única. Corrigido depois que o
        // usuário reportou "Compareceu → Análise" batendo 600%+: fazia sentido, porque Compareceu e
        // Análise nunca foram etapas sequenciais de verdade, são volumes de 2 ramos paralelos sendo
        // divididos um pelo outro sem relação real nenhuma. Cada ramo tem sua própria linha "geral"
        // (Prospecção → Venda daquele ramo) destacada no fim do grupo.
        function renderTaxaConversaoTable(janela) {
            const el = document.getElementById('taxaConversaoTable');
            if (!el) return;
            if (!janela.length) { el.innerHTML = '<tbody><tr><td class="text-slate-500 text-xs py-2">Sem dados suficientes.</td></tr></tbody>'; return; }

            const headerCells = janela.map((m, i) => {
                const label = m.ano ? `${m.nome.slice(0, 3)}/${String(m.ano).slice(-2)}` : m.nome;
                const isUltimo = i === janela.length - 1;
                return `<th class="text-center py-1.5 px-3 font-bold ${isUltimo ? 'text-brand-400 bg-brand-500/5' : 'text-slate-400'}">${label}</th>`;
            }).join('');

            const grupos = [
                { titulo: 'Documentação', linhas: [
                    { label: 'Prospecção → Análise', calc: m => m.prospeccao > 0 ? (m.analises / m.prospeccao) * 100 : 0 },
                    { label: 'Análise → Aprovação', calc: m => m.analises > 0 ? (m.aprovacoes / m.analises) * 100 : 0 },
                    { label: 'Aprovação → Venda', calc: m => m.aprovacoes > 0 ? (m.vendas / m.aprovacoes) * 100 : 0 },
                    { label: 'Prospecção → Venda (Documentação)', calc: m => m.prospeccao > 0 ? (m.vendas / m.prospeccao) * 100 : 0, destaque: true }
                ] },
                { titulo: 'Agendamento & Visita', linhas: [
                    { label: 'Prospecção → Agendamento', calc: m => m.prospeccao > 0 ? (m.agendamentos / m.prospeccao) * 100 : 0 },
                    { label: 'Agendamento → Compareceu', calc: m => m.agendamentos > 0 ? (m.compareceu / m.agendamentos) * 100 : 0 },
                    { label: 'Compareceu → Venda', calc: m => m.compareceu > 0 ? (m.vendas / m.compareceu) * 100 : 0 },
                    { label: 'Prospecção → Venda (Agendamento)', calc: m => m.prospeccao > 0 ? (m.vendas / m.prospeccao) * 100 : 0, destaque: true }
                ] }
            ];

            const bodyRows = grupos.map(g => {
                const tituloRow = `<tr class="border-t border-slate-800/60"><td colspan="${janela.length + 1}" class="pt-3 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-wide">${g.titulo}</td></tr>`;
                const linhasHtml = g.linhas.map(l => {
                    const cells = janela.map((m, i) => {
                        const isUltimo = i === janela.length - 1;
                        return `<td class="text-center py-2 px-3 font-semibold ${l.destaque ? 'text-brand-400' : (isUltimo ? 'text-slate-100 bg-brand-500/5' : 'text-slate-300')}">${l.calc(m).toFixed(1)}%</td>`;
                    }).join('');
                    const rowCls = l.destaque ? 'border-t-2 border-slate-700 bg-slate-950/40' : 'border-t border-slate-800/60';
                    const labelCls = l.destaque ? 'py-2 pr-3 text-brand-300 font-bold whitespace-nowrap' : 'py-2 pr-3 text-slate-400 whitespace-nowrap';
                    return `<tr class="${rowCls}"><td class="${labelCls}">${l.label}</td>${cells}</tr>`;
                }).join('');
                return tituloRow + linhasHtml;
            }).join('');

            el.innerHTML = `<thead><tr><th class="text-left py-1.5 pr-3"></th>${headerCells}</tr></thead><tbody>${bodyRows}</tbody>`;
        }

        // Texto automático (POR REGRA, sem IA) comparando o mês mais recente da janela contra o
        // anterior: volume do topo do funil (Prospecção quando houver dado, senão Análises) e a
        // etapa com a maior queda de conversão entre as 5 transições do funil completo.
        function renderInsightMes(janela) {
            const el = document.getElementById('insightMesText');
            if (!el) return;
            if (janela.length < 2) { el.textContent = 'Ainda não há mês anterior suficiente pra comparar.'; return; }

            const atual = janela[janela.length - 1];
            const anterior = janela[janela.length - 2];
            const mesAnteriorLabel = anterior.ano ? `${anterior.nome}/${anterior.ano}` : anterior.nome;

            const topoFunil = atual.prospeccao > 0 || anterior.prospeccao > 0 ? 'prospeccao' : 'analises';
            const topoLabel = topoFunil === 'prospeccao' ? 'prospecções' : 'análises';
            const volumeAtual = atual[topoFunil];
            const volumeAnteriorRef = anterior[topoFunil];
            const volumeDelta = volumeAnteriorRef > 0 ? ((volumeAtual - volumeAnteriorRef) / volumeAnteriorRef) * 100 : (volumeAtual > 0 ? 100 : 0);

            // "denom" = volume da etapa ANTERIOR do par (o denominador da razão) — exige um mínimo
            // dos dois meses pra não deixar a maior queda ser decidida por uma etapa com amostra
            // muito pequena. Segue os 2 ramos reais do funil (Documentação e Agendamento & Visita,
            // que só se encontram lá na Prospecção) — não existe "Compareceu → Análise" de verdade,
            // são volumes de ramos paralelos, não etapas sequenciais (ver renderTaxaConversaoTable).
            const AMOSTRA_MINIMA = 3;
            const etapas = [
                { label: 'Prospecção → Análise', denom: m => m.prospeccao, calc: m => m.prospeccao > 0 ? (m.analises / m.prospeccao) * 100 : null },
                { label: 'Análise → Aprovação', denom: m => m.analises, calc: m => m.analises > 0 ? (m.aprovacoes / m.analises) * 100 : null },
                { label: 'Aprovação → Venda', denom: m => m.aprovacoes, calc: m => m.aprovacoes > 0 ? (m.vendas / m.aprovacoes) * 100 : null },
                { label: 'Prospecção → Agendamento', denom: m => m.prospeccao, calc: m => m.prospeccao > 0 ? (m.agendamentos / m.prospeccao) * 100 : null },
                { label: 'Agendamento → Compareceu', denom: m => m.agendamentos, calc: m => m.agendamentos > 0 ? (m.compareceu / m.agendamentos) * 100 : null },
                { label: 'Compareceu → Venda', denom: m => m.compareceu, calc: m => m.compareceu > 0 ? (m.vendas / m.compareceu) * 100 : null }
            ];

            let maiorQuedaEtapa = null, maiorQueda = 0;
            etapas.forEach(e => {
                if (e.denom(atual) < AMOSTRA_MINIMA || e.denom(anterior) < AMOSTRA_MINIMA) return;
                const vAtual = e.calc(atual);
                const vAnterior = e.calc(anterior);
                if (vAtual === null || vAnterior === null) return;
                const delta = vAtual - vAnterior;
                if (delta < maiorQueda) { maiorQueda = delta; maiorQuedaEtapa = e.label; }
            });

            const direcaoVolume = volumeDelta >= 0 ? 'subiu' : 'caiu';
            let texto = `O volume de ${topoLabel} ${direcaoVolume} ${Math.abs(volumeDelta).toFixed(1)}% em relação a ${mesAnteriorLabel}.`;
            texto += maiorQuedaEtapa
                ? ` A maior queda de conversão foi na etapa ${maiorQuedaEtapa} (${maiorQueda.toFixed(1)} pontos percentuais).`
                : ` As taxas de conversão do funil se mantiveram estáveis ou melhoraram em relação a ${mesAnteriorLabel}.`;
            el.textContent = texto;
        }

        // Feed das atividades mais recentes do funil completo (prospecção/agendamento/compareceu/
        // análise/aprovação/venda) do recorte atual. As planilhas só têm DATA (sem horário), então
        // mostra "Hoje"/"Ontem"/data — nunca um horário inventado.
        function renderAtividadesRecentes() {
            const el = document.getElementById('atividadesRecentesList');
            if (!el) return;

            const hoje = isMockDataActive ? new Date(2026, 5, 9) : new Date();
            hoje.setHours(0, 0, 0, 0);

            let atividades = [];
            filteredDataset.forEach(row => {
                const dCad = parseDate(row['Data Cadastro']);
                if (dCad) atividades.push({ tipo: 'analise', cliente: row.Cliente, corretor: row.Corretor, data: dCad });
                if (isAprovado(row['Situação - Analise'])) {
                    const dAprov = parseDate(dataAprovacaoEfetiva(row));
                    if (dAprov) atividades.push({ tipo: 'aprovacao', cliente: row.Cliente, corretor: row.Corretor, data: dAprov });
                }
                if (isGanho(row)) {
                    const dGanho = parseDate(row['Data Ganho']);
                    if (dGanho) atividades.push({ tipo: 'venda', cliente: row.Cliente, corretor: row.Corretor, data: dGanho });
                }
            });
            filteredAgendaDataset.forEach(row => {
                const d = parseDate(row['Data']);
                if (!d) return;
                atividades.push({ tipo: 'agendamento', cliente: row.Cliente, corretor: row.Corretor, data: d });
                if (isCompareceu(row)) atividades.push({ tipo: 'compareceu', cliente: row.Cliente, corretor: row.Corretor, data: d });
            });
            filteredProspeccaoDataset.forEach(row => {
                const d = parseDate(row['Cadastro']);
                if (d) atividades.push({ tipo: 'prospeccao', cliente: row.Cliente, corretor: row.Corretor, data: d });
            });

            atividades.sort((a, b) => b.data - a.data);
            atividades = atividades.slice(0, 10);

            if (!atividades.length) {
                el.innerHTML = '<p class="text-xs text-slate-500">Nenhuma atividade no recorte atual.</p>';
                return;
            }

            const iconMap = {
                prospeccao:   { icon: 'fa-bullhorn',              color: 'text-pink-400',   bg: 'bg-pink-500/10',   label: 'Novo lead prospectado' },
                agendamento:  { icon: 'fa-calendar-check',        color: 'text-violet-400', bg: 'bg-violet-500/10', label: 'Visita agendada' },
                compareceu:   { icon: 'fa-door-open',             color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   label: 'Cliente compareceu' },
                analise:      { icon: 'fa-file-invoice-dollar',   color: 'text-sky-400',    bg: 'bg-sky-500/10',    label: 'Nova análise enviada' },
                aprovacao:    { icon: 'fa-circle-check',          color: 'text-amber-400',  bg: 'bg-amber-500/10',  label: 'Cliente aprovado' },
                venda:        { icon: 'fa-house-circle-check',    color: 'text-brand-400',  bg: 'bg-brand-500/10',  label: 'Venda realizada' }
            };

            el.innerHTML = atividades.map(a => {
                const m = iconMap[a.tipo];
                const diaAtividade = new Date(a.data.getFullYear(), a.data.getMonth(), a.data.getDate());
                const diffDias = Math.round((hoje - diaAtividade) / 86400000);
                const quando = diffDias === 0 ? 'Hoje' : diffDias === 1 ? 'Ontem' : formatDate(a.data);
                return `
                    <div class="flex items-center gap-3 py-1.5">
                        <div class="h-7 w-7 shrink-0 rounded-lg ${m.bg} ${m.color} flex items-center justify-center"><i class="fa-solid ${m.icon} text-[10px]"></i></div>
                        <div class="min-w-0 flex-1">
                            <p class="text-xs text-slate-300 truncate"><span class="font-semibold text-slate-200">${m.label}</span> por ${a.corretor || '-'} — ${a.cliente || '-'}</p>
                        </div>
                        <span class="text-[10px] text-slate-500 shrink-0">${quando}</span>
                    </div>
                `;
            }).join('');
        }


        // ===== RITMO DO MÊS: real acumulado dia a dia vs a linha ideal pra bater a meta =====
        let ritmoMetric = 'analises'; // analises | aprovacoes | vendas
        function setRitmoMetric(m) {
            ritmoMetric = m;
            ['analises', 'aprovacoes', 'vendas'].forEach(k => {
                const btn = document.getElementById('ritmoBtn-' + k);
                if (!btn) return;
                btn.className = 'ritmo-metric-btn px-3 py-1.5 rounded-lg text-xs font-bold transition ' + (k === m ? 'bg-brand-500 text-white' : 'text-slate-400 hover:text-slate-200');
            });
            renderRitmoMesChart();
            // Ritmo da Semana reaproveita o MESMO toggle de métrica do Ritmo do Mês (não duplica
            // controle) — só troca a label do subtítulo.
            const lblEl = document.getElementById('ritmoSemanaMetricLabel');
            if (lblEl) lblEl.textContent = m.charAt(0).toUpperCase() + m.slice(1);
            if (typeof renderRitmoSemanaChart === 'function') renderRitmoSemanaChart();
        }

        const RITMO_METRIC_LABELS = { analises: 'análises', aprovacoes: 'aprovações', vendas: 'vendas' };

        // 4 indicadores resumindo o Ritmo do Mês: quanto eu deveria ter (ritmo ideal até hoje),
        // quanto eu tenho de verdade, o gap entre os dois, e a projeção de fechamento do mês se
        // eu continuar no ritmo atual. Tudo calculado em DIAS ÚTEIS (domingo não conta — o admin
        // não sobe análise), pra bater com a linha de tendência do gráfico. `diaHoje` (dia corrido)
        // ainda é usado só pra achar o valor real acumulado no array, que é indexado por dia corrido.
        function renderRitmoMesStats(realAcumulado, diaHoje, diaUtilHoje, diasUteisNoMes, meta) {
            const el = document.getElementById('ritmoMesStats');
            if (!el) return;

            const metricLabel = RITMO_METRIC_LABELS[ritmoMetric] || 'itens';
            const realHoje = diaHoje > 0 ? (realAcumulado[diaHoje - 1] || 0) : 0;
            const idealHoje = diasUteisNoMes > 0 ? (meta * diaUtilHoje) / diasUteisNoMes : 0;
            const pctDia = diasUteisNoMes > 0 ? (diaUtilHoje / diasUteisNoMes) * 100 : 0;
            const gap = realHoje - idealHoje;
            const gapPositivo = gap >= 0;
            const pctRitmo = idealHoje > 0 ? (realHoje / idealHoje) * 100 : (realHoje > 0 ? 100 : 0);
            const projecao = diaUtilHoje > 0 ? Math.round((realHoje / diaUtilHoje) * diasUteisNoMes) : 0;
            const pctMeta = meta > 0 ? (projecao / meta) * 100 : 0;
            const projecaoBate = pctMeta >= 100;

            el.innerHTML = `
                <div class="bg-slate-950/50 rounded-xl border border-slate-800/70 p-3.5">
                    <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1"><i class="fa-solid fa-bullseye text-slate-500"></i> Ritmo ideal até hoje</p>
                    <p class="text-2xl font-extrabold text-slate-100 mt-1.5">${Math.round(idealHoje)}</p>
                    <p class="text-[10px] text-slate-500">acumulado</p>
                    <p class="text-[10px] text-slate-500 mt-2 pt-2 border-t border-slate-800/70 flex items-center gap-1"><i class="fa-regular fa-circle-question"></i> Meta proporcional (${pctDia.toFixed(0)}%)</p>
                </div>
                <div class="bg-slate-950/50 rounded-xl border border-slate-800/70 p-3.5">
                    <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1"><i class="fa-solid fa-chart-line text-brand-500"></i> Real acumulado</p>
                    <p class="text-2xl font-extrabold text-brand-400 mt-1.5">${Math.round(realHoje)}</p>
                    <p class="text-[10px] text-slate-500">realizado até hoje (${pctDia.toFixed(0)}%)</p>
                    <p class="text-[10px] text-brand-400 mt-2 pt-2 border-t border-slate-800/70">${pctRitmo.toFixed(0)}% do ritmo ideal</p>
                </div>
                <div class="bg-slate-950/50 rounded-xl border border-slate-800/70 p-3.5">
                    <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1"><i class="fa-solid ${gapPositivo ? 'fa-arrow-up' : 'fa-arrow-down'} ${gapPositivo ? 'text-brand-500' : 'text-rose-500'}"></i> ${gapPositivo ? 'Adiantamento' : 'Atraso'} em relação ao ideal</p>
                    <p class="text-2xl font-extrabold ${gapPositivo ? 'text-brand-400' : 'text-rose-400'} mt-1.5">${gapPositivo ? '+' : ''}${Math.round(gap)}</p>
                    <p class="text-[10px] text-slate-500">${metricLabel} ${gapPositivo ? 'acima' : 'abaixo'} do ideal</p>
                    <p class="text-[10px] ${gapPositivo ? 'text-brand-400' : 'text-rose-400'} mt-2 pt-2 border-t border-slate-800/70">${gapPositivo ? 'Você está à frente, mantenha o ritmo!' : `Precisamos de +${Math.round(Math.abs(gap))} até o fim do mês`}</p>
                </div>
                <div class="bg-slate-950/50 rounded-xl border border-slate-800/70 p-3.5">
                    <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1"><i class="fa-solid fa-flag-checkered text-sky-500"></i> Projeção até o fim do mês</p>
                    <p class="text-2xl font-extrabold text-sky-400 mt-1.5">${Math.round(projecao)}</p>
                    <p class="text-[10px] text-slate-500">projeção de ${metricLabel}</p>
                    <p class="text-[10px] ${projecaoBate ? 'text-brand-400' : 'text-amber-400'} mt-2 pt-2 border-t border-slate-800/70">${pctMeta.toFixed(0)}% da meta (${meta})</p>
                </div>
            `;
        }

        // Card lateral "Resumo do Mês": progresso de dias, meta total, projeção, ritmo diário
        // necessário pra fechar a meta (baseado nos dias que ainda restam) e a média diária já
        // realizada — dá o "quanto preciso fazer por dia daqui pra frente" que os 4 cards de cima
        // (que olham só o instante de hoje) não respondem sozinhos.
        function renderRitmoMesResumo(realAcumulado, diaHoje, diaUtilHoje, diasUteisNoMes, meta) {
            const el = document.getElementById('ritmoMesResumo');
            if (!el) return;

            // Tudo em DIAS ÚTEIS (sem domingo): "necessário/dia" dividido por dias corridos daria um
            // número menor do que o real, já que ninguém trabalha domingo.
            const metricLabel = RITMO_METRIC_LABELS[ritmoMetric] || 'itens';
            const realHoje = diaHoje > 0 ? (realAcumulado[diaHoje - 1] || 0) : 0;
            const pctDia = diasUteisNoMes > 0 ? (diaUtilHoje / diasUteisNoMes) * 100 : 0;
            const projecao = diaUtilHoje > 0 ? Math.round((realHoje / diaUtilHoje) * diasUteisNoMes) : 0;
            const pctMeta = meta > 0 ? (projecao / meta) * 100 : 0;
            const diasRestantes = Math.max(0, diasUteisNoMes - diaUtilHoje);
            const necessarioPorDia = diasRestantes > 0 ? Math.max(0, meta - realHoje) / diasRestantes : 0;
            const mediaPorDia = diaUtilHoje > 0 ? realHoje / diaUtilHoje : 0;
            const bateMeta = pctMeta >= 100;

            el.innerHTML = `
                <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Resumo do Mês</p>
                <div class="space-y-3 text-xs">
                    <div>
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-slate-400 flex items-center gap-1.5" title="Domingo não conta — o admin não sobe análise"><i class="fa-regular fa-calendar text-brand-500"></i> Dias úteis</span>
                            <span class="font-bold text-slate-200">${diaUtilHoje} de ${diasUteisNoMes}</span>
                        </div>
                        <div class="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div class="h-full bg-brand-500 rounded-full" style="width:${Math.min(100, pctDia).toFixed(0)}%"></div>
                        </div>
                        <p class="text-right text-[10px] text-slate-500 mt-0.5">${pctDia.toFixed(0)}%</p>
                    </div>
                    <div class="flex items-center justify-between pt-2 border-t border-slate-800/70">
                        <span class="text-slate-400 flex items-center gap-1.5"><i class="fa-solid fa-bullseye text-slate-500"></i> Meta total</span>
                        <span class="font-bold text-slate-200">${meta} <span class="text-slate-500 font-normal">${metricLabel}</span></span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-slate-400 flex items-center gap-1.5"><i class="fa-solid fa-chart-line text-sky-500"></i> Projeção atual</span>
                        <span class="text-right">
                            <span class="font-bold text-sky-400 block">${projecao}</span>
                            <span class="text-[10px] text-slate-500">${pctMeta.toFixed(0)}% da meta</span>
                        </span>
                    </div>
                    <div class="flex items-center justify-between pt-2 border-t border-slate-800/70">
                        <span class="text-slate-400 flex items-center gap-1.5"><i class="fa-solid fa-triangle-exclamation text-rose-500"></i> Necessário/dia útil</span>
                        <span class="font-bold text-rose-400">${necessarioPorDia.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-slate-400 flex items-center gap-1.5"><i class="fa-solid fa-chart-simple text-slate-500"></i> Média/dia útil</span>
                        <span class="text-right">
                            <span class="font-bold text-slate-200 block">${mediaPorDia.toFixed(2).replace('.', ',')}</span>
                            <span class="text-[10px] text-slate-500">(${Math.round(realHoje)} em ${diaUtilHoje}d úteis)</span>
                        </span>
                    </div>
                </div>
                <div class="mt-4 rounded-lg border ${bateMeta ? 'border-brand-500/40 bg-brand-500/10' : 'border-brand-500/30 bg-brand-500/5'} px-3 py-2.5">
                    <p class="text-xs font-bold text-brand-400 flex items-center gap-1.5"><i class="fa-solid fa-trophy"></i> Meta: ${meta} ${metricLabel}</p>
                    <p class="text-[10px] text-slate-400 mt-0.5">${bateMeta ? 'Ritmo em dia, continue assim!' : 'Vamos acelerar para bater essa meta!'}</p>
                </div>
            `;
        }

        // Constrói a "linha de tendência": quanto eu deveria ter acumulado até cada dia do mês
        // comercial pra bater a meta no ritmo certo (meta × dia ÷ dias do mês), contra o real
        // acumulado até hoje.
        // Janela do mês comercial (início real, fim, dias no mês, dia de hoje) pra UMA métrica
        // específica — essa é a MESMA lógica que desenha a linha de tendência do "Ritmo do Mês":
        // usa a configuração manual de Meses Comerciais quando existir (data manda), senão infere
        // pelo lançamento mais antigo daquele mês (trava de 10 dias). Reaproveitada pelo funil, pra
        // o "ideal hoje" ao lado de cada etapa bater exatamente com a linha de tendência.
        function getJanelaMesComercial(metrica) {
            const hoje = isMockDataActive ? new Date(2026, 5, 9) : new Date();
            const refMes = getReferenceMesComercial();
            // Agendamentos/Compareceu vêm da Agenda de Visitas (2ª planilha, filteredAgendaDataset)
            // em vez de filteredDataset — mesma "janela deslizante" (início real/config manual de
            // Meses Comerciais), só que sobre a coluna Data da agenda. O "mês corrente" (quando não
            // há mês manual selecionado nos pills) segue a MESMA referência da planilha principal
            // (getLatestCommercialMonth, a mesma que o Ritmo do Mês usa) — antes a Agenda detectava
            // seu próprio mês a partir da Data mais recente lançada NELA, o que a fazia pular pro
            // mês seguinte antes da planilha principal, dessincronizando o "Ideal hoje" do funil
            // Agendamento & Visita do resto do painel. Corrigido a pedido do usuário.
            const isAgendaMetrica = metrica === 'agendamentos' || metrica === 'compareceu';
            const isProspeccaoMetrica = metrica === 'prospeccao';
            const sourceDataset = isAgendaMetrica ? filteredAgendaDataset : (isProspeccaoMetrica ? filteredProspeccaoDataset : filteredDataset);
            let mesNome, ano, monthIdx;
            if (refMes) {
                mesNome = refMes.nome; ano = refMes.ano; monthIdx = refMes.idx;
            } else {
                // Se um mês comercial CONFIGURADO (painel "Meses Comerciais") já cobre hoje, ele é o
                // mês corrente — mesmo que essa fonte ainda não tenha nenhuma linha lançada nele
                // (ex.: virou Agosto, mas nenhuma análise/aprovação/venda/lead de Agosto entrou
                // ainda). Sem isso, o Funil/Ritmo do Mês ficavam mostrando os números do mês
                // anterior até a 1ª linha do mês novo chegar. Só cai no fallback antigo (último mês
                // com dados) quando NENHUM mês configurado cobre hoje.
                const lc = !isMockDataActive
                    ? (getMesComercialAtualPorData() || getLatestCommercialMonth())
                    : null;
                if (lc) { mesNome = lc.nome; ano = lc.ano; monthIdx = lc.idx; }
                else { mesNome = getMesName(hoje.getMonth() + 1); ano = hoje.getFullYear(); monthIdx = hoje.getMonth(); }
            }
            function linhaDoRow(row) {
                if (metrica === 'analises') return { ok: true, mesRef: row['Mês Cadastro'], dataRef: row['Data Cadastro'] };
                if (metrica === 'aprovacoes') return { ok: isAprovado(row['Situação - Analise']), mesRef: mesAprovacaoEfetivo(row), dataRef: dataAprovacaoEfetiva(row) };
                if (metrica === 'agendamentos') return { ok: true, mesRef: agendaMesStr(row, 'agendamentos'), dataRef: agendaDateForMetric(row, 'agendamentos') };
                if (metrica === 'compareceu') return { ok: isCompareceu(row), mesRef: agendaMesStr(row, 'compareceu'), dataRef: agendaDateForMetric(row, 'compareceu') };
                if (metrica === 'prospeccao') return { ok: true, mesRef: row['_MesComercialNorm'], dataRef: row['Cadastro'] };
                return { ok: isGanho(row), mesRef: row['Mês Ganho'], dataRef: row['Data Ganho'] };
            }

            // Se o diretor configurou manualmente o período desse mês (painel "Meses Comerciais"),
            // A DATA MANDA: uma linha pertence ao mês se sua data cair dentro do período — mesmo
            // que o texto "Mês Cadastro"/"Mês Aprovação"/"Mês Ganho" da planilha diga outra coisa.
            // Sem config, cai no comportamento antigo (compara pelo texto do mês).
            const configMes = getMesComercialConfig(mesNome, ano);
            let inicioReal, fimEstimado, diasNoMes, pertenceAoMes;

            if (isAgendaMetrica) {
                // Mesma resolução de janela usada por agendaMatchesRef() — garante que a CONTAGEM
                // (kpiValues.agendamentos/compareceu) nunca discorde do INTERVALO mostrado na tela.
                const janelaAgenda = resolveJanelaAgendaMes(mesNome, ano);
                inicioReal = janelaAgenda.inicioReal; fimEstimado = janelaAgenda.fimEstimado; diasNoMes = janelaAgenda.diasNoMes;
                pertenceAoMes = (l) => {
                    if (!l.ok) return false;
                    const d = parseDate(l.dataRef);
                    return d && d >= inicioReal && d <= fimEstimado;
                };
            } else if (configMes) {
                inicioReal = new Date(configMes.inicio + 'T00:00:00');
                fimEstimado = new Date(configMes.fim + 'T00:00:00');
                diasNoMes = Math.max(1, Math.round((fimEstimado - inicioReal) / 86400000) + 1);
                pertenceAoMes = (l) => {
                    if (!l.ok) return false;
                    const d = parseDate(l.dataRef);
                    return d && d >= inicioReal && d <= fimEstimado;
                };
            } else {
                pertenceAoMes = (l) => l.ok && normalizeMes(l.mesRef) === mesNome && (getMesAno(l.mesRef) || ano) === ano;

                // O mês comercial não começa no dia 1 nem termina no último dia do calendário — o
                // início real é a data mais antiga lançada com esse mês (pode ser ainda no mês
                // anterior). Trava de segurança: no máx. 10 dias antes do dia 1, pra uma data
                // digitada errada não bagunçar o gráfico inteiro.
                const diasNoMesCalendario = new Date(ano, monthIdx + 1, 0).getDate();
                inicioReal = new Date(ano, monthIdx, 1);
                sourceDataset.forEach(row => {
                    const l = linhaDoRow(row);
                    if (!pertenceAoMes(l)) return;
                    const d = parseDate(l.dataRef);
                    if (d && d < inicioReal) inicioReal = d;
                });
                const inicioMinPermitido = new Date(ano, monthIdx, 1);
                inicioMinPermitido.setDate(inicioMinPermitido.getDate() - 10);
                if (inicioReal < inicioMinPermitido) inicioReal = new Date(inicioMinPermitido);
                inicioReal.setHours(0, 0, 0, 0);

                // Fim estimado: mesma quantidade de dias do mês do calendário, só que contados a
                // partir do início real (em vez do dia 1 fixo) — assim o "fecha depois" e o
                // "começa antes" ficam simétricos.
                diasNoMes = diasNoMesCalendario;
                fimEstimado = new Date(inicioReal);
                fimEstimado.setDate(fimEstimado.getDate() + diasNoMes - 1);
            }

            // "É o mês atual?" precisa comparar a DATA de hoje contra a janela real
            // [inicioReal, fimEstimado] do mês comercial — não o mês do calendário. O mês
            // comercial quase sempre atravessa a virada do mês (ex.: "Julho" configurado até
            // 07/08) — comparando só monthIdx/ano, no dia 1º de agosto o app já achava que
            // "Julho" tinha "encerrado hoje" (100%, sem ritmo), mesmo a janela real ainda tendo
            // dias até 07/08. Bug reportado pelo usuário, corrigido aqui.
            const hojeZerado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
            const mesEhAtual = hojeZerado >= inicioReal && hojeZerado <= fimEstimado;
            const diaHoje = mesEhAtual
                ? Math.min(diasNoMes, Math.max(1, Math.floor((hojeZerado - inicioReal) / 86400000) + 1))
                : diasNoMes;

            // Domingo não é dia de trabalho (o admin não sobe análise), então a linha de tendência
            // não pode distribuir a meta em dias corridos — senão todo domingo o "ideal" sobe
            // sozinho e a equipe aparece atrasada sem ter feito nada de errado. `diasUteisNoMes` e
            // `diaUtilHoje` são os contadores SEM domingo, usados só no cálculo do ritmo ideal;
            // `diasNoMes`/`diaHoje` continuam em dias corridos porque são usados pra aritmética de
            // data (régua de dias, agrupamento por semana, eixo do gráfico). Confirmado nos dados
            // reais: domingo tem 0 agendamento, 0 comparecimento e ~5 análises contra 32-48 nos
            // dias úteis; sábado, ao contrário, é dia forte (maior volume de vendas) — por isso só
            // o domingo é excluído.
            const diasUteisNoMes = contarDiasUteis(inicioReal, diasNoMes);
            const diaUtilHoje = contarDiasUteis(inicioReal, diaHoje);

            return { mesNome, ano, monthIdx, inicioReal, fimEstimado, diasNoMes, diaHoje, diasUteisNoMes, diaUtilHoje, mesEhAtual, configMes, pertenceAoMes, linhaDoRow };
        }

        // Conta quantos dos primeiros `qtdDias` dias a partir de `inicio` NÃO são domingo.
        function contarDiasUteis(inicio, qtdDias) {
            let total = 0;
            for (let i = 0; i < qtdDias; i++) {
                const d = new Date(inicio);
                d.setDate(d.getDate() + i);
                if (d.getDay() !== 0) total++;
            }
            return total;
        }

        // Dias da semana abreviados — compartilhado pela régua de dias e pelo eixo do gráfico
        // do Ritmo do Mês, pra ficarem sempre consistentes entre si.
        const DOW_PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

        // Divide os dias de um mês comercial (a partir de inicioReal, por diasNoMes dias) em
        // semanas REAIS de segunda a domingo — nova semana sempre numa segunda-feira, exceto a 1ª,
        // que abre no 1º dia do mês comercial mesmo que não caia numa segunda (o mês comercial quase
        // nunca começa no dia 1 do calendário). Função única compartilhada por TUDO que precisa
        // concordar em que dias formam "a semana 2" (régua de dias do Ritmo do Mês, Evolução Semanal
        // do Mês, o filtro de pills "Semana" e o Ritmo da Semana) — antes o filtro de "Semana"
        // calculava por conta própria via Math.ceil(dia-do-mês-do-CALENDÁRIO / 7), o que ignorava a
        // janela deslizante e não alinhava com semanas reais de segunda a domingo (bug real,
        // reportado pelo usuário).
        function getSemanasMesComercial(inicioReal, diasNoMes) {
            const semanas = [];
            let semanaAtual = null;
            for (let d = 1; d <= diasNoMes; d++) {
                const data = new Date(inicioReal);
                data.setDate(data.getDate() + (d - 1));
                if (!semanaAtual || data.getDay() === 1) { semanaAtual = []; semanas.push(semanaAtual); }
                semanaAtual.push({ d, data, dow: data.getDay() });
            }
            return semanas.map((dias, wi) => ({
                idx: wi + 1,
                dias,
                inicio: dias[0].data,
                fim: dias[dias.length - 1].data
            }));
        }

        // Régua de dias do mês comercial abaixo do gráfico do Ritmo do Mês: uma coluna por dia
        // (dd + dia da semana abreviado), agrupadas por semana (getSemanasMesComercial), com
        // separador tracejado entre grupos e o rótulo "Nª SEM" centralizado embaixo de cada um.
        function renderRitmoMesDiasStrip(inicioReal, diasNoMes, diaHoje) {
            const el = document.getElementById('ritmoMesDiasStrip');
            if (!el) return;
            const semanas = getSemanasMesComercial(inicioReal, diasNoMes);
            el.innerHTML = semanas.map((s, wi) => `
                <div class="flex flex-col items-center shrink-0 ${wi > 0 ? 'border-l border-dashed border-slate-700 pl-3' : ''}">
                    <div class="flex gap-1.5">
                        ${s.dias.map(x => {
                            // Domingo aparece apagado: não entra no ritmo ideal (o admin não sobe
                            // análise), então a linha de tendência fica plana nesse dia.
                            const ehDomingo = x.dow === 0;
                            const corDia = x.d === diaHoje ? 'bg-brand-500 text-white' : (ehDomingo ? 'text-slate-700' : 'text-slate-300');
                            return `
                            <div class="flex flex-col items-center w-7 shrink-0" ${ehDomingo ? 'title="Domingo não conta no ritmo ideal"' : ''}>
                                <span class="text-[11px] font-extrabold rounded px-1 ${corDia}">${String(x.data.getDate()).padStart(2, '0')}</span>
                                <span class="text-[8px] font-bold uppercase mt-0.5 ${ehDomingo ? 'text-slate-700' : 'text-slate-500'}">${DOW_PT[x.dow]}</span>
                            </div>`;
                        }).join('')}
                    </div>
                    <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wide mt-1.5">${s.idx}ª SEM</span>
                </div>`).join('');
        }

        function renderRitmoMesChart() {
            const canvas = document.getElementById('chartRitmoMes');
            if (!canvas) return;
            if (charts.ritmoMes) charts.ritmoMes.destroy();

            const { mesNome, ano, inicioReal, fimEstimado, diasNoMes, diaHoje, diasUteisNoMes, diaUtilHoje, mesEhAtual, configMes, pertenceAoMes, linhaDoRow } = getJanelaMesComercial(ritmoMetric);

            const origemTag = configMes ? '' : ' (estimado)';
            const pctDiaHeader = diasNoMes > 0 ? (diaHoje / diasNoMes) * 100 : 0;
            const diasRestantes = Math.max(0, diasNoMes - diaHoje);

            const tituloEl = document.getElementById('ritmoMesTituloMes');
            if (tituloEl) tituloEl.textContent = `${mesNome.charAt(0).toUpperCase()}${mesNome.slice(1)}/${ano}`;

            const lbl = document.getElementById('ritmoMesPeriodoLabel');
            if (lbl) lbl.textContent = `Mês comercial: ${formatDate(inicioReal)} a ${formatDate(fimEstimado)}${origemTag}`;

            const hojeLbl = document.getElementById('ritmoMesHojeLabel');
            if (hojeLbl) hojeLbl.textContent = mesEhAtual ? `Hoje: ${diaHoje} de ${diasNoMes} dias (${pctDiaHeader.toFixed(0)}%)` : 'Mês comercial fechado';

            const fechamentoBox = document.getElementById('ritmoMesFechamentoBox');
            if (fechamentoBox) fechamentoBox.style.display = mesEhAtual ? '' : 'none';
            const diasFaltamEl = document.getElementById('ritmoMesDiasFaltam');
            if (diasFaltamEl) diasFaltamEl.textContent = `${diasRestantes} dias`;
            const encerramentoEl = document.getElementById('ritmoMesEncerramento');
            if (encerramentoEl) encerramentoEl.textContent = `Encerramento: ${formatDate(fimEstimado)}`;

            renderRitmoMesDiasStrip(inicioReal, diasNoMes, mesEhAtual ? diaHoje : null);

            // Se o filtro de Corretor do topo estiver com um nome específico selecionado, a linha
            // de tendência usa a meta MENSAL INDIVIDUAL daquele corretor (metasPorCorretor[nome])
            // em vez da meta da empresa inteira — mesmo padrão já aplicado no Funil de Vendas e na
            // Evolução Semanal do Mês.
            const RITMO_METAS_CORRETOR_KEYS = { analises: 'anMes', aprovacoes: 'apMes', vendas: 'vdMes' };
            const meta = getDashboardMeta(ritmoMetric, 'Mes', metasMensais[ritmoMetric] || 0);
            const ritmoMetaFonteEl = document.getElementById('ritmoMesMetaFonteLabel');
            if (ritmoMetaFonteEl) ritmoMetaFonteEl.textContent = `· ${getDashboardMetaContextLabel()}`;

            const porDia = new Array(diasNoMes + 1).fill(0); // índice 1..diasNoMes, dia 1 = inicioReal
            filteredDataset.forEach(row => {
                const l = linhaDoRow(row);
                if (!pertenceAoMes(l)) return;
                const d = parseDate(l.dataRef);
                if (!d) return;
                const dia = Math.floor((d - inicioReal) / 86400000) + 1;
                if (dia >= 1 && dia <= diasNoMes) porDia[dia]++;
            });

            const labels = [];
            const labelDatas = []; // data real de cada ponto, na mesma ordem de labels — usada no tooltip
            const realAcumulado = [];
            const ritmoIdeal = [];
            let acumulado = 0;
            let diasUteisAcum = 0;
            for (let d = 1; d <= diasNoMes; d++) {
                const dataDoDia = new Date(inicioReal);
                dataDoDia.setDate(dataDoDia.getDate() + (d - 1));
                labelDatas.push(dataDoDia);
                labels.push(`${String(dataDoDia.getDate()).padStart(2, '0')}/${String(dataDoDia.getMonth() + 1).padStart(2, '0')}`);
                acumulado += porDia[d];
                realAcumulado.push(d <= diaHoje ? acumulado : null);
                // Domingo não acumula dia útil, então a linha ideal fica HORIZONTAL nele (em vez de
                // continuar subindo e criar um "atraso" artificial na segunda de manhã).
                if (dataDoDia.getDay() !== 0) diasUteisAcum++;
                ritmoIdeal.push(diasUteisNoMes > 0 ? (meta * diasUteisAcum) / diasUteisNoMes : 0);
            }

            renderRitmoMesStats(realAcumulado, diaHoje, diaUtilHoje, diasUteisNoMes, meta);
            renderRitmoMesResumo(realAcumulado, diaHoje, diaUtilHoje, diasUteisNoMes, meta);

            const metricLabel = RITMO_METRIC_LABELS[ritmoMetric] || 'itens';

            const ctx = canvas.getContext('2d');
            charts.ritmoMes = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Real (acumulado)',
                            data: realAcumulado,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.08)',
                            borderWidth: 3,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            tension: 0.2,
                            fill: true,
                            spanGaps: false
                        },
                        {
                            label: `Ritmo Ideal (meta: ${meta})`,
                            data: ritmoIdeal,
                            borderColor: 'rgba(226, 232, 240, 0.55)',
                            borderWidth: 2,
                            borderDash: [6, 5],
                            pointRadius: 0,
                            pointHoverRadius: 0,
                            tension: 0,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 46, right: 70 } },
                    plugins: {
                        legend: { labels: { color: '#f1f5f9', font: { size: 11, weight: 'bold' }, padding: 12 } },
                        tooltip: { callbacks: { title: (items) => `${items[0].label} (${DOW_PT[labelDatas[items[0].dataIndex].getDay()]})` } }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 12 },
                            title: { display: true, text: 'Data (mês comercial)', color: '#64748b', font: { size: 10 } }
                        },
                        y: {
                            grid: { color: 'rgba(255, 255, 255, 0.08)' },
                            ticks: { color: '#cbd5e1', font: { size: 11 } },
                            beginAtZero: true
                        }
                    }
                },
                plugins: [{
                    id: 'ritmoCallouts',
                    // Marca visualmente o ponto de "hoje" (valor real acumulado) e o ponto final da
                    // linha ideal (a meta), igual ao mockup — Chart.js não tem isso nativo, então
                    // desenha à mão no afterDatasetsDraw (mesmo padrão já usado nos outros gráficos
                    // de "Evolução Mensal", em vez de trazer uma lib de annotation só pra isso).
                    afterDatasetsDraw(chart) {
                        const { ctx } = chart;
                        const realMeta = chart.getDatasetMeta(0);
                        const idealMeta = chart.getDatasetMeta(1);
                        ctx.save();
                        ctx.textBaseline = 'alphabetic';

                        if (diaHoje >= 1 && diaHoje <= diasNoMes) {
                            const point = realMeta.data[diaHoje - 1];
                            if (point) {
                                const valorHoje = Math.round(realAcumulado[diaHoje - 1] || 0);
                                ctx.fillStyle = '#10b981';
                                ctx.beginPath();
                                ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
                                ctx.fill();
                                ctx.strokeStyle = '#0b1220';
                                ctx.lineWidth = 2;
                                ctx.stroke();

                                const linha1 = String(valorHoje);
                                const linha2 = `${metricLabel} (hoje)`;
                                ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
                                const w1 = ctx.measureText(linha1).width;
                                ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
                                const w2 = ctx.measureText(linha2).width;
                                const boxW = Math.max(w1, w2) + 20;
                                const boxH = 38;
                                let boxX = point.x - boxW / 2;
                                boxX = Math.max(2, Math.min(boxX, chart.width - boxW - 2));
                                let boxY = point.y - boxH - 16;
                                if (boxY < 2) boxY = point.y + 14;

                                ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
                                ctx.strokeStyle = '#10b981';
                                ctx.lineWidth = 1.5;
                                ctx.beginPath();
                                ctx.roundRect(boxX, boxY, boxW, boxH, 8);
                                ctx.fill();
                                ctx.stroke();

                                ctx.textAlign = 'center';
                                ctx.fillStyle = '#6ee7b7';
                                ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
                                ctx.fillText(linha1, boxX + boxW / 2, boxY + 17);
                                ctx.fillStyle = '#a7f3d0';
                                ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
                                ctx.fillText(linha2, boxX + boxW / 2, boxY + 30);
                            }
                        }

                        const pontoFinal = idealMeta.data[idealMeta.data.length - 1];
                        if (pontoFinal) {
                            ctx.fillStyle = '#0b1220';
                            ctx.beginPath();
                            ctx.arc(pontoFinal.x, pontoFinal.y, 4, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.strokeStyle = 'rgba(226, 232, 240, 0.7)';
                            ctx.lineWidth = 2;
                            ctx.stroke();

                            const rotulo = String(meta);
                            ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
                            const boxW = Math.max(ctx.measureText(rotulo).width, 55) + 16;
                            const boxH = 32;
                            let boxX = pontoFinal.x - boxW - 8;
                            if (boxX < 2) boxX = pontoFinal.x + 8;
                            let boxY = Math.max(2, Math.min(pontoFinal.y - boxH / 2, chart.height - boxH - 2));

                            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
                            ctx.strokeStyle = 'rgba(226, 232, 240, 0.4)';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.roundRect(boxX, boxY, boxW, boxH, 8);
                            ctx.fill();
                            ctx.stroke();

                            ctx.textAlign = 'center';
                            ctx.fillStyle = '#f1f5f9';
                            ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
                            ctx.fillText(rotulo, boxX + boxW / 2, boxY + 14);
                            ctx.fillStyle = '#94a3b8';
                            ctx.font = '600 8px "Plus Jakarta Sans", sans-serif';
                            ctx.fillText('meta final', boxX + boxW / 2, boxY + 26);
                        }

                        ctx.restore();
                    }
                }]
            });
        }

        // ===== RITMO DA SEMANA: real acumulado dia a dia (segunda a domingo) vs a linha ideal =====
        // Mesma ideia do Ritmo do Mês, só que zerado toda segunda-feira e com a meta SEMANAL já
        // cadastrada (rankingsMetas.*Sem / metasPorCorretor.*Sem — mesma fonte que a Evolução
        // Semanal do Mês usa), não a meta mensal dividida por 7. Reaproveita o toggle de métrica
        // (ritmoMetric) do Ritmo do Mês, pra não duplicar controle na tela. A semana usada é SEMPRE
        // a semana real corrente (hoje), independente de qual mês comercial ela pertence — não faz
        // sentido "fechar" a semana antes da hora só porque o mês comercial mudou no meio dela.
        const RITMO_SEMANA_METAS_KEYS = { analises: 'anSem', aprovacoes: 'apSem', vendas: 'vdSem' };
        function renderRitmoSemanaChart() {
            const canvas = document.getElementById('chartRitmoSemana');
            if (!canvas) return;
            if (charts.ritmoSemana) charts.ritmoSemana.destroy();

            const hoje = isMockDataActive ? new Date(2026, 5, 9) : new Date();
            hoje.setHours(0, 0, 0, 0);
            const dow = hoje.getDay();
            const desdeSegunda = (dow === 0) ? 6 : (dow - 1);
            const segunda = new Date(hoje); segunda.setDate(hoje.getDate() - desdeSegunda);
            const domingo = new Date(segunda); domingo.setDate(segunda.getDate() + 6);
            const diaHoje = desdeSegunda + 1; // 1..7, segunda = 1

            // A semana de TRABALHO vai de segunda a SÁBADO (6 dias úteis) — domingo não conta porque
            // o admin não sobe análise. O domingo continua aparecendo no gráfico (com a linha ideal
            // plana), mas todos os textos/contadores falam em dia útil, senão o cabeçalho ("dia 7 de
            // 7") contradiz o resumo logo abaixo ("dias úteis 6 de 6").
            const DIAS_UTEIS_SEMANA_HDR = 6;
            const sabado = new Date(segunda); sabado.setDate(segunda.getDate() + 5);
            const semanaUtilEncerrada = (dow === 0); // domingo: a semana útil já fechou no sábado

            const tituloEl = document.getElementById('ritmoSemanaTitulo');
            if (tituloEl) tituloEl.textContent = `${formatDate(segunda)} a ${formatDate(sabado)}`;
            const periodoEl = document.getElementById('ritmoSemanaPeriodoLabel');
            if (periodoEl) periodoEl.textContent = 'Semana útil (segunda a sábado) — domingo não conta';
            const hojeLbl = document.getElementById('ritmoSemanaHojeLabel');
            if (hojeLbl) hojeLbl.textContent = semanaUtilEncerrada
                ? 'Hoje: DOM — semana útil encerrada'
                : `Hoje: ${DOW_PT[dow]}, dia útil ${contarDiasUteis(segunda, diaHoje)} de ${DIAS_UTEIS_SEMANA_HDR}`;

            const diasRestantes = Math.max(0, DIAS_UTEIS_SEMANA_HDR - contarDiasUteis(segunda, diaHoje));
            const fechamentoBoxSem = document.getElementById('ritmoSemanaFechamentoBox');
            if (fechamentoBoxSem) fechamentoBoxSem.style.display = semanaUtilEncerrada ? 'none' : '';
            const diasFaltamEl = document.getElementById('ritmoSemanaDiasFaltam');
            if (diasFaltamEl) diasFaltamEl.textContent = diasRestantes === 1 ? '1 dia útil' : `${diasRestantes} dias úteis`;
            const encerramentoEl = document.getElementById('ritmoSemanaEncerramento');
            if (encerramentoEl) encerramentoEl.textContent = `Encerramento: ${formatDate(sabado)}`;

            // Meta semanal já cadastrada (não a mensal ÷ 7) — mesma convenção da Evolução Semanal do
            // Mês: meta individual do corretor filtrado sobrepõe a meta da equipe.
            const meta = getDashboardMeta(ritmoMetric, 'Sem', rankingsMetas[RITMO_SEMANA_METAS_KEYS[ritmoMetric]] || 0);
            const metaFonteEl = document.getElementById('ritmoSemanaMetaFonteLabel');
            if (metaFonteEl) metaFonteEl.textContent = `${getDashboardMetaContextLabel()} · semanal`;

            // Mesma extração de "a linha pertence a essa métrica" já usada no Ritmo do Mês (Análises:
            // Data Cadastro; Aprovações: data efetiva de aprovação; Vendas: Data Ganho) — só que aqui
            // sem filtrar por mês comercial, direto pela data cair (ou não) dentro da semana real
            // corrente.
            const { linhaDoRow } = getJanelaMesComercial(ritmoMetric);
            const porDia = new Array(8).fill(0); // índice 1..7, 1 = segunda
            filteredDataset.forEach(row => {
                const l = linhaDoRow(row);
                if (!l.ok) return;
                const d = parseDate(l.dataRef);
                if (!d || d < segunda || d > domingo) return;
                const dia = Math.floor((d - segunda) / 86400000) + 1;
                if (dia >= 1 && dia <= 7) porDia[dia]++;
            });

            // Semana comercial = segunda a sábado (6 dias úteis) — domingo não conta no ritmo ideal
            // porque o admin não trabalha, então a linha fica horizontal no domingo em vez de
            // exigir produção num dia em que ninguém sobe nada.
            const DIAS_UTEIS_SEMANA = 6;
            const diaUtilHoje = contarDiasUteis(segunda, diaHoje);

            const labels = [];
            const realAcumulado = [];
            const ritmoIdeal = [];
            let acumulado = 0;
            let diasUteisAcum = 0;
            for (let d = 1; d <= 7; d++) {
                const dataDoDia = new Date(segunda);
                dataDoDia.setDate(dataDoDia.getDate() + (d - 1));
                labels.push(`${DOW_PT[dataDoDia.getDay()]} ${String(dataDoDia.getDate()).padStart(2, '0')}/${String(dataDoDia.getMonth() + 1).padStart(2, '0')}`);
                acumulado += porDia[d];
                realAcumulado.push(d <= diaHoje ? acumulado : null);
                if (dataDoDia.getDay() !== 0) diasUteisAcum++;
                ritmoIdeal.push((meta * diasUteisAcum) / DIAS_UTEIS_SEMANA);
            }

            renderRitmoSemanaStats(realAcumulado, diaHoje, diaUtilHoje, meta);
            renderRitmoSemanaResumo(realAcumulado, diaHoje, diaUtilHoje, meta);

            const metricLabel = RITMO_METRIC_LABELS[ritmoMetric] || 'itens';

            const ctx = canvas.getContext('2d');
            charts.ritmoSemana = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'Real (acumulado)',
                            data: realAcumulado,
                            borderColor: '#38bdf8',
                            backgroundColor: 'rgba(56, 189, 248, 0.10)',
                            borderWidth: 3,
                            pointRadius: 3,
                            pointBackgroundColor: '#38bdf8',
                            pointHoverRadius: 5,
                            tension: 0.2,
                            fill: true,
                            spanGaps: false
                        },
                        {
                            label: `Ritmo Ideal (meta: ${Math.round(meta)})`,
                            data: ritmoIdeal,
                            borderColor: 'rgba(226, 232, 240, 0.55)',
                            borderWidth: 2,
                            borderDash: [6, 5],
                            pointRadius: 0,
                            pointHoverRadius: 0,
                            tension: 0,
                            fill: false
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 46, right: 70 } },
                    plugins: {
                        legend: { labels: { color: '#f1f5f9', font: { size: 11, weight: 'bold' }, padding: 12 } },
                        tooltip: { callbacks: { title: (items) => items[0].label } }
                    },
                    scales: {
                        // Domingo com o rótulo apagado — não é dia útil, a linha ideal fica plana nele.
                        x: { grid: { display: false }, ticks: { color: (c) => c.index === 6 ? '#475569' : '#94a3b8', font: { size: 10 } } },
                        y: { grid: { color: 'rgba(255, 255, 255, 0.08)' }, ticks: { color: '#cbd5e1', font: { size: 11 } }, beginAtZero: true }
                    }
                },
                plugins: [{
                    id: 'ritmoSemanaCallouts',
                    // Mesmo balão "valor de hoje" (verde) + "meta final" (cinza) desenhados à mão no
                    // Ritmo do Mês (ritmoCallouts) — replicado aqui pra escala de 7 dias, pra manter
                    // os dois gráficos com a mesma linguagem visual.
                    afterDatasetsDraw(chart) {
                        const { ctx } = chart;
                        const realMeta = chart.getDatasetMeta(0);
                        const idealMeta = chart.getDatasetMeta(1);
                        ctx.save();
                        ctx.textBaseline = 'alphabetic';

                        if (diaHoje >= 1 && diaHoje <= 7) {
                            const point = realMeta.data[diaHoje - 1];
                            if (point) {
                                const valorHoje = Math.round(realAcumulado[diaHoje - 1] || 0);
                                ctx.fillStyle = '#38bdf8';
                                ctx.beginPath();
                                ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
                                ctx.fill();
                                ctx.strokeStyle = '#0b1220';
                                ctx.lineWidth = 2;
                                ctx.stroke();

                                const linha1 = String(valorHoje);
                                const linha2 = `${metricLabel} (semana)`;
                                ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
                                const w1 = ctx.measureText(linha1).width;
                                ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
                                const w2 = ctx.measureText(linha2).width;
                                const boxW = Math.max(w1, w2) + 20;
                                const boxH = 38;
                                let boxX = point.x - boxW / 2;
                                boxX = Math.max(2, Math.min(boxX, chart.width - boxW - 2));
                                // No último dia da semana os 2 balões ("hoje" e "meta final") caem no
                                // mesmo canto e se sobrepõem — nesse caso desenha o de hoje ABAIXO do
                                // ponto em vez de acima.
                                const ehUltimoPonto = diaHoje === 7;
                                let boxY = ehUltimoPonto ? point.y + 14 : point.y - boxH - 16;
                                if (boxY < 2) boxY = point.y + 14;
                                if (boxY + boxH > chart.height) boxY = Math.max(2, point.y - boxH - 16);

                                ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
                                ctx.strokeStyle = '#38bdf8';
                                ctx.lineWidth = 1.5;
                                ctx.beginPath();
                                ctx.roundRect(boxX, boxY, boxW, boxH, 8);
                                ctx.fill();
                                ctx.stroke();

                                ctx.textAlign = 'center';
                                ctx.fillStyle = '#7dd3fc';
                                ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
                                ctx.fillText(linha1, boxX + boxW / 2, boxY + 17);
                                ctx.fillStyle = '#bae6fd';
                                ctx.font = '600 9px "Plus Jakarta Sans", sans-serif';
                                ctx.fillText(linha2, boxX + boxW / 2, boxY + 30);
                            }
                        }

                        const pontoFinal = idealMeta.data[idealMeta.data.length - 1];
                        if (pontoFinal) {
                            ctx.fillStyle = '#0b1220';
                            ctx.beginPath();
                            ctx.arc(pontoFinal.x, pontoFinal.y, 4, 0, Math.PI * 2);
                            ctx.fill();
                            ctx.strokeStyle = 'rgba(226, 232, 240, 0.7)';
                            ctx.lineWidth = 2;
                            ctx.stroke();

                            const rotulo = String(Math.round(meta));
                            ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
                            const boxW = Math.max(ctx.measureText(rotulo).width, 55) + 16;
                            const boxH = 32;
                            let boxX = pontoFinal.x - boxW - 8;
                            if (boxX < 2) boxX = pontoFinal.x + 8;
                            let boxY = Math.max(2, Math.min(pontoFinal.y - boxH / 2, chart.height - boxH - 2));

                            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
                            ctx.strokeStyle = 'rgba(226, 232, 240, 0.4)';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.roundRect(boxX, boxY, boxW, boxH, 8);
                            ctx.fill();
                            ctx.stroke();

                            ctx.textAlign = 'center';
                            ctx.fillStyle = '#f1f5f9';
                            ctx.font = 'bold 13px "Plus Jakarta Sans", sans-serif';
                            ctx.fillText(rotulo, boxX + boxW / 2, boxY + 14);
                            ctx.fillStyle = '#94a3b8';
                            ctx.font = '600 8px "Plus Jakarta Sans", sans-serif';
                            ctx.fillText('meta final', boxX + boxW / 2, boxY + 26);
                        }

                        ctx.restore();
                    }
                }]
            });
        }

        // 4 indicadores resumindo o Ritmo da Semana — mesmo layout do Ritmo do Mês
        // (renderRitmoMesStats), escala de 6 dias ÚTEIS (seg-sáb, domingo não conta) em vez do mês.
        function renderRitmoSemanaStats(realAcumulado, diaHoje, diaUtilHoje, meta) {
            const el = document.getElementById('ritmoSemanaStats');
            if (!el) return;
            const DIAS_UTEIS_SEMANA = 6;
            const metricLabel = RITMO_METRIC_LABELS[ritmoMetric] || 'itens';
            const realHoje = diaHoje > 0 ? (realAcumulado[diaHoje - 1] || 0) : 0;
            const idealHoje = (meta * diaUtilHoje) / DIAS_UTEIS_SEMANA;
            const gap = realHoje - idealHoje;
            const gapPositivo = gap >= 0;
            const pctRitmo = idealHoje > 0 ? (realHoje / idealHoje) * 100 : (realHoje > 0 ? 100 : 0);
            const projecao = diaUtilHoje > 0 ? Math.round((realHoje / diaUtilHoje) * DIAS_UTEIS_SEMANA) : 0;
            const pctMeta = meta > 0 ? (projecao / meta) * 100 : 0;
            const projecaoBate = pctMeta >= 100;

            el.innerHTML = `
                <div class="bg-slate-950/50 rounded-xl border border-slate-800/70 p-3.5">
                    <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1"><i class="fa-solid fa-bullseye text-slate-500"></i> Ideal até hoje</p>
                    <p class="text-2xl font-extrabold text-slate-100 mt-1.5">${Math.round(idealHoje)}</p>
                    <p class="text-[10px] text-slate-500">acumulado na semana</p>
                </div>
                <div class="bg-slate-950/50 rounded-xl border border-slate-800/70 p-3.5">
                    <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1"><i class="fa-solid fa-chart-line text-sky-400"></i> Real acumulado</p>
                    <p class="text-2xl font-extrabold text-sky-400 mt-1.5">${Math.round(realHoje)}</p>
                    <p class="text-[10px] text-sky-400 mt-2 pt-2 border-t border-slate-800/70">${pctRitmo.toFixed(0)}% do ritmo ideal</p>
                </div>
                <div class="bg-slate-950/50 rounded-xl border border-slate-800/70 p-3.5">
                    <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1"><i class="fa-solid ${gapPositivo ? 'fa-arrow-up' : 'fa-arrow-down'} ${gapPositivo ? 'text-brand-500' : 'text-rose-500'}"></i> ${gapPositivo ? 'Adiantamento' : 'Atraso'}</p>
                    <p class="text-2xl font-extrabold ${gapPositivo ? 'text-brand-400' : 'text-rose-400'} mt-1.5">${gapPositivo ? '+' : ''}${Math.round(gap)}</p>
                    <p class="text-[10px] text-slate-500">${metricLabel} ${gapPositivo ? 'acima' : 'abaixo'} do ideal</p>
                </div>
                <div class="bg-slate-950/50 rounded-xl border border-slate-800/70 p-3.5">
                    <p class="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1"><i class="fa-solid fa-flag-checkered text-sky-500"></i> Projeção da semana</p>
                    <p class="text-2xl font-extrabold text-sky-400 mt-1.5">${Math.round(projecao)}</p>
                    <p class="text-[10px] ${projecaoBate ? 'text-brand-400' : 'text-amber-400'} mt-2 pt-2 border-t border-slate-800/70">${pctMeta.toFixed(0)}% da meta (${Math.round(meta)})</p>
                </div>
            `;
        }

        // Card lateral "Resumo da Semana" — mesmo padrão do renderRitmoMesResumo, escala de 6 dias
        // úteis (seg-sáb; domingo não conta porque o admin não sobe análise).
        function renderRitmoSemanaResumo(realAcumulado, diaHoje, diaUtilHoje, meta) {
            const el = document.getElementById('ritmoSemanaResumo');
            if (!el) return;
            const DIAS_UTEIS_SEMANA = 6;
            const metricLabel = RITMO_METRIC_LABELS[ritmoMetric] || 'itens';
            const realHoje = diaHoje > 0 ? (realAcumulado[diaHoje - 1] || 0) : 0;
            const diasRestantes = Math.max(0, DIAS_UTEIS_SEMANA - diaUtilHoje);
            const necessarioPorDia = diasRestantes > 0 ? Math.max(0, meta - realHoje) / diasRestantes : 0;
            const mediaPorDia = diaUtilHoje > 0 ? realHoje / diaUtilHoje : 0;

            el.innerHTML = `
                <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Resumo da Semana</p>
                <div class="space-y-3 text-xs">
                    <div>
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-slate-400 flex items-center gap-1.5" title="Segunda a sábado — domingo não conta"><i class="fa-regular fa-calendar text-sky-400"></i> Dias úteis</span>
                            <span class="font-bold text-slate-200">${diaUtilHoje} de ${DIAS_UTEIS_SEMANA}</span>
                        </div>
                        <div class="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div class="h-full bg-sky-500 rounded-full" style="width:${Math.min(100, (diaUtilHoje / DIAS_UTEIS_SEMANA) * 100).toFixed(0)}%"></div>
                        </div>
                    </div>
                    <div class="flex items-center justify-between pt-2 border-t border-slate-800/70">
                        <span class="text-slate-400 flex items-center gap-1.5"><i class="fa-solid fa-bullseye text-slate-500"></i> Meta da semana</span>
                        <span class="font-bold text-slate-200">${Math.round(meta)} <span class="text-slate-500 font-normal">${metricLabel}</span></span>
                    </div>
                    <div class="flex items-center justify-between pt-2 border-t border-slate-800/70">
                        <span class="text-slate-400 flex items-center gap-1.5"><i class="fa-solid fa-triangle-exclamation text-rose-500"></i> Necessário/dia útil</span>
                        <span class="font-bold text-rose-400">${necessarioPorDia.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-slate-400 flex items-center gap-1.5"><i class="fa-solid fa-chart-simple text-slate-500"></i> Média/dia útil</span>
                        <span class="font-bold text-slate-200">${mediaPorDia.toFixed(2).replace('.', ',')}</span>
                    </div>
                </div>
            `;
        }

        // "Evolução Semanal do Mês": mesmo raciocínio de mês comercial do "Ritmo do Mês" (janela
        // REAL, não o calendário — pode começar/acabar fora do dia 1/último dia), mas agrupado por
        // SEMANA em vez de por dia, e com o funil completo (Prospecção→Vendas) em vez de uma
        // métrica por vez. A janela de Análises (getJanelaMesComercial('analises')) vira a "régua"
        // de semanas compartilhada pelo gráfico — cada uma das 6 etapas continua contando pela SUA
        // PRÓPRIA regra de pertencimento ao mês (igual ao resto do app: Prospecção por
        // _MesComercialNorm, Agendamentos/Compareceu por Data+agendaMatchesRef, etc.), só a POSIÇÃO
        // de cada linha dentro da semana usa essa janela comum, pra dar pra comparar as 6 lado a
        // lado. Dois mini-gráficos (Topo/Meio-Fim do Funil) pelo mesmo motivo de escala do card
        // "Evolução Mensal de Operações" — Prospecção tem volume muito maior que as demais etapas.
        // Barras pras etapas de contagem "seca" + linha pra Prospecção (eixo secundário), com o
        // valor escrito em cima de cada barra/ponto e uma tabela + totais do mês abaixo de cada
        // gráfico, igual ao formato pedido.
        const EVO_SEMANAL_VALUE_LABELS_PLUGIN = {
            id: 'evoSemanalValueLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
                ctx.textAlign = 'center';
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#0b1220';
                chart.data.datasets.forEach((ds, i) => {
                    if (ds.label && ds.label.startsWith('Meta ')) return; // linha de meta não repete rótulo em cada ponto
                    const meta = chart.getDatasetMeta(i);
                    if (meta.hidden) return;
                    meta.data.forEach((el, idx) => {
                        const val = ds.data[idx];
                        if (!val) return;
                        const y = ds.type === 'line' ? el.y - 12 : el.y - 6;
                        ctx.fillStyle = ds.borderColor || ds.backgroundColor;
                        ctx.strokeText(String(val), el.x, y);
                        ctx.fillText(String(val), el.x, y);
                    });
                });
                ctx.restore();
            }
        };

        // Rótulos de valor em cada ponto dos 2 gráficos da "Evolução Mensal de Operações" — o usuário
        // pediu pra ver o número de cada mês sem precisar passar o mouse. Diferente do plugin da
        // Evolução Semanal, aqui as linhas se CRUZAM bastante (ex.: Prospecção x Agendamentos x
        // Compareceu), então os rótulos do mesmo mês são agrupados e empurrados pra baixo quando
        // colidiriam, e as pontas são "puxadas" pra dentro pra não vazar da área do gráfico.
        const EVO_MENSAL_VALUE_LABELS_PLUGIN = {
            id: 'evoMensalValueLabels',
            afterDatasetsDraw(chart) {
                const { ctx, chartArea } = chart;
                ctx.save();
                ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
                ctx.lineWidth = 3;
                ctx.strokeStyle = '#0b1220';
                ctx.textAlign = 'center';

                // Agrupa pela POSIÇÃO HORIZONTAL (não pelo índice do mês): em linha as 3 séries caem
                // no mesmo x e precisam de anti-colisão; em barras agrupadas cada série tem seu
                // próprio x, então nada é empurrado à toa e o número fica reto em cima da barra.
                const porMes = {};
                chart.data.datasets.forEach((ds, i) => {
                    const meta = chart.getDatasetMeta(i);
                    if (meta.hidden) return;
                    meta.data.forEach((el, idx) => {
                        const val = ds.data[idx];
                        if (val === null || val === undefined) return;
                        const chave = Math.round(el.x);
                        (porMes[chave] = porMes[chave] || []).push({ x: el.x, y: el.y, val, cor: ds.borderColor || ds.backgroundColor });
                    });
                });

                const ESPACO = 14;
                Object.values(porMes).forEach(pontos => {
                    pontos.sort((a, b) => a.y - b.y); // de cima pra baixo
                    let ultimoY = -Infinity;
                    pontos.forEach(p => {
                        let y = p.y - 10;
                        if (y - ultimoY < ESPACO) y = ultimoY + ESPACO; // empurra se fosse colidir
                        y = Math.max(chartArea.top + 10, Math.min(y, chartArea.bottom - 2));
                        ultimoY = y;
                        // Encosta o texto pra dentro nas pontas, pra não cortar no 1º/último mês
                        const texto = String(p.val);
                        const meia = ctx.measureText(texto).width / 2 + 2;
                        const x = Math.max(chartArea.left + meia, Math.min(p.x, chartArea.right - meia));
                        ctx.fillStyle = p.cor;
                        ctx.strokeText(texto, x, y);
                        ctx.fillText(texto, x, y);
                    });
                });
                ctx.restore();
            }
        };

        // Monta a tabela (etapa x semana) que fica abaixo de cada mini-gráfico: 3 sub-linhas por
        // etapa (Meta / Realizado / % Ating.) + coluna Total no fim, igual ao formato pedido.
        function buildEvoSemanalTable(labelsCurtos, linhas) {
            const headCols = labelsCurtos.map(l => `<th class="text-center py-1.5 px-2 text-slate-500 font-bold whitespace-nowrap">${l} Sem</th>`).join('');
            const head = `<tr class="border-b border-slate-800"><th class="text-left py-1.5 pr-2 text-slate-500"></th><th class="text-left py-1.5 px-2 text-slate-500"></th>${headCols}<th class="text-center py-1.5 px-2 text-slate-500 font-bold">Total</th></tr>`;

            const pctCls = (p) => p >= 100 ? 'text-emerald-400' : (p >= 50 ? 'text-slate-300' : 'text-rose-400');

            const body = linhas.map(l => {
                const totalRealizado = l.realizado.reduce((a, b) => a + b, 0);
                const totalMeta = l.meta.reduce((a, b) => a + b, 0);
                const pcts = l.realizado.map((v, i) => l.meta[i] > 0 ? Math.round((v / l.meta[i]) * 100) : 0);
                const pctTotal = totalMeta > 0 ? Math.round((totalRealizado / totalMeta) * 100) : 0;

                const metaCells = l.meta.map(v => `<td class="text-center py-1 px-2 text-slate-500">${Math.round(v)}</td>`).join('');
                const realCells = l.realizado.map(v => `<td class="text-center py-1 px-2 text-slate-200 font-semibold">${v}</td>`).join('');
                const pctCells = pcts.map(p => `<td class="text-center py-1 px-2 font-bold ${pctCls(p)}">${p}%</td>`).join('');

                return `
                    <tr class="border-t border-slate-800/60">
                        <td class="py-1 pr-1 align-top whitespace-nowrap" rowspan="3"><span class="inline-block w-2 h-2 rounded-full align-middle mr-1.5" style="background:${l.hex}"></span><span class="font-bold text-slate-200 align-middle">${l.label}</span></td>
                        <td class="py-1 px-2 text-slate-500">Meta</td>
                        ${metaCells}
                        <td class="text-center py-1 px-2 font-bold text-slate-400">${Math.round(totalMeta)}</td>
                    </tr>
                    <tr>
                        <td class="py-1 px-2 text-slate-500">Realizado</td>
                        ${realCells}
                        <td class="text-center py-1 px-2 font-bold text-slate-100">${totalRealizado}</td>
                    </tr>
                    <tr class="border-b border-slate-800/60">
                        <td class="py-1 px-2 text-slate-500">% Ating.</td>
                        ${pctCells}
                        <td class="text-center py-1 px-2 font-extrabold ${pctCls(pctTotal)}">${pctTotal}%</td>
                    </tr>`;
            }).join('');

            return `<thead>${head}</thead><tbody>${body}</tbody>`;
        }

        function renderEvolucaoSemanalChart() {
            const canvasTopo = document.getElementById('chartEvolucaoSemanalTopo');
            const canvasFinal = document.getElementById('chartEvolucaoSemanalFinal');
            if (!canvasTopo || !canvasFinal) return;
            if (charts.evolucaoSemanalTopo) charts.evolucaoSemanalTopo.destroy();
            if (charts.evolucaoSemanalFinal) charts.evolucaoSemanalFinal.destroy();

            const { inicioReal, diasNoMes, fimEstimado, mesNome, ano } = getJanelaMesComercial('analises');

            const tituloEl = document.getElementById('evolucaoSemanalTituloMes');
            if (tituloEl) tituloEl.textContent = `${mesNome.charAt(0).toUpperCase()}${mesNome.slice(1)}/${ano}`;
            const periodoEl = document.getElementById('evolucaoSemanalPeriodoLabel');
            if (periodoEl) periodoEl.textContent = `Mês comercial: ${formatDate(inicioReal)} a ${formatDate(fimEstimado)}`;

            // Grupos de semana — getSemanasMesComercial (mesma função compartilhada usada pela
            // régua de dias do Ritmo do Mês, pelo Ritmo da Semana e pelo filtro de pills "Semana").
            const semanasComerciais = getSemanasMesComercial(inicioReal, diasNoMes);
            const diaParaSemanaIdx = new Array(diasNoMes + 1).fill(0);
            semanasComerciais.forEach((s, wi) => s.dias.forEach(x => { diaParaSemanaIdx[x.d] = wi; }));
            const labelsSemana = semanasComerciais.map(s =>
                `${s.idx}ª SEM (${String(s.inicio.getDate()).padStart(2, '0')}-${String(s.fim.getDate()).padStart(2, '0')})`);
            const labelsSemanaCurtos = semanasComerciais.map(s => `${s.idx}ª`);
            const numSemanas = semanasComerciais.length;

            const contagens = {};
            FUNIL_ETAPAS.forEach(e => { contagens[e.key] = new Array(semanasComerciais.length).fill(0); });
            const somarPorDia = (dataStr, key) => {
                const d = parseDate(dataStr);
                if (!d) return;
                const diaIdx = Math.floor((d - inicioReal) / 86400000) + 1;
                if (diaIdx < 1 || diaIdx > diasNoMes) return; // fora da janela do mês (raro, mas evita erro de índice)
                contagens[key][diaParaSemanaIdx[diaIdx]]++;
            };

            filteredProspeccaoDataset.forEach(row => {
                if (metricMatchesRef(row, '_MesComercialNorm', 'Cadastro', currentRefDateProspeccao)) somarPorDia(row['Cadastro'], 'prospeccao');
            });
            filteredAgendaDataset.forEach(row => {
                if (agendaMatchesRef(row, currentRefDateAgenda, 'agendamentos')) somarPorDia(agendaDateForMetric(row, 'agendamentos'), 'agendamentos');
                if (isCompareceu(row) && agendaMatchesRef(row, currentRefDateAgenda, 'compareceu')) somarPorDia(agendaDateForMetric(row, 'compareceu'), 'compareceu');
            });
            filteredDataset.forEach(row => {
                if (metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', currentRefDate)) somarPorDia(row['Data Cadastro'], 'analises');
                if (isAprovadoNoPeriodo(row, currentRefDate)) somarPorDia(dataAprovacaoEfetiva(row), 'aprovacoes');
                if (isVendaGanhaReal(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', currentRefDate)) somarPorDia(row['Data Ganho'], 'vendas');
            });

            const soma = arr => arr.reduce((s, v) => s + v, 0);
            const totais = {};
            FUNIL_ETAPAS.forEach(e => { totais[e.key] = soma(contagens[e.key]); });

            // Meta semanal = a meta JÁ CADASTRADA por semana (rankingsMetas.*Sem, editada em
            // "Editar metas") — não é a meta mensal dividida por semana, é o valor semanal que o
            // diretor já configura lá. Se o filtro de Corretor do topo estiver com um nome
            // específico selecionado, usa a meta INDIVIDUAL daquele corretor
            // (metasPorCorretor[nome], mesmas chaves *Sem — painel "Metas por Corretor") em vez da
            // meta da equipe inteira, pra dar pra acompanhar a linha de tendência dele sozinho.
            const METAS_SEMANAIS_KEYS = { prospeccao: 'prSem', agendamentos: 'agSem', compareceu: 'coSem', analises: 'anSem', aprovacoes: 'apSem', vendas: 'vdSem' };
            const metaSemanal = {};
            FUNIL_ETAPAS.forEach(e => {
                metaSemanal[e.key] = getDashboardMeta(e.key, 'Sem', rankingsMetas[METAS_SEMANAIS_KEYS[e.key]] || 0);
            });
            const metaLineData = key => new Array(numSemanas).fill(Math.round(metaSemanal[key]));

            const metaFonteLabelEl = document.getElementById('evolucaoSemanalMetaFonteLabel');
            if (metaFonteLabelEl) {
                metaFonteLabelEl.textContent = `${getDashboardMetaContextLabel()} · semanais.`;
            }

            // ===== 6 CARDS DE RESUMO (total do mês + valor da 1ª semana) =====
            const summaryEl = document.getElementById('evolucaoSemanalSummaryCards');
            if (summaryEl) {
                summaryEl.innerHTML = FUNIL_ETAPAS.map(e => {
                    const cl = FUNIL_CORES[e.color];
                    const primeiraSemana = contagens[e.key][0] || 0;
                    return `
                        <div class="bg-slate-950/50 rounded-xl border ${cl.border} p-3">
                            <div class="flex items-center gap-2 mb-1.5">
                                <div class="w-7 h-7 rounded-full bg-${e.color}-500/15 text-${e.color}-400 flex items-center justify-center text-xs shrink-0"><i class="fa-solid ${e.icon}"></i></div>
                                <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wide truncate">Total ${e.label}</span>
                            </div>
                            <p class="text-xl font-extrabold text-white">${totais[e.key]}</p>
                            <p class="text-[10px] text-slate-500 mt-0.5">Na 1ª semana: <span class="font-bold text-slate-300">${primeiraSemana}</span></p>
                        </div>
                    `;
                }).join('');
            }

            // ===== GRÁFICOS (barras + linha de Prospecção no eixo direito + linhas de meta) =====
            const optsFn = (comEixoSecundario) => ({
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 24, bottom: 8 } },
                plugins: {
                    legend: { labels: { color: '#f1f5f9', font: { size: 11, weight: 'bold' }, padding: 12, boxWidth: 10, filter: item => !item.text.startsWith('Meta ') } }
                },
                scales: Object.assign({
                    x: { grid: { color: 'rgba(255, 255, 255, 0.12)' }, ticks: { color: '#cbd5e1', font: { size: 10, weight: '500' } } },
                    y: { grid: { color: 'rgba(255, 255, 255, 0.12)' }, ticks: { color: '#cbd5e1', font: { size: 11, weight: '500' } }, beginAtZero: true }
                }, comEixoSecundario ? {
                    y1: { position: 'right', grid: { display: false }, ticks: { color: '#f9a8d4', font: { size: 11, weight: '500' } }, beginAtZero: true, title: { display: true, text: 'Prospecção', color: '#f9a8d4', font: { size: 9 } } }
                } : {})
            });
            const metaDs = (label, key, hex, yAxisID) => ({
                type: 'line', label: `Meta ${label} (${Math.round(metaSemanal[key])}/sem)`, data: metaLineData(key),
                borderColor: hex, borderWidth: 2, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 0,
                tension: 0, fill: false, yAxisID: yAxisID || 'y'
            });

            charts.evolucaoSemanalTopo = new Chart(canvasTopo.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labelsSemana,
                    datasets: [
                        { type: 'bar', label: 'Agendamentos', data: contagens.agendamentos, backgroundColor: '#a78bfa', borderRadius: 4, yAxisID: 'y' },
                        { type: 'bar', label: 'Compareceu', data: contagens.compareceu, backgroundColor: '#22d3ee', borderRadius: 4, yAxisID: 'y' },
                        { type: 'line', label: 'Prospecção (eixo direito)', data: contagens.prospeccao, borderColor: '#f472b6', backgroundColor: '#f472b6', borderWidth: 3, pointRadius: 4, pointHoverRadius: 7, pointBackgroundColor: '#f472b6', pointBorderColor: '#0b1220', pointBorderWidth: 1.5, tension: 0.3, fill: false, yAxisID: 'y1' },
                        metaDs('Prospecção', 'prospeccao', 'rgba(244,114,182,0.6)', 'y1'),
                        metaDs('Agendamentos', 'agendamentos', 'rgba(167,139,250,0.6)'),
                        metaDs('Compareceu', 'compareceu', 'rgba(34,211,238,0.6)')
                    ]
                },
                options: optsFn(true),
                plugins: [EVO_SEMANAL_VALUE_LABELS_PLUGIN]
            });
            charts.evolucaoSemanalFinal = new Chart(canvasFinal.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labelsSemana,
                    datasets: [
                        { label: 'Análises', data: contagens.analises, backgroundColor: '#38bdf8', borderRadius: 4 },
                        { label: 'Aprovações', data: contagens.aprovacoes, backgroundColor: '#fb923c', borderRadius: 4 },
                        { label: 'Vendas', data: contagens.vendas, backgroundColor: '#4ade80', borderRadius: 4 },
                        metaDs('Análises', 'analises', 'rgba(56,189,248,0.6)'),
                        metaDs('Aprovações', 'aprovacoes', 'rgba(251,146,60,0.6)'),
                        metaDs('Vendas', 'vendas', 'rgba(74,222,128,0.6)')
                    ]
                },
                options: optsFn(false),
                plugins: [EVO_SEMANAL_VALUE_LABELS_PLUGIN]
            });

            // ===== TABELAS (Meta/Realizado/% Ating. por semana + Total) ABAIXO DE CADA GRÁFICO =====
            const topoTableEl = document.getElementById('evolucaoSemanalTopoTable');
            if (topoTableEl) {
                topoTableEl.innerHTML = buildEvoSemanalTable(labelsSemanaCurtos, [
                    { label: 'Prospecção', hex: '#f472b6', realizado: contagens.prospeccao, meta: metaLineData('prospeccao') },
                    { label: 'Agendamentos', hex: '#a78bfa', realizado: contagens.agendamentos, meta: metaLineData('agendamentos') },
                    { label: 'Compareceu', hex: '#22d3ee', realizado: contagens.compareceu, meta: metaLineData('compareceu') }
                ]);
            }
            const topoTotalEl = document.getElementById('evolucaoSemanalTopoTotal');
            if (topoTotalEl) topoTotalEl.innerHTML = `<span class="inline-block bg-pink-500/10 text-pink-300 border border-pink-500/20 rounded-lg px-3 py-1.5 text-xs font-bold">Total Prospecção: ${totais.prospeccao}</span>`;

            const finalTableEl = document.getElementById('evolucaoSemanalFinalTable');
            if (finalTableEl) {
                finalTableEl.innerHTML = buildEvoSemanalTable(labelsSemanaCurtos, [
                    { label: 'Análises', hex: '#38bdf8', realizado: contagens.analises, meta: metaLineData('analises') },
                    { label: 'Aprovações', hex: '#fb923c', realizado: contagens.aprovacoes, meta: metaLineData('aprovacoes') },
                    { label: 'Vendas', hex: '#4ade80', realizado: contagens.vendas, meta: metaLineData('vendas') }
                ]);
            }
            const finalTotaisEl = document.getElementById('evolucaoSemanalFinalTotais');
            if (finalTotaisEl) {
                finalTotaisEl.innerHTML = `
                    <span class="inline-block bg-sky-500/10 text-sky-300 border border-sky-500/20 rounded-lg px-3 py-1.5 text-xs font-bold">Total Análises: ${totais.analises}</span>
                    <span class="inline-block bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-lg px-3 py-1.5 text-xs font-bold">Total Aprovações: ${totais.aprovacoes}</span>
                    <span class="inline-block bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-lg px-3 py-1.5 text-xs font-bold">Total Vendas: ${totais.vendas}</span>
                `;
            }

            // ===== RESUMO DO FUNIL + TAXAS DE CONVERSÃO DO MÊS =====
            const resumoEl = document.getElementById('evolucaoSemanalResumoTexto');
            if (resumoEl) resumoEl.textContent = `Do total de ${totais.prospeccao} prospecções no mês, geramos ${totais.analises} análises, ${totais.aprovacoes} aprovações e ${totais.vendas} vendas.`;

            const taxaAnalisesProspeccao = totais.prospeccao > 0 ? (totais.analises / totais.prospeccao) * 100 : 0;
            const taxaAprovacoesAnalises = totais.analises > 0 ? (totais.aprovacoes / totais.analises) * 100 : 0;
            const taxaVendasAprovacoes = totais.aprovacoes > 0 ? (totais.vendas / totais.aprovacoes) * 100 : 0;
            const taxasEl = document.getElementById('evolucaoSemanalTaxas');
            if (taxasEl) {
                const taxaPill = (label, valor, cor) => `
                    <div class="text-center">
                        <p class="text-[9px] font-bold text-slate-500 uppercase tracking-wide">${label}</p>
                        <p class="text-sm font-extrabold text-${cor}-400">${valor.toFixed(1)}%</p>
                    </div>`;
                taxasEl.innerHTML = taxaPill('Taxa Análises/Prospecção', taxaAnalisesProspeccao, 'sky')
                    + taxaPill('Taxa Aprovações/Análises', taxaAprovacoesAnalises, 'amber')
                    + taxaPill('Taxa Vendas/Aprovações', taxaVendasAprovacoes, 'emerald');
            }
        }

        function renderCharts() {
            if (charts.evolucaoTopoFunil) charts.evolucaoTopoFunil.destroy();
            if (charts.evolucaoFunilFinal) charts.evolucaoFunilFinal.destroy();
            if (charts.evolucaoVgv) charts.evolucaoVgv.destroy();
            if (charts.performanceCorretor) charts.performanceCorretor.destroy();
            if (charts.performanceEquipe) charts.performanceEquipe.destroy();

            // Agrupa por MÊS + ANO (não só o nome do mês) — senão "Junho" de 2025 e de 2026
            // ficariam somados na mesma barra. A chave junta os dois; a ordenação usa ano+índice
            // do mês pra sair em ordem cronológica de verdade, não alfabética. Cobre o funil
            // completo: Prospecção (CSV manual) e Agendamentos/Compareceu (Agenda de Visitas) além
            // das 3 métricas originais da planilha mestra (Análises/Aprovações/Vendas) — cada fonte
            // bucketa pelo seu próprio campo de mês, igual ao resto do app.
            let evolucaoMesMap = {};
            function addEvolucao(mesStr, campo, vgvInc) {
                const nome = normalizeMes(mesStr);
                if (!nome || !(nome in MESES_IDX)) return;
                const ano = getMesAno(mesStr) || 0;
                const chave = `${nome}/${ano}`;
                if (!evolucaoMesMap[chave]) evolucaoMesMap[chave] = { nome, ano, idx: MESES_IDX[nome], prospeccao: 0, agendamentos: 0, compareceu: 0, analises: 0, aprovacoes: 0, vendas: 0, vgv: 0 };
                evolucaoMesMap[chave][campo]++;
                if (vgvInc) evolucaoMesMap[chave].vgv += vgvInc;
            }
            filteredDataset.forEach(row => {
                addEvolucao(row['Mês Cadastro'], 'analises');
                if (isAprovado(row['Situação - Analise'])) addEvolucao(mesAprovacaoEfetivo(row), 'aprovacoes');
                if (isGanho(row)) addEvolucao(row['Mês Ganho'], 'vendas', getVGV(row));
            });
            filteredProspeccaoDataset.forEach(row => {
                addEvolucao(row['_MesComercialNorm'], 'prospeccao');
            });
            filteredAgendaDataset.forEach(row => {
                addEvolucao(agendaMesStr(row, 'agendamentos'), 'agendamentos');
                if (isCompareceu(row)) addEvolucao(agendaMesStr(row, 'compareceu'), 'compareceu');
            });

            const evolucaoOrdenada = Object.values(evolucaoMesMap).sort((a, b) => (a.ano - b.ano) || (a.idx - b.idx));
            let activeLabels = evolucaoOrdenada.map(m => m.ano ? `${m.nome.slice(0, 3)}/${String(m.ano).slice(-2)}` : m.nome);
            let dataAnalises = evolucaoOrdenada.map(m => m.analises);
            let dataAprovacoes = evolucaoOrdenada.map(m => m.aprovacoes);
            let dataVendas = evolucaoOrdenada.map(m => m.vendas);
            let dataVgv = evolucaoOrdenada.map(m => m.vgv);

            // Janela do mini-dashboard (Últimos 3/6 meses ou todo o histórico) — só afeta o card
            // "Evolução Mensal de Operações" (gráfico, cards de tendência e taxa de conversão);
            // os outros gráficos da página continuam com o histórico completo.
            const janelaSel = document.getElementById('evolucaoJanelaSelect');
            const janelaMeses = janelaSel ? parseInt(janelaSel.value) || 0 : 3;
            const evolucaoJanela = janelaMeses > 0 ? evolucaoOrdenada.slice(-janelaMeses) : evolucaoOrdenada;
            const labelsJanela = evolucaoJanela.map(m => m.ano ? `${m.nome.slice(0, 3)}/${String(m.ano).slice(-2)}` : m.nome);
            const prospJanela = evolucaoJanela.map(m => m.prospeccao);
            const agendJanela = evolucaoJanela.map(m => m.agendamentos);
            const compJanela = evolucaoJanela.map(m => m.compareceu);
            const anaJanela = evolucaoJanela.map(m => m.analises);
            const aprovJanela = evolucaoJanela.map(m => m.aprovacoes);
            const vendJanela = evolucaoJanela.map(m => m.vendas);

            renderEvolucaoTrendCards(evolucaoJanela);
            renderTaxaConversaoTable(evolucaoJanela);
            renderInsightMes(evolucaoJanela);
            renderAtividadesRecentes();
            renderRitmoMesChart();
            if (typeof renderRitmoSemanaChart === 'function') renderRitmoSemanaChart();
            if (typeof renderEvolucaoSemanalChart === 'function') renderEvolucaoSemanalChart();

            // 1a. TOPO DO FUNIL (Prospecção/Agendamentos/Compareceu) e 1b. MEIO E FIM DO FUNIL
            // (Análises/Aprovações/Vendas) — dois mini-gráficos separados em vez de 1 só com as 6
            // séries juntas: Prospecção tem uma escala muito maior que as demais etapas (centenas
            // vs dezenas), então plotadas todas no mesmo eixo linear as etapas menores viravam
            // linhas achatadas perto do zero, ilegíveis. Separar por metade do funil já ajuda bastante,
            // mas mesmo dentro do "Topo do Funil" Prospecção ainda é bem maior que Agendamentos/
            // Compareceu — por isso Prospecção usa um EIXO SECUNDÁRIO à direita (cor rosa, igual à
            // linha), enquanto Agendamentos/Compareceu dividem o eixo principal à esquerda, ambos
            // legíveis ao mesmo tempo. Sem preenchimento de área (fill:false) pra não embolar visualmente.
            const funilChartOptions = (metricas, comEixoSecundario) => ({
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 20, bottom: 8 } },
                onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
                onClick: (evt, els) => {
                    if (!els.length) return;
                    const mes = evolucaoJanela[els[0].index];
                    if (!mes) return;
                    openEvolucaoMesDetail(metricas[els[0].datasetIndex], mes.nome, mes.ano);
                },
                plugins: {
                    legend: { labels: { color: '#f1f5f9', font: { size: 11, weight: 'bold' }, padding: 12, boxWidth: 10 } },
                    tooltip: { callbacks: { title: (items) => labelsJanela[items[0].dataIndex] } }
                },
                scales: Object.assign({
                    x: { grid: { color: 'rgba(255, 255, 255, 0.12)' }, ticks: { color: '#cbd5e1', font: { size: 11, weight: '500' } } },
                    y: { grid: { color: 'rgba(255, 255, 255, 0.12)' }, ticks: { color: '#cbd5e1', font: { size: 11, weight: '500' } }, beginAtZero: true }
                }, comEixoSecundario ? {
                    y1: { position: 'right', grid: { display: false }, ticks: { color: '#f9a8d4', font: { size: 11, weight: '500' } }, beginAtZero: true, title: { display: true, text: 'Prospecção', color: '#f9a8d4', font: { size: 9 } } }
                } : {})
            });
            const funilDataset = (label, data, hex, thick, yAxisID) => ({
                label, data, borderColor: hex, backgroundColor: hex,
                borderWidth: thick ? 3 : 2.5, pointRadius: thick ? 4 : 3, pointHoverRadius: thick ? 7 : 6,
                pointBackgroundColor: hex, pointBorderColor: '#0b1220', pointBorderWidth: thick ? 1.5 : 1,
                tension: 0.3, fill: false, yAxisID: yAxisID || 'y'
            });
            // Meio/fim do funil em BARRAS agrupadas (pedido do usuário, via mockup): Análises,
            // Aprovações e Vendas têm ordens de grandeza parecidas, então a barra compara melhor
            // mês a mês do que 3 linhas quase paralelas — e o número fica limpo acima de cada barra,
            // sem o embolamento que linhas sobrepostas causavam.
            const funilBarDataset = (label, data, hex) => ({
                label, data, backgroundColor: hex, borderColor: hex, borderRadius: 4, borderWidth: 0
            });

            const ctxTopo = document.getElementById('chartEvolucaoTopoFunil').getContext('2d');
            charts.evolucaoTopoFunil = new Chart(ctxTopo, {
                type: 'line',
                data: {
                    labels: labelsJanela,
                    datasets: [
                        funilDataset('Prospecção (eixo direito)', prospJanela, '#f472b6', false, 'y1'),
                        funilDataset('Agendamentos', agendJanela, '#a78bfa'),
                        funilDataset('Compareceu', compJanela, '#22d3ee')
                    ]
                },
                options: funilChartOptions(['prospeccao', 'agendamentos', 'compareceu'], true),
                plugins: [EVO_MENSAL_VALUE_LABELS_PLUGIN]
            });

            const ctxFinal = document.getElementById('chartEvolucaoFunilFinal').getContext('2d');
            charts.evolucaoFunilFinal = new Chart(ctxFinal, {
                type: 'bar',
                data: {
                    labels: labelsJanela,
                    datasets: [
                        funilBarDataset('Análises', anaJanela, '#3b82f6'),
                        funilBarDataset('Aprovações', aprovJanela, '#f59e0b'),
                        funilBarDataset('Vendas', vendJanela, '#22c55e')
                    ]
                },
                options: funilChartOptions(['analises', 'aprovacoes', 'vendas']),
                plugins: [EVO_MENSAL_VALUE_LABELS_PLUGIN]
            });

            // 2. Gráfico de Evolução de VGV — barras com o valor escrito em cima + bolha com a
            // quantidade em cada ponto da linha, igual ao formato pedido. Clicar em qualquer um
            // dos dois (barra ou bolha) abre a lista de clientes daquele mês (ganhos = finalizados + pendentes).
            const ctxVgv = document.getElementById('chartEvolucaoVgv').getContext('2d');
            charts.evolucaoVgv = new Chart(ctxVgv, {
                type: 'bar',
                data: {
                    labels: activeLabels,
                    datasets: [
                        {
                            type: 'bar',
                            label: 'VGV',
                            data: dataVgv,
                            backgroundColor: 'rgba(129, 140, 248, 0.85)',
                            borderColor: '#818cf8',
                            borderWidth: 2,
                            borderRadius: 6,
                            yAxisID: 'y',
                            order: 2
                        },
                        {
                            type: 'line',
                            label: 'Ganhos (qtd)',
                            data: dataVendas,
                            borderColor: '#4ade80',
                            backgroundColor: '#4ade80',
                            borderWidth: 3,
                            pointRadius: 5,
                            pointHoverRadius: 8,
                            pointBackgroundColor: '#4ade80',
                            pointBorderColor: '#0b1220',
                            pointBorderWidth: 2,
                            tension: 0.3,
                            yAxisID: 'y1',
                            order: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 22 } },
                    onHover: (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; },
                    onClick: (evt, els) => {
                        if (!els.length) return;
                        const mes = evolucaoOrdenada[els[0].index];
                        if (mes) openGanhosMesDetail(mes.nome, mes.ano);
                    },
                    plugins: {
                        legend: { display: true, labels: { color: '#f1f5f9', font: { size: 11, weight: 'bold' }, padding: 12, usePointStyle: true } }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: '#cbd5e1', font: { size: 11, weight: '500' } }
                        },
                        y: {
                            position: 'left',
                            grid: { color: 'rgba(255, 255, 255, 0.12)' },
                            ticks: {
                                color: '#cbd5e1',
                                font: { size: 11, weight: '500' },
                                callback: function(val) { return `R$ ${(val / 1000000).toFixed(1)}M`; }
                            }
                        },
                        y1: {
                            position: 'right',
                            beginAtZero: true,
                            grid: { drawOnChartArea: false },
                            ticks: { color: '#4ade80', font: { size: 11, weight: '600' }, precision: 0 }
                        }
                    }
                },
                plugins: [{
                    id: 'vgvValueLabels',
                    afterDatasetsDraw(chart) {
                        const { ctx } = chart;
                        const barMeta = chart.getDatasetMeta(0);
                        const lineMeta = chart.getDatasetMeta(1);
                        ctx.save();
                        // Valor de VGV DENTRO da barra (perto da base) — não acima, pra nunca colidir
                        // com a bolha da linha (que às vezes fica bem perto do topo da barra).
                        ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
                        ctx.fillStyle = '#ffffff';
                        ctx.textAlign = 'center';
                        barMeta.data.forEach((bar, i) => {
                            const v = dataVgv[i];
                            if (!v) return;
                            const y = Math.max(bar.y + 14, bar.base - 12);
                            ctx.fillText(`R$ ${(v / 1000000).toFixed(1)}M`, bar.x, y);
                        });
                        // Bolha branca com a quantidade em cada ponto da linha
                        lineMeta.data.forEach((point, i) => {
                            const qtd = dataVendas[i];
                            const y = point.y - 16;
                            ctx.beginPath();
                            ctx.arc(point.x, y, 11, 0, Math.PI * 2);
                            ctx.fillStyle = '#ffffff';
                            ctx.fill();
                            ctx.lineWidth = 2;
                            ctx.strokeStyle = '#4ade80';
                            ctx.stroke();
                            ctx.fillStyle = '#0b1220';
                            ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(String(qtd), point.x, y + 1);
                        });
                        ctx.restore();
                    }
                }]
            });

            let corrData = {};
            filteredDataset.forEach(row => {
                const c = row.Corretor;
                if (!corrData[c]) corrData[c] = { analises: 0, aprovacoes: 0, vendas: 0 };
                if (metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', currentRefDate)) corrData[c].analises++;
                if (isAprovadoNoPeriodo(row, currentRefDate)) corrData[c].aprovacoes++;
                if (isGanho(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', currentRefDate)) corrData[c].vendas++;
            });

            let topCorretores = Object.keys(corrData).map(k => ({
                name: k,
                ...corrData[k]
            })).sort((a,b)=> b.vendas - a.vendas).slice(0, 5);

            // 3. Gráfico de Performance por Corretor - Uniformidade de Cores e Alto Contraste
            const ctxCorr = document.getElementById('chartPerformanceCorretor').getContext('2d');
            charts.performanceCorretor = new Chart(ctxCorr, {
                type: 'bar',
                data: {
                    labels: topCorretores.map(t => t.name),
                    datasets: [
                        {
                            label: 'Análises',
                            data: topCorretores.map(t => t.analises),
                            backgroundColor: '#38bdf8', 
                            borderRadius: 4
                        },
                        {
                            label: 'Aprovações',
                            data: topCorretores.map(t => t.aprovacoes),
                            backgroundColor: '#fb923c', 
                            borderRadius: 4
                        },
                        {
                            label: 'Vendas',
                            data: topCorretores.map(t => t.vendas),
                            backgroundColor: '#4ade80', 
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: '#f1f5f9', font: { size: 11, weight: 'bold' } }
                        }
                    },
                    scales: {
                        x: { 
                            grid: { display: false }, 
                            ticks: { color: '#cbd5e1', font: { size: 11 } } 
                        },
                        y: { 
                            grid: { color: 'rgba(255, 255, 255, 0.12)' }, 
                            ticks: { color: '#cbd5e1', font: { size: 11 } } 
                        }
                    }
                }
            });

            let equipeData = {};
            filteredDataset.forEach(row => {
                const eq = row.Equipe;
                if (!eq) return;
                if (!equipeData[eq]) equipeData[eq] = 0;
                if (isGanho(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', currentRefDate)) {
                    equipeData[eq] += getVGV(row);
                }
            });

            const ctxEq = document.getElementById('chartPerformanceEquipe').getContext('2d');
            charts.performanceEquipe = new Chart(ctxEq, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(equipeData),
                    datasets: [{
                        data: Object.values(equipeData),
                        backgroundColor: ['#6366f1', '#4ade80', '#fb923c', '#ec4899', '#3b82f6'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { 
                            position: 'right',
                            labels: { color: '#f1f5f9', boxWidth: 12, font: { size: 11, weight: 'bold' } }
                        }
                    }
                }
            });
        }

        function renderAlerts(refDate) {
            const alertsGrid = document.getElementById('alertsGrid');
            alertsGrid.innerHTML = '';

            // ALERTAS REESCRITOS (12/10/2026): antes só citava o 1º corretor da lista (inclusive
            // INATIVOS — aparecia a Kercia, que já saiu) e a meta de VGV era fixa em R$ 5,0M no código.
            // Agora: só corretores ATIVOS, dias contados até HOJE (não até o dia 15 do mês de
            // referência), lista todo mundo que se enquadra, e as metas vêm de "Metas do Mês".
            let alerts = [];
            const hojeAl = new Date(); hojeAl.setHours(0, 0, 0, 0);
            const umDiaEmMs = 1000 * 60 * 60 * 24;
            const diasDesde = d => Math.floor((hojeAl - d) / umDiaEmMs);
            const ativosAl = getActiveCorretores();
            const ultimaAnalise = {}, ultimaVenda = {};
            dataset.forEach(row => {
                const c = row.Corretor;
                const dCad = parseDate(row['Data Cadastro']);
                if (dCad && dCad <= hojeAl && (!ultimaAnalise[c] || dCad > ultimaAnalise[c])) ultimaAnalise[c] = dCad;
                const dGan = parseDate(row['Data Ganho']);
                if (isVendaGanhaReal(row) && dGan && dGan <= hojeAl && (!ultimaVenda[c] || dGan > ultimaVenda[c])) ultimaVenda[c] = dGan;
            });
            const listaNomes = arr => arr.map(x => `<strong>${x.nome}</strong> (${x.txt})`).join(', ');

            // 1) Sem enviar análise há mais de 7 dias
            const semAnalise = ativosAl
                .map(nome => ({ nome, dias: ultimaAnalise[nome] ? diasDesde(ultimaAnalise[nome]) : Infinity }))
                .filter(x => x.dias > 7).sort((a, b) => b.dias - a.dias)
                .map(x => ({ ...x, txt: x.dias === Infinity ? 'nunca enviou' : `${x.dias} dias` }));
            if (semAnalise.length) alerts.push({
                type: 'warning', icon: 'fa-folder-open text-amber-400',
                title: `Sem enviar análise há mais de 7 dias (${semAnalise.length})`,
                desc: listaNomes(semAnalise) + '.',
                action: 'Cobrar documentação'
            });

            // 2) Sem venda há mais de 60 dias (ou nunca vendeu)
            const semVenda = ativosAl
                .map(nome => ({ nome, dias: ultimaVenda[nome] ? diasDesde(ultimaVenda[nome]) : Infinity }))
                .filter(x => x.dias > 60).sort((a, b) => b.dias - a.dias)
                .map(x => ({ ...x, txt: x.dias === Infinity ? 'nunca vendeu' : `${x.dias} dias` }));
            if (semVenda.length) alerts.push({
                type: 'danger', icon: 'fa-user-clock text-rose-400',
                title: `Sem venda há mais de 60 dias (${semVenda.length})`,
                desc: listaNomes(semVenda) + '.',
                action: 'Reunião de alinhamento'
            });

            // 3) Etapas do funil abaixo do ideal de hoje (mesma conta do Funil/Ritmo do Mês)
            const etapasAl = [
                { metrica: 'analises', label: 'Análises', real: kpiValues.analyses, meta: getDashboardMeta('analises', 'Mes', metasMensais.analises) },
                { metrica: 'aprovacoes', label: 'Aprovações', real: kpiValues.approvals, meta: getDashboardMeta('aprovacoes', 'Mes', metasMensais.aprovacoes) },
                { metrica: 'vendas', label: 'Vendas', real: kpiValues.sales, meta: getDashboardMeta('vendas', 'Mes', metasMensais.vendas) },
                { metrica: 'agendamentos', label: 'Agendamentos', real: kpiValues.agendamentos, meta: getDashboardMeta('agendamentos', 'Mes', metasMensais.agendamentos) },
                { metrica: 'compareceu', label: 'Visitas', real: kpiValues.compareceu, meta: getDashboardMeta('compareceu', 'Mes', metasMensais.compareceu) }
            ];
            let janelaRef = null;
            const atrasadas = [];
            if (!getReferenceMesComercial()) etapasAl.forEach(e => {
                if (!e.meta) return;
                const jan = getJanelaMesComercial(e.metrica);
                if (!janelaRef) janelaRef = jan;
                const ideal = jan.diasUteisNoMes > 0 ? Math.round(e.meta * jan.diaUtilHoje / jan.diasUteisNoMes) : 0;
                if (ideal > 0 && (e.real || 0) < ideal * 0.8) atrasadas.push(`<strong>${e.label}</strong> ${e.real || 0} de ${ideal} (${Math.round(((e.real || 0) / ideal) * 100)}% do ideal)`);
            });
            if (atrasadas.length) alerts.push({
                type: 'danger', icon: 'fa-gauge-high text-rose-400',
                title: 'Etapas abaixo do ritmo ideal de hoje',
                desc: atrasadas.join(' · ') + '.',
                action: 'Ver Ritmo do Mês'
            });

            // 4) Meta de VGV (de "Metas do Mês", não mais fixa)
            const metaVgvAl = metasMensais.vgv || 0;
            if (metaVgvAl > 0) {
                const progresso = (kpiValues.vgv / metaVgvAl) * 100;
                if (progresso < 100) alerts.push({
                    type: 'meta', icon: 'fa-bullseye text-brand-400',
                    title: 'Meta de VGV do mês',
                    desc: `Faltam <strong>${formatCurrency(Math.max(0, metaVgvAl - kpiValues.vgv))}</strong> para a meta de ${formatCurrency(metaVgvAl)}. Progresso: <strong>${progresso.toFixed(1)}%</strong>.`,
                    action: 'Ver Metas do Mês'
                });
                else alerts.push({
                    type: 'success', icon: 'fa-award text-emerald-400',
                    title: 'Meta de VGV batida!',
                    desc: `Parabéns à equipe! Meta de ${formatCurrency(metaVgvAl)} superada. VGV do mês: <strong>${formatCurrency(kpiValues.vgv)}</strong>.`,
                    action: 'Revisar meta'
                });
            }

            // 5) Mês comercial sem período cadastrado (janela estimada pelo calendário)
            if (janelaRef && !janelaRef.configMes) alerts.push({
                type: 'warning', icon: 'fa-calendar-xmark text-amber-400',
                title: `${janelaRef.mesNome}/${janelaRef.ano} sem período cadastrado`,
                desc: `O início e o fim do mês comercial estão sendo estimados — o "ideal de hoje" pode estar errado. Cadastre as datas em <strong>Meses Comerciais</strong> (menu lateral).`,
                action: 'Cadastrar período'
            });

            alerts.forEach(alert => {
                let borderTheme = "border-slate-800 bg-slate-900/20";
                if (alert.type === 'danger') borderTheme = "border-rose-500/20 bg-rose-500/5";
                if (alert.type === 'warning') borderTheme = "border-amber-500/20 bg-amber-500/5";
                if (alert.type === 'success') borderTheme = "border-brand-500/20 bg-brand-500/5";

                const alertHtml = `
                    <div class="rounded-xl border ${borderTheme} p-4 flex gap-3 transition hover:border-slate-700">
                        <div class="h-9 w-9 bg-slate-950/50 border border-slate-800 rounded-lg flex items-center justify-center shrink-0">
                            <i class="fa-solid ${alert.icon} text-sm"></i>
                        </div>
                        <div class="min-w-0 flex-1">
                            <h4 class="text-xs font-bold text-slate-200">${alert.title}</h4>
                            <p class="text-xs text-slate-400 mt-1 leading-relaxed">${alert.desc}</p>
                            <span class="inline-block mt-3 px-2 py-0.5 bg-slate-950 text-[10px] font-bold rounded border border-slate-800 text-slate-300 hover:text-white cursor-pointer transition">
                                ${alert.action}
                            </span>
                        </div>
                    </div>
                `;
                alertsGrid.insertAdjacentHTML('beforeend', alertHtml);
            });
        }

        // Detalhes do calendário por métrica.
        let calDetail = {
            analises:  { cell: {}, day: {}, month: [] },
            aprovados: { cell: {}, day: {}, month: [] },
            vendas:    { cell: {}, day: {}, month: [] },
            agendamentos: { cell: {}, day: {}, month: [] },
            visitas:   { cell: {}, day: {}, month: [] }
        };
        // Mantidos por compatibilidade (apontam para análises)
        let calendarDetailsMap = {};
        let calendarDayDetails = {};
        let calendarMonthDetails = [];
        let calendarMetric = 'analises'; // análise, aprovação, venda, agendamento ou visita
        let calendarDimension = localStorage.getItem(`${appId}-calendar-dimension`) === 'corretor' ? 'corretor' : 'equipe';
        let calendarTab = 'production';
        let calendarForecastDays = 30;

        function agendaPlannedVisitDate(row) {
            const normalized = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [stripDiacritics(key).toLowerCase().replace(/[^a-z0-9]/g, ''), value]));
            for (const key of ['dataagendada','datadavisita','datavisita','dataagendamento','data']) if (normalized[key]) return normalized[key];
            return null;
        }

        function setCalendarTab(tab) {
            calendarTab = tab === 'forecast' ? 'forecast' : 'production';
            renderCalendarTab();
        }

        function renderCalendarTab() {
            const forecast = calendarTab === 'forecast';
            const productionBtn = document.getElementById('calTab-production');
            const forecastBtn = document.getElementById('calTab-forecast');
            if (productionBtn) productionBtn.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition ${!forecast ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`;
            if (forecastBtn) forecastBtn.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition ${forecast ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`;
            document.getElementById('calendarMetricSelector')?.classList.toggle('hidden', forecast);
            document.getElementById('calendarDimensionSelector')?.classList.toggle('hidden', forecast);
            document.getElementById('calMonthLabel')?.classList.toggle('hidden', forecast);
            document.getElementById('calendarForecastPanel')?.classList.toggle('hidden', !forecast);
            document.getElementById('calendarKpis')?.classList.toggle('hidden', forecast);
            document.getElementById('calendarHeatmapPanel')?.classList.toggle('hidden', forecast);
            const title = document.getElementById('calendarTitle');
            const subtitle = document.getElementById('calendarSubtitle');
            if (title) title.innerHTML = forecast ? '<i class="fa-solid fa-calendar-check text-violet-400"></i> Previsão de Atendimentos' : '<i class="fa-solid fa-fire text-orange-400"></i> Mapa de Calor Operacional';
            if (subtitle) subtitle.textContent = forecast ? 'Veja os atendimentos pendentes pela data marcada e organize os próximos dias.' : 'Acompanhe a produtividade diária da equipe.';
            if (forecast) drawAttendanceForecast(); else drawProductionCalendar();
        }

        function setForecastDays(days) {
            calendarForecastDays = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
            drawAttendanceForecast();
        }

        function drawAttendanceForecast() {
            const body = document.getElementById('calForecastTableBody');
            if (!body) return;
            [7, 30, 90].forEach(days => {
                const btn = document.getElementById(`calForecastDays-${days}`);
                if (btn) btn.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition ${calendarForecastDays === days ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`;
            });
            const start = new Date(); start.setHours(0, 0, 0, 0);
            const end = new Date(start); end.setDate(end.getDate() + calendarForecastDays - 1); end.setHours(23, 59, 59, 999);
            const scheduled = filteredAgendaDataset.filter(row => {
                if (!isAgendaPendente(row)) return false;
                const date = parseDate(agendaPlannedVisitDate(row));
                return date && date >= start && date <= end;
            }).map(row => {
                const date = parseDate(agendaPlannedVisitDate(row));
                return { row, date, team: getRankingTeamForBroker(row.Corretor) || 'Sem equipe' };
            }).sort((a, b) => a.date - b.date || String(a.row['Hora'] || '').localeCompare(String(b.row['Hora'] || '')) || String(a.row.Cliente || '').localeCompare(String(b.row.Cliente || ''), 'pt-BR'));
            const countThrough = days => scheduled.filter(item => item.date < new Date(start.getFullYear(), start.getMonth(), start.getDate() + days)).length;
            document.getElementById('calForecastToday').textContent = scheduled.filter(item => item.date.toDateString() === start.toDateString()).length;
            document.getElementById('calForecastWeek').textContent = countThrough(7);
            document.getElementById('calForecastPeriod').textContent = scheduled.length;
            document.getElementById('calForecastRangeLabel').textContent = `${start.toLocaleDateString('pt-BR')} a ${end.toLocaleDateString('pt-BR')} · ${scheduled.length} previstos`;
            if (!scheduled.length) {
                body.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-xs text-slate-500">Nenhum atendimento pendente previsto neste período.</td></tr>`;
                return;
            }
            body.innerHTML = scheduled.map(({row, date, team}) => {
                const dateLabel = date.toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' });
                const time = String(row.Hora || '').trim() || '—';
                const client = String(row.Cliente || '').trim() || 'Cliente não informado';
                const broker = String(row.Corretor || '').trim() || 'Sem corretor';
                const project = String(row.Empreendimento || row['empreendimento preferencia'] || '').trim() || '—';
                return `<tr class="hover:bg-slate-800/30 transition"><td class="p-3 text-violet-200 font-bold whitespace-nowrap">${orgEsc(dateLabel)}</td><td class="p-3 text-slate-300 whitespace-nowrap">${orgEsc(time)}</td><td class="p-3 text-slate-100 font-semibold">${orgEsc(client)}</td><td class="p-3 text-slate-300">${orgEsc(team)}</td><td class="p-3 text-slate-300">${orgEsc(broker)}</td><td class="p-3 text-slate-400">${orgEsc(project)}</td></tr>`;
            }).join('');
        }

        
