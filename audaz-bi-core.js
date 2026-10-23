        // CONFIGURAÇÕES GERAIS E BASE DE DADOS DE DEMONSTRAÇÃO (120 Lançamentos Realistas para Junho 2026)
        let dataset = [];
        let filteredDataset = [];
        let currentPeriod = 'mes'; // hoje, semana, mes, ano
        let vendasMode = 'gerais'; // 'gerais' (todas as ganhas) | 'finalizadas' (toggle de comparação)
        let isMockDataActive = false; // só vira true se alguém clicar em "usar dados de demonstração"
        // Sem valor padrão embutido aqui de propósito: a URL real vem só do Firestore/localStorage,
        // pra não deixar o link da planilha (com nome de cliente/comissão) visível em texto puro
        // pra qualquer um que veja o código-fonte da página.
        let googleSheetsUrl = '';
        // Segunda planilha (independente da principal): Agenda de Visitas — ID/Corretor/Cliente/
        // Data/Hora/Empreendimento/Local/Status(agendada|compareceu|nao_compareceu)/Obs. Alimenta
        // as etapas "Agendamentos"/"Compareceu" do Funil e os cards de ranking correspondentes.
        let agendaGsheetsUrl = '';
        let agendaDataset = [];
        let filteredAgendaDataset = [];
        // Terceira planilha (independente das outras duas): Prospecção/Leads — ID/Cliente/
        // Corretor/Equipe/Situação/Cadastro/Mês Comercial. Sem link ao vivo — o diretor sobe um
        // CSV manualmente (upload local, sem servidor) e ele fica salvo no Firestore igual as
        // outras configs. Alimenta a nova 1ª etapa "Prospecção" do Funil.
        // Guardado POR MÊS COMERCIAL (não um blob único): { 'Julho/2026': { csvText, rows,
        // uploadedAt } }. Cada upload agrupa as linhas pelo próprio "Mês Comercial" da planilha e
        // substitui só o(s) mês(es) presente(s) nesse arquivo — os outros meses já carregados
        // continuam intactos. Permite anexar mês a mês e remover um mês específico sem apagar os
        // demais.
        let prospeccaoPorMes = {};
        let prospeccaoDataset = []; // derivado: todas as linhas de todos os meses juntas
        let filteredProspeccaoDataset = [];
        let activeView = 'organograma'; // página inicial: Organograma da equipe

        // Motores de Sincronização Automática em Tempo Real
        let autoRefreshInterval = 15; // padrão: 15 segundos (full-time)
        let countdownTimerId = null;
        let secondsLeft = 15;
        let lastSyncTime = null;

        // Constantes do ID do App
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'audaz-bi-v1';

        // ====== GESTÃO DE CORRETORES (roster persistido no navegador) ======
        let addedCorretores = [];    // pré-cadastrados (aparecem com 0 produção)
        let inactiveCorretores = []; // ocultos das listas/rankings/filtros individuais
        let corretorFotos = {};      // nome -> dataURL (JPEG 128x128, já comprimida no upload)
        let corretorFotoImages = {}; // nome -> HTMLImageElement pré-carregada (pro export em Canvas 2D)

        // Organograma: hierarquia configurável, com regional fixo no topo.
        let organograma = [];
        let organogramaSelectedTeamId = null;
        function loadOrganograma() {
            try { const saved = JSON.parse(localStorage.getItem(`${appId}-organograma`) || '[]'); organograma = Array.isArray(saved) ? saved : []; }
            catch (e) { organograma = []; }
        }
        function orgEsc(v) { return String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
        function orgId() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `org-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
        function saveOrganograma() {
            saveLocalSetting(`${appId}-organograma`, JSON.stringify(organograma));
            pushCloudSettings();
            const label = document.getElementById('organogramaSyncLabel');
            if (label) label.textContent = isDiretor ? 'Alteração salva e sincronizando…' : 'Salvo neste navegador';
            renderOrganograma();
        }
        function orgParentOptions(selected, omitId) {
            const options = [{id:'regional', name:'Sadraque Ribeiro · Regional'}, ...organograma.filter(n => n.id !== omitId && n.role === 'Gerente').map(n => ({id:n.id, name:`${n.name} · Gerente`}))];
            return options.map(o => `<option value="${orgEsc(o.id)}" ${o.id === selected ? 'selected' : ''}>${orgEsc(o.name)}</option>`).join('');
        }
        function updateOrgParentOptions(role, id = null) {
            const parent = document.getElementById(id ? `orgParent-${id}` : 'orgNewParent');
            if (!parent) return;
            const managerRole = (id ? document.getElementById(`orgRole-${id}`) : document.getElementById('orgNewRole'))?.value || role;
            const inactiveKeys = new Set(inactiveCorretores.map(orgPersonKey));
            const activeKeys = new Set(getActiveCorretores().filter(n => !inactiveKeys.has(orgPersonKey(n))).map(orgPersonKey));
            const managers = organograma.filter(n => n.role === 'Gerente' && n.id !== id && activeKeys.has(orgPersonKey(n.name)));
            if (managerRole === 'Gerente') {
                const current = id ? organograma.find(n => n.id === id)?.equipe : '';
                parent.innerHTML = `<option value="">Escolha uma equipe do BI</option>${getOrgTeamNames().map(team => `<option value="${orgEsc(team)}" ${team === current ? 'selected' : ''}>${orgEsc(team)}</option>`).join('')}`;
                parent.value = current || '';
            } else {
                const selected = managers.some(n => n.id === parent.value) ? parent.value : (managers[0]?.id || '');
                parent.innerHTML = managers.length ? managers.map(n => `<option value="${orgEsc(n.id)}" ${n.id === selected ? 'selected' : ''}>${orgEsc(n.name)} · Gerente</option>`).join('') : '<option value="">Cadastre um gerente primeiro</option>';
                parent.value = selected;
            }
            if (!id) {
                const add = document.querySelector('#organogramaSection button[onclick="addOrgMember()"]');
                if (add) add.disabled = !isDiretor || (managerRole === 'Corretor' && managers.length === 0);
            }
        }
        function getOrgTeamNames() {
            return [...new Set((dataset || []).map(row => String(row.Equipe || '').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
        }
        function getOrgBrokerTeams(name) {
            const teams = new Set();
            (dataset || []).forEach(row => { if (row.Corretor && orgPersonKey(row.Corretor) === orgPersonKey(name) && row.Equipe) teams.add(String(row.Equipe).trim()); });
            return teams;
        }
        function orgDescendants(id) {
            const found = new Set([id]); let changed = true;
            while (changed) { changed = false; organograma.forEach(n => { if (found.has(n.parentId) && !found.has(n.id)) { found.add(n.id); changed = true; } }); }
            return found;
        }
        function orgPersonKey(name) {
            const base = parseNomeCargo(String(name || '')).nome.trim().replace(/\s+/g, ' ');
            return stripDiacritics(base).toLocaleLowerCase();
        }
        function findCorretorFoto(nome) {
            if (corretorFotos[nome]) return corretorFotos[nome];
            const key = Object.keys(corretorFotos).find(k => orgPersonKey(k) === orgPersonKey(nome));
            return key ? corretorFotos[key] : null;
        }
        function toggleOrgMemberPicker() {
            if (!isDiretor) return;
            const menu = document.getElementById('orgMemberPickerMenu');
            if (menu) menu.classList.toggle('hidden');
        }
        function selectOrgMember(name) {
            if (!isDiretor || !name) return;
            const input = document.getElementById('orgNewName');
            if (!getActiveCorretores().some(n => orgPersonKey(n) === orgPersonKey(name))) return;
            input.value = name;
            const label = document.getElementById('orgMemberPickerLabel');
            if (label) label.innerHTML = `<span class="shrink-0">${corretorAvatarInner(name, 'h-7 w-7', 'text-[9px]')}</span><span class="truncate text-slate-200 font-semibold">${orgEsc(name)}</span>`;
            const menu = document.getElementById('orgMemberPickerMenu'); if (menu) menu.classList.add('hidden');
        }
        function renderOrgMemberPicker(availableNames) {
            const input = document.getElementById('orgNewName');
            const label = document.getElementById('orgMemberPickerLabel');
            const options = document.getElementById('orgMemberPickerOptions');
            const button = document.getElementById('orgMemberPickerButton');
            const menu = document.getElementById('orgMemberPickerMenu');
            if (!input || !label || !options || !button) return;
            if (!availableNames.some(n => n === input.value)) input.value = '';
            if (input.value) {
                label.innerHTML = `<span class="shrink-0">${corretorAvatarInner(input.value, 'h-7 w-7', 'text-[9px]')}</span><span class="truncate text-slate-200 font-semibold">${orgEsc(input.value)}</span>`;
            } else {
                label.innerHTML = `<span class="text-slate-500">${availableNames.length ? 'Selecione uma pessoa ativa' : 'Todos os cadastros ativos já estão na estrutura'}</span>`;
            }
            options.innerHTML = availableNames.map(n => `<button type="button" data-org-person="${orgEsc(n)}" onclick="selectOrgMember(this.dataset.orgPerson)" class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-slate-800 transition"><span class="shrink-0">${corretorAvatarInner(n, 'h-9 w-9', 'text-[10px]')}</span><span class="truncate text-xs font-semibold text-slate-200">${orgEsc(n)}</span></button>`).join('');
            button.disabled = !isDiretor || availableNames.length === 0;
            if (menu) menu.classList.add('hidden');
        }
        function renderOrganograma() {
            const tree = document.getElementById('organogramaTree'); if (!tree) return;
            initOrgDashboardClicks();
            const hint = document.getElementById('organogramaEditHint'); if (hint) hint.classList.toggle('hidden', isDiretor);
            const regionalCard = document.querySelector('#organogramaSection [data-org-scope="regional"]');
            if (regionalCard) regionalCard.classList.toggle('org-selected', orgDashboardScope?.kind === 'regional');
            const regionalAvatar = document.getElementById('orgRegionalAvatar');
            if (regionalAvatar) regionalAvatar.innerHTML = corretorAvatarInner('Sadraque Ribeiro', 'h-14 w-14', 'text-base');
            const inactiveKeys = new Set(inactiveCorretores.map(orgPersonKey));
            const known = getActiveCorretores().filter(n => !inactiveKeys.has(orgPersonKey(n)));
            const byKey = new Map();
            [...known.filter(n => addedCorretores.includes(n)), ...known].forEach(n => { if (!byKey.has(orgPersonKey(n))) byKey.set(orgPersonKey(n), n); });
            const names = [...byKey.values()].sort((a,b) => a.localeCompare(b,'pt-BR'));
            const activeKeys = new Set(names.map(orgPersonKey));
            const activeMembers = organograma.filter(n => activeKeys.has(orgPersonKey(n.name)));
            const managers = activeMembers.filter(n => n.role === 'Gerente' && n.parentId === 'regional');
            const brokerManager = broker => {
                if (broker.manualParent && managers.some(m => m.id === broker.parentId)) return broker.parentId;
                const brokerTeams = getOrgBrokerTeams(broker.name);
                const linkedTeamManager = managers.find(m => m.equipe && brokerTeams.has(m.equipe));
                return linkedTeamManager?.id || (managers.some(m => m.id === broker.parentId) ? broker.parentId : null);
            };
            const teams = managers.map(n => ({manager:n, brokers:activeMembers.filter(b => b.role === 'Corretor' && brokerManager(b) === n.id)}));
            const totalBrokers = teams.reduce((sum,team) => sum + team.brokers.length,0);
            const stats = {orgStatManagers:managers.length, orgStatBrokers:totalBrokers, orgStatTotal:managers.length + totalBrokers};
            Object.entries(stats).forEach(([id,value]) => { const el=document.getElementById(id); if (el) el.textContent=value; });
            const assigned = new Set(organograma.map(n => orgPersonKey(n.name)));
            const availableNames = names.filter(n => !assigned.has(orgPersonKey(n)));
            const countLabel = document.getElementById('organogramaCountLabel');
            if (countLabel) countLabel.textContent = `${managers.length} gerentes · ${totalBrokers} corretores`;
            renderOrgMemberPicker(availableNames);
            updateOrgParentOptions(document.getElementById('orgNewRole')?.value || 'Gerente');
            const addButton = document.querySelector('#organogramaSection button[onclick="addOrgMember()"]');
            if (addButton) addButton.disabled = !isDiretor || availableNames.length === 0 || (document.getElementById('orgNewRole')?.value === 'Corretor' && !organograma.some(n => n.role === 'Gerente'));
            const colors = ['#3b82f6','#f59e0b','#14b8a6','#8b5cf6','#ec4899','#06b6d4'];
            const renderEdit = node => {
                if (!isDiretor) return '';
                const excluded = orgDescendants(node.id);
                const parents = node.role === 'Gerente' ? [{id:'regional',name:'Regional · Sadraque Ribeiro'}] : managers.filter(m => !excluded.has(m.id)).map(m => ({id:m.id,name:`${m.name} · Gerente`}));
                const parentControl = node.role === 'Gerente'
                    ? `<label class="block text-[9px] text-slate-500 uppercase tracking-wider mt-2">Equipe do BI<select id="orgTeam-${orgEsc(node.id)}" class="w-full mt-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-2 text-[11px] text-slate-200 outline-none"><option value="">Sem equipe vinculada</option>${getOrgTeamNames().map(team => `<option value="${orgEsc(team)}" ${node.equipe === team ? 'selected' : ''}>${orgEsc(team)}</option>`).join('')}</select></label>`
                    : `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2"><select id="orgRole-${orgEsc(node.id)}" onchange="updateOrgParentOptions(this.value,'${orgEsc(node.id)}')" class="bg-slate-900 border border-slate-800 rounded-lg px-2 py-2 text-[11px] text-slate-200 outline-none">${['Gerente','Corretor'].map(r => `<option ${node.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select><select id="orgParent-${orgEsc(node.id)}" class="bg-slate-900 border border-slate-800 rounded-lg px-2 py-2 text-[11px] text-slate-200 outline-none">${parents.length ? parents.map(o => `<option value="${orgEsc(o.id)}" ${node.parentId === o.id ? 'selected' : ''}>${orgEsc(o.name)}</option>`).join('') : '<option value="">Cadastre um gerente primeiro</option>'}</select></div>`;
                return `<details class="org-node-edit"><summary>${node.role === 'Gerente' ? 'Vincular equipe' : 'Editar vínculo'}</summary>${parentControl}<div class="flex justify-end gap-2 mt-2"><button onclick="saveOrgMember('${orgEsc(node.id)}')" class="diretor-locked px-3 py-1.5 bg-brand-600/20 text-brand-300 border border-brand-500/30 rounded-lg text-[10px] font-bold">Salvar</button><button onclick="removeOrgMember('${orgEsc(node.id)}')" class="diretor-locked px-3 py-1.5 text-rose-300 border border-rose-500/20 rounded-lg text-[10px] font-bold">Remover</button></div></details>`;
            };
            const renderBroker = (broker, color) => `<div class="org-broker-entry"><article data-org-scope="broker" data-org-name="${orgEsc(broker.name)}" role="button" tabindex="0" title="Ver indicadores de ${orgEsc(broker.name)}" class="org-broker-row${orgDashboardScope?.kind === 'broker' && orgPersonKey(orgDashboardScope.name) === orgPersonKey(broker.name) ? ' org-selected' : ''}" style="--team-color:${color}"><div class="org-broker-avatar shrink-0">${corretorAvatarInner(broker.name,'h-12 w-12','text-[10px]')}</div><div class="min-w-0"><div class="org-broker-name">${orgEsc(broker.name)}</div><div class="org-broker-role">Corretor</div><div class="org-broker-active">Ativo</div></div></article>${renderEdit(broker)}</div>`;
            tree.innerHTML = managers.length ? `<div class="org-chart-level-label">Gerentes</div><div class="org-chart-manager-grid">${teams.map(({manager,brokers},i) => {
                const color = colors[i % colors.length];
                return `<section class="org-team-group" style="--team-color:${color}"><article class="org-manager-card"><div data-org-scope="team" data-org-name="${orgEsc(manager.name)}" data-org-manager-id="${orgEsc(manager.id)}" role="button" tabindex="0" title="Ver os indicadores da equipe de ${orgEsc(manager.name)}" class="org-manager-person${orgDashboardScope?.kind === 'team' && orgDashboardScope.managerId === manager.id ? ' org-selected' : ''}"><div class="org-manager-avatar shrink-0">${corretorAvatarInner(manager.name,'h-14 w-14','text-[10px]')}</div><div class="min-w-0"><div class="org-manager-name">${orgEsc(manager.name)}</div><div class="org-manager-role">Gerente de Equipe</div><div class="org-manager-count"><i class="fa-solid fa-user"></i> ${brokers.length} ${brokers.length === 1 ? 'corretor' : 'corretores'}</div></div></div>${renderEdit(manager)}</article></section>`;
            }).join('')}</div><div class="org-chart-level-label mt-5">Equipes do BI</div><div class="org-chart-team-grid">${teams.map(({manager,brokers},i) => {
                const color = colors[i % colors.length];
                return `<section class="org-team-group" style="--team-color:${color}"><article class="org-team-card${organogramaSelectedTeamId === manager.id ? ' org-team-selected' : ''}"><button type="button" class="org-team-select" aria-pressed="${organogramaSelectedTeamId === manager.id}" title="Destacar esta equipe" onclick="selectOrgTeamCard('${orgEsc(manager.id)}')"><span><i class="fa-solid fa-users mr-1.5"></i> ${orgEsc(manager.equipe || 'Sem equipe')}</span><span class="org-team-count">${brokers.length}</span></button><div class="text-[10px] text-slate-500 mb-2">${orgEsc(manager.name)}</div><div class="org-broker-list">${brokers.length ? brokers.map(b=>renderBroker(b,color)).join('') : `<div class="text-[11px] text-slate-500 text-center py-5">${manager.equipe ? 'Nenhum corretor ativo nesta equipe do BI' : 'Vincule uma equipe ao gerente acima'}</div>`}</div></article></section>`;
            }).join('')}</div>` : '<p class="org-chart-empty text-xs text-slate-500 text-center py-8 px-4 rounded-xl border border-dashed border-slate-700">Adicione gerentes abaixo de você. Eles ficarão alinhados na mesma faixa.</p>';
            const sync = document.getElementById('organogramaSyncLabel'); if (sync && (!sync.textContent || /^\d+ pessoas? na estrutura$/.test(sync.textContent))) sync.textContent = `${managers.length + totalBrokers} pessoas ativas exibidas`;
        }
        function selectOrgTeamCard(id) {
            organogramaSelectedTeamId = organogramaSelectedTeamId === id ? null : id;
            renderOrganograma();
        }
        function addOrgMember() {
            if (!isDiretor) return;
            const nameEl = document.getElementById('orgNewName'), roleEl = document.getElementById('orgNewRole'), parentEl = document.getElementById('orgNewParent');
            const name = nameEl.value || ''; if (!name) { nameEl.focus(); return; }
            if (roleEl.value === 'Corretor' && (!parentEl.value || !organograma.some(n => n.id === parentEl.value && n.role === 'Gerente'))) { renderOrganograma(); return; }
            if (!getActiveCorretores().some(n => orgPersonKey(n) === orgPersonKey(name)) || organograma.some(n => orgPersonKey(n.name) === orgPersonKey(name))) { nameEl.value = ''; renderOrganograma(); return; }
            organograma.push({id:orgId(), name, role:roleEl.value, parentId:roleEl.value === 'Gerente' ? 'regional' : parentEl.value, ...(roleEl.value === 'Gerente' ? {equipe:parentEl.value || ''} : {manualParent:true})});
            nameEl.value = ''; saveOrganograma();
        }
        function saveOrgMember(id) {
            if (!isDiretor) return;
            const node = organograma.find(n => n.id === id); if (!node) return;
            if (node.role === 'Gerente') {
                node.equipe = document.getElementById(`orgTeam-${id}`)?.value || '';
                node.parentId = 'regional'; saveOrganograma(); return;
            }
            node.role = document.getElementById(`orgRole-${id}`).value;
            const selectedParent = document.getElementById(`orgParent-${id}`).value;
            if (node.role === 'Corretor' && !organograma.some(n => n.id === selectedParent && n.role === 'Gerente')) { renderOrganograma(); return; }
            node.parentId = node.role === 'Gerente' ? 'regional' : selectedParent;
            if (node.role === 'Corretor') node.manualParent = true; else { delete node.manualParent; node.equipe = ''; }
            saveOrganograma();
        }
        function removeOrgMember(id) {
            if (!isDiretor) return;
            const node = organograma.find(n => n.id === id); if (!node) return;
            organograma.forEach(n => { if (n.parentId === id) n.parentId = node.parentId || 'regional'; });
            organograma = organograma.filter(n => n.id !== id); saveOrganograma();
        }

        function loadCorretorRoster() {
            try {
                addedCorretores = JSON.parse(localStorage.getItem(`${appId}-corretores-added`) || '[]');
                inactiveCorretores = JSON.parse(localStorage.getItem(`${appId}-corretores-inactive`) || '[]');
                corretorFotos = JSON.parse(localStorage.getItem(`${appId}-corretor-fotos`) || '{}');
            } catch (e) { addedCorretores = []; inactiveCorretores = []; corretorFotos = {}; }
            preloadAllCorretorFotos();
        }
        function saveCorretorRoster() {
            saveLocalSetting(`${appId}-corretores-added`, JSON.stringify(addedCorretores));
            saveLocalSetting(`${appId}-corretores-inactive`, JSON.stringify(inactiveCorretores));
            pushCloudSettings();
        }
        function saveCorretorFotos() {
            saveLocalSetting(`${appId}-corretor-fotos`, JSON.stringify(corretorFotos));
            pushCloudSettings();
        }

        // Pré-carrega as fotos em objetos Image (fora do DOM) pra estarem prontas (.complete)
        // na hora de desenhar o Canvas 2D de exportação dos Rankings Rápidos — o export é
        // síncrono e não dá pra esperar um <img onload> no meio do desenho.
        function preloadCorretorFoto(nome) {
            const src = corretorFotos[nome];
            if (!src) { delete corretorFotoImages[nome]; return; }
            const img = new Image();
            img.onload = () => { corretorFotoImages[nome] = img; };
            img.src = src;
        }
        function preloadAllCorretorFotos() {
            corretorFotoImages = {};
            Object.keys(corretorFotos).forEach(preloadCorretorFoto);
        }

        // Avatar de um corretor: foto (se tiver) ou iniciais num círculo gradiente — usado tanto
        // no modal "Gerenciar Corretores" quanto nos cards de Rankings Rápidos, pra ficar consistente.
        function corretorAvatarInner(nome, sizeClasses, textSizeClass, extraClass) {
            const foto = findCorretorFoto(nome);
            if (foto) {
                return `<img src="${foto}" alt="${orgEsc(nome)}" class="${sizeClasses} rounded-full object-cover ${extraClass || ''}">`;
            }
            const ini = (nome || '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
            return `<div class="${sizeClasses} rounded-full bg-gradient-to-br from-indigo-500 to-brand-500 flex items-center justify-center ${textSizeClass} font-extrabold text-white ${extraClass || ''}">${ini}</div>`;
        }

        // Lê o arquivo escolhido, recorta em quadrado (crop central) e comprime pra ~128x128 JPEG
        // antes de guardar — mantém o doc do Firestore pequeno mesmo com vários corretores.
        function processCorretorFotoFile(nome, file) {
            if (!file || !file.type || !file.type.startsWith('image/')) { showToast('Selecione um arquivo de imagem.', true); return; }
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const SIZE = 128;
                    const canvas = document.createElement('canvas');
                    canvas.width = SIZE; canvas.height = SIZE;
                    const ctx = canvas.getContext('2d');
                    const side = Math.min(img.width, img.height);
                    const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
                    ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
                    corretorFotos[nome] = canvas.toDataURL('image/jpeg', 0.72);
                    saveCorretorFotos();
                    preloadCorretorFoto(nome);
                    renderCorretorRoster();
                    if (typeof drawQuickRankings === 'function') drawQuickRankings();
                    showToast(`Foto de "${nome}" atualizada.`);
                };
                img.onerror = () => showToast('Não foi possível ler essa imagem.', true);
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        let corretorFotoUploadTarget = null;
        function triggerCorretorFotoUpload(nome) {
            corretorFotoUploadTarget = nome;
            const inp = document.getElementById('corretorFotoInput');
            if (inp) { inp.value = ''; inp.click(); }
        }
        function onCorretorFotoInputChange(evt) {
            const file = evt.target.files && evt.target.files[0];
            if (file && corretorFotoUploadTarget) processCorretorFotoFile(corretorFotoUploadTarget, file);
        }
        function removeCorretorFoto(nome) {
            delete corretorFotos[nome];
            delete corretorFotoImages[nome];
            saveCorretorFotos();
            renderCorretorRoster();
            if (typeof drawQuickRankings === 'function') drawQuickRankings();
        }
        // Todos os nomes conhecidos = os da planilha + os pré-cadastrados
        function getAllKnownCorretores() {
            const s = new Set();
            dataset.forEach(r => { if (r.Corretor) s.add(r.Corretor); });
            addedCorretores.forEach(n => s.add(n));
            return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        }
        // Ativos = conhecidos menos os desativados (estes aparecem nas listas individuais)
        function getActiveCorretores() {
            return getAllKnownCorretores().filter(n => !inactiveCorretores.includes(n));
        }
        function isCorretorActive(name) {
            return !inactiveCorretores.includes(name);
        }

        // ====== METAS MENSAIS (VGV, Vendas, Análises, Aprovações, Prospecção, Agendamentos, Compareceu) ======
        let metasMensais = { vgv: 5000000, vendas: 20, analises: 100, aprovacoes: 60, prospeccao: 0, agendamentos: 0, compareceu: 0 };
        let metasEditMode = false;

        function loadMetasMensais() {
            try {
                const saved = JSON.parse(localStorage.getItem(`${appId}-metas-mensais`) || 'null');
                if (saved) metasMensais = Object.assign(metasMensais, saved);
            } catch (e) {}
        }

        // ====== MESES COMERCIAIS (períodos configurados manualmente pelo diretor) ======
        // Cada item: { nome: 'Junho', ano: 2026, inicio: 'AAAA-MM-DD', fim: 'AAAA-MM-DD' }.
        // Quando existe config pro mês em exibição, a DATA manda (ignora o texto "Mês Cadastro"
        // da planilha) — usado hoje só no gráfico "Ritmo do Mês".
        let mesesComerciais = [];
        function loadMesesComerciais() {
            try {
                const saved = JSON.parse(localStorage.getItem(`${appId}-meses-comerciais`) || 'null');
                if (Array.isArray(saved)) mesesComerciais = saved;
            } catch (e) {}
        }
        function getMesComercialConfig(nome, ano) {
            return mesesComerciais.find(m => m.nome === nome && m.ano === ano) || null;
        }

        // ====== PLANTÕES: 3 escalas independentes (Diamond / Roleta / Represados), cada uma com uma
        // fila ORDENADA de corretores por dia (formato { 'YYYY-MM-DD': ['Nome 1º', 'Nome 2º', ...] }).
        // Só organização/consulta por enquanto — não conta nada, não liga com Prospecção/Funil.
        let escalasPlantao = { diamond: {}, roleta: {}, represados: {} };
        function loadEscalasPlantao() {
            try {
                const saved = JSON.parse(localStorage.getItem(`${appId}-escalas-plantao`) || 'null');
                if (saved && typeof saved === 'object') {
                    escalasPlantao = Object.assign({ diamond: {}, roleta: {}, represados: {} }, saved);
                }
            } catch (e) {}
        }
        function saveEscalasPlantao() {
            saveLocalSetting(`${appId}-escalas-plantao`, JSON.stringify(escalasPlantao));
            pushCloudSettings();
        }

        // Se existe um mês comercial CONFIGURADO (painel "Meses Comerciais") cujo período cobre a
        // data de HOJE, ele é o mês corrente — mesmo que a planilha ainda não tenha nenhuma linha
        // lançada nele (comum: o mês comercial virou, mas ninguém lançou análise/aprovação/venda
        // ainda). Sem isso, o painel inteiro (Metas do Mês, Funil, Ritmo do Mês, Rankings Rápidos)
        // ficava "preso" mostrando os números do mês anterior até a 1ª linha do mês novo chegar na
        // planilha — confuso pro usuário, que já sabe que o mês comercial mudou. Retorna null quando
        // NENHUM mês configurado cobre hoje (aí quem chamar cai no fallback antigo: último mês com
        // dados lançados, via getLatestCommercialMonth/getLatestProspeccaoCommercialMonth).
        function getMesComercialAtualPorData() {
            const hoje = isMockDataActive ? new Date(2026, 5, 9) : new Date();
            const hojeZerado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
            const match = mesesComerciais.find(m => {
                const ini = new Date(m.inicio + 'T00:00:00');
                const fim = new Date(m.fim + 'T00:00:00');
                return hojeZerado >= ini && hojeZerado <= fim;
            });
            return match ? { nome: match.nome, ano: match.ano, idx: MESES_IDX[normalizeMes(match.nome)] } : null;
        }
        function setMetaMensal(campo, val) {
            const n = parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
            metasMensais[campo] = n;
            saveLocalSetting(`${appId}-metas-mensais`, JSON.stringify(metasMensais));
            pushCloudSettings();
            drawMetasMensais();
        }
        function toggleMetasEdit() {
            metasEditMode = !metasEditMode;
            const btn = document.getElementById('btnEditMetas');
            if (btn) btn.innerHTML = metasEditMode
                ? '<i class="fa-solid fa-check"></i> Concluir'
                : '<i class="fa-solid fa-pen"></i> Editar metas';
            drawMetasMensais();
        }

        function fmtCompact(v, isMoney) {
            if (isMoney) return formatBRL(v); // VGV sempre exato (R$ 1.234.567,89)
            return String(Math.round(v));
        }

        function drawMetasMensais() {
            const grid = document.getElementById('metasGrid');
            if (!grid) return;

            // Período de referência: o mês comercial mais recente entre os selecionados nos pills,
            // senão o MÊS COMERCIAL CORRENTE (dos dados). Se houver mais de um mês selecionado, os
            // totais dos cards somam todos eles (via metricMatchesRef); só o ritmo/projeção "dia X
            // de Y" usa o mês mais recente como referência.
            const refDate = isMockDataActive ? new Date(2026, 5, 9) : new Date();
            const selMeses = getSelectedMeses();
            let mesNome = getMesName(refDate.getMonth() + 1), ano = refDate.getFullYear(), monthIdx = refDate.getMonth();
            let mesEhAtual = selMeses.length === 0;
            const refMes = getReferenceMesComercial();
            if (refMes) {
                mesNome = refMes.nome; ano = refMes.ano; monthIdx = refMes.idx;
                mesEhAtual = (monthIdx === refDate.getMonth() && ano === refDate.getFullYear());
            } else if (!isMockDataActive) {
                const lc = getMesComercialAtualPorData() || getLatestCommercialMonth();
                if (lc) { mesNome = lc.nome; ano = lc.ano; monthIdx = lc.idx; }
            }
            const diasNoMes = new Date(ano, monthIdx + 1, 0).getDate();
            // Dias decorridos COM CONTINUIDADE: conta do 1º dia do mês comercial até hoje (pode passar de diasNoMes).
            let diaHoje;
            if (!mesEhAtual) {
                diaHoje = diasNoMes; // mês fechado/selecionado = completo
            } else {
                const inicio = new Date(ano, monthIdx, 1);
                diaHoje = Math.max(1, Math.floor((refDate - inicio) / 86400000) + 1);
            }
            const fracDecorrida = Math.max(0.01, Math.min(1, diaHoje / diasNoMes));

            const lblPer = document.getElementById('metasPeriodoLabel');
            if (lblPer) {
                const rotuloMes = selMeses.length > 1
                    ? `${selMeses.map(mesLabelAbbrev).join(' + ')} (comparativo — somados)`
                    : `${mesNome}/${ano}`;
                lblPer.textContent = !mesEhAtual
                    ? `${rotuloMes} (mês fechado)`
                    : (diaHoje <= diasNoMes
                        ? `${rotuloMes} — dia ${diaHoje} de ${diasNoMes}`
                        : `${rotuloMes} — em curso (dia ${diaHoje})`);
            }

            const modeFin = vendasMode === 'finalizadas';
            // Mesma ordem do Funil de Vendas — Prospecção → Agendamentos → Compareceu →
            // Análises → Aprovações → Vendas — com o VGV como primeiro card (visão geral de
            // faturamento antes do funil de contagens).
            const cards = [
                { campo: 'vgv',           label: modeFin ? 'VGV (finalizado)' : 'VGV (geral)', icon: 'fa-coins',            cor: 'indigo', money: true,  atual: modeFin ? kpiValues.vgvFinal : kpiValues.vgvGeral, info: modeFin ? `Geral: ${formatBRL(kpiValues.vgvGeral)}` : `Finalizado: ${formatBRL(kpiValues.vgvFinal)}` },
                { campo: 'prospeccao',    label: 'Prospecção',    icon: 'fa-bullhorn',          cor: 'pink',   money: false, atual: kpiValues.prospeccao,   info: '' },
                { campo: 'agendamentos',  label: 'Agendamentos',  icon: 'fa-calendar-check',    cor: 'violet', money: false, atual: kpiValues.agendamentos, info: '' },
                { campo: 'compareceu',    label: 'Compareceu',    icon: 'fa-door-open',         cor: 'cyan',   money: false, atual: kpiValues.compareceu,   info: '' },
                { campo: 'analises',      label: 'Análises',      icon: 'fa-file-invoice-dollar', cor: 'sky',  money: false, atual: kpiValues.analyses,     info: '' },
                { campo: 'aprovacoes',    label: 'Aprovações',    icon: 'fa-circle-check',      cor: 'amber',  money: false, atual: kpiValues.approvals,    info: '' },
                { campo: 'vendas',        label: modeFin ? 'Vendas (final.)' : 'Vendas (gerais)', icon: 'fa-house-circle-check', cor: 'brand', money: false, atual: modeFin ? kpiValues.salesFinal : kpiValues.salesGeral, info: modeFin ? `Geral: ${kpiValues.salesGeral}` : `Finalizadas: ${kpiValues.salesFinal}` }
            ];

            grid.innerHTML = cards.map(c => {
                const meta = metasMensais[c.campo] || 0;
                const atual = c.atual || 0;
                const pct = meta > 0 ? (atual / meta) * 100 : (atual > 0 ? 100 : 0);
                const pctClamp = Math.min(100, pct);
                const pacePct = fracDecorrida * 100; // onde "deveria" estar hoje
                const projecao = mesEhAtual ? (atual / fracDecorrida) : atual;
                const projPct = meta > 0 ? (projecao / meta) * 100 : 0;

                // Status: batida / no ritmo / atrasado
                let statusTxt, statusCls, barGrad;
                if (pct >= 100) {
                    statusTxt = `<i class="fa-solid fa-circle-check"></i> Meta batida${atual - meta > 0 ? ' (+' + fmtCompact(atual - meta, c.money) + ')' : ''}`;
                    statusCls = 'text-emerald-400'; barGrad = 'from-emerald-600 to-emerald-400';
                } else if (pct >= pacePct - 5) {
                    statusTxt = `<i class="fa-solid fa-arrow-trend-up"></i> No ritmo (${pct.toFixed(0)}%)`;
                    statusCls = 'text-brand-400'; barGrad = 'from-brand-600 to-brand-500';
                } else {
                    statusTxt = `<i class="fa-solid fa-triangle-exclamation"></i> Atrasado (${pct.toFixed(0)}%)`;
                    statusCls = 'text-amber-400'; barGrad = 'from-amber-600 to-amber-400';
                }

                const faltam = Math.max(0, meta - atual);
                const projTxt = mesEhAtual && meta > 0
                    ? `<p class="text-[10px] text-slate-500 mt-1.5"><i class="fa-solid fa-chart-line"></i> No ritmo atual: <span class="font-bold text-slate-400">${fmtCompact(projecao, c.money)}</span> (${projPct.toFixed(0)}% da meta)</p>`
                    : '';

                const metaCampo = metasEditMode
                    ? `<div class="flex items-center gap-1 mt-2">
                            <span class="text-[10px] text-slate-500 font-bold uppercase">Meta:</span>
                            <input type="text" value="${c.money ? meta : meta}" onchange="setMetaMensal('${c.campo}', this.value)" class="flex-1 w-full bg-slate-950 border border-slate-700 text-xs rounded px-2 py-1 text-slate-200 text-right focus:border-brand-500 outline-none">
                       </div>`
                    : `<p class="text-[11px] text-slate-500 mt-0.5">Meta: <span class="font-bold text-slate-400">${fmtCompact(meta, c.money)}</span> ${faltam > 0 ? '· faltam <span class="font-bold text-slate-300">' + fmtCompact(faltam, c.money) + '</span>' : ''}</p>`;

                return `
                    <div class="bg-slate-950/40 rounded-xl border border-slate-800/70 p-4 relative overflow-hidden">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><i class="fa-solid ${c.icon} text-${c.cor}-400"></i> ${c.label}</span>
                            <span class="text-sm font-extrabold text-${c.cor}-400">${pct.toFixed(0)}%</span>
                        </div>
                        <div class="flex items-baseline gap-1.5 mb-2 flex-wrap">
                            <span class="${c.money ? 'text-lg' : 'text-2xl'} font-extrabold text-slate-100">${c.money ? formatBRL(atual) : atual}</span>
                            <span class="text-[11px] text-slate-500 font-bold">/ ${c.money ? formatBRL(meta) : meta}</span>
                        </div>
                        <div class="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden relative">
                            <div class="h-full bg-gradient-to-r ${barGrad} transition-all duration-500" style="width: ${pctClamp}%"></div>
                            ${mesEhAtual ? `<div class="absolute top-0 bottom-0 w-px bg-slate-400/60" style="left: ${pacePct}%" title="onde deveria estar hoje"></div>` : ''}
                        </div>
                        <p class="text-[11px] font-bold mt-1.5 ${statusCls}">${statusTxt}</p>
                        ${c.info ? `<p class="text-[10px] text-amber-300/80 mt-1"><i class="fa-regular fa-clock"></i> ${c.info}</p>` : ''}
                        ${projTxt}
                        ${metaCampo}
                    </div>`;
            }).join('');
        }

        // Iniciais para avatar
        function inisCorretor(nome) {
            return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
        }

        // ====== METAS DOS RANKINGS RÁPIDOS (por card, sobre o total da equipe) ======
        let rankingsMetas = {}; // { anHoje, anSem, anMes, apHoje, apSem, apMes, vdSem, vdMes }
        let rankingsEditMode = false;
        function loadRankingsMetas() {
            try {
                const saved = JSON.parse(localStorage.getItem(`${appId}-rankings-metas`) || 'null');
                if (saved) rankingsMetas = saved;
            } catch (e) {}
        }
        // META ÚNICA (12/10/2026): as metas MENSAIS dos Rankings Rápidos (prMes/agMes/coMes/anMes/
        // apMes/vdMes) não são mais um cadastro paralelo — leem e gravam as mesmas metasMensais do
        // "Metas do Mês"/Funil, pra a mesma pergunta ter uma resposta só. Metas de Dia e Semana
        // continuam cadastradas aqui (decisão anterior do usuário: "pegue a meta cadastrada por semana").
        const RANKING_MES_PARA_MENSAL = { prMes: 'prospeccao', agMes: 'agendamentos', coMes: 'compareceu', anMes: 'analises', apMes: 'aprovacoes', vdMes: 'vendas' };
        function getRankingMeta(key) {
            const campoMensal = RANKING_MES_PARA_MENSAL[key];
            if (campoMensal) return Math.round(metasMensais[campoMensal] || 0);
            return rankingsMetas[key] || 0;
        }
        function setRankingMeta(key, val) {
            if (RANKING_MES_PARA_MENSAL[key]) { setMetaMensal(RANKING_MES_PARA_MENSAL[key], String(parseInt(String(val).replace(/\D/g, '')) || 0)); drawQuickRankings(); return; }
            rankingsMetas[key] = parseInt(String(val).replace(/\D/g, '')) || 0;
            saveLocalSetting(`${appId}-rankings-metas`, JSON.stringify(rankingsMetas));
            pushCloudSettings();
            drawQuickRankings();
        }
        function toggleRankingsEdit() {
            rankingsEditMode = !rankingsEditMode;
            const btn = document.getElementById('btnEditRankingsMetas');
            if (btn) btn.innerHTML = rankingsEditMode
                ? '<i class="fa-solid fa-check"></i> Concluir'
                : '<i class="fa-solid fa-pen"></i> Editar metas';
            drawQuickRankings();
        }

        // ====== METAS POR CORRETOR (dia/semana/mês, um valor por parâmetro dos Rankings Rápidos) ======
        // { [nomeCorretor]: { anHoje, anSem, anMes, apHoje, apSem, apMes, vdSem, vdMes } }
        let metasPorCorretor = {};
        function loadMetasPorCorretor() {
            try {
                const saved = JSON.parse(localStorage.getItem(`${appId}-metas-corretor`) || 'null');
                if (saved) metasPorCorretor = saved;
            } catch (e) {}
        }
        function setMetaCorretor(nome, campo, val) {
            const n = parseInt(String(val).replace(/\D/g, '')) || 0;
            if (!metasPorCorretor[nome]) metasPorCorretor[nome] = {};
            metasPorCorretor[nome][campo] = n;
            saveLocalSetting(`${appId}-metas-corretor`, JSON.stringify(metasPorCorretor));
            pushCloudSettings();
            drawQuickRankings();
        }

        let metasPorEquipe = {};
        function loadMetasPorEquipe() {
            try {
                const saved = JSON.parse(localStorage.getItem(`${appId}-metas-equipe`) || 'null');
                if (saved && typeof saved === 'object') metasPorEquipe = saved;
            } catch (e) {}
        }
        function getMetaEquipe(nome, campo) {
            const wanted = rankingTeamKey(nome);
            const storedName = Object.keys(metasPorEquipe).find(n => rankingTeamKey(n) === wanted);
            return Number((metasPorEquipe[storedName || nome] || {})[campo]) || 0;
        }
        function setMetaEquipe(nome, campo, val) {
            const n = parseInt(String(val).replace(/\D/g, '')) || 0;
            if (!metasPorEquipe[nome]) metasPorEquipe[nome] = {};
            metasPorEquipe[nome][campo] = n;
            saveLocalSetting(`${appId}-metas-equipe`, JSON.stringify(metasPorEquipe));
            pushCloudSettings();
            drawQuickRankings();
        }
        function renderMetasEquipeTable() {
            const wrap = document.getElementById('metasCorretorTableWrap');
            if (!wrap) return;
            const equipes = getConfiguredRankingTeams();
            if (!equipes.length) {
                wrap.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">Nenhuma equipe configurada no organograma.</p>`;
                return;
            }
            const headCols = METAS_CORRETOR_CAMPOS.map(c => `<th class="p-2 text-center font-bold text-slate-500 whitespace-nowrap">${c.label}</th>`).join('');
            const bodyRows = equipes.map(equipe => {
                const cols = METAS_CORRETOR_CAMPOS.map(c => {
                    const val = getMetaEquipe(equipe, c.key) || '';
                    const equipeEsc = equipe.replace(/'/g, "\\'");
                    return `<td class="p-1.5 text-center"><input type="number" min="0" value="${val}" placeholder="0" onchange="setMetaEquipe('${equipeEsc}', '${c.key}', this.value)" class="w-14 bg-slate-950 border border-slate-800 text-[11px] rounded px-1.5 py-1 text-slate-200 text-center focus:border-brand-500 outline-none"></td>`;
                }).join('');
                return `<tr class="border-b border-slate-800/40"><td class="p-2 font-semibold text-slate-200 whitespace-nowrap sticky left-0 bg-slate-900">${orgEsc(equipe)}</td>${cols}</tr>`;
            }).join('');
            wrap.innerHTML = `<table class="w-full text-xs border-collapse"><thead><tr class="border-b border-slate-700"><th class="p-2 text-left font-bold text-slate-500 sticky left-0 bg-slate-900">Equipe</th>${headCols}</tr></thead><tbody>${bodyRows}</tbody></table>`;
        }

        const METAS_CORRETOR_CAMPOS = [
            { key: 'prHoje', label: 'Prosp. Dia' },
            { key: 'prSem',  label: 'Prosp. Sem' },
            { key: 'prMes',  label: 'Prosp. Mês' },
            { key: 'agHoje', label: 'Agend. Dia' },
            { key: 'agSem',  label: 'Agend. Sem' },
            { key: 'agMes',  label: 'Agend. Mês' },
            { key: 'coHoje', label: 'Compar. Dia' },
            { key: 'coSem',  label: 'Compar. Sem' },
            { key: 'coMes',  label: 'Compar. Mês' },
            { key: 'anHoje', label: 'An. Dia' },
            { key: 'anSem',  label: 'An. Sem' },
            { key: 'anMes',  label: 'An. Mês' },
            { key: 'apHoje', label: 'Apr. Dia' },
            { key: 'apSem',  label: 'Apr. Sem' },
            { key: 'apMes',  label: 'Apr. Mês' },
            { key: 'vdSem',  label: 'Vd. Sem' },
            { key: 'vdMes',  label: 'Vd. Mês' }
        ];

        function toggleMetasCorretorModal() {
            const m = document.getElementById('metasCorretorModal');
            const isEquipe = quickRankingMode === 'equipe';
            const title = document.getElementById('metasPessoaTitle');
            const description = document.getElementById('metasPessoaDescription');
            if (title) title.textContent = isEquipe ? 'Metas por Equipe' : 'Metas por Corretor';
            if (description) description.textContent = isEquipe
                ? 'Defina a meta diária, semanal e mensal de cada equipe para as etapas dos Rankings Rápidos.'
                : 'Meta individual de cada corretor para os parâmetros dos Rankings Rápidos (dia/semana/mês).';
            m.classList.toggle('hidden');
            if (!m.classList.contains('hidden')) (isEquipe ? renderMetasEquipeTable : renderMetasCorretorTable)();
        }

        function renderMetasCorretorTable() {
            const wrap = document.getElementById('metasCorretorTableWrap');
            if (!wrap) return;
            const ativos = getActiveCorretores();

            if (ativos.length === 0) {
                wrap.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">Nenhum corretor ativo. Cadastre em "Gerenciar Corretores" primeiro.</p>`;
                return;
            }

            const headCols = METAS_CORRETOR_CAMPOS.map(c => `<th class="p-2 text-center font-bold text-slate-500 whitespace-nowrap">${c.label}</th>`).join('');
            const bodyRows = ativos.map(nome => {
                const cols = METAS_CORRETOR_CAMPOS.map(c => {
                    const val = (metasPorCorretor[nome] && metasPorCorretor[nome][c.key]) || '';
                    const nomeEsc = nome.replace(/'/g, "\\'");
                    return `<td class="p-1.5 text-center"><input type="number" min="0" value="${val}" placeholder="0" onchange="setMetaCorretor('${nomeEsc}', '${c.key}', this.value)" class="w-14 bg-slate-950 border border-slate-800 text-[11px] rounded px-1.5 py-1 text-slate-200 text-center focus:border-brand-500 outline-none"></td>`;
                }).join('');
                return `<tr class="border-b border-slate-800/40"><td class="p-2 font-semibold text-slate-200 whitespace-nowrap sticky left-0 bg-slate-900">${nome}</td>${cols}</tr>`;
            }).join('');

            wrap.innerHTML = `
                <table class="w-full text-xs border-collapse">
                    <thead><tr class="border-b border-slate-700">
                        <th class="p-2 text-left font-bold text-slate-500 sticky left-0 bg-slate-900">Corretor</th>
                        ${headCols}
                    </tr></thead>
                    <tbody>${bodyRows}</tbody>
                </table>`;
        }

        
