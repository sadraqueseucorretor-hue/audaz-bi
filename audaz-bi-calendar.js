const CAL_METRICS = {
            analises:     { key: 'a',  label: 'Análises',     sub: 'data cadastro',    color: 'sky',     btnBg: 'bg-sky-500' },
            aprovados:    { key: 'ap', label: 'Aprovados',    sub: 'data aprovação',   color: 'amber',   btnBg: 'bg-amber-500' },
            vendas:       { key: 'v',  label: 'Vendas',       sub: 'data ganho',       color: 'emerald', btnBg: 'bg-emerald-500' },
            agendamentos: { key: 'ag', label: 'Agendamentos', sub: 'data do agendamento', color: 'violet', btnBg: 'bg-violet-500' },
            visitas:      { key: 'vi', label: 'Visitas',      sub: 'data compareceu', color: 'cyan',    btnBg: 'bg-cyan-500' }
        };

        function setCalendarMetric(m) {
            if (!CAL_METRICS[m]) return;
            calendarMetric = m;
            Object.keys(CAL_METRICS).forEach(k => {
                const btn = document.getElementById('calBtn-' + k);
                if (!btn) return;
                if (k === m) {
                    btn.className = `cal-metric-btn px-3 py-1.5 rounded-lg text-xs font-bold transition ${CAL_METRICS[k].btnBg} text-white`;
                } else {
                    btn.className = 'cal-metric-btn px-3 py-1.5 rounded-lg text-xs font-bold transition text-slate-400';
                }
            });
            renderCalendarTab();
        }

        function setCalendarDimension(dimension) {
            calendarDimension = dimension === 'corretor' ? 'corretor' : 'equipe';
            saveLocalSetting(`${appId}-calendar-dimension`, calendarDimension);
            setCalendarDimensionButtonsOnly();
            renderCalendarTab();
        }

        function setCalendarDimensionButtonsOnly() {
            ['equipe', 'corretor'].forEach(k => {
                const btn = document.getElementById(`calDim-${k}`);
                if (btn) btn.className = `px-3 py-1.5 rounded-lg text-xs font-bold transition ${calendarDimension === k ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`;
            });
        }

        // Icone de medalha (top 3) ou numero de posicao (demais) -- usado na coluna Corretor,
        // ranqueada pela metrica ativa (Analises/Aprovados/Vendas).
        function medalhaRank(rank) {
            if (rank === 1) return '<span class="text-base leading-none" title="1º lugar">🥇</span>';
            if (rank === 2) return '<span class="text-base leading-none" title="2º lugar">🥈</span>';
            if (rank === 3) return '<span class="text-base leading-none" title="3º lugar">🥉</span>';
            return `<span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold shrink-0">${rank}</span>`;
        }

        function drawProductionCalendar() {
            // Mesma janela deslizante de mês comercial usada no resto do painel (Funil, Ritmo do
            // Mês, Evolução Semanal): início real = data mais antiga lançada nesse mês (pode ser
            // antes do dia 1 do calendário), ou o período exato configurado manualmente em "Meses
            // Comerciais" quando existir — nunca mais o dia 1 fixo do calendário.
            const metricaJanela = calendarMetric === 'aprovados' ? 'aprovacoes' : calendarMetric;
            const janela = getJanelaMesComercial(metricaJanela);
            const activeMonth = janela.mesNome;
            const activeYear = janela.ano;
            const yearNum = activeYear;
            const inicioMes = janela.inicioReal; // âncora do dia 1 da grade (não é mais o dia 1 do calendário)
            const maxDia = janela.diasNoMes;
            const diaHojeIdx = janela.mesEhAtual ? janela.diaHoje : null;

            document.getElementById('calMonthLabel').innerHTML = `<i class="fa-solid fa-calendar-days text-slate-500"></i> ${activeMonth}/${activeYear}`;

            // Membership genérico (mesmo critério do getJanelaMesComercial): com "Meses Comerciais"
            // configurado manualmente, a DATA manda; sem config, o texto do Mês* da planilha manda.
            const pertenceAoMesGenerico = (ok, mesRef, dataRef) => {
                if (!ok) return false;
                if (janela.configMes) {
                    const d = parseDate(dataRef);
                    return d && d >= janela.inicioReal && d <= janela.fimEstimado;
                }
                return normalizeMes(mesRef) === activeMonth && (getMesAno(mesRef) || activeYear) === activeYear;
            };

            // Roster do Mapa de Calor: SÓ corretores ATIVOS (inclui pré-cadastrados sem produção).
            // Exceção deliberada à regra "desativar não esconde histórico": este painel é ferramenta
            // de GESTÃO DA EQUIPE ATUAL — mede sequência de dias ativos, dias parados e quem precisa
            // de cobrança. Não faz sentido cobrar/monitorar quem não está mais na equipe, então o
            // desativado sai daqui mesmo tendo documentação lançada dentro do mês exibido (pedido
            // explícito do usuário). O histórico dele segue intacto nos demais indicadores
            // (rankings, análises, aprovações, vendas, VGV) — ver regras-negocio-audaz-bi.
            const activeCorretores = getActiveCorretores();
            const activeSet = new Set(activeCorretores);

            // ===== STATUS DE ATIVIDADE (dias sem subir análise) + SEQUÊNCIA ATUAL =====
            // Sempre pelo HOJE real (não pelo mês em exibição) e por TODA a base (não só o mês do
            // calendário), pra refletir a atividade recente de verdade do corretor.
            const hojeStatusCal = isMockDataActive ? new Date(2026, 5, 9) : new Date();
            hojeStatusCal.setHours(0, 0, 0, 0);
            // "Última Atividade", status e sequência seguem a ETAPA escolhida no Mapa de Calor, cada uma
            // pela sua própria data e pela MESMA base — nunca mostra "18/07" ao lado de "11 dias parado".
            const ETAPA_STATUS = {
                analises:     { hoje: 'Subiu análise hoje', nunca: 'Nunca subiu análise', sem: 'sem subir análise',
                                eventos: () => dataset.map(r => [r.Corretor, r['Data Cadastro']]) },
                aprovados:    { hoje: 'Teve aprovação hoje', nunca: 'Nunca teve aprovação', sem: 'sem aprovação',
                                eventos: () => dataset.filter(r => isAprovado(r['Situação - Analise'])).map(r => [r.Corretor, dataAprovacaoEfetiva(r)]) },
                vendas:       { hoje: 'Vendeu hoje', nunca: 'Nunca vendeu', sem: 'sem vender',
                                eventos: () => dataset.filter(isGanho).map(r => [r.Corretor, r['Data Ganho']]) },
                agendamentos: { hoje: 'Agendou hoje', nunca: 'Nunca agendou', sem: 'sem agendar',
                                eventos: () => (agendaDataset || []).map(r => [r.Corretor, agendaDateForMetric(r, 'agendamentos')]) },
                visitas:      { hoje: 'Fez visita hoje', nunca: 'Nunca fez visita', sem: 'sem visita realizada',
                                eventos: () => (agendaDataset || []).filter(isCompareceu).map(r => [r.Corretor, agendaDateForMetric(r, 'compareceu')]) }
            };
            const etapaStatus = ETAPA_STATUS[calendarMetric] || ETAPA_STATUS.analises;
            const ultimaAtividadeCorretor = {};
            const activityDaySet = new Set(); // `${corretor}|${y}-${m}-${d}` com >=1 evento da etapa nesse dia — usado pra calcular a sequência
            etapaStatus.eventos().forEach(([c, data]) => {
                if (!activeSet.has(c)) return;
                const d = parseDate(data);
                if (!d || d > hojeStatusCal) return; // agendamento/visita com data futura não é atividade feita
                if (!ultimaAtividadeCorretor[c] || d > ultimaAtividadeCorretor[c]) ultimaAtividadeCorretor[c] = d;
                activityDaySet.add(`${c}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
            });
            const diasSemAtividadeCorretor = (c) => {
                const ultima = ultimaAtividadeCorretor[c];
                if (!ultima) return Infinity; // nunca teve evento nessa etapa
                return Math.floor((hojeStatusCal - ultima) / 86400000);
            };
            // Conta dias corridos consecutivos com >=1 evento, terminando em `fromDate` e voltando no tempo.
            const calcularSequencia = (c, fromDate) => {
                let streak = 0;
                const cursor = new Date(fromDate);
                while (activityDaySet.has(`${c}|${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`)) {
                    streak++;
                    cursor.setDate(cursor.getDate() - 1);
                }
                return streak;
            };
            // Classificação usada tanto no badge abaixo do nome quanto na coluna Status.
            const statusInfo = (c) => {
                const dias = diasSemAtividadeCorretor(c);
                if (dias === Infinity) return { tag: 'gray', icon: 'fa-minus', label: 'Sem atividades', title: etapaStatus.nunca, value: null };
                if (dias === 0) {
                    const seq = calcularSequencia(c, hojeStatusCal);
                    return { tag: 'green', icon: 'fa-fire', label: `${seq} dia${seq === 1 ? '' : 's'}`, title: etapaStatus.hoje, value: seq };
                }
                if (dias <= 2) return { tag: 'yellow', icon: 'fa-triangle-exclamation', label: `${dias} dia${dias === 1 ? '' : 's'}`, title: `${dias} dia(s) ${etapaStatus.sem}`, value: dias };
                return { tag: 'red', icon: 'fa-ban', label: `${dias} dias parado`, title: `${dias} dias ${etapaStatus.sem}`, value: dias };
            };
            const STATUS_COLOR = {
                green:  { text: 'text-emerald-400', icon: 'text-emerald-400' },
                yellow: { text: 'text-amber-400',   icon: 'text-amber-400' },
                red:    { text: 'text-rose-500',    icon: 'text-rose-500' },
                gray:   { text: 'text-slate-500',   icon: 'text-slate-600' }
            };

            // Índice contínuo do dia dentro da janela deslizante: dia 1 = inicioMes (o início real
            // do mês comercial, não o dia 1 do calendário) ... dia maxDia = fimEstimado.
            const diaDe = (dataStr) => {
                const dt = parseDate(dataStr);
                if (!dt) return 1;
                const idx = Math.floor((dt - inicioMes) / 86400000) + 1;
                return idx < 1 ? 1 : (idx > maxDia ? maxDia : idx);
            };

            // A matriz respeita equipe/corretor selecionados: sem filtro mostra todos; com equipe,
            // mostra só aquela equipe ou seus corretores; com corretor, mostra só ele (ou sua equipe
            // quando a dimensão estiver em Equipes).
            const selectedBroker = document.getElementById('filterCorretor')?.value || (orgDashboardScope?.kind === 'broker' ? orgDashboardScope.name : '');
            const selectedTeam = document.getElementById('filterEquipe')?.value || (orgDashboardScope?.kind === 'team' ? orgDashboardScope.team : '');
            const teamForBroker = selectedBroker ? getRankingTeamForBroker(selectedBroker) : '';
            const effectiveTeam = selectedTeam || teamForBroker;
            const visibleTeams = getConfiguredRankingTeams().filter(team => selectedBroker ? !!effectiveTeam && rankingTeamKey(team) === rankingTeamKey(effectiveTeam) : (!effectiveTeam || rankingTeamKey(team) === rankingTeamKey(effectiveTeam)));
            const visibleBrokers = activeCorretores.filter(broker => {
                if (selectedBroker && orgPersonKey(broker) !== orgPersonKey(selectedBroker)) return false;
                if (effectiveTeam && rankingTeamKey(getRankingTeamForBroker(broker)) !== rankingTeamKey(effectiveTeam)) return false;
                return true;
            });
            const calendarRowNames = calendarDimension === 'equipe' ? visibleTeams : visibleBrokers;
            const calendarRowSet = new Set(calendarRowNames);
            const cellMatrix = {};
            const productionMatrix = {};
            calDetail = Object.fromEntries(Object.keys(CAL_METRICS).map(k => [k, { cell: {}, day: {}, month: [] }]));
            calendarRowNames.forEach(name => {
                for (let d = 1; d <= maxDia; d++) {
                    const key = `${name}_${d}`;
                    cellMatrix[key] = { a: 0, ap: 0, v: 0, ag: 0, vi: 0 };
                    productionMatrix[key] = 0;
                    Object.values(calDetail).forEach(m => { m.cell[key] = []; });
                }
            });
            for (let d = 1; d <= maxDia; d++) Object.values(calDetail).forEach(m => { m.day[d] = []; });

            const getCalendarRow = person => {
                if (!person || inactiveCorretores.includes(person)) return null;
                if (calendarDimension === 'corretor') return activeSet.has(person) ? person : null;
                const isManager = organograma.some(n => n.role === 'Gerente' && orgPersonKey(n.name) === orgPersonKey(person));
                if (!activeSet.has(person) && !isManager) return null;
                const team = getRankingTeamForBroker(person);
                return team && calendarRowSet.has(team) ? team : null;
            };
            const addCalendarEvent = (metric, person, dateValue, row) => {
                const rowName = getCalendarRow(person), dt = parseDate(dateValue);
                const fimDoPeriodo = new Date(janela.fimEstimado);
                fimDoPeriodo.setHours(23, 59, 59, 999);
                if (!rowName || !dt || dt < inicioMes || dt > fimDoPeriodo) return;
                const day = diaDe(dateValue), key = `${rowName}_${day}`;
                if (!cellMatrix[key]) return;
                const metricName = Object.keys(CAL_METRICS).find(k => CAL_METRICS[k].key === metric);
                if (!metricName) return;
                cellMatrix[key][metric]++;
                if (metric === 'a') productionMatrix[key]++;
                calDetail[metricName].cell[key].push(row);
                calDetail[metricName].day[day].push(row);
                calDetail[metricName].month.push(row);
            };
            filteredDataset.forEach(row => {
                if (pertenceAoMesGenerico(true, row['Mês Cadastro'], row['Data Cadastro'])) addCalendarEvent('a', row.Corretor, row['Data Cadastro'], row);
                if (pertenceAoMesGenerico(isAprovado(row['Situação - Analise']), mesAprovacaoEfetivo(row), dataAprovacaoEfetiva(row))) addCalendarEvent('ap', row.Corretor, dataAprovacaoEfetiva(row), row);
                if (pertenceAoMesGenerico(isGanho(row), row['Mês Ganho'], row['Data Ganho'])) addCalendarEvent('v', row.Corretor, row['Data Ganho'], row);
            });
            // Agendamentos seguem a data marcada; visitas são apenas registros com status compareceu.
            filteredAgendaDataset.forEach(row => {
                addCalendarEvent('ag', row.Corretor, agendaDateForMetric(row, 'agendamentos'), row);
                if (isCompareceu(row)) addCalendarEvent('vi', row.Corretor, agendaDateForMetric(row, 'compareceu'), row);
            });

            // Compat: mantém os mapas antigos apontando para análises
            calendarDetailsMap = calDetail.analises.cell;
            calendarDayDetails = calDetail.analises.day;
            calendarMonthDetails = calDetail.analises.month;

            // Métrica selecionada (mostra uma de cada vez, separada)
            const metricKey = CAL_METRICS[calendarMetric].key; // a | ap | v
            const cor = CAL_METRICS[calendarMetric].color;     // sky | amber | emerald

            // Total da métrica ativa — usado pra ranquear equipes/corretores.
            const totaisPorCorretor = {};
            const totalAnalisesPorCorretor = {}; // sempre em análises, independente da métrica ativa — usado no KPI "Corretores Ativos"
            calendarRowNames.forEach(c => {
                let tot = 0, totA = 0;
                for (let d = 1; d <= maxDia; d++) {
                    const cell = cellMatrix[`${c}_${d}`] || { a: 0, ap: 0, v: 0, ag: 0, vi: 0 };
                    tot += cell[metricKey];
                    totA += cell.a;
                }
                totaisPorCorretor[c] = tot;
                totalAnalisesPorCorretor[c] = totA;
            });
            const corretoresRanqueados = [...calendarRowNames].sort((x, y) => totaisPorCorretor[y] - totaisPorCorretor[x] || x.localeCompare(y, 'pt-BR'));

            const headerRow = document.getElementById('calendarHeaderRow');
            setCalendarDimensionButtonsOnly();
            headerRow.innerHTML = `<th class="p-3 pl-4 text-left min-w-[170px] bg-slate-950 sticky left-0 z-20">${calendarDimension === 'equipe' ? 'Equipe' : 'Corretor'}</th>`;

            for (let d = 1; d <= maxDia; d++) {
                const tempDateObj = new Date(inicioMes);
                tempDateObj.setDate(tempDateObj.getDate() + (d - 1)); // dia 1 = início real do mês comercial (pode já estar no calendário anterior/seguinte)
                const weekDayName = tempDateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).substring(0, 3).toUpperCase();
                const ehSpill = tempDateObj.getMonth() !== janela.monthIdx; // dia fora do mês de calendário "nominal" (antes ou depois)
                const ehHoje = d === diaHojeIdx;
                const diaReal = String(tempDateObj.getDate()).padStart(2, '0');
                const mesTag = ehSpill ? `<div class="text-[7px] text-amber-400 font-extrabold uppercase leading-none mt-0.5">${tempDateObj.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</div>` : '';
                const hojeTag = ehHoje ? `<div class="text-[7px] bg-sky-500 text-white font-extrabold uppercase leading-none rounded px-1 py-0.5 mb-0.5 inline-block">Hoje</div>` : '';

                headerRow.insertAdjacentHTML('beforeend', `
                    <th class="p-2 border-l text-center min-w-[55px] ${ehHoje ? 'bg-sky-500/10 border-sky-400/70 border-x-2' : (ehSpill ? 'border-amber-500/30 bg-amber-500/5' : 'border-slate-800')}">
                        ${hojeTag}
                        <div class="text-xs font-extrabold ${ehHoje ? 'text-sky-300' : (ehSpill ? 'text-amber-300' : '')}">${diaReal}</div>
                        <div class="text-[8px] text-slate-500 font-medium">${weekDayName}</div>
                        ${mesTag}
                    </th>
                `);
            }
            headerRow.insertAdjacentHTML('beforeend', `
                <th class="p-3 text-right min-w-[70px] bg-slate-950 border-l border-slate-800 font-bold text-white">Total</th>
                <th class="p-3 text-right min-w-[75px] bg-slate-950 border-l border-slate-800 font-bold text-white">Média/Dia</th>
                ${calendarDimension === 'corretor' ? '<th class="p-3 text-center min-w-[90px] bg-slate-950 border-l border-slate-800 font-bold text-white">Última Atividade</th><th class="p-3 pr-4 text-center min-w-[60px] bg-slate-950 border-l border-slate-800 font-bold text-white">Status</th>' : ''}
            `);

            const tableBody = document.getElementById('calendarTableBody');
            tableBody.innerHTML = '';

            let totalDiarioList = Array(maxDia + 1).fill(0);       // total análises (heatmap/KPIs)
            let totalDiaA = Array(maxDia + 1).fill(0);
            let totalDiaAp = Array(maxDia + 1).fill(0);
            let totalDiaV = Array(maxDia + 1).fill(0);
            let totalDiaAg = Array(maxDia + 1).fill(0);
            let totalDiaVi = Array(maxDia + 1).fill(0);

            atualizarLegendaCalendario();

            const updEl = document.querySelector('#calendarUpdatedAt span');
            if (updEl) {
                const ts = lastSyncTime || new Date();
                const dd = String(ts.getDate()).padStart(2, '0');
                const mm = String(ts.getMonth() + 1).padStart(2, '0');
                const yyyy = ts.getFullYear();
                const hh = String(ts.getHours()).padStart(2, '0');
                const mi = String(ts.getMinutes()).padStart(2, '0');
                updEl.textContent = `Dados atualizados até ${dd}/${mm}/${yyyy} ${hh}:${mi}`;
            }

            if (calendarRowNames.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="${maxDia + (calendarDimension === 'equipe' ? 3 : 5)}" class="text-center py-6 text-slate-500 text-xs">${calendarDimension === 'equipe' ? 'Nenhuma equipe configurada no organograma.' : 'Nenhum corretor ativo neste período.'}</td></tr>`;
            } else {
                corretoresRanqueados.forEach((c, idx) => {
                    const rank = idx + 1;
                    const cEsc = c.replace(/'/g, "\\'");
                    const st = statusInfo(c);
                    const stColor = STATUS_COLOR[st.tag];
                    let totMetric = 0;

                    let cellsHtml = '';
                    for (let d = 1; d <= maxDia; d++) {
                        const cell = cellMatrix[`${c}_${d}`] || { a: 0, ap: 0, v: 0, ag: 0, vi: 0 };
                        const val = cell[metricKey];
                        totMetric += val;
                        totalDiarioList[d] += cell.a; // KPIs de produção continuam por análises
                        totalDiaA[d] += cell.a; totalDiaAp[d] += cell.ap; totalDiaV[d] += cell.v;
                        totalDiaAg[d] += cell.ag; totalDiaVi[d] += cell.vi;

                        const ehHojeCol = d === diaHojeIdx;
                        const badgeClass = getHeatBadgeClass(val);
                        cellsHtml += `
                            <td onclick="openCalendarCellDetail('${cEsc}', ${d}, '${activeMonth}', ${yearNum})" class="p-1.5 border-l text-center cursor-pointer transition ${ehHojeCol ? 'bg-sky-500/10 border-sky-400/70 border-x-2' : 'border-slate-800/40 hover:bg-slate-800/30'}">
                                <span class="inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-extrabold ${badgeClass}">${val > 0 ? val : ''}</span>
                            </td>`;
                    }

                    const mediaDia = maxDia > 0 ? (totMetric / maxDia) : 0;
                    const ultimaAt = calendarDimension === 'corretor' ? ultimaAtividadeCorretor[c] : null;
                    const ultimaAtLbl = ultimaAt ? `${String(ultimaAt.getDate()).padStart(2, '0')}/${String(ultimaAt.getMonth() + 1).padStart(2, '0')}` : '–';

                    const totalClick = totMetric > 0 ? `onclick="openCalendarCorretorDetail('${cEsc}', '${activeMonth}', ${yearNum})" class="p-3 text-right font-extrabold text-${cor}-400 border-l border-slate-800 bg-slate-950/40 cursor-pointer hover:bg-slate-800/60 transition" title="Ver todos os clientes do mês"` : `class="p-3 text-right font-extrabold text-${cor}-400 border-l border-slate-800 bg-slate-950/40"`;

                    let corretorRowHtml = `<tr class="cal-data-row ${calendarDimension === 'corretor' ? 'cal-corretor-row' : 'cal-equipe-row'} hover:bg-slate-900/10 transition">`;
                    corretorRowHtml += calendarDimension === 'equipe' ? `
                        <td onclick="toggleCalRowHighlight(this)" title="Clique para destacar a equipe vinculada no organograma" class="p-2.5 pl-4 text-left bg-slate-950 sticky left-0 border-r border-slate-800/60 z-10 cursor-pointer hover:bg-slate-900/40 transition">
                            <div class="flex items-center gap-2.5">${medalhaRank(rank)}<span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-500/10 text-brand-400"><i class="fa-solid fa-people-group"></i></span><div class="min-w-0"><div class="font-bold text-slate-200 text-[13px] truncate max-w-[140px]">Equipe ${orgEsc(c)}</div><div class="text-[10px] text-slate-500">${orgEsc(organograma.find(n => n.role === 'Gerente' && rankingTeamKey(n.equipe || n.name) === rankingTeamKey(c))?.name || '')}</div></div></div>
                        </td>` : `
                        <td onclick="toggleCalRowHighlight(this)" title="Clique para destacar a linha · ${st.title}" class="p-2.5 pl-4 text-left bg-slate-950 sticky left-0 border-r border-slate-800/60 z-10 cursor-pointer hover:bg-slate-900/40 transition">
                            <div class="flex items-center gap-2.5">
                                ${medalhaRank(rank)}
                                ${corretorAvatarInner(c, 'h-8 w-8 flex-shrink-0', 'text-[10px]')}
                                <div class="min-w-0">
                                    <div class="font-bold text-slate-200 text-[13px] truncate max-w-[140px]">${c}</div>
                                    <div class="flex items-center gap-1 text-[10px] font-bold ${stColor.text}"><i class="fa-solid ${st.icon} text-[9px] ${stColor.icon}"></i>${st.label}</div>
                                </div>
                            </div>
                        </td>`;
                    corretorRowHtml += cellsHtml;
                    corretorRowHtml += `<td ${totalClick}>${totMetric}</td>`;
                    corretorRowHtml += `<td class="p-3 text-right font-semibold text-slate-400 border-l border-slate-800 bg-slate-950/40">${mediaDia.toFixed(2).replace('.', ',')}</td>`;
                    if (calendarDimension === 'corretor') {
                        corretorRowHtml += `<td class="p-3 text-center text-slate-400 border-l border-slate-800 bg-slate-950/40">${ultimaAtLbl}</td>`;
                        corretorRowHtml += `<td class="p-3 pr-4 text-center border-l border-slate-800 bg-slate-950/40" title="${st.title}"><i class="fa-solid ${st.icon} ${stColor.icon}"></i></td>`;
                    }
                    corretorRowHtml += `</tr>`;
                    tableBody.insertAdjacentHTML('beforeend', corretorRowHtml);
                });

                const totalDiaMetric = { analises: totalDiaA, aprovados: totalDiaAp, vendas: totalDiaV, agendamentos: totalDiaAg, visitas: totalDiaVi }[calendarMetric];

                let totalRowHtml = `<tr class="bg-slate-950 font-bold border-t border-slate-700 text-white">`;
                totalRowHtml += `<td class="p-3 pl-4 text-left text-xs uppercase font-extrabold tracking-wider bg-slate-950 sticky left-0 border-r border-slate-800 z-10">Total Geral</td>`;

                let somaMetric = 0;
                for (let d = 1; d <= maxDia; d++) {
                    const v = totalDiaMetric[d];
                    somaMetric += v;
                    let totalClass = "text-slate-400";
                    if (v > 5) totalClass = `text-${cor}-400 font-black`;
                    if (v === 0) totalClass = "text-slate-600 font-normal";
                    const ehHojeCol = d === diaHojeIdx;
                    const clickAttr = v > 0 ? `onclick="openCalendarDayDetail(${d}, '${activeMonth}', ${yearNum})" class="p-2 text-center text-xs border-l cursor-pointer hover:bg-slate-800/60 transition ${totalClass} ${ehHojeCol ? 'bg-sky-500/10 border-sky-400/70 border-x-2' : 'border-slate-800'}"` : `class="p-2 text-center text-xs border-l ${totalClass} ${ehHojeCol ? 'bg-sky-500/10 border-sky-400/70 border-x-2' : 'border-slate-800'}"`;
                    totalRowHtml += `<td ${clickAttr}>${v}</td>`;
                }

                totalRowHtml += `<td onclick="openCalendarMonthDetail('${activeMonth}', ${yearNum})" class="p-3 text-right font-black text-${cor}-400 bg-slate-950 border-l border-slate-800 cursor-pointer hover:bg-slate-800/60 transition">${somaMetric}</td>`;
                if (calendarDimension === 'corretor') {
                    totalRowHtml += `<td class="border-l border-slate-800 bg-slate-950"></td>`;
                    totalRowHtml += `<td class="border-l border-slate-800 bg-slate-950"></td>`;
                }
                totalRowHtml += `<td class="border-l border-slate-800 bg-slate-950"></td>`;
                totalRowHtml += `</tr>`;
                tableBody.insertAdjacentHTML('beforeend', totalRowHtml);
            }

            // ===== 5 CARDS DE INDICADORES =====
            document.getElementById('calKpiAnalisesMes').textContent = calDetail.analises.month.length;
            document.getElementById('calKpiAprovadosMes').textContent = calDetail.aprovados.month.length;
            document.getElementById('calKpiVendasMes').textContent = calDetail.vendas.month.length;
            document.getElementById('calKpiAgendamentosMes').textContent = calDetail.agendamentos.month.length;
            document.getElementById('calKpiVisitasMes').textContent = calDetail.visitas.month.length;

            const corretoresComAnalise = new Set(calDetail.analises.month.filter(r => activeSet.has(r.Corretor)).map(r => r.Corretor)).size;
            document.getElementById('calKpiCorretoresAtivos').textContent = `${corretoresComAnalise} / ${activeCorretores.length}`;

            let melhorSequencia = 0, melhorSequenciaCorretor = null;
            activeCorretores.forEach(c => {
                const st = statusInfo(c);
                if (st.tag === 'green' && st.value > melhorSequencia) { melhorSequencia = st.value; melhorSequenciaCorretor = c; }
            });
            document.getElementById('calKpiMelhorSequencia').textContent = melhorSequencia;
            document.getElementById('calKpiMelhorSequenciaSub').textContent = melhorSequenciaCorretor ? `${melhorSequenciaCorretor} · dias consecutivos` : 'Dias consecutivos';
        }

        function atualizarLegendaCalendario() {
            const leg = document.getElementById('calendarLegend');
            if (!leg) return;
            const m = CAL_METRICS[calendarMetric];
            const singular = m.label.toLowerCase().replace(/s$/, '');
            leg.innerHTML = `
                <span class="text-slate-500 uppercase tracking-wider">Legenda:</span>
                <span class="inline-flex items-center gap-1.5"><span class="inline-block w-4 h-4 rounded bg-slate-800/60 border border-slate-700"></span>0 Nenhuma</span>
                <span class="inline-flex items-center gap-1.5"><span class="inline-block w-4 h-4 rounded bg-amber-400"></span>1 ${singular}</span>
                <span class="inline-flex items-center gap-1.5"><span class="inline-block w-4 h-4 rounded bg-orange-500"></span>2 ${m.label.toLowerCase()}</span>
                <span class="inline-flex items-center gap-1.5"><span class="inline-block w-4 h-4 rounded bg-rose-600"></span>3+ ${m.label.toLowerCase()}</span>`;
        }

        // Cor do badge de cada célula do mapa de calor: 0=vazio, 1=amarelo, 2=laranja, 3+=vermelho.
        function getHeatBadgeClass(qty) {
            if (qty <= 0) return 'text-slate-700';
            if (qty === 1) return 'bg-amber-400 text-slate-900';
            if (qty === 2) return 'bg-orange-500 text-white';
            return 'bg-rose-600 text-white';
        }

        // Renderiza o modal de detalhes do calendário (genérico)
        // Dados do detalhamento atualmente aberto — usados pelos botões de exportar Excel/PDF.
        let currentDetailRows = [];
        let currentDetailTitle = 'detalhamento';
        // Modo LEADS (31/10/2026): quando todas as linhas são leads do CRM (ID "OP-..."), o modal
        // troca pra um layout próprio — Cliente+ranking, Contato (WhatsApp/e-mail), Corretor,
        // Origem/Empreendimento, Data e Situação — com filtro por ranking. Construtora/VGV somem
        // (lead não tem). Exportar Excel/PDF leva essas mesmas colunas (e respeita o filtro).
        let detailLeadsTodos = [];
        let detailLeadsFiltro = '';
        const DETAIL_HEAD_PADRAO = `
            <th class="p-2 pl-3">Cliente</th>
            <th class="p-2">Corretor · Equipe</th>
            <th class="p-2">Construtora · Empreendimento</th>
            <th class="p-2">Datas</th>
            <th class="p-2">Situação</th>
            <th class="p-2 text-right pr-3">VGV</th>`;

        // ===== Modo PRODUÇÃO (análises / aprovados / vendas / calendário / rankings) =====
        // Filtros combináveis por Status (Venda, Aprovado, Pendente, Reprovado, Outros) e por
        // Construtora; faixa de resumo (qtde por status + VGV); mais recentes primeiro.
        let detailProdTodos = [];
        let detailProdStatus = '';
        let detailProdConstrutora = '';
        let detailProdShowCorretor = true;
        const sitProd = r => String(r['Situação - Analise'] || r['Situação'] || '').trim();
        // Linha da Agenda de Visitas (tem Horário + Status, sem Data Cadastro da planilha principal).
        const ehAgendaProd = r => !!r && 'Horário' in r && 'Status' in r && !('Data Cadastro' in r);
        const equipeProd = r => r.Equipe || (ehAgendaProd(r) && typeof getRankingTeamForBroker === 'function' ? getRankingTeamForBroker(r.Corretor) : '') || '';
        const dataAgendaBr = v => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v || ''); };
        function statusProd(r) {
            if (ehAgendaProd(r)) {
                const st = stripDiacritics(String(r.Status || '')).toLowerCase();
                return /nao.?compar/.test(st) ? 'nao_compareceu' : /compar/.test(st) ? 'compareceu' : 'agendada';
            }
            if (typeof isGanho === 'function' && isGanho(r)) return 'venda';
            const t = stripDiacritics(sitProd(r)).toLowerCase();
            if (isAprovado(sitProd(r)) || /^aprovad/.test(t)) return 'aprovado';
            if (/reprov|recus|negad/.test(t)) return 'reprovado';
            if (/bacen/.test(t)) return 'bacen';
            if (/pend|anali|condic|aguard|document|tratativa/.test(t)) return 'pendente';
            return 'outro';
        }
        const STATUS_PROD = {
            venda: { nome: 'Vendas', icone: 'fa-handshake', cor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
            aprovado: { nome: 'Aprovados', icone: 'fa-circle-check', cor: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
            pendente: { nome: 'Pendentes', icone: 'fa-hourglass-half', cor: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
            reprovado: { nome: 'Reprovados', icone: 'fa-circle-xmark', cor: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
            bacen: { nome: 'BACEN', icone: 'fa-building-columns', cor: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
            agendada: { nome: 'Agendadas', icone: 'fa-calendar-check', cor: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
            compareceu: { nome: 'Compareceram', icone: 'fa-user-check', cor: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
            nao_compareceu: { nome: 'Não compareceram', icone: 'fa-user-xmark', cor: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
            outro: { nome: 'Outros', icone: 'fa-circle', cor: 'bg-slate-800 text-slate-300 border-slate-700' }
        };
        const construtoraChave = r => stripDiacritics(String(r.Construtora || '').trim()).toLowerCase() || 'sem';
        const passaProdStatus = r => !detailProdStatus || statusProd(r) === detailProdStatus;
        const passaProdConstrutora = r => !detailProdConstrutora || construtoraChave(r) === detailProdConstrutora;
        const vgvNum = r => parseFloat(r.VGV) || 0;

        // Filtros da venda (combinam com Status/Construtora/busca): Venda (Finalizadas × Informadas,
        // mesma regra do toggle do painel), Etapa ("Situação - Ganho" sem o "Ganho - ") e os seletores
        // de Equipe, Corretor e Empreendimento. Cada opção conta o que passa nos OUTROS filtros.
        let detailProdFiltros = { venda: '', etapa: '', equipe: '', corretor: '', empreendimento: '' };
        const chaveProd = v => stripDiacritics(String(v || '').trim()).toLowerCase().replace(/\s+/g, ' ');
        const etapaVenda = r => isGanho(r) ? String(r['Situação - Ganho'] || '').replace(/^\s*Ganho\s*-\s*/i, '').trim() : '';
        const tipoVenda = r => !isGanho(r) ? '' : (/venda informada/i.test(r['Situação - Ganho'] || '') ? 'informadas' : 'finalizadas');
        const DIMS_PROD = {
            venda: tipoVenda,
            etapa: r => chaveProd(etapaVenda(r)),
            equipe: r => chaveProd(equipeProd(r)),
            corretor: r => chaveProd(r.Corretor),
            empreendimento: r => chaveProd(r.Empreendimento)
        };
        const passaProdFiltros = (r, exceto) => Object.keys(DIMS_PROD).every(d => d === exceto || !detailProdFiltros[d] || DIMS_PROD[d](r) === detailProdFiltros[d]);
        const haFiltroProd = () => Object.values(detailProdFiltros).some(Boolean);

        function renderDetailProdChips() {
            const el = document.getElementById('detailLeadsChips'); if (!el) return;
            const chip = (fn, k, ativo, rotulo, n, cor) => `<button onclick="${fn}('${k}')" class="text-[10px] font-bold px-2 py-1 rounded-lg border transition ${ativo ? 'ring-2 ring-white/50 ' : 'opacity-75 hover:opacity-100 '}${cor}">${rotulo} <span class="ml-0.5 text-white">${n}</span></button>`;
            const linha = (titulo, conteudo) => `<div class="flex flex-wrap items-center gap-1.5"><span class="w-[78px] shrink-0 text-[10px] font-bold text-slate-500 uppercase tracking-wider">${titulo}</span>${conteudo}</div>`;

            const baseS = detailProdTodos.filter(r => passaBusca(r) && passaProdConstrutora(r) && passaProdFiltros(r));
            const contS = {}; baseS.forEach(r => { const k = statusProd(r); contS[k] = (contS[k] || 0) + 1; });
            const st = chip('filtrarDetailProdStatus', '', !detailProdStatus, 'Todos', baseS.length, 'bg-slate-800 text-slate-200 border-slate-700')
                + Object.keys(STATUS_PROD).filter(k => contS[k]).map(k => chip('filtrarDetailProdStatus', k, detailProdStatus === k, `<i class="fa-solid ${STATUS_PROD[k].icone} mr-1"></i>${STATUS_PROD[k].nome}`, contS[k], STATUS_PROD[k].cor)).join('');

            const baseC = detailProdTodos.filter(r => passaBusca(r) && passaProdStatus(r) && passaProdFiltros(r));
            const contC = {}, rotC = {};
            baseC.forEach(r => { const k = construtoraChave(r); contC[k] = (contC[k] || 0) + 1; if (!rotC[k]) rotC[k] = String(r.Construtora || '').trim() || 'Sem construtora'; });
            const cks = Object.keys(contC).sort((a, b) => (a === 'sem') - (b === 'sem') || contC[b] - contC[a]);
            const co = chip('filtrarDetailProdConstrutora', '', !detailProdConstrutora, 'Todas', baseC.length, 'bg-slate-800 text-slate-200 border-slate-700')
                + cks.map(k => chip('filtrarDetailProdConstrutora', k.replace(/'/g, "\\'"), detailProdConstrutora === k, escDet(rotC[k]), contC[k], 'bg-violet-500/10 text-violet-300 border-violet-500/25')).join('');

            const baseDim = d => detailProdTodos.filter(r => passaBusca(r) && passaProdStatus(r) && passaProdConstrutora(r) && passaProdFiltros(r, d));
            const CHIP_NEUTRO = 'bg-slate-800 text-slate-200 border-slate-700';

            // Venda: Finalizadas × Informadas · Etapa: só quando há mais detalhe que isso
            const baseV = baseDim('venda').filter(r => isGanho(r));
            const nFin = baseV.filter(r => tipoVenda(r) === 'finalizadas').length, nInf = baseV.length - nFin;
            const ven = baseV.length ? chip('filtrarDetailProdDim', "venda','", !detailProdFiltros.venda, 'Todas', baseV.length, CHIP_NEUTRO)
                + chip('filtrarDetailProdDim', "venda','finalizadas", detailProdFiltros.venda === 'finalizadas', '<i class="fa-solid fa-circle-check mr-1"></i>Finalizadas', nFin, 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30')
                + chip('filtrarDetailProdDim', "venda','informadas", detailProdFiltros.venda === 'informadas', '<i class="fa-solid fa-bullhorn mr-1"></i>Informadas', nInf, 'bg-amber-500/15 text-amber-300 border-amber-500/30') : '';
            const baseE = baseDim('etapa').filter(r => isGanho(r));
            const contE = {}, rotE = {};
            baseE.forEach(r => { const k = DIMS_PROD.etapa(r) || 'sem etapa'; contE[k] = (contE[k] || 0) + 1; if (!rotE[k]) rotE[k] = etapaVenda(r) || 'Sem etapa'; });
            const eks = Object.keys(contE).filter(k => k !== 'sem etapa').sort((a, b) => contE[b] - contE[a]);
            const eta = chip('filtrarDetailProdDim', "etapa','", !detailProdFiltros.etapa, 'Todas', baseE.length, CHIP_NEUTRO)
                + eks.map(k => chip('filtrarDetailProdDim', `etapa','${encodeURIComponent(k).replace(/'/g, '%27')}`, detailProdFiltros.etapa === k, escDet(rotE[k]), contE[k], 'bg-teal-500/10 text-teal-300 border-teal-500/25')).join('');

            // Equipe, Corretor e Empreendimento em seletores: podem ter muitas opções
            const seletor = (dim, titulo, campo) => {
                const cont = {}, rot = {};
                baseDim(dim).forEach(r => { const k = DIMS_PROD[dim](r); if (!k) return; cont[k] = (cont[k] || 0) + 1; if (!rot[k]) rot[k] = String(campo === 'Equipe' ? equipeProd(r) : r[campo]).trim(); });
                const ks = Object.keys(cont).sort((a, b) => rot[a].localeCompare(rot[b], 'pt-BR'));
                if (ks.length < 2 && !detailProdFiltros[dim]) return '';
                const ativo = !!detailProdFiltros[dim];
                return `<label class="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">${titulo}
                    <select onchange="filtrarDetailProdDim('${dim}', encodeURIComponent(this.value))" class="max-w-[190px] bg-slate-900 border ${ativo ? 'border-emerald-500/60 text-emerald-200' : 'border-slate-700 text-slate-300'} rounded-lg px-1.5 py-1 text-[11px] font-semibold normal-case tracking-normal outline-none">
                        <option value="">Todos</option>
                        ${ks.map(k => `<option value="${escDet(k)}" ${detailProdFiltros[dim] === k ? 'selected' : ''}>${escDet(rot[k])} (${cont[k]})</option>`).join('')}
                    </select></label>`;
            };
            const seletores = [seletor('equipe', 'Equipe', 'Equipe'), seletor('corretor', 'Corretor', 'Corretor'), seletor('empreendimento', 'Empreend.', 'Empreendimento')].filter(Boolean).join('');
            const limpar = haFiltroProd() ? `<button onclick="limparFiltrosDetailProd()" class="text-[10px] font-bold text-rose-300 hover:text-rose-200 px-2 py-1"><i class="fa-solid fa-xmark mr-1"></i>Limpar filtros</button>` : '';

            const vis = detailProdTodos.filter(r => passaBusca(r) && passaProdStatus(r) && passaProdConstrutora(r) && passaProdFiltros(r));
            const vgv = vis.reduce((a, r) => a + vgvNum(r), 0);
            const resumo = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-1">
                ${(vis.length && vis.every(ehAgendaProd) ? ['agendada', 'compareceu', 'nao_compareceu'] : ['venda', 'aprovado', 'pendente', 'reprovado']).map(k => { const n = vis.filter(r => statusProd(r) === k).length; return `<div class="rounded-lg border ${STATUS_PROD[k].cor} px-2.5 py-1"><div class="text-[9px] uppercase font-bold tracking-wider opacity-80"><i class="fa-solid ${STATUS_PROD[k].icone} mr-1"></i>${STATUS_PROD[k].nome}</div><div class="text-base font-black text-white leading-tight">${n}</div></div>`; }).join('')}
            </div>${vgv > 0 ? `<div class="text-[11px] text-slate-400 mb-1">VGV do recorte: <b class="text-indigo-300">${formatCurrency(vgv)}</b></div>` : ''}`;

            el.innerHTML = `<div class="w-full space-y-1.5 bg-slate-950/50 border border-slate-800 rounded-lg p-2">${resumo}${linha('Status', st)}${ven ? linha('Venda', ven) : ''}${eks.length > 2 ? linha('Etapa', eta) : ''}${cks.length > 1 ? linha('Construtora', co) : ''}${seletores || limpar ? `<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">${seletores}${limpar}</div>` : ''}</div>`;
        }
        function renderDetailProdRows() {
            const tableBody = document.getElementById('detailTableBody');
            const rows = currentDetailRows;
            if (!rows.length) { tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">${detailProdTodos.length ? (detailBusca ? `Nada encontrado pra "${escDet(detailBusca)}" com esses filtros.` : 'Nenhum cliente com esses filtros.') : 'Nenhum cliente neste recorte.'}</td></tr>`; }
            else tableBody.innerHTML = rows.slice(0, DETAIL_MAX_LINHAS).map(r => {
                const k = statusProd(r), sit = sitProd(r) || '-';
                const agenda = ehAgendaProd(r);
                const datas = (agenda
                    ? [['Agendado em', String(r['Data de Cadastro'] || '').split(' ')[0]], ['Visita', `${dataAgendaBr(r.Data)}${r['Horário'] ? ' ' + r['Horário'] : ''}`]]
                    : [['Análise', r['Data Cadastro']], ['Aprovação', r['Data Aprovação']], ['Venda', r['Data Ganho']]])
                    .filter(d => d[1]).map(d => `<div class="whitespace-nowrap"><span class="text-slate-500">${d[0]}:</span> <span class="text-slate-300">${escDet(d[1])}</span></div>`).join('') || '<span class="text-slate-600">-</span>';
                const vg = vgvNum(r);
                return `
                    <tr class="hover:bg-slate-950 transition align-top">
                        <td class="p-2.5 pl-3">
                            <div class="font-bold text-slate-100 text-[12px] leading-tight">${escDet(r.Cliente || '-')}</div>
                            <div class="text-[9px] text-slate-600 font-mono mt-0.5">${escDet(String(r.ID || '-').replace(/^#?/, '#'))}</div>
                        </td>
                        <td class="p-2.5 text-[11px]">
                            <div class="font-semibold text-slate-200">${escDet(r.Corretor || '-')}</div>
                            ${equipeProd(r) ? `<div class="text-[10px] text-slate-500 uppercase tracking-wide">${escDet(equipeProd(r))}</div>` : ''}
                        </td>
                        <td class="p-2.5 text-[11px]">
                            ${r.Construtora ? `<span class="inline-block text-[9px] font-bold uppercase tracking-wide text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded px-1.5 py-0.5 mb-1">${escDet(r.Construtora)}</span>` : ''}
                            <div class="text-slate-300 leading-snug max-w-[220px]">${escDet(r.Empreendimento || '-')}</div>
                            ${agenda && r.Local ? `<div class="text-[10px] text-slate-500 mt-0.5"><i class="fa-solid fa-location-dot mr-1"></i>${escDet(r.Local)}</div>` : ''}
                        </td>
                        <td class="p-2.5 text-[10px] leading-relaxed">${datas}</td>
                        <td class="p-2.5">
                            <span class="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide rounded border px-1.5 py-0.5 ${STATUS_PROD[k].cor}"><i class="fa-solid ${STATUS_PROD[k].icone}"></i>${k === 'venda' ? 'Venda' : agenda ? { agendada: 'Agendada', compareceu: 'Compareceu', nao_compareceu: 'Não compareceu' }[k] : escDet(sit)}</span>
                            ${agenda && sit && sit !== '-' ? `<div class="text-[9px] text-slate-500 mt-1">${escDet(sit)}</div>` : ''}
                            ${agenda && r['Observações'] ? `<div class="text-[9px] text-slate-500 mt-0.5 max-w-[180px]">${escDet(r['Observações'])}</div>` : ''}
                            ${k === 'venda' && sit && sit !== '-' ? `<div class="text-[9px] text-slate-500 mt-1">${escDet(sit)}</div>` : ''}
                            ${k === 'venda' && r['Situação - Ganho'] ? `<div class="text-[9px] text-emerald-400/70 mt-0.5">${escDet(r['Situação - Ganho'])}</div>` : ''}
                        </td>
                        <td class="p-2.5 pr-3 text-right text-[11px] font-bold whitespace-nowrap ${vg > 0 ? 'text-indigo-300' : 'text-slate-600'}">${vg > 0 ? formatCurrency(vg) : '—'}</td>
                    </tr>`;
            }).join('') + avisoMaisLinhas(rows.length);
            const total = document.getElementById('detailCorrTotal');
            if (total && (detailBusca || detailProdStatus || detailProdConstrutora || haFiltroProd())) total.textContent = `${rows.length} de ${detailProdTodos.length}`;
            else if (total && detailProdTotalLabel) total.textContent = detailProdTotalLabel;
        }
        let detailProdTotalLabel = '';
        function aplicarFiltrosDetailProd() {
            currentDetailRows = detailProdTodos.filter(r => passaBusca(r) && passaProdStatus(r) && passaProdConstrutora(r) && passaProdFiltros(r));
            renderDetailProdChips();
            renderDetailProdRows();
        }
        function filtrarDetailProdStatus(k) { detailProdStatus = (k && detailProdStatus === k) ? '' : k; aplicarFiltrosDetailProd(); }
        function filtrarDetailProdConstrutora(k) { detailProdConstrutora = (k && detailProdConstrutora === k) ? '' : k; aplicarFiltrosDetailProd(); }
        function filtrarDetailProdDim(dim, valor) {
            const v = decodeURIComponent(valor || '');
            detailProdFiltros[dim] = (v && detailProdFiltros[dim] === v && dim !== 'equipe' && dim !== 'corretor' && dim !== 'empreendimento') ? '' : v;
            aplicarFiltrosDetailProd();
        }
        function limparFiltrosDetailProd() {
            detailProdFiltros = { venda: '', etapa: '', equipe: '', corretor: '', empreendimento: '' };
            aplicarFiltrosDetailProd();
        }
        const DETAIL_HEAD_LEADS = `
            <th class="p-2 pl-3">Cliente</th>
            <th class="p-2">Contato</th>
            <th class="p-2">Corretor</th>
            <th class="p-2">Origem · Empreendimento</th>
            <th class="p-2">Criado em</th>
            <th class="p-2 pr-3">Fase</th>`;

        const ehLeadCrm = r => /^(OP|DV|C2S)-./i.test(String(r && r.ID || '')); // OP = Excel do Salesforce · DV = PDF do DV On · C2S = Excel do C2S
        const escDet = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        // "Ouro🥇" → { nome: 'Ouro', chave: 'ouro', emoji: '🥇' }
        function rankingLead(r) {
            const txt = String(r && r.Ranking || '').trim();
            const nome = txt.replace(/[^A-Za-zÀ-ÿ\s]/g, '').trim();
            const emoji = txt.replace(/[A-Za-zÀ-ÿ\s]/g, '').trim();
            return { txt, nome, emoji, chave: stripDiacritics(nome).toLowerCase() };
        }
        const RANKING_ORDEM = ['diamante', 'ouro', 'prata', 'bronze', 'aco'];
        const RANKING_COR = {
            diamante: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
            ouro: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
            prata: 'bg-slate-400/15 text-slate-200 border-slate-400/30',
            bronze: 'bg-orange-700/20 text-orange-300 border-orange-600/30',
            aco: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
        };
        function rankingBadge(r) {
            const rk = rankingLead(r);
            if (!rk.txt) return '';
            const cor = RANKING_COR[rk.chave] || 'bg-slate-700/30 text-slate-300 border-slate-600/40';
            return `<span class="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${cor}" title="Ranking do lead no CRM">${escDet(rk.nome || rk.txt)} ${rk.emoji}</span>`;
        }
        function contatoDoLead(r) {
            return (typeof contatoProspeccao === 'function' && contatoProspeccao(r.ID)) || {};
        }
        function linkWhatsApp(tel) {
            const d = String(tel || '').replace(/\D/g, '');
            return d ? `https://wa.me/${d.length <= 11 ? '55' + d : d}` : '';
        }

        function setDetailLayout(leads) {
            const head = document.getElementById('detailTableHead');
            if (head) head.innerHTML = leads ? DETAIL_HEAD_LEADS : DETAIL_HEAD_PADRAO;
            const box = document.getElementById('detailModalBox');
            if (box) { box.classList.remove('max-w-2xl'); box.classList.add('max-w-5xl'); }
            const wrap = document.getElementById('detailTableWrap');
            if (wrap) wrap.classList.remove('max-h-64');
            const chips = document.getElementById('detailLeadsChips');
            if (chips) chips.classList.remove('hidden');
        }

        // Filtros do modo LEADS (combinam entre si): Separação (Todos / Bolsão / Fora do bolsão,
        // pela "Tag Bolsão" do Excel do CRM), Fonte (Origem: Lead ADS, WhatsApp, DV On...) e
        // Ranking. Cada linha de chips conta os leads que passam nos OUTROS filtros ativos.
        let detailLeadsFonte = '';
        let detailLeadsBolsao = '';   // '' | 'bolsao' | 'fora'
        let detailLeadsSistema = '';  // '' | 'salesforce' | 'dvon'
        let detailLeadsFase = '';     // Fase da oportunidade (coluna "FASES DA OPORTUNIDADE" do Salesforce)
        // Sistema de origem do lead: Excel = Salesforce (ID "OP-..."), PDF = DV On (ID "DV-...").
        const sistemaLead = r => { const id = String(r && r.ID || ''); return /^DV-/i.test(id) ? 'dvon' : /^C2S-/i.test(id) ? 'c2s' : 'salesforce'; };
        const SISTEMA_INFO = {
            salesforce: { nome: 'Salesforce', icone: 'fa-cloud', cor: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
            dvon: { nome: 'DV On', icone: 'fa-comments', cor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
            c2s: { nome: 'C2S', icone: 'fa-bullseye', cor: 'bg-orange-500/15 text-orange-300 border-orange-500/30' }
        };
        const passaSistema = r => !detailLeadsSistema || sistemaLead(r) === detailLeadsSistema;
        const ehBolsao = r => /bols/i.test(String(r && r.Tag || ''));
        const fonteChave = r => stripDiacritics(String(r && r.Origem || '').trim()).toLowerCase() || 'sem';
        const passaBolsao0 = r => !detailLeadsBolsao || (detailLeadsBolsao === 'bolsao' ? ehBolsao(r) : !ehBolsao(r));
        const passaBolsao = r => passaBolsao0(r);
        const passaFonte = r => !detailLeadsFonte || fonteChave(r) === detailLeadsFonte;
        const faseChave = r => stripDiacritics(String(r && r['Situação'] || '').trim()).toLowerCase().replace(/\s+/g, ' ') || 'sem';
        const passaFase = r => !detailLeadsFase || faseChave(r) === detailLeadsFase;
        // Cor da fase: perdido = vermelho, crédito/aprovado/venda = verde, aguardando/pendente = âmbar,
        // concluído/encerrado = cinza, em atendimento e demais = azul.
        const corFase = t => {
            const x = stripDiacritics(String(t || '')).toLowerCase();
            if (/perdid|descart|cancel/.test(x)) return 'bg-rose-500/10 text-rose-300 border-rose-500/25';
            if (/credito|aprov|venda|ganh|contrat/.test(x)) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
            if (/aguard|pendente/.test(x)) return 'bg-amber-500/10 text-amber-300 border-amber-500/25';
            if (/encerr|conclu/.test(x)) return 'bg-slate-800/60 text-slate-400 border-slate-700';
            return 'bg-sky-500/10 text-sky-300 border-sky-500/25';
        };
        const passaRanking = r => !detailLeadsFiltro || (rankingLead(r).chave || 'sem') === detailLeadsFiltro;
        // Seletores de Equipe, Corretor e Empreendimento (mesmo padrão da janela de produção). A equipe
        // vem do organograma; lead de quem não tem equipe fica em "Regional (sem equipe)", como no ranking.
        let detailLeadsSel = { equipe: '', corretor: '', empreendimento: '' };
        const equipeLead = r => r.Equipe || (typeof getRankingTeamForBroker === 'function' && r.Corretor ? getRankingTeamForBroker(r.Corretor) : '') || 'Regional (sem equipe)';
        const ROTULO_LEADS_SEL = { equipe: equipeLead, corretor: r => r.Corretor, empreendimento: r => r.Empreendimento };
        const passaLeadsSel = (r, exceto) => Object.keys(ROTULO_LEADS_SEL).every(d => d === exceto || !detailLeadsSel[d] || chaveProd(ROTULO_LEADS_SEL[d](r)) === detailLeadsSel[d]);

        function renderDetailLeadsChips() {
            const el = document.getElementById('detailLeadsChips'); if (!el) return;
            const chip = (fn, k, ativo, rotulo, n, cor) => `<button onclick="${fn}('${k}')" class="text-[10px] font-bold px-2 py-1 rounded-lg border transition ${ativo ? 'ring-2 ring-white/50 ' : 'opacity-75 hover:opacity-100 '}${cor}">${rotulo} <span class="ml-0.5 text-white">${n}</span></button>`;
            const linha = (titulo, conteudo) => `<div class="flex flex-wrap items-center gap-1.5"><span class="w-[78px] shrink-0 text-[10px] font-bold text-slate-500 uppercase tracking-wider">${titulo}</span>${conteudo}</div>`;

            const leadsBuscados = detailLeadsTodos.filter(r => passaBusca(r) && passaLeadsSel(r));
            // 1) Separação por bolsão
            const baseB = leadsBuscados.filter(r => passaSistema(r) && passaFonte(r) && passaRanking(r) && passaFase(r));
            const nB = baseB.filter(ehBolsao).length;
            const temTag = detailLeadsTodos.some(ehBolsao);
            const sep = chip('filtrarDetailLeadsBolsao', '', !detailLeadsBolsao, 'Todos', baseB.length, 'bg-slate-800 text-slate-200 border-slate-700')
                + chip('filtrarDetailLeadsBolsao', 'bolsao', detailLeadsBolsao === 'bolsao', '<i class="fa-solid fa-box-archive mr-1"></i>Bolsão', nB, 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30')
                + chip('filtrarDetailLeadsBolsao', 'fora', detailLeadsBolsao === 'fora', 'Fora do bolsão', baseB.length - nB, 'bg-slate-900 text-slate-400 border-slate-700')
                + (temTag ? '' : '<span class="text-[10px] text-slate-500 ml-1">(anexe de novo o Excel do Salesforce pra trazer a Tag Bolsão)</span>');

            // 2) Fontes (Origem)
            const baseF = leadsBuscados.filter(r => passaSistema(r) && passaBolsao(r) && passaRanking(r) && passaFase(r));
            const contF = {}, rotF = {};
            baseF.forEach(r => { const k = fonteChave(r); contF[k] = (contF[k] || 0) + 1; if (!rotF[k]) rotF[k] = String(r.Origem || '').trim() || 'Sem fonte'; });
            const fontes = Object.keys(contF).sort((a, b) => (a === 'sem') - (b === 'sem') || contF[b] - contF[a]);
            const fon = chip('filtrarDetailLeadsFonte', '', !detailLeadsFonte, 'Todas', baseF.length, 'bg-slate-800 text-slate-200 border-slate-700')
                + fontes.map(k => chip('filtrarDetailLeadsFonte', k.replace(/'/g, "\\'"), detailLeadsFonte === k, escDet(rotF[k]), contF[k], k === 'sem' ? 'bg-slate-900 text-slate-400 border-slate-700' : 'bg-violet-500/10 text-violet-300 border-violet-500/25')).join('');

            // 3) Ranking
            const baseR = leadsBuscados.filter(r => passaSistema(r) && passaBolsao(r) && passaFonte(r) && passaFase(r));
            const cont = {};
            baseR.forEach(r => { const k = rankingLead(r).chave || 'sem'; cont[k] = (cont[k] || 0) + 1; });
            const chaves = RANKING_ORDEM.filter(k => cont[k]).concat(Object.keys(cont).filter(k => !RANKING_ORDEM.includes(k) && k !== 'sem')).concat(cont.sem ? ['sem'] : []);
            const exemplo = k => detailLeadsTodos.find(r => (rankingLead(r).chave || 'sem') === k);
            const rk = chip('filtrarDetailLeads', '', !detailLeadsFiltro, 'Todos', baseR.length, 'bg-slate-800 text-slate-200 border-slate-700')
                + chaves.map(k => {
                    if (k === 'sem') return chip('filtrarDetailLeads', 'sem', detailLeadsFiltro === 'sem', 'Sem ranking', cont.sem, 'bg-slate-900 text-slate-400 border-slate-700');
                    const x = rankingLead(exemplo(k));
                    return chip('filtrarDetailLeads', k, detailLeadsFiltro === k, `${escDet(x.nome)} ${x.emoji}`, cont[k], RANKING_COR[k] || 'bg-slate-800 text-slate-300 border-slate-700');
                }).join('');

            // 0) Sistema (Salesforce = Excel · DV On = PDF)
            const baseS = leadsBuscados.filter(r => passaBolsao(r) && passaFonte(r) && passaRanking(r) && passaFase(r));
            const nS = { salesforce: 0, c2s: 0, dvon: 0 };
            baseS.forEach(r => nS[sistemaLead(r)]++);
            const sis = chip('filtrarDetailLeadsSistema', '', !detailLeadsSistema, 'Todos', baseS.length, 'bg-slate-800 text-slate-200 border-slate-700')
                + ['salesforce', 'c2s', 'dvon'].filter(k => nS[k] || detailLeadsSistema === k).map(k => chip('filtrarDetailLeadsSistema', k, detailLeadsSistema === k, `<i class="fa-solid ${SISTEMA_INFO[k].icone} mr-1"></i>${SISTEMA_INFO[k].nome}`, nS[k], SISTEMA_INFO[k].cor)).join('');

            // 4) Fase da oportunidade — em ordem do funil do CRM ("01 - ...", "02 - ...", "12 - ...")
            const baseFa = leadsBuscados.filter(r => passaSistema(r) && passaBolsao(r) && passaFonte(r) && passaRanking(r));
            const contFa = {}, rotFa = {};
            baseFa.forEach(r => { const k = faseChave(r); contFa[k] = (contFa[k] || 0) + 1; if (!rotFa[k]) rotFa[k] = String(r['Situação'] || '').trim() || 'Sem fase'; });
            const numFase = k => { const m = /^(\d+)/.exec(k); return m ? +m[1] : 999; };
            const fases = Object.keys(contFa).sort((a, b) => (a === 'sem') - (b === 'sem') || numFase(a) - numFase(b) || a.localeCompare(b));
            const fa = chip('filtrarDetailLeadsFase', '', !detailLeadsFase, 'Todas', baseFa.length, 'bg-slate-800 text-slate-200 border-slate-700')
                + fases.map(k => chip('filtrarDetailLeadsFase', k.replace(/'/g, "\\'"), detailLeadsFase === k, escDet(rotFa[k]), contFa[k], k === 'sem' ? 'bg-slate-900 text-slate-400 border-slate-700' : corFase(rotFa[k]))).join('');

            // Leads do Salesforce sem fase "NN - ..." = vieram de Excel antigo, sem a coluna FASES DA OPORTUNIDADE.
            const sfSemFase = detailLeadsTodos.filter(r => sistemaLead(r) === 'salesforce' && !/^\d+\s*-/.test(String(r['Situação'] || '').trim())).length;
            const avisoFase = sfSemFase ? `<span class="text-[10px] text-amber-300 ml-1"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${sfSemFase} lead(s) do Salesforce sem fase — anexe em Prospecção o Excel novo (com a coluna "FASES DA OPORTUNIDADE").</span>` : '';
            const passaChipsLeads = r => passaBusca(r) && passaSistema(r) && passaBolsao(r) && passaFonte(r) && passaRanking(r) && passaFase(r);
            const seletorLead = (dim, titulo) => {
                const cont = {}, rot = {};
                detailLeadsTodos.filter(r => passaChipsLeads(r) && passaLeadsSel(r, dim)).forEach(r => {
                    const rotulo = String(ROTULO_LEADS_SEL[dim](r) || '').trim(), k = chaveProd(rotulo);
                    if (!k) return;
                    cont[k] = (cont[k] || 0) + 1; if (!rot[k]) rot[k] = rotulo;
                });
                const ks = Object.keys(cont).sort((a, b) => rot[a].localeCompare(rot[b], 'pt-BR'));
                if (ks.length < 2 && !detailLeadsSel[dim]) return '';
                const ativo = !!detailLeadsSel[dim];
                return `<label class="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">${titulo}
                    <select onchange="filtrarDetailLeadsSel('${dim}', this.value)" class="max-w-[190px] bg-slate-900 border ${ativo ? 'border-emerald-500/60 text-emerald-200' : 'border-slate-700 text-slate-300'} rounded-lg px-1.5 py-1 text-[11px] font-semibold normal-case tracking-normal outline-none">
                        <option value="">Todos</option>
                        ${ks.map(k => `<option value="${escDet(k)}" ${detailLeadsSel[dim] === k ? 'selected' : ''}>${escDet(rot[k])} (${cont[k]})</option>`).join('')}
                    </select></label>`;
            };
            const seletoresLeads = [seletorLead('equipe', 'Equipe'), seletorLead('corretor', 'Corretor'), seletorLead('empreendimento', 'Empreend.')].filter(Boolean).join('');
            const limparLeads = Object.values(detailLeadsSel).some(Boolean) ? `<button onclick="limparSeletoresDetailLeads()" class="text-[10px] font-bold text-rose-300 hover:text-rose-200 px-2 py-1"><i class="fa-solid fa-xmark mr-1"></i>Limpar seleção</button>` : '';
            el.innerHTML = `<div class="w-full space-y-1.5 bg-slate-950/50 border border-slate-800 rounded-lg p-2">${linha('Sistema', sis)}${linha('Fase', fa + avisoFase)}${linha('Separar', sep)}${linha('Fonte', fon)}${linha('Ranking', rk)}${seletoresLeads || limparLeads ? `<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">${seletoresLeads}${limparLeads}</div>` : ''}</div>`;
        }
        function aplicarFiltrosDetailLeads() {
            currentDetailRows = detailLeadsTodos.filter(r => passaBusca(r) && passaSistema(r) && passaBolsao(r) && passaFonte(r) && passaRanking(r) && passaFase(r) && passaLeadsSel(r));
            renderDetailLeadsChips();
            renderDetailLeadsRows();
        }
        function filtrarDetailLeads(k) { detailLeadsFiltro = (k && detailLeadsFiltro === k) ? '' : k; aplicarFiltrosDetailLeads(); }
        function filtrarDetailLeadsFonte(k) { detailLeadsFonte = (k && detailLeadsFonte === k) ? '' : k; aplicarFiltrosDetailLeads(); }
        function filtrarDetailLeadsSistema(k) { detailLeadsSistema = (k && detailLeadsSistema === k) ? '' : k; aplicarFiltrosDetailLeads(); }
        function filtrarDetailLeadsFase(k) { detailLeadsFase = (k && detailLeadsFase === k) ? '' : k; aplicarFiltrosDetailLeads(); }
        function filtrarDetailLeadsSel(dim, valor) { detailLeadsSel[dim] = valor || ''; aplicarFiltrosDetailLeads(); }
        function limparSeletoresDetailLeads() { detailLeadsSel = { equipe: '', corretor: '', empreendimento: '' }; aplicarFiltrosDetailLeads(); }
        function filtrarDetailLeadsBolsao(k) { detailLeadsBolsao = (k && detailLeadsBolsao === k) ? '' : k; aplicarFiltrosDetailLeads(); }
        function renderDetailLeadsRows() {
            const tableBody = document.getElementById('detailTableBody');
            const rows = currentDetailRows;
            let html = '';
            if (!detailLeadsTodos.some(r => contatoDoLead(r).tel || contatoDoLead(r).email)) {
                const logado = typeof isDiretor !== 'undefined' && isDiretor;
                html += logado
                    ? `<tr><td colspan="6" class="p-2.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-200">
                        <i class="fa-solid fa-phone-slash mr-1"></i> Telefone e e-mail ainda não carregaram.
                        ${typeof contatosStatus !== 'undefined' && contatosStatus.msg && contatosStatus.estado !== 'ok' ? `<div class="mt-1.5 text-slate-200">${contatosStatus.msg}</div>` : 'Se os arquivos foram anexados antes da sincronização, anexe de novo o Excel (Salesforce) / PDF (DV On) no computador onde eles estão.'}
                        <button onclick="document.getElementById('calendarDetailModal').classList.add('hidden'); toggleProspeccaoModal();" class="ml-1 underline font-bold text-amber-300 hover:text-amber-100">Abrir Prospecção</button>
                    </td></tr>`
                    : `<tr><td colspan="6" class="p-2.5 bg-slate-800/60 border-b border-slate-700 text-[11px] text-slate-300">
                        <i class="fa-solid fa-lock mr-1"></i> Telefone e e-mail dos clientes são protegidos — só aparecem com login de diretor.
                        <button onclick="document.getElementById('calendarDetailModal').classList.add('hidden'); toggleAuthModal();" class="ml-1 underline font-bold text-sky-300 hover:text-sky-100">Entrar como diretor</button>
                    </td></tr>`;
            }
            if (!rows.length) html += `<tr><td colspan="6" class="p-4 text-center text-slate-500">${detailBusca ? `Nada encontrado pra "${escDet(detailBusca)}" com esses filtros.` : 'Nenhum lead com esses filtros.'}</td></tr>`;
            rows.slice(0, DETAIL_MAX_LINHAS).forEach(r => {
                const c = contatoDoLead(r);
                const sit = String(r['Situação'] || '-');
                const sitCor = 'border ' + corFase(sit);
                const origem = String(r.Origem || '').trim(), emp = String(r.Empreendimento || '').trim();
                html += `
                    <tr class="hover:bg-slate-950 transition align-top">
                        <td class="p-2.5 pl-3">
                            <div class="font-bold text-slate-100 text-[12px] leading-tight">${escDet(r.Cliente || '-')}</div>
                            <div class="mt-1 flex items-center gap-1.5 flex-wrap">${ehBolsao(r) ? `<span class="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" title="Tag Bolsão (CRM)"><i class="fa-solid fa-box-archive"></i>${escDet(r.Tag)}</span>` : ''}${rankingBadge(r)}<span class="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border ${SISTEMA_INFO[sistemaLead(r)].cor}" title="Sistema de origem do lead"><i class="fa-solid ${SISTEMA_INFO[sistemaLead(r)].icone}"></i>${SISTEMA_INFO[sistemaLead(r)].nome}</span><span class="text-[9px] text-slate-600 font-mono">${escDet(r.ID)}</span></div>
                        </td>
                        <td class="p-2.5 select-text">
                            ${c.tel ? `<a href="${linkWhatsApp(c.tel)}" target="_blank" rel="noopener" title="Abrir conversa no WhatsApp" class="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 rounded-md px-2 py-1 whitespace-nowrap"><i class="fa-brands fa-whatsapp text-[13px]"></i>${escDet(c.tel)}</a>` : '<span class="text-[10px] text-slate-600">sem telefone</span>'}
                            ${c.email ? `<div class="mt-1 text-[10px] text-slate-400 break-all"><i class="fa-regular fa-envelope mr-1"></i>${escDet(c.email)}</div>` : ''}
                        </td>
                        <td class="p-2.5 text-[11px] font-semibold ${r.Corretor ? 'text-slate-200' : 'text-amber-400/80 italic'}">${escDet(r.Corretor || 'Sem corretor')}</td>
                        <td class="p-2.5 text-[11px]">
                            ${origem ? `<span class="inline-block text-[9px] font-bold uppercase tracking-wide text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded px-1.5 py-0.5 mb-1">${escDet(origem)}</span>` : ''}
                            <div class="text-slate-400 leading-snug max-w-[220px]">${escDet(emp || '-')}</div>
                        </td>
                        <td class="p-2.5 text-[11px] text-slate-300 whitespace-nowrap">${escDet(r.Cadastro || '-')}</td>
                        <td class="p-2.5 pr-3"><span class="text-[9px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 whitespace-nowrap ${sitCor}">${escDet(sit)}</span></td>
                    </tr>`;
            });
            tableBody.innerHTML = html + avisoMaisLinhas(rows.length);
            const total = document.getElementById('detailCorrTotal');
            if (total) total.textContent = (detailBusca || detailLeadsFiltro || detailLeadsFonte || detailLeadsBolsao || detailLeadsSistema || detailLeadsFase || Object.values(detailLeadsSel).some(Boolean)) ? `${rows.length} de ${detailLeadsTodos.length} leads` : `${detailLeadsTodos.length} ${detailLeadsTodos.length === 1 ? 'lead' : 'leads'}`;
        }


        // ===== BUSCA (dentro do Detalhamento + busca global do topo) =====
        // Texto livre, sem diferenciar maiúsculas/acentos; várias palavras = todas precisam bater
        // (ex.: "matheus whatsapp"). Procura em TODAS as colunas da linha (cliente, corretor,
        // equipe, origem/campanha, empreendimento, construtora, fase, ID, datas...) e, nos leads,
        // também no telefone (com ou sem máscara) e e-mail. Combina com os chips de filtro.
        let detailBusca = '';
        let detailBuscaTermos = [];
        let detailBuscaCache = new WeakMap();
        let detailBuscaGlobal = null; // { termo, leads, prod, base } quando o modal veio da busca do topo
        const normBusca = t => stripDiacritics(String(t == null ? '' : t)).toLowerCase();
        function textoBuscaRow(r) {
            let t = detailBuscaCache.get(r);
            if (t !== undefined) return t;
            const partes = Object.keys(r).filter(k => k.charAt(0) !== '_').map(k => r[k]);
            if (ehLeadCrm(r)) { const c = contatoDoLead(r); if (c.tel) partes.push(c.tel, String(c.tel).replace(/\D/g, '')); if (c.email) partes.push(c.email); }
            t = normBusca(partes.join(' \u0001 ')).replace(/\s+/g, ' ');
            detailBuscaCache.set(r, t);
            return t;
        }
        function passaBusca(r) {
            if (!detailBuscaTermos.length) return true;
            const t = textoBuscaRow(r);
            return detailBuscaTermos.every(w => t.includes(w) || (/^[\d\s().+-]+$/.test(w) && w.replace(/\D/g, '') && t.includes(w.replace(/\D/g, ''))));
        }
        function definirBusca(termo) {
            detailBusca = String(termo || '').trim();
            detailBuscaTermos = normBusca(detailBusca).split(/\s+/).filter(Boolean);
            const inp = document.getElementById('detailBuscaInput');
            if (inp && inp.value !== detailBusca && document.activeElement !== inp) inp.value = detailBusca;
        }
        let detailModoLeads = false;
        let detailBuscaTimer = null;
        function buscarNoDetalhe(termo) {
            clearTimeout(detailBuscaTimer);
            detailBuscaTimer = setTimeout(() => {
                definirBusca(termo);
                if (detailBuscaGlobal) { detailBuscaGlobal.termo = detailBusca; renderBuscaFontes(); }
                if (detailModoLeads) aplicarFiltrosDetailLeads();
                else aplicarFiltrosDetailProd();
            }, 120);
        }
        // Lista grande sem filtro trava o navegador: mostra as primeiras e pede pra refinar.
        const DETAIL_MAX_LINHAS = 400;
        const avisoMaisLinhas = total => total > DETAIL_MAX_LINHAS
            ? `<tr><td colspan="6" class="p-3 text-center text-[11px] text-slate-500">Mostrando ${DETAIL_MAX_LINHAS} de ${total}. Use a busca ou os filtros pra encontrar o resto (o Excel/PDF exporta todos).</td></tr>` : '';

        // Busca global (campo no topo): procura em TODOS os leads da Prospecção e em TODA a
        // produção (análises/aprovações/vendas), sem o filtro de período, e abre o Detalhamento.
        function buscaGlobal(termo) {
            termo = String(termo || '').trim();
            if (!termo) return;
            const leads = (typeof prospeccaoDataset !== 'undefined' && prospeccaoDataset) || [];
            const prod = (typeof dataset !== 'undefined' && dataset) || [];
            definirBusca(termo);
            const nL = leads.filter(passaBusca).length, nP = prod.filter(passaBusca).length;
            detailBuscaGlobal = { termo, leads, prod, base: (nL && nL >= nP) || (!nP && leads.length) ? 'leads' : 'prod' };
            abrirBuscaGlobal(detailBuscaGlobal.base);
            if (!nL && !nP) showToast(`Nada encontrado pra "${termo}".`, true);
        }
        function abrirBuscaGlobal(base) {
            const g = detailBuscaGlobal; if (!g) return;
            g.base = base;
            const rows = base === 'leads' ? g.leads : g.prod;
            showDetailModal({
                label1: 'Busca global', label2: 'Base', nome: `"${g.termo}"`,
                dataStr: base === 'leads' ? 'Leads da Prospecção' : 'Produção (análises/vendas)',
                rows, totalLabel: `${rows.length}`, busca: g.termo, buscaGlobal: true, forcarLeads: base === 'leads'
            });
            document.getElementById('detailModalTitle').textContent = 'Busca';
            document.getElementById('detailModalSubtitle').textContent = 'Todos os meses carregados · refine pelo campo abaixo ou pelos filtros';
        }
        function renderBuscaFontes() {
            const el = document.getElementById('detailBuscaFontes'); if (!el) return;
            const g = detailBuscaGlobal;
            if (!g) { el.classList.add('hidden'); el.innerHTML = ''; return; }
            const nL = g.leads.filter(passaBusca).length, nP = g.prod.filter(passaBusca).length;
            const b = (k, rot, ic, n) => `<button onclick="abrirBuscaGlobal('${k}')" class="text-[10px] font-bold px-2.5 py-1 rounded-lg border transition ${g.base === k ? 'ring-2 ring-white/50 bg-brand-500/15 text-brand-300 border-brand-500/40' : 'opacity-75 hover:opacity-100 bg-slate-800 text-slate-300 border-slate-700'}"><i class="fa-solid ${ic} mr-1"></i>${rot} <span class="ml-0.5 text-white">${n}</span></button>`;
            el.innerHTML = `<div class="flex flex-wrap items-center gap-1.5"><span class="w-[78px] shrink-0 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Procurar em</span>${b('leads', 'Leads (Prospecção)', 'fa-bullseye', nL)}${b('prod', 'Produção (análises/vendas)', 'fa-file-signature', nP)}</div>`;
            el.classList.remove('hidden');
        }
        document.addEventListener('keydown', e => {
            const alvo = e.target, digitando = alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable);
            if (((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) || (e.key === '/' && !digitando)) {
                const inp = document.getElementById('buscaGlobalInput');
                if (inp) { e.preventDefault(); inp.focus(); inp.select(); }
            }
        });

        // Botão "Atualizar" do modal (aberto pelo funil): fecha o detalhe e abre o anexo da barra
        // lateral — Prospecção (Excel do CRM/C2S/DV On) ou Agendamentos (Excel do Salesforce).
        let detailAtualizar = '';
        function abrirAtualizacaoDetail() {
            if (!isDiretor) { showToast('Entre como diretor pra atualizar.', true); return; }
            const alvo = detailAtualizar;
            closeCalendarCellDetail();
            if (alvo === 'agenda') toggleAgendaSfModal(); else if (alvo === 'prospeccao') toggleProspeccaoModal();
        }

        // Renderizador genérico do modal de detalhamento de clientes — usado pelo calendário,
        // pelo funil de vendas e pelos rankings comerciais (corretor/equipe).
        function showDetailModal(opts) {
            const { label1, label2, nome, dataStr, rows, totalLabel, showCorretor } = opts;
            detailAtualizar = opts.atualizar || '';
            const btnAt = document.getElementById('detailAtualizarBtn');
            if (btnAt) {
                const mostra = !!detailAtualizar && typeof isDiretor !== 'undefined' && isDiretor;
                btnAt.classList.toggle('hidden', !mostra);
                btnAt.classList.toggle('flex', mostra);
                const txt = document.getElementById('detailAtualizarTxt');
                if (txt) txt.textContent = detailAtualizar === 'agenda' ? 'Atualizar agendamentos' : 'Atualizar prospecção';
            }
            document.getElementById('detailCorrLabel1').textContent = label1;
            document.getElementById('detailCorrLabel2').textContent = label2;
            document.getElementById('detailCorrName').textContent = nome;
            document.getElementById('detailCorrDate').textContent = dataStr;
            document.getElementById('detailCorrTotal').textContent = totalLabel;

            currentDetailRows = rows;
            currentDetailTitle = `${nome} - ${dataStr}`;
            // Busca: vem preenchida da busca global; abrir por outro caminho (funil, calendário,
            // ranking) começa sem busca e sai do modo "busca global".
            if (!opts.buscaGlobal) detailBuscaGlobal = null;
            detailBuscaCache = new WeakMap();
            definirBusca(opts.busca || '');
            const buscaInp = document.getElementById('detailBuscaInput');
            if (buscaInp) buscaInp.value = detailBusca;
            renderBuscaFontes();
            const tituloEl = document.getElementById('detailModalTitle'), subEl = document.getElementById('detailModalSubtitle');
            if (!opts.buscaGlobal && tituloEl && tituloEl.textContent === 'Busca') { tituloEl.textContent = 'Detalhamento de Produção'; subEl.textContent = 'Corretor e Data selecionados'; }

            // Busca global na base de leads: força o layout de leads mesmo com linhas antigas
            // (CSV de antes do Excel do CRM, ID só numérico).
            // Linha de Prospecção (tem _MesComercialNorm) é sempre lead, venha de onde vier
            // (Salesforce, C2S, DV On ou CSV antigo) — antes só OP-/DV- contavam e o C2S derrubava o modo.
            const modoLeads = opts.forcarLeads || (rows.length > 0 && rows.every(r => ehLeadCrm(r) || (r && '_MesComercialNorm' in r)));
            setDetailLayout(modoLeads);
            detailModoLeads = modoLeads;
            if (modoLeads) {
                // Mais recentes primeiro (Cadastro dd/mm/aaaa).
                const dt = r => { const d = parseDate(r.Cadastro); return d ? d.getTime() : 0; };
                detailLeadsTodos = rows.slice().sort((a, b) => dt(b) - dt(a));
                detailLeadsFiltro = ''; detailLeadsFonte = ''; detailLeadsBolsao = ''; detailLeadsSistema = ''; detailLeadsFase = ''; detailLeadsSel = { equipe: '', corretor: '', empreendimento: '' };
                aplicarFiltrosDetailLeads();
                document.getElementById('calendarDetailModal').classList.remove('hidden');
                return;
            }

            const dtP = r => { const d = parseDate(r['Data Ganho'] || r['Data Aprovação'] || r['Data Cadastro'] || r.Data); return d ? d.getTime() : 0; };
            detailProdTodos = rows.slice().sort((a, b) => dtP(b) - dtP(a));
            detailProdStatus = ''; detailProdConstrutora = ''; detailProdFiltros = { venda: '', etapa: '', equipe: '', corretor: '', empreendimento: '' }; detailProdShowCorretor = showCorretor !== false;
            detailProdTotalLabel = totalLabel;
            aplicarFiltrosDetailProd();

            document.getElementById('calendarDetailModal').classList.remove('hidden');
        }

        // Colunas da exportação de LEADS (Excel e PDF usam a mesma lista).
        function colunasExportLeads() {
            return [
                ['Sistema', r => SISTEMA_INFO[sistemaLead(r)].nome],
                ['ID', r => r.ID],
                ['Criado em', r => r.Cadastro],
                ['Cliente', r => r.Cliente],
                ['Ranking', r => rankingLead(r).nome || rankingLead(r).txt],
                ['Telefone', r => contatoDoLead(r).tel],
                ['E-mail', r => contatoDoLead(r).email],
                ['Corretor', r => r.Corretor || 'Sem corretor'],
                ['Fonte (origem)', r => r.Origem],
                ['Tag Bolsão', r => r.Tag],
                ['Empreendimento', r => r.Empreendimento],
                ['Fase da oportunidade', r => r['Situação']],
                ['Gerente (CRM)', r => r['Gerente CRM']]
            ];
        }

        function colunasExportProd() {
            if (currentDetailRows.length && currentDetailRows.every(ehAgendaProd)) return [
                ['ID', r => r.ID], ['Cliente', r => r.Cliente], ['Corretor', r => r.Corretor], ['Equipe', r => equipeProd(r)],
                ['Empreendimento', r => r.Empreendimento], ['Local', r => r.Local],
                ['Status', r => STATUS_PROD[statusProd(r)].nome], ['Situação', r => sitProd(r)],
                ['Agendado em', r => String(r['Data de Cadastro'] || '').split(' ')[0]], ['Data da visita', r => dataAgendaBr(r.Data)], ['Horário', r => r['Horário']],
                ['Observações', r => r['Observações']]
            ];
            return [
                ['ID', r => r.ID], ['Cliente', r => r.Cliente], ['Corretor', r => r.Corretor], ['Equipe', r => r.Equipe],
                ['Construtora', r => r.Construtora], ['Empreendimento', r => r.Empreendimento],
                ['Status', r => STATUS_PROD[statusProd(r)].nome.replace(/s$/, '')],
                ['Situação (análise)', r => sitProd(r)], ['Situação (venda)', r => r['Situação - Ganho']],
                ['Data análise', r => r['Data Cadastro']], ['Data aprovação', r => r['Data Aprovação']], ['Data venda', r => r['Data Ganho']],
                ['VGV', r => vgvNum(r) ? formatCurrency(vgvNum(r)) : '']
            ];
        }

        function renderCalendarDetail(nome, dataStr, rows, showCorretor) {
            const unidade = calendarMetric === 'aprovados' ? (rows.length === 1 ? 'aprovado' : 'aprovados')
                          : calendarMetric === 'vendas' ? (rows.length === 1 ? 'venda' : 'vendas')
                          : calendarMetric === 'agendamentos' ? (rows.length === 1 ? 'agendamento' : 'agendamentos')
                          : calendarMetric === 'visitas' ? (rows.length === 1 ? 'visita' : 'visitas')
                          : (rows.length === 1 ? 'análise' : 'análises');
            showDetailModal({
                label1: 'Corretor', label2: 'Data Selecionada',
                nome, dataStr, rows, showCorretor,
                totalLabel: `${rows.length} ${unidade}`
            });
        }

        // Exporta os clientes do detalhamento aberto para .csv (abre certinho no Excel).
        function exportDetailCSV() {
            if (!currentDetailRows.length) { showToast('Nada para exportar.', true); return; }
            const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
            let lines;
            if (currentDetailRows.every(ehLeadCrm)) {
                const cols = colunasExportLeads();
                lines = [cols.map(c => esc(c[0])).join(';')];
                currentDetailRows.forEach(r => lines.push(cols.map(c => esc(c[1](r))).join(';')));
            } else {
                const cols = colunasExportProd();
                lines = [cols.map(c => esc(c[0])).join(';')];
                currentDetailRows.forEach(r => lines.push(cols.map(c => esc(c[1](r))).join(';')));
            }
            const csvContent = '﻿' + lines.join('\r\n'); // BOM: acentos abrem certo no Excel
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${stripDiacritics(currentDetailTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-')}${currentDetailRows.every(ehLeadCrm) ? [detailLeadsSistema, detailLeadsBolsao, detailLeadsFonte, detailLeadsFiltro].filter(Boolean).map(x => '-' + x.replace(/[^a-z0-9]+/g, '-')).join('') : ''}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`Excel exportado: ${currentDetailRows.length} cliente(s).`);
        }

        // Exporta os clientes do detalhamento aberto para PDF (abre a caixa de impressão do navegador
        // já formatada — o usuário escolhe "Salvar como PDF" no destino).
        function exportDetailPDF() {
            if (!currentDetailRows.length) { showToast('Nada para exportar.', true); return; }
            const win = window.open('', '_blank');
            if (!win) { showToast('O navegador bloqueou a janela — permita pop-ups para exportar em PDF.', true); return; }
            const modoLeads = detailModoLeads;
            const colsLeads = modoLeads ? colunasExportLeads() : colunasExportProd();
            const headHtml = colsLeads.map(c => `<th>${c[0]}</th>`).join('');
            const rowsHtml = currentDetailRows.map(r => `<tr>${colsLeads.map(c => `<td>${escDet(c[1](r) || '-')}</td>`).join('')}</tr>`).join('');
            win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${currentDetailTitle}</title>
                <style>
                    body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #111; }
                    h1 { font-size: 16px; margin: 0 0 4px; }
                    p { font-size: 11px; color: #555; margin: 0 0 16px; }
                    table { width: 100%; border-collapse: collapse; font-size: 11px; }
                    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
                    th { background: #f3f4f6; }
                    @page { size: A4 landscape; margin: 10mm; } table { font-size: 9.5px; } th, td { padding: 4px 5px; }
                </style></head><body>
                <h1>${currentDetailTitle}</h1>
                <p>${currentDetailRows.length} registro(s)${modoLeads ? [detailLeadsSistema && ('sistema: ' + SISTEMA_INFO[detailLeadsSistema].nome), detailLeadsBolsao && ('separação: ' + (detailLeadsBolsao === 'bolsao' ? 'Bolsão' : 'fora do bolsão')), detailLeadsFonte && ('fonte: ' + detailLeadsFonte), detailLeadsFiltro && ('ranking: ' + detailLeadsFiltro), detailLeadsSel.equipe && ('equipe: ' + detailLeadsSel.equipe), detailLeadsSel.corretor && ('corretor: ' + detailLeadsSel.corretor), detailLeadsSel.empreendimento && ('empreendimento: ' + detailLeadsSel.empreendimento)].filter(Boolean).map(x => ' · ' + x).join('') : [detailProdStatus && ('status: ' + STATUS_PROD[detailProdStatus].nome), detailProdConstrutora && ('construtora: ' + detailProdConstrutora), detailProdFiltros.venda && ('venda: ' + detailProdFiltros.venda), detailProdFiltros.etapa && ('etapa: ' + detailProdFiltros.etapa), detailProdFiltros.equipe && ('equipe: ' + detailProdFiltros.equipe), detailProdFiltros.corretor && ('corretor: ' + detailProdFiltros.corretor), detailProdFiltros.empreendimento && ('empreendimento: ' + detailProdFiltros.empreendimento)].filter(Boolean).map(x => ' · ' + x).join('')} — gerado em ${new Date().toLocaleString('pt-BR')}</p>
                <table>
                    <thead><tr>${headHtml}</tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                </body></html>`);
            win.document.close();
            win.focus();
            setTimeout(() => win.print(), 300);
        }

        // Sufixo do título conforme a métrica ativa do calendário
        function metricaDetalheLabel() {
            if (calendarMetric === 'aprovados') return { tit: 'Aprovados', verbo: 'aprovados' };
            if (calendarMetric === 'vendas') return { tit: 'Vendas', verbo: 'fechadas' };
            if (calendarMetric === 'agendamentos') return { tit: 'Agendamentos', verbo: 'agendados' };
            if (calendarMetric === 'visitas') return { tit: 'Visitas', verbo: 'realizadas' };
            return { tit: 'Análises', verbo: 'enviadas' };
        }

        // Detalhe de uma célula (corretor/equipe + dia) — respeita a métrica ativa
        // Converte o índice de dia CONTÍNUO (jun/1=1 ... jul/2=32) na data real "DD de mês de ano".
        function fmtDiaContinuo(dia, mesNome, ano) {
            const idx = MESES_IDX[mesNome];
            if (idx === undefined) return `${String(dia).padStart(2, '0')} de ${mesNome} de ${ano}`;
            const dt = new Date(parseInt(ano), idx, dia); // normaliza dias de spillover (ex.: 32 -> 2/jul)
            const mLbl = dt.toLocaleDateString('pt-BR', { month: 'long' });
            return `${String(dt.getDate()).padStart(2, '0')} de ${mLbl} de ${dt.getFullYear()}`;
        }

        function openCalendarCellDetail(corretor, dia, mes, ano) {
            const m = calDetail[calendarMetric] || calDetail.analises;
            const rows = m.cell[`${corretor}_${dia}`] || [];
            const lbl = metricaDetalheLabel();
            renderCalendarDetail(`${corretor} — ${lbl.tit}`, fmtDiaContinuo(dia, mes, ano), rows, false);
        }

        // Detalhe do total do dia — respeita a métrica ativa
        function openCalendarDayDetail(dia, mes, ano) {
            const m = calDetail[calendarMetric] || calDetail.analises;
            const rows = m.day[dia] || [];
            const lbl = metricaDetalheLabel();
            const grupo = calendarDimension === 'equipe' ? 'Total das equipes' : 'Todos os corretores';
            renderCalendarDetail(`${grupo} — ${lbl.tit}`, fmtDiaContinuo(dia, mes, ano), rows, true);
        }

        // Detalhe do total geral do mês — respeita a métrica ativa
        function openCalendarMonthDetail(mes, ano) {
            const m = calDetail[calendarMetric] || calDetail.analises;
            const rows = m.month || [];
            const lbl = metricaDetalheLabel();
            const grupo = calendarDimension === 'equipe' ? 'Total das equipes' : 'Todos os corretores';
            renderCalendarDetail(`${grupo} — ${lbl.tit}`, `${mes} de ${ano} (mês inteiro)`, rows, true);
        }

        // Destaca a linha selecionada e escurece as demais ao clicar no nome
        function toggleCalRowHighlight(td) {
            const tr = td.closest('tr');
            if (!tr) return;
            const jaAtivo = tr.classList.contains('cal-row-active');
            const linhas = document.querySelectorAll('#calendarTableBody tr.cal-data-row');
            // limpa estados das linhas de equipe ou corretor
            linhas.forEach(r => {
                r.classList.remove('cal-row-active', 'bg-brand-500/10', 'ring-1', 'ring-brand-500/30', 'opacity-25');
            });
            if (!jaAtivo) {
                // destaca a escolhida e escurece as outras
                tr.classList.add('cal-row-active', 'bg-brand-500/10', 'ring-1', 'ring-brand-500/30');
                linhas.forEach(r => { if (r !== tr) r.classList.add('opacity-25'); });
            }
        }

        // Detalhe de TODOS os clientes do corretor no mês (total da linha) — respeita a métrica ativa
        function openCalendarCorretorDetail(corretor, mes, ano) {
            const m = calDetail[calendarMetric] || calDetail.analises;
            let rows = [];
            Object.keys(m.cell).forEach(key => {
                // chave = `${corretor}_${dia}` — pega só as células deste corretor
                const idx = key.lastIndexOf('_');
                if (key.slice(0, idx) === corretor) rows = rows.concat(m.cell[key]);
            });
            const lbl = metricaDetalheLabel();
            renderCalendarDetail(`${corretor} — ${lbl.tit}`, `${mes} de ${ano} (total do mês)`, rows, false);
        }

        function closeCalendarCellDetail() {
            document.getElementById('calendarDetailModal').classList.add('hidden');
        }

        function showToast(message, isError = false) {
            const toast = document.getElementById('toastNotification');
            const toastMsg = document.getElementById('toastMessage');
            
            toastMsg.textContent = message;
            
            if (isError) {
                toast.className = "mx-6 lg:mx-8 mt-4 p-4 rounded-xl border bg-slate-950/80 backdrop-blur border-rose-500/20 text-rose-400 flex items-center justify-between shadow-lg shadow-rose-500/5";
                toast.querySelector('i').className = "fa-solid fa-triangle-exclamation text-rose-500";
            } else {
                toast.className = "mx-6 lg:mx-8 mt-4 p-4 rounded-xl border bg-slate-950/80 backdrop-blur border-brand-500/20 text-brand-400 flex items-center justify-between shadow-lg shadow-brand-500/5";
                toast.querySelector('i').className = "fa-solid fa-circle-check text-brand-500";
            }

            toast.classList.remove('hidden');

            setTimeout(() => {
                dismissToast();
            }, 6000);
        }

        function dismissToast() {
            document.getElementById('toastNotification').classList.add('hidden');
        }
