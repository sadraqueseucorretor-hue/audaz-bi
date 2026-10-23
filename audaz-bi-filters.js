// ===== PILLS: MÊS COMERCIAL + SEMANA =====
        function mesLabelAbbrev(mesStr) {
            const nome = normalizeMes(mesStr);        // ex.: 'Junho'
            const ano = getMesAno(mesStr);             // ex.: 2026
            const abbr = nome.slice(0, 3);
            return ano ? `${abbr}/${String(ano).slice(-2)}` : abbr;
        }

        function pillClass(isActive, kind) {
            const base = 'px-2 py-1.5 rounded-full text-[11px] font-bold text-center border transition';
            if (!isActive) return base + ' bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200';
            return kind === 'mes'
                ? base + ' bg-rose-900/90 border-rose-700 text-white shadow shadow-rose-900/30'
                : base + ' bg-indigo-600 border-indigo-500 text-white shadow shadow-indigo-500/20';
        }

        // Paginação dos pills de Mês Comercial (5 por página, com setas) — a lista de meses só
        // cresce com o tempo, então sem paginação a área de filtros ia crescendo pra sempre.
        // null = ainda não inicializada; na 1ª renderização pula pra última página (meses mais
        // recentes), que é o que o diretor quer ver por padrão.
        let mesComercialPillsPage = null;
        const MES_PILLS_POR_PAGINA = 5;

        function renderMesComercialPills() {
            const container = document.getElementById('mesComercialPills');
            if (!container) return;
            const select = document.getElementById('filterMes');
            const selMeses = getSelectedMeses();

            const options = Array.from(select.options)
                .filter(o => o.value !== '')
                .sort((a, b) => {
                    const anoA = getMesAno(a.value) || 0, anoB = getMesAno(b.value) || 0;
                    if (anoA !== anoB) return anoA - anoB;
                    const idxA = MESES_IDX[normalizeMes(a.value)] ?? 0;
                    const idxB = MESES_IDX[normalizeMes(b.value)] ?? 0;
                    return idxA - idxB;
                });

            const totalPaginas = Math.max(1, Math.ceil(options.length / MES_PILLS_POR_PAGINA));
            if (mesComercialPillsPage === null) mesComercialPillsPage = totalPaginas - 1;
            if (mesComercialPillsPage >= totalPaginas) mesComercialPillsPage = totalPaginas - 1;
            if (mesComercialPillsPage < 0) mesComercialPillsPage = 0;

            const inicio = mesComercialPillsPage * MES_PILLS_POR_PAGINA;
            const pageOptions = options.slice(inicio, inicio + MES_PILLS_POR_PAGINA);
            const navBtnClass = (disabled) => 'w-7 h-7 shrink-0 rounded-full text-xs border transition flex items-center justify-center ' +
                (disabled ? 'bg-slate-950 border-slate-800 text-slate-700 cursor-not-allowed' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200');

            container.innerHTML = '';

            const prevBtn = document.createElement('button');
            prevBtn.type = 'button';
            prevBtn.innerHTML = '<i class="fa-solid fa-chevron-left" style="font-size:9px"></i>';
            prevBtn.disabled = mesComercialPillsPage === 0;
            prevBtn.className = navBtnClass(prevBtn.disabled);
            prevBtn.onclick = () => { mesComercialPillsPage--; renderMesComercialPills(); };
            container.appendChild(prevBtn);

            const allBtn = document.createElement('button');
            allBtn.type = 'button';
            allBtn.textContent = 'Todos';
            allBtn.title = 'Limpa a seleção de meses';
            allBtn.className = pillClass(selMeses.length === 0, 'mes');
            allBtn.onclick = () => selectMesComercial('');
            container.appendChild(allBtn);

            pageOptions.forEach(opt => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = mesLabelAbbrev(opt.value);
                btn.title = `${normalizeMes(opt.value)}/${getMesAno(opt.value) || ''} — clique em mais de um pra comparar`;
                btn.className = pillClass(selMeses.includes(opt.value), 'mes');
                btn.onclick = () => selectMesComercial(opt.value);
                container.appendChild(btn);
            });

            const nextBtn = document.createElement('button');
            nextBtn.type = 'button';
            nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right" style="font-size:9px"></i>';
            nextBtn.disabled = mesComercialPillsPage >= totalPaginas - 1;
            nextBtn.className = navBtnClass(nextBtn.disabled);
            nextBtn.onclick = () => { mesComercialPillsPage++; renderMesComercialPills(); };
            container.appendChild(nextBtn);
        }

        // Alterna um mês comercial dentro da seleção (multi-select, pra comparação entre meses).
        // value === '' limpa a seleção inteira (pill "Todos").
        function selectMesComercial(value) {
            const mesSelect = document.getElementById('filterMes');
            const anoSelect = document.getElementById('filterAno');
            if (value === '') {
                Array.from(mesSelect.options).forEach(o => { o.selected = false; });
            } else {
                Array.from(mesSelect.options).forEach(o => {
                    if (o.value === value) o.selected = !o.selected;
                });
            }
            // O pill de mês comercial já embute o ano; mantém o select de Ano sincronizado com o
            // mês mais recente selecionado (usado no calendário).
            const refMes = getReferenceMesComercial();
            anoSelect.value = refMes ? refMes.ano : '';
            applyFilters();
            renderMesComercialPills();
            renderSemanaPills();
        }

        // Semanas do filtro "Semana" (pills): antes era Math.ceil(dia-do-mês-do-CALENDÁRIO / 7) —
        // dia 1-7 = semana 1, 8-14 = semana 2 etc. — o que ignorava a janela deslizante do mês
        // comercial (que quase nunca começa no dia 1) e não alinhava com semanas reais de segunda a
        // domingo. Corrigido pra usar getSemanasMesComercial sobre a janela real do mês comercial de
        // referência (a mesma que Ritmo do Mês/Funil mostram), com rótulo mostrando o intervalo real
        // de datas de cada semana — igual ao padrão já usado na Evolução Semanal do Mês.
        function renderSemanaPills() {
            const container = document.getElementById('semanaPills');
            if (!container) return;
            const select = document.getElementById('filterSemana');
            const selSemana = select.value;

            const janelaRef = getJanelaMesComercial('analises');
            const semanas = getSemanasMesComercial(janelaRef.inicioReal, janelaRef.diasNoMes);
            const fmtDDMM = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

            // Garante que o select oculto tem uma <option> para cada semana (senão select.value não "gruda").
            select.innerHTML = '<option value="">Todas</option>';
            semanas.forEach(s => {
                const opt = document.createElement('option');
                opt.value = String(s.idx);
                opt.textContent = `Semana ${s.idx} (${fmtDDMM(s.inicio)}-${fmtDDMM(s.fim)})`;
                select.appendChild(opt);
            });
            select.value = (selSemana && Number(selSemana) <= semanas.length) ? selSemana : '';

            container.innerHTML = '';
            const allBtn = document.createElement('button');
            allBtn.type = 'button';
            allBtn.textContent = 'Todas';
            allBtn.className = pillClass(select.value === '', 'semana');
            allBtn.onclick = () => selectSemana('');
            container.appendChild(allBtn);

            semanas.forEach(s => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = `${s.idx}ª SEM (${fmtDDMM(s.inicio)}-${fmtDDMM(s.fim)})`;
                btn.className = pillClass(select.value === String(s.idx), 'semana');
                btn.onclick = () => selectSemana(String(s.idx));
                container.appendChild(btn);
            });
        }

        function selectSemana(value) {
            document.getElementById('filterSemana').value = value;
            applyFilters();
            renderSemanaPills();
        }

        function fillSelect(selectId, items, placeholderText, selectedValue) {
            const select = document.getElementById(selectId);
            select.innerHTML = `<option value="">${placeholderText}</option>`;
            items.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item;
                opt.textContent = item;
                if (item == selectedValue) opt.selected = true;
                select.appendChild(opt);
            });
        }

        // Corretores que aparecem em QUALQUER uma das 3 fontes de dados (têm histórico lançado),
        // independente de estarem ativos ou não.
        function getCorretoresComHistorico() {
            const s = new Set();
            (dataset || []).forEach(r => { if (r.Corretor) s.add(r.Corretor); });
            (agendaDataset || []).forEach(r => { if (r.Corretor) s.add(r.Corretor); });
            (prospeccaoDataset || []).forEach(r => { if (r.Corretor) s.add(r.Corretor); });
            return s;
        }

        // Filtro de Corretor: lista os ATIVOS + os DESATIVADOS QUE TÊM HISTÓRICO (estes marcados
        // como "(inativo)"). Desativar não apaga o passado, então é preciso continuar conseguindo
        // filtrar pelo nome dele pra consultar a produção que ele deixou. O `value` da opção segue
        // sendo o nome puro — só o texto exibido leva o sufixo, pra não quebrar as comparações
        // `row.Corretor === selCorr` espalhadas pelo app.
        function fillCorretorSelect(selectedValue) {
            const select = document.getElementById('filterCorretor');
            if (!select) return;
            const ativos = getActiveCorretores();
            const comHistorico = getCorretoresComHistorico();
            const inativosComHistorico = Array.from(comHistorico)
                .filter(n => !isCorretorActive(n))
                .sort((a, b) => a.localeCompare(b, 'pt-BR'));

            select.innerHTML = '<option value="">Todos os corretores</option>';
            const addOpt = (nome, label) => {
                const opt = document.createElement('option');
                opt.value = nome;
                opt.textContent = label;
                if (nome == selectedValue) opt.selected = true;
                select.appendChild(opt);
            };
            ativos.forEach(n => addOpt(n, n));
            inativosComHistorico.forEach(n => addOpt(n, `${n} (inativo)`));
            // Se o selecionado não está em nenhuma das listas (ex.: inativo sem histórico), preserva
            // a seleção mesmo assim pra não zerar o filtro do usuário sem aviso.
            if (selectedValue && !select.value) addOpt(selectedValue, `${selectedValue} (inativo)`);
            if (selectedValue) select.value = selectedValue;
        }

        function setPeriod(period) {
            currentPeriod = period;
            
            document.querySelectorAll('.period-btn').forEach(btn => {
                btn.className = "period-btn px-3 py-1.5 rounded-lg text-xs font-bold transition text-slate-400 hover:text-slate-200";
            });

            const activeBtn = document.getElementById(`btn-${period}`);
            if (activeBtn) {
                activeBtn.className = "period-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-brand-500 text-white shadow-lg shadow-brand-500/10";
            }

            applyFilters();
        }

        function setVendasMode(mode) {
            vendasMode = (mode === 'finalizadas') ? 'finalizadas' : 'gerais';
            saveLocalSetting(`${appId}-vendas-mode`, vendasMode);
            pushCloudSettings();
            updateVendasModeUI();
            applyFilters();
        }

        function updateVendasModeUI() {
            const base = "mode-btn px-4 py-1.5 rounded-lg text-xs font-bold transition";
            const ger = document.getElementById('btn-mode-gerais');
            const fin = document.getElementById('btn-mode-finalizadas');
            if (ger && fin) {
                ger.className = base + (vendasMode === 'gerais' ? ' bg-brand-500 text-white shadow-lg shadow-brand-500/10' : ' text-slate-400 hover:text-slate-200');
                fin.className = base + (vendasMode === 'finalizadas' ? ' bg-amber-500 text-white shadow-lg shadow-amber-500/10' : ' text-slate-400 hover:text-slate-200');
            }
            const hint = document.getElementById('vendasModeHint');
            if (hint) {
                hint.textContent = vendasMode === 'finalizadas'
                    ? 'Cartões, VGV, ticket, metas e rankings em VENDAS FINALIZADAS (geral menos "Venda Informada"). Funil e conversões usam sempre a base completa.'
                    : 'Cartões, VGV, ticket, metas e rankings em TODAS as vendas do mês (gerais). Funil e conversões usam sempre a base completa.';
            }
        }

        // Ocultar/mostrar o corpo do painel de filtros (selects + pills) — só visual, não mexe em
        // nenhum filtro selecionado. Independente do toggle de view (#filtersBar some inteiro na
        // aba Rankings) — esse aqui só esconde o CONTEÚDO, mantendo o cabeçalho com o resumo visível.
        let filtersBodyHidden = false;
        function toggleFiltersBody() {
            filtersBodyHidden = !filtersBodyHidden;
            document.getElementById('filtersBody').classList.toggle('hidden', filtersBodyHidden);
            document.getElementById('toggleFiltersBodyLabel').textContent = filtersBodyHidden ? 'Mostrar filtros' : 'Ocultar filtros';
            document.getElementById('toggleFiltersBodyChevron').className = filtersBodyHidden ? 'fa-solid fa-chevron-down text-[9px]' : 'fa-solid fa-chevron-up text-[9px]';
        }

        // Contador de resultados + chips de filtro ativo (removíveis), abaixo do painel de
        // filtros. O contador conta ANÁLISES (Mês Cadastro) porque é a base do dataset principal;
        // respeita Corretor/Equipe/Construtora/Empreendimento (já embutidos em filteredDataset) e
        // também Mês Comercial/Semana dos pills, que normalmente não recortam filteredDataset.
        function renderFiltersSummary() {
            const countEl = document.getElementById('filtersResultCount');
            const labelEl = document.getElementById('filtersResultLabel');
            const chipsEl = document.getElementById('filtersActiveChips');
            if (!countEl || !chipsEl) return;

            const selMeses = getSelectedMeses();
            const selSemana = document.getElementById('filterSemana').value;
            let count = 0;
            filteredDataset.forEach(row => {
                if (selMeses.length > 0 && !selMeses.includes(row['Mês Cadastro'])) return;
                if (selSemana) {
                    const d = parseDate(row['Data Cadastro']);
                    const semanaObj = getSemanaRangeParaMetrica('analises', selSemana);
                    if (!d || !semanaObj || d < semanaObj.inicio || d > semanaObj.fim) return;
                }
                count++;
            });
            countEl.textContent = count;
            labelEl.textContent = count === 1 ? 'análise encontrada' : 'análises encontradas';

            const corretor = document.getElementById('filterCorretor').value;
            const equipe = document.getElementById('filterEquipe').value;
            const construtora = document.getElementById('filterConstrutora').value;
            const empreendimento = document.getElementById('filterEmpreendimento').value;

            const chips = [];
            if (orgDashboardScope) {
                const label = orgDashboardScope.kind === 'regional' ? 'Regional · todos os indicadores' : (orgDashboardScope.kind === 'team' ? `Equipe · ${orgDashboardScope.team}` : `Corretor · ${orgDashboardScope.name}`);
                chips.push({ label: `Organograma: ${label}`, remove: clearOrgDashboardScope });
            }
            if (corretor) chips.push({ label: corretor, remove: () => { document.getElementById('filterCorretor').value = ''; applyFilters(); } });
            if (equipe) chips.push({ label: equipe, remove: () => { document.getElementById('filterEquipe').value = ''; applyFilters(); } });
            if (construtora) chips.push({ label: construtora, remove: () => { document.getElementById('filterConstrutora').value = ''; applyFilters(); } });
            if (empreendimento) chips.push({ label: empreendimento, remove: () => { document.getElementById('filterEmpreendimento').value = ''; applyFilters(); } });
            selMeses.forEach(m => chips.push({ label: mesLabelAbbrev(m), remove: () => selectMesComercial(m) }));
            if (selSemana) chips.push({ label: `${selSemana}ª Semana`, remove: () => selectSemana('') });

            if (chips.length === 0) {
                chipsEl.innerHTML = '<span class="text-[11px] text-slate-600">Nenhum filtro ativo</span>';
                return;
            }
            chipsEl.innerHTML = '';
            chips.forEach((c, i) => {
                const chip = document.createElement('span');
                chip.className = 'inline-flex items-center gap-1.5 text-[11px] font-semibold pl-2.5 pr-1.5 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700';
                chip.innerHTML = `${c.label} <button type="button" class="w-4 h-4 rounded-full hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"><i class="fa-solid fa-xmark" style="font-size:8px"></i></button>`;
                chip.querySelector('button').onclick = c.remove;
                chipsEl.appendChild(chip);
            });
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 ml-1 transition';
            clearBtn.innerHTML = '<i class="fa-solid fa-trash-can" style="font-size:9px"></i> Limpar todos';
            clearBtn.onclick = clearAllFilters;
            chipsEl.appendChild(clearBtn);
        }

        function clearAllFilters() {
            orgDashboardScope = null;
            document.getElementById('filterCorretor').value = "";
            document.getElementById('filterEquipe').value = "";
            document.getElementById('filterConstrutora').value = "";
            document.getElementById('filterEmpreendimento').value = "";
            Array.from(document.getElementById('filterMes').options).forEach(o => { o.selected = false; });
            document.getElementById('filterAno').value = "";
            document.getElementById('filterSemana').value = "";
            renderMesComercialPills();
            renderSemanaPills();
            applyFilters();
            showToast("Todos os filtros foram limpos!");
        }

        function applyFilters() {
            _semanasPorMetricaCache = {}; // um cache novo por render — ver getSemanaRangeParaMetrica
            const selCorretor = document.getElementById('filterCorretor').value;
            const selEquipe = document.getElementById('filterEquipe').value;
            const selConstrutora = document.getElementById('filterConstrutora').value;
            const selEmpreendimento = document.getElementById('filterEmpreendimento').value;

            // Se houver mês(es) comercial(is) selecionado(s), usa o MAIS RECENTE deles como
            // referência para KPIs de ritmo/projeção (o total em si já soma todos os selecionados,
            // via metricMatchesRef/checkMesPeriodMatch).
            let referenceDate = isMockDataActive ? new Date(2026, 5, 9) : new Date();
            const refMes = getReferenceMesComercial();
            if (refMes) {
                referenceDate = new Date(refMes.ano, refMes.idx, 15);
            } else if (!isMockDataActive && (currentPeriod === 'mes' || currentPeriod === 'ano')) {
                // Sem filtro: mês de referência = mês comercial corrente (último dos dados), não o calendário.
                referenceDate = commercialRefDate(referenceDate);
            }
            // Guarda globalmente para drawTables() (chamado também pela busca) usar a mesma referência
            currentRefDate = referenceDate;

            // Agendamentos/Compareceu seguem a MESMA referência de mês da planilha principal (a
            // mesma que o Ritmo do Mês usa) — antes a Agenda detectava seu próprio mês a partir da
            // Data mais recente lançada NELA, o que a fazia "pular" pro mês seguinte antes da
            // planilha principal assim que alguém marcasse uma visita futura, desalinhando o
            // Realizado e o Ideal hoje do funil Agendamento & Visita entre si e com o resto do
            // painel. Corrigido a pedido do usuário: sempre a mesma referência em tudo.
            const referenceDateAgenda = referenceDate;
            currentRefDateAgenda = referenceDateAgenda;

            // Prospecção também segue a MESMA referência de mês do resto do painel (12/10/2026).
            // Antes ela detectava o próprio mês pelo último upload — se o upload do mês novo ainda
            // não tinha sido feito, o painel mostrava os leads do mês ANTERIOR como se fossem do
            // atual (ex.: 445 de Setembro aparecendo em Outubro). Agora fica 0 + aviso no funil.
            const referenceDateProspeccao = referenceDate;
            currentRefDateProspeccao = referenceDateProspeccao;

            // Filtra só pelos campos estruturais (corretor/equipe/construtora/empreendimento). Mês
            // Comercial e Semana NÃO recortam aqui — cada métrica (análises/aprovações/vendas) confere
            // a SUA própria coluna de mês/data via metricMatchesRef(), para "conversar com toda a
            // planilha" (uma linha cadastrada em jun e aprovada em jul conta como aprovação de jul).
            filteredDataset = dataset.filter(row => {
                if (selCorretor && row.Corretor !== selCorretor) return false;
                // O organograma é a fonte única do vínculo corretor → equipe. O campo Equipe
                // da planilha pode estar antigo, vazio ou com grafia diferente.
                if (selEquipe && rankingTeamKey(getRankingTeamForBroker(row.Corretor)) !== rankingTeamKey(selEquipe)) return false;
                if (!matchesOrgDashboardScope(row)) return false;
                if (selConstrutora && row.Construtora !== selConstrutora) return false;
                if (selEmpreendimento && row.Empreendimento !== selEmpreendimento) return false;
                return true;
            });
            // Agenda de Visitas: só tem Corretor e Empreendimento em comum com os filtros
            // estruturais (não tem Equipe/Construtora) — filtra só por esses dois.
            filteredAgendaDataset = agendaDataset.filter(row => {
                if (selCorretor && row.Corretor !== selCorretor) return false;
                if (selEquipe && rankingTeamKey(getRankingTeamForBroker(row.Corretor)) !== rankingTeamKey(selEquipe)) return false;
                if (!matchesOrgDashboardScope(row)) return false;
                if (!agendaMatchesEmpreendimento(row, selEmpreendimento)) return false;
                return true;
            });
            // Prospecção: só tem Corretor e Equipe em comum com os filtros estruturais.
            filteredProspeccaoDataset = prospeccaoDataset.filter(row => {
                if (selCorretor && row.Corretor !== selCorretor) return false;
                // Prospecção segue o mesmo vínculo do organograma usado por análises, agenda e vendas.
                if (selEquipe && rankingTeamKey(getRankingTeamForBroker(row.Corretor)) !== rankingTeamKey(selEquipe)) return false;
                if (!matchesOrgDashboardScope(row)) return false;
                return true;
            });

            calculateKPIs(referenceDate);
            calculateAgendaKPIs(referenceDateAgenda);
            calculateProspeccaoKPIs(referenceDateProspeccao);
            drawMetasMensais();
            drawFunnel();
            drawTables();
            drawQuickRankings();
            renderCharts();
            renderAlerts(referenceDate);

            if (activeView === 'calendar') renderCalendarTab();   // Atualiza a produção ou previsão no Calendário
            if (activeView === 'organograma') renderOrganograma();
            renderFiltersSummary();
            renderCorretorCards();
            ajustarBlocosEquipe();
            instalarNavegadorPainel();
            // Tela (TV): só redesenha se estiver aberta — é o que mantém a TV viva a cada auto-refresh.
            if (activeView === 'tela') renderTela();
        }

        function checkPeriodMatch(rowDateStr, period, referenceDate) {
            const rowDate = parseDate(rowDateStr);
            if (!rowDate) return false;

            const refYear = referenceDate.getFullYear();
            const refMonth = referenceDate.getMonth();
            const refDateVal = referenceDate.getDate();

            if (period === 'hoje') {
                return rowDate.getFullYear() === refYear && 
                       rowDate.getMonth() === refMonth && 
                       rowDate.getDate() === refDateVal;
            }

            if (period === 'semana') {
                // Semana ATUAL: de segunda-feira desta semana até domingo (reinicia toda segunda).
                const ref = new Date(refYear, refMonth, refDateVal);
                const dow = ref.getDay();                       // 0=Dom, 1=Seg ... 6=Sáb
                const desdeSegunda = (dow === 0) ? 6 : (dow - 1);
                const segunda = new Date(ref); segunda.setDate(ref.getDate() - desdeSegunda); segunda.setHours(0, 0, 0, 0);
                const domingo = new Date(segunda); domingo.setDate(segunda.getDate() + 6); domingo.setHours(23, 59, 59, 999);
                return rowDate >= segunda && rowDate <= domingo;
            }

            if (period === 'mes') {
                return rowDate.getFullYear() === refYear && rowDate.getMonth() === refMonth;
            }

            if (period === 'ano') {
                return rowDate.getFullYear() === refYear;
            }

            return true;
        }

        let kpiValues = { analyses: 0, approvals: 0, sales: 0, vgv: 0, salesGeral: 0, vgvGeral: 0, salesFinal: 0, vgvFinal: 0, salesView: 0, vgvView: 0, agendamentos: 0, compareceu: 0, naoCompareceu: 0, prospeccao: 0 };
        let currentRefDate = new Date(); // referência de período partilhada (definida em applyFilters)
        let currentRefDateAgenda = new Date(); // mesma ideia, só que derivada da Agenda de Visitas
        let currentRefDateProspeccao = new Date(); // mesma ideia, só que derivada da Prospecção

        // Qual "mês corrente" (getJanelaMesComercial) cada coluna de mês representa — usado só pra
        // resolver a semana REAL (segunda-domingo) da janela certa quando o filtro "Semana" está
        // ativo (Prospecção pode estar num mês comercial diferente do resto, ver aviso no Funil).
        const MES_FIELD_PARA_METRICA = { 'Mês Cadastro': 'analises', 'Mês Aprovação': 'aprovacoes', 'Mês Ganho': 'vendas', '_MesComercialNorm': 'prospeccao' };

        // Cache das semanas reais por métrica, válido só durante o render atual — evita recalcular
        // getJanelaMesComercial (que percorre o dataset inteiro pra achar o início real) uma vez por
        // LINHA filtrada; limpo no início de applyFilters().
        let _semanasPorMetricaCache = {};
        function getSemanaRangeParaMetrica(metrica, selSemana) {
            const key = metrica + '|' + selSemana;
            if (key in _semanasPorMetricaCache) return _semanasPorMetricaCache[key];
            const janela = getJanelaMesComercial(metrica);
            const semanas = getSemanasMesComercial(janela.inicioReal, janela.diasNoMes);
            const semanaObj = semanas[Number(selSemana) - 1] || null;
            _semanasPorMetricaCache[key] = semanaObj;
            return semanaObj;
        }

        // Verifica se a coluna de mês/data de UMA métrica específica (ex.: Mês/Data Aprovação, para
        // aprovações; Mês/Data Ganho, para vendas) bate com o período de referência — e, se houver
        // filtro de "Semana" (do mês) ativo, também com essa semana REAL (segunda a domingo, dentro
        // da janela do mês comercial da PRÓPRIA métrica), usando a MESMA data da métrica. Assim cada
        // métrica confere a SUA própria coluna, não fica presa à de Cadastro.
        function metricMatchesRef(row, mesField, dateField, refDate) {
            const useMesRef = (currentPeriod === 'mes' || currentPeriod === 'ano') && !isMockDataActive;
            const periodOk = useMesRef
                ? checkMesPeriodMatch(row[mesField], currentPeriod, refDate, getSelectedMeses())
                : checkPeriodMatch(row[dateField], currentPeriod, refDate);
            if (!periodOk) return false;

            const selSemana = document.getElementById('filterSemana').value;
            if (selSemana) {
                const d = parseDate(row[dateField]);
                const semanaObj = getSemanaRangeParaMetrica(MES_FIELD_PARA_METRICA[mesField] || 'analises', selSemana);
                if (!d || !semanaObj || d < semanaObj.inicio || d > semanaObj.fim) return false;
            }
            return true;
        }

        function calculateKPIs(refDate) {
            let analysesCount = 0;
            let approvalsCount = 0;
            let salesGeral = 0;       // GERAL: todas as vendas ganhas no mês (base completa)
            let vgvGeral = 0;
            let salesFinal = 0;       // FINALIZADAS: geral menos "Venda Informada"
            let vgvFinal = 0;
            let comissaoCorretorTotal = 0; // comissão estimada do corretor (base geral)

            filteredDataset.forEach(row => {
                // Análises: por safra (Mês Cadastro)
                if (metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', refDate)) analysesCount++;
                // Aprovações: por DATA DE APROVAÇÃO (quando aprovou), não pela safra — com respaldo
                // pra Mês/Data Cadastro se a planilha não tiver a data de aprovação preenchida.
                if (isAprovadoNoPeriodo(row, refDate)) {
                    approvalsCount++;
                }

                // Vendas e VGV: por Mês Ganho. Geral = todas as ganhas; Finalizada = geral sem "Venda Informada".
                if (isVendaGanhaReal(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', refDate)) {
                    const v = getVGV(row);
                    salesGeral++; vgvGeral += v;
                    comissaoCorretorTotal += getMoneyField(row, 'Comissão Corretor');
                    if (isVendaFinalizada(row)) { salesFinal++; vgvFinal += v; }
                }
            });

            kpiValues.analyses = analysesCount;
            kpiValues.approvals = approvalsCount;
            kpiValues.salesGeral = salesGeral;
            kpiValues.vgvGeral = vgvGeral;
            kpiValues.salesFinal = salesFinal;
            kpiValues.vgvFinal = vgvFinal;
            kpiValues.comissaoCorretor = comissaoCorretorTotal;
            // Funil, conversões, alertas e relatórios usam a BASE COMPLETA (geral), fixa (não muda com o toggle).
            kpiValues.sales = salesGeral;
            kpiValues.vgv = vgvGeral;

            // Modo de visualização (toggle): cartões Vendas/VGV/Ticket seguem o modo escolhido.
            const isFinal = vendasMode === 'finalizadas';
            const salesView = isFinal ? salesFinal : salesGeral;
            const vgvView = isFinal ? vgvFinal : vgvGeral;
            kpiValues.salesView = salesView;
            kpiValues.vgvView = vgvView;

        }

        // Agendamentos/Compareceu (Agenda de Visitas) no período de referência — mesma lógica de
        // "cada métrica confere sua própria data" das outras etapas, só que pela coluna Data.
        function calculateAgendaKPIs(refDate) {
            let agendamentos = 0, compareceu = 0, naoCompareceu = 0;
            filteredAgendaDataset.forEach(row => {
                if (agendaMatchesRef(row, refDate, 'agendamentos')) agendamentos++;
                if (isCompareceu(row) && agendaMatchesRef(row, refDate, 'compareceu')) compareceu++;
                else if (isNaoCompareceu(row) && agendaMatchesRef(row, refDate, 'agendamentos')) naoCompareceu++;
            });
            kpiValues.agendamentos = agendamentos;
            kpiValues.compareceu = compareceu;
            kpiValues.naoCompareceu = naoCompareceu;
        }

        // Prospecção (3ª planilha) usa a coluna própria "_MesComercialNorm" (texto, como a
        // planilha principal) — por isso reaproveita metricMatchesRef() direto, sem precisar da
        // lógica de janela por data que a Agenda precisa (que não tem coluna de mês em texto).
        function calculateProspeccaoKPIs(refDate) {
            let total = 0;
            filteredProspeccaoDataset.forEach(row => {
                if (metricMatchesRef(row, '_MesComercialNorm', 'Cadastro', refDate)) total++;
            });
            kpiValues.prospeccao = total;
        }

        // Aba "Corretor": um card por corretor com o funil completo do mês (mesmos critérios por
        // etapa do Funil de Vendas — cada uma pela sua própria fonte/coluna de data) + conversão
        // entre cada etapa consecutiva. Respeita os filtros do topo (Corretor/Equipe/Construtora/
        // Empreendimento já embutidos em filteredDataset/filteredAgendaDataset/
        // filteredProspeccaoDataset, e Mês Comercial via currentRefDate*).
        let corretorViewMode = 'grid'; // 'grid' | 'list'
        let corretorDadosCache = []; // último cálculo, usado pelo botão Exportar

        function setCorretorViewMode(mode) {
            corretorViewMode = mode;
            renderCorretorCards();
        }

        // Badge de posição no ranking do mês (por VGV/Vendas/Análises/Conversão, conforme o
        // "Ordenar por" selecionado) — troféu nos 3 primeiros, texto simples nos demais.
        function corretorRankBadge(rank) {
            if (rank === 1) return `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-1 shrink-0"><i class="fa-solid fa-trophy" style="font-size:9px"></i> 1º Lugar</span>`;
            if (rank === 2) return `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-slate-300 bg-slate-700/40 border border-slate-600/40 rounded-full px-2 py-1 shrink-0"><i class="fa-solid fa-trophy" style="font-size:9px"></i> 2º Lugar</span>`;
            if (rank === 3) return `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-orange-300 bg-orange-500/15 border border-orange-500/30 rounded-full px-2 py-1 shrink-0"><i class="fa-solid fa-trophy" style="font-size:9px"></i> 3º Lugar</span>`;
            return `<span class="text-[10px] font-bold text-slate-500 bg-slate-800 border border-slate-700 rounded-full px-2 py-1 shrink-0">${rank}º Lugar</span>`;
        }

        // Legenda das 6 etapas do funil (ícone + nome), reaproveitada em cima dos cards/lista —
        // mesma ordem/cores usadas em cada card e na Evolução Mensal (FUNIL_ETAPAS/FUNIL_CORES).
        function renderCorretorLegendRow() {
            const el = document.getElementById('corretorLegendRow');
            if (!el) return;
            el.innerHTML = FUNIL_ETAPAS.map((e, i) => {
                const cl = FUNIL_CORES[e.color];
                const badge = `
                    <span class="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 shrink-0">
                        <span class="w-5 h-5 rounded border ${cl.border} bg-${e.color}-500/10 text-${e.color}-400 flex items-center justify-center"><i class="fa-solid ${e.icon}" style="font-size:8px"></i></span>
                        ${e.label}
                    </span>`;
                return i === 0 ? badge : `<i class="fa-solid fa-chevron-right text-slate-700 shrink-0" style="font-size:8px"></i>${badge}`;
            }).join('');
        }

        // Popula o seletor de mês do Painel do Corretor com os mesmos meses comerciais dos pills
        // do topo, sincronizado com o mês de referência atual.
        function renderCorretorMesSelect() {
            const sel = document.getElementById('corretorMesSelect');
            if (!sel) return;
            const mesSelect = document.getElementById('filterMes');
            const options = Array.from(mesSelect.options)
                .filter(o => o.value !== '')
                .sort((a, b) => {
                    const anoA = getMesAno(a.value) || 0, anoB = getMesAno(b.value) || 0;
                    if (anoA !== anoB) return anoA - anoB;
                    return (MESES_IDX[normalizeMes(a.value)] ?? 0) - (MESES_IDX[normalizeMes(b.value)] ?? 0);
                });
            sel.innerHTML = options.map(o => `<option value="${o.value}">${mesLabelAbbrev(o.value)}</option>`).join('');
            const valorAtual = `${getMesName(currentRefDate.getMonth() + 1)}/${currentRefDate.getFullYear()}`.toLowerCase();
            const match = options.find(o => o.value.toLowerCase() === valorAtual);
            if (match) sel.value = match.value;
        }

        // Ao trocar o mês no seletor do Painel do Corretor, seleciona SÓ aquele mês nos pills
        // globais de Mês Comercial (substitui, não soma) — uma única fonte de verdade do filtro.
        function corretorMesSelectChanged(value) {
            if (!value) return;
            const mesSelect = document.getElementById('filterMes');
            Array.from(mesSelect.options).forEach(o => { o.selected = (o.value === value); });
            const anoSelect = document.getElementById('filterAno');
            const refMes = getReferenceMesComercial();
            anoSelect.value = refMes ? refMes.ano : '';
            applyFilters();
            renderMesComercialPills();
            renderSemanaPills();
        }

        // Variação percentual simples vs mês anterior — null quando não há base de comparação.
        function corretorTrendPct(atual, anterior) {
            if (!anterior) return atual > 0 ? 100 : null;
            return ((atual - anterior) / anterior) * 100;
        }

        // 5 cards de resumo do mês (dentro do filtro atual): VGV Total, Análises, Aprovados,
        // Vendas, Taxa de Conversão Geral (Vendas ÷ Análises) — cada um com variação vs mês
        // anterior. "Mês anterior" segue o mesmo padrão ad-hoc já usado nos 5 cards financeiros
        // do Funil de Vendas: decrementa o mês de referência atual e reaplica os mesmos critérios
        // de matching (metricMatchesRef/isAprovadoNoPeriodo/isVendaGanhaReal).
        function renderCorretorSummaryCards() {
            const el = document.getElementById('corretorSummaryCards');
            if (!el) return;

            let mesAnteriorIdx = currentRefDate.getMonth() - 1, anoAnterior = currentRefDate.getFullYear();
            if (mesAnteriorIdx < 0) { mesAnteriorIdx = 11; anoAnterior -= 1; }
            const refAnterior = new Date(anoAnterior, mesAnteriorIdx, 15);

            let analisesAnt = 0, aprovAnt = 0, vendasAnt = 0, vgvAnt = 0;
            filteredDataset.forEach(row => {
                if (metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', refAnterior)) analisesAnt++;
                if (isAprovadoNoPeriodo(row, refAnterior)) aprovAnt++;
                if (isVendaGanhaReal(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', refAnterior)) { vendasAnt++; vgvAnt += getVGV(row); }
            });

            const analisesAtual = kpiValues.analyses || 0;
            const aprovAtual = kpiValues.approvals || 0;
            const vendasAtual = kpiValues.sales || 0;
            const vgvAtual = kpiValues.vgv || 0;
            const convAtual = analisesAtual > 0 ? (vendasAtual / analisesAtual) * 100 : 0;
            const convAnt = analisesAnt > 0 ? (vendasAnt / analisesAnt) * 100 : 0;

            const CORES5 = {
                indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400' },
                emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
                sky: { bg: 'bg-sky-500/10', text: 'text-sky-400' },
                amber: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
                rose: { bg: 'bg-rose-500/10', text: 'text-rose-400' }
            };

            const cards = [
                { label: 'VGV Total do Mês', valor: formatCurrencyMillions(vgvAtual), icon: 'fa-sack-dollar', color: 'indigo', trendPct: corretorTrendPct(vgvAtual, vgvAnt) },
                { label: 'Total de Análises', valor: analisesAtual, icon: 'fa-users', color: 'emerald', trendPct: corretorTrendPct(analisesAtual, analisesAnt) },
                { label: 'Aprovados', valor: aprovAtual, icon: 'fa-shield-halved', color: 'sky', trendPct: corretorTrendPct(aprovAtual, aprovAnt) },
                { label: 'Vendas', valor: vendasAtual, icon: 'fa-bag-shopping', color: 'amber', trendPct: corretorTrendPct(vendasAtual, vendasAnt) },
                { label: 'Taxa de Conversão Geral', valor: `${convAtual.toFixed(1)}%`, icon: 'fa-chart-line', color: 'rose', trendPct: (convAtual || convAnt) ? (convAtual - convAnt) : null, isPP: true }
            ];

            el.innerHTML = cards.map(c => {
                const cl = CORES5[c.color];
                let trendHtml = '<span class="text-slate-600">sem mês anterior</span>';
                if (c.trendPct !== null) {
                    const up = c.trendPct >= 0;
                    const txt = c.isPP ? `${Math.abs(c.trendPct).toFixed(1)} p.p.` : `${Math.abs(c.trendPct).toFixed(1)}%`;
                    trendHtml = `<span class="${up ? 'text-emerald-400' : 'text-rose-400'} font-bold"><i class="fa-solid fa-arrow-${up ? 'up' : 'down'}" style="font-size:8px"></i> ${txt}</span> <span class="text-slate-600">vs mês anterior</span>`;
                }
                return `
                    <div class="bg-slate-900/40 rounded-xl border border-slate-800 p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <div class="w-8 h-8 rounded-full ${cl.bg} ${cl.text} flex items-center justify-center text-xs"><i class="fa-solid ${c.icon}"></i></div>
                            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wide">${c.label}</span>
                        </div>
                        <div class="text-xl font-extrabold text-white">${c.valor}</div>
                        <div class="text-[10px] mt-1">${trendHtml}</div>
                    </div>
                `;
            }).join('');
        }

        // Monta a versão em tabela (modo "lista") do Desempenho por Corretor.
        function buildCorretorListTable(dados) {
            const headCells = FUNIL_ETAPAS.map(e => `<th class="text-center py-2 px-2 text-[10px] uppercase text-slate-500">${e.label}</th>`).join('');
            const rows = dados.map((d, i) => {
                const conv = d.analises > 0 ? ((d.vendas / d.analises) * 100).toFixed(1) : '0.0';
                const nomeEsc = d.nomeCompleto.replace(/'/g, "\\'");
                const cells = FUNIL_ETAPAS.map(e => `<td onclick="openCorretorEtapaDetail('${nomeEsc}', '${e.key}')" class="text-center py-2 px-2 font-semibold text-slate-200 cursor-pointer hover:underline hover:text-white transition" title="Ver clientes">${d[e.key]}</td>`).join('');
                return `
                    <tr class="border-t border-slate-800/60 hover:bg-slate-800/20 transition">
                        <td class="py-2 pl-2 text-slate-500 font-bold">${i + 1}º</td>
                        <td class="py-2 px-2 font-bold text-slate-200 whitespace-nowrap">${d.nomeCompleto}</td>
                        ${cells}
                        <td class="text-center py-2 px-2 font-bold text-emerald-400">${formatCurrencyMillions(d.vgv)}</td>
                        <td class="text-center py-2 px-2 font-bold text-brand-400">${conv}%</td>
                    </tr>`;
            }).join('');
            return `
                <thead>
                    <tr class="border-b border-slate-800">
                        <th class="text-left py-2 pl-2 text-[10px] uppercase text-slate-500">Pos</th>
                        <th class="text-left py-2 px-2 text-[10px] uppercase text-slate-500">Corretor</th>
                        ${headCells}
                        <th class="text-center py-2 px-2 text-[10px] uppercase text-slate-500">VGV</th>
                        <th class="text-center py-2 px-2 text-[10px] uppercase text-slate-500">Conversão</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>`;
        }

        // Exporta a tabela de desempenho por corretor (último cálculo renderizado) em .csv.
        function exportCorretorSummaryCSV() {
            if (!corretorDadosCache.length) { showToast('Nada para exportar.', true); return; }
            const headers = ['Corretor', 'Prospecção', 'Agendamentos', 'Compareceu', 'Análises', 'Aprovações', 'Vendas', 'VGV', 'Taxa de Conversão'];
            const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
            const lines = [headers.map(esc).join(';')];
            corretorDadosCache.forEach(d => {
                const conv = d.analises > 0 ? `${((d.vendas / d.analises) * 100).toFixed(1)}%` : '0.0%';
                lines.push([d.nomeCompleto, d.prospeccao, d.agendamentos, d.compareceu, d.analises, d.aprovacoes, d.vendas, formatCurrency(d.vgv), conv].map(esc).join(';'));
            });
            const csvContent = '\ufeff' + lines.join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `painel-corretor-${getMesName(currentRefDate.getMonth() + 1).toLowerCase()}-${currentRefDate.getFullYear()}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`Excel exportado: ${corretorDadosCache.length} corretor(es).`);
        }

        // Abre o detalhamento de clientes de UMA etapa do funil de UM corretor específico (clique
        // num número do Painel do Corretor, card ou lista) — mesmos critérios do openFunnelDetail,
        // só que também filtrado por row.Corretor, pra funcionar mesmo quando o filtro de Corretor
        // do topo está em "Todos" (o painel mostra vários corretores ao mesmo tempo).
        function openCorretorEtapaDetail(corretorNome, metrica) {
            const isAgendaMetrica = metrica === 'agendamentos' || metrica === 'compareceu';
            const refDate = metrica === 'prospeccao' ? currentRefDateProspeccao : (isAgendaMetrica ? currentRefDateAgenda : currentRefDate);
            let rows, label;
            if (metrica === 'prospeccao') {
                rows = filteredProspeccaoDataset.filter(row => row.Corretor === corretorNome && metricMatchesRef(row, '_MesComercialNorm', 'Cadastro', refDate));
                label = 'Prospecção';
            } else if (metrica === 'agendamentos') {
                rows = filteredAgendaDataset.filter(row => row.Corretor === corretorNome && agendaMatchesRef(row, refDate, 'agendamentos'));
                label = 'Agendamentos';
            } else if (metrica === 'compareceu') {
                rows = filteredAgendaDataset.filter(row => row.Corretor === corretorNome && agendaMatchesRef(row, refDate, 'compareceu') && isCompareceu(row));
                label = 'Compareceram';
            } else if (metrica === 'analises') {
                rows = filteredDataset.filter(row => row.Corretor === corretorNome && metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', refDate));
                label = 'Análises';
            } else if (metrica === 'aprovacoes') {
                rows = filteredDataset.filter(row => row.Corretor === corretorNome && isAprovadoNoPeriodo(row, refDate));
                label = 'Aprovações';
            } else {
                rows = filteredDataset.filter(row => row.Corretor === corretorNome && isVendaGanhaReal(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', refDate));
                label = 'Vendas';
            }
            showDetailModal({
                label1: 'Corretor', label2: 'Etapa do Funil',
                nome: corretorNome, dataStr: `${label} — ${getMesName(refDate.getMonth() + 1)}/${refDate.getFullYear()}`,
                rows, showCorretor: false,
                totalLabel: `${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}`
            });
        }

        // Mesma ideia dos Rankings (743 elementos): só renderiza com a aba Corretor aberta.
        // `switchView('corretor')` sempre chama esta função, então nada fica desatualizado.
        function renderCorretorCards() {
            if (activeView !== 'corretor') return;
            const container = document.getElementById('corretorCardsGrid');
            if (!container) return;

            renderCorretorMesSelect();
            renderCorretorSummaryCards();
            renderCorretorLegendRow();

            const updEl = document.querySelector('#corretorUpdatedAt span');
            if (updEl) {
                const ts = lastSyncTime || new Date();
                const dd = String(ts.getDate()).padStart(2, '0');
                const mm = String(ts.getMonth() + 1).padStart(2, '0');
                const yyyy = ts.getFullYear();
                const hh = String(ts.getHours()).padStart(2, '0');
                const mi = String(ts.getMinutes()).padStart(2, '0');
                updEl.textContent = `Dados atualizados até ${dd}/${mm}/${yyyy} ${hh}:${mi}`;
            }

            // Respeita o filtro de Corretor do topo — se um corretor específico estiver
            // selecionado, mostra só o card dele em vez dos 11 (10 deles zerados). Com o filtro em
            // "Todos", lista os ATIVOS + os DESATIVADOS QUE PRODUZIRAM no período em exibição
            // (desativar não apaga histórico); quem saiu e não produziu no período não aparece.
            const selCorretorFiltro = document.getElementById('filterCorretor').value;
            const inativosComProducaoNoPeriodo = Array.from(new Set(
                filteredDataset
                    .filter(row => row.Corretor && !isCorretorActive(row.Corretor)
                        && metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', currentRefDate))
                    .map(row => row.Corretor)
            ));
            const corretores = selCorretorFiltro
                ? [selCorretorFiltro]
                : getActiveCorretores().concat(inativosComProducaoNoPeriodo);
            let dados = corretores.map(c => {
                const prospeccao = filteredProspeccaoDataset.filter(row => row.Corretor === c && metricMatchesRef(row, '_MesComercialNorm', 'Cadastro', currentRefDateProspeccao)).length;
                const agendamentos = filteredAgendaDataset.filter(row => row.Corretor === c && agendaMatchesRef(row, currentRefDateAgenda, 'agendamentos')).length;
                const compareceu = filteredAgendaDataset.filter(row => row.Corretor === c && isCompareceu(row) && agendaMatchesRef(row, currentRefDateAgenda, 'compareceu')).length;
                const analises = filteredDataset.filter(row => row.Corretor === c && metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', currentRefDate)).length;
                const aprovacoes = filteredDataset.filter(row => row.Corretor === c && isAprovadoNoPeriodo(row, currentRefDate)).length;
                const vendaRows = filteredDataset.filter(row => row.Corretor === c && isVendaGanhaReal(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', currentRefDate));
                const vendas = vendaRows.length;
                const vgv = vendaRows.reduce((s, r) => s + getVGV(r), 0);
                return { nomeCompleto: c, prospeccao, agendamentos, compareceu, analises, aprovacoes, vendas, vgv };
            });

            const sortSel = document.getElementById('corretorSortSelect');
            const sortBy = sortSel ? sortSel.value : 'vgv';
            const sorters = {
                vgv: (a, b) => b.vgv - a.vgv,
                vendas: (a, b) => b.vendas - a.vendas,
                analises: (a, b) => b.analises - a.analises,
                conversao: (a, b) => (b.analises > 0 ? b.vendas / b.analises : 0) - (a.analises > 0 ? a.vendas / a.analises : 0)
            };
            dados.sort(sorters[sortBy] || sorters.vgv);
            corretorDadosCache = dados;

            const listWrap = document.getElementById('corretorListWrap');
            const gridBtn = document.getElementById('corretorViewGridBtn');
            const listBtn = document.getElementById('corretorViewListBtn');
            const activeBtnCls = 'px-2.5 py-1.5 rounded-md text-xs transition bg-slate-800 text-slate-100';
            const inactiveBtnCls = 'px-2.5 py-1.5 rounded-md text-xs transition text-slate-500 hover:text-slate-300';
            if (gridBtn) gridBtn.className = corretorViewMode === 'grid' ? activeBtnCls : inactiveBtnCls;
            if (listBtn) listBtn.className = corretorViewMode === 'list' ? activeBtnCls : inactiveBtnCls;
            container.classList.toggle('hidden', corretorViewMode !== 'grid');
            if (listWrap) listWrap.classList.toggle('hidden', corretorViewMode !== 'list');

            if (dados.length === 0) {
                container.innerHTML = '<p class="text-xs text-slate-500 col-span-full">Nenhum corretor ativo neste período.</p>';
                const listTable = document.getElementById('corretorListTable');
                if (listTable) listTable.innerHTML = '';
                return;
            }

            if (corretorViewMode === 'list') {
                const listTable = document.getElementById('corretorListTable');
                if (listTable) listTable.innerHTML = buildCorretorListTable(dados);
                return;
            }

            container.innerHTML = dados.map((d, idx) => {
                const { nome, cargo } = parseNomeCargo(d.nomeCompleto);
                const avatar = corretorAvatarInner(d.nomeCompleto, 'h-9 w-9', 'text-[11px]');
                const conv = d.analises > 0 ? ((d.vendas / d.analises) * 100).toFixed(1) : '0.0';

                const stageHtml = FUNIL_ETAPAS.map((e, i) => {
                    const valor = d[e.key];
                    const cl = FUNIL_CORES[e.color];
                    const badge = `
                        <div onclick="openCorretorEtapaDetail('${d.nomeCompleto.replace(/'/g, "\\'")}', '${e.key}')" class="flex flex-col items-center shrink-0 cursor-pointer hover:opacity-80 transition" title="${e.label}: ${valor} — clique pra ver os clientes">
                            <div class="w-9 h-9 rounded-lg border ${cl.border} bg-${e.color}-500/10 flex items-center justify-center text-${e.color}-400">
                                <i class="fa-solid ${e.icon}" style="font-size:11px"></i>
                            </div>
                            <div class="text-[11px] font-extrabold text-slate-100 mt-1">${valor}</div>
                        </div>`;
                    if (i === 0) return badge;
                    const anterior = d[FUNIL_ETAPAS[i - 1].key];
                    const pct = anterior > 0 ? Math.round((valor / anterior) * 100) : 0;
                    const seta = `
                        <div class="flex flex-col items-center shrink-0 px-0.5 pt-2.5">
                            <i class="fa-solid fa-arrow-right text-slate-700" style="font-size:9px"></i>
                            <div class="text-[8px] font-bold text-slate-500 whitespace-nowrap">${pct}%</div>
                        </div>`;
                    return seta + badge;
                }).join('');

                return `
                    <div class="bg-slate-950/40 rounded-xl border border-slate-800 p-4">
                        <div class="flex items-center gap-2.5 mb-3 pb-3 border-b border-slate-800/60">
                            ${avatar}
                            <div class="min-w-0 flex-1">
                                <div class="font-bold text-slate-200 text-sm truncate">${nome}</div>
                                ${cargo ? `<span class="text-[9px] font-bold text-slate-400 bg-slate-800 rounded px-1.5 py-0.5">${cargo}</span>` : ''}
                            </div>
                            <div class="text-right shrink-0">
                                <div class="text-[9px] text-slate-500 uppercase tracking-wide font-bold">VGV</div>
                                <div class="text-xs font-extrabold text-emerald-400">${formatCurrencyMillions(d.vgv)}</div>
                            </div>
                        </div>
                        <div class="flex items-start gap-0.5 overflow-x-auto pb-1">${stageHtml}</div>
                        <div class="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-800/60 flex-wrap">
                            <div class="flex items-center gap-4">
                                <div>
                                    <div class="text-[9px] text-slate-500 uppercase font-bold">Taxa de Conversão</div>
                                    <div class="text-sm font-extrabold text-slate-100">${conv}%</div>
                                </div>
                                <div>
                                    <div class="text-[9px] text-slate-500 uppercase font-bold">Vendas</div>
                                    <div class="text-sm font-extrabold text-slate-100">${d.vendas}</div>
                                </div>
                            </div>
                            ${corretorRankBadge(idx + 1)}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Abre o detalhamento de clientes de UMA etapa do funil (Análises/Aprovações/Vendas),
        // usando exatamente o mesmo critério de cada métrica que os cartões de KPI já usam.
        function openFunnelDetail(metrica) {
            const isAgendaMetrica = metrica === 'agendamentos' || metrica === 'compareceu';
            const refDate = metrica === 'prospeccao' ? currentRefDateProspeccao : (isAgendaMetrica ? currentRefDateAgenda : currentRefDate);
            let rows, label;
            if (metrica === 'prospeccao') {
                rows = filteredProspeccaoDataset.filter(row => metricMatchesRef(row, '_MesComercialNorm', 'Cadastro', refDate));
                label = 'Prospecção';
            } else if (metrica === 'agendamentos') {
                rows = filteredAgendaDataset.filter(row => agendaMatchesRef(row, refDate, 'agendamentos'));
                label = 'Agendamentos';
            } else if (metrica === 'compareceu') {
                rows = filteredAgendaDataset.filter(row => agendaMatchesRef(row, refDate, 'compareceu') && isCompareceu(row));
                label = 'Compareceram';
            } else if (metrica === 'analises') {
                rows = filteredDataset.filter(row => metricMatchesRef(row, 'Mês Cadastro', 'Data Cadastro', refDate));
                label = 'Análises';
            } else if (metrica === 'aprovacoes') {
                rows = filteredDataset.filter(row => isAprovadoNoPeriodo(row, refDate));
                label = 'Aprovações';
            } else {
                rows = filteredDataset.filter(row => isVendaGanhaReal(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', refDate));
                label = 'Vendas';
            }
            showDetailModal({
                label1: 'Etapa do Funil', label2: 'Mês de Referência',
                nome: `Funil — ${label}`,
                dataStr: `${getMesName(refDate.getMonth() + 1)}/${refDate.getFullYear()}`,
                rows, showCorretor: true,
                totalLabel: `${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}`
            });
        }

        // Abre o detalhamento de clientes de um mês do gráfico "Evolução dos Ganhos" (clique na
        // barra ou na bolha). Todos os ganhos do mês — finalizados + pendentes — igual à barra.
        function openGanhosMesDetail(mesNome, mesAno) {
            const rows = filteredDataset.filter(row => {
                if (!isGanho(row)) return false;
                const nome = normalizeMes(row['Mês Ganho']);
                const ano = getMesAno(row['Mês Ganho']) || 0;
                return nome === mesNome && ano === mesAno;
            });
            showDetailModal({
                label1: 'Métrica', label2: 'Mês de Referência',
                nome: 'Evolução dos Ganhos',
                dataStr: mesAno ? `${mesNome}/${mesAno}` : mesNome,
                rows, showCorretor: true,
                totalLabel: `${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}`
            });
        }

        // Abre o detalhamento de clientes de um ponto do gráfico "Evolução Mensal de Operações"
        // (clique em qualquer etapa do funil de um mês), cada métrica pela sua própria fonte/coluna
        // de mês — igual ao critério usado no resto do painel e no mesmo bucketing do addEvolucao().
        function openEvolucaoMesDetail(metrica, mesNome, mesAno) {
            let rows, label;
            if (metrica === 'prospeccao') {
                rows = filteredProspeccaoDataset.filter(row => normalizeMes(row['_MesComercialNorm']) === mesNome && (getMesAno(row['_MesComercialNorm']) || 0) === mesAno);
                label = 'Prospecção';
            } else if (metrica === 'agendamentos') {
                rows = filteredAgendaDataset.filter(row => { const m = agendaMesStr(row, 'agendamentos'); return normalizeMes(m) === mesNome && (getMesAno(m) || 0) === mesAno; });
                label = 'Agendamentos';
            } else if (metrica === 'compareceu') {
                rows = filteredAgendaDataset.filter(row => { const m = agendaMesStr(row, 'compareceu'); return isCompareceu(row) && normalizeMes(m) === mesNome && (getMesAno(m) || 0) === mesAno; });
                label = 'Compareceram';
            } else if (metrica === 'analises') {
                rows = filteredDataset.filter(row => normalizeMes(row['Mês Cadastro']) === mesNome && (getMesAno(row['Mês Cadastro']) || 0) === mesAno);
                label = 'Análises';
            } else if (metrica === 'aprovacoes') {
                rows = filteredDataset.filter(row => {
                    if (!isAprovado(row['Situação - Analise'])) return false;
                    const mesRef = mesAprovacaoEfetivo(row);
                    return normalizeMes(mesRef) === mesNome && (getMesAno(mesRef) || 0) === mesAno;
                });
                label = 'Aprovações';
            } else {
                rows = filteredDataset.filter(row => isGanho(row) && normalizeMes(row['Mês Ganho']) === mesNome && (getMesAno(row['Mês Ganho']) || 0) === mesAno);
                label = 'Vendas';
            }
            showDetailModal({
                label1: 'Métrica', label2: 'Mês de Referência',
                nome: `Evolução Mensal — ${label}`,
                dataStr: mesAno ? `${mesNome}/${mesAno}` : mesNome,
                rows, showCorretor: true,
                totalLabel: `${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}`
            });
        }

        function formatCurrencyMillions(val) {
            if (val >= 1000000) {
                return `R$ ${(val / 1000000).toFixed(2)}M`;
            }
            return `R$ ${(val / 1000).toFixed(0)}k`;
        }

        function formatCurrency(val) {
            return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);
        }

        // Seta + % colorida comparando um valor atual com o do mês anterior (usado nos 5 cards
        // financeiros do rodapé do Funil).
        function trendHtml(atual, anterior) {
            if (!anterior) return '<span class="text-slate-600">sem mês anterior</span>';
            const delta = ((atual - anterior) / anterior) * 100;
            const up = delta >= 0;
            return `<span class="${up ? 'text-brand-400' : 'text-rose-400'} font-bold"><i class="fa-solid fa-arrow-${up ? 'up' : 'down'} text-[8px]"></i> ${Math.abs(delta).toFixed(0)}%</span> <span class="text-slate-500">vs mês anterior</span>`;
        }

        // Tira do funil "acumulado do mês" pra "só hoje": mesma lógica de HOJE já usada nos
        // Rankings Rápidos (checkPeriodMatch com 'hoje'), mas em cima do filteredDataset/
        // filteredAgendaDataset/filteredProspeccaoDataset já filtrados (Corretor/Equipe/etc.),
        // pra respeitar os mesmos filtros estruturais que o resto do Funil de Vendas usa.
        function renderFunnelHojeStrip() {
            const el = document.getElementById('funnelHojeStrip');
            if (!el) return;
            const hojeReal = isMockDataActive ? new Date(2026, 5, 9) : new Date();

            funnelHojeRowsCache = { prospeccao: [], agendamentos: [], compareceu: [], analises: [], aprovacoes: [], vendas: [] };
            filteredDataset.forEach(row => {
                if (checkPeriodMatch(row['Data Cadastro'], 'hoje', hojeReal)) funnelHojeRowsCache.analises.push(row);
                if (isAprovado(row['Situação - Analise']) && checkPeriodMatch(dataAprovacaoEfetiva(row), 'hoje', hojeReal)) funnelHojeRowsCache.aprovacoes.push(row);
                if (isVendaGanhaReal(row) && checkPeriodMatch(row['Data Ganho'], 'hoje', hojeReal)) funnelHojeRowsCache.vendas.push(row);
            });
            filteredAgendaDataset.forEach(row => {
                if (checkPeriodMatch(agendaDateForMetric(row, 'agendamentos'), 'hoje', hojeReal)) funnelHojeRowsCache.agendamentos.push(row);
                if (isCompareceu(row) && checkPeriodMatch(agendaDateForMetric(row, 'compareceu'), 'hoje', hojeReal)) funnelHojeRowsCache.compareceu.push(row);
            });
            filteredProspeccaoDataset.forEach(row => {
                if (checkPeriodMatch(row['Cadastro'], 'hoje', hojeReal)) funnelHojeRowsCache.prospeccao.push(row);
            });

            const chips = [
                { key: 'prospeccao', label: 'Prospecção', valor: funnelHojeRowsCache.prospeccao.length, icon: 'fa-bullhorn', color: 'pink' },
                { key: 'agendamentos', label: 'Agendamentos', valor: funnelHojeRowsCache.agendamentos.length, icon: 'fa-calendar-check', color: 'violet' },
                { key: 'compareceu', label: 'Compareceu', valor: funnelHojeRowsCache.compareceu.length, icon: 'fa-door-open', color: 'cyan' },
                { key: 'analises', label: 'Análises', valor: funnelHojeRowsCache.analises.length, icon: 'fa-file-invoice-dollar', color: 'sky' },
                { key: 'aprovacoes', label: 'Aprovações', valor: funnelHojeRowsCache.aprovacoes.length, icon: 'fa-circle-check', color: 'amber' },
                { key: 'vendas', label: 'Vendas', valor: funnelHojeRowsCache.vendas.length, icon: 'fa-house-circle-check', color: 'brand' }
            ];

            el.innerHTML = `
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mr-1"><i class="fa-solid fa-bolt text-amber-400"></i>Hoje</span>
                ${chips.map(c => `
                    <span onclick="openFunnelHojeDetail('${c.key}')" class="inline-flex items-center gap-1.5 text-[11px] font-bold pl-2 pr-2.5 py-1 rounded-full bg-${c.color}-500/10 text-${c.color}-300 border border-${c.color}-500/20 cursor-pointer hover:brightness-125 transition">
                        <i class="fa-solid ${c.icon} text-${c.color}-400" style="font-size:9px"></i>${c.valor} <span class="font-semibold text-${c.color}-400/80">${c.label}</span>
                    </span>
                `).join('')}
            `;
        }

        // Clique num chip da tira "Produtividade de Hoje": abre os clientes por trás daquele
        // número, usando o cache montado na mesma passagem de contagem do renderFunnelHojeStrip
        // (mesmo padrão do openQuickRankingDetail, pra nunca divergir do número mostrado).
        function openFunnelHojeDetail(etapaKey) {
            const rows = funnelHojeRowsCache[etapaKey] || [];
            const labels = { prospeccao: 'Prospecção', agendamentos: 'Agendamentos', compareceu: 'Compareceram', analises: 'Análises', aprovacoes: 'Aprovações', vendas: 'Vendas' };
            const hojeReal = isMockDataActive ? new Date(2026, 5, 9) : new Date();
            showDetailModal({
                label1: 'Etapa do Funil', label2: 'Data',
                nome: `Hoje — ${labels[etapaKey] || etapaKey}`,
                dataStr: hojeReal.toLocaleDateString('pt-BR'),
                rows, showCorretor: true,
                totalLabel: `${rows.length} ${rows.length === 1 ? 'cliente' : 'clientes'}`
            });
        }

        // ===== Geometria do funil visual (SVG com bandas afuniladas + cantos arredondados) =====
        // clip-path não arredonda o corte diagonal de um trapézio, então as bandas são desenhadas
        // como <path> com curvas Q em cada vértice (raio r), calculadas por roundedPolygonPath().
        // Larguras (boundaries) definem um afunilamento contínuo e forte: a base de cada banda é o
        // topo da próxima, sem degraus — bem mais óbvio que o clip-path sutil da versão anterior.
        function roundedPolygonPath(points, radii) {
            const n = points.length;
            const rArr = Array.isArray(radii) ? radii : new Array(n).fill(radii);
            const d = [];
            for (let i = 0; i < n; i++) {
                const prev = points[(i - 1 + n) % n];
                const curr = points[i];
                const next = points[(i + 1) % n];
                const toPrev = [prev[0] - curr[0], prev[1] - curr[1]];
                const toNext = [next[0] - curr[0], next[1] - curr[1]];
                const lenPrev = Math.hypot(toPrev[0], toPrev[1]) || 1;
                const lenNext = Math.hypot(toNext[0], toNext[1]) || 1;
                const rr = Math.min(rArr[i], lenPrev / 2, lenNext / 2);
                if (rr <= 0.01) {
                    d.push(i === 0 ? `M ${curr[0].toFixed(2)},${curr[1].toFixed(2)}` : `L ${curr[0].toFixed(2)},${curr[1].toFixed(2)}`);
                    continue;
                }
                const A = [curr[0] + (toPrev[0] / lenPrev) * rr, curr[1] + (toPrev[1] / lenPrev) * rr];
                const B = [curr[0] + (toNext[0] / lenNext) * rr, curr[1] + (toNext[1] / lenNext) * rr];
                d.push(i === 0 ? `M ${A[0].toFixed(2)},${A[1].toFixed(2)}` : `L ${A[0].toFixed(2)},${A[1].toFixed(2)}`);
                d.push(`Q ${curr[0].toFixed(2)},${curr[1].toFixed(2)} ${B[0].toFixed(2)},${B[1].toFixed(2)}`);
            }
            d.push('Z');
            return d.join(' ');
        }
        // Largura no topo de cada banda + base da última. Bandas COLADAS (sem gap entre elas —
        // pedido do usuário, formato de referência) formando 1 silhueta de funil contínua; só os
        // cantos EXTERNOS arredondam (topo da 1ª banda, base da última) — as divisas internas entre
        // bandas ficam retas, com um traço escuro fino separando (stroke no path).
        const FUNIL_BOUNDARIES = [320, 270, 215, 155, 110];
        const FUNIL_BAND_H = 50, FUNIL_GAP_H = 0, FUNIL_TOP_PAD = 4, FUNIL_CX = 200, FUNIL_CORNER_R = 10;
        const FUNIL_GRADIENTS = {
            pink: ['#be185d', '#f472b6'], violet: ['#6d28d9', '#8b5cf6'], cyan: ['#0e7490', '#22d3ee'],
            blue: ['#2563eb', '#3b82f6'], amber: ['#d97706', '#f59e0b'], emerald: ['#059669', '#10b981']
        };
        // Desenha o funil inteiro (4 bandas coladas, só rótulo + número) num único <svg>. As
        // conversões saíram de dentro do SVG e viraram um painel próprio (buildConvPanel), ao lado.
        function buildFunilSVG(svgId, bands) {
            const svg = document.getElementById(svgId);
            if (!svg) return;
            let defs = '<defs>';
            let body = '';
            const last = bands.length - 1;
            bands.forEach((e, i) => {
                const yTop = FUNIL_TOP_PAD + i * (FUNIL_BAND_H + FUNIL_GAP_H);
                const yBot = yTop + FUNIL_BAND_H;
                const topW = FUNIL_BOUNDARIES[i], botW = FUNIL_BOUNDARIES[i + 1];
                const xTL = FUNIL_CX - topW / 2, xTR = FUNIL_CX + topW / 2;
                const xBL = FUNIL_CX - botW / 2, xBR = FUNIL_CX + botW / 2;
                const gradId = `funilGrad_${svgId}_${i}`;
                const [c1, c2] = FUNIL_GRADIENTS[e.color] || FUNIL_GRADIENTS.blue;
                defs += `<linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>`;
                // Ordem dos pontos: TL, TR, BR, BL — só arredonda os 2 de cima na 1ª banda e os 2 de baixo na última.
                const radii = [
                    i === 0 ? FUNIL_CORNER_R : 0,
                    i === 0 ? FUNIL_CORNER_R : 0,
                    i === last ? FUNIL_CORNER_R : 0,
                    i === last ? FUNIL_CORNER_R : 0
                ];
                const path = roundedPolygonPath([[xTL, yTop], [xTR, yTop], [xBR, yBot], [xBL, yBot]], radii);
                const textW = Math.max(80, Math.min(topW, botW) - 12);
                body += `
                    <g onclick="openFunnelDetail('${e.metrica}')" style="cursor:pointer" class="hover:opacity-90">
                        <title>Ver clientes desta etapa</title>
                        <path d="${path}" fill="url(#${gradId})" stroke="#020617" stroke-width="${i === 0 ? 0 : 2}"/>
                        <foreignObject x="${(FUNIL_CX - textW / 2).toFixed(1)}" y="${yTop}" width="${textW.toFixed(1)}" height="${FUNIL_BAND_H}">
                            <div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1px;">
                                <div style="font-size:9px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;line-height:1.2;">${e.label}</div>
                                <div style="font-size:20px;font-weight:800;color:#fff;line-height:1.05;">${e.realizado}</div>
                            </div>
                        </foreignObject>
                    </g>`;
            });
            defs += '</defs>';
            svg.innerHTML = defs + body;
        }
        // Painel "Conversões" ao lado do funil: 1 linha grande por transição (Etapa → Etapa),
        // separadas por divisórias — reaproveita os mesmos convReal/convMeta que antes alimentavam
        // os badges dentro do SVG. Clique na linha abre o mesmo modal (etapa de ORIGEM da conversão).
        function buildConvPanel(elId, bands) {
            const el = document.getElementById(elId);
            if (!el) return;
            const rows = bands.filter(e => e.convReal !== null && e.convReal !== undefined);
            el.innerHTML = rows.map((e, idx) => {
                const nextLabel = (bands[bands.indexOf(e) + 1] || {}).label || '';
                const up = (e.convReal - e.convMeta) >= 0;
                const colorClass = up ? 'text-emerald-400' : 'text-rose-400';
                return `
                    <div onclick="openFunnelDetail('${e.metrica}')" class="cursor-pointer hover:bg-slate-900/40 transition rounded-lg px-2 -mx-2 py-2.5 ${idx > 0 ? 'border-t border-slate-800' : ''}">
                        <p class="text-xl font-black ${colorClass}">${e.convReal.toFixed(1)}%</p>
                        <p class="text-[11px] text-slate-400">${e.label} → ${nextLabel}</p>
                    </div>`;
            }).join('');
        }
        // Painel "Meta / Ideal Hoje" claro: por etapa, Realizado/Meta grande + Faltam + barra +
        // Ideal Hoje + diferença vs ideal, com badge de ritmo colorido (verde/amarelo/vermelho)
        // comparando o REALIZADO contra o IDEAL DE HOJE (não contra a meta cheia do mês) — é a
        // pergunta "tô no ritmo certo hoje?", não "já bati a meta do mês?".
        function buildMetaPanel(elId, etapas) {
            const el = document.getElementById(elId);
            if (!el) return;
            el.innerHTML = etapas.map(e => {
                const pctMeta = e.meta > 0 ? Math.min(100, (e.realizado / e.meta) * 100) : 0;
                const idealPct = e.meta > 0 ? Math.min(100, (e.ideal / e.meta) * 100) : 0;
                const faltam = Math.max(0, e.meta - e.realizado);
                const ritmoPct = e.ideal > 0 ? (e.realizado / e.ideal) * 100 : (e.realizado > 0 ? 100 : 0);
                let ritmoColor, ritmoBg, ritmoLabel;
                if (ritmoPct >= 100) { ritmoColor = 'text-emerald-400'; ritmoBg = 'bg-emerald-500/15 border-emerald-500/40'; ritmoLabel = 'No ritmo'; }
                else if (ritmoPct >= 80) { ritmoColor = 'text-amber-400'; ritmoBg = 'bg-amber-500/15 border-amber-500/40'; ritmoLabel = 'Perto'; }
                else { ritmoColor = 'text-rose-400'; ritmoBg = 'bg-rose-500/15 border-rose-500/40'; ritmoLabel = 'Abaixo'; }
                // Linha única e compacta por etapa: nome, realizado/meta, barra com o "Ideal hoje"
                // flutuando bem em cima da marca branca (não mais um badge solto à parte — o
                // usuário pediu que o número ficasse junto da própria marca/linha de tendência na
                // barra), % da meta, faltam e badge de ritmo. `min-w` garante que nada corta em
                // telas estreitas — o painel inteiro rola horizontalmente nesse caso.
                return `
                    <div onclick="openFunnelDetail('${e.metrica}')" class="flex items-center gap-2 bg-slate-950/50 border border-slate-800/70 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-slate-900/60 transition min-w-[430px]">
                        <span class="text-[10px] font-bold text-${e.color}-400 uppercase w-[92px] shrink-0 flex items-center gap-1"><i class="fa-solid ${e.icon}" style="font-size:9px"></i>${e.label}</span>
                        <span class="text-sm font-black text-slate-100 shrink-0 w-[62px]">${e.realizado}<span class="text-slate-500 text-[10px] font-semibold">/${e.meta}</span></span>
                        <div class="relative flex-1 min-w-[70px] pt-4">
                            <div class="absolute top-0 flex flex-col leading-none ${idealPct > 85 ? '-translate-x-full items-end' : (idealPct < 15 ? 'items-start' : '-translate-x-1/2 items-center')}" style="left:${idealPct}%">
                                <span class="text-[7px] font-bold text-white bg-slate-700 border border-${e.color}-400/70 rounded px-1.5 py-[1px] whitespace-nowrap shadow-sm">IDEAL <b class="text-[9px]">${e.ideal}</b></span>
                                <span class="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[3px] border-t-slate-700"></span>
                            </div>
                            <div class="relative h-2">
                                <div class="absolute inset-0 bg-slate-800 rounded-full overflow-hidden"><div class="h-full bg-${e.color}-500 rounded-full transition-all" style="width:${pctMeta}%"></div></div>
                                <div class="absolute top-1/2 w-[2px] h-[10px] -mt-[5px] bg-white rounded-full ring-1 ring-slate-950" style="left:calc(${idealPct}% - 1px)"></div>
                            </div>
                        </div>
                        <span class="text-[10px] font-bold text-${e.color}-300 w-8 text-right shrink-0">${pctMeta.toFixed(0)}%</span>
                        <span class="flex items-center gap-1 bg-amber-500/15 border border-amber-500/40 rounded-md px-2 py-0.5 shrink-0" title="Falta pra bater a meta do mês">
                            <span class="text-[8px] text-amber-400 font-bold uppercase tracking-wide">Faltam</span>
                            <span class="text-xs font-black text-amber-300">${faltam}</span>
                        </span>
                        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${ritmoBg} ${ritmoColor}">${ritmoLabel}</span>
                    </div>`;
            }).join('');
        }

        function drawFunnel() {
            renderFunnelHojeStrip();
            const prospeccao = kpiValues.prospeccao;
            const agendamentos = kpiValues.agendamentos;
            const compareceu = kpiValues.compareceu;
            const analyses = kpiValues.analyses;
            const approvals = kpiValues.approvals;
            const sales = kpiValues.sales;

            // Meta, % da meta e "ideal hoje" ao lado de cada etapa — mesma janela (início/fim/dia
            // de hoje) que desenha a linha de tendência do "Ritmo do Mês", uma por métrica (a
            // Agenda de Visitas e a Prospecção seguem a MESMA lógica de janela deslizante/config
            // manual, cada uma com seu próprio mês corrente). Se o filtro de Corretor do topo
            // estiver com um nome específico selecionado, usa a meta MENSAL INDIVIDUAL daquele
            // corretor (metasPorCorretor[nome].prMes/agMes/coMes/anMes/apMes/vdMes — painel "Metas
            // por Corretor") em vez da meta da empresa inteira (metasMensais), mesmo padrão já
            // usado na Evolução Semanal do Mês.
            const metaProspeccao = getDashboardMeta('prospeccao', 'Mes', metasMensais.prospeccao);
            const metaAgendamentos = getDashboardMeta('agendamentos', 'Mes', metasMensais.agendamentos);
            const metaCompareceu = getDashboardMeta('compareceu', 'Mes', metasMensais.compareceu);
            const metaAnalises = getDashboardMeta('analises', 'Mes', metasMensais.analises);
            const metaAprovacoes = getDashboardMeta('aprovacoes', 'Mes', metasMensais.aprovacoes);
            const metaVendas = getDashboardMeta('vendas', 'Mes', metasMensais.vendas);
            const funnelMetaFonteEl = document.getElementById('funnelMetaFonteLabel');
            if (funnelMetaFonteEl) funnelMetaFonteEl.textContent = `· ${getDashboardMetaContextLabel()}`;
            const janelaProspeccao = getJanelaMesComercial('prospeccao');
            const janelaAgendamentos = getJanelaMesComercial('agendamentos');
            const janelaCompareceu = getJanelaMesComercial('compareceu');
            const janelaAnalises = getJanelaMesComercial('analises');
            const janelaAprovacoes = getJanelaMesComercial('aprovacoes');
            const janelaVendas = getJanelaMesComercial('vendas');
            // Ideal proporcional aos DIAS ÚTEIS decorridos (domingo não conta — o admin não sobe
            // análise), pra bater exatamente com a linha de tendência do Ritmo do Mês.
            const idealPorDiaUtil = (meta, janela) => janela.diasUteisNoMes > 0 ? meta * janela.diaUtilHoje / janela.diasUteisNoMes : 0;
            const idealProspeccao = idealPorDiaUtil(metaProspeccao, janelaProspeccao);
            const idealAgendamentos = idealPorDiaUtil(metaAgendamentos, janelaAgendamentos);
            const idealCompareceu = idealPorDiaUtil(metaCompareceu, janelaCompareceu);
            const idealAnalises = idealPorDiaUtil(metaAnalises, janelaAnalises);
            const idealAprovacoes = idealPorDiaUtil(metaAprovacoes, janelaAprovacoes);
            const idealVendas = idealPorDiaUtil(metaVendas, janelaVendas);

            // Progresso do mês comercial (usa a janela de Análises como referência de dias) +
            // status geral: média de real÷ideal das 6 etapas, "No Ritmo" se >= 100%. Mostra o
            // intervalo de datas por extenso (dd/mm a dd/mm) — mesma precisão do "Ritmo do Mês",
            // porque o mês comercial atravessa o fim do mês do calendário (ex.: Julho vai até
            // 07/08) e só o nome do mês sozinho esconde isso.
            const mesLbl = document.getElementById('funnelMesLabel');
            if (mesLbl) mesLbl.textContent = `${janelaAnalises.mesNome}/${janelaAnalises.ano} · ${formatDate(janelaAnalises.inicioReal)} a ${formatDate(janelaAnalises.fimEstimado)} · dia ${janelaAnalises.diaHoje}/${janelaAnalises.diasNoMes}`;
            const pctMes = Math.round((janelaAnalises.diaHoje / janelaAnalises.diasNoMes) * 100);
            const mesBar = document.getElementById('funnelMesBar'); if (mesBar) mesBar.style.width = `${pctMes}%`;
            const mesPct = document.getElementById('funnelMesPct'); if (mesPct) mesPct.textContent = `${pctMes}%`;

            // Aviso de fontes em meses comerciais diferentes: Prospecção detecta seu próprio "mês
            // corrente" (getLatestProspeccaoCommercialMonth) independente do resto do funil
            // (Análises/Aprovações/Vendas/Agenda, todos amarrados a getLatestCommercialMonth). Isso é
            // esperado — leads de um mês novo costumam chegar antes de qualquer análise/venda dele —
            // mas sem aviso parecia bug ("atualizei os leads de Agosto e o painel continua em
            // Julho"). Só mostra quando NÃO há mês manual selecionado nos pills (aí sim tudo fica
            // travado de propósito num único mês) e quando as duas janelas realmente divergem.
            const avisoEl = document.getElementById('funnelMesDivergenciaAviso');
            const avisoTextoEl = document.getElementById('funnelMesDivergenciaTexto');
            if (avisoEl && avisoTextoEl) {
                // Prospecção sem upload no mês atual (12/10/2026): agora ela segue o mesmo mês do
                // resto do painel, então se o arquivo do mês ainda não foi subido os números de
                // Prospecção ficam 0 — o aviso explica por quê, em vez de parecer queda real.
                const mesesProsp = Array.isArray(prospeccaoDataset) ? prospeccaoDataset.map(r => r['_MesComercialNorm']) : [];
                const temProspNoMes = mesesProsp.some(m => normalizeMes(m) === normalizeMes(String(janelaProspeccao.mesNome)) && getMesAno(m) === janelaProspeccao.ano);
                const ultimoProsp = getLatestProspeccaoCommercialMonth();
                const divergiu = !getReferenceMesComercial() && !isMockDataActive && mesesProsp.length > 0 && !temProspNoMes;
                if (divergiu) {
                    const ultimoTxt = ultimoProsp ? `${normalizeMes(ultimoProsp.nome)}/${ultimoProsp.ano}` : '—';
                    avisoTextoEl.textContent = `Prospecção de ${janelaProspeccao.mesNome}/${janelaProspeccao.ano} ainda não foi carregada (último mês carregado: ${ultimoTxt}). Por isso Prospecção e as conversões que dependem dela aparecem zeradas — suba o arquivo do mês em "Prospecção", no menu lateral.`;
                    avisoEl.classList.remove('hidden'); avisoEl.classList.add('flex');
                } else {
                    avisoEl.classList.add('hidden'); avisoEl.classList.remove('flex');
                }
            }

            // Aviso de corretor sem produção no mês corrente: o funil sempre mostra o mês comercial
            // ATUAL (consistente pra comparar a equipe inteira) — mas se um corretor específico está
            // filtrado e ele simplesmente ainda não produziu nada esse mês (comum logo que o mês
            // vira), o funil inteiro zerado parecia bug em vez de "ele só tem histórico em meses
            // anteriores". Só aparece sem mês manual selecionado (mesma condição do aviso acima) e
            // com as 6 etapas zeradas ao mesmo tempo.
            const avisoCorretorEl = document.getElementById('funnelCorretorSemProducaoAviso');
            const avisoCorretorTextoEl = document.getElementById('funnelCorretorSemProducaoTexto');
            if (avisoCorretorEl && avisoCorretorTextoEl) {
                const semProducao = selCorretorFiltroFunil && !getReferenceMesComercial()
                    && prospeccao === 0 && agendamentos === 0 && compareceu === 0
                    && analyses === 0 && approvals === 0 && sales === 0;
                if (semProducao) {
                    avisoCorretorTextoEl.textContent = `${selCorretorFiltroFunil} ainda não tem nenhuma produção lançada em ${janelaAnalises.mesNome}/${janelaAnalises.ano} (mês comercial atual). Selecione outro mês no filtro "Mês Comercial" acima pra ver o histórico dele.`;
                    avisoCorretorEl.classList.remove('hidden'); avisoCorretorEl.classList.add('flex');
                } else {
                    avisoCorretorEl.classList.add('hidden'); avisoCorretorEl.classList.remove('flex');
                }
            }

            // Usa os MESMOS valores arredondados que aparecem nos cards (não a fração bruta) — pra
            // quem conferir "Real ÷ Ideal hoje" na calculadora bater exatamente com o % mostrado.
            // Etapas sem meta configurada (ideal=0) ficam fora da média, pra não puxar "No Ritmo"
            // artificialmente pra baixo enquanto o diretor ainda não cadastrou a meta daquela etapa.
            const idealProspeccaoArred = Math.round(idealProspeccao);
            const idealAgendamentosArred = Math.round(idealAgendamentos);
            const idealCompareceuArred = Math.round(idealCompareceu);
            const idealAnalisesArred = Math.round(idealAnalises);
            const idealAprovacoesArred = Math.round(idealAprovacoes);
            const idealVendasArred = Math.round(idealVendas);

            // Status "No Ritmo/Atrasado" calculado por funil, cada um com suas próprias 4 etapas
            // (Prospecção e Vendas entram nos 2 cálculos).
            const setStatusBadge = (suf, pares) => {
                const ritmos = pares.filter(([ideal]) => ideal > 0).map(([ideal, real]) => real / ideal);
                const ritmoMedio = (ritmos.length ? ritmos.reduce((a, b) => a + b, 0) / ritmos.length : 1) * 100;
                const badge = document.getElementById(`funnelStatusBadge${suf}`);
                const text = document.getElementById(`funnelStatusText${suf}`);
                if (badge && text) {
                    const noRitmo = ritmoMedio >= 100;
                    badge.className = `text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${noRitmo ? 'bg-brand-500/15 text-brand-400' : 'bg-rose-500/15 text-rose-400'}`;
                    badge.querySelector('span').className = `h-1.5 w-1.5 rounded-full ${noRitmo ? 'bg-brand-500' : 'bg-rose-500'}`;
                    text.textContent = `${noRitmo ? 'No Ritmo' : 'Atrasado'} · ${ritmoMedio.toFixed(0)}% da meta`;
                }
            };
            setStatusBadge('Doc', [
                [idealProspeccaoArred, prospeccao], [idealAnalisesArred, analyses],
                [idealAprovacoesArred, approvals], [idealVendasArred, sales]
            ]);
            setStatusBadge('Ag', [
                [idealProspeccaoArred, prospeccao], [idealAgendamentosArred, agendamentos],
                [idealCompareceuArred, compareceu], [idealVendasArred, sales]
            ]);

            const convMinus1 = prospeccao > 0 ? ((agendamentos / prospeccao) * 100).toFixed(1) : 0;
            const conv0 = agendamentos > 0 ? ((compareceu / agendamentos) * 100).toFixed(1) : 0;
            const conv1 = analyses > 0 ? ((approvals / analyses) * 100).toFixed(1) : 0;
            const conv2 = approvals > 0 ? ((sales / approvals) * 100).toFixed(1) : 0;
            const taxaFinal = analyses > 0 ? ((sales / analyses) * 100).toFixed(1) : 0;
            const prospToAnalise = prospeccao > 0 ? ((analyses / prospeccao) * 100) : 0;
            const prospToVenda = prospeccao > 0 ? ((sales / prospeccao) * 100) : 0;
            const compareceuToVenda = compareceu > 0 ? ((sales / compareceu) * 100) : 0;
            document.getElementById('funnelTaxaFinal').textContent = `${taxaFinal}%`;

            // Meta de conversão entre 2 etapas = meta da etapa seguinte ÷ meta da etapa atual — não
            // exige cadastro novo, só deriva das metas de volume que já existem. Usado pra comparar
            // a conversão REAL contra o que as metas já cadastradas implicam.
            const metaConv = (metaAtual, metaSeguinte) => metaAtual > 0 ? (metaSeguinte / metaAtual) * 100 : 0;

            // Monta o funil visual (SVG com bandas afuniladas) + o painel de Meta/Ideal Hoje ao
            // lado — cada etapa aparece 1x em cada estrutura, alimentada pelos mesmos números.
            const etapasDoc = [
                { metrica: 'prospeccao', label: 'Prospecção', icon: 'fa-bullhorn', color: 'pink', realizado: prospeccao, meta: Math.round(metaProspeccao), ideal: Math.round(idealProspeccao), convReal: prospToAnalise, convMeta: metaConv(metaProspeccao, metaAnalises) },
                { metrica: 'analises', label: 'Análises', icon: 'fa-people-group', color: 'blue', realizado: analyses, meta: Math.round(metaAnalises), ideal: Math.round(idealAnalises), convReal: parseFloat(conv1), convMeta: metaConv(metaAnalises, metaAprovacoes) },
                { metrica: 'aprovacoes', label: 'Aprovações', icon: 'fa-circle-check', color: 'amber', realizado: approvals, meta: Math.round(metaAprovacoes), ideal: Math.round(idealAprovacoes), convReal: parseFloat(conv2), convMeta: metaConv(metaAprovacoes, metaVendas) },
                { metrica: 'vendas', label: 'Vendas', icon: 'fa-house-circle-check', color: 'emerald', realizado: sales, meta: Math.round(metaVendas), ideal: Math.round(idealVendas), convReal: null, convMeta: null }
            ];
            const etapasAg = [
                { metrica: 'prospeccao', label: 'Prospecção', icon: 'fa-bullhorn', color: 'pink', realizado: prospeccao, meta: Math.round(metaProspeccao), ideal: Math.round(idealProspeccao), convReal: parseFloat(convMinus1), convMeta: metaConv(metaProspeccao, metaAgendamentos) },
                { metrica: 'agendamentos', label: 'Agendamento', icon: 'fa-calendar-check', color: 'violet', realizado: agendamentos, meta: Math.round(metaAgendamentos), ideal: Math.round(idealAgendamentos), convReal: parseFloat(conv0), convMeta: metaConv(metaAgendamentos, metaCompareceu) },
                { metrica: 'compareceu', label: 'Visita', icon: 'fa-door-open', color: 'cyan', realizado: compareceu, meta: Math.round(metaCompareceu), ideal: Math.round(idealCompareceu), convReal: compareceuToVenda, convMeta: metaConv(metaCompareceu, metaVendas) },
                { metrica: 'vendas', label: 'Vendas', icon: 'fa-house-circle-check', color: 'emerald', realizado: sales, meta: Math.round(metaVendas), ideal: Math.round(idealVendas), convReal: null, convMeta: null }
            ];
            buildFunilSVG('funnelSvgDoc', etapasDoc);
            buildFunilSVG('funnelSvgAg', etapasAg);
            buildConvPanel('funnelConvPanelDoc', etapasDoc);
            buildConvPanel('funnelConvPanelAg', etapasAg);
            buildMetaPanel('funnelMetaPanelDoc', etapasDoc);
            buildMetaPanel('funnelMetaPanelAg', etapasAg);

            // Conversões gerais fim-a-fim do Funil 1 (Documentação): Lead→Venda e Análise→Venda —
            // pedido explícito do usuário, destacadas separado das conversões adjacentes do funil.
            document.getElementById('funnelConvGeralLeadVendaDoc').textContent = `${prospToVenda.toFixed(1)}%`;
            document.getElementById('funnelConvGeralAnaliseVendaDoc').textContent = `${taxaFinal}%`;

            // Ticket / VGV / Comissão estimada (base geral, igual aos KPIs e ao funil)
            const ticket = sales > 0 ? (kpiValues.vgv / sales) : 0;
            document.getElementById('funnelTicket').textContent = formatBRL(ticket);
            document.getElementById('funnelVgv').textContent = formatBRL(kpiValues.vgv);
            document.getElementById('funnelComissao').textContent = formatBRL(kpiValues.comissaoCorretor || 0);

            // VGV Pendente = Geral menos Finalizado (venda ganha mas ainda não finalizada).
            const vgvFinalResumo = kpiValues.vgvFinal || 0;
            const vgvPendenteResumo = Math.max(0, kpiValues.vgv - vgvFinalResumo);
            const pctPendente = kpiValues.vgv > 0 ? (vgvPendenteResumo / kpiValues.vgv) * 100 : 0;
            const pctFinalizado = kpiValues.vgv > 0 ? (vgvFinalResumo / kpiValues.vgv) * 100 : 0;
            document.getElementById('funnelVgvPendente').textContent = formatBRL(vgvPendenteResumo);
            document.getElementById('funnelVgvPendentePct').textContent = `${pctPendente.toFixed(1)}% do total`;
            document.getElementById('funnelVgvFinalizado').textContent = formatBRL(vgvFinalResumo);
            document.getElementById('funnelVgvFinalizadoPct').textContent = `${pctFinalizado.toFixed(1)}% do total`;

            // Totais do MÊS ANTERIOR (mesmo critério de vendas ganhas/finalizadas), só pra comparar
            // os 5 cards financeiros — não afeta nenhum outro número do painel.
            let mesAnteriorIdx = janelaVendas.monthIdx - 1, anoAnterior = janelaVendas.ano;
            if (mesAnteriorIdx < 0) { mesAnteriorIdx = 11; anoAnterior -= 1; }
            const refDateAnterior = new Date(anoAnterior, mesAnteriorIdx, 15);
            let vgvGeralAnterior = 0, vgvFinalAnterior = 0, comissaoAnterior = 0, vendasAnterior = 0;
            filteredDataset.forEach(row => {
                if (isVendaGanhaReal(row) && metricMatchesRef(row, 'Mês Ganho', 'Data Ganho', refDateAnterior)) {
                    const v = getVGV(row);
                    vgvGeralAnterior += v; vendasAnterior++;
                    comissaoAnterior += getMoneyField(row, 'Comissão Corretor');
                    if (isVendaFinalizada(row)) vgvFinalAnterior += v;
                }
            });
            const vgvPendenteAnterior = Math.max(0, vgvGeralAnterior - vgvFinalAnterior);
            const ticketAnterior = vendasAnterior > 0 ? vgvGeralAnterior / vendasAnterior : 0;

            document.getElementById('funnelTicketTrend').innerHTML = trendHtml(ticket, ticketAnterior);
            document.getElementById('funnelVgvPendenteTrend').innerHTML = trendHtml(vgvPendenteResumo, vgvPendenteAnterior);
            document.getElementById('funnelVgvFinalizadoTrend').innerHTML = trendHtml(vgvFinalResumo, vgvFinalAnterior);
            document.getElementById('funnelVgvTrend').innerHTML = trendHtml(kpiValues.vgv, vgvGeralAnterior);
            document.getElementById('funnelComissaoTrend').innerHTML = trendHtml(kpiValues.comissaoCorretor || 0, comissaoAnterior);
        }

        // ===================== IPC — ÍNDICE DE PRODUTIVIDADE DO CORRETOR =====================
        // KPI oficial de produtividade comercial da AUDAZ.
        //   IPC = vendas do corretor numa JANELA DE 3 MESES ÷ 3  (média mensal de vendas)
        //   3 vendas → 1,00 · 2 → 0,67 · 1 → 0,33 · 0 → 0,00 · 5 → 1,67
        //
        // ⚠️ REGRA DEFINITIVA (definida pelo usuário em 13/09/2026 — substitui INTEGRALMENTE as duas
        // versões anteriores: a que ancorava no mês em foco igual pra todos, e a que ancorava na
        // última venda de cada corretor. Esta última NÃO DEVE EXISTIR mais.)
        //
        //   A JANELA É MÓVEL E VINCULADA AO MÊS ATUAL DA OPERAÇÃO, com o mês atual entrando
        //   INDIVIDUALMENTE só pra quem tem resultado nele:
        //     • corretor SEM venda no mês atual → os 3 meses ANTERIORES (ex.: em setembro, Jun+Jul+Ago)
        //     • corretor COM venda no mês atual → mês atual + 2 anteriores (ex.: Jul+Ago+Set)
        //   IPC = média dos 3 meses = soma das vendas da janela ÷ 3.
        //
        //   Ex. (estamos em setembro): corretor que vendeu pela última vez em julho → Jun+Jul+Ago
        //   (NÃO Mai+Jun+Jul). Se vender em setembro → Jul+Ago+Set. Em outubro a janela de todo
        //   mundo anda: quem não vendeu em outubro → Jul+Ago+Set; quem vendeu → Ago+Set+Out.
        //   Assim o IPC DECAI naturalmente pra quem para de vender — nunca fica congelado.
        //
        //   "Mês atual" = mês comercial em foco no BI (currentRefDate: o corrente, ou o selecionado
        //   nos pills), pra continuar coerente com o resto do painel.
        //
        // MODO MANUAL (opcional, pedido anterior do usuário): escolhendo meses nos chips, a janela
        // passa a ser ESSES meses pra TODOS (comparação num período fixo) e o divisor acompanha a
        // quantidade escolhida. Chips vazios = regra automática por última venda (padrão).
        //
        // Filtros respeitados: corretor, equipe, construtora, empreendimento (filteredDataset) e a
        // situação da venda (isVendaModo — toggle Gerais x Finalizadas). Só conta GANHO/VENDA, por
        // Mês Ganho. O filtro de SEMANA é ignorado de propósito (7 dias não têm significado aqui).
        // Não altera nenhuma regra existente de Vendas/VGV/Comissão: só LÊ as mesmas funções.
        const IPC_MESES_JANELA = 3;

        
