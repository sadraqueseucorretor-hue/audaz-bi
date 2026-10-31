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
            // "Última Atividade" e o status/sequência usam a MESMA base (só análises/Data Cadastro)
            // pra nunca mostrar coisas contraditórias tipo "18/07" ao lado de "11 dias parado".
            let ultimaAnaliseCorretor = {};
            const activityDaySet = new Set(); // `${corretor}|${y}-${m}-${d}` com >=1 análise nesse dia — usado pra calcular a sequência
            dataset.forEach(row => {
                const c = row.Corretor;
                if (!activeSet.has(c)) return;
                const d = parseDate(row['Data Cadastro']);
                if (d) {
                    if (!ultimaAnaliseCorretor[c] || d > ultimaAnaliseCorretor[c]) ultimaAnaliseCorretor[c] = d;
                    activityDaySet.add(`${c}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
                }
            });
            const diasSemAnaliseCorretor = (c) => {
                const ultima = ultimaAnaliseCorretor[c];
                if (!ultima) return Infinity; // nunca lançou análise
                return Math.floor((hojeStatusCal - ultima) / 86400000);
            };
            // Conta dias corridos consecutivos com >=1 análise, terminando em `fromDate` e voltando no tempo.
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
                const dias = diasSemAnaliseCorretor(c);
                if (dias === Infinity) return { tag: 'gray', icon: 'fa-minus', label: 'Sem atividades', title: 'Nunca lançou análise', value: null };
                if (dias === 0) {
                    const seq = calcularSequencia(c, hojeStatusCal);
                    return { tag: 'green', icon: 'fa-fire', label: `${seq} dia${seq === 1 ? '' : 's'}`, title: 'Lançou análise hoje', value: seq };
                }
                if (dias <= 2) return { tag: 'yellow', icon: 'fa-triangle-exclamation', label: `${dias} dia${dias === 1 ? '' : 's'}`, title: `${dias} dia(s) sem subir análise`, value: dias };
                return { tag: 'red', icon: 'fa-ban', label: `${dias} dias parado`, title: `${dias} dias sem subir análise`, value: dias };
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
                    const ultimaAt = calendarDimension === 'corretor' ? ultimaAnaliseCorretor[c] : null;
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
            <th class="p-2 pl-3">ID</th>
            <th class="p-2">Cliente</th>
            <th class="p-2">Construtora</th>
            <th class="p-2">Empreendimento</th>
            <th class="p-2">Situação</th>
            <th class="p-2 text-right pr-3">VGV</th>`;
        const DETAIL_HEAD_LEADS = `
            <th class="p-2 pl-3">Cliente</th>
            <th class="p-2">Contato</th>
            <th class="p-2">Corretor</th>
            <th class="p-2">Origem · Empreendimento</th>
            <th class="p-2">Criado em</th>
            <th class="p-2 pr-3">Situação</th>`;

        const ehLeadCrm = r => /^OP-\d+/i.test(String(r && r.ID || ''));
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
            if (box) { box.classList.toggle('max-w-2xl', !leads); box.classList.toggle('max-w-5xl', leads); }
            const wrap = document.getElementById('detailTableWrap');
            if (wrap) { wrap.classList.toggle('max-h-64', !leads); wrap.classList.toggle('max-h-[55vh]', leads); }
            const chips = document.getElementById('detailLeadsChips');
            if (chips) { chips.classList.toggle('hidden', !leads); if (!leads) chips.innerHTML = ''; }
        }

        function renderDetailLeadsChips() {
            const el = document.getElementById('detailLeadsChips'); if (!el) return;
            const cont = {};
            detailLeadsTodos.forEach(r => { const k = rankingLead(r).chave || 'sem'; cont[k] = (cont[k] || 0) + 1; });
            const chaves = RANKING_ORDEM.filter(k => cont[k]).concat(Object.keys(cont).filter(k => !RANKING_ORDEM.includes(k) && k !== 'sem')).concat(cont.sem ? ['sem'] : []);
            const exemplo = k => detailLeadsTodos.find(r => (rankingLead(r).chave || 'sem') === k);
            const chip = (k, rotulo, n, cor) => `<button onclick="filtrarDetailLeads('${k}')" class="text-[10px] font-bold px-2 py-1 rounded-lg border transition ${detailLeadsFiltro === k ? 'ring-2 ring-white/40 ' : 'opacity-80 hover:opacity-100 '}${cor}">${rotulo} <span class="ml-0.5 text-white">${n}</span></button>`;
            el.innerHTML = `<span class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">Ranking:</span>`
                + chip('', 'Todos', detailLeadsTodos.length, 'bg-slate-800 text-slate-200 border-slate-700')
                + chaves.map(k => {
                    if (k === 'sem') return chip('sem', 'Sem ranking', cont.sem, 'bg-slate-900 text-slate-400 border-slate-700');
                    const rk = rankingLead(exemplo(k));
                    return chip(k, `${escDet(rk.nome)} ${rk.emoji}`, cont[k], RANKING_COR[k] || 'bg-slate-800 text-slate-300 border-slate-700');
                }).join('');
        }
        function filtrarDetailLeads(k) {
            detailLeadsFiltro = detailLeadsFiltro === k ? '' : k;
            currentDetailRows = detailLeadsTodos.filter(r => !detailLeadsFiltro || (rankingLead(r).chave || 'sem') === detailLeadsFiltro);
            renderDetailLeadsChips();
            renderDetailLeadsRows();
        }
        function renderDetailLeadsRows() {
            const tableBody = document.getElementById('detailTableBody');
            const rows = currentDetailRows;
            let html = '';
            if (!detailLeadsTodos.some(r => contatoDoLead(r).tel || contatoDoLead(r).email)) {
                html += `<tr><td colspan="6" class="p-2.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-200">
                    <i class="fa-solid fa-phone-slash mr-1"></i> Telefone e e-mail não estão neste navegador — eles ficam só no computador onde o Excel de leads foi anexado.
                    <button onclick="document.getElementById('calendarDetailModal').classList.add('hidden'); toggleProspeccaoModal();" class="ml-1 underline font-bold text-amber-300 hover:text-amber-100">Anexar o Excel aqui</button>
                </td></tr>`;
            }
            if (!rows.length) html += `<tr><td colspan="6" class="p-4 text-center text-slate-500">Nenhum lead com esse ranking.</td></tr>`;
            rows.forEach(r => {
                const c = contatoDoLead(r);
                const sit = String(r['Situação'] || '-');
                const sitCor = /encerr/i.test(sit) ? 'text-slate-500 bg-slate-800/60' : 'text-sky-300 bg-sky-500/10';
                const origem = String(r.Origem || '').trim(), emp = String(r.Empreendimento || '').trim();
                html += `
                    <tr class="hover:bg-slate-950 transition align-top">
                        <td class="p-2.5 pl-3">
                            <div class="font-bold text-slate-100 text-[12px] leading-tight">${escDet(r.Cliente || '-')}</div>
                            <div class="mt-1 flex items-center gap-1.5 flex-wrap">${rankingBadge(r)}<span class="text-[9px] text-slate-600 font-mono">${escDet(r.ID)}</span></div>
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
            tableBody.innerHTML = html;
            const total = document.getElementById('detailCorrTotal');
            if (total) total.textContent = detailLeadsFiltro ? `${rows.length} de ${detailLeadsTodos.length} leads` : `${detailLeadsTodos.length} ${detailLeadsTodos.length === 1 ? 'lead' : 'leads'}`;
        }

        // Renderizador genérico do modal de detalhamento de clientes — usado pelo calendário,
        // pelo funil de vendas e pelos rankings comerciais (corretor/equipe).
        function showDetailModal(opts) {
            const { label1, label2, nome, dataStr, rows, totalLabel, showCorretor } = opts;
            document.getElementById('detailCorrLabel1').textContent = label1;
            document.getElementById('detailCorrLabel2').textContent = label2;
            document.getElementById('detailCorrName').textContent = nome;
            document.getElementById('detailCorrDate').textContent = dataStr;
            document.getElementById('detailCorrTotal').textContent = totalLabel;

            currentDetailRows = rows;
            currentDetailTitle = `${nome} - ${dataStr}`;

            const modoLeads = rows.length > 0 && rows.every(ehLeadCrm);
            setDetailLayout(modoLeads);
            if (modoLeads) {
                // Mais recentes primeiro (Cadastro dd/mm/aaaa).
                const dt = r => { const d = parseDate(r.Cadastro); return d ? d.getTime() : 0; };
                detailLeadsTodos = rows.slice().sort((a, b) => dt(b) - dt(a));
                detailLeadsFiltro = '';
                currentDetailRows = detailLeadsTodos;
                renderDetailLeadsChips();
                renderDetailLeadsRows();
                document.getElementById('calendarDetailModal').classList.remove('hidden');
                return;
            }

            const tableBody = document.getElementById('detailTableBody');
            tableBody.innerHTML = '';

            if (rows.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">Nenhum cliente neste recorte.</td></tr>`;
            } else {
                rows.forEach(r => {
                    const idText = r.ID || '-';
                    const clienteText = r.Cliente || '-';
                    const construtoraText = r.Construtora || '-';
                    const empText = r.Empreendimento || '-';
                    const sitText = r['Situação - Analise'] || r['Situação'] || '-';
                    const vgvText = formatCurrency(parseFloat(r.VGV) || 0);

                    let situationClass = "text-slate-400";
                    if (isAprovado(sitText)) situationClass = "text-brand-500 font-bold bg-brand-500/10 px-1.5 py-0.5 rounded";
                    if (sitText === 'Reprovado') situationClass = "text-rose-500 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded";

                    const corretorTag = showCorretor && r.Corretor ? `<div class="text-[9px] text-slate-500 font-semibold uppercase tracking-wide">${r.Corretor}</div>` : '';

                    const rowHtml = `
                        <tr class="hover:bg-slate-950 transition">
                            <td class="p-2 pl-3 font-semibold text-slate-400">${idText}</td>
                            <td class="p-2 font-bold text-slate-200">${corretorTag}${clienteText}</td>
                            <td class="p-2 text-slate-300">${construtoraText}</td>
                            <td class="p-2 text-slate-300 truncate max-w-[120px]">${empText}</td>
                            <td class="p-2 text-[10px]">${isGanho(r) ? '<span class="text-brand-500 font-bold bg-brand-500/10 px-1.5 py-0.5 rounded mr-1">Venda</span>' : ''}<span class="${situationClass}">${sitText}</span></td>
                            <td class="p-2 text-right pr-3 font-bold text-indigo-400">${vgvText}</td>
                        </tr>
                    `;
                    tableBody.insertAdjacentHTML('beforeend', rowHtml);
                });
            }

            document.getElementById('calendarDetailModal').classList.remove('hidden');
        }

        // Colunas da exportação de LEADS (Excel e PDF usam a mesma lista).
        function colunasExportLeads() {
            return [
                ['ID', r => r.ID],
                ['Criado em', r => r.Cadastro],
                ['Cliente', r => r.Cliente],
                ['Ranking', r => rankingLead(r).nome || rankingLead(r).txt],
                ['Telefone', r => contatoDoLead(r).tel],
                ['E-mail', r => contatoDoLead(r).email],
                ['Corretor', r => r.Corretor || 'Sem corretor'],
                ['Origem', r => r.Origem],
                ['Empreendimento', r => r.Empreendimento],
                ['Situação', r => r['Situação']],
                ['Gerente (CRM)', r => r['Gerente CRM']]
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
                const headers = ['ID', 'Cliente', 'Corretor', 'Construtora', 'Empreendimento', 'Situação', 'VGV'];
                lines = [headers.map(esc).join(';')];
                currentDetailRows.forEach(r => {
                    lines.push([
                        r.ID, r.Cliente, r.Corretor, r.Construtora, r.Empreendimento,
                        r['Situação - Analise'] || r['Situação'],
                        formatCurrency(parseFloat(r.VGV) || 0)
                    ].map(esc).join(';'));
                });
            }
            const csvContent = '﻿' + lines.join('\r\n'); // BOM: acentos abrem certo no Excel
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${stripDiacritics(currentDetailTitle).toLowerCase().replace(/[^a-z0-9]+/g, '-')}${detailLeadsFiltro && currentDetailRows.every(ehLeadCrm) ? '-' + detailLeadsFiltro : ''}.csv`;
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
            const modoLeads = currentDetailRows.every(ehLeadCrm);
            const colsLeads = modoLeads ? colunasExportLeads() : null;
            const headHtml = modoLeads
                ? colsLeads.map(c => `<th>${c[0]}</th>`).join('')
                : '<th>ID</th><th>Cliente</th><th>Corretor</th><th>Construtora</th><th>Empreendimento</th><th>Situação</th><th>VGV</th>';
            const rowsHtml = modoLeads
                ? currentDetailRows.map(r => `<tr>${colsLeads.map(c => `<td>${escDet(c[1](r) || '-')}</td>`).join('')}</tr>`).join('')
                : currentDetailRows.map(r => `
                <tr>
                    <td>${r.ID || '-'}</td>
                    <td>${r.Cliente || '-'}</td>
                    <td>${r.Corretor || '-'}</td>
                    <td>${r.Construtora || '-'}</td>
                    <td>${r.Empreendimento || '-'}</td>
                    <td>${r['Situação - Analise'] || '-'}</td>
                    <td style="text-align:right">${formatCurrency(parseFloat(r.VGV) || 0)}</td>
                </tr>`).join('');
            win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${currentDetailTitle}</title>
                <style>
                    body { font-family: Arial, Helvetica, sans-serif; padding: 24px; color: #111; }
                    h1 { font-size: 16px; margin: 0 0 4px; }
                    p { font-size: 11px; color: #555; margin: 0 0 16px; }
                    table { width: 100%; border-collapse: collapse; font-size: 11px; }
                    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
                    th { background: #f3f4f6; }
                    ${modoLeads ? '@page { size: A4 landscape; margin: 10mm; } table { font-size: 9.5px; } th, td { padding: 4px 5px; }' : ''}
                </style></head><body>
                <h1>${currentDetailTitle}</h1>
                <p>${currentDetailRows.length} registro(s)${modoLeads && detailLeadsFiltro ? ' · ranking: ' + detailLeadsFiltro : ''} — gerado em ${new Date().toLocaleString('pt-BR')}</p>
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
