// ====== REFERÊNCIA DE SEMANA/MÊS DOS RANKINGS RÁPIDOS ======
        // quickRef = data escolhida (Date) para os cards de Semana e Mês; null = atual. "Hoje" ignora isto.
        let quickRef = null;
        function setQuickRef(val) {
            if (!val) { quickRef = null; }
            else { const p = val.split('-'); quickRef = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])); }
            drawQuickRankings();
        }
        function shiftQuickRef(days) {
            const base = quickRef || (isMockDataActive ? new Date(2026, 5, 9) : new Date());
            const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
            d.setDate(d.getDate() + days);
            quickRef = d;
            drawQuickRankings();
        }
        function resetQuickRef() {
            quickRef = null;
            drawQuickRankings();
        }

        // Rankings rápidos estilo Habitnet: Análises/Aprovações (Hoje e Semana) e Vendas (Semana e Mês).
        // Snapshot por data atual; respeita só os filtros de corretor/equipe/construtora/empreendimento.
        let rankingCardsSnapshot = []; // dados "crus" de cada card, na mesma ordem do grid — usado por
                                        // exportRankingCardImage() pra desenhar a imagem via Canvas 2D
                                        // (sem depender de tirar print do DOM, que se mostrou instável).
        // { [cardKey]: { [nomeCorretor]: [linhas...] } } — as linhas por trás de cada número "Feito"
        // dos Rankings Rápidos, pra abrir o detalhamento de clientes ao clicar (openQuickRankingDetail).
        let quickRankingRowsCache = {};
        // { [etapaKey]: [linhas...] } — mesmo padrão, mas pra tira "Produtividade de Hoje" do Funil
        // (openFunnelHojeDetail).
        let funnelHojeRowsCache = {};
        // Os Rankings Rápidos são a seção MAIS PESADA da página: 4.242 elementos de DOM (metade do
        // total), recriados via innerHTML. Redesenhar isso a cada applyFilters() — inclusive no
        // auto-refresh de 15s — com a aba escondida era trabalho 100% jogado fora e uma das causas
        // do travamento. Agora só desenha quando a aba Rankings está aberta; se algo mudou enquanto
        // ela estava fechada, fica pendente e é redesenhada ao entrar (ver switchView).
        let quickRankingsPendente = false;
        let quickRankingMode = localStorage.getItem(`${appId}-quick-ranking-mode`) === 'equipe' ? 'equipe' : 'corretor';
        let orgDashboardScope = null;
        function matchesOrgDashboardScope(row) {
            if (!orgDashboardScope) return true;
            if (orgDashboardScope.kind === 'broker') return orgPersonKey(row?.Corretor) === orgPersonKey(orgDashboardScope.name);
            if (orgDashboardScope.kind === 'team') return rankingTeamKey(getRankingTeamForBroker(row?.Corretor)) === rankingTeamKey(orgDashboardScope.team);
            return true;
        }
        function personMatchesOrgDashboardScope(name) {
            if (!orgDashboardScope) return true;
            if (orgDashboardScope.kind === 'broker') return orgPersonKey(name) === orgPersonKey(orgDashboardScope.name);
            if (orgDashboardScope.kind === 'team') return rankingTeamKey(getRankingTeamForBroker(name)) === rankingTeamKey(orgDashboardScope.team);
            return true;
        }
        function onDashboardFilterChange() { orgDashboardScope = null; applyFilters(); }
        function clearOrgDashboardScope() { orgDashboardScope = null; applyFilters(); }
        function selectOrgDashboardScope(element) {
            const kind = element?.dataset?.orgScope; if (!kind) return;
            const name = element.dataset.orgName || '';
            if (kind === 'regional') { orgDashboardScope = {kind: 'regional'}; document.getElementById('filterCorretor').value = ''; document.getElementById('filterEquipe').value = ''; document.getElementById('filterConstrutora').value = ''; document.getElementById('filterEmpreendimento').value = ''; }
            else if (kind === 'team') {
                const manager = organograma.find(n => n.id === element.dataset.orgManagerId && n.role === 'Gerente');
                if (!manager) return;
                orgDashboardScope = {kind: 'team', managerId: manager.id, name: manager.name, team: manager.equipe || manager.name};
                document.getElementById('filterCorretor').value = ''; document.getElementById('filterEquipe').value = ''; document.getElementById('filterConstrutora').value = ''; document.getElementById('filterEmpreendimento').value = ''; 
            } else {
                orgDashboardScope = {kind: 'broker', name};
                document.getElementById('filterEquipe').value = ''; document.getElementById('filterConstrutora').value = ''; document.getElementById('filterEmpreendimento').value = ''; 
                const select = document.getElementById('filterCorretor');
                if (![...select.options].some(o => o.value === name)) { const option = document.createElement('option'); option.value = name; option.textContent = name; select.appendChild(option); }
                select.value = name;
            }
            switchView('dashboard'); applyFilters();
        }
        function initOrgDashboardClicks() {
            const section = document.getElementById('organogramaSection'); if (!section || section.dataset.scopeClicksReady) return;
            section.dataset.scopeClicksReady = '1';
            section.addEventListener('click', event => { const node = event.target.closest('[data-org-scope]'); if (node) selectOrgDashboardScope(node); });
            section.addEventListener('keydown', event => { if (event.key !== 'Enter' && event.key !== ' ') return; const node = event.target.closest('[data-org-scope]'); if (node) { event.preventDefault(); selectOrgDashboardScope(node); } });
        }
        function setQuickRankingMode(mode) {
            quickRankingMode = mode === 'equipe' ? 'equipe' : 'corretor';
            saveLocalSetting(`${appId}-quick-ranking-mode`, quickRankingMode);
            drawQuickRankings();
        }
        function rankingTeamKey(team) { return stripDiacritics(String(team || '').trim()).replace(/^equipe\s+/i, '').replace(/\s+/g, ' ').toLocaleLowerCase(); }
        function getConfiguredRankingTeams() {
            const teams = new Map();
            organograma.filter(n => n.role === 'Gerente' && n.parentId === 'regional').forEach(manager => {
                const label = String(manager.equipe || manager.name || '').trim().replace(/^equipe\s+/i, '');
                const key = rankingTeamKey(label);
                if (key && !teams.has(key)) teams.set(key, label);
            });
            return [...teams.values()];
        }
        function canonicalRankingTeamName(team) {
            const label = String(team || '').trim();
            if (!label) return null;
            const key = rankingTeamKey(label);
            return getConfiguredRankingTeams().find(configured => rankingTeamKey(configured) === key) || null;
        }
        function getRankingTeamForBroker(name) {
            const managerNode = organograma.find(n => n.role === 'Gerente' && orgPersonKey(n.name) === orgPersonKey(name));
            if (managerNode) return canonicalRankingTeamName(managerNode.equipe || managerNode.name);
            const member = organograma.find(n => n.role === 'Corretor' && orgPersonKey(n.name) === orgPersonKey(name));
            const manager = member && organograma.find(n => n.id === member.parentId && n.role === 'Gerente');
            if (manager) return canonicalRankingTeamName(manager.equipe || manager.name);
            const teams = new Map();
            (dataset || []).forEach(row => {
                if (!row.Corretor || orgPersonKey(row.Corretor) !== orgPersonKey(name) || !row.Equipe) return;
                const team = String(row.Equipe).trim();
                teams.set(team, (teams.get(team) || 0) + 1);
            });
            const dataTeam = [...teams.entries()].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0],'pt-BR'))[0]?.[0];
            return dataTeam ? canonicalRankingTeamName(dataTeam) : null;
        }
        function drawQuickRankings() {
            if (activeView !== 'rankings') { quickRankingsPendente = true; return; }
            quickRankingsPendente = false;
            const grid = document.getElementById('quickRankingsGrid');
            if (!grid) return;
            const modeCorretorBtn = document.getElementById('quickRankModeCorretor');
            const modeEquipeBtn = document.getElementById('quickRankModeEquipe');
            const modeBase = 'px-2.5 py-1 rounded-md text-[10px] font-bold transition';
            if (modeCorretorBtn) modeCorretorBtn.className = modeBase + (quickRankingMode === 'corretor' ? ' bg-brand-600 text-white' : ' text-slate-400 hover:text-white');
            if (modeEquipeBtn) modeEquipeBtn.className = modeBase + (quickRankingMode === 'equipe' ? ' bg-brand-600 text-white' : ' text-slate-400 hover:text-white');
            const metasCorretorBtn = document.getElementById('btnMetasPorCorretor');
            if (metasCorretorBtn) { metasCorretorBtn.classList.remove('hidden'); metasCorretorBtn.innerHTML = `<i class=\"fa-solid fa-bullseye\"></i> Metas por ${quickRankingMode === 'equipe' ? 'Equipe' : 'Corretor'}`; }
            const hojeReal = isMockDataActive ? new Date(2026, 5, 9) : new Date(); // cards "Hoje" = sempre hoje
            const refSM = quickRef || hojeReal;                                    // "Semana" e "Mês" = referência escolhida
            // Sem referência manual: mês comercial corrente (último dos dados). Com referência: mês da data escolhida.
            const lc = (!quickRef && !isMockDataActive) ? (getMesComercialAtualPorData() || getLatestCommercialMonth()) : null;
            const mesAtual = lc ? lc.nome : getMesName(refSM.getMonth() + 1);
            const anoAtual = lc ? lc.ano : refSM.getFullYear();
            // Agendamentos/Compareceu seguem o MESMO mês comercial corrente da planilha principal
            // (o mesmo que o Ritmo do Mês usa) — antes a Agenda detectava seu próprio "mês atual"
            // a partir da Data mais recente lançada NELA, o que a fazia pular pro mês seguinte
            // (ex.: Agosto) antes da planilha principal (ainda em Julho) assim que alguém marcasse
            // uma visita futura — dessincronizando o card daqui do resto do painel. Corrigido a
            // pedido do usuário: usar sempre a mesma referência de mês em tudo.
            const mesAtualAgenda = mesAtual;
            const anoAtualAgenda = anoAtual;
            // Prospecção segue o mesmo mês do resto (12/10/2026) — ver applyFilters.
            const mesAtualProspeccao = mesAtual;
            const anoAtualProspeccao = anoAtual;

            const selCorr = document.getElementById('filterCorretor').value;
            const selEq = document.getElementById('filterEquipe').value;
            const selCons = document.getElementById('filterConstrutora').value;
            const selEmp = document.getElementById('filterEmpreendimento').value;
            // DESATIVAR ≠ EXCLUIR: não filtra as linhas por corretor ativo. O que o corretor já
            // produziu é histórico e continua contando em qualquer período onde ele produziu. Quem
            // está desativado some dos rankings NOVOS naturalmente, porque não gera lançamento novo
            // (e só os ATIVOS são pré-populados com zero mais abaixo) — sem apagar nada do passado.
            const base = dataset.filter(row => {
                if (selCorr && row.Corretor !== selCorr) return false;
                // O vínculo oficial de equipe vem do organograma. A coluna Equipe da planilha
                // pode estar desatualizada, então nunca deve trazer pessoas de outra equipe.
                if (selEq && rankingTeamKey(getRankingTeamForBroker(row.Corretor)) !== rankingTeamKey(selEq)) return false;
                if (selCons && row.Construtora !== selCons) return false;
                if (selEmp && row.Empreendimento !== selEmp) return false;
                if (!matchesOrgDashboardScope(row)) return false;
                return true;
            });

            // cacheKey/row (opcionais) guardam a linha em quickRankingRowsCache pra abrir o
            // detalhamento de clientes ao clicar no número "Feito" de cada card — sem isso, o
            // card só sabia contar, não sabia QUAIS linhas formavam a contagem.
            quickRankingRowsCache = {};
            function addTo(map, nome, vgv, cacheKey, row) {
                if (!nome) return;
                if (!map[nome]) map[nome] = { count: 0, vgv: 0 };
                map[nome].count++;
                map[nome].vgv += (vgv || 0);
                if (cacheKey && row) {
                    if (!quickRankingRowsCache[cacheKey]) quickRankingRowsCache[cacheKey] = {};
                    if (!quickRankingRowsCache[cacheKey][nome]) quickRankingRowsCache[cacheKey][nome] = [];
                    quickRankingRowsCache[cacheKey][nome].push(row);
                }
            }

            // Pré-popula TODOS os corretores ativos com 0 (aparecem mesmo sem registro).
            let ativos = getActiveCorretores();
            if (orgDashboardScope) ativos = ativos.filter(personMatchesOrgDashboardScope);
            if (selCorr) ativos = ativos.filter(n => n === selCorr);
            if (selEq) ativos = ativos.filter(n => rankingTeamKey(getRankingTeamForBroker(n)) === rankingTeamKey(selEq));
            const novoMapa = () => { const m = {}; ativos.forEach(n => { m[n] = { count: 0, vgv: 0 }; }); return m; };
            const prHoje = novoMapa(), prSem = novoMapa(), prMes = novoMapa();
            const agHoje = novoMapa(), agSem = novoMapa(), agMes = novoMapa(), coHoje = novoMapa(), coSem = novoMapa(), coMes = novoMapa();
            const anHoje = novoMapa(), anSem = novoMapa(), anMes = novoMapa(), apHoje = novoMapa(), apSem = novoMapa(), apMes = novoMapa(), vdSem = novoMapa(), vdMes = novoMapa();
            const ehMesCadastro = (row) => {
                const anoC = getMesAno(row['Mês Cadastro']);
                return normalizeMes(row['Mês Cadastro']) === mesAtual && (anoC === null || anoC === anoAtual);
            };
            const ehMesAprovacao = (row) => {
                const mesRef = mesAprovacaoEfetivo(row);
                const anoA = getMesAno(mesRef);
                return normalizeMes(mesRef) === mesAtual && (anoA === null || anoA === anoAtual);
            };
            base.forEach(row => {
                const c = row.Corretor;
                if (checkPeriodMatch(row['Data Cadastro'], 'hoje', hojeReal)) addTo(anHoje, c, 0, 'anHoje', row);
                if (checkPeriodMatch(row['Data Cadastro'], 'semana', refSM)) addTo(anSem, c, 0, 'anSem', row);
                if (ehMesCadastro(row)) addTo(anMes, c, 0, 'anMes', row);
                const aprovado = isAprovado(row['Situação - Analise']);
                if (aprovado && checkPeriodMatch(dataAprovacaoEfetiva(row), 'hoje', hojeReal)) addTo(apHoje, c, 0, 'apHoje', row);
                if (aprovado && checkPeriodMatch(dataAprovacaoEfetiva(row), 'semana', refSM)) addTo(apSem, c, 0, 'apSem', row);
                if (aprovado && ehMesAprovacao(row)) addTo(apMes, c, 0, 'apMes', row);
                if (isVendaModo(row)) {
                    const vgv = getVGV(row);
                    if (checkPeriodMatch(row['Data Ganho'], 'semana', refSM)) addTo(vdSem, c, vgv, 'vdSem', row);
                    const anoG = getMesAno(row['Mês Ganho']);
                    if (normalizeMes(row['Mês Ganho']) === mesAtual && (anoG === null || anoG === anoAtual)) addTo(vdMes, c, vgv, 'vdMes', row);
                }
            });

            // Agenda de Visitas (2ª planilha) — só tem Corretor e Empreendimento em comum com os
            // filtros estruturais daqui em cima; Equipe/Construtora não se aplicam a ela.
            const baseAgenda = agendaDataset.filter(row => {
                if (selCorr && row.Corretor !== selCorr) return false;
                if (selEq && rankingTeamKey(getRankingTeamForBroker(row.Corretor)) !== rankingTeamKey(selEq)) return false;
                if (!matchesOrgDashboardScope(row)) return false;
                if (!agendaMatchesEmpreendimento(row, selEmp)) return false;
                return true; // histórico de corretor desativado continua contando (ver comentário acima)
            });
            // Usa a JANELA REAL do mês comercial (mesma resolução do Funil/Ritmo do Mês), não o
            // mês do calendário inteiro — senão o card "· Mês" contaria linhas fora do período
            // configurado em "Meses Comerciais".
            const janelaAgendamentoMes = resolveJanelaAgendaMes(mesAtualAgenda, anoAtualAgenda, 'agendamentos');
            const janelaVisitaMes = resolveJanelaAgendaMes(mesAtualAgenda, anoAtualAgenda, 'compareceu');
            const ehMesAgenda = (row, metric) => {
                const d = parseDate(agendaDateForMetric(row, metric));
                const janela = metric === 'compareceu' ? janelaVisitaMes : janelaAgendamentoMes;
                return d && d >= janela.inicioReal && d <= janela.fimEstimado;
            };
            baseAgenda.forEach(row => {
                const c = row.Corretor;
                const dataAgendamento = agendaDateForMetric(row, 'agendamentos');
                const dataVisita = agendaDateForMetric(row, 'compareceu');
                if (checkPeriodMatch(dataAgendamento, 'hoje', hojeReal)) addTo(agHoje, c, 0, 'agHoje', row);
                if (checkPeriodMatch(dataAgendamento, 'semana', refSM)) addTo(agSem, c, 0, 'agSem', row);
                if (ehMesAgenda(row, 'agendamentos')) addTo(agMes, c, 0, 'agMes', row);
                if (isCompareceu(row)) {
                    if (checkPeriodMatch(dataVisita, 'hoje', hojeReal)) addTo(coHoje, c, 0, 'coHoje', row);
                    if (checkPeriodMatch(dataVisita, 'semana', refSM)) addTo(coSem, c, 0, 'coSem', row);
                    if (ehMesAgenda(row, 'compareceu')) addTo(coMes, c, 0, 'coMes', row);
                }
            });

            // Prospecção (3ª planilha) — tem coluna própria de Mês Comercial (texto), então o
            // "· Mês" compara direto contra ela (mesmo padrão do "Mês Cadastro" da principal),
            // sem precisar de janela por data como a Agenda precisa.
            const baseProspeccao = prospeccaoDataset.filter(row => {
                if (selCorr && row.Corretor !== selCorr) return false;
                if (selEq && rankingTeamKey(getRankingTeamForBroker(row.Corretor)) !== rankingTeamKey(selEq)) return false;
                if (!matchesOrgDashboardScope(row)) return false;
                return true; // histórico de corretor desativado continua contando (ver comentário acima)
            });
            const ehMesProspeccao = (row) => {
                const ms = row['_MesComercialNorm'];
                const anoP = getMesAno(ms);
                return normalizeMes(ms) === mesAtualProspeccao && (anoP === null || anoP === anoAtualProspeccao);
            };
            baseProspeccao.forEach(row => {
                const c = row.Corretor;
                if (checkPeriodMatch(row['Cadastro'], 'hoje', hojeReal)) addTo(prHoje, c, 0, 'prHoje', row);
                if (checkPeriodMatch(row['Cadastro'], 'semana', refSM)) addTo(prSem, c, 0, 'prSem', row);
                if (ehMesProspeccao(row)) addTo(prMes, c, 0, 'prMes', row);
            });

            // Sincroniza os controles de referência (Semana/Mês) e o texto de contexto.
            const segAtual = new Date(refSM.getFullYear(), refSM.getMonth(), refSM.getDate());
            const dowAtual = (segAtual.getDay() === 0) ? 6 : (segAtual.getDay() - 1);
            segAtual.setDate(segAtual.getDate() - dowAtual);
            const domAtual = new Date(segAtual); domAtual.setDate(segAtual.getDate() + 6);
            const fmtDDMM = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

            const refInput = document.getElementById('quickRefDate');
            if (refInput) refInput.value = quickRef ? `${refSM.getFullYear()}-${String(refSM.getMonth() + 1).padStart(2, '0')}-${String(refSM.getDate()).padStart(2, '0')}` : '';
            const refHintEl = document.getElementById('quickRefHint');
            if (refHintEl) {
                refHintEl.textContent = quickRef
                    ? `Referência manual — Semana ${fmtDDMM(segAtual)} a ${fmtDDMM(domAtual)} · Mês ${mesAtual}/${anoAtual}. (Os cards "Hoje" continuam em hoje.)`
                    : `Semana atual e mês comercial corrente. Use a data ao lado para ver outra semana/mês.`;
            }
            const btnAtual = document.getElementById('btnQuickRefHoje');
            if (btnAtual) {
                const baseB = "text-[11px] font-bold rounded-lg px-2.5 py-1.5 border transition";
                btnAtual.className = baseB + (quickRef ? ' bg-brand-500 text-white border-brand-500' : ' text-slate-500 border-slate-800');
            }

            // Rótulo do período (data/intervalo) mostrado no cabeçalho de cada card, conforme a
            // cadência. Pra "Mês", usa a mesma janela REAL do mês comercial (registrada em "Meses
            // Comerciais", a mesma que o Ritmo do Mês/Funil usam) em vez do dia 1 ao último dia do
            // calendário — sem isso, o card mostrava "01/07 a 31/07" mesmo quando o mês comercial
            // registrado vai de 06/07 a 07/08, incompatível com o resto do painel.
            const mesIdxAtual = MESES_IDX[mesAtual];
            const configMesAtual = (mesIdxAtual !== undefined) ? getMesComercialConfig(mesAtual, anoAtual) : null;
            const primeiroDiaMes = configMesAtual ? new Date(configMesAtual.inicio + 'T00:00:00')
                : (mesIdxAtual !== undefined) ? new Date(anoAtual, mesIdxAtual, 1) : null;
            const ultimoDiaMes = configMesAtual ? new Date(configMesAtual.fim + 'T00:00:00')
                : (mesIdxAtual !== undefined) ? new Date(anoAtual, mesIdxAtual + 1, 0) : null;
            const periodoPorCadencia = {
                'Hoje':   fmtDDMM(hojeReal),
                'Semana': `${fmtDDMM(segAtual)} a ${fmtDDMM(domAtual)}`,
                'Mês':    primeiroDiaMes ? `${fmtDDMM(primeiroDiaMes)} a ${fmtDDMM(ultimoDiaMes)}` : `${mesAtual}/${anoAtual}`
            };
            const unidadePorCol = { PR: 'prospecções', AG: 'agendamentos', CP: 'comparecimentos', AN: 'análises', AP: 'aprovações', VD: 'vendas' };

            const fmtInt = n => Math.round(n).toLocaleString('pt-BR');
            const initials = nome => nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
            const cards = [
                { title: 'Prospecção · Hoje',     icon: 'fa-bullhorn',      col: 'PR', map: prHoje, vgv: false, key: 'prHoje', cadence: 'Hoje' },
                { title: 'Prospecção · Semana',   icon: 'fa-bullhorn',      col: 'PR', map: prSem,  vgv: false, key: 'prSem',  cadence: 'Semana' },
                { title: 'Prospecção · Mês',      icon: 'fa-bullhorn',      col: 'PR', map: prMes,  vgv: false, key: 'prMes',  cadence: 'Mês' },
                { title: 'Agendamentos · Hoje',   icon: 'fa-calendar-check', col: 'AG', map: agHoje, vgv: false, key: 'agHoje', cadence: 'Hoje' },
                { title: 'Agendamentos · Semana', icon: 'fa-calendar-check', col: 'AG', map: agSem,  vgv: false, key: 'agSem',  cadence: 'Semana' },
                { title: 'Agendamentos · Mês',    icon: 'fa-calendar-check', col: 'AG', map: agMes,  vgv: false, key: 'agMes',  cadence: 'Mês' },
                { title: 'Compareceu · Hoje',     icon: 'fa-door-open',      col: 'CP', map: coHoje, vgv: false, key: 'coHoje', cadence: 'Hoje' },
                { title: 'Compareceu · Semana',   icon: 'fa-door-open',      col: 'CP', map: coSem,  vgv: false, key: 'coSem',  cadence: 'Semana' },
                { title: 'Compareceu · Mês',      icon: 'fa-door-open',      col: 'CP', map: coMes,  vgv: false, key: 'coMes',  cadence: 'Mês' },
                { title: 'Análises · Hoje',     icon: 'fa-file-lines',   col: 'AN', map: anHoje, vgv: false, key: 'anHoje', cadence: 'Hoje' },
                { title: 'Análises · Semana',   icon: 'fa-file-lines',   col: 'AN', map: anSem,  vgv: false, key: 'anSem',  cadence: 'Semana' },
                { title: 'Análises · Mês',      icon: 'fa-file-lines',   col: 'AN', map: anMes,  vgv: false, key: 'anMes',  cadence: 'Mês' },
                { title: 'Aprovações · Hoje',   icon: 'fa-circle-check', col: 'AP', map: apHoje, vgv: false, key: 'apHoje', cadence: 'Hoje' },
                { title: 'Aprovações · Semana', icon: 'fa-circle-check', col: 'AP', map: apSem,  vgv: false, key: 'apSem',  cadence: 'Semana' },
                { title: 'Aprovações · Mês',    icon: 'fa-circle-check', col: 'AP', map: apMes,  vgv: false, key: 'apMes',  cadence: 'Mês' },
                { title: 'Vendas · Semana',     icon: 'fa-trophy',       col: 'VD', map: vdSem,  vgv: true,  key: 'vdSem',  cadence: 'Semana' },
                { title: 'Vendas · Mês',        icon: 'fa-trophy',       col: 'VD', map: vdMes,  vgv: true,  key: 'vdMes',  cadence: 'Mês' }
            ];

            if (quickRankingMode === 'equipe') {
                const configuredTeams = getConfiguredRankingTeams();
                const selectedTeam = selEq ? configuredTeams.find(team => rankingTeamKey(team) === rankingTeamKey(selEq)) : null;
                const teamNames = new Set(selectedTeam ? [selectedTeam] : configuredTeams);
                cards.forEach(card => {
                    const grouped = Object.fromEntries([...teamNames].map(team => [team, {count:0, vgv:0}]));
                    Object.entries(card.map).forEach(([broker, value]) => {
                        const team = getRankingTeamForBroker(broker);
                        if (!team || !grouped[team]) return;
                        if (selectedTeam && rankingTeamKey(team) !== rankingTeamKey(selectedTeam)) return;
                        grouped[team].count += value.count;
                        grouped[team].vgv += value.vgv;
                    });
                    card.map = grouped;
                });
            }

            rankingCardsSnapshot = [];
            const stageKeyByCol = { PR: 'prospeccao', AG: 'agendamentos', CP: 'compareceu', AN: 'analises', AP: 'aprovacoes', VD: 'vendas' };
            grid.innerHTML = cards.map((card, cardIdx) => {
                const stage = FUNIL_ETAPAS.find(e => e.key === stageKeyByCol[card.col]);
                const stageColor = FUNIL_CORES[stage?.color] || FUNIL_CORES.sky;
                const list = Object.entries(card.map)
                    .map(([nome, v]) => ({ nome, count: v.count, vgv: v.vgv }))
                    .sort((a, b) => {
                        const d = card.vgv ? (b.vgv - a.vgv) : (b.count - a.count);
                        return d !== 0 ? d : a.nome.localeCompare(b.nome);
                    });
                const totalCount = Object.values(card.map).reduce((s, v) => s + v.count, 0);
                const totalVgv = Object.values(card.map).reduce((s, v) => s + v.vgv, 0);

                const equipesComMeta = getConfiguredRankingTeams().filter(team => !selEq || rankingTeamKey(team) === rankingTeamKey(selEq));
                const metasEquipesCard = equipesComMeta.map(team => getMetaEquipe(team, card.key));
                const temMetaEquipe = metasEquipesCard.some(v => v > 0);
                const meta = quickRankingMode === 'equipe' && temMetaEquipe
                    ? metasEquipesCard.reduce((sum, v) => sum + v, 0)
                    : getRankingMeta(card.key);
                const pct = meta > 0 ? Math.min(100, Math.round((totalCount / meta) * 100)) : 0;
                const falta = Math.max(0, meta - totalCount);
                const batida = meta > 0 && totalCount >= meta;

                // Meta individual por corretor (para as colunas Falta/Progresso da tabela e o rodapé de destaques)
                const comMetaIndiv = list.map(r => {
                    const m = quickRankingMode === 'equipe' ? getMetaEquipe(r.nome, card.key) : ((metasPorCorretor[r.nome] && metasPorCorretor[r.nome][card.key]) || 0);
                    return m > 0 ? { nome: r.nome, count: r.count, metaC: m, pctC: Math.min(100, Math.round((r.count / m) * 100)), faltaC: Math.max(0, m - r.count) } : null;
                }).filter(Boolean);

                let melhorNome = quickRankingMode === 'equipe' && list.length && (card.vgv ? list[0].vgv : list[0].count) > 0 ? list[0].nome : '—', melhorPct = null;
                if (comMetaIndiv.length) {
                    const best = comMetaIndiv.reduce((a, b) => (b.pctC > a.pctC ? b : a));
                    melhorNome = parseNomeCargo(best.nome).nome;
                    melhorPct = best.pctC;
                }
                let pendenciaLine1 = 'Sem metas', pendenciaLine2 = 'individuais';
                if (comMetaIndiv.length) {
                    const maxFalta = Math.max(...comMetaIndiv.map(r => r.faltaC));
                    if (maxFalta === 0) {
                        pendenciaLine1 = 'Ninguém'; pendenciaLine2 = 'todos em dia';
                    } else {
                        const piores = comMetaIndiv.filter(r => r.faltaC === maxFalta);
                        if (piores.length === 1) {
                            pendenciaLine1 = parseNomeCargo(piores[0].nome).nome;
                            pendenciaLine2 = `${maxFalta} faltando`;
                        } else {
                            pendenciaLine1 = `${piores.length} ${quickRankingMode === 'equipe' ? 'equipes' : 'corretores'}`;
                            pendenciaLine2 = `com ${maxFalta} faltando`;
                        }
                    }
                }

                const CADENCIA_ADJ = { 'Hoje': 'diárias', 'Semana': 'semanais', 'Mês': 'mensais' };
                const unidadeCap = unidadePorCol[card.col].charAt(0).toUpperCase() + unidadePorCol[card.col].slice(1);
                const metaSubtext = `${unidadeCap} ${CADENCIA_ADJ[card.cadence]}`;

                const agora = new Date();
                const pad2 = n => String(n).padStart(2, '0');
                const updatedLabel = `Atualizado em ${pad2(agora.getDate())}/${pad2(agora.getMonth() + 1)} às ${pad2(agora.getHours())}:${pad2(agora.getMinutes())}`;

                rankingCardsSnapshot[cardIdx] = {
                    title: quickRankingMode === 'equipe' ? `Equipes · ${card.title}` : card.title,
                    dimension: quickRankingMode,
                    period: periodoPorCadencia[card.cadence],
                    cadence: card.cadence,
                    unidade: unidadePorCol[card.col],
                    metaSubtext, updatedLabel,
                    showVgv: card.vgv,
                    totalCount, totalVgv, meta, pct, falta, batida,
                    melhorNome, melhorPct, pendenciaLine1, pendenciaLine2,
                    rows: list.map((r, i) => {
                        const m = quickRankingMode === 'equipe' ? getMetaEquipe(r.nome, card.key) : ((metasPorCorretor[r.nome] && metasPorCorretor[r.nome][card.key]) || 0);
                        const { nome, cargo } = parseNomeCargo(r.nome);
                        return {
                            pos: i + 1,
                            nome, cargo,
                            count: r.count,
                            vgv: r.vgv,
                            faltaC: m > 0 ? Math.max(0, m - r.count) : null,
                            pctC: m > 0 ? Math.min(100, Math.round((r.count / m) * 100)) : null,
                            iniciais: initials(r.nome),
                            foto: (corretorFotoImages[r.nome] && corretorFotoImages[r.nome].complete) ? corretorFotoImages[r.nome] : null
                        };
                    })
                };

                const metaStat = rankingsEditMode
                    ? `<input type="number" min="0" value="${meta || ''}" placeholder="meta" onchange="setRankingMeta('${card.key}', this.value)" class="w-14 bg-slate-950 border border-slate-700 text-sm rounded px-1 py-0.5 text-slate-100 text-center font-extrabold focus:border-brand-500 outline-none">`
                    : `<div class="text-base font-extrabold text-white leading-none">${meta || '–'}</div>`;

                let bodyRows;
                if (list.length === 0) {
                    bodyRows = `<tr><td colspan="${card.vgv ? 7 : 6}" class="text-center text-xs text-slate-500 py-6">Sem registros</td></tr>`;
                } else if (quickRankingMode === 'equipe') {
                    bodyRows = list.map((r,i) => {
                        const metaEquipe = getMetaEquipe(r.nome, card.key);
                        const faltaEquipe = metaEquipe > 0 ? Math.max(0, metaEquipe - r.count) : null;
                        const pctEquipe = metaEquipe > 0 ? Math.min(100, Math.round((r.count / metaEquipe) * 100)) : null;
                        const progressoEquipe = pctEquipe === null ? '<span class="text-[10px] text-slate-600">sem meta</span>' : `<div class="flex items-center gap-1"><div class="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden min-w-[20px]"><div class="h-full bg-gradient-to-r ${stageColor.progress}" style="width:${pctEquipe}%"></div></div><span class="text-[10px] font-bold ${stageColor.text} w-8 text-right">${pctEquipe}%</span></div>`;
                        return `<tr class="border-b border-slate-800/60 hover:bg-slate-800/30 transition ${r.count === 0 ? 'opacity-60' : ''}"><td class="py-1.5 pl-2 font-extrabold ${r.count > 0 && i === 0 ? 'text-amber-400' : 'text-slate-500'} text-[11px] align-middle">${i+1}º</td><td class="py-1.5 pr-2"><div class="flex items-center gap-2 min-w-0"><span class="h-6 w-6 shrink-0 rounded-full bg-indigo-500/15 text-indigo-300 flex items-center justify-center"><i class="fa-solid fa-people-group text-[10px]"></i></span><span class="text-xs font-semibold ${r.count ? 'text-slate-100' : 'text-slate-400'} truncate">${orgEsc(r.nome)}</span></div></td><td class="py-1.5 text-center text-xs font-extrabold ${stageColor.text} align-middle">${r.count}</td><td class="py-1.5 text-center text-xs text-slate-300">${metaEquipe || '–'}</td><td class="py-1.5 text-center text-xs font-semibold text-amber-400">${faltaEquipe === null ? '–' : faltaEquipe}</td><td class="py-1.5 pr-3 min-w-[90px]">${progressoEquipe}</td>${card.vgv ? `<td class="py-1.5 pr-2 text-right text-[10px] font-semibold text-indigo-300 whitespace-nowrap align-middle">${fmtInt(r.vgv)}</td>` : ''}</tr>`;
                    }).join('');
                } else {
                    bodyRows = list.map((r, i) => {
                        const zero = r.count === 0;
                        let pos = 'text-slate-500';
                        if (!zero && i === 0) pos = 'text-amber-400'; else if (!zero && i === 1) pos = 'text-slate-300'; else if (!zero && i === 2) pos = 'text-amber-600';

                        const { nome, cargo } = parseNomeCargo(r.nome);
                        const metaC = (metasPorCorretor[r.nome] && metasPorCorretor[r.nome][card.key]) || 0;
                        const faltaC = metaC > 0 ? Math.max(0, metaC - r.count) : null;
                        const pctC = metaC > 0 ? Math.min(100, Math.round((r.count / metaC) * 100)) : null;
                        const pctColor = pctC === null ? 'text-slate-600' : stageColor.text;
                        const progBarMax = card.vgv ? 28 : 70;
                        const progPctCls = card.vgv ? 'text-[10px] w-7' : 'text-[11px] w-8';
                        const progressoCell = pctC === null
                            ? `<span class="text-[10px] text-slate-600">sem meta</span>`
                            : `<div class="flex items-center gap-1"><div class="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden min-w-[20px] max-w-[${progBarMax}px]"><div class="h-full bg-gradient-to-r ${stageColor.progress}" style="width:${pctC}%"></div></div><span class="font-bold ${pctColor} ${progPctCls} text-right">${pctC}%</span></div>`;

                        return `<tr class="border-b border-slate-800/60 hover:bg-slate-800/30 transition ${zero && metaC === 0 ? 'opacity-70' : ''}">
                            <td class="py-1.5 pl-2 font-extrabold ${pos} text-[11px] align-middle">${i + 1}º</td>
                            <td class="py-1.5 pr-2">
                                <div class="flex items-center gap-2 min-w-0">
                                    <div class="relative h-6 w-6 shrink-0" title="${zero ? 'Ainda não enviou documentação neste período' : 'Já enviou documentação neste período'}">
                                        ${corretorAvatarInner(r.nome, 'h-6 w-6', 'text-[8px]', zero ? 'opacity-50' : '')}
                                        ${zero
                                            ? `<span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-slate-600 border-2 border-slate-900 flex items-center justify-center"><i class="fa-solid fa-minus text-slate-300" style="font-size:5px"></i></span>`
                                            : `<span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${stageColor.solid} border-2 border-slate-900 flex items-center justify-center"><i class="fa-solid fa-check text-white" style="font-size:5px"></i></span>`}
                                    </div>
                                    <div class="min-w-0 flex items-center gap-1.5">
                                        <span class="text-xs font-semibold ${zero ? 'text-slate-400' : 'text-slate-100'} truncate">${nome}</span>
                                        ${cargo ? `<span class="shrink-0 text-[9px] font-bold text-slate-300 bg-slate-700/60 rounded px-1 py-0.5">${cargo}</span>` : ''}
                                    </div>
                                </div>
                            </td>
                            <td onclick="openQuickRankingDetail('${card.key}', '${r.nome.replace(/'/g, "\\'")}', '${card.title.replace(/'/g, "\\'")}')" class="py-1.5 text-center text-xs font-extrabold ${stageColor.text} align-middle cursor-pointer hover:underline transition" title="Ver clientes">${r.count}</td>
                            <td class="py-1.5 text-center text-xs font-extrabold text-amber-400 align-middle">${faltaC === null ? '–' : faltaC}</td>
                            <td class="py-1.5 ${card.vgv ? 'pr-1.5' : 'pr-3'} align-middle">${progressoCell}</td>
                            ${card.vgv ? `<td class="py-1.5 pr-2 text-right text-[10px] font-semibold text-indigo-300 whitespace-nowrap align-middle">${fmtInt(r.vgv)}</td>` : ''}
                        </tr>`;
                    }).join('');
                }

                return `<div class="rk-card bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden flex flex-col" data-rk-title="${card.title}" data-rk-index="${cardIdx}">
                    <div class="bg-gradient-to-r ${stageColor.gradient} px-2.5 py-2 flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2 min-w-0">
                            <div class="h-7 w-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0"><i class="fa-solid ${card.icon} text-white text-xs"></i></div>
                            <h4 class="text-sm font-extrabold text-white uppercase truncate">${quickRankingMode === 'equipe' ? 'Equipes · ' : ''}${card.title}</h4>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <div class="bg-white/15 rounded-lg px-2 py-1 text-[10px] font-bold text-white flex items-center gap-1 whitespace-nowrap">
                                <i class="fa-solid fa-calendar-days"></i> ${periodoPorCadencia[card.cadence]}
                            </div>
                            <button onclick="exportRankingCardImage(this)" title="Copiar este ranking como imagem" class="rk-no-export h-7 w-7 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-white text-xs transition">
                                <i class="fa-solid fa-camera"></i>
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-4 gap-2 p-2.5">
                        <div class="${stageColor.tint} border ${stageColor.border} rounded-lg p-2 flex items-center gap-2">
                            <div class="h-7 w-7 rounded-full ${stageColor.solid} flex items-center justify-center shrink-0"><i class="fa-solid fa-check text-white text-[10px]"></i></div>
                            <div class="min-w-0">
                                <div class="text-base font-extrabold text-white leading-none">${totalCount}</div>
                                <div class="text-[9px] ${stageColor.text} font-bold uppercase">Feitas</div>
                            </div>
                        </div>
                        <div class="bg-slate-800/40 border border-slate-700 rounded-lg p-2 flex items-center justify-center">
                            <div class="relative h-8 w-8 shrink-0" style="background:conic-gradient(${stageColor.hex} ${pct}%, #1e293b ${pct}% 100%); border-radius:9999px;">
                                <div class="absolute inset-1 bg-slate-900 rounded-full flex items-center justify-center text-[9px] font-extrabold text-white">${pct}%</div>
                            </div>
                        </div>
                        <div class="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 flex items-center gap-2">
                            <div class="h-7 w-7 rounded-full bg-amber-500 flex items-center justify-center shrink-0"><i class="fa-solid fa-hourglass-half text-white text-[10px]"></i></div>
                            <div class="min-w-0">
                                <div class="text-base font-extrabold text-white leading-none">${falta}</div>
                                <div class="text-[9px] text-amber-400 font-bold uppercase">Faltam</div>
                            </div>
                        </div>
                        <div class="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-2 flex items-center gap-2">
                            <div class="h-7 w-7 rounded-full bg-indigo-500 flex items-center justify-center shrink-0"><i class="fa-solid fa-bullseye text-white text-[10px]"></i></div>
                            <div class="min-w-0">
                                ${metaStat}
                                <div class="text-[9px] text-indigo-400 font-bold uppercase">Meta</div>
                            </div>
                        </div>
                    </div>

                    <div class="px-2.5 pb-2">
                        <div class="relative h-2 rounded-full bg-slate-800 overflow-visible">
                            <div class="h-full rounded-full bg-gradient-to-r ${stageColor.progress}" style="width:${pct}%"></div>
                        </div>
                        <p class="text-center text-[10px] text-slate-500 mt-1">${totalCount} de ${meta || '–'} ${unidadePorCol[card.col]}</p>
                    </div>

                    <div class="px-1.5 overflow-x-auto flex-1">
                        <table class="w-full border-collapse">
                            <thead class="sticky top-0 bg-slate-900/95">
                                <tr class="text-[10px] text-slate-500 uppercase font-bold border-b border-slate-800">
                                    <th class="py-1.5 pl-2 text-left">#</th>
                                    <th class="py-1.5 text-left">${quickRankingMode === 'equipe' ? 'Equipe' : 'Corretor'}</th>
                                    <th class="py-1.5 text-center">Feito</th>
                                    ${quickRankingMode === 'equipe' ? '<th class="py-1.5 text-center">Meta</th><th class="py-1.5 text-center">Falta</th><th class="py-1.5 pr-3 text-left">Progresso</th>' : '<th class="py-1.5 text-center">Falta</th><th class="py-1.5 pr-3 text-left">Progresso</th>'}
                                    ${card.vgv ? `<th class="py-1.5 pr-2 text-right">VGV</th>` : ''}
                                </tr>
                            </thead>
                            <tbody>${bodyRows}</tbody>
                        </table>
                    </div>

                    <div class="grid grid-cols-3 gap-2 px-2.5 pb-2 pt-1.5 mt-auto text-[10px]">
                        <div class="min-w-0">
                            <p class="${stageColor.text} font-bold flex items-center gap-1 uppercase truncate"><i class="fa-solid fa-trophy"></i> Melhor</p>
                            <p class="text-slate-300 truncate">${melhorNome}${melhorPct !== null ? ` (${melhorPct}%)` : ''}</p>
                        </div>
                        <div class="min-w-0">
                            <p class="text-amber-400 font-bold flex items-center gap-1 uppercase truncate"><i class="fa-solid fa-triangle-exclamation"></i> Pendência</p>
                            <p class="text-slate-300 truncate">${pendenciaLine1} ${pendenciaLine2}</p>
                        </div>
                        <div class="min-w-0">
                            <p class="text-indigo-400 font-bold flex items-center gap-1 uppercase truncate"><i class="fa-solid fa-users"></i> Meta</p>
                            <p class="text-slate-300 truncate">${meta || '–'} ${unidadePorCol[card.col]}</p>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }

        // Exporta um card de Ranking Rápido (o elemento .rk-card mais próximo do botão) como imagem PNG.
        // Tenta copiar direto pra área de transferência; se o navegador não suportar, baixa o arquivo.
        // ===== Exportação do ranking como imagem: desenhada manualmente via Canvas 2D =====
        // Não usa mais html2canvas (tirava "print" do DOM e dava texto fantasma/duplicado em algumas
        // máquinas, de forma consistente e não reproduzível nos nossos testes). Desenhando direto com
        // os dados (rankingCardsSnapshot) o resultado é determinístico e idêntico em qualquer navegador.
        function rrPath(ctx, x, y, w, h, r) {
            const rad = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + rad, y);
            ctx.arcTo(x + w, y, x + w, y + h, rad);
            ctx.arcTo(x + w, y + h, x, y + h, rad);
            ctx.arcTo(x, y + h, x, y, rad);
            ctx.arcTo(x, y, x + w, y, rad);
            ctx.closePath();
        }
        function rrFill(ctx, x, y, w, h, r, style) {
            rrPath(ctx, x, y, w, h, r);
            ctx.fillStyle = style;
            ctx.fill();
        }
        function rrStroke(ctx, x, y, w, h, r, style, lw) {
            rrPath(ctx, x, y, w, h, r);
            ctx.strokeStyle = style;
            ctx.lineWidth = lw;
            ctx.stroke();
        }
        function truncateToWidth(ctx, text, maxWidth) {
            if (ctx.measureText(text).width <= maxWidth) return text;
            let t = text;
            while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
            return t + '…';
        }

        function wrapLines(ctx, text, maxWidth, maxLines) {
            const words = String(text).split(' ');
            const lines = [];
            let line = '';
            for (const w of words) {
                const test = line ? `${line} ${w}` : w;
                if (ctx.measureText(test).width > maxWidth && line) {
                    lines.push(line);
                    line = w;
                    if (lines.length === maxLines) break;
                } else {
                    line = test;
                }
            }
            if (line && lines.length < maxLines) lines.push(line);
            return lines;
        }

        function drawRankingCardCanvas(data) {
            const FONT = 'Plus Jakarta Sans, Arial, sans-serif';
            const scale = 2;
            const W = 680, pad = 16, gap = 10;
            const headerH = 64, statsH = 108, progressH = 56, tableHeadH = 28, footerH = 100;
            const rows = data.rows.length ? data.rows : [];
            const rowHeights = rows.length ? rows.map(r => 44 + (r.cargo ? 16 : 0)) : [40];
            const tableRowsH = rowHeights.reduce((s, h) => s + h, 0);
            const tableH = tableHeadH + tableRowsH + 8;
            const H = headerH + statsH + progressH + tableH + footerH;

            const canvas = document.createElement('canvas');
            canvas.width = Math.round(W * scale);
            canvas.height = Math.round(H * scale);
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            ctx.textBaseline = 'middle';

            rrFill(ctx, 0, 0, W, H, 16, '#0f172a');
            ctx.save();
            rrPath(ctx, 0, 0, W, H, 16);
            ctx.clip();

            // ---- header ----
            const grad = ctx.createLinearGradient(0, 0, W, 0);
            grad.addColorStop(0, '#1e40af');
            grad.addColorStop(1, '#2563eb');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, headerH);

            rrFill(ctx, pad, headerH / 2 - 18, 36, 36, 10, 'rgba(255,255,255,0.18)');
            ctx.fillStyle = '#ffffff';
            ctx.font = `800 17px ${FONT}`;
            ctx.textAlign = 'left';
            ctx.fillText(data.title.toUpperCase(), pad + 48, headerH / 2 + 1);

            ctx.font = `700 12px ${FONT}`;
            const camW = 36;
            const camX = W - pad - camW;
            const badgeTextW = ctx.measureText(data.period).width;
            const badgeW = badgeTextW + 22;
            const badgeX = camX - 10 - badgeW;
            rrFill(ctx, badgeX, headerH / 2 - 15, badgeW, 30, 8, 'rgba(255,255,255,0.18)');
            ctx.fillStyle = '#ffffff';
            ctx.fillText(data.period, badgeX + 11, headerH / 2 + 1);
            rrFill(ctx, camX, headerH / 2 - 15, camW, 30, 8, 'rgba(255,255,255,0.18)');

            // ---- stats (Feitas / Progresso / Faltam / Meta) ----
            const y0 = headerH + 12;
            const statW = (W - pad * 2 - gap * 3) / 4;
            const boxH = statsH - 16;

            const drawIconStatBox = (x, dotColor, value, label, labelColor, subLines) => {
                rrFill(ctx, x, y0, statW, boxH, 12, labelColor.boxBg);
                rrStroke(ctx, x, y0, statW, boxH, 12, labelColor.boxBorder, 1);
                const iconR = 17;
                const iconCx = x + 12 + iconR, iconCy = y0 + 30;
                ctx.beginPath(); ctx.arc(iconCx, iconCy, iconR, 0, Math.PI * 2);
                ctx.fillStyle = dotColor; ctx.fill();
                const textX = iconCx + iconR + 10;
                ctx.textAlign = 'left';
                ctx.fillStyle = '#ffffff';
                ctx.font = `800 20px ${FONT}`;
                ctx.fillText(value, textX, iconCy - 2);
                ctx.fillStyle = labelColor.text;
                ctx.font = `800 10px ${FONT}`;
                ctx.fillText(label, textX, iconCy + 15);
                ctx.fillStyle = '#64748b';
                ctx.font = `600 9px ${FONT}`;
                const subW = x + statW - textX - 8;
                wrapLines(ctx, subLines, subW, 2).forEach((ln, li) => {
                    ctx.fillText(ln, textX, iconCy + 30 + li * 12);
                });
            };

            const emerald = { boxBg: 'rgba(16,185,129,0.12)', boxBorder: 'rgba(16,185,129,0.3)', text: '#34d399' };
            const amber = { boxBg: 'rgba(245,158,11,0.12)', boxBorder: 'rgba(245,158,11,0.3)', text: '#fbbf24' };
            const indigo = { boxBg: 'rgba(99,102,241,0.12)', boxBorder: 'rgba(99,102,241,0.3)', text: '#a5b4fc' };
            const slateBox = { boxBg: 'rgba(30,41,59,0.5)', boxBorder: '#334155', text: '#ffffff' };

            drawIconStatBox(pad, '#10b981', String(data.totalCount), 'FEITAS', emerald, `${data.pct}% da meta`);

            // progresso (donut) — segunda caixa, layout vertical centralizado
            const progX = pad + statW + gap;
            rrFill(ctx, progX, y0, statW, boxH, 12, slateBox.boxBg);
            rrStroke(ctx, progX, y0, statW, boxH, 12, slateBox.boxBorder, 1);
            const donutCx = progX + statW / 2, donutCy = y0 + 30, donutR = 20;
            ctx.beginPath(); ctx.arc(donutCx, donutCy, donutR, 0, Math.PI * 2);
            ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 6; ctx.stroke();
            if (data.pct > 0) {
                ctx.beginPath();
                ctx.arc(donutCx, donutCy, donutR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, data.pct / 100));
                ctx.strokeStyle = '#10b981'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke(); ctx.lineCap = 'butt';
            }
            ctx.fillStyle = '#ffffff'; ctx.font = `800 12px ${FONT}`; ctx.textAlign = 'center';
            ctx.fillText(`${data.pct}%`, donutCx, donutCy + 1);
            ctx.fillStyle = '#ffffff'; ctx.font = `800 10px ${FONT}`;
            ctx.fillText('PROGRESSO', donutCx, y0 + 62);
            ctx.fillStyle = '#64748b'; ctx.font = `600 9px ${FONT}`;
            ctx.fillText(`${data.totalCount} de ${data.meta || '–'}`, donutCx, y0 + 76);
            ctx.textAlign = 'left';

            drawIconStatBox(pad + (statW + gap) * 2, '#f59e0b', String(data.falta), 'FALTAM', amber, 'Para a meta');
            drawIconStatBox(pad + (statW + gap) * 3, '#6366f1', data.meta ? String(data.meta) : '–', 'META', indigo, data.metaSubtext);

            // ---- progresso geral ----
            const yP = headerH + statsH + 10;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#cbd5e1';
            ctx.font = `800 12px ${FONT}`;
            ctx.fillText('PROGRESSO GERAL', pad, yP);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#64748b';
            ctx.font = `600 11px ${FONT}`;
            ctx.fillText(`${data.totalCount} de ${data.meta || '–'} ${data.unidade}`, W - pad, yP);

            const barY = yP + 14, barH = 12;
            rrFill(ctx, pad, barY, W - pad * 2, barH, 6, '#1e293b');
            const progW = (W - pad * 2) * Math.min(1, data.pct / 100);
            if (progW > 1) {
                const pg = ctx.createLinearGradient(pad, 0, pad + progW, 0);
                if (data.batida) { pg.addColorStop(0, '#059669'); pg.addColorStop(1, '#34d399'); }
                else { pg.addColorStop(0, '#10b981'); pg.addColorStop(1, '#f59e0b'); }
                rrFill(ctx, pad, barY, progW, barH, 6, pg);
            }
            // badge flutuante na ponta do preenchimento
            ctx.font = `800 11px ${FONT}`;
            const pctLbl = `${data.pct}%`;
            const pctLblW = ctx.measureText(pctLbl).width + 16;
            let badgeCx = pad + progW;
            badgeCx = Math.max(pad + pctLblW / 2, Math.min(W - pad - pctLblW / 2, badgeCx));
            rrFill(ctx, badgeCx - pctLblW / 2, barY + barH / 2 - 11, pctLblW, 22, 11, '#f59e0b');
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(pctLbl, badgeCx, barY + barH / 2 + 1);

            // ---- tabela ----
            const yT = headerH + statsH + progressH;
            const rankW = 30, feitoW = 56, faltaW = 56, progColW = 120, vgvW = data.showVgv ? 90 : 0;
            const nameW = W - pad * 2 - rankW - feitoW - faltaW - progColW - vgvW;
            const xRank = pad, xName = xRank + rankW, xFeito = xName + nameW, xFalta = xFeito + feitoW, xProg = xFalta + faltaW, xVgv = xProg + progColW;

            ctx.textAlign = 'left';
            ctx.fillStyle = '#64748b';
            ctx.font = `800 11px ${FONT}`;
            ctx.fillText('#', xRank, yT + tableHeadH / 2 + 1);
            ctx.fillText('CORRETOR', xName, yT + tableHeadH / 2 + 1);
            ctx.textAlign = 'center';
            ctx.fillText('FEITO', xFeito + feitoW / 2, yT + tableHeadH / 2 + 1);
            ctx.fillText('FALTA', xFalta + faltaW / 2, yT + tableHeadH / 2 + 1);
            ctx.textAlign = 'left';
            ctx.fillText('PROGRESSO', xProg, yT + tableHeadH / 2 + 1);
            if (data.showVgv) { ctx.textAlign = 'right'; ctx.fillText('VGV', xVgv + vgvW, yT + tableHeadH / 2 + 1); }
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(pad, yT + tableHeadH); ctx.lineTo(W - pad, yT + tableHeadH); ctx.stroke();

            if (rows.length === 0) {
                ctx.fillStyle = '#64748b';
                ctx.font = `600 12px ${FONT}`;
                ctx.textAlign = 'center';
                ctx.fillText('Sem registros', W / 2, yT + tableHeadH + rowHeights[0] / 2 + 1);
            }

            let yCursor = yT + tableHeadH;
            rows.forEach((r, i) => {
                const rh = rowHeights[i];
                const yRow = yCursor;
                const yMid = yRow + rh / 2 - (r.cargo ? 7 : 0);
                if (i > 0) {
                    ctx.strokeStyle = 'rgba(30,41,59,0.7)';
                    ctx.beginPath(); ctx.moveTo(pad, yRow); ctx.lineTo(W - pad, yRow); ctx.stroke();
                }
                const zero = r.count === 0;
                let posColor = '#64748b';
                if (!zero && i === 0) posColor = '#fbbf24'; else if (!zero && i === 1) posColor = '#cbd5e1'; else if (!zero && i === 2) posColor = '#d97706';

                ctx.textAlign = 'left';
                ctx.fillStyle = posColor;
                ctx.font = `800 13px ${FONT}`;
                ctx.fillText(`${r.pos}º`, xRank, yMid + 1);

                // avatar — foto real (já pré-carregada em corretorFotoImages) se tiver, senão
                // iniciais no círculo gradiente, igual ao card na tela.
                const avR = 14;
                const avCx = xName + avR, avCy = yMid;
                ctx.globalAlpha = zero ? 0.5 : 1;
                if (r.foto) {
                    ctx.save();
                    ctx.beginPath(); ctx.arc(avCx, avCy, avR, 0, Math.PI * 2); ctx.clip();
                    const iw = r.foto.naturalWidth || r.foto.width, ih = r.foto.naturalHeight || r.foto.height;
                    const side = Math.min(iw, ih);
                    ctx.drawImage(r.foto, (iw - side) / 2, (ih - side) / 2, side, side, avCx - avR, avCy - avR, avR * 2, avR * 2);
                    ctx.restore();
                } else {
                    const avGrad = ctx.createLinearGradient(avCx - avR, avCy - avR, avCx + avR, avCy + avR);
                    avGrad.addColorStop(0, '#6366f1'); avGrad.addColorStop(1, '#10b981');
                    ctx.beginPath(); ctx.arc(avCx, avCy, avR, 0, Math.PI * 2); ctx.fillStyle = avGrad; ctx.fill();
                    ctx.fillStyle = '#ffffff';
                    ctx.font = `800 10px ${FONT}`;
                    ctx.textAlign = 'center';
                    ctx.fillText(r.iniciais, avCx, avCy + 0.5);
                }
                ctx.globalAlpha = 1;

                // selo de status: verde com check = enviou documentação; cinza com traço = ainda não
                const badgeR = 5, badgeCx = avCx + avR - 2, badgeCy = avCy + avR - 2;
                ctx.beginPath(); ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
                ctx.fillStyle = zero ? '#475569' : '#10b981';
                ctx.fill();
                ctx.lineWidth = 1.5; ctx.strokeStyle = '#0f172a'; ctx.stroke();
                ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
                if (zero) {
                    ctx.beginPath(); ctx.moveTo(badgeCx - 2, badgeCy); ctx.lineTo(badgeCx + 2, badgeCy); ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.moveTo(badgeCx - 2, badgeCy);
                    ctx.lineTo(badgeCx - 0.5, badgeCy + 1.5);
                    ctx.lineTo(badgeCx + 2, badgeCy - 1.5);
                    ctx.stroke();
                }

                ctx.textAlign = 'left';
                ctx.fillStyle = zero ? '#94a3b8' : '#e2e8f0';
                ctx.font = `700 13px ${FONT}`;
                const nameX = xName + avR * 2 + 8;
                ctx.fillText(truncateToWidth(ctx, r.nome, nameW - avR * 2 - 8), nameX, yMid + 1);
                if (r.cargo) {
                    const cargoY = yMid + 16;
                    ctx.font = `700 9px ${FONT}`;
                    const cargoW = ctx.measureText(r.cargo).width + 12;
                    rrFill(ctx, nameX, cargoY - 8, cargoW, 16, 4, 'rgba(51,65,85,0.6)');
                    ctx.fillStyle = '#cbd5e1';
                    ctx.fillText(r.cargo, nameX + 6, cargoY + 1);
                }

                ctx.textAlign = 'center';
                ctx.fillStyle = '#34d399';
                ctx.font = `800 13px ${FONT}`;
                ctx.fillText(String(r.count), xFeito + feitoW / 2, yMid + 1);

                ctx.fillStyle = '#fbbf24';
                ctx.fillText(r.faltaC === null ? '–' : String(r.faltaC), xFalta + faltaW / 2, yMid + 1);

                if (r.pctC !== null) {
                    const barW = 60, barHrow = 7;
                    const barYrow = yMid - barHrow / 2;
                    rrFill(ctx, xProg, barYrow, barW, barHrow, 3.5, '#334155');
                    const fillW = barW * Math.min(1, r.pctC / 100);
                    if (fillW > 0) {
                        const bg = ctx.createLinearGradient(xProg, 0, xProg + barW, 0);
                        bg.addColorStop(0, '#10b981'); bg.addColorStop(1, '#f59e0b');
                        rrFill(ctx, xProg, barYrow, fillW, barHrow, 3.5, bg);
                    }
                    ctx.textAlign = 'left';
                    ctx.fillStyle = r.pctC >= 100 ? '#34d399' : (r.pctC >= 50 ? '#fcd34d' : (r.pctC > 0 ? '#fb923c' : '#fb7185'));
                    ctx.font = `800 11px ${FONT}`;
                    ctx.fillText(`${r.pctC}%`, xProg + barW + 10, yMid + 1);
                } else {
                    ctx.textAlign = 'left';
                    ctx.fillStyle = '#475569';
                    ctx.font = `600 10px ${FONT}`;
                    ctx.fillText('sem meta', xProg, yMid + 1);
                }

                if (data.showVgv) {
                    ctx.textAlign = 'right';
                    ctx.fillStyle = '#a5b4fc';
                    ctx.font = `700 11px ${FONT}`;
                    ctx.fillText(Math.round(r.vgv).toLocaleString('pt-BR'), xVgv + vgvW, yMid + 1);
                }

                yCursor += rh;
            });

            // ---- rodapé: 3 caixas coloridas ----
            const yF = yT + tableHeadH + tableRowsH + 10;
            const colW = (W - pad * 2 - gap * 2) / 3;
            const footerBoxH = footerH - 34;

            const drawFooterBox = (x, style, iconColor, label, line1, line2) => {
                rrFill(ctx, x, yF, colW, footerBoxH, 12, style.boxBg);
                rrStroke(ctx, x, yF, colW, footerBoxH, 12, style.boxBorder, 1);
                ctx.textAlign = 'left';
                ctx.fillStyle = style.text;
                ctx.font = `800 10px ${FONT}`;
                ctx.fillText(label.toUpperCase(), x + 12, yF + 18);
                ctx.fillStyle = '#e2e8f0';
                ctx.font = `700 13px ${FONT}`;
                ctx.fillText(truncateToWidth(ctx, line1, colW - 24), x + 12, yF + 38);
                if (line2) {
                    ctx.fillStyle = style.text;
                    ctx.font = `800 15px ${FONT}`;
                    ctx.fillText(truncateToWidth(ctx, line2, colW - 24), x + 12, yF + 55);
                }
            };

            drawFooterBox(pad, emerald, '#10b981', 'Melhor desempenho', data.melhorNome, data.melhorPct !== null ? `${data.melhorPct}%` : '');
            drawFooterBox(pad + colW + gap, amber, '#f59e0b', 'Pendências', data.pendenciaLine1, data.pendenciaLine2);
            drawFooterBox(pad + (colW + gap) * 2, indigo, '#6366f1', `Meta ${data.cadence.toLowerCase()}`, `${data.meta || '–'} ${data.unidade}`, '');

            // ---- timestamp ----
            ctx.strokeStyle = 'rgba(30,41,59,0.8)';
            ctx.beginPath(); ctx.moveTo(pad, yF + footerBoxH + 10); ctx.lineTo(W - pad, yF + footerBoxH + 10); ctx.stroke();
            ctx.fillStyle = '#64748b';
            ctx.font = `600 10px ${FONT}`;
            ctx.textAlign = 'left';
            ctx.fillText(data.updatedLabel, pad, yF + footerBoxH + 24);

            ctx.restore();
            return canvas;
        }

        let anyRankingExportBusy = false; // trava contra clique duplo enquanto copia/baixa

        async function exportRankingCardImage(btnEl) {
            const card = btnEl.closest('.rk-card');
            const data = card ? rankingCardsSnapshot[parseInt(card.dataset.rkIndex)] : null;
            if (!card || !data) {
                showToast('Não foi possível gerar a imagem.', true);
                return;
            }
            if (anyRankingExportBusy) {
                showToast('Já estou gerando uma imagem — aguarde ela terminar.', true);
                return;
            }
            anyRankingExportBusy = true;
            btnEl.disabled = true;
            const icon = btnEl.querySelector('i');
            const iconClassOriginal = icon ? icon.className : '';
            if (icon) icon.className = 'fa-solid fa-spinner fa-spin';
            try {
                // Espera as fontes carregarem pra garantir que o Canvas 2D desenha com a fonte certa
                // (Plus Jakarta Sans), não com a de fallback do sistema.
                if (document.fonts && document.fonts.ready) await document.fonts.ready;
                const canvas = drawRankingCardCanvas(data);
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                if (!blob) throw new Error('Falha ao gerar imagem');

                const nomeArquivo = `ranking-${(data.title || 'audaz').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
                try {
                    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('Clipboard API indisponível');
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    showToast(`Imagem de "${data.title}" copiada! Cole onde quiser (Ctrl+V).`);
                } catch (clipErr) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = nomeArquivo;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    showToast(`Não deu pra copiar direto — baixei a imagem de "${data.title}".`);
                }
            } catch (e) {
                console.warn('Erro ao exportar ranking como imagem:', e);
                showToast('Erro ao gerar a imagem do ranking.', true);
            } finally {
                if (icon) icon.className = iconClassOriginal;
                btnEl.disabled = false;
                anyRankingExportBusy = false;
            }
        }

        function toggleCorretorModal() {
            const m = document.getElementById('corretorModal');
            m.classList.toggle('hidden');
            if (!m.classList.contains('hidden')) renderCorretorRoster();
        }

        function toggleMesesComerciaisModal() {
            const m = document.getElementById('mesesComerciaisModal');
            m.classList.toggle('hidden');
            if (!m.classList.contains('hidden')) {
                resetMesComercialForm();
                renderMesesComerciaisList();
            }
        }

        function toggleProspeccaoModal() {
            const m = document.getElementById('prospeccaoModal');
            m.classList.toggle('hidden');
            if (!m.classList.contains('hidden')) renderProspeccaoMesesList();
        }

        // Preenche o formulário já sugerindo o PRÓXIMO mês comercial: o mês seguinte ao último
        // cadastrado, com início no dia seguinte ao encerramento do anterior — "já deixa salvo
        // essas datas pra eu fazer o próximo".
        function resetMesComercialForm() {
            document.getElementById('mesComercialEditIdx').value = '';
            document.getElementById('mesComercialSalvarBtn').innerHTML = '<i class="fa-solid fa-plus"></i> Novo Mês Comercial';

            const mesSelect = document.getElementById('mesComercialMesInput');
            const anoInput = document.getElementById('mesComercialAnoInput');
            const inicioInput = document.getElementById('mesComercialInicioInput');
            const fimInput = document.getElementById('mesComercialFimInput');

            const ultimo = mesesComerciais.length ? mesesComerciais[mesesComerciais.length - 1] : null;
            if (ultimo && ultimo.fim) {
                const proxIdx = (MESES_IDX[ultimo.nome] + 1) % 12;
                const proxAno = MESES_IDX[ultimo.nome] === 11 ? ultimo.ano + 1 : ultimo.ano;
                mesSelect.value = getMesName(proxIdx + 1);
                anoInput.value = proxAno;
                const proximoInicio = new Date(ultimo.fim + 'T00:00:00');
                proximoInicio.setDate(proximoInicio.getDate() + 1);
                inicioInput.value = proximoInicio.toISOString().slice(0, 10);
                fimInput.value = '';
            } else {
                const hoje = new Date();
                mesSelect.value = getMesName(hoje.getMonth() + 1);
                anoInput.value = hoje.getFullYear();
                inicioInput.value = '';
                fimInput.value = '';
            }
        }

        function salvarMesComercial() {
            const idxStr = document.getElementById('mesComercialEditIdx').value;
            const nome = document.getElementById('mesComercialMesInput').value;
            const ano = parseInt(document.getElementById('mesComercialAnoInput').value) || new Date().getFullYear();
            const inicio = document.getElementById('mesComercialInicioInput').value;
            const fim = document.getElementById('mesComercialFimInput').value;

            if (!inicio || !fim) { showToast('Preencha início e encerramento.', true); return; }
            if (inicio > fim) { showToast('O início precisa ser antes do encerramento.', true); return; }

            const item = { nome, ano, inicio, fim };
            if (idxStr !== '') {
                mesesComerciais[parseInt(idxStr)] = item;
            } else {
                const existenteIdx = mesesComerciais.findIndex(m => m.nome === nome && m.ano === ano);
                if (existenteIdx >= 0) mesesComerciais[existenteIdx] = item;
                else mesesComerciais.push(item);
            }
            mesesComerciais.sort((a, b) => (a.ano - b.ano) || (MESES_IDX[a.nome] - MESES_IDX[b.nome]));

            saveLocalSetting(`${appId}-meses-comerciais`, JSON.stringify(mesesComerciais));
            pushCloudSettings();
            resetMesComercialForm();
            renderMesesComerciaisList();
            if (typeof renderRitmoMesChart === 'function') renderRitmoMesChart();
            showToast(`Mês comercial ${nome}/${ano} salvo.`);
        }

        function editarMesComercial(idx) {
            const item = mesesComerciais[idx];
            if (!item) return;
            document.getElementById('mesComercialEditIdx').value = String(idx);
            document.getElementById('mesComercialMesInput').value = item.nome;
            document.getElementById('mesComercialAnoInput').value = item.ano;
            document.getElementById('mesComercialInicioInput').value = item.inicio;
            document.getElementById('mesComercialFimInput').value = item.fim;
            document.getElementById('mesComercialSalvarBtn').innerHTML = '<i class="fa-solid fa-check"></i> Salvar Alteração';
        }

        function excluirMesComercial(idx) {
            const item = mesesComerciais[idx];
            if (!item) return;
            mesesComerciais.splice(idx, 1);
            saveLocalSetting(`${appId}-meses-comerciais`, JSON.stringify(mesesComerciais));
            pushCloudSettings();
            renderMesesComerciaisList();
            if (typeof renderRitmoMesChart === 'function') renderRitmoMesChart();
            showToast(`Mês comercial ${item.nome}/${item.ano} removido.`);
        }

        function formatDateISO(iso) {
            if (!iso) return '-';
            return formatDate(new Date(iso + 'T00:00:00'));
        }

        function renderMesesComerciaisList() {
            const el = document.getElementById('mesesComerciaisList');
            if (!el) return;
            if (!mesesComerciais.length) {
                el.innerHTML = '<p class="text-xs text-slate-500">Nenhum mês comercial configurado ainda.</p>';
                return;
            }
            el.innerHTML = mesesComerciais.map((m, idx) => `
                <div class="flex items-center gap-3 bg-slate-950/50 rounded-xl border border-slate-800 p-3">
                    <div class="h-9 w-9 shrink-0 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center"><i class="fa-solid fa-calendar-days text-xs"></i></div>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm font-bold text-slate-200">${m.nome}/${m.ano}</p>
                        <p class="text-[11px] text-slate-500">${formatDateISO(m.inicio)} → ${formatDateISO(m.fim)}</p>
                    </div>
                    <button onclick="editarMesComercial(${idx})" class="h-8 w-8 rounded-lg border border-slate-700 text-slate-400 hover:text-brand-400 hover:border-brand-500/40 flex items-center justify-center transition" title="Editar"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button onclick="excluirMesComercial(${idx})" class="h-8 w-8 rounded-lg border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 flex items-center justify-center transition" title="Excluir"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>
            `).join('');
        }

        function addCorretor() {
            const input = document.getElementById('newCorretorInput');
            // .replace(/\s+/g,' ') colapsa espaço duplo (ex.: copy-paste da planilha) — sem isso,
            // um typo de digitação já entra no roster oficial como um "corretor" diferente, e
            // qualquer nome parecido vindo de outra fonte (Prospecção etc.) não casa com ele.
            const nome = (input.value || '').trim().replace(/\s+/g, ' ');
            if (!nome) return;
            const jaExiste = getAllKnownCorretores().some(n => n.toLowerCase() === nome.toLowerCase());
            if (jaExiste) {
                showToast("Esse corretor já existe.", true);
                input.value = '';
                return;
            }
            addedCorretores.push(nome);
            // Se estava na lista de inativos por algum motivo, garante ativo
            inactiveCorretores = inactiveCorretores.filter(n => n !== nome);
            saveCorretorRoster();
            input.value = '';
            refreshAfterRosterChange();
            showToast(`Corretor "${nome}" adicionado.`);
        }

        function toggleCorretorActive(name) {
            if (inactiveCorretores.includes(name)) {
                inactiveCorretores = inactiveCorretores.filter(n => n !== name);
            } else {
                inactiveCorretores.push(name);
            }
            saveCorretorRoster();
            refreshAfterRosterChange();
        }

        function removeAddedCorretor(name) {
            addedCorretores = addedCorretores.filter(n => n !== name);
            inactiveCorretores = inactiveCorretores.filter(n => n !== name);
            saveCorretorRoster();
            refreshAfterRosterChange();
            showToast(`Corretor "${name}" removido.`);
        }

        function refreshAfterRosterChange() {
            // A seleção do filtro NÃO é mais limpa quando o corretor é desativado: desativar não
            // apaga o histórico, então continuar vendo a produção passada dele (filtrando pelo nome)
            // é justamente o esperado. Ele continua na lista do filtro, marcado como "(inativo)".
            if (!isMockDataActive && dataset.length > 0) {
                populateDynamicFilters();
                applyFilters();
            }
            renderCorretorRoster();
        }

        // ===== FILTRO "EXIBIR CORRETORES" (Ativos / Inativos / Todos) no modal Gerenciar Corretores =====
        let corretorRosterFilter = 'todos'; // 'ativos' | 'inativos' | 'todos'

        function setCorretorRosterFilter(val) {
            corretorRosterFilter = val;
            renderCorretorRoster();
        }

        function renderCorretorRosterFilterPills() {
            const container = document.getElementById('corretorRosterFilterPills');
            if (!container) return;
            const opts = [['ativos', 'Ativos'], ['inativos', 'Inativos'], ['todos', 'Todos']];
            container.innerHTML = opts.map(([val, label]) => {
                const active = corretorRosterFilter === val;
                const circle = active
                    ? '<span class="h-3.5 w-3.5 rounded-full bg-rose-900 border-2 border-rose-700 inline-block shrink-0"></span>'
                    : '<span class="h-3.5 w-3.5 rounded-full border-2 border-slate-700 inline-block shrink-0"></span>';
                const textClass = active ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300';
                return `<button type="button" onclick="setCorretorRosterFilter('${val}')" class="flex items-center gap-1.5 text-xs font-bold ${textClass} transition">${circle}${label}</button>`;
            }).join('');
        }

        function renderCorretorRoster() {
            const list = document.getElementById('corretorRosterList');
            if (!list) return;
            renderCorretorRosterFilterPills();

            const naPlanilha = new Set();
            dataset.forEach(r => { if (r.Corretor) naPlanilha.add(r.Corretor); });

            let todos = getAllKnownCorretores();
            if (corretorRosterFilter === 'ativos') todos = todos.filter(n => isCorretorActive(n));
            else if (corretorRosterFilter === 'inativos') todos = todos.filter(n => !isCorretorActive(n));

            if (todos.length === 0) {
                const msg = getAllKnownCorretores().length === 0
                    ? 'Nenhum corretor ainda. Adicione acima ou conecte a planilha.'
                    : (corretorRosterFilter === 'inativos' ? 'Nenhum corretor inativo.' : 'Nenhum corretor ativo.');
                list.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">${msg}</p>`;
                return;
            }

            list.innerHTML = todos.map(nome => {
                const ativo = isCorretorActive(nome);
                const ehAdicionado = !naPlanilha.has(nome);
                const dot = ativo ? 'bg-brand-500' : 'bg-slate-600';
                const nomeClass = ativo ? 'text-slate-200' : 'text-slate-500 line-through';
                const tag = ehAdicionado
                    ? '<span class="text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">Pré-cadastrado</span>'
                    : '';
                const toggleBtn = ativo
                    ? `<button onclick="toggleCorretorActive('${nome.replace(/'/g, "\\'")}')" title="Desativar" class="px-2.5 py-1 bg-slate-800 hover:bg-rose-600/20 hover:text-rose-400 text-slate-300 rounded text-[10px] font-bold border border-slate-700 transition">Desativar</button>`
                    : `<button onclick="toggleCorretorActive('${nome.replace(/'/g, "\\'")}')" title="Ativar" class="px-2.5 py-1 bg-brand-600/20 text-brand-400 hover:bg-brand-600/30 rounded text-[10px] font-bold border border-brand-500/30 transition">Ativar</button>`;
                const removeBtn = ehAdicionado
                    ? `<button onclick="removeAddedCorretor('${nome.replace(/'/g, "\\'")}')" title="Remover" class="px-2 py-1 text-slate-500 hover:text-rose-400 rounded text-[10px] transition"><i class="fa-solid fa-trash"></i></button>`
                    : '';
                const nomeEsc = nome.replace(/'/g, "\\'");
                const temFoto = !!corretorFotos[nome];
                const removeFotoBtn = temFoto
                    ? `<button onclick="event.stopPropagation(); removeCorretorFoto('${nomeEsc}')" title="Remover foto" class="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-600 hover:bg-rose-500 flex items-center justify-center text-white" style="font-size:7px"><i class="fa-solid fa-xmark"></i></button>`
                    : '';
                return `
                    <div class="flex items-center justify-between gap-2 bg-slate-950/40 rounded-lg px-3 py-2 border border-slate-800/60">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="relative h-8 w-8 shrink-0 group cursor-pointer" onclick="triggerCorretorFotoUpload('${nomeEsc}')" title="Clique para ${temFoto ? 'trocar a' : 'adicionar uma'} foto">
                                ${corretorAvatarInner(nome, 'h-8 w-8', 'text-[10px]')}
                                <div class="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><i class="fa-solid fa-camera text-white" style="font-size:9px"></i></div>
                                ${removeFotoBtn}
                            </div>
                            <span class="h-2 w-2 rounded-full ${dot} shrink-0"></span>
                            <span class="text-xs font-semibold truncate ${nomeClass}">${nome}</span>
                            ${tag}
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                            ${toggleBtn}
                            ${removeBtn}
                        </div>
                    </div>`;
            }).join('');
        }
        // ===================================================================

        // Geração inteligente de dados fictícios de alta fidelidade
        function generateMockData() {
            const corretores = ['Carlos Silva', 'Ana Paula', 'Ricardo Santos', 'Bruna Oliveira', 'Felipe Costa', 'Juliana Lima', 'Mateus Almeida', 'Patrícia Rocha'];
            const equipes = ['Alpha', 'Vanguard', 'Titanium'];
            const construtoras = ['Cyrela', 'MRV', 'Even', 'Gafisa', 'Direcional'];
            const empreendimentos = ['Residencial Splendor', 'Breeze Condomínio', 'Neo Smart Living', 'Urban Park Club', 'Horizon Corporate', 'Prime View'];
            const situacoesAnalise = ['Aprovado', 'Em Análise', 'Reprovado', 'Pendência Documental'];
            
            let data = [];
            
            for (let i = 1; i <= 120; i++) {
                const id = `REG-${1000 + i}`;
                
                let dateCadastro;
                if (i <= 5) {
                    dateCadastro = new Date(2026, 5, 9);
                } else if (i <= 18) {
                    const dia = Math.floor(Math.random() * 6) + 3;
                    dateCadastro = new Date(2026, 5, dia);
                } else if (i <= 55) {
                    const dia = Math.floor(Math.random() * 9) + 1;
                    dateCadastro = new Date(2026, 5, dia);
                } else if (i <= 100) {
                    const mes = Math.floor(Math.random() * 5); 
                    const dia = Math.floor(Math.random() * 28) + 1;
                    dateCadastro = new Date(2026, mes, dia);
                } else {
                    const mes = Math.floor(Math.random() * 12);
                    const dia = Math.floor(Math.random() * 28) + 1;
                    dateCadastro = new Date(2025, mes, dia);
                }

                const corretor = corretores[Math.floor(Math.random() * corretores.length)];
                let equipe = equipes[0];
                if (['Ana Paula', 'Bruna Oliveira', 'Patrícia Rocha'].includes(corretor)) equipe = equipes[1];
                if (['Ricardo Santos', 'Mateus Almeida'].includes(corretor)) equipe = equipes[2];

                const cliente = `Cliente ${i}`;
                const construtora = construtoras[Math.floor(Math.random() * construtoras.length)];
                const empreendimento = empreendimentos[Math.floor(Math.random() * empreendimentos.length)];
                
                const situacaoAnalise = situacoesAnalise[Math.floor(Math.random() * situacoesAnalise.length)];
                
                let dataAprovacao = '';
                let mesAprovacao = '';
                let dataGanho = '';
                let mesGanho = '';
                let ganho = 'Não';
                let situacaoGanho = 'Perdido';
                
                if (situacaoAnalise === 'Aprovado') {
                    const dateAprov = new Date(dateCadastro);
                    dateAprov.setDate(dateAprov.getDate() + 3);
                    dataAprovacao = formatDate(dateAprov);
                    mesAprovacao = getMesName(dateAprov.getMonth() + 1);

                    if (Math.random() > 0.4) {
                        ganho = 'Sim';
                        situacaoGanho = 'Ganho';
                        const dateGanhoObj = new Date(dateAprov);
                        dateGanhoObj.setDate(dateGanhoObj.getDate() + 5);
                        dataGanho = formatDate(dateGanhoObj);
                        mesGanho = getMesName(dateGanhoObj.getMonth() + 1);
                    }
                }

                const vgv = Math.floor(Math.random() * 950000) + 250000;

                data.push({
                    ID: id,
                    'Data Cadastro': formatDate(dateCadastro),
                    'Mês Cadastro': getMesName(dateCadastro.getMonth() + 1),
                    Corretor: corretor,
                    Equipe: equipe,
                    Cliente: cliente,
                    Construtora: construtora,
                    Empreendimento: empreendimento,
                    'Data Aprovação': dataAprovacao,
                    'Mês Aprovação': mesAprovacao,
                    'Situação - Analise': situacaoAnalise,
                    'Data Ganho': dataGanho,
                    'Mês Ganho': mesGanho,
                    'Ganho': ganho,
                    'Situação - Ganho': situacaoGanho,
                    VGV: vgv
                });
            }
            return data;
        }

        function formatDate(date) {
            const d = date.getDate().toString().padStart(2, '0');
            const m = (date.getMonth() + 1).toString().padStart(2, '0');
            const y = date.getFullYear();
            return `${d}/${m}/${y}`;
        }

        function getMesName(monthNum) {
            const meses = [
                'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
            ];
            return meses[monthNum - 1];
        }

        // Normaliza formatos como 'junho/2026' ou 'junho' → 'Junho'
        function normalizeMes(str) {
            if (!str) return '';
            const base = str.split('/')[0].trim();
            return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase();
        }

        // Extrai o ano de 'junho/2026' → 2026
        function getMesAno(str) {
            if (!str) return null;
            const parts = str.split('/');
            return parts.length === 2 ? parseInt(parts[1]) : null;
        }

        // Verifica se um campo 'Mês Xxx' (ex: 'junho/2026') bate com o período atual. Se houver mais
        // de um mês comercial selecionado nos pills (selMeses), a linha entra se bater com QUALQUER
        // um deles — é assim que o modo comparativo soma vários meses num só recorte.
        function checkMesPeriodMatch(mesStr, period, referenceDate, selMeses) {
            if (!mesStr) return false;
            const mesNome = normalizeMes(mesStr);
            const mesAno = getMesAno(mesStr);
            if (selMeses && selMeses.length > 0) {
                return selMeses.some(m => {
                    const nome = normalizeMes(m), ano = getMesAno(m);
                    if (period === 'ano') return ano === null || mesAno === null || mesAno === ano;
                    return mesNome === nome && (mesAno === null || ano === null || mesAno === ano);
                });
            }
            const refMesNome = getMesName(referenceDate.getMonth() + 1);
            const refAno = referenceDate.getFullYear();
            if (period === 'mes') return mesNome === refMesNome && (mesAno === null || mesAno === refAno);
            if (period === 'ano') return mesAno === null || mesAno === refAno;
            return true; // hoje/semana tratados por data real
        }

        // ===== MÊS COMERCIAL CORRENTE =====
        // O mês comercial NÃO fecha no fim do calendário (ex.: hoje pode ser 3/jul mas a referência
        // ainda é junho). Por isso o "mês atual" é derivado do ÚLTIMO mês presente nos dados
        // (coluna Mês Cadastro), e não de new Date(). Assim continua em junho até a planilha virar.
        const MESES_IDX = { 'Janeiro':0,'Fevereiro':1,'Março':2,'Abril':3,'Maio':4,'Junho':5,'Julho':6,'Agosto':7,'Setembro':8,'Outubro':9,'Novembro':10,'Dezembro':11 };
        function getLatestCommercialMonth() {
            let best = null;
            (Array.isArray(dataset) ? dataset : []).forEach(r => {
                const nome = normalizeMes(r['Mês Cadastro']);
                const idx = MESES_IDX[nome];
                const ano = getMesAno(r['Mês Cadastro']);
                if (idx === undefined || ano === null) return;
                if (!best || ano > best.ano || (ano === best.ano && idx > best.idx)) best = { ano, idx, nome };
            });
            return best; // { ano, idx, nome } ou null
        }
        // Data de referência do mês comercial corrente (dia 15 do mês, para os cálculos por mês).
        function commercialRefDate(fallback) {
            const lc = getLatestCommercialMonth();
            return lc ? new Date(lc.ano, lc.idx, 15) : fallback;
        }

        // Mesmo raciocínio de "mês corrente = último mês presente nos dados", só que pela Agenda
        // de Visitas (coluna Data, via agendaMesStr) — a Agenda não tem uma coluna de texto "Mês
        // X" como a planilha principal, então sem isso o mês de referência dos Agendamentos/
        // Compareceu ficaria preso ao último "Mês Cadastro" da OUTRA planilha, que pode estar
        // dessincronizada da Agenda (uma planilha pode ter avançado de mês e a outra não ainda).
        function getLatestAgendaCommercialMonth() {
            let best = null;
            (Array.isArray(agendaDataset) ? agendaDataset : []).forEach(r => {
                const ms = agendaMesStr(r);
                const nome = normalizeMes(ms);
                const idx = MESES_IDX[nome];
                const ano = getMesAno(ms);
                if (idx === undefined || ano === null) return;
                if (!best || ano > best.ano || (ano === best.ano && idx > best.idx)) best = { ano, idx, nome };
            });
            return best;
        }
        function commercialRefDateAgenda(fallback) {
            const lc = getLatestAgendaCommercialMonth();
            return lc ? new Date(lc.ano, lc.idx, 15) : fallback;
        }

        // Mesma ideia pra Prospecção (3ª planilha) — usa a coluna '_MesComercialNorm' (já
        // normalizada de "2026/07" pra "julho/2026" no upload) em vez do "Mês Cadastro" da
        // planilha principal, pra não ficar preso ao mês de uma planilha desatualizada em relação
        // à outra.
        function getLatestProspeccaoCommercialMonth() {
            let best = null;
            (Array.isArray(prospeccaoDataset) ? prospeccaoDataset : []).forEach(r => {
                const ms = r['_MesComercialNorm'];
                const nome = normalizeMes(ms);
                const idx = MESES_IDX[nome];
                const ano = getMesAno(ms);
                if (idx === undefined || ano === null) return;
                if (!best || ano > best.ano || (ano === best.ano && idx > best.idx)) best = { ano, idx, nome };
            });
            return best;
        }
        function commercialRefDateProspeccao(fallback) {
            const lc = getLatestProspeccaoCommercialMonth();
            return lc ? new Date(lc.ano, lc.idx, 15) : fallback;
        }

        // Meses comerciais selecionados nos pills (array de strings cruas, ex.: 'junho/2026').
        // Vazio = "Todos" (nenhum filtro de mês ativo, comportamento de sempre).
        function getSelectedMeses() {
            const el = document.getElementById('filterMes');
            return el ? Array.from(el.selectedOptions).map(o => o.value).filter(Boolean) : [];
        }

        // Preenche um <select multiple> preservando quais valores continuam selecionados após o
        // rebuild (chamado a cada auto-atualização — sem isso, a seleção comparativa de meses se
        // perderia a cada 15s quando os filtros são repopulados).
        function fillMultiSelect(selectId, items, selectedValues) {
            const select = document.getElementById(selectId);
            select.innerHTML = '<option value="">Todos</option>';
            items.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item;
                opt.textContent = item;
                if (selectedValues.includes(item)) opt.selected = true;
                select.appendChild(opt);
            });
        }

        // Mês comercial de referência para o Hero de Metas e o Calendário (que assumem um único
        // mês para calcular "dia X de Y"/ritmo): o MAIS RECENTE dos meses selecionados nos pills.
        // Retorna null se nada estiver selecionado — quem chamar cai de volta no mês comercial
        // corrente via getLatestCommercialMonth().
        function getReferenceMesComercial() {
            let best = null;
            getSelectedMeses().forEach(m => {
                const nome = normalizeMes(m);
                const ano = getMesAno(m);
                const idx = MESES_IDX[nome];
                if (idx === undefined || ano === null) return;
                if (!best || ano > best.ano || (ano === best.ano && idx > best.idx)) best = { ano, idx, nome };
            });
            return best;
        }

        // Considera venda/ganho quando Ganho = 'Sim' OU Situação-Ganho contém 'Ganho'
        function isGanho(row) {
            return row['Ganho'] === 'Sim' || (row['Situação - Ganho'] || '').includes('Ganho');
        }
        // Aprovado = a PRIMEIRA palavra da Situação - Analise é "Aprovado".
        // Pega "Aprovado", "Aprovado em validação", "Aprovado Stand By", "Aprovado Stand-by"; ignora "Reprovado", "Não Aprovado".
        function isAprovado(sit) {
            return /^\s*aprovado\b/i.test(sit || '');
        }

        // ===== AGENDA DE VISITAS (2ª planilha, independente): Status agendada|compareceu|nao_compareceu =====
        function normalizeAgendaStatus(s) {
            return (s || '').toString().trim().toLowerCase().replace(/\s+/g, '_');
        }
        function isCompareceu(row) { return normalizeAgendaStatus(row['Status']) === 'compareceu'; }
        function isNaoCompareceu(row) { return normalizeAgendaStatus(row['Status']) === 'nao_compareceu'; }
        function isAgendaPendente(row) { return normalizeAgendaStatus(row['Status']) === 'agendada'; }

        // A agenda separa o dia em que o compromisso foi cadastrado do dia da visita marcada.
        // Se a planilha trouxer uma coluna específica para visita realizada, ela tem prioridade.
        function agendaDateForMetric(row, metric = 'agendamentos') {
            const normalized = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [stripDiacritics(key).toLowerCase().replace(/[^a-z0-9]/g, ''), value]));
            const keys = metric === 'compareceu'
                ? ['datadavisita','datavisita','datacompareceu','datacomparecimento','datarealizacaovisita','datarealizadavisita','data']
                : ['datadecadastro','datacadastro','dataemquefoiagendado','dataagendamento','dataagendada','data'];
            for (const key of keys) if (normalized[key]) return normalized[key];
            return null;
        }
        // Mês/ano derivado da data própria da etapa da agenda — agendamentos pela data de cadastro,
        // visitas pela data em que compareceu. Mantém compatibilidade se a origem só tiver "Data".
        function agendaMesStr(row, metric = (isCompareceu(row) ? 'compareceu' : 'agendamentos')) {
            const d = parseDate(agendaDateForMetric(row, metric));
            if (!d) return null;
            return `${getMesName(d.getMonth() + 1)}/${d.getFullYear()}`;
        }
        // Resolve a janela REAL (início/fim) de um mês comercial X/ano pra Agenda de Visitas —
        // config manual do painel "Meses Comerciais" quando existir, senão a mesma inferência por
        // sliding-window (data mais antiga lançada com esse mês, trava de 10 dias) usada em toda
        // parte. Reaproveitada tanto por getJanelaMesComercial() (Funil/Ritmo do Mês) quanto por
        // agendaMatchesRef() — pra a CONTAGEM nunca discordar do INTERVALO mostrado na tela (antes,
        // a contagem usava o mês do calendário inteiro enquanto a tela já mostrava a janela real).
        function resolveJanelaAgendaMes(mesNome, ano, metric = 'agendamentos') {
            const monthIdx = MESES_IDX[mesNome];
            const configMes = getMesComercialConfig(mesNome, ano);
            if (configMes) {
                const inicioReal = new Date(configMes.inicio + 'T00:00:00');
                const fimEstimado = new Date(configMes.fim + 'T00:00:00');
                return { inicioReal, fimEstimado, diasNoMes: Math.max(1, Math.round((fimEstimado - inicioReal) / 86400000) + 1) };
            }
            const diasNoMesCalendario = new Date(ano, monthIdx + 1, 0).getDate();
            let inicioReal = new Date(ano, monthIdx, 1);
            filteredAgendaDataset.forEach(row => {
                const ms = agendaMesStr(row, metric);
                if (normalizeMes(ms) !== mesNome || (getMesAno(ms) || ano) !== ano) return;
                const d = parseDate(agendaDateForMetric(row, metric));
                if (d && d < inicioReal) inicioReal = d;
            });
            const inicioMinPermitido = new Date(ano, monthIdx, 1);
            inicioMinPermitido.setDate(inicioMinPermitido.getDate() - 10);
            if (inicioReal < inicioMinPermitido) inicioReal = new Date(inicioMinPermitido);
            inicioReal.setHours(0, 0, 0, 0);
            const fimEstimado = new Date(inicioReal);
            fimEstimado.setDate(fimEstimado.getDate() + diasNoMesCalendario - 1);
            return { inicioReal, fimEstimado, diasNoMes: diasNoMesCalendario };
        }

        // Confere Hoje/Semana/Mês/Ano (+ multi-seleção de Mês Comercial e pills de Semana) pela
        // Data da visita. Pra Mês/Ano usa a JANELA REAL (resolveJanelaAgendaMes), não o mês do
        // calendário — senão contaria linhas fora do período que a tela mostra.
        function agendaMatchesRef(row, refDate, metric = (isCompareceu(row) ? 'compareceu' : 'agendamentos')) {
            const d = parseDate(agendaDateForMetric(row, metric));
            if (!d) return false;
            const useMesRef = (currentPeriod === 'mes' || currentPeriod === 'ano') && !isMockDataActive;
            let matchesPeriod = false;
            if (useMesRef) {
                if (currentPeriod === 'ano') {
                    const selMeses = getSelectedMeses();
                    matchesPeriod = selMeses.length > 0
                        ? selMeses.some(m => (getMesAno(m) || refDate.getFullYear()) === d.getFullYear())
                        : d.getFullYear() === refDate.getFullYear();
                } else {
                    const selMeses = getSelectedMeses();
                    if (selMeses.length > 0) {
                        matchesPeriod = selMeses.some(m => {
                            const nome = normalizeMes(m), ano = getMesAno(m);
                            if (!nome || ano === null) return false;
                            const { inicioReal, fimEstimado } = resolveJanelaAgendaMes(nome, ano, metric);
                            return d >= inicioReal && d <= fimEstimado;
                        });
                    } else {
                        // Usa o mesmo mês comercial de referência do Painel.
                        const nome = getMesName(refDate.getMonth() + 1);
                        const ano = refDate.getFullYear();
                        const { inicioReal, fimEstimado } = resolveJanelaAgendaMes(nome, ano, metric);
                        matchesPeriod = d >= inicioReal && d <= fimEstimado;
                    }
                }
            } else {
                matchesPeriod = checkPeriodMatch(agendaDateForMetric(row, metric), currentPeriod, refDate);
            }
            if (!matchesPeriod) return false;

            // A semana selecionada também precisa recortar Mês/Ano; antes o retorno antecipado
            // dessas janelas ignorava o filtro semanal na Agenda de Visitas.
            const selSemana = document.getElementById('filterSemana').value;
            if (selSemana) {
                const semanaObj = getSemanaRangeParaMetrica(metric, selSemana);
                if (!semanaObj || d < semanaObj.inicio || d > semanaObj.fim) return false;
            }
            return true;
        }
        // Filtro de Empreendimento na Agenda: a planilha tem DUAS colunas candidatas
        // ("Empreendimento" e "empreendimento preferencia", quase sempre com uma delas em
        // branco) e a digitação é livre (não é um dropdown controlado como na planilha
        // principal) — por isso compara sem diferenciar maiúsculas/espaços, contra as duas
        // colunas, em vez de igualdade exata (que perderia quase todo mundo por causa da
        // caixa/coluna diferente).
        function agendaMatchesEmpreendimento(row, selEmpreendimento) {
            if (!selEmpreendimento) return true;
            const sel = selEmpreendimento.trim().toLowerCase();
            const a = (row['Empreendimento'] || '').trim().toLowerCase();
            const b = (row['empreendimento preferencia'] || '').trim().toLowerCase();
            return a === sel || b === sel;
        }

        // ===== PROSPECÇÃO / LEADS (3ª planilha, sem link ao vivo — upload manual de CSV) =====
        // Converte "2026/07" (formato da coluna Mês Comercial dessa planilha) pro padrão
        // "julho/2026" usado em todo o resto do app (normalizeMes/getMesAno/checkMesPeriodMatch),
        // pra reaproveitar toda a lógica de mês comercial já existente sem duplicar nada.
        function normalizeProspeccaoMes(raw) {
            if (!raw) return null;
            const m = /^(\d{4})\s*\/\s*(\d{1,2})$/.exec(String(raw).trim());
            if (!m) return null;
            const ano = parseInt(m[1]), mesNum = parseInt(m[2]);
            if (mesNum < 1 || mesNum > 12) return null;
            return `${getMesName(mesNum)}/${ano}`;
        }

        // Remove acentos pra comparar nomes ("Eduardo Prudencio" vs "Eduardo Prudêncio")
        // sem diferenciar grafia com/sem diacrítico.
        function stripDiacritics(str) {
            return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        // "Nome - Cargo" (ex.: "Sadraque Ribeiro - Acesso Gerente") vira nome + badge de cargo.
        // Global (nao so de drawQuickRankings) pra normalizeProspeccaoCorretor tambem poder
        // comparar so a parte do nome, ignorando o cargo.
        function parseNomeCargo(nomeCompleto) {
            const m = nomeCompleto.match(/^(.+?)\s*[-\u2013]\s*(.+)$/);
            return m ? { nome: m[1].trim(), cargo: m[2].trim() } : { nome: nomeCompleto, cargo: null };
        }

        // A planilha de Prospeccao costuma exportar o corretor em CAIXA ALTA e/ou SEM ACENTO
        // ("EDSON LUIS", "Eduardo Prudencio") e sem o cargo ("Sadraque Ribeiro", enquanto o
        // roster tem "Sadraque Ribeiro - Acesso Gerente"). Casa sem diferenciar maiusculas,
        // acentos, nem cargo -- sem isso, o mesmo corretor apareceria duplicado (uma entrada
        // "de verdade" e outra em caixa alta/sem acento/sem cargo) no roster, fotos e rankings.
        function normalizeProspeccaoCorretor(nomeRaw) {
            if (!nomeRaw) return nomeRaw;
            // .replace(/\s+/g,' ') colapsa espaço duplo/invisível (ex.: "Thales  Araujo" vindo de
            // um copy-paste da planilha) — sem isso, 2 grafias que só diferem no espaçamento
            // escapavam do .trim() e viravam 2 corretores "diferentes" no ranking.
            const trimmed = String(nomeRaw).trim().replace(/\s+/g, ' ');
            const known = getAllKnownCorretores();
            const chave = n => stripDiacritics(parseNomeCargo(n).nome.replace(/\s+/g, ' ')).toLowerCase();
            const trimmedKey = chave(trimmed);
            const match = known.find(n => chave(n) === trimmedKey);
            if (match) return match;
            return trimmed.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
        }

        // Limite de segurança pra não estourar o teto de 1MB do documento de configurações no
        // Firestore (compartilhado com metas/corretores/fotos/etc.) — acima disso a sincronização
        // da Prospecção fica só local (localStorage) neste navegador, sem quebrar o resto.
        const PROSPECCAO_FIRESTORE_LIMIT = 700 * 1024;

        // Reconstrói prospeccaoDataset (usado pelo resto do app) juntando as linhas de TODOS os
        // meses carregados em prospeccaoPorMes. Renormaliza o Corretor de cada linha de novo aqui
        // (não só no upload) pra "curar" duplicatas de nome que já tenham sido salvas antes da
        // comparação de nomes considerar acentos (ex.: "Eduardo Prudencio" x "Eduardo Prudêncio").
        function rebuildProspeccaoDataset() {
            // normalizeProspeccaoCorretor só consegue canonizar nomes que já existem no roster
            // oficial (dataset principal + corretores cadastrados). Um corretor que só aparece na
            // Prospecção (nunca lançou análise nem foi cadastrado manualmente) não tem com o que
            // casar ali — por isso, aqui embaixo, a 1ª grafia encontrada de cada nome (por
            // acento/maiúscula/cargo) vira o padrão pras próximas linhas com a mesma chave, mesmo
            // sem estar no roster oficial. Sem isso, "Thales Araujo" e uma 2ª grafia ligeiramente
            // diferente (espaço, acento) apareciam como 2 corretores distintos nos rankings.
            const chave = n => stripDiacritics(parseNomeCargo(n).nome.replace(/\s+/g, ' ')).toLowerCase();
            const canonicalPorChave = {};
            prospeccaoDataset = Object.values(prospeccaoPorMes).flatMap(m => m.rows).map(row => {
                let norm = normalizeProspeccaoCorretor(row.Corretor);
                if (norm) {
                    const key = chave(norm);
                    if (canonicalPorChave[key]) norm = canonicalPorChave[key];
                    else canonicalPorChave[key] = norm;
                }
                return norm === row.Corretor ? row : Object.assign({}, row, { Corretor: norm });
            });
        }

        let localStorageWarningShown = false;
        function saveLocalSetting(key, value) {
            try {
                localStorage.setItem(key, value);
                localStorageWarningShown = false;
                return true;
            } catch (error) {
                console.warn(`Falha ao salvar configuração local (${key}):`, error);
                updateSettingsSyncStatus('error', 'Falha ao salvar neste navegador · verifique o espaço disponível');
                if (!localStorageWarningShown) {
                    showToast('Não foi possível salvar neste navegador. Libere espaço e tente novamente.', true);
                    localStorageWarningShown = true;
                }
                return false;
            }
        }

        function saveProspeccaoLocal() {
            const porMesCsv = {};
            Object.keys(prospeccaoPorMes).forEach(mes => { porMesCsv[mes] = prospeccaoPorMes[mes].csvText; });
            return saveLocalSetting(`${appId}-prospeccao-por-mes`, JSON.stringify(porMesCsv));
        }

        // Recebe um CSV (de um upload OU vindo do Firestore/localStorage) e agrupa as linhas pelo
        // PRÓPRIO "Mês Comercial" de cada uma — cada mês encontrado substitui só aquele slot em
        // prospeccaoPorMes (um upload novo de "Julho" atualiza só Julho, sem apagar Agosto já
        // carregado antes). Linhas sem mês reconhecível são descartadas (não têm onde entrar).
        // Regra de negócio: a operação não trabalha domingo, então um lead cuja data de Cadastro
        // caiu num domingo (ex.: formulário automático do site, fora do expediente) conta como se
        // tivesse entrado na segunda-feira seguinte — em TUDO que usa essa data (Hoje/Semana,
        // sequência de dias ativos, régua de dias, Ritmo da Semana). Ajustado uma única vez aqui, na
        // ingestão do CSV (upload manual, sync da nuvem e boot do localStorage passam TODOS por
        // applyProspeccaoCsvText), pra todo o resto do app herdar o ajuste automaticamente sem
        // precisar saber que ele existe. Guarda a data original em _CadastroOriginal (auditoria).
        function ajustarCadastroDomingoParaSegunda(row) {
            const d = parseDate(row['Cadastro']);
            if (d && d.getDay() === 0) {
                const seg = new Date(d);
                seg.setDate(seg.getDate() + 1);
                row['_CadastroOriginal'] = row['Cadastro'];
                row['Cadastro'] = `${String(seg.getDate()).padStart(2, '0')}/${String(seg.getMonth() + 1).padStart(2, '0')}/${seg.getFullYear()}`;
            }
            return row;
        }

        function applyProspeccaoCsvText(csvText, opts) {
            const silent = opts && opts.silent;
            const results = Papa.parse(csvText, { header: true, skipEmptyLines: true });
            if (!results.data || results.data.length === 0 || results.data[0].ID === undefined || results.data[0].Corretor === undefined) {
                if (!silent) showToast("Erro: colunas da Prospecção não batem (esperado ID, Corretor, Mês Comercial...).", true);
                return false;
            }
            const rows = normalizeAgendaRows(results.data); // reaproveita o trim de chaves com espaço sobrando
            const porMes = {};
            let semMes = 0;
            rows.forEach(row => {
                const norm = normalizeProspeccaoMes(row['Mês Comercial'] || row['Mes Comercial'] || row['Mês Com.'] || row['Mês Com']);
                row['_MesComercialNorm'] = norm;
                // Essa planilha costuma vir com o nome do corretor em CAIXA ALTA ("EDSON LUIS"),
                // diferente do resto do app ("Edson Luis") — sem isso, cada lead viraria um
                // corretor "novo" e duplicado nos rankings/roster em vez de somar no mesmo.
                row.Corretor = normalizeProspeccaoCorretor(row.Corretor);
                ajustarCadastroDomingoParaSegunda(row);
                if (!norm) { semMes++; return; }
                if (!porMes[norm]) porMes[norm] = [];
                porMes[norm].push(row);
            });
            const mesesEncontrados = Object.keys(porMes);
            if (mesesEncontrados.length === 0) {
                if (!silent) showToast('Nenhuma linha com "Mês Comercial" reconhecível (formato esperado: 2026/07).', true);
                return false;
            }
            mesesEncontrados.forEach(mes => {
                const rowsDoMes = porMes[mes];
                prospeccaoPorMes[mes] = {
                    csvText: Papa.unparse(rowsDoMes.map(r => { const c = Object.assign({}, r); delete c._MesComercialNorm; delete c._CadastroOriginal; return c; })),
                    rows: rowsDoMes,
                    uploadedAt: Date.now()
                };
            });
            rebuildProspeccaoDataset();
            saveProspeccaoLocal();
            if (!silent) {
                const aviso = semMes > 0 ? ` (${semMes} linha(s) sem "Mês Comercial" reconhecível, ignoradas)` : '';
                showToast(`Prospecção: ${mesesEncontrados.join(', ')} atualizado(s) — ${rows.length - semMes} leads${aviso}.`);
                // Só empurra pra nuvem numa ação real do usuário (upload/remover) — carregar do
                // cache local no boot não deve reenviar (evita sobrescrever uma versão mais nova
                // que outro dispositivo tenha salvo enquanto este estava sem abrir).
                pushCloudSettings();
            }
            renderProspeccaoMesesList();
            applyFilters();
            return true;
        }

        function handleProspeccaoFileInput(evt) {
            const file = evt.target.files && evt.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => applyProspeccaoCsvText(e.target.result);
            reader.onerror = () => showToast("Não foi possível ler esse arquivo.", true);
            reader.readAsText(file, 'UTF-8');
            evt.target.value = '';
        }

        // Remove só o mês clicado — os outros meses carregados continuam intactos.
        function removeProspeccaoMes(mes) {
            delete prospeccaoPorMes[mes];
            rebuildProspeccaoDataset();
            saveProspeccaoLocal();
            pushCloudSettings();
            applyFilters();
            renderProspeccaoMesesList();
            showToast(`Prospecção de ${mes} removida.`);
        }

        function renderProspeccaoMesesList() {
            const el = document.getElementById('prospeccaoMesesList');
            if (!el) return;
            const meses = Object.keys(prospeccaoPorMes).sort((a, b) => {
                const anoA = getMesAno(a) || 0, anoB = getMesAno(b) || 0;
                if (anoA !== anoB) return anoB - anoA;
                return (MESES_IDX[normalizeMes(b)] || 0) - (MESES_IDX[normalizeMes(a)] || 0);
            });
            if (meses.length === 0) {
                el.innerHTML = `<p class="text-xs text-slate-500 text-center py-3">Nenhum mês carregado ainda.</p>`;
                return;
            }
            el.innerHTML = meses.map(mes => {
                const m = prospeccaoPorMes[mes];
                const dataUpload = new Date(m.uploadedAt);
                const dataStr = `${String(dataUpload.getDate()).padStart(2, '0')}/${String(dataUpload.getMonth() + 1).padStart(2, '0')} às ${String(dataUpload.getHours()).padStart(2, '0')}:${String(dataUpload.getMinutes()).padStart(2, '0')}`;
                const mesEsc = mes.replace(/'/g, "\\'");
                return `
                    <div class="flex items-center justify-between gap-2 bg-slate-950/40 rounded-lg px-3 py-2 border border-slate-800/60">
                        <div class="min-w-0">
                            <p class="text-xs font-bold text-slate-200">${mes}</p>
                            <p class="text-[10px] text-slate-500">${m.rows.length} leads · carregado em ${dataStr}</p>
                        </div>
                        <button onclick="removeProspeccaoMes('${mesEsc}')" title="Remover ${mes}" class="shrink-0 px-2.5 py-1.5 bg-slate-800 hover:bg-rose-600/20 hover:text-rose-400 text-slate-300 rounded-lg text-[10px] font-bold border border-slate-700 transition">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>`;
            }).join('');
        }

        // Quando a linha está Aprovada mas a planilha não tem Mês/Data de Aprovação preenchida
        // (falha de digitação), cai pra Mês/Data de CADASTRO como respaldo — pra não "perder" uma
        // aprovação real da contagem só porque a coluna de aprovação ficou em branco.
        function mesAprovacaoEfetivo(row) {
            return (row['Mês Aprovação'] || row['Data Aprovação']) ? row['Mês Aprovação'] : row['Mês Cadastro'];
        }
        function dataAprovacaoEfetiva(row) {
            return (row['Mês Aprovação'] || row['Data Aprovação']) ? row['Data Aprovação'] : row['Data Cadastro'];
        }
        // Aprovado E bate com o período de referência — usando Mês/Data Aprovação quando existir,
        // senão o respaldo de Cadastro acima.
        function isAprovadoNoPeriodo(row, refDate) {
            if (!isAprovado(row['Situação - Analise'])) return false;
            return (row['Mês Aprovação'] || row['Data Aprovação'])
                ? metricMatchesRef(row, 'Mês Aprovação', 'Data Aprovação', refDate)
                : metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', refDate);
        }

        // GERAL ("informadas" no sentido amplo) = TODAS as vendas ganhas no mês,
        // menos Cancelado / Em Análise. É a "base completa" (funil/conversões usam esta).
        function isVendaGanhaReal(row) {
            if (!isGanho(row)) return false;
            const s = row['Situação - Ganho'] || '';
            return !s.includes('Cancelado') && !s.includes('Em Análise');
        }
        // VENDA FINALIZADA = base geral, EXCETO o status "Venda Informada".
        // (Acompanhar, Filtragem, Venda Gerada, Emitir NF, Faturada, Recebido... TODOS contam.)
        function isVendaFinalizada(row) {
            return isVendaGanhaReal(row) && !(row['Situação - Ganho'] || '').includes('Venda Informada');
        }
        // Predicado sensível ao TOGGLE (Gerais x Finalizadas). Usado em cartões,
        // rankings e destaques. Funil e conversões NÃO usam isto (ficam sempre na base geral).
        function isVendaModo(row) {
            return vendasMode === 'finalizadas' ? isVendaFinalizada(row) : isVendaGanhaReal(row);
        }

        // Retorna VGV numérico de uma linha
        function getVGV(row) {
            return getMoneyField(row, 'VGV');
        }
        // Parser genérico de colunas em Reais ("R$ 1.234,56" -> 1234.56). Usado p/ VGV e comissão.
        function getMoneyField(row, col) {
            const v = row[col];
            if (!v) return 0;
            if (typeof v === 'number') return v;
            return parseFloat(String(v).replace(/R\$\s?/,'').replace(/\./g,'').replace(',','.').trim()) || 0;
        }

        // Formata em Reais EXATO: R$ 1.234.567,89
        function formatBRL(v) {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
        }

        function parseDate(dateStr) {
            if (!dateStr) return null;
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
            // Formato ISO (ex.: a Agenda de Visitas exporta "2026-06-05", às vezes com hora
            // junto). Constrói com componentes locais em vez de `new Date("2026-06-05")` puro —
            // esse construtor trata "yyyy-mm-dd" como UTC meia-noite, o que em fuso negativo
            // (Brasil) volta um dia quando lido com .getDate()/.getMonth() (getters locais).
            const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
            if (isoMatch) {
                return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
            }
            const parsed = new Date(dateStr);
            return isNaN(parsed.getTime()) ? null : parsed;
        }

        // Dashboard e Calendário agora ficam na MESMA página (calendário inline).
        // O link no topo apenas rola até a seção e destaca o ativo.
        // Enquanto a view "rankings" estiver ativa, guarda se a sidebar estava visível antes
        // (pra devolver o estado exatamente como o usuário deixou ao sair, e não forçar ela a
        // aparecer se ele já tinha escondido manualmente).
        let rankingsViewSidebarWasVisible = null;

        // ===================== TELA (MODO TV) =====================
        // Visão de exibição pra monitor/TV da equipe: tudo numa tela só, sem rolagem, fonte grande.
        //   1. FUNIL DO MÊS   — as 6 etapas com meta, % e ritmo (mesmos números do Funil de Vendas)
        //   2. FEITO HOJE     — as 6 etapas só de hoje (mesma conta da faixa "Hoje" do funil)
        //   3. CORRETORES     — docs de hoje, dias sem subir doc, ranking do mês (análises/
        //                       aprovações/vendas) e IPC, tudo numa linha por corretor
        // Não calcula nada novo: só reaproveita kpiValues, metasMensais, funnelHojeRowsCache,
        // metricMatchesRef/isAprovadoNoPeriodo/isVendaModo e calcularIPC — se um número está aqui,
        // é o mesmo do painel. Roster = equipe ATUAL (getActiveCorretores), como Mapa de Calor e IPC.
        // Re-renderiza a cada applyFilters (auto-refresh de 15s mantém a TV viva).
        function renderTela() {
            const root = document.getElementById('telaRoot');
            if (!root) return;
            if (!Array.isArray(dataset) || !dataset.length) {
                root.innerHTML = `<div class="flex-1 flex items-center justify-center text-slate-500 text-2xl">Carregando dados…</div>`;
                return;
            }
            const hoje = isMockDataActive ? new Date(2026, 5, 9) : new Date();
            hoje.setHours(0, 0, 0, 0);
            const refDate = currentRefDate || hoje;
            const janela = getJanelaMesComercial('analises');

            // ---------- 1. FUNIL DO MÊS ----------
            const idealPorDiaUtil = (meta, jan) => jan.diasUteisNoMes > 0 ? meta * jan.diaUtilHoje / jan.diasUteisNoMes : 0;
            const etapas = [
                { key: 'prospeccao',   label: 'Prospecção',   icon: 'fa-bullhorn',            cor: 'pink',   real: kpiValues.prospeccao || 0,   meta: metasMensais.prospeccao || 0,   jan: getJanelaMesComercial('prospeccao') },
                { key: 'agendamentos', label: 'Agendamentos', icon: 'fa-calendar-check',      cor: 'violet', real: kpiValues.agendamentos || 0, meta: metasMensais.agendamentos || 0, jan: getJanelaMesComercial('agendamentos') },
                { key: 'compareceu',   label: 'Compareceu',   icon: 'fa-door-open',           cor: 'cyan',   real: kpiValues.compareceu || 0,   meta: metasMensais.compareceu || 0,   jan: getJanelaMesComercial('compareceu') },
                { key: 'analises',     label: 'Análises',     icon: 'fa-file-invoice-dollar', cor: 'sky',    real: kpiValues.analyses || 0,     meta: metasMensais.analises || 0,     jan: janela },
                { key: 'aprovacoes',   label: 'Aprovações',   icon: 'fa-circle-check',        cor: 'amber',  real: kpiValues.approvals || 0,    meta: metasMensais.aprovacoes || 0,   jan: getJanelaMesComercial('aprovacoes') },
                { key: 'vendas',       label: 'Vendas',       icon: 'fa-house-circle-check',  cor: 'emerald', real: kpiValues.salesView ?? kpiValues.sales ?? 0, meta: metasMensais.vendas || 0, jan: getJanelaMesComercial('vendas') }
            ];
            // Funil VISUAL — o MESMO desenho do Painel (buildFunilSVG: bandas afuniladas em SVG),
            // nos 2 ramos do funil da AUDAZ: Documentação (Prospecção → Análises → Aprovações →
            // Vendas) e Agendamento & Visita (Prospecção → Agendamento → Visita → Vendas). Os SVGs
            // são preenchidos DEPOIS do innerHTML (buildFunilSVG procura o <svg> no DOM).
            const E = {}; etapas.forEach(e => { E[e.key] = e; });
            const pct = (a, b) => b > 0 ? (a / b) * 100 : 0;
            const metaConvTela = (ma, ms) => ma > 0 ? (ms / ma) * 100 : 0;
            const banda = (key, label, color, convReal, convMeta) => ({
                metrica: key, label, color, realizado: E[key].real, meta: Math.round(E[key].meta),
                ideal: Math.round(idealPorDiaUtil(E[key].meta, E[key].jan)), convReal, convMeta
            });
            const telaEtapasDoc = [
                banda('prospeccao', 'Prospecção', 'pink',    pct(E.analises.real, E.prospeccao.real),   metaConvTela(E.prospeccao.meta, E.analises.meta)),
                banda('analises',   'Análises',   'blue',    pct(E.aprovacoes.real, E.analises.real),   metaConvTela(E.analises.meta, E.aprovacoes.meta)),
                banda('aprovacoes', 'Aprovações', 'amber',   pct(E.vendas.real, E.aprovacoes.real),     metaConvTela(E.aprovacoes.meta, E.vendas.meta)),
                banda('vendas',     'Vendas',     'emerald', null, null)
            ];
            const telaEtapasAg = [
                banda('prospeccao',   'Prospecção',  'pink',    pct(E.agendamentos.real, E.prospeccao.real), metaConvTela(E.prospeccao.meta, E.agendamentos.meta)),
                banda('agendamentos', 'Agendamento', 'violet',  pct(E.compareceu.real, E.agendamentos.real), metaConvTela(E.agendamentos.meta, E.compareceu.meta)),
                banda('compareceu',   'Visita',      'cyan',    pct(E.vendas.real, E.compareceu.real),       metaConvTela(E.compareceu.meta, E.vendas.meta)),
                banda('vendas',       'Vendas',      'emerald', null, null)
            ];
            // Faixa "real / meta · ritmo" embaixo de cada funil — 1 célula por etapa.
            const CORES_TXT = { pink: 'text-pink-400', blue: 'text-sky-400', amber: 'text-amber-400', emerald: 'text-emerald-400', violet: 'text-violet-400', cyan: 'text-cyan-400' };
            const stripMeta = bands => `<div class="grid grid-cols-4 gap-1.5 mt-1">` + bands.map(bd => {
                const ritmo = bd.ideal > 0 ? bd.realizado / bd.ideal : (bd.realizado > 0 ? 1 : 0);
                const corR = ritmo >= 1 ? 'text-emerald-400' : (ritmo >= 0.8 ? 'text-amber-400' : 'text-rose-400');
                return `<div class="rounded-lg bg-slate-950/50 border border-slate-800/60 px-2 py-1 text-center">
                    <p class="text-[9px] font-bold uppercase tracking-wider ${CORES_TXT[bd.color] || 'text-slate-400'}">${bd.label}</p>
                    <p class="text-sm font-black text-white tabular-nums leading-tight">${bd.realizado}<span class="text-[10px] text-slate-500 font-semibold"> / ${bd.meta}</span></p>
                    <p class="text-[10px] font-bold tabular-nums ${corR}">${bd.meta > 0 ? Math.round(pct(bd.realizado, bd.meta)) : 0}% <span class="text-slate-600 font-semibold">· ideal ${bd.ideal}</span></p>
                </div>`;
            }).join('') + `</div>`;
            // Conversões entre etapas numa linha horizontal embaixo do funil (3 células).
            const stripConv = bands => `<div class="grid grid-cols-3 gap-1.5 mt-1.5">` + bands.slice(0, 3).map((bd, i) => {
                const prox = bands[i + 1].label;
                const up = (bd.convReal - bd.convMeta) >= 0;
                return `<div class="text-center rounded-lg bg-slate-950/40 px-1 py-1">
                    <p class="text-lg font-black tabular-nums leading-tight ${up ? 'text-emerald-400' : 'text-rose-400'}">${bd.convReal.toFixed(1)}%</p>
                    <p class="text-[9px] text-slate-500 font-semibold whitespace-nowrap">${bd.label} → ${prox}</p>
                </div>`;
            }).join('') + `</div>`;
            const funilHtml = `
                <div class="grid grid-cols-2 gap-5">
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1"><i class="fa-solid fa-file-invoice-dollar text-sky-400 mr-1"></i>Documentação</p>
                        <svg id="telaFunilDoc" viewBox="0 0 400 208" class="w-full block"></svg>
                        ${stripConv(telaEtapasDoc)}
                        ${stripMeta(telaEtapasDoc)}
                    </div>
                    <div>
                        <p class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1"><i class="fa-solid fa-calendar-check text-violet-400 mr-1"></i>Agendamento &amp; Visita</p>
                        <svg id="telaFunilAg" viewBox="0 0 400 208" class="w-full block"></svg>
                        ${stripConv(telaEtapasAg)}
                        ${stripMeta(telaEtapasAg)}
                    </div>
                </div>`;

            // ---------- 2. FEITO HOJE ----------
            // Garante que a conta de "hoje" está fresca (a mesma da faixa do funil).
            if (typeof renderFunnelHojeStrip === 'function') renderFunnelHojeStrip();
            const hojeC = funnelHojeRowsCache || {};
            const hojeTiles = etapas.map(e => {
                const v = (hojeC[e.key] || []).length;
                return `
                <div class="rounded-2xl border ${v > 0 ? `border-${e.cor}-500/40 bg-${e.cor}-500/10` : 'border-slate-800 bg-slate-950/40'} p-2 flex flex-col items-center justify-center text-center">
                    <span class="text-4xl font-black tabular-nums leading-none ${v > 0 ? `text-${e.cor}-300` : 'text-slate-600'}">${v}</span>
                    <span class="mt-2 text-[11px] font-bold uppercase tracking-wider ${v > 0 ? `text-${e.cor}-400` : 'text-slate-500'}"><i class="fa-solid ${e.icon} mr-1"></i>${e.label}</span>
                </div>`;
            }).join('');

            // ---------- 3. CORRETORES ----------
            const ipc = calcularIPC(refDate);
            const ativos = getActiveCorretores();
            const porCorretor = {};
            ativos.forEach(n => { porCorretor[n] = { nome: n, docsHoje: 0, ultimaDoc: null, analises: 0, aprovacoes: 0, vendas: 0 }; });
            // Docs de hoje e última doc: TODA a base (não só o mês), igual ao Mapa de Calor — o
            // "dias sem subir doc" tem que enxergar a última análise de verdade, mesmo do mês passado.
            dataset.forEach(row => {
                const c = porCorretor[row.Corretor];
                if (!c) return;
                const d = parseDate(row['Data Cadastro']);
                if (d) {
                    d.setHours(0, 0, 0, 0);
                    if (d.getTime() === hoje.getTime()) c.docsHoje++;
                    if (d <= hoje && (!c.ultimaDoc || d > c.ultimaDoc)) c.ultimaDoc = d;
                }
            });
            // Ranking do mês: mesmas regras do Ranking Geral (cada métrica pela SUA coluna de mês).
            filteredDataset.forEach(row => {
                const c = porCorretor[row.Corretor];
                if (!c) return;
                if (metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', refDate)) c.analises++;
                if (isAprovadoNoPeriodo(row, refDate)) c.aprovacoes++;
                if (isVendaModo(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', refDate)) c.vendas++;
            });
            const lista = Object.values(porCorretor).map(c => {
                c.diasSemDoc = c.ultimaDoc ? Math.round((hoje - c.ultimaDoc) / 86400000) : null;
                c.ipc = ipc.porCorretor[c.nome] ? ipc.porCorretor[c.nome].ipc : 0;
                c.vendas3m = ipc.porCorretor[c.nome] ? ipc.porCorretor[c.nome].vendas3m : 0;
                return c;
            }).sort((a, b) => (b.analises - a.analises) || (b.vendas - a.vendas) || (b.aprovacoes - a.aprovacoes) || a.nome.localeCompare(b.nome));

            const corDias = d => d === null ? 'text-slate-600' : (d <= 1 ? 'text-emerald-400' : (d <= 3 ? 'text-amber-400' : 'text-rose-400'));
            const txtDias = d => d === null ? 'nunca' : (d === 0 ? 'hoje' : (d === 1 ? '1 dia' : `${d} dias`));
            const medalha = i => i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `${i + 1}º`));
            const linhas = lista.map((c, i) => `
                <tr class="border-b border-slate-800/40 ${i % 2 ? 'bg-slate-950/30' : ''}">
                    <td class="py-1.5 pl-3 text-lg font-black text-slate-500 w-14">${medalha(i)}</td>
                    <td class="py-1.5 whitespace-nowrap">
                        <div class="flex items-center gap-2.5">
                            ${corretorAvatarInner(c.nome, 'w-9 h-9', 'text-xs', 'shrink-0 ring-2 ring-slate-800')}
                            <span class="text-lg font-bold text-slate-100">${c.nome}</span>
                        </div>
                    </td>
                    <td class="py-1.5 text-center">
                        <span class="inline-block min-w-[3rem] px-2 py-0.5 rounded-lg text-xl font-black tabular-nums ${c.docsHoje > 0 ? 'bg-sky-500/15 text-sky-300' : 'text-slate-600'}">${c.docsHoje}</span>
                    </td>
                    <td class="py-1.5 text-center text-lg font-extrabold tabular-nums ${corDias(c.diasSemDoc)}">${txtDias(c.diasSemDoc)}</td>
                    <td class="py-1.5 text-center text-xl font-black text-sky-400 tabular-nums">${c.analises}</td>
                    <td class="py-1.5 text-center text-xl font-black text-amber-400 tabular-nums">${c.aprovacoes}</td>
                    <td class="py-1.5 text-center text-xl font-black text-emerald-400 tabular-nums">${c.vendas}</td>
                    <td class="py-1.5 pr-3 text-center">
                        <span class="inline-block min-w-[4.5rem] px-2 py-0.5 rounded-lg text-lg font-black tabular-nums ${ipcBadge(c.ipc, ipc.mediaEquipe)}">${fmtIPC(c.ipc)}</span>
                    </td>
                </tr>`).join('');

            const diaSemana = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][hoje.getDay()];
            const agora = new Date();
            const hora = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;

            root.innerHTML = `
                <!-- Cabeçalho -->
                <div class="flex items-center justify-between gap-4 flex-wrap px-1">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center text-white text-lg"><i class="fa-solid fa-chart-line"></i></div>
                        <div>
                            <p class="text-xl font-black text-white leading-tight">AUDAZ BI</p>
                            <p class="text-xs text-slate-500 uppercase tracking-widest font-bold">Tela da equipe</p>
                        </div>
                    </div>
                    <div class="text-center">
                        <p class="text-2xl font-black text-white">${janela.mesNome}/${janela.ano}</p>
                        <p class="text-xs text-slate-400">Mês comercial · ${formatDate(janela.inicioReal)} a ${formatDate(janela.fimEstimado)} · dia <b class="text-slate-200">${janela.diaHoje}</b> de ${janela.diasNoMes}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-2xl font-black text-white">${diaSemana}, ${formatDate(hoje)}</p>
                        <p class="text-xs text-slate-500">Atualizado às ${hora} · atualiza sozinho</p>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="telaFullscreen()" class="text-xs font-bold text-slate-300 border border-slate-700 hover:border-brand-500/50 hover:text-brand-400 rounded-lg px-3 py-2 transition"><i class="fa-solid fa-expand mr-1.5"></i>Tela cheia</button>
                        <button onclick="switchView('dashboard')" class="text-xs font-bold text-slate-400 border border-slate-800 hover:text-slate-200 rounded-lg px-3 py-2 transition"><i class="fa-solid fa-arrow-left mr-1.5"></i>Painel</button>
                    </div>
                </div>

                <!-- Linha 1: Funil do mês + Feito hoje -->
                <div class="grid grid-cols-1 xl:grid-cols-6 gap-3">
                    <section class="xl:col-span-4 bg-slate-900/50 rounded-2xl border border-slate-800 px-5 py-3">
                        <div class="flex items-center justify-between mb-1">
                            <h3 class="text-sm font-black tracking-widest text-slate-400 uppercase flex items-center gap-2"><i class="fa-solid fa-filter text-brand-400"></i> Funil do Mês</h3>
                            <span class="text-[11px] text-slate-500 font-semibold">os 2 ramos do funil · conversão entre etapas · real / meta · ritmo vs ideal de hoje</span>
                        </div>
                        ${funilHtml}
                    </section>
                    <section class="xl:col-span-2 bg-slate-900/50 rounded-2xl border border-slate-800 px-5 py-3 flex flex-col">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="text-sm font-black tracking-widest text-slate-400 uppercase flex items-center gap-2"><i class="fa-solid fa-bolt text-amber-400"></i> Feito Hoje</h3>
                            <span class="text-[11px] text-slate-500 font-semibold">${formatDate(hoje)}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2.5 flex-1">${hojeTiles}</div>
                    </section>
                </div>

                <!-- Linha 2: Corretores -->
                <section class="bg-slate-900/50 rounded-2xl border border-slate-800 px-5 py-3 flex-1">
                    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <h3 class="text-sm font-black tracking-widest text-slate-400 uppercase flex items-center gap-2"><i class="fa-solid fa-users text-sky-400"></i> Corretores — Hoje · Mês · IPC</h3>
                        <div class="flex items-center gap-4 text-[11px] text-slate-500 font-semibold">
                            <span>Ordem: análises do mês</span>
                            <span>IPC = ${ipc.modo === 'manual' ? `vendas ${ipcJanelaTexto(ipc.janelaManual)}` : 'média dos 3 meses (mês atual entra pra quem vendeu nele)'} ÷ ${ipc.divisor} · média da equipe <b class="text-brand-400">${fmtIPC(ipc.mediaEquipe)}</b></span>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="border-b-2 border-slate-800 text-[11px] text-slate-500 font-black uppercase tracking-widest">
                                    <th class="pb-2 pl-3">#</th>
                                    <th class="pb-2">Corretor</th>
                                    <th class="pb-2 text-center">Docs hoje</th>
                                    <th class="pb-2 text-center">Sem subir doc</th>
                                    <th class="pb-2 text-center text-sky-500">Análises</th>
                                    <th class="pb-2 text-center text-amber-500">Aprovações</th>
                                    <th class="pb-2 text-center text-emerald-500">Vendas</th>
                                    <th class="pb-2 pr-3 text-center">IPC</th>
                                </tr>
                            </thead>
                            <tbody>${linhas || `<tr><td colspan="8" class="py-8 text-center text-slate-500">Nenhum corretor ativo.</td></tr>`}</tbody>
                        </table>
                    </div>
                </section>`;
            // Desenha os 2 funis (SVG) e as conversões — mesmas funções do Painel.
            buildFunilSVG('telaFunilDoc', telaEtapasDoc);
            buildFunilSVG('telaFunilAg', telaEtapasAg);
            ajustarEscalaTela();
            renderTelaSemanas();
        }

        // ===== TELA — parte de baixo (rolando): RESULTADO POR SEMANA =====
        // Bloco 4: a EQUIPE, semana a semana do mês comercial — 6 etapas × semanas, cada célula
        // realizado / meta semanal (rankingsMetas.*Sem, a mesma de "Editar metas") com cor de ritmo.
        // Bloco 5: CADA CORRETOR, semana a semana — foto + nome, e por semana An · Ap · Vd em
        // destaque e Pr · Ag · Vi embaixo, mais a coluna Total do mês.
        // Mesma divisão de semanas (getSemanasMesComercial) e mesmos critérios de contagem da
        // "Evolução Semanal do Mês" (cada métrica pela SUA coluna de data e SEU mês de referência).
        // Semanas FUTURAS aparecem como "—", não como zero — zero pareceria queda de produção.
        function renderTelaSemanas() {
            const box = document.getElementById('telaExtra');
            if (!box) return;
            if (!Array.isArray(dataset) || !dataset.length) { box.innerHTML = ''; return; }

            const { inicioReal, diasNoMes, diaHoje, mesNome, ano } = getJanelaMesComercial('analises');
            const semanas = getSemanasMesComercial(inicioReal, diasNoMes);
            const nSem = semanas.length;
            const diaParaSemana = new Array(diasNoMes + 1).fill(0);
            semanas.forEach((s, wi) => s.dias.forEach(x => { diaParaSemana[x.d] = wi; }));
            const semanaHojeIdx = Math.max(0, Math.min(nSem - 1, diaParaSemana[Math.max(1, Math.min(diasNoMes, diaHoje))]));
            const lbl = s => `${s.idx}ª SEM<br><span class="font-semibold text-slate-600">${String(s.inicio.getDate()).padStart(2,'0')}–${String(s.fim.getDate()).padStart(2,'0')}</span>`;

            // contagens[etapa][semana] (equipe) e porCorretor[nome][etapa][semana]
            const ativos = getActiveCorretores();
            const ativoSet = new Set(ativos);
            const zeros = () => new Array(nSem).fill(0);
            const equipe = {}; FUNIL_ETAPAS.forEach(e => { equipe[e.key] = zeros(); });
            const porCorretor = {};
            ativos.forEach(n => { porCorretor[n] = {}; FUNIL_ETAPAS.forEach(e => { porCorretor[n][e.key] = zeros(); }); });
            const somar = (dataStr, key, corretor) => {
                const d = parseDate(dataStr);
                if (!d) return;
                const diaIdx = Math.floor((d - inicioReal) / 86400000) + 1;
                if (diaIdx < 1 || diaIdx > diasNoMes) return;
                const wi = diaParaSemana[diaIdx];
                equipe[key][wi]++;
                if (corretor && ativoSet.has(corretor)) porCorretor[corretor][key][wi]++;
            };
            filteredProspeccaoDataset.forEach(row => {
                if (metricMatchesRef(row, '_MesComercialNorm', 'Cadastro', currentRefDateProspeccao)) somar(row['Cadastro'], 'prospeccao', row.Corretor);
            });
            filteredAgendaDataset.forEach(row => {
                if (agendaMatchesRef(row, currentRefDateAgenda, 'agendamentos')) somar(agendaDateForMetric(row, 'agendamentos'), 'agendamentos', row.Corretor);
                if (isCompareceu(row) && agendaMatchesRef(row, currentRefDateAgenda, 'compareceu')) somar(agendaDateForMetric(row, 'compareceu'), 'compareceu', row.Corretor);
            });
            filteredDataset.forEach(row => {
                if (metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', currentRefDate)) somar(row['Data Cadastro'], 'analises', row.Corretor);
                if (isAprovadoNoPeriodo(row, currentRefDate)) somar(dataAprovacaoEfetiva(row), 'aprovacoes', row.Corretor);
                if (isVendaGanhaReal(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', currentRefDate)) somar(row['Data Ganho'], 'vendas', row.Corretor);
            });

            // ---------- Bloco 4: EQUIPE por semana ----------
            const METAS_SEM = { prospeccao: 'prSem', agendamentos: 'agSem', compareceu: 'coSem', analises: 'anSem', aprovacoes: 'apSem', vendas: 'vdSem' };
            const metaSem = key => Math.round((rankingsMetas && rankingsMetas[METAS_SEM[key]]) || 0);
            const corPct = (real, meta, futura) => {
                if (futura) return 'text-slate-700';
                if (meta <= 0) return real > 0 ? 'text-slate-200' : 'text-slate-600';
                const p = real / meta;
                return p >= 1 ? 'text-emerald-400' : (p >= 0.8 ? 'text-amber-400' : (real > 0 ? 'text-rose-400' : 'text-slate-600'));
            };
            const linhasEquipe = FUNIL_ETAPAS.map(e => {
                const meta = metaSem(e.key);
                const cl = FUNIL_CORES[e.color] || FUNIL_CORES.sky;
                const cels = semanas.map((s, wi) => {
                    const futura = wi > semanaHojeIdx;
                    const v = equipe[e.key][wi];
                    // Semana futura: "—" se vazia; se já tem algo lançado pra frente (ex.: visita
                    // agendada pra semana que vem), mostra o número esmaecido, sem meta/%.
                    if (futura) return `<td class="py-2.5 text-center text-xl font-black ${v > 0 ? 'text-slate-500' : 'text-slate-700'}" title="Semana ainda não começou">${v > 0 ? v : '—'}</td>`;
                    const pct = meta > 0 ? Math.round((v / meta) * 100) : null;
                    return `<td class="py-2.5 text-center ${wi === semanaHojeIdx ? 'bg-brand-500/5' : ''}">
                        <span class="text-2xl font-black tabular-nums ${corPct(v, meta, false)}">${v}</span>
                        ${meta > 0 ? `<span class="text-xs text-slate-500 font-semibold"> / ${meta}</span><span class="block text-[10px] font-bold tabular-nums ${corPct(v, meta, false)}">${pct}%</span>` : ''}
                    </td>`;
                }).join('');
                const total = equipe[e.key].reduce((a, b) => a + b, 0);
                return `<tr class="border-b border-slate-800/40">
                    <td class="py-2.5 pl-3 whitespace-nowrap">
                        <span class="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${cl.text}"><i class="fa-solid ${e.icon}"></i>${e.label}</span>
                        ${meta > 0 ? `<span class="block text-[10px] text-slate-500 pl-6">meta ${meta}/sem</span>` : ''}
                    </td>
                    ${cels}
                    <td class="py-2.5 pr-3 text-center text-2xl font-black text-white tabular-nums bg-slate-950/40">${total}</td>
                </tr>`;
            }).join('');

            // ---------- Bloco 5: CADA CORRETOR por semana ----------
            const mini = (n, cor, titulo) => `<span title="${titulo}" class="tabular-nums ${n > 0 ? cor : 'text-slate-700'}">${n}</span>`;
            const celCorretor = (c, wi, futura) => {
                const g = porCorretor[c];
                if (futura) {
                    const tem = FUNIL_ETAPAS.some(e => g[e.key][wi] > 0);
                    if (!tem) return `<td class="py-2 text-center text-slate-700 text-lg" title="Semana ainda não começou">—</td>`;
                }
                return `<td class="py-2 text-center ${wi === semanaHojeIdx ? 'bg-brand-500/5' : ''} ${futura ? 'opacity-50' : ''}">
                    <div class="text-lg font-black leading-tight space-x-2">${mini(g.analises[wi], 'text-sky-400', 'Análises')}${mini(g.aprovacoes[wi], 'text-amber-400', 'Aprovações')}${mini(g.vendas[wi], 'text-emerald-400', 'Vendas')}</div>
                    <div class="text-[11px] font-bold leading-tight space-x-1.5 mt-0.5">${mini(g.prospeccao[wi], 'text-pink-400', 'Prospecção')}<span class="text-slate-700">·</span>${mini(g.agendamentos[wi], 'text-violet-400', 'Agendamentos')}<span class="text-slate-700">·</span>${mini(g.compareceu[wi], 'text-cyan-400', 'Compareceu')}</div>
                </td>`;
            };
            const totalDe = (c, key) => porCorretor[c][key].reduce((a, b) => a + b, 0);
            const ordem = ativos.slice().sort((a, b) => (totalDe(b, 'analises') - totalDe(a, 'analises')) || (totalDe(b, 'vendas') - totalDe(a, 'vendas')) || a.localeCompare(b));
            const linhasCorretor = ordem.map((c, i) => {
                const cels = semanas.map((s, wi) => celCorretor(c, wi, wi > semanaHojeIdx)).join('');
                return `<tr class="border-b border-slate-800/40 ${i % 2 ? 'bg-slate-950/30' : ''}">
                    <td class="py-2 pl-3 whitespace-nowrap">
                        <div class="flex items-center gap-2.5">
                            ${corretorAvatarInner(c, 'w-9 h-9', 'text-xs', 'shrink-0 ring-2 ring-slate-800')}
                            <span class="text-base font-bold text-slate-100">${c}</span>
                        </div>
                    </td>
                    ${cels}
                    <td class="py-2 pr-3 text-center bg-slate-950/40">
                        <div class="text-lg font-black leading-tight space-x-2">${mini(totalDe(c,'analises'), 'text-sky-400', 'Análises')}${mini(totalDe(c,'aprovacoes'), 'text-amber-400', 'Aprovações')}${mini(totalDe(c,'vendas'), 'text-emerald-400', 'Vendas')}</div>
                        <div class="text-[11px] font-bold leading-tight space-x-1.5 mt-0.5">${mini(totalDe(c,'prospeccao'), 'text-pink-400', 'Prospecção')}<span class="text-slate-700">·</span>${mini(totalDe(c,'agendamentos'), 'text-violet-400', 'Agendamentos')}<span class="text-slate-700">·</span>${mini(totalDe(c,'compareceu'), 'text-cyan-400', 'Compareceu')}</div>
                    </td>
                </tr>`;
            }).join('');

            const thSemanas = semanas.map((s, wi) => `<th class="pb-2 text-center ${wi === semanaHojeIdx ? 'text-brand-400' : (wi > semanaHojeIdx ? 'text-slate-700' : 'text-slate-500')}">${lbl(s)}${wi === semanaHojeIdx ? '<br><span class="text-[9px] font-black text-brand-400">ATUAL</span>' : ''}</th>`).join('');
            const legendaCorretor = `<span class="text-sky-400">Análises</span> · <span class="text-amber-400">Aprovações</span> · <span class="text-emerald-400">Vendas</span> &nbsp;<span class="text-slate-600">/</span>&nbsp; <span class="text-pink-400">Prospecção</span> · <span class="text-violet-400">Agendamentos</span> · <span class="text-cyan-400">Compareceu</span>`;

            box.innerHTML = `
                <div class="flex items-center justify-center gap-2 text-[11px] text-slate-600 font-bold uppercase tracking-widest -mb-2"><i class="fa-solid fa-chevron-down"></i> Resultado por semana · ${mesNome}/${ano} <i class="fa-solid fa-chevron-down"></i></div>

                <section class="bg-slate-900/50 rounded-2xl border border-slate-800 px-5 py-4">
                    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <h3 class="text-sm font-black tracking-widest text-slate-400 uppercase flex items-center gap-2"><i class="fa-solid fa-people-group text-brand-400"></i> Resultado da Equipe por Semana</h3>
                        <span class="text-[11px] text-slate-500 font-semibold">realizado / meta semanal · semana futura: "—" (ou o que já foi lançado pra frente, esmaecido)</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead><tr class="border-b-2 border-slate-800 text-[11px] font-black uppercase tracking-widest">
                                <th class="pb-2 pl-3 text-slate-500">Etapa</th>${thSemanas}<th class="pb-2 pr-3 text-center text-slate-300">Total mês</th>
                            </tr></thead>
                            <tbody>${linhasEquipe}</tbody>
                        </table>
                    </div>
                </section>

                <section class="bg-slate-900/50 rounded-2xl border border-slate-800 px-5 py-4">
                    <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <h3 class="text-sm font-black tracking-widest text-slate-400 uppercase flex items-center gap-2"><i class="fa-solid fa-user-group text-sky-400"></i> Resultado de Cada Corretor por Semana</h3>
                        <span class="text-[11px] font-semibold">${legendaCorretor}</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead><tr class="border-b-2 border-slate-800 text-[11px] font-black uppercase tracking-widest">
                                <th class="pb-2 pl-3 text-slate-500">Corretor</th>${thSemanas}<th class="pb-2 pr-3 text-center text-slate-300">Total mês</th>
                            </tr></thead>
                            <tbody>${linhasCorretor || `<tr><td colspan="${nSem + 2}" class="py-6 text-center text-slate-500">Nenhum corretor ativo.</td></tr>`}</tbody>
                        </table>
                    </div>
                </section>`;
        }

        // Faz a Tela caber SEMPRE sem rolagem, em qualquer TV e com qualquer quantidade de
        // corretores: mede a altura natural do conteúdo e aplica um `zoom` proporcional quando
        // ela passa da altura da janela. Nunca amplia (zoom máximo 1) — só encolhe o necessário.
        function ajustarEscalaTela() {
            const root = document.getElementById('telaRoot');
            if (!root || activeView !== 'tela') return;
            root.style.zoom = '1';
            // Rola INSTANTÂNEO até a Tela (sem animação), pra medir com a posição final de verdade —
            // com a barra de navegação rolada pra fora sobra o máximo de altura pra TV.
            const sec = document.getElementById('telaSection');
            if (sec) window.scrollTo(0, Math.max(0, sec.getBoundingClientRect().top + window.scrollY - 12));
            const top = root.getBoundingClientRect().top;
            const disponivel = window.innerHeight - top - 16;
            if (disponivel <= 200) return;
            // Iterativo: reduzir o zoom ALARGA o layout em px CSS, e os funis (SVG que escala pela
            // largura) ficam mais altos, anulando parte da redução. Então mede → aplica → mede de
            // novo, até a altura VISUAL (getBoundingClientRect, já com o zoom) caber. Converge em 2-3.
            let z = 1;
            for (let i = 0; i < 4; i++) {
                const visual = root.getBoundingClientRect().height;
                if (visual <= disponivel + 1) break;
                z = Math.max(0.5, z * (disponivel / visual));
                root.style.zoom = String(z);
            }
        }
        let telaResizeTimer = null;
        window.addEventListener('resize', () => {
            if (activeView !== 'tela') return;
            clearTimeout(telaResizeTimer);
            telaResizeTimer = setTimeout(ajustarEscalaTela, 150);
        });

        function telaFullscreen() {
            const el = document.documentElement;
            if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen(); return; }
            (el.requestFullscreen || el.webkitRequestFullscreen || function(){}).call(el);
        }

        // ===== NAVEGADOR DO PAINEL (barra fixa com os 5 grupos) =====
        function painelIrPara(gid) {
            const el = document.getElementById(gid);
            if (!el) return;
            if (activeView !== 'dashboard') switchView('dashboard');
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // Destaca no navegador o grupo que está na tela (IntersectionObserver, barato).
        let painelNavObserver = null;
        function instalarNavegadorPainel() {
            if (painelNavObserver || !('IntersectionObserver' in window)) return;
            const btns = [...document.querySelectorAll('.painel-nav-btn')];
            const marcar = gid => btns.forEach(b => {
                const on = b.dataset.grupo === gid;
                b.classList.toggle('bg-slate-800', on);
                b.classList.toggle('text-white', on);
                b.classList.toggle('border-slate-700', on);
            });
            const visiveis = new Map();
            painelNavObserver = new IntersectionObserver(entries => {
                entries.forEach(e => { if (e.isIntersecting) visiveis.set(e.target.id, e.boundingClientRect.top); else visiveis.delete(e.target.id); });
                if (!visiveis.size) return;
                // o grupo mais perto do topo da janela é o "atual"
                const atual = [...visiveis.entries()].sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0][0];
                marcar(atual);
            }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });
            document.querySelectorAll('.painel-grupo').forEach(g => painelNavObserver.observe(g));
            marcar('grupoResultado');
        }

        // Com 1 equipe só, "Ranking Geral de Equipes" (1 linha) e o donut "Desempenho por Equipe"
        // (100% de uma fatia) não informam nada — somem sozinhos. Voltam se surgir uma 2ª equipe.
        function ajustarBlocosEquipe() {
            const n = new Set((dataset || []).map(r => r.Equipe).filter(Boolean)).size;
            const soUma = n <= 1;
            const a = document.getElementById('rankingEquipesCard');
            const b = document.getElementById('performanceEquipeCard');
            if (a) a.classList.toggle('hidden', soUma);
            if (b) b.classList.toggle('hidden', soUma);
        }

        function switchView(viewName) {
            activeView = viewName;
            // O Mapa de Calor só existe nas views "dashboard" e "calendar" (é inline no painel) —
            // redesenhá-lo ao entrar em Rankings/Corretor/Plantões era ~12ms jogados fora em TODA
            // troca de aba, contribuindo pro travamento que o usuário reportou.
            if (viewName === 'calendar') renderCalendarTab();
            const onCls = "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition bg-slate-800 text-slate-100";
            const offCls = "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition text-slate-400 hover:text-slate-200";
            const linkDashboard = document.getElementById('navLinkDashboard');
            const linkCalendar = document.getElementById('navLinkCalendar');
            const linkRankings = document.getElementById('navLinkRankings');
            const linkCorretor = document.getElementById('navLinkCorretor');
            const linkOrganograma = document.getElementById('navLinkOrganograma');
            const linkPlantoes = document.getElementById('navLinkPlantoes');
            const linkTela = document.getElementById('navLinkTela');
            if (linkDashboard) linkDashboard.className = viewName === 'dashboard' ? onCls : offCls;
            if (linkCalendar) linkCalendar.className = viewName === 'calendar' ? onCls : offCls;
            if (linkRankings) linkRankings.className = viewName === 'rankings' ? onCls : offCls;
            if (linkCorretor) linkCorretor.className = viewName === 'corretor' ? onCls : offCls;
            if (linkOrganograma) linkOrganograma.className = viewName === 'organograma' ? onCls : offCls;
            if (linkPlantoes) linkPlantoes.className = viewName === 'plantoes' ? onCls : offCls;
            if (linkTela) linkTela.className = viewName === 'tela' ? onCls : offCls;

            // "Rankings", "Corretor" e "Plantões" são telas dedicadas (escondem todo o resto do
            // Painel — Hero, KPIs, Funil, Calendário — que hoje é inline aqui dentro — e mostram só a
            // própria seção). Nas outras views (dashboard/calendar) as três somem, pra não duplicar
            // conteúdo — Calendário só rola até #calendarView, mantendo o resto visível.
            const dashboardViewEl = document.getElementById('dashboardView');
            const quickSection = document.getElementById('quickRankingsSection');
            const corretorSection = document.getElementById('corretorSection');
            const organogramaSection = document.getElementById('organogramaSection');
            const plantoesSection = document.getElementById('plantoesSection');
            const telaSection = document.getElementById('telaSection');
            const calSection = document.getElementById('calendarView');
            const secoesDedicadas = ['rankings', 'corretor', 'organograma', 'plantoes', 'tela', 'calendar'];
            if (dashboardViewEl) {
                Array.from(dashboardViewEl.children).forEach(child => {
                    if (child === quickSection) { child.classList.toggle('hidden', viewName !== 'rankings'); return; }
                    if (child === corretorSection) { child.classList.toggle('hidden', viewName !== 'corretor'); return; }
                    if (child === organogramaSection) { child.classList.toggle('hidden', viewName !== 'organograma'); return; }
                    if (child === plantoesSection) { child.classList.toggle('hidden', viewName !== 'plantoes'); return; }
                    if (child === telaSection) { child.classList.toggle('hidden', viewName !== 'tela'); return; }
                    if (child === calSection) { child.classList.toggle('hidden', viewName !== 'calendar'); return; }
                    child.classList.toggle('hidden', secoesDedicadas.includes(viewName));
                });
            }
            // Filtros somem nas telas de exibição (Rankings e Tela/TV) — são telas pra olhar, não pra operar.
            const filtersBar = document.getElementById('filtersBar');
            if (filtersBar) filtersBar.classList.toggle('hidden', viewName === 'rankings' || viewName === 'tela' || viewName === 'organograma');
            if (viewName === 'corretor') renderCorretorCards();
            if (viewName === 'organograma') renderOrganograma();
            if (viewName === 'plantoes') renderPlantoes();
            if (viewName === 'tela') renderTela();
            // Entrando nos Rankings: redesenha se algo mudou enquanto a aba estava fechada
            // (drawQuickRankings marca `quickRankingsPendente` em vez de renderizar à toa).
            if (viewName === 'rankings' && quickRankingsPendente) drawQuickRankings();

            const sb = document.getElementById('sidebar');
            if (sb) {
                if (viewName === 'rankings' || viewName === 'tela') {
                    if (rankingsViewSidebarWasVisible === null) rankingsViewSidebarWasVisible = sb.style.display !== 'none';
                    sb.style.display = 'none';
                } else if (rankingsViewSidebarWasVisible !== null) {
                    if (rankingsViewSidebarWasVisible) sb.style.display = '';
                    rankingsViewSidebarWasVisible = null;
                }
            }

            const targetId = viewName === 'calendar' ? 'calendarView' : (viewName === 'rankings' ? 'quickRankingsSection' : (viewName === 'corretor' ? 'corretorSection' : (viewName === 'plantoes' ? 'plantoesSection' : (viewName === 'tela' ? 'telaSection' : 'dashboardView'))));
            const target = document.getElementById(targetId);
            // Tela (TV) rola instantâneo dentro de ajustarEscalaTela() — o smooth aqui brigaria com ela.
            if (target && viewName !== 'tela') target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // ====== PLANTÕES: semana inteira (7 colunas), as 3 escalas (Diamond/Roleta/Represados)
        // empilhadas dentro de cada dia, vagas fixas por escala, status Confirmado/Aguardando por
        // pessoa, edição num modal por (escala, dia). Cada pessoa na fila agora é
        // { nome, confirmado } — não mais uma string simples.
        // ESCALAS CONFIGURÁVEIS (pedido 15/09/2026): o gestor renomeia (ex.: Roleta → C2S), troca
        // cor/ícone/vagas, adiciona e remove escalas — tudo salvo na nuvem. A `key` é fixa e interna
        // (é o que indexa escalasPlantao/vagas/info); só o `label` muda. As 3 originais continuam
        // com as keys 'diamond'/'roleta'/'represados' pra nada do histórico se perder.
        const PLANTAO_CORES = ['violet', 'emerald', 'amber', 'sky', 'rose', 'cyan', 'indigo', 'orange', 'pink', 'teal', 'lime', 'fuchsia'];
        const PLANTAO_ICONES = ['fa-gem', 'fa-bullseye', 'fa-users', 'fa-phone', 'fa-star', 'fa-fire', 'fa-bolt', 'fa-house', 'fa-crown', 'fa-rocket', 'fa-handshake', 'fa-flag'];
        const PLANTAO_ESCALAS_PADRAO = [
            { key: 'diamond', label: 'Diamond', cor: 'violet', icon: 'fa-gem' },
            { key: 'roleta', label: 'Roleta', cor: 'emerald', icon: 'fa-bullseye' },
            { key: 'represados', label: 'Represados', cor: 'amber', icon: 'fa-users' }
        ];
        let plantaoEscalasCfg = PLANTAO_ESCALAS_PADRAO.map(e => Object.assign({}, e));
        let ESCALAS_PLANTAO_DEF = [];   // derivada de plantaoEscalasCfg (com as classes Tailwind)
        function plantaoDefDe(e) { const c = PLANTAO_CORES.includes(e.cor) ? e.cor : 'violet'; return { key: e.key, label: e.label || e.key, cor: c, icon: e.icon || 'fa-star', text: `text-${c}-400`, bg: `bg-${c}-500/15`, border: `border-${c}-500/40` }; }
        function rebuildEscalasPlantaoDef() {
            ESCALAS_PLANTAO_DEF = plantaoEscalasCfg.map(plantaoDefDe);
            // garante as estruturas por escala (uma escala nova entra vazia; uma removida mantém os dados guardados)
            plantaoEscalasCfg.forEach(e => {
                if (!escalasPlantao[e.key]) escalasPlantao[e.key] = {};
                if (vagasPorEscala[e.key] === undefined) vagasPorEscala[e.key] = 2;
                if (plantaoInfoEscala[e.key] === undefined) plantaoInfoEscala[e.key] = '';
            });
        }
        function loadPlantaoEscalasCfg() {
            try {
                const saved = JSON.parse(localStorage.getItem(`${appId}-plantao-escalas`) || 'null');
                if (Array.isArray(saved) && saved.length) plantaoEscalasCfg = saved.filter(e => e && e.key).map(e => ({ key: e.key, label: e.label || e.key, cor: e.cor || 'violet', icon: e.icon || 'fa-star' }));
            } catch (e) {}
            rebuildEscalasPlantaoDef();
        }
        function savePlantaoEscalasCfg() {
            rebuildEscalasPlantaoDef();
            saveLocalSetting(`${appId}-plantao-escalas`, JSON.stringify(plantaoEscalasCfg));
            saveLocalSetting(`${appId}-vagas-por-escala`, JSON.stringify(vagasPorEscala));
            pushCloudSettings();
        }
        // Notas livres por escala (ex.: regras de tolerância/horário) — editáveis pelo diretor,
        // mostradas na barra lateral "Informações Importantes". Puramente informativo, não afeta
        // nenhum cálculo.
        let plantaoInfoEscala = { diamond: '', roleta: '', represados: '' };
        function loadPlantaoInfoEscala() {
            try {
                const saved = JSON.parse(localStorage.getItem(`${appId}-plantao-info-escala`) || 'null');
                if (saved && typeof saved === 'object') plantaoInfoEscala = Object.assign({ diamond: '', roleta: '', represados: '' }, saved);
            } catch (e) {}
        }
        let plantaoInfoEditando = null; // chave da escala com o textarea aberto, ou null
        function toggleEditarInfoEscala(key) {
            plantaoInfoEditando = (plantaoInfoEditando === key) ? null : key;
            renderPlantaoInfoEscala();
        }
        function salvarInfoEscala(key) {
            const ta = document.getElementById(`plantaoInfoInput-${key}`);
            plantaoInfoEscala[key] = ta ? ta.value.trim() : '';
            saveLocalSetting(`${appId}-plantao-info-escala`, JSON.stringify(plantaoInfoEscala));
            pushCloudSettings();
            plantaoInfoEditando = null;
            renderPlantaoInfoEscala();
        }
        // Uma linha que começa com seta (➡️, →, -> ou =>) vira um "card de dica" destacado (fundo
        // colorido da escala + ícone de seta) em vez de texto corrido — deixa a regra principal
        // (ex.: "Tolerância: 9h30 | Distribuição: 9h20") separada visualmente da dica/consequência
        // (ex.: "Chegue antes pra garantir suas oportunidades"), sem precisar de 2 campos rígidos —
        // o diretor só digita a seta na frente da linha que quer destacar.
        function renderTextoInfoEscala(texto, escalaDef) {
            if (!texto) return '<p class="text-xs italic text-slate-600">Sem observações — clique pra adicionar</p>';
            const SETA_RE = /^(➡️|➡|→|->|=>)\s*/;
            return texto.split('\n').filter(l => l.trim()).map(linha => {
                const trimmed = linha.trim();
                if (SETA_RE.test(trimmed)) {
                    const limpo = trimmed.replace(SETA_RE, '');
                    return `
                        <div class="flex items-start gap-2 mt-2 ${escalaDef.bg} rounded-lg px-2.5 py-2">
                            <i class="fa-solid fa-arrow-right ${escalaDef.text} text-[10px] mt-0.5 shrink-0"></i>
                            <span class="text-xs text-slate-200 leading-snug">${limpo}</span>
                        </div>`;
                }
                return `<p class="text-sm text-slate-200 font-semibold leading-snug">${trimmed}</p>`;
            }).join('');
        }
        function renderPlantaoInfoEscala() {
            const el = document.getElementById('plantaoInfoEscalaList');
            if (!el) return;
            el.innerHTML = ESCALAS_PLANTAO_DEF.map(e => {
                if (plantaoInfoEditando === e.key) {
                    return `
                        <div class="border-l-2 ${e.border} pl-3" onclick="event.stopPropagation()">
                            <div class="flex items-center gap-1.5 mb-1.5">
                                <i class="fa-solid ${e.icon} ${e.text} text-sm"></i>
                                <span class="text-xs font-extrabold uppercase ${e.text}">${e.label}</span>
                            </div>
                            <textarea id="plantaoInfoInput-${e.key}" rows="4" placeholder="Ex.: Tolerância: 9h30 | Distribuição: 9h20&#10;➡️ Chegue antes para garantir suas oportunidades." class="w-full bg-slate-950 border border-slate-800 text-xs rounded-lg px-2.5 py-2 text-slate-200 outline-none focus:border-brand-500 transition resize-none">${plantaoInfoEscala[e.key] || ''}</textarea>
                            <button onclick="salvarInfoEscala('${e.key}')" class="mt-1.5 text-xs font-bold text-brand-400 hover:text-brand-300 transition">Salvar</button>
                        </div>`;
                }
                return `
                    <div class="border-l-2 ${e.border} pl-3 cursor-pointer group" onclick="toggleEditarInfoEscala('${e.key}')">
                        <div class="flex items-center gap-1.5 mb-1.5">
                            <i class="fa-solid ${e.icon} ${e.text} text-sm"></i>
                            <span class="text-xs font-extrabold uppercase ${e.text}">${e.label}</span>
                            <i class="fa-solid fa-pen text-[10px] text-slate-600 group-hover:text-slate-400 ml-auto"></i>
                        </div>
                        ${renderTextoInfoEscala(plantaoInfoEscala[e.key], e)}
                    </div>`;
            }).join('');
        }
        // Capacidade máxima por escala — era fixa (Diamond=3/Roleta=2/Represados=1), agora
        // editável pelo diretor no modal "Capacidade das Escalas". Reduzir a capacidade abaixo do
        // que já está preenchido num dia NÃO remove ninguém da fila (evita perder dado real) — só
        // trava novas adições e o contador mostra "4/3 vagas" até alguém tirar manualmente.
        let vagasPorEscala = { diamond: 3, roleta: 2, represados: 1 };
        function loadVagasPorEscala() {
            try {
                const saved = JSON.parse(localStorage.getItem(`${appId}-vagas-por-escala`) || 'null');
                if (saved && typeof saved === 'object') vagasPorEscala = Object.assign({ diamond: 3, roleta: 2, represados: 1 }, saved);
            } catch (e) {}
        }
        // Rascunho editado no modal; só vira definitivo no Salvar.
        let plantaoEscalasRascunho = null;
        function abrirPlantaoVagasModal() {
            plantaoEscalasRascunho = plantaoEscalasCfg.map(e => Object.assign({ vagas: vagasPorEscala[e.key] }, e));
            renderPlantaoEscalasEditor();
            document.getElementById('plantaoVagasModal').classList.remove('hidden');
        }
        function renderPlantaoEscalasEditor() {
            const el = document.getElementById('plantaoEscalasEditor');
            if (!el) return;
            const r = plantaoEscalasRascunho;
            el.innerHTML = r.map((e, i) => {
                const c = PLANTAO_CORES.includes(e.cor) ? e.cor : 'violet';
                const temDados = Object.values(escalasPlantao[e.key] || {}).some(f => f && f.length);
                return `<div class="flex items-center gap-2 bg-slate-950/60 border border-${c}-500/30 rounded-xl px-3 py-2">
                    <div class="h-8 w-8 rounded-lg bg-${c}-500/15 text-${c}-400 flex items-center justify-center shrink-0"><i class="fa-solid ${e.icon}"></i></div>
                    <input value="${(e.label || '').replace(/"/g, '&quot;')}" placeholder="Nome da escala" oninput="plantaoEscalasRascunho[${i}].label=this.value" class="flex-1 min-w-[110px] bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm font-bold text-slate-100 outline-none focus:border-brand-500">
                    <select onchange="plantaoEscalasRascunho[${i}].cor=this.value; renderPlantaoEscalasEditor()" title="Cor" class="bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1.5 text-xs text-${c}-300">${PLANTAO_CORES.map(x => `<option value="${x}" ${x === c ? 'selected' : ''}>${x}</option>`).join('')}</select>
                    <select onchange="plantaoEscalasRascunho[${i}].icon=this.value; renderPlantaoEscalasEditor()" title="Ícone" class="bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1.5 text-xs text-slate-300">${PLANTAO_ICONES.map(x => `<option value="${x}" ${x === e.icon ? 'selected' : ''}>${x.replace('fa-', '')}</option>`).join('')}</select>
                    <label class="flex items-center gap-1 text-[10px] text-slate-500 shrink-0">vagas <input type="number" min="0" value="${e.vagas}" onchange="plantaoEscalasRascunho[${i}].vagas=Math.max(0, parseInt(this.value,10)||0)" class="w-14 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-slate-200 text-center"></label>
                    <div class="flex flex-col gap-0.5 shrink-0"><button onclick="plantaoMoverEscala(${i},-1)" ${i === 0 ? 'disabled' : ''} class="text-slate-500 hover:text-slate-200 disabled:opacity-20 text-[10px]"><i class="fa-solid fa-chevron-up"></i></button><button onclick="plantaoMoverEscala(${i},1)" ${i === r.length - 1 ? 'disabled' : ''} class="text-slate-500 hover:text-slate-200 disabled:opacity-20 text-[10px]"><i class="fa-solid fa-chevron-down"></i></button></div>
                    <button onclick="plantaoRemoverEscala(${i})" title="${temDados ? 'Remover (os dias já escalados ficam guardados)' : 'Remover'}" class="text-slate-600 hover:text-rose-400 shrink-0"><i class="fa-solid fa-trash text-xs"></i></button>
                </div>`;
            }).join('') || '<p class="text-xs text-slate-500">Nenhuma escala — adicione pelo menos uma.</p>';
        }
        function plantaoAdicionarEscala() {
            const usados = new Set(plantaoEscalasRascunho.map(e => e.key));
            let key = 'escala' + Date.now().toString(36).slice(-4);
            while (usados.has(key)) key += 'x';
            const cor = PLANTAO_CORES[plantaoEscalasRascunho.length % PLANTAO_CORES.length];
            plantaoEscalasRascunho.push({ key, label: '', cor, icon: 'fa-star', vagas: 2 });
            renderPlantaoEscalasEditor();
            setTimeout(() => { const inputs = document.querySelectorAll('#plantaoEscalasEditor input[placeholder]'); const u = inputs[inputs.length - 1]; if (u) u.focus(); }, 30);
        }
        function plantaoRemoverEscala(i) { plantaoEscalasRascunho.splice(i, 1); renderPlantaoEscalasEditor(); }
        function plantaoMoverEscala(i, d) { const j = i + d; if (j < 0 || j >= plantaoEscalasRascunho.length) return; const t = plantaoEscalasRascunho[i]; plantaoEscalasRascunho[i] = plantaoEscalasRascunho[j]; plantaoEscalasRascunho[j] = t; renderPlantaoEscalasEditor(); }
        function fecharPlantaoVagasModal() {
            document.getElementById('plantaoVagasModal').classList.add('hidden');
        }
        function salvarVagasPorEscala() {
            const r = (plantaoEscalasRascunho || []).map(e => Object.assign({}, e, { label: (e.label || '').trim() }));
            if (!r.length) { showToast('Deixe pelo menos uma escala.', true); return; }
            if (r.some(e => !e.label)) { showToast('Toda escala precisa de um nome.', true); return; }
            r.forEach(e => { vagasPorEscala[e.key] = Math.max(0, parseInt(e.vagas, 10) || 0); });
            plantaoEscalasCfg = r.map(e => ({ key: e.key, label: e.label, cor: e.cor, icon: e.icon }));
            savePlantaoEscalasCfg();
            fecharPlantaoVagasModal();
            renderPlantoes();
            renderPlantaoInfoEscala();
            showToast('Escalas salvas.');
        }

        let plantaoSemanaRef = new Date();
        let plantaoModalEscala = null; // chave da escala aberta no modal, ou null
        let plantaoModalIso = null; // 'YYYY-MM-DD' do dia aberto no modal, ou null

        function mudarSemanaPlantao(delta) {
            plantaoSemanaRef = delta === 0
                ? new Date()
                : new Date(plantaoSemanaRef.getFullYear(), plantaoSemanaRef.getMonth(), plantaoSemanaRef.getDate() + delta * 7);
            renderPlantoes();
        }

        function plantaoDataISO(ano, mesIdx, dia) {
            return `${ano}-${String(mesIdx + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        }

        // Abre o modal de edição de UMA escala num dia específico (clique num bloco da coluna).
        function abrirPlantaoDiaModal(escalaKey, iso) {
            plantaoModalEscala = escalaKey;
            plantaoModalIso = iso;
            renderPlantaoDiaModalConteudo();
            document.getElementById('plantaoDiaModal').classList.remove('hidden');
        }
        function fecharPlantaoDiaModal() {
            plantaoModalEscala = null;
            plantaoModalIso = null;
            document.getElementById('plantaoDiaModal').classList.add('hidden');
        }

        // Preenche o modal com o título (data + escala), a fila editável (avatar + nome + status
        // Confirmado/Aguardando clicável + ▲▼✕) e o select "+ Adicionar corretor" — some sozinho
        // quando as vagas daquela escala já estão completas.
        function renderPlantaoDiaModalConteudo() {
            const escalaKey = plantaoModalEscala, iso = plantaoModalIso;
            if (!escalaKey || !iso) return;
            const escalaDef = ESCALAS_PLANTAO_DEF.find(e => e.key === escalaKey);
            const [ano, mes, dia] = iso.split('-').map(Number);
            const dataObj = new Date(ano, mes - 1, dia);
            const tituloEl = document.getElementById('plantaoDiaModalTitulo');
            const subtituloEl = document.getElementById('plantaoDiaModalSubtitulo');
            if (tituloEl) tituloEl.textContent = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano} — ${DOW_PT[dataObj.getDay()]}`;
            if (subtituloEl) subtituloEl.textContent = `Escala ${escalaDef.label}`;

            const vagas = vagasPorEscala[escalaKey];
            const fila = escalasPlantao[escalaKey][iso] || [];
            const nomesNaFila = fila.map(p => p.nome);
            const disponiveis = getActiveCorretores().filter(n => !nomesNaFila.includes(n));
            const podeAdicionar = fila.length < vagas;

            const conteudoEl = document.getElementById('plantaoDiaModalConteudo');
            if (!conteudoEl) return;
            conteudoEl.innerHTML = `
                <div class="flex flex-col gap-1.5">
                    ${fila.length ? fila.map((pessoa, idx) => `
                        <div class="flex items-center gap-2 bg-slate-950/50 border border-slate-800/70 rounded-lg px-2.5 py-1.5">
                            <span class="${escalaDef.text} font-extrabold text-xs w-6 shrink-0">${idx + 1}º</span>
                            ${corretorAvatarInner(pessoa.nome, 'h-6 w-6', 'text-[9px]', 'shrink-0')}
                            <span class="flex-1 min-w-0 truncate text-sm font-semibold text-slate-200">${pessoa.nome}</span>
                            <button onclick="togglePlantaoConfirmado('${escalaKey}','${iso}',${idx})" class="text-[9px] font-bold px-1.5 py-1 rounded transition shrink-0 ${pessoa.confirmado ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'}">${pessoa.confirmado ? 'Confirmado' : 'Aguardando'}</button>
                            <button onclick="moverPlantaoDia('${escalaKey}','${iso}', ${idx}, -1)" ${idx === 0 ? 'disabled' : ''} class="h-7 w-7 shrink-0 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"><i class="fa-solid fa-chevron-up text-[10px]"></i></button>
                            <button onclick="moverPlantaoDia('${escalaKey}','${iso}', ${idx}, 1)" ${idx === fila.length - 1 ? 'disabled' : ''} class="h-7 w-7 shrink-0 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"><i class="fa-solid fa-chevron-down text-[10px]"></i></button>
                            <button onclick="removerPlantaoDia('${escalaKey}','${iso}', ${idx})" class="h-7 w-7 shrink-0 rounded text-rose-400 hover:text-rose-300 transition"><i class="fa-solid fa-xmark text-[10px]"></i></button>
                        </div>`).join('') : '<p class="text-xs text-slate-500 italic px-1">Nenhum corretor na fila ainda.</p>'}
                </div>
                <p class="text-[10px] text-slate-500 mt-2">${fila.length}/${vagas} vagas preenchidas</p>
                ${podeAdicionar ? `
                <div class="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800/60">
                    <select id="plantaoAddSelect" class="flex-1 bg-slate-950 border border-slate-800 text-xs rounded-lg px-2.5 py-2 text-slate-300 outline-none cursor-pointer focus:border-brand-500 transition">
                        <option value="">+ Adicionar corretor à fila...</option>
                        ${disponiveis.map(n => `<option value="${n}">${n}</option>`).join('')}
                    </select>
                    <button onclick="adicionarPlantaoDia('${escalaKey}','${iso}')" class="text-xs font-bold text-white bg-brand-500 hover:bg-brand-600 transition px-3 py-2 rounded-lg shrink-0">Adicionar</button>
                </div>` : `<p class="text-[10px] text-amber-400 mt-3 pt-3 border-t border-slate-800/60 flex items-center gap-1.5"><i class="fa-solid fa-circle-check"></i> Vagas completas pra essa escala nesse dia.</p>`}`;
        }

        function togglePlantaoConfirmado(escalaKey, iso, idx) {
            const fila = escalasPlantao[escalaKey][iso];
            if (!fila || !fila[idx]) return;
            fila[idx].confirmado = !fila[idx].confirmado;
            saveEscalasPlantao();
            renderPlantaoDiaModalConteudo();
            renderPlantoes();
        }

        function adicionarPlantaoDia(escalaKey, iso) {
            const sel = document.getElementById('plantaoAddSelect');
            const nome = sel ? sel.value : '';
            if (!nome) return;
            if (!escalasPlantao[escalaKey][iso]) escalasPlantao[escalaKey][iso] = [];
            const fila = escalasPlantao[escalaKey][iso];
            if (fila.length >= vagasPorEscala[escalaKey]) { showToast('Vagas completas pra essa escala nesse dia.', true); return; }
            if (!fila.some(p => p.nome === nome)) fila.push({ nome, confirmado: false });
            saveEscalasPlantao();
            renderPlantaoDiaModalConteudo();
            renderPlantoes();
        }

        function removerPlantaoDia(escalaKey, iso, idx) {
            const fila = escalasPlantao[escalaKey][iso];
            if (!fila) return;
            fila.splice(idx, 1);
            if (fila.length === 0) delete escalasPlantao[escalaKey][iso];
            saveEscalasPlantao();
            renderPlantaoDiaModalConteudo();
            renderPlantoes();
        }

        function moverPlantaoDia(escalaKey, iso, idx, direcao) {
            const fila = escalasPlantao[escalaKey][iso];
            if (!fila) return;
            const novoIdx = idx + direcao;
            if (novoIdx < 0 || novoIdx >= fila.length) return;
            [fila[idx], fila[novoIdx]] = [fila[novoIdx], fila[idx]];
            saveEscalasPlantao();
            renderPlantaoDiaModalConteudo();
            renderPlantoes();
        }

        // Um bloco de escala dentro da coluna do dia: nome da escala + "X/Y vagas", e uma linha por
        // vaga (preenchida = avatar+nome+status; vazia = "–"). Clicar em qualquer lugar do bloco
        // abre o modal de edição dessa escala nesse dia.
        // Versão "mais visível": avatar e texto maiores, e quando a escala está totalmente vazia
        // mostra um estado grande (ícone + "Sem escala" + travessão) em vez de uma linha "–" por
        // vaga — muito mais fácil de bater o olho e ver quem está de plantão sem precisar abrir o
        // modal.
        // Versão compacta: sem badge de Confirmado/Aguardando na grade (fica só no modal de edição,
        // que continua mostrando/alternando isso normalmente) — ícone da escala num círculo colorido
        // + fração compacta "X/Y" no lugar de "X/Y vagas".
        function plantaoEscalaBlocoHTML(escalaDef, iso) {
            const vagas = vagasPorEscala[escalaDef.key];
            const fila = escalasPlantao[escalaDef.key][iso] || [];
            return `
                <div class="px-3 py-2.5 cursor-pointer hover:bg-slate-800/30 transition" onclick="abrirPlantaoDiaModal('${escalaDef.key}', '${iso}')">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-1.5">
                            <div class="h-5 w-5 rounded-full ${escalaDef.bg} flex items-center justify-center shrink-0">
                                <i class="fa-solid ${escalaDef.icon} ${escalaDef.text} text-[9px]"></i>
                            </div>
                            <span class="text-[10px] font-extrabold uppercase tracking-wide ${escalaDef.text}">${escalaDef.label}</span>
                        </div>
                        <span class="text-[10px] font-bold text-slate-400">${fila.length}/${vagas}</span>
                    </div>
                    ${fila.length ? `
                    <div class="flex flex-col gap-1.5">
                        ${fila.map((pessoa, idx) => `
                            <div class="flex items-start gap-1.5 min-w-0">
                                <span class="text-[10px] font-extrabold ${escalaDef.text} w-4 shrink-0 pt-0.5">${idx + 1}º</span>
                                ${corretorAvatarInner(pessoa.nome, 'h-5 w-5', 'text-[8px]', 'shrink-0')}
                                <span class="text-xs font-semibold text-slate-100 leading-tight break-words">${pessoa.nome}</span>
                            </div>`).join('')}
                    </div>` : `
                    <p class="text-[10px] text-slate-600 italic pl-1">Sem escala</p>`}
                </div>`;
        }

        // Grade semanal (segunda a domingo, mesma convenção do resto do BI) — 7 colunas lado a lado
        // (rola na horizontal em telas estreitas), cada coluna com as 3 escalas empilhadas. Ao lado,
        // uma barra fixa com o resumo de vagas da semana, notas por escala e total de plantonistas.
        // Abaixo da grade, um resumo com quantas vezes cada corretor apareceu em cada escala.
        // IMPRIMIR a escala da semana em foco: monta uma tabela preto-e-branco (escalas × dias) na
        // #plantaoPrintArea e chama window.print() — o CSS @media print esconde o resto e força
        // paisagem. Legenda: ✔ confirmado · ○ aguardando.
        function imprimirPlantao() {
            rebuildEscalasPlantaoDef();
            const ref = new Date(plantaoSemanaRef); ref.setHours(0, 0, 0, 0);
            const dow = ref.getDay();
            const segunda = new Date(ref); segunda.setDate(ref.getDate() - ((dow === 0) ? 6 : (dow - 1)));
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'];
            const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(segunda); d.setDate(segunda.getDate() + i); return { d, iso: plantaoDataISO(d.getFullYear(), d.getMonth(), d.getDate()), nome: DIAS[i], hoje: d.getTime() === hoje.getTime() }; });
            const domingo = dias[6].d;
            const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const linhas = ESCALAS_PLANTAO_DEF.map(e => `<tr>
                <td class="pp-escala">${esc(e.label)}<small>${vagasPorEscala[e.key] || 0} vaga(s)/dia</small></td>
                ${dias.map(x => { const fila = (escalasPlantao[e.key] || {})[x.iso] || []; return `<td>${fila.length ? `<ol>${fila.map(p => `<li class="${p.confirmado ? '' : 'pp-aguard'}">${p.confirmado ? '✔' : '○'} ${esc(p.nome)}</li>`).join('')}</ol>` : '<span class="pp-vazio">—</span>'}</td>`; }).join('')}
            </tr>`).join('');
            const infos = ESCALAS_PLANTAO_DEF.filter(e => (plantaoInfoEscala[e.key] || '').trim()).map(e => `<div class="pp-bloco"><h3>${esc(e.label)}</h3>${(plantaoInfoEscala[e.key] || '').split('\n').filter(l => l.trim()).map(l => `<p>${esc(l.trim().replace(/^(➡️|➡|→|->|=>)\s*/, '→ '))}</p>`).join('')}</div>`).join('');
            const area = document.getElementById('plantaoPrintArea');
            area.innerHTML = `
                <p class="pp-titulo">AUDAZ — Escala de Plantão</p>
                <p class="pp-sub">Semana de ${formatDate(segunda)} a ${formatDate(domingo)} · impresso em ${formatDate(hoje)} · ✔ confirmado · ○ aguardando confirmação</p>
                <table>
                    <thead><tr><th>Escala</th>${dias.map(x => `<th class="${x.hoje ? 'pp-hoje' : ''}">${x.nome} ${String(x.d.getDate()).padStart(2, '0')}/${String(x.d.getMonth() + 1).padStart(2, '0')}${x.hoje ? ' (hoje)' : ''}</th>`).join('')}</tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
                ${infos ? `<div class="pp-info"><h3>Informações importantes</h3>${infos}</div>` : ''}
                <p class="pp-rodape">AUDAZ BI · Plantões · gerado automaticamente</p>`;
            area.classList.remove('hidden');
            const limpar = () => { area.classList.add('hidden'); window.removeEventListener('afterprint', limpar); };
            window.addEventListener('afterprint', limpar);
            setTimeout(() => window.print(), 50);
        }

        function renderPlantoes() {
            rebuildEscalasPlantaoDef();
            const ref = new Date(plantaoSemanaRef); ref.setHours(0, 0, 0, 0);
            const dow = ref.getDay();
            const desdeSegunda = (dow === 0) ? 6 : (dow - 1);
            const segunda = new Date(ref); segunda.setDate(ref.getDate() - desdeSegunda);
            const domingo = new Date(segunda); domingo.setDate(segunda.getDate() + 6);
            const labelEl = document.getElementById('plantaoSemanaLabel');
            if (labelEl) labelEl.textContent = `${formatDate(segunda)} a ${formatDate(domingo)}`;

            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            const DIAS_NOMES = ['SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO'];

            const gridEl = document.getElementById('plantoesSemanaGrid');
            if (gridEl) {
                gridEl.innerHTML = Array.from({ length: 7 }, (_, i) => {
                    const dataObj = new Date(segunda); dataObj.setDate(segunda.getDate() + i);
                    const iso = plantaoDataISO(dataObj.getFullYear(), dataObj.getMonth(), dataObj.getDate());
                    const ehHoje = dataObj.getTime() === hoje.getTime();
                    return `
                        <div class="bg-slate-900/40 rounded-2xl border-2 ${ehHoje ? 'border-brand-500' : 'border-slate-800'} flex flex-col overflow-hidden">
                            <div class="px-3 py-2 border-b border-slate-800/70 flex items-center justify-between">
                                <div>
                                    <p class="text-xs font-extrabold ${ehHoje ? 'text-brand-400' : 'text-slate-200'} uppercase tracking-wide">${DIAS_NOMES[i]}</p>
                                    <p class="text-[10px] text-slate-500">${String(dataObj.getDate()).padStart(2, '0')}/${String(dataObj.getMonth() + 1).padStart(2, '0')}</p>
                                </div>
                                ${ehHoje
                                    ? '<span class="text-[9px] font-extrabold text-white bg-brand-500 px-2 py-0.5 rounded-full shrink-0">HOJE</span>'
                                    : '<i class="fa-regular fa-calendar text-slate-600 text-sm"></i>'}
                            </div>
                            <div class="flex-1 flex flex-col divide-y divide-slate-800/60">
                                ${ESCALAS_PLANTAO_DEF.map(e => plantaoEscalaBlocoHTML(e, iso)).join('')}
                            </div>
                        </div>`;
                }).join('');
            }

            renderPlantaoTotalPlantonistas(segunda);
            renderPlantaoInfoEscala();
            renderPlantaoResumoSemana(segunda);
        }

        // Barra lateral "Total de Plantonistas": corretores distintos escalados em QUALQUER escala,
        // em QUALQUER dia da semana exibida.
        function renderPlantaoTotalPlantonistas(segunda) {
            const el = document.getElementById('plantaoTotalPlantonistas');
            if (!el) return;
            const nomes = new Set();
            for (let i = 0; i < 7; i++) {
                const d = new Date(segunda); d.setDate(segunda.getDate() + i);
                const iso = plantaoDataISO(d.getFullYear(), d.getMonth(), d.getDate());
                ESCALAS_PLANTAO_DEF.forEach(e => (escalasPlantao[e.key][iso] || []).forEach(p => nomes.add(p.nome)));
            }
            el.textContent = nomes.size;
        }

        // Quantas vezes cada corretor apareceu em cada escala NA SEMANA exibida (segunda a domingo)
        // — conta toda entrada na fila, independente de estar Confirmado ou Aguardando. Só lista
        // quem apareceu pelo menos 1 vez, pra não poluir com uma lista de zeros.
        function renderPlantaoResumoSemana(segunda) {
            const tableEl = document.getElementById('plantaoResumoSemanaTable');
            if (!tableEl) return;
            const contagem = {};
            for (let i = 0; i < 7; i++) {
                const d = new Date(segunda); d.setDate(segunda.getDate() + i);
                const iso = plantaoDataISO(d.getFullYear(), d.getMonth(), d.getDate());
                ESCALAS_PLANTAO_DEF.forEach(e => {
                    const fila = escalasPlantao[e.key][iso] || [];
                    fila.forEach(pessoa => {
                        if (!contagem[pessoa.nome]) { contagem[pessoa.nome] = {}; ESCALAS_PLANTAO_DEF.forEach(x => { contagem[pessoa.nome][x.key] = 0; }); }
                        contagem[pessoa.nome][e.key]++;
                    });
                });
            }
            const nomes = Object.keys(contagem).sort((a, b) => {
                const totalA = ESCALAS_PLANTAO_DEF.reduce((s, e) => s + (contagem[a][e.key] || 0), 0);
                const totalB = ESCALAS_PLANTAO_DEF.reduce((s, e) => s + (contagem[b][e.key] || 0), 0);
                return totalB - totalA || a.localeCompare(b, 'pt-BR');
            });
            if (!nomes.length) {
                tableEl.innerHTML = '<tr><td class="text-xs text-slate-500 italic py-4">Ninguém escalado nessa semana ainda.</td></tr>';
                return;
            }
            const head = `<thead><tr class="border-b border-slate-800">
                <th class="text-left py-2 pr-3 text-slate-500 text-[10px] uppercase font-bold tracking-wide">Corretor</th>
                ${ESCALAS_PLANTAO_DEF.map(e => `<th class="text-center py-2 px-3 ${e.text} text-[10px] uppercase font-bold tracking-wide">${e.label}</th>`).join('')}
                <th class="text-center py-2 pl-3 text-slate-300 text-[10px] uppercase font-bold tracking-wide">Total</th>
            </tr></thead>`;
            const body = nomes.map(nome => {
                const c = contagem[nome];
                const total = ESCALAS_PLANTAO_DEF.reduce((s, e) => s + (c[e.key] || 0), 0);
                return `
                    <tr class="border-b border-slate-800/50">
                        <td class="py-2.5 pr-3">
                            <div class="flex items-center gap-2 min-w-0">
                                ${corretorAvatarInner(nome, 'h-7 w-7', 'text-[9px]', 'shrink-0')}
                                <span class="text-sm font-semibold text-slate-200 truncate">${nome}</span>
                            </div>
                        </td>
                        ${ESCALAS_PLANTAO_DEF.map(e => `<td class="text-center py-2.5 px-3 font-bold ${c[e.key] ? e.text : 'text-slate-700'}">${c[e.key] || 0}</td>`).join('')}
                        <td class="text-center py-2.5 pl-3 font-extrabold text-slate-100">${total}</td>
                    </tr>`;
            }).join('');
            tableEl.innerHTML = head + `<tbody>${body}</tbody>`;
        }

        // Oculta / mostra a barra lateral (mais espaço para o painel). Persiste no navegador.
        function toggleSidebar() {
            const sb = document.getElementById('sidebar');
            if (!sb) return;
            const hide = sb.style.display !== 'none';
            sb.style.display = hide ? 'none' : ''; // inline vence o conflito hidden x flex
            saveLocalSetting(`${appId}-sidebar-hidden`, hide ? '1' : '0');
        }

        // Boot: painel é PÚBLICO. Firebase entra só para ler configs e permitir edição via senha de admin.
        window.onload = function() { initFirebaseAdmin(); };

        function bootApp() {
            restoreRefreshRate();
            loadCorretorRoster();
            loadOrganograma();
            loadMetasMensais();
            loadRankingsMetas();
            loadMetasPorCorretor();
            loadMetasPorEquipe();
            loadMesesComerciais();
            loadEscalasPlantao();
            loadVagasPorEscala();
            loadPlantaoInfoEscala();
            loadPlantaoEscalasCfg();
            loadIpcMesesCustom();
            // TV bootando direto na Tela: abra o BI com ?tela=1 ou #tela e ele já entra no modo
            // de exibição (os dados chegam depois e o applyFilters redesenha a Tela sozinho).
            try {
                const qs = new URLSearchParams(location.search);
                if (qs.get('tela') === '1' || location.hash === '#tela') setTimeout(() => switchView('tela'), 0);
                else switchView('organograma');
            } catch (e) {}
            // Celular/tablet (12/10/2026): a barra lateral ocupava a 1ª tela inteira e empurrava o
            // "estou batendo?" pra baixo — agora começa escondida em telas < 1024px (abre no ☰),
            // a menos que a pessoa tenha escolhido deixá-la aberta neste aparelho.
            // Mesmo motivo: no celular os filtros começam recolhidos (botão "Mostrar filtros" abre).
            if (window.innerWidth < 1024 && !filtersBodyHidden) toggleFiltersBody();
            const sidebarPref = localStorage.getItem(`${appId}-sidebar-hidden`);
            if (sidebarPref === '1' || (sidebarPref === null && window.innerWidth < 1024)) {
                const sb = document.getElementById('sidebar');
                if (sb) sb.style.display = 'none';
            }
            const savedVendasMode = localStorage.getItem(`${appId}-vendas-mode`);
            if (savedVendasMode === 'gerais' || savedVendasMode === 'finalizadas') vendasMode = savedVendasMode;
            updateVendasModeUI();
            const savedUrl = localStorage.getItem(`${appId}-gsheets-url`) || googleSheetsUrl;
            if (savedUrl) {
                googleSheetsUrl = savedUrl;
                renderSheetUrlField();
                fetchFromGoogleSheets(savedUrl);
            } else {
                showEmptyState();
            }
            // Agenda de Visitas é opcional — só busca se o diretor já tiver configurado o link.
            const savedAgendaUrl = localStorage.getItem(`${appId}-agenda-gsheets-url`) || agendaGsheetsUrl;
            if (savedAgendaUrl) {
                agendaGsheetsUrl = savedAgendaUrl;
                renderSheetUrlField();
                fetchAgendaFromGoogleSheets(savedAgendaUrl);
            }
            // Prospecção não tem link — só carrega os CSVs (um por mês comercial) salvos
            // localmente (o Firestore também pode trazer meses mais novos depois, via applyCloudSettings).
            try {
                const savedProspeccaoPorMes = JSON.parse(localStorage.getItem(`${appId}-prospeccao-por-mes`) || '{}');
                Object.values(savedProspeccaoPorMes).forEach(csvText => applyProspeccaoCsvText(csvText, { silent: true }));
            } catch (e) { console.warn(e); }
            renderProspeccaoMesesList();
        }

        // ================= FIREBASE: LOGIN + SINCRONIZAÇÃO DE CONFIGURAÇÕES =================
        // Dados continuam vindo do Google Sheets. O Firebase guarda apenas as CONFIGURAÇÕES
        // compartilhadas (corretores ativos/inativos, metas, modo, URL) e exige login.
        const firebaseConfig = {
            apiKey: "AIzaSyC5aXpCt-bCN5wr_DfPBAhxOCJy8LDTKWo",
            authDomain: "audazbi.firebaseapp.com",
            projectId: "audazbi",
            storageBucket: "audazbi.firebasestorage.app",
            messagingSenderId: "754247262325",
            appId: "1:754247262325:web:695e1e308f464eb7e4583c",
            measurementId: "G-YPSG2D1WXV"
        };
        let fbDb = null, cloudUnsub = null, appBooted = false, applyingCloud = false;
        let isDiretor = false; // true só depois de login via Firebase Auth — controla quem pode editar

        function initFirebaseAdmin() {
            if (typeof firebase === 'undefined' || !firebase.initializeApp) {
                console.warn('Firebase indisponível — abrindo sem sincronização.');
                if (!appBooted) { appBooted = true; bootApp(); }
                return;
            }
            try {
                if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
                fbDb = firebase.firestore();
                if (firebase.auth) {
                    firebase.auth().onAuthStateChanged(function (user) {
                        isDiretor = !!user;
                        updateAuthUI(user);
                    });
                }
            } catch (e) {
                console.warn('Erro ao iniciar Firebase:', e);
                if (!appBooted) { appBooted = true; bootApp(); }
                return;
            }
            // Lê as configurações compartilhadas do banco e abre o painel.
            startCloudSync().then(function () {
                if (!appBooted) { appBooted = true; bootApp(); }
            });
        }

        // ===== LOGIN DE DIRETOR (Firebase Auth) =====
        // O painel é público pra visualização; só quem faz login consegue editar
        // (metas, corretores, planilha, etc.) — controlado pelas regras do Firestore + isDiretor.
        function toggleAuthModal() {
            const m = document.getElementById('authModal');
            m.classList.toggle('hidden');
            if (!m.classList.contains('hidden')) {
                const errorEl = document.getElementById('authErrorMsg');
                errorEl.classList.add('hidden');
                errorEl.textContent = '';
                const user = firebase.auth && firebase.auth().currentUser;
                document.getElementById('authLoginForm').classList.toggle('hidden', !!user);
                document.getElementById('authLoggedInView').classList.toggle('hidden', !user);
                if (user) document.getElementById('authLoggedEmail').textContent = user.email;
            }
        }

        function doAuthLogin() {
            const email = document.getElementById('authEmailInput').value.trim();
            const senha = document.getElementById('authPasswordInput').value;
            const errorEl = document.getElementById('authErrorMsg');
            errorEl.classList.add('hidden');
            if (!email || !senha) {
                errorEl.textContent = 'Preencha e-mail e senha.';
                errorEl.classList.remove('hidden');
                return;
            }
            const btn = document.getElementById('authLoginBtn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...';
            firebase.auth().signInWithEmailAndPassword(email, senha)
                .then(function () {
                    document.getElementById('authPasswordInput').value = '';
                    toggleAuthModal();
                    showToast('Login feito — agora você pode editar o painel.');
                })
                .catch(function (err) {
                    console.warn('Erro de login:', err);
                    errorEl.textContent = 'E-mail ou senha incorretos.';
                    errorEl.classList.remove('hidden');
                })
                .finally(function () {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Entrar';
                });
        }

        function doAuthLogout() {
            firebase.auth().signOut().then(function () {
                toggleAuthModal();
                showToast('Você saiu — o painel continua visível, mas a edição foi bloqueada.');
            });
        }

        // Mostra/esconde os controles de edição conforme o login. A visualização nunca é afetada.
        function updateAuthUI(user) {
            const nameEl = document.getElementById('authStatusName');
            const roleEl = document.getElementById('authStatusRole');
            const iconEl = document.getElementById('authAvatarIcon');
            const btnEl = document.getElementById('authActionBtn');
            if (user) {
                nameEl.textContent = 'Diretoria Executiva';
                roleEl.textContent = 'Acesso Administrativo';
                iconEl.className = 'fa-solid fa-user-tie text-brand-400';
                btnEl.title = 'Sair da conta';
                btnEl.innerHTML = '<i class="fa-solid fa-right-from-bracket text-xs"></i>';
                btnEl.onclick = doAuthLogout;
            } else {
                nameEl.textContent = 'Visitante';
                roleEl.textContent = 'Somente leitura';
                iconEl.className = 'fa-solid fa-user text-slate-300';
                btnEl.title = 'Entrar como diretor';
                btnEl.innerHTML = '<i class="fa-solid fa-right-to-bracket text-xs"></i>';
                btnEl.onclick = toggleAuthModal;
            }
            // Botão de acesso diretor no topo — sempre visível, mesmo com a sidebar oculta.
            const headerBtn = document.getElementById('headerAuthBtn');
            const headerIcon = document.getElementById('headerAuthIcon');
            const headerLabel = document.getElementById('headerAuthLabel');
            if (headerBtn && headerIcon && headerLabel) {
                if (user) {
                    headerBtn.title = 'Diretor conectado — clique para sair';
                    headerBtn.classList.add('border-brand-500/40', 'text-brand-400', 'bg-brand-500/10');
                    headerIcon.className = 'fa-solid fa-user-tie text-xs';
                    headerLabel.textContent = 'Diretor Conectado';
                } else {
                    headerBtn.title = 'Entrar como diretor';
                    headerBtn.classList.remove('border-brand-500/40', 'text-brand-400', 'bg-brand-500/10');
                    headerIcon.className = 'fa-solid fa-user-shield text-xs';
                    headerLabel.textContent = 'Acesso Diretor';
                }
            }
            document.querySelectorAll('.diretor-only').forEach(function (el) {
                el.style.display = user ? '' : 'none';
            });
            document.querySelectorAll('.diretor-locked').forEach(function (el) {
                el.disabled = !user;
                el.classList.toggle('opacity-40', !user);
                el.classList.toggle('cursor-not-allowed', !user);
                if (!user) el.title = 'Entre como diretor pra editar';
            });
            renderSheetUrlField();
        }

        function startCloudSync() {
            return new Promise(function (resolve) {
                if (!fbDb) { resolve(); return; }
                let first = true;
                try {
                    cloudUnsub = fbDb.collection('config').doc('settings').onSnapshot(function (snap) {
                        if (snap.exists) {
                            applyCloudSettings(snap.data());
                        } else if (first) {
                            setTimeout(pushCloudSettings, 1500); // doc ainda não existe: semeia com o local
                        }
                        if (first) { first = false; resolve(); }
                        else if (appBooted) { reRenderAfterSettings(); }
                    }, function (err) { console.warn('Firestore snapshot erro:', err); if (first) { first = false; resolve(); } });
                } catch (e) { console.warn(e); resolve(); }
            });
        }

        function applyCloudSettings(data) {
            if (!data) return;
            applyingCloud = true;
            try {
                if (Array.isArray(data.orgChart)) { organograma = data.orgChart; saveLocalSetting(`${appId}-organograma`, JSON.stringify(organograma)); }
                if (Array.isArray(data.corretoresAdded)) { addedCorretores = data.corretoresAdded; saveLocalSetting(`${appId}-corretores-added`, JSON.stringify(addedCorretores)); }
                if (Array.isArray(data.corretoresInactive)) { inactiveCorretores = data.corretoresInactive; saveLocalSetting(`${appId}-corretores-inactive`, JSON.stringify(inactiveCorretores)); }
                if (data.corretorFotos && typeof data.corretorFotos === 'object') { corretorFotos = data.corretorFotos; saveLocalSetting(`${appId}-corretor-fotos`, JSON.stringify(corretorFotos)); preloadAllCorretorFotos(); }
                if (data.metasMensais && typeof data.metasMensais === 'object') { metasMensais = Object.assign({ vgv: 5000000, vendas: 20, analises: 100, aprovacoes: 60, prospeccao: 0, agendamentos: 0, compareceu: 0 }, data.metasMensais); saveLocalSetting(`${appId}-metas-mensais`, JSON.stringify(metasMensais)); }
                if (data.rankingsMetas && typeof data.rankingsMetas === 'object') { rankingsMetas = data.rankingsMetas; saveLocalSetting(`${appId}-rankings-metas`, JSON.stringify(rankingsMetas)); }
                if (data.metasPorCorretor && typeof data.metasPorCorretor === 'object') { metasPorCorretor = data.metasPorCorretor; saveLocalSetting(`${appId}-metas-corretor`, JSON.stringify(metasPorCorretor)); }
                if (data.metasPorEquipe && typeof data.metasPorEquipe === 'object') { metasPorEquipe = data.metasPorEquipe; saveLocalSetting(`${appId}-metas-equipe`, JSON.stringify(metasPorEquipe)); }
                if (data.vendasMode === 'gerais' || data.vendasMode === 'finalizadas') { vendasMode = data.vendasMode; saveLocalSetting(`${appId}-vendas-mode`, vendasMode); }
                if (typeof data.gsheetsUrl === 'string' && data.gsheetsUrl) { googleSheetsUrl = data.gsheetsUrl; saveLocalSetting(`${appId}-gsheets-url`, googleSheetsUrl); }
                if (typeof data.agendaGsheetsUrl === 'string' && data.agendaGsheetsUrl) { agendaGsheetsUrl = data.agendaGsheetsUrl; saveLocalSetting(`${appId}-agenda-gsheets-url`, agendaGsheetsUrl); }
                if (Array.isArray(data.mesesComerciais)) { mesesComerciais = data.mesesComerciais; saveLocalSetting(`${appId}-meses-comerciais`, JSON.stringify(mesesComerciais)); }
                if (data.escalasPlantao && typeof data.escalasPlantao === 'object') { escalasPlantao = Object.assign({ diamond: {}, roleta: {}, represados: {} }, data.escalasPlantao); saveLocalSetting(`${appId}-escalas-plantao`, JSON.stringify(escalasPlantao)); }
                if (data.vagasPorEscala && typeof data.vagasPorEscala === 'object') { vagasPorEscala = Object.assign({ diamond: 3, roleta: 2, represados: 1 }, data.vagasPorEscala); saveLocalSetting(`${appId}-vagas-por-escala`, JSON.stringify(vagasPorEscala)); }
                if (data.plantaoInfoEscala && typeof data.plantaoInfoEscala === 'object') { plantaoInfoEscala = Object.assign({ diamond: '', roleta: '', represados: '' }, data.plantaoInfoEscala); saveLocalSetting(`${appId}-plantao-info-escala`, JSON.stringify(plantaoInfoEscala)); }
                if (Array.isArray(data.plantaoEscalas) && data.plantaoEscalas.length) { plantaoEscalasCfg = data.plantaoEscalas.filter(e => e && e.key).map(e => ({ key: e.key, label: e.label || e.key, cor: e.cor || 'violet', icon: e.icon || 'fa-star' })); saveLocalSetting(`${appId}-plantao-escalas`, JSON.stringify(plantaoEscalasCfg)); }
                rebuildEscalasPlantaoDef();
                if (data.prospeccaoPorMes && typeof data.prospeccaoPorMes === 'object') {
                    const cloudMeses = data.prospeccaoPorMes;
                    // Remove localmente os meses que não existem mais na nuvem (outro dispositivo
                    // removeu enquanto este estava fechado).
                    Object.keys(prospeccaoPorMes).forEach(mes => { if (!(mes in cloudMeses)) delete prospeccaoPorMes[mes]; });
                    Object.keys(cloudMeses).forEach(mes => {
                        const csvText = cloudMeses[mes];
                        if (typeof csvText === 'string' && csvText) applyProspeccaoCsvText(csvText, { silent: true });
                    });
                    rebuildProspeccaoDataset();
                    saveProspeccaoLocal();
                }
            } catch (e) { console.warn(e); }
            applyingCloud = false;
        }

        function reRenderAfterSettings() {
            try {
                updateVendasModeUI();
                renderSheetUrlField();
                if (typeof renderOrganograma === 'function') renderOrganograma();
                if (typeof applyFilters === 'function' && dataset && dataset.length) applyFilters();
            } catch (e) {}
        }

        // Mostra o link real da planilha só pro diretor logado; pra qualquer outro visitante,
        // mascara o miolo do link (que identifica a planilha) — assim quem abrir o DevTools e
        // inspecionar o campo (mesmo com o botão de editar desabilitado) não leva o link pronto.
        function renderSheetUrlField() {
            const inp = document.getElementById('sheetUrlInput');
            if (inp) {
                if (isDiretor) {
                    inp.value = googleSheetsUrl || '';
                } else if (googleSheetsUrl) {
                    const u = googleSheetsUrl;
                    inp.value = u.length > 40 ? `${u.slice(0, 24)}••••••••••••••••••••${u.slice(-10)}` : '••••••••••••••••••••';
                } else {
                    inp.value = '';
                }
            }
            // Mesma mitigação de exposição do link, pro CSV da Agenda de Visitas.
            const inpAgenda = document.getElementById('agendaSheetUrlInput');
            if (inpAgenda) {
                if (isDiretor) {
                    inpAgenda.value = agendaGsheetsUrl || '';
                } else if (agendaGsheetsUrl) {
                    const u = agendaGsheetsUrl;
                    inpAgenda.value = u.length > 40 ? `${u.slice(0, 24)}••••••••••••••••••••${u.slice(-10)}` : '••••••••••••••••••••';
                } else {
                    inpAgenda.value = '';
                }
            }
        }

        let cloudSettingsSaveTimer = null;
        let cloudSettingsSaveQueue = Promise.resolve();

        function updateSettingsSyncStatus(state, message) {
            const container = document.getElementById('settingsSyncStatusContainer');
            const indicator = document.getElementById('settingsSyncIndicator');
            const text = document.getElementById('settingsSyncStatusText');
            if (!container || !indicator || !text) return;
            container.classList.remove('hidden');
            const styles = {
                saving: ['bg-amber-400 animate-pulse', 'text-amber-300'],
                saved: ['bg-emerald-400', 'text-emerald-300'],
                local: ['bg-amber-400', 'text-amber-300'],
                error: ['bg-rose-400 animate-pulse', 'text-rose-300']
            };
            const [dotClass, textClass] = styles[state] || styles.local;
            indicator.className = `h-1.5 w-1.5 rounded-full shrink-0 ${dotClass}`;
            text.className = `font-medium truncate ${textClass}`;
            text.textContent = message;
            container.title = message;
        }

        // Persiste as configurações no navegador e, quando o diretor está autenticado,
        // sincroniza uma única gravação após pequenas sequências de alterações.
        function pushCloudSettings() {
            if (applyingCloud) return;
            if (!fbDb) {
                updateSettingsSyncStatus('local', 'Configurações salvas só neste navegador · Firebase indisponível');
                return;
            }
            // A interface restringe edição a diretores, mas deixa explícito quando uma gravação
            // local não foi enviada para outros dispositivos.
            if (!isDiretor) {
                updateSettingsSyncStatus('local', 'Alteração local · entre como diretor para sincronizar');
                return;
            }

            clearTimeout(cloudSettingsSaveTimer);
            updateSettingsSyncStatus('saving', 'Sincronizando configurações…');
            cloudSettingsSaveTimer = setTimeout(() => {
                cloudSettingsSaveQueue = cloudSettingsSaveQueue.catch(() => {}).then(async () => {
                    try {
                        const payload = {
                            orgChart: organograma,
                            corretoresAdded: addedCorretores,
                            corretoresInactive: inactiveCorretores,
                            corretorFotos: corretorFotos,
                            metasMensais: metasMensais,
                            rankingsMetas: rankingsMetas,
                            metasPorCorretor: metasPorCorretor,
                            metasPorEquipe: metasPorEquipe,
                            vendasMode: vendasMode,
                            gsheetsUrl: googleSheetsUrl,
                            agendaGsheetsUrl: agendaGsheetsUrl,
                            mesesComerciais: mesesComerciais,
                            escalasPlantao: escalasPlantao,
                            vagasPorEscala: vagasPorEscala,
                            plantaoInfoEscala: plantaoInfoEscala,
                            plantaoEscalas: plantaoEscalasCfg,
                            _updatedAt: Date.now()
                        };
                        const porMesCsv = {};
                        Object.keys(prospeccaoPorMes).forEach(mes => { porMesCsv[mes] = prospeccaoPorMes[mes].csvText; });
                        const tamanhoTotal = Object.values(porMesCsv).reduce((s, t) => s + new Blob([t]).size, 0);
                        const prospeccaoSomenteLocal = tamanhoTotal > PROSPECCAO_FIRESTORE_LIMIT && tamanhoTotal > 0;
                        if (!prospeccaoSomenteLocal) payload.prospeccaoPorMes = porMesCsv;
                        await fbDb.collection('config').doc('settings').set(payload, { merge: true });
                        const savedMessage = prospeccaoSomenteLocal
                            ? 'Configurações sincronizadas · prospecção somente neste navegador (limite da nuvem)'
                            : `Configurações sincronizadas às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
                        updateSettingsSyncStatus('saved', savedMessage);
                        if (window.matchMedia && window.matchMedia('(max-width: 1279px)').matches && !prospeccaoSomenteLocal) showToast(savedMessage);
                        if (prospeccaoSomenteLocal) showToast('Configurações sincronizadas; a prospecção excedeu o limite e ficou apenas neste navegador.', true);
                    } catch (error) {
                        console.warn('Falha ao salvar na nuvem:', error);
                        updateSettingsSyncStatus('error', 'Falha ao sincronizar configurações · alterações permanecem neste navegador');
                        showToast('Falha ao sincronizar configurações. As alterações continuam neste navegador.', true);
                    }
                });
            }, 350);
        }


        function useMockData() {
            esconderBootLoading();
            dataset = generateMockData();
            isMockDataActive = true;
            document.getElementById('sourceBadge').innerHTML = `<span class="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span> DEMO`;
            document.getElementById('sourceBadge').className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 flex items-center gap-1";
            
            showToast("Dados de Demonstração (Ano de 2026) carregados com sucesso!");
            document.getElementById('connectionModal').classList.add('hidden');
            
            processData();
            startAutoRefreshTimer(); // Inicializa motor de sync
        }

        function toggleConnectionModal() {
            const modal = document.getElementById('connectionModal');
            modal.classList.toggle('hidden');
        }

        function connectGoogleSheets() {
            const urlInput = document.getElementById('sheetUrlInput').value.trim();
            if (!urlInput) {
                showToast("Por favor, insira um link de publicação válido.", true);
                return;
            }

            googleSheetsUrl = urlInput;
            saveLocalSetting(`${appId}-gsheets-url`, urlInput);
            pushCloudSettings();
            fetchFromGoogleSheets(urlInput);
        }

        function processSheetCSV(csvText) {
            const results = Papa.parse(csvText, { header: true, skipEmptyLines: true });
            if (!results.data || results.data.length === 0 || results.data[0].ID === undefined) {
                showToast("Erro: estrutura de colunas inválida.", true);
                showEmptyState();
                return;
            }
            applyParsedRows(results.data);
        }

        // Anexa um parâmetro único para furar o cache do navegador/Google (dados sempre frescos)
        function cacheBust(url) {
            const sep = url.includes('?') ? '&' : '?';
            return `${url}${sep}_cb=${Date.now()}`;
        }

        function fetchFromGoogleSheets(url) {
            showToast("Sincronizando com o Google Sheets...");

            // Método 1: PapaParse download direto (com cache-buster)
            Papa.parse(cacheBust(url), {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    if (results.data && results.data.length > 0 && results.data[0].ID !== undefined) {
                        applyParsedRows(results.data);
                    } else {
                        tryProxyFetch(url);
                    }
                },
                error: function(err) {
                    console.warn("PapaParse direto falhou, tentando proxy...", err);
                    tryProxyFetch(url);
                }
            });
        }

        // PADRONIZAÇÃO DE NOMES (12/10/2026): a planilha tem a mesma construtora/empreendimento
        // digitada de jeitos diferentes ("CASAS MANAGER"/"CASAS MENAGER", "AVULSO"/"avulso",
        // "VITORIA EUSEBIO"/"VITÓRIA EUSÉBIO"), o que dividia os números nos filtros e rankings.
        // Aqui (só na leitura — a planilha não é alterada) tudo vira MAIÚSCULO, espaços extras somem,
        // variações só de acento/maiúscula se juntam (vence a grafia mais usada; empate → a com
        // acento) e alguns erros de digitação conhecidos são corrigidos em NOMES_ALIAS.
        const NOMES_ALIAS = { 'CASAS MENAGER': 'CASAS MANAGER', 'AVULSON': 'AVULSO' };
        const semAcento = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        function padronizarNomesCadastro(rows) {
            ['Construtora', 'Empreendimento'].forEach(campo => {
                const limpo = v => {
                    let t = String(v).replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
                    t = t.replace(/([A-ZÀ-Ý])(\d)$/, '$1 $2'); // "VILLE DE LISBOA4" → "VILLE DE LISBOA 4"
                    return NOMES_ALIAS[semAcento(t)] || t;
                };
                const contagem = {};
                rows.forEach(r => {
                    if (!r[campo]) return;
                    const t = limpo(r[campo]); const k = semAcento(t);
                    (contagem[k] = contagem[k] || {})[t] = (contagem[k][t] || 0) + 1;
                });
                const escolhido = {};
                Object.keys(contagem).forEach(k => {
                    escolhido[k] = Object.entries(contagem[k]).sort((a, b) => (b[1] - a[1]) || (semAcento(a[0]) === a[0]) - (semAcento(b[0]) === b[0]) || a[0].localeCompare(b[0]))[0][0];
                });
                rows.forEach(r => { if (r[campo]) r[campo] = escolhido[semAcento(limpo(r[campo]))]; });
            });
            return rows;
        }

        function esconderBootLoading() {
            const el = document.getElementById('bootLoading');
            if (el) el.remove();
        }
        setTimeout(esconderBootLoading, 15000); // trava de segurança: nunca prende a tela

        function applyParsedRows(rows) {
            esconderBootLoading();
            dataset = rows.map(row => {
                if (row.VGV !== undefined && row.VGV !== null && typeof row.VGV === 'string') {
                    let clean = row.VGV.replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.').trim();
                    row.VGV = parseFloat(clean) || 0;
                } else {
                    row.VGV = getVGV(row);
                }
                return row;
            });
            padronizarNomesCadastro(dataset);

            isMockDataActive = false;
            document.getElementById('sourceBadge').innerHTML = `<span class="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse"></span> CONECTADO`;
            document.getElementById('sourceBadge').className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-500/10 text-brand-500 flex items-center gap-1";
            showToast("Google Sheets ligado e sincronizado com sucesso!");
            document.getElementById('connectionModal').classList.add('hidden');
            processData();
            startAutoRefreshTimer();
        }

        async function tryProxyFetch(url, silent) {
            const fresh = cacheBust(url);
            const proxies = [
                `https://corsproxy.io/?${encodeURIComponent(fresh)}`,
                `https://api.allorigins.win/raw?url=${encodeURIComponent(fresh)}`
            ];
            for (const proxyUrl of proxies) {
                try {
                    const resp = await fetch(proxyUrl, { cache: 'no-store' });
                    if (resp.ok) {
                        const text = await resp.text();
                        if (text.includes('ID') && text.includes('Corretor')) {
                            if (silent) { applyRefreshedCSV(text); }
                            else { processSheetCSV(text); }
                            return;
                        }
                    }
                } catch (e) {
                    console.warn("Proxy falhou:", proxyUrl, e);
                }
            }
            if (silent) { updateSyncStatusUI("counting"); }
            else { showToast("Erro de ligação. Verifique se a planilha está publicada na web.", true); showEmptyState(); }
        }

        function showEmptyState() {
            dataset = [];
            filteredDataset = [];
            isMockDataActive = false;
            document.getElementById('sourceBadge').innerHTML = `<span class="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span> ERRO`;
            document.getElementById('sourceBadge').className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 flex items-center gap-1";
            processData();
        }

        // =========================================================================
        // ✨ NOVO: ENGINE DE AUTO-ATUALIZAÇÃO EM TEMPO REAL (REAL-TIME SYNC) ✨
        // =========================================================================
        // Pausa o auto-refresh enquanto a aba não está visível. Sem isso o BI continuava baixando os
        // 2 CSVs do Google Sheets a cada 15s mesmo esquecido numa aba de fundo — medido em produção:
        // 48 requisições em 5,6 min (~480/hora), ~770ms cada, sem ninguém olhando a tela. Ao voltar
        // pra aba, busca na hora em vez de esperar o próximo tick, então o usuário não perde nada.
        let pausaPorVisibilidadeInstalada = false;
        function instalarPausaPorVisibilidade() {
            if (pausaPorVisibilidadeInstalada) return;
            pausaPorVisibilidadeInstalada = true;
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    clearInterval(countdownTimerId);
                    countdownTimerId = null;
                    updateSyncStatusUI("inactive");
                } else {
                    const rateAtual = parseInt(document.getElementById('autoRefreshSelect').value);
                    if (rateAtual > 0 && !isMockDataActive) {
                        silentFetchFromGoogleSheets();
                        silentFetchAgendaFromGoogleSheets();
                    }
                    startAutoRefreshTimer();
                }
            });
        }

        function startAutoRefreshTimer() {
            clearInterval(countdownTimerId);
            instalarPausaPorVisibilidade();

            const rate = parseInt(document.getElementById('autoRefreshSelect').value);
            if (rate === 0 || isMockDataActive) {
                updateSyncStatusUI("inactive");
                return;
            }
            // Aba em segundo plano: não inicia contagem nenhuma (o listener acima religa ao voltar).
            if (document.visibilityState === 'hidden') {
                updateSyncStatusUI("inactive");
                return;
            }

            autoRefreshInterval = rate;
            secondsLeft = autoRefreshInterval;
            updateSyncStatusUI("counting");

            countdownTimerId = setInterval(() => {
                secondsLeft--;
                if (secondsLeft <= 0) {
                    secondsLeft = autoRefreshInterval;
                    silentFetchFromGoogleSheets();
                    silentFetchAgendaFromGoogleSheets();
                }
                updateSyncStatusUI("counting");
            }, 1000);
        }

        // Aplica um CSV recém-baixado (auto-refresh silencioso): só re-renderiza se mudou
        function applyRefreshedCSV(csvText) {
            const results = Papa.parse(csvText, { header: true, skipEmptyLines: true });
            if (!results.data || results.data.length === 0 || results.data[0].ID === undefined || results.data[0].Corretor === undefined) {
                updateSyncStatusUI("counting");
                return;
            }
            esconderBootLoading();
            const novoDataset = results.data.map(row => {
                if (row.VGV !== undefined && row.VGV !== null && typeof row.VGV === 'string') {
                    let cleanVgv = row.VGV.replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.').trim();
                    row.VGV = parseFloat(cleanVgv) || 0;
                } else {
                    row.VGV = parseFloat(row.VGV) || 0;
                }
                return row;
            });
            padronizarNomesCadastro(novoDataset);

            const mudou = JSON.stringify(novoDataset) !== JSON.stringify(dataset);
            dataset = novoDataset;
            isMockDataActive = false;
            if (mudou) {
                populateDynamicFilters();
                applyFilters();
                showToast("Dados atualizados automaticamente!");
            }
            lastSyncTime = new Date();
            updateSyncStatusUI("counting");
        }

        function silentFetchFromGoogleSheets() {
            if (!googleSheetsUrl || isMockDataActive) return;

            const indicator = document.getElementById('syncIndicator');
            const statusText = document.getElementById('syncStatusText');
            if (indicator && statusText) {
                indicator.className = "h-2 w-2 rounded-full bg-indigo-500 animate-ping";
                statusText.textContent = "A atualizar em segundo plano...";
            }

            // Método 1: download direto com cache-buster
            try {
                Papa.parse(cacheBust(googleSheetsUrl), {
                    download: true,
                    header: true,
                    skipEmptyLines: true,
                    complete: function(results) {
                        if (results.data && results.data.length > 0 && results.data[0].ID !== undefined && results.data[0].Corretor !== undefined) {
                            applyRefreshedCSV(Papa.unparse(results.data));
                        } else {
                            tryProxyFetch(googleSheetsUrl, true); // fallback silencioso
                        }
                    },
                    error: function() {
                        tryProxyFetch(googleSheetsUrl, true); // fallback silencioso
                    }
                });
            } catch (e) {
                tryProxyFetch(googleSheetsUrl, true);
            }
        }

        // ===== AGENDA DE VISITAS: 2ª planilha (ID/Corretor/Cliente/Data/Hora/Empreendimento/
        // Local/Status/Obs), independente da principal — mesmo padrão de fetch/proxy/auto-refresh,
        // só que guarda em agendaDataset/agendaGsheetsUrl em vez de dataset/googleSheetsUrl. =====
        function connectAgendaGoogleSheets() {
            const urlInput = document.getElementById('agendaSheetUrlInput').value.trim();
            if (!urlInput) {
                showToast("Por favor, insira um link de publicação válido.", true);
                return;
            }
            agendaGsheetsUrl = urlInput;
            saveLocalSetting(`${appId}-agenda-gsheets-url`, urlInput);
            pushCloudSettings();
            fetchAgendaFromGoogleSheets(urlInput);
        }

        // Alguns cabeçalhos da Agenda vêm com espaço sobrando (ex.: "Data " em vez de "Data") —
        // sem isso, row['Data'] fica undefined e a linha inteira nunca conta em nenhum período.
        function normalizeAgendaRows(rows) {
            return rows.map(row => {
                const clean = {};
                Object.keys(row).forEach(k => { clean[k.trim()] = row[k]; });
                return clean;
            });
        }

        function applyAgendaParsedRows(rows) {
            agendaDataset = normalizeAgendaRows(rows);
            showToast("Agenda de Visitas sincronizada com sucesso!");
            applyFilters();
        }

        function fetchAgendaFromGoogleSheets(url) {
            showToast("Sincronizando a Agenda de Visitas...");
            Papa.parse(cacheBust(url), {
                download: true,
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    if (results.data && results.data.length > 0 && results.data[0].ID !== undefined && results.data[0].Corretor !== undefined) {
                        applyAgendaParsedRows(results.data);
                    } else {
                        tryAgendaProxyFetch(url);
                    }
                },
                error: function(err) {
                    console.warn("PapaParse direto (agenda) falhou, tentando proxy...", err);
                    tryAgendaProxyFetch(url);
                }
            });
        }

        async function tryAgendaProxyFetch(url, silent) {
            const fresh = cacheBust(url);
            const proxies = [
                `https://corsproxy.io/?${encodeURIComponent(fresh)}`,
                `https://api.allorigins.win/raw?url=${encodeURIComponent(fresh)}`
            ];
            for (const proxyUrl of proxies) {
                try {
                    const resp = await fetch(proxyUrl, { cache: 'no-store' });
                    if (resp.ok) {
                        const text = await resp.text();
                        if (text.includes('ID') && text.includes('Corretor')) {
                            const results = Papa.parse(text, { header: true, skipEmptyLines: true });
                            if (results.data && results.data.length > 0 && results.data[0].ID !== undefined) {
                                if (silent) { applyAgendaRefreshedCSV(results.data); }
                                else { applyAgendaParsedRows(results.data); }
                                return;
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Proxy (agenda) falhou:", proxyUrl, e);
                }
            }
            if (!silent) showToast("Erro ao ligar a Agenda de Visitas. Verifique se está publicada na web.", true);
        }

        // Aplica um CSV recém-baixado da Agenda (auto-refresh silencioso): só re-renderiza se mudou.
        function applyAgendaRefreshedCSV(rows) {
            const normalizado = normalizeAgendaRows(rows);
            const mudou = JSON.stringify(normalizado) !== JSON.stringify(agendaDataset);
            agendaDataset = normalizado;
            if (mudou) applyFilters();
        }

        function silentFetchAgendaFromGoogleSheets() {
            if (!agendaGsheetsUrl || isMockDataActive) return;
            try {
                Papa.parse(cacheBust(agendaGsheetsUrl), {
                    download: true,
                    header: true,
                    skipEmptyLines: true,
                    complete: function(results) {
                        if (results.data && results.data.length > 0 && results.data[0].ID !== undefined && results.data[0].Corretor !== undefined) {
                            applyAgendaRefreshedCSV(results.data);
                        } else {
                            tryAgendaProxyFetch(agendaGsheetsUrl, true);
                        }
                    },
                    error: function() { tryAgendaProxyFetch(agendaGsheetsUrl, true); }
                });
            } catch (e) {
                tryAgendaProxyFetch(agendaGsheetsUrl, true);
            }
        }

        function updateSyncStatusUI(status) {
            const indicator = document.getElementById('syncIndicator');
            const text = document.getElementById('syncStatusText');
            if (!indicator || !text) return;

            if (isMockDataActive) {
                indicator.className = "h-2 w-2 rounded-full bg-amber-500 animate-pulse";
                text.textContent = "Modo de Demonstração Ativo (Simulação)";
                return;
            }

            const rate = parseInt(document.getElementById('autoRefreshSelect').value);
            if (rate === 0) {
                indicator.className = "h-2 w-2 rounded-full bg-slate-500";
                text.textContent = "Auto-atualização desativada";
                return;
            }

            if (status === "counting") {
                indicator.className = "h-2 w-2 rounded-full bg-brand-500 animate-pulse";
                text.textContent = `Sincronizado. Nova verificação em ${secondsLeft}s`;
            } else if (status === "error") {
                indicator.className = "h-2 w-2 rounded-full bg-rose-500 animate-bounce";
                text.textContent = "Falha ao conectar à planilha";
                esconderBootLoading();
            }
        }

        function changeRefreshRate(val) {
            saveLocalSetting(`${appId}-refresh-rate`, val);
            startAutoRefreshTimer();
            const label = val === '0' ? 'desativada' : `${val}s`;
            showToast(`Frequência de atualização: ${label}`);
        }

        // Restaura a frequência salva (mantém a preferência entre sessões)
        function restoreRefreshRate() {
            const saved = localStorage.getItem(`${appId}-refresh-rate`);
            if (saved !== null) {
                const sel = document.getElementById('autoRefreshSelect');
                if (sel) sel.value = saved;
            }
        }

        // === SINCRONIZAÇÃO FULL-TIME: atualiza ao voltar o foco e ao reconectar ===
        // Navegadores congelam timers em abas em segundo plano (ex: TV/monitor);
        // ao reexibir a aba, força uma atualização imediata para nunca ficar defasado.
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !isMockDataActive && googleSheetsUrl) {
                silentFetchFromGoogleSheets();
                startAutoRefreshTimer();
            }
        });
        window.addEventListener('online', () => {
            if (!isMockDataActive && googleSheetsUrl) {
                silentFetchFromGoogleSheets();
                startAutoRefreshTimer();
            }
        });
        window.addEventListener('focus', () => {
            if (!isMockDataActive && googleSheetsUrl) silentFetchFromGoogleSheets();
        });
        // =========================================================================

        function processData() {
            populateDynamicFilters();
            applyFilters();
        }

        function populateDynamicFilters() {
            const corretores = new Set();
            const construtoras = new Set();
            const empreendimentos = new Set();
            const meses = new Set();
            const anos = new Set();

            dataset.forEach(row => {
                if (row.Corretor) corretores.add(row.Corretor);
                if (row.Construtora) construtoras.add(row.Construtora);
                if (row.Empreendimento) empreendimentos.add(row.Empreendimento);
                if (row['Mês Cadastro']) meses.add(row['Mês Cadastro']);
                if (row['Mês Ganho']) meses.add(row['Mês Ganho']);

                const dateCad = parseDate(row['Data Cadastro']);
                if (dateCad) {
                    anos.add(dateCad.getFullYear());
                }
            });

            const selCorretor = document.getElementById('filterCorretor').value;
            const selEquipe = document.getElementById('filterEquipe').value;
            const selConstrutora = document.getElementById('filterConstrutora').value;
            const selEmpreendimento = document.getElementById('filterEmpreendimento').value;
            const selMesesAntes = getSelectedMeses();
            const selAno = document.getElementById('filterAno').value;

            fillCorretorSelect(selCorretor);
            // As opções do filtro vêm dos vínculos atuais do organograma, não do campo legado
            // Equipe da planilha. Assim o seletor e os cálculos usam a mesma fonte de verdade.
            fillSelect('filterEquipe', getConfiguredRankingTeams(), "Todas as equipes", selEquipe);
            fillSelect('filterConstrutora', Array.from(construtoras).sort(), "Todas as construtoras", selConstrutora);
            fillSelect('filterEmpreendimento', Array.from(empreendimentos).sort(), "Todos os empreendimentos", selEmpreendimento);
            fillMultiSelect('filterMes', Array.from(meses), selMesesAntes);
            fillSelect('filterAno', Array.from(anos).sort((a,b)=>b-a), "Todos", selAno);

            renderMesComercialPills();
            renderSemanaPills();
        }

        
