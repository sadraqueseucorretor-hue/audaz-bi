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
        let activeView = 'visao'; // página inicial: Visão Geral da regional (26/11/2026)

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
        // ===== SISTEMAS E DADOS DO CORRETOR (04/11/2026) =====
        // Sistemas em que a pessoa está cadastrada (node.sistemas = ['c2s','bora','dvon']) ficam no
        // organograma (config/settings, público como o resto do organograma). node.sistema segue
        // 'com'/'sem' (derivado) pra compatibilidade com o que já existia.
        // E-mail, telefone e data de nascimento são dados PESSOAIS: ficam só no documento protegido
        // privado/corretores-dados (lido/gravado só com login de diretor) + cópia local deste navegador.
        const SISTEMAS_CORRETOR = [
            { k: 'c2s', nome: 'C2S', cor: 'text-sky-300 bg-sky-500/10 border-sky-500/25' },
            { k: 'bora', nome: 'Bora Vender', cor: 'text-violet-300 bg-violet-500/10 border-violet-500/25' },
            { k: 'dvon', nome: 'DV On', cor: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25' }
        ];
        function orgSistemasBadges(node) {
            const lista = Array.isArray(node.sistemas) ? node.sistemas : [];
            const chip = (txt, cor) => `<span class="inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${cor}">${txt}</span>`;
            if (lista.length) return SISTEMAS_CORRETOR.filter(x => lista.includes(x.k)).map(x => chip(x.nome, x.cor)).join('');
            if (node.sistema === 'sem') return chip('Sem sistema', 'text-amber-300 bg-amber-500/10 border-transparent');
            if (node.sistema === 'com') return chip('Com sistema (definir quais)', 'text-emerald-300 bg-emerald-500/10 border-transparent');
            return chip('Sistema não definido', 'text-slate-400 bg-slate-500/10 border-transparent');
        }

        let dadosCorretores = {};   // orgPersonKey(nome) -> { email, tel, nasc: 'AAAA-MM-DD' }
        let dadosCorretoresUnsub = null;
        let dadosCorretoresDaNuvem = false;
                const LS_DADOS_CORRETORES = () => `${typeof appId !== 'undefined' ? appId : 'audaz-bi-v1'}-corretores-dados`;
        const docDadosCorretores = () => fbDb.collection('privado').doc('corretores-dados');
        try { dadosCorretores = JSON.parse(localStorage.getItem(LS_DADOS_CORRETORES()) || '{}') || {}; } catch (e) { dadosCorretores = {}; }
        function salvarDadosCorretoresLocal() { try { localStorage.setItem(LS_DADOS_CORRETORES(), JSON.stringify(dadosCorretores)); } catch (e) {} }
        function iniciarDadosCorretoresNuvem(user) {
            if (dadosCorretoresUnsub) { dadosCorretoresUnsub(); dadosCorretoresUnsub = null; }
            if (typeof fbDb === 'undefined' || !fbDb) return;
            if (!user) {
                if (dadosCorretoresDaNuvem) { dadosCorretores = {}; try { localStorage.removeItem(LS_DADOS_CORRETORES()); } catch (e) {} dadosCorretoresDaNuvem = false; }
                renderOrganograma(); return;
            }
            dadosCorretoresUnsub = docDadosCorretores().onSnapshot(snap => {
                const nuvem = (snap.exists && snap.data() && snap.data().pessoas) || {};
                const soLocal = Object.keys(dadosCorretores).filter(k => !nuvem[k]);
                dadosCorretores = Object.assign({}, dadosCorretores, nuvem);
                dadosCorretoresDaNuvem = true;
                salvarDadosCorretoresLocal();
                if (soLocal.length) docDadosCorretores().set({ pessoas: Object.fromEntries(soLocal.map(k => [k, dadosCorretores[k]])), _updatedAt: Date.now() }, { merge: true }).catch(() => {});
                renderOrganograma();
            }, err => console.warn('Dados dos corretores (nuvem):', err));
        }
        // Botão "ficha" no canto do cartão (só diretor): abre e-mail, telefone, nascimento e observações.
        function orgFichaBotao(node) {
            if (!isDiretor) return '';
            const d = dadosCorretores[orgPersonKey(node.name)] || {};
            const tem = !!(d.email || d.tel || d.nasc || d.obs);
            const mes = d.nasc ? +String(d.nasc).split('-')[1] === new Date().getMonth() + 1 : false;
            return `<button type="button" class="org-ficha-btn${tem ? ' tem' : ''}" onclick="event.stopPropagation(); abrirFichaCorretor('${orgEsc(node.id)}')" title="${tem ? 'Ver e-mail, telefone e informações' : 'Sem dados cadastrados — clique para ver'}"><i class="fa-solid fa-address-card"></i>${mes ? '<span class="org-ficha-niver" title="Aniversário este mês">🎂</span>' : ''}</button>`;
        }
        function fecharFichaCorretor() { const m = document.getElementById('orgFichaModal'); if (m) m.remove(); }
        function abrirFichaCorretor(id) {
            const node = organograma.find(n => n.id === id); if (!node || !isDiretor) return;
            fecharFichaCorretor();
            const d = dadosCorretores[orgPersonKey(node.name)] || {};
            const gerente = node.role === 'Gerente' ? node : organograma.find(n => n.id === node.parentId);
            const equipe = gerente && gerente.equipe ? gerente.equipe : '';
            const dig = String(d.tel || '').replace(/\D/g, ''), wa = dig ? `https://wa.me/${dig.length <= 11 ? '55' + dig : dig}` : '';
            let nascHtml = '<span class="text-slate-600">Não informado</span>';
            if (d.nasc) {
                const [a, m, dd] = String(d.nasc).split('-').map(Number);
                const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                let idade = hoje.getFullYear() - a; if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < dd)) idade--;
                let prox = new Date(hoje.getFullYear(), m - 1, dd); if (prox < hoje) prox = new Date(hoje.getFullYear() + 1, m - 1, dd);
                const faltam = Math.round((prox - hoje) / 86400000);
                nascHtml = `${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a} <span class="text-slate-500">· ${idade} anos</span><div class="text-[11px] mt-0.5 ${faltam <= 30 ? 'text-pink-300 font-bold' : 'text-slate-500'}">🎂 ${faltam === 0 ? 'Aniversário HOJE!' : faltam === 1 ? 'Aniversário amanhã' : `Aniversário em ${faltam} dias`}</div>`;
            }
            const linha = (ico, rot, val, acoes = '') => `<div class="flex items-start gap-3 py-2.5 border-b border-slate-800/80"><i class="fa-solid ${ico} text-slate-500 w-4 mt-0.5 text-center"></i><div class="min-w-0 flex-1"><div class="text-[9px] uppercase tracking-wider font-bold text-slate-500">${rot}</div><div class="text-[13px] text-slate-100 break-words select-text">${val}</div></div>${acoes ? `<div class="flex gap-1 shrink-0">${acoes}</div>` : ''}</div>`;
            const btn = (ico, title, attr) => `<button type="button" title="${title}" ${attr} class="h-8 w-8 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-500 inline-flex items-center justify-center text-xs"><i class="${ico}"></i></button>`;
            const copiar = v => btn('fa-regular fa-copy', 'Copiar', `onclick="copiarFichaCampo(this, '${orgEsc(String(v).replace(/'/g, "\\'"))}')"`);
            const textoTudo = [node.name, `${node.role || 'Corretor'}${equipe ? ' · ' + equipe : ''}`, d.tel && `Telefone: ${d.tel}`, d.email && `E-mail: ${d.email}`, d.nasc && `Nascimento: ${d.nasc.split('-').reverse().join('/')}`].filter(Boolean).join('\n');
            const html = `<div id="orgFichaModal" class="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4" onclick="if (event.target === this) fecharFichaCorretor()">
                <div class="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 relative max-h-[calc(100vh-2rem)] overflow-y-auto">
                    <button onclick="fecharFichaCorretor()" class="absolute top-3 right-3 text-slate-400 hover:text-white h-8 w-8"><i class="fa-solid fa-xmark"></i></button>
                    <div class="flex items-center gap-3 pr-8">
                        <div class="shrink-0">${corretorAvatarInner(node.name, 'h-14 w-14', 'text-xs')}</div>
                        <div class="min-w-0"><div class="text-base font-black text-white leading-tight">${orgEsc(node.name)}</div>
                            <div class="text-[12px] text-slate-400">${orgEsc(node.role === 'Gerente' ? 'Gerente de Equipe' : (node.role || 'Corretor'))}${equipe ? ` · <b class="text-slate-300">${orgEsc(equipe)}</b>` : ''}${gerente && gerente !== node ? ` · ${orgEsc(gerente.name)}` : ''}</div></div>
                    </div>
                    <div class="mt-3"><div class="text-[9px] uppercase tracking-wider font-bold text-slate-500 mb-1">Sistemas</div><div class="flex flex-wrap gap-1">${orgSistemasBadges(node)}</div></div>
                    <div class="mt-2">
                        ${linha('fa-phone', 'Telefone', d.tel ? orgEsc(d.tel) : '<span class="text-slate-600">Não informado</span>', d.tel ? btn('fa-brands fa-whatsapp', 'Abrir WhatsApp', `onclick="window.open('${wa}','_blank','noopener')"`) + btn('fa-solid fa-phone', 'Ligar', `onclick="location.href='tel:+${dig.length <= 11 ? '55' + dig : dig}'"`) + copiar(d.tel) : '')}
                        ${linha('fa-envelope', 'E-mail', d.email ? orgEsc(d.email) : '<span class="text-slate-600">Não informado</span>', d.email ? btn('fa-solid fa-paper-plane', 'Enviar e-mail', `onclick="location.href='mailto:${orgEsc(d.email)}'"`) + copiar(d.email) : '')}
                        ${linha('fa-cake-candles', 'Nascimento', nascHtml)}
                        ${linha('fa-note-sticky', 'Informações adicionais', d.obs ? orgEsc(d.obs).replace(/\n/g, '<br>') : '<span class="text-slate-600">Nenhuma</span>')}
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button onclick="copiarFichaCampo(this, ${orgEsc(JSON.stringify(textoTudo))})" class="flex-1 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 text-[11px] font-bold hover:border-slate-500"><i class="fa-regular fa-copy mr-1"></i>Copiar ficha</button>
                        <button onclick="editarFichaCorretor('${orgEsc(node.id)}')" class="flex-1 py-2 rounded-lg border border-brand-500/40 bg-brand-600/20 text-brand-300 text-[11px] font-bold hover:bg-brand-600/30"><i class="fa-solid fa-pen mr-1"></i>Editar dados</button>
                    </div>
                    <div class="text-[10px] text-slate-600 mt-3 text-center"><i class="fa-solid fa-lock mr-1"></i>Dados protegidos — visíveis só com login de diretor</div>
                </div></div>`;
            document.body.insertAdjacentHTML('beforeend', html);
        }
        function copiarFichaCampo(el, txt) {
            const ok = () => { const o = el.innerHTML; el.innerHTML = '<i class="fa-solid fa-check"></i>' + (el.textContent.trim() ? ' Copiado' : ''); setTimeout(() => { el.innerHTML = o; }, 1200); };
            if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok).catch(() => {}); else ok();
        }
        function editarFichaCorretor(id) {
            fecharFichaCorretor();
            const el = document.getElementById(`orgEmail-${id}`); if (!el) return;
            const det = el.closest('details'); if (det) det.open = true;
            el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => el.focus(), 300);
        }
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.getElementById('orgFichaModal')) fecharFichaCorretor(); });

        function orgEsc(v) { return String(v || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
        function orgId() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `org-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
        function saveOrganograma() {
            saveLocalSetting(`${appId}-organograma`, JSON.stringify(organograma));
            pushCloudSettings();
            const label = document.getElementById('organogramaSyncLabel');
            if (label) label.textContent = isDiretor ? 'Alteração salva e sincronizando…' : 'Salvo neste navegador';
            renderOrganograma();
            orgAtualizarBI();
        }
        // Qualquer mudança na estrutura (gerente, equipe, transferência, ativo/inativo) reflete nos
        // rankings de equipe, filtros e indicadores do BI na hora.
        function orgAtualizarBI() {
            if (typeof aplicarNomesEquipesOrganograma === 'function' && typeof dataset !== 'undefined') aplicarNomesEquipesOrganograma(dataset);
            if (typeof refreshAfterRosterChange === 'function') refreshAfterRosterChange();
        }

        // ===== ORGANOGRAMA DINÂMICO (26/11/2026) =====
        // Sem limite de gerentes: cada gerente tem nome de equipe livre (node.equipe), cor própria
        // (node.cor), ordem de exibição (node.ordem). node.equipePlanilha guarda o nome antigo da
        // equipe na planilha quando ela é renomeada no BI, pra continuar casando as linhas.
        const ORG_CORES = ['#3b82f6','#f59e0b','#14b8a6','#8b5cf6','#ec4899','#06b6d4','#22c55e','#f97316','#a855f7','#eab308'];
        let orgMostrarInativos = false;
        let orgEditAberto = null;
        function orgOrdemGerente(n) { return Number.isFinite(n.ordem) ? n.ordem : 1000 + organograma.indexOf(n); }
        function orgGerentesOrdenados(lista) { return lista.slice().sort((a, b) => orgOrdemGerente(a) - orgOrdemGerente(b)); }
        function orgCorGerente(n, i) { return n.cor || ORG_CORES[i % ORG_CORES.length]; }
        function orgNomeNoCadastro(nome) { return getAllKnownCorretores().find(n => orgPersonKey(n) === orgPersonKey(nome)) || nome; }
        function orgPessoaInativa(nome) { const k = orgPersonKey(nome); return inactiveCorretores.some(n => orgPersonKey(n) === k); }
        function orgTemProducao(nome) {
            const k = orgPersonKey(nome);
            const tem = rows => (rows || []).some(r => r && r.Corretor && orgPersonKey(r.Corretor) === k);
            return tem(dataset) || tem(prospeccaoDataset) || tem(typeof agendaDataset !== 'undefined' ? agendaDataset : []);
        }
        // Gerente de um integrante: vínculo manual (transferência) > equipe da planilha > vínculo salvo.
        function orgGerenteEfetivo(broker, managers) {
            if (broker.manualParent && managers.some(m => m.id === broker.parentId)) return broker.parentId;
            const brokerTeams = getOrgBrokerTeams(broker.name);
            const linked = managers.find(m => (m.equipe && brokerTeams.has(m.equipe)) || (m.equipePlanilha && brokerTeams.has(m.equipePlanilha)));
            return linked?.id || (managers.some(m => m.id === broker.parentId) ? broker.parentId : null);
        }
        function orgGerentesAtivos() {
            return orgGerentesOrdenados(organograma.filter(n => n.role === 'Gerente' && n.parentId === 'regional' && !orgPessoaInativa(n.name) && getAllKnownCorretores().some(k => orgPersonKey(k) === orgPersonKey(n.name))));
        }
        function orgResumoPapeis(brokers) {
            const cont = {}; brokers.forEach(b => { const r = b.role || 'Corretor'; cont[r] = (cont[r] || 0) + 1; });
            const pl = { Corretor: ['corretor', 'corretores'], Captador: ['captador', 'captadores'], 'Estagiário': ['estagiário', 'estagiários'] };
            return Object.keys(pl).filter(r => cont[r]).map(r => ` · ${cont[r]} ${pl[r][cont[r] === 1 ? 0 : 1]}`).join('');
        }
        function moverOrgGerente(id, dir) {
            if (!isDiretor) return;
            const todos = orgGerentesOrdenados(organograma.filter(n => n.role === 'Gerente'));
            todos.forEach((n, i) => { n.ordem = i; });
            const visiveis = todos.filter(n => !orgPessoaInativa(n.name));
            const i = visiveis.findIndex(n => n.id === id), j = i + dir;
            if (i < 0 || j < 0 || j >= visiveis.length) return;
            [visiveis[i].ordem, visiveis[j].ordem] = [visiveis[j].ordem, visiveis[i].ordem];
            orgEditAberto = id;
            saveOrganograma();
        }
        // Renomear só quem ainda não tem produção: o nome de quem já produziu vem da planilha e é
        // por ele que o BI casa as linhas. Leva junto foto, dados da ficha, metas e status.
        function renomearPessoaOrg(node, novo) {
            const antigo = node.name;
            if (!novo) { showToast('O nome não pode ficar vazio.', true); return false; }
            if (orgTemProducao(antigo)) { showToast(`${antigo} já tem produção — o nome vem da planilha.`, true); return false; }
            const kNovo = orgPersonKey(novo), kAnt = orgPersonKey(antigo);
            if (kNovo !== kAnt && (organograma.some(n => n !== node && orgPersonKey(n.name) === kNovo) || getAllKnownCorretores().some(n => orgPersonKey(n) === kNovo))) { showToast(`Já existe um cadastro com o nome ${novo}.`, true); return false; }
            if (!confirm(`Renomear ${antigo} para ${novo}?`)) return false;
            const troca = lista => lista.map(n => orgPersonKey(n) === kAnt ? novo : n);
            const estava = addedCorretores.some(n => orgPersonKey(n) === kAnt);
            addedCorretores = estava ? troca(addedCorretores) : [...addedCorretores, novo];
            inactiveCorretores = troca(inactiveCorretores);
            const kFoto = Object.keys(corretorFotos).find(k => orgPersonKey(k) === kAnt);
            if (kFoto) { corretorFotos[novo] = corretorFotos[kFoto]; delete corretorFotos[kFoto]; saveCorretorFotos(); preloadAllCorretorFotos(); }
            if (typeof metasPorCorretor !== 'undefined') {
                const kMeta = Object.keys(metasPorCorretor).find(k => orgPersonKey(k) === kAnt);
                if (kMeta) { metasPorCorretor[novo] = metasPorCorretor[kMeta]; delete metasPorCorretor[kMeta]; saveLocalSetting(`${appId}-metas-corretor`, JSON.stringify(metasPorCorretor)); }
            }
            if (dadosCorretores[kAnt] && kNovo !== kAnt) {
                dadosCorretores[kNovo] = dadosCorretores[kAnt]; delete dadosCorretores[kAnt]; salvarDadosCorretoresLocal();
                if (typeof fbDb !== 'undefined' && fbDb) docDadosCorretores().set({ pessoas: { [kNovo]: dadosCorretores[kNovo], [kAnt]: firebase.firestore.FieldValue.delete() }, _updatedAt: Date.now() }, { merge: true }).catch(err => console.warn('Renomear dados do corretor:', err));
            }
            node.name = novo;
            saveCorretorRoster();
            return true;
        }
        function desativarOrgMember(id) {
            if (!isDiretor) return;
            const node = organograma.find(n => n.id === id); if (!node) return;
            const extra = node.role === 'Gerente' ? '\n\nA equipe dele sai do organograma até ser reativado (os integrantes continuam cadastrados — transfira-os se precisar).' : '';
            if (!confirm(`Desativar ${node.name}?\n\nSai dos indicadores, rankings e listas de produtividade. O cadastro e o histórico ficam guardados e dá pra reativar em "Ver inativos".${extra}`)) return;
            const nome = orgNomeNoCadastro(node.name);
            if (!orgPessoaInativa(nome)) inactiveCorretores.push(nome);
            saveCorretorRoster(); orgAtualizarBI(); renderOrganograma();
            showToast(`${node.name} desativado.`);
        }
        function reativarOrgMember(id) {
            if (!isDiretor) return;
            const node = organograma.find(n => n.id === id); if (!node) return;
            const k = orgPersonKey(node.name);
            inactiveCorretores = inactiveCorretores.filter(n => orgPersonKey(n) !== k);
            if (!getAllKnownCorretores().some(n => orgPersonKey(n) === k)) addedCorretores.push(node.name);
            saveCorretorRoster(); orgAtualizarBI(); renderOrganograma();
            showToast(`${node.name} reativado.`);
        }
        function toggleOrgInativos() { orgMostrarInativos = !orgMostrarInativos; renderOrganograma(); }
        function renderOrgInativos(inativos) {
            const btn = document.getElementById('orgInativosBtn');
            if (btn) btn.innerHTML = `<i class="fa-solid fa-user-slash mr-1"></i>${orgMostrarInativos ? 'Ocultar' : 'Ver'} inativos (${inativos.length})`;
            const el = document.getElementById('organogramaInativos'); if (!el) return;
            el.classList.toggle('hidden', !orgMostrarInativos);
            if (!orgMostrarInativos) { el.innerHTML = ''; return; }
            el.innerHTML = `<div class="org-chart-level-label mt-5">Inativos</div>` + (inativos.length ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">${inativos.map(n => {
                const g = n.role === 'Gerente' ? n : organograma.find(m => m.id === n.parentId && m.role === 'Gerente');
                const eq = g && g.equipe;
                const escopo = n.role === 'Gerente' ? '' : `data-org-scope="broker" data-org-name="${orgEsc(n.name)}" role="button" tabindex="0" title="Ver o histórico de ${orgEsc(n.name)}"`;
                return `<div ${escopo} class="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-800 bg-slate-900/60"><span class="grayscale opacity-70 shrink-0">${corretorAvatarInner(n.name, 'h-10 w-10', 'text-[10px]')}</span><div class="min-w-0 flex-1"><div class="text-[12px] font-bold text-slate-300 truncate">${orgEsc(n.name)}</div><div class="text-[10px] text-slate-500 truncate">${orgEsc(n.role === 'Gerente' ? 'Gerente' : (n.role || 'Corretor'))}${eq ? ' · ' + orgEsc(eq) : ''}</div><span class="inline-flex mt-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold border border-rose-500/25 text-rose-300 bg-rose-500/10">Inativo</span></div>${isDiretor ? `<button type="button" onclick="event.stopPropagation(); reativarOrgMember('${orgEsc(n.id)}')" class="shrink-0 px-2 py-1 rounded-lg border border-emerald-500/30 text-emerald-300 text-[10px] font-bold hover:bg-emerald-500/10">Reativar</button>` : ''}</div>`;
            }).join('')}</div>` : '<p class="text-[11px] text-slate-500 text-center py-3">Nenhum cadastro inativo.</p>');
        }
        // Botões de atalho do painel de administração
        function orgAcaoRapida(tipo) {
            if (!isDiretor) return;
            if (tipo === 'transferir') {
                const box = document.getElementById('orgTransferirBox');
                if (box) { box.classList.toggle('hidden'); renderOrgTransferir(); box.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
                return;
            }
            const role = document.getElementById('orgNewRole');
            if (role) { role.value = tipo === 'gerente' ? 'Gerente' : 'Corretor'; updateOrgParentOptions(role.value); }
            const alvo = document.getElementById('orgNewNameFree');
            if (alvo) { alvo.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => alvo.focus(), 250); }
        }
        function renderOrgTransferir() {
            const selB = document.getElementById('orgTransfCorretor'), selG = document.getElementById('orgTransfGerente');
            if (!selB || !selG) return;
            const gerentes = orgGerentesAtivos();
            const equipeDe = n => { const g = organograma.find(m => m.id === orgGerenteEfetivo(n, gerentes)); return g ? (g.equipe || g.name) : 'sem equipe'; };
            const integrantes = organograma.filter(n => n.role !== 'Gerente' && !orgPessoaInativa(n.name)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
            const atualB = selB.value, atualG = selG.value;
            selB.innerHTML = '<option value="">Escolha o integrante</option>' + integrantes.map(n => `<option value="${orgEsc(n.id)}">${orgEsc(n.name)} · ${orgEsc(equipeDe(n))}</option>`).join('');
            selG.innerHTML = '<option value="">Para a equipe…</option>' + gerentes.map(g => `<option value="${orgEsc(g.id)}">${orgEsc(g.equipe || 'Sem equipe')} · ${orgEsc(g.name)}</option>`).join('');
            selB.value = atualB; selG.value = atualG;
        }
        function transferirOrgCorretor() {
            if (!isDiretor) return;
            const node = organograma.find(n => n.id === document.getElementById('orgTransfCorretor')?.value);
            const dest = organograma.find(n => n.id === document.getElementById('orgTransfGerente')?.value && n.role === 'Gerente');
            if (!node || !dest) { showToast('Escolha o integrante e a equipe de destino.', true); return; }
            const atual = organograma.find(n => n.id === orgGerenteEfetivo(node, orgGerentesAtivos()));
            if (atual && atual.id === dest.id) { showToast(`${node.name} já está na equipe ${dest.equipe || dest.name}.`, true); return; }
            if (!confirm(`Transferir ${node.name}${atual ? ` da equipe ${atual.equipe || atual.name}` : ''} para a equipe ${dest.equipe || dest.name}?`)) return;
            node.parentId = dest.id; node.manualParent = true;
            saveOrganograma(); renderOrgTransferir();
            showToast(`${node.name} transferido para ${dest.equipe || dest.name}.`);
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
            const managers = orgGerentesOrdenados(organograma.filter(n => n.role === 'Gerente' && n.parentId === 'regional' && n.id !== id && activeKeys.has(orgPersonKey(n.name))));
            if (!id) {
                // Gerente: digita o nome da equipe (livre, com sugestões da planilha). Demais: escolhe o gerente.
                const team = document.getElementById('orgNewTeam');
                parent.classList.toggle('hidden', managerRole === 'Gerente');
                if (team) team.classList.toggle('hidden', managerRole !== 'Gerente');
            }
            if (managerRole !== 'Gerente') {
                const selected = managers.some(n => n.id === parent.value) ? parent.value : (managers[0]?.id || '');
                parent.innerHTML = managers.length ? managers.map(n => `<option value="${orgEsc(n.id)}" ${n.id === selected ? 'selected' : ''}>${orgEsc(n.equipe || 'Sem equipe')} · ${orgEsc(n.name)}</option>`).join('') : '<option value="">Cadastre um gerente primeiro</option>';
                parent.value = selected;
            }
            if (!id) {
                const add = document.querySelector('#organogramaSection button[onclick="addOrgMember()"]');
                if (add) add.disabled = !isDiretor || (managerRole !== 'Gerente' && managers.length === 0);
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
            const managers = orgGerentesOrdenados(activeMembers.filter(n => n.role === 'Gerente' && n.parentId === 'regional'));
            const brokerManager = broker => orgGerenteEfetivo(broker, managers);
            const colunas = tree.closest('.org-chart-columns') || tree;
            colunas.style.setProperty('--org-cols', Math.max(managers.length, 1));
            tree.classList.toggle('org-compacto', managers.length > 5);
            const inativos = organograma.filter(n => orgPessoaInativa(n.name));
            const dl = document.getElementById('orgTeamSugestoes');
            if (dl) dl.innerHTML = getOrgTeamNames().map(t => `<option value="${orgEsc(t)}"></option>`).join('');
            const teams = managers.map(n => ({manager:n, brokers:activeMembers.filter(b => b.role !== 'Gerente' && brokerManager(b) === n.id)}));
            const totalBrokers = teams.reduce((sum,team) => sum + team.brokers.length,0);
            const stats = {orgStatManagers:managers.length, orgStatBrokers:totalBrokers, orgStatTotal:managers.length + totalBrokers};
            Object.entries(stats).forEach(([id,value]) => { const el=document.getElementById(id); if (el) el.textContent=value; });
            const assigned = new Set(organograma.map(n => orgPersonKey(n.name)));
            const availableNames = names.filter(n => !assigned.has(orgPersonKey(n)));
            const countLabel = document.getElementById('organogramaCountLabel');
            if (countLabel) countLabel.textContent = `${managers.length} gerentes · ${totalBrokers} integrantes${inativos.length ? ` · ${inativos.length} inativos` : ''}`;
            renderOrgMemberPicker(availableNames);
            updateOrgParentOptions(document.getElementById('orgNewRole')?.value || 'Gerente');
            const addButton = document.querySelector('#organogramaSection button[onclick="addOrgMember()"]');
            if (addButton) addButton.disabled = !isDiretor || (document.getElementById('orgNewRole')?.value !== 'Gerente' && !managers.length);
            const renderEdit = (node, color) => {
                if (!isDiretor) return '';
                const eid = orgEsc(node.id);
                const excluded = orgDescendants(node.id);
                const atual = node.role === 'Gerente' ? null : brokerManager(node);
                const parents = node.role === 'Gerente' ? [] : managers.filter(m => !excluded.has(m.id)).map(m => ({id:m.id,name:`${m.equipe || 'Sem equipe'} · ${m.name}`}));
                const rot = 'block text-[9px] text-slate-500 uppercase tracking-wider mt-2';
                const campo = 'w-full mt-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-brand-500';
                const podeRenomear = !orgTemProducao(node.name);
                const nomeControl = podeRenomear
                    ? `<label class="${rot}">Nome<input id="orgNome-${eid}" value="${orgEsc(node.name)}" class="${campo} normal-case tracking-normal"></label>`
                    : `<div class="${rot}">Nome<div class="mt-1 text-[10px] normal-case tracking-normal text-slate-500">${orgEsc(node.name)} · vem da planilha (já tem produção)</div></div>`;
                const fotoControl = `<button type="button" data-org-person="${orgEsc(orgNomeNoCadastro(node.name))}" onclick="triggerCorretorFotoUpload(this.dataset.orgPerson)" class="mt-2 px-2 py-1 rounded-lg border border-slate-700 text-slate-300 text-[10px] font-bold hover:border-slate-500"><i class="fa-solid fa-camera mr-1"></i>Trocar foto</button>`;
                const parentControl = node.role === 'Gerente'
                    ? `<label class="${rot}">Nome da equipe<input id="orgTeam-${eid}" list="orgTeamSugestoes" value="${orgEsc(node.equipe)}" placeholder="Ex.: BARUC" class="${campo} uppercase"></label>
                        <div class="flex items-center gap-1.5 mt-2"><label class="text-[9px] text-slate-500 uppercase tracking-wider flex items-center gap-1.5">Cor<input type="color" id="orgCor-${eid}" value="${orgEsc(color)}" data-padrao="${orgEsc(color)}" class="h-6 w-8 bg-transparent border border-slate-700 rounded cursor-pointer"></label>
                        <span class="text-[9px] text-slate-500 uppercase tracking-wider ml-auto">Ordem</span><button type="button" onclick="moverOrgGerente('${eid}',-1)" title="Mover para a esquerda" class="h-6 w-6 rounded border border-slate-700 text-slate-300 text-[10px] hover:border-slate-500"><i class="fa-solid fa-chevron-left"></i></button><button type="button" onclick="moverOrgGerente('${eid}',1)" title="Mover para a direita" class="h-6 w-6 rounded border border-slate-700 text-slate-300 text-[10px] hover:border-slate-500"><i class="fa-solid fa-chevron-right"></i></button></div>`
                    : `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2"><label class="${rot}">Classificação<select id="orgRole-${eid}" onchange="updateOrgParentOptions(this.value,'${eid}')" class="${campo}">${['Corretor','Captador','Estagiário'].map(r => `<option ${node.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label><label class="${rot}">Equipe · gerente<select id="orgParent-${eid}" class="${campo}">${parents.length ? parents.map(o => `<option value="${orgEsc(o.id)}" ${atual === o.id ? 'selected' : ''}>${orgEsc(o.name)}</option>`).join('') : '<option value="">Cadastre um gerente primeiro</option>'}</select></label></div>`;
                const sisAtuais = Array.isArray(node.sistemas) ? node.sistemas : [];
                const inp = 'w-full mt-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-brand-500';
                const dd = dadosCorretores[orgPersonKey(node.name)] || {};
                const systemControl = `<div class="mt-2"><div class="text-[9px] text-slate-500 uppercase tracking-wider">Sistemas cadastrados</div><div class="flex flex-wrap gap-1.5 mt-1">${SISTEMAS_CORRETOR.map(x => `<label class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-800 bg-slate-900 text-[11px] text-slate-200 cursor-pointer"><input type="checkbox" id="orgSis-${orgEsc(node.id)}-${x.k}" ${sisAtuais.includes(x.k) ? 'checked' : ''} class="accent-sky-500">${x.nome}</label>`).join('')}</div><div class="text-[9px] text-slate-600 mt-1">Nenhum marcado = Sem sistema</div></div>
                    <div class="mt-2 pt-2 border-t border-slate-800"><div class="text-[9px] text-slate-500 uppercase tracking-wider"><i class="fa-solid fa-lock mr-1"></i>Dados pessoais <span class="normal-case tracking-normal text-slate-600">(só diretor vê)</span></div>
                        <label class="block text-[9px] text-slate-500 mt-1">E-mail<input type="email" id="orgEmail-${orgEsc(node.id)}" value="${orgEsc(dd.email)}" placeholder="nome@email.com" class="${inp}"></label>
                        <div class="grid grid-cols-1 gap-0"><label class="block text-[9px] text-slate-500 mt-1">Telefone<input type="tel" id="orgTel-${orgEsc(node.id)}" value="${orgEsc(dd.tel)}" placeholder="(85) 99999-9999" class="${inp}"></label>
                        <label class="block text-[9px] text-slate-500 mt-1">Nascimento<input type="date" id="orgNasc-${orgEsc(node.id)}" value="${orgEsc(dd.nasc)}" class="${inp}"></label></div>
                        <label class="block text-[9px] text-slate-500 mt-1">Informações adicionais<textarea id="orgObs-${orgEsc(node.id)}" rows="2" placeholder="CRECI, endereço, observações…" class="${inp} resize-y">${orgEsc(dd.obs)}</textarea></label></div>`;
                return `<details class="org-node-edit" ${orgEditAberto === node.id ? 'open' : ''} ontoggle="if (this.open) orgEditAberto = '${eid}'; else if (orgEditAberto === '${eid}') orgEditAberto = null;"><summary>Editar cadastro</summary>${nomeControl}${fotoControl}${parentControl}${systemControl}<div class="flex flex-wrap justify-end gap-1.5 mt-2"><button onclick="saveOrgMember('${eid}')" class="diretor-locked px-3 py-1.5 bg-brand-600/20 text-brand-300 border border-brand-500/30 rounded-lg text-[10px] font-bold">Salvar</button><button onclick="desativarOrgMember('${eid}')" class="diretor-locked px-3 py-1.5 text-amber-300 border border-amber-500/25 rounded-lg text-[10px] font-bold">Desativar</button><button onclick="removeOrgMember('${eid}')" class="diretor-locked px-3 py-1.5 text-rose-300 border border-rose-500/20 rounded-lg text-[10px] font-bold">Remover</button></div></details>`;
            };
            const renderBroker = (broker, color) => `<div class="org-broker-entry"><article data-org-scope="broker" data-org-name="${orgEsc(broker.name)}" role="button" tabindex="0" title="Ver indicadores de ${orgEsc(broker.name)}" class="org-broker-row${orgDashboardScope?.kind === 'broker' && orgPersonKey(orgDashboardScope.name) === orgPersonKey(broker.name) ? ' org-selected' : ''}" style="--team-color:${color}">${orgFichaBotao(broker)}<div class="org-broker-avatar shrink-0">${corretorAvatarInner(broker.name,'h-12 w-12','text-[10px]')}</div><div class="min-w-0"><div class="org-broker-name">${orgEsc(broker.name)}</div><div class="org-broker-role">${orgEsc(broker.role || "Corretor")}</div><div class="flex flex-wrap items-center gap-1.5 mt-1"><span class="org-broker-active">Ativo</span>${orgSistemasBadges(broker)}</div></div></article>${renderEdit(broker, color)}</div>`;
            tree.innerHTML = managers.length ? `<div class="org-chart-level-label">Gerentes</div><div class="org-chart-manager-grid">${teams.map(({manager,brokers},i) => {
                const color = orgCorGerente(manager, i);
                return `<section class="org-team-group" style="--team-color:${color}"><article class="org-manager-card"><div data-org-scope="team" data-org-name="${orgEsc(manager.name)}" data-org-manager-id="${orgEsc(manager.id)}" role="button" tabindex="0" title="Ver os indicadores da equipe de ${orgEsc(manager.name)}" class="org-manager-person${orgDashboardScope?.kind === 'team' && orgDashboardScope.managerId === manager.id ? ' org-selected' : ''}">${orgFichaBotao(manager)}<div class="org-manager-avatar shrink-0">${corretorAvatarInner(manager.name,'h-14 w-14','text-[10px]')}</div><div class="min-w-0"><div class="org-manager-name">${orgEsc(manager.name)}</div><div class="org-manager-role">Gerente de Equipe</div>${manager.equipe ? `<div class="org-manager-team">${orgEsc(manager.equipe)}</div>` : ''}<div class="flex flex-wrap gap-1 mt-1">${orgSistemasBadges(manager)}</div><div class="org-manager-count"><i class="fa-solid fa-user"></i> ${brokers.length} ${brokers.length === 1 ? 'integrante' : 'integrantes'}</div></div></div>${renderEdit(manager, color)}</article></section>`;
            }).join('')}</div><div class="org-chart-level-label mt-5">Equipes do BI</div><div class="org-chart-team-grid">${teams.map(({manager,brokers},i) => {
                const color = orgCorGerente(manager, i);
                return `<section class="org-team-group" style="--team-color:${color}"><article class="org-team-card${organogramaSelectedTeamId === manager.id ? ' org-team-selected' : ''}"><button type="button" class="org-team-select" aria-pressed="${organogramaSelectedTeamId === manager.id}" title="Abrir o painel e destacar esta equipe" onclick="selectOrgTeamCard('${orgEsc(manager.id)}')"><span><i class="fa-solid fa-users mr-1.5"></i> ${orgEsc(manager.equipe || 'Sem equipe')}</span><span class="org-team-count">${brokers.length}</span></button><div class="text-[10px] text-slate-500 mb-2">${orgEsc(manager.name)}${orgResumoPapeis(brokers)}</div><div class="org-broker-list">${brokers.length ? brokers.map(b=>renderBroker(b,color)).join('') : `<div class="text-[11px] text-slate-500 text-center py-5">${manager.equipe ? 'Nenhum integrante ainda — use "Adicionar corretor" ou "Transferir corretor"' : 'Dê um nome à equipe no cadastro do gerente acima'}</div>`}</div></article></section>`;
            }).join('')}</div>` : '<p class="org-chart-empty text-xs text-slate-500 text-center py-8 px-4 rounded-xl border border-dashed border-slate-700">Adicione gerentes abaixo de você. Eles ficarão alinhados na mesma faixa.</p>';
            const sync = document.getElementById('organogramaSyncLabel'); if (sync) sync.textContent = `${managers.length + totalBrokers} pessoas ativas exibidas`;
            renderOrgInativos(inativos);
            const box = document.getElementById('orgTransferirBox'); if (box && !box.classList.contains('hidden')) renderOrgTransferir();
        }
        function selectOrgTeamCard(id) {
            organogramaSelectedTeamId = id;
            const manager = organograma.find(n => n.id === id && n.role === 'Gerente');
            if (manager) {
                selectOrgDashboardScope({dataset:{orgScope:'team', orgName:manager.name, orgManagerId:manager.id}});
                return;
            }
            renderOrganograma();
        }
        function addOrgMember() {
            if (!isDiretor) return;
            const nameEl = document.getElementById('orgNewName'), freeEl = document.getElementById('orgNewNameFree'), roleEl = document.getElementById('orgNewRole'), parentEl = document.getElementById('orgNewParent'), teamEl = document.getElementById('orgNewTeam');
            let name = ((freeEl && freeEl.value) || nameEl.value || '').replace(/\s+/g, ' ').trim();
            if (!name) { showToast('Escolha uma pessoa da lista ou digite o nome.', true); (freeEl || nameEl).focus(); return; }
            if (organograma.some(n => orgPersonKey(n.name) === orgPersonKey(name))) { showToast(`${name} já está no organograma${orgPessoaInativa(name) ? ' (inativo — reative em "Ver inativos")' : ''}.`, true); return; }
            const role = roleEl.value;
            let equipe = '';
            if (role === 'Gerente') {
                equipe = ((teamEl && teamEl.value) || '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
                if (!equipe) { showToast('Digite o nome da equipe do gerente.', true); if (teamEl) teamEl.focus(); return; }
                const dono = organograma.find(n => n.role === 'Gerente' && n.equipe && rankingTeamKey(n.equipe) === rankingTeamKey(equipe));
                if (dono) { showToast(`A equipe ${equipe} já é de ${dono.name}.`, true); return; }
            } else if (!parentEl.value || !organograma.some(n => n.id === parentEl.value && n.role === 'Gerente')) { showToast('Cadastre um gerente primeiro.', true); return; }
            // Pessoa nova (ainda não está na planilha nem no cadastro): entra no cadastro de corretores.
            const noCadastro = getAllKnownCorretores().find(n => orgPersonKey(n) === orgPersonKey(name));
            if (noCadastro) name = noCadastro; else addedCorretores.push(name);
            if (orgPessoaInativa(name)) {
                if (!confirm(`${name} está desativado. Reativar e colocar no organograma?`)) return;
                inactiveCorretores = inactiveCorretores.filter(n => orgPersonKey(n) !== orgPersonKey(name));
            }
            const node = { id: orgId(), name, role, parentId: role === 'Gerente' ? 'regional' : parentEl.value };
            if (role === 'Gerente') {
                const todos = orgGerentesOrdenados(organograma.filter(n => n.role === 'Gerente'));
                todos.forEach((n, i) => { n.ordem = i; });
                Object.assign(node, { equipe, ordem: todos.length });
            } else node.manualParent = true;
            organograma.push(node);
            nameEl.value = ''; if (freeEl) freeEl.value = ''; if (teamEl) teamEl.value = '';
            saveCorretorRoster();
            saveOrganograma();
            showToast(role === 'Gerente' ? `Gerente ${name} cadastrado — equipe ${equipe}.` : `${name} adicionado à equipe.`);
        }
        function saveOrgMember(id) {
            if (!isDiretor) return;
            const node = organograma.find(n => n.id === id); if (!node) return;
            const nomeEl = document.getElementById(`orgNome-${id}`);
            const novoNome = nomeEl ? nomeEl.value.replace(/\s+/g, ' ').trim() : node.name;
            if (novoNome !== node.name && !renomearPessoaOrg(node, novoNome)) return;
            let equipeMudou = false;
            if (node.role === 'Gerente') {
                const equipeNova = (document.getElementById(`orgTeam-${id}`)?.value || '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
                const equipeAntiga = node.equipe || '';
                if (rankingTeamKey(equipeNova) !== rankingTeamKey(equipeAntiga)) {
                    if (!equipeNova) { showToast('O nome da equipe não pode ficar vazio.', true); return; }
                    const dono = organograma.find(n => n !== node && n.role === 'Gerente' && n.equipe && rankingTeamKey(n.equipe) === rankingTeamKey(equipeNova));
                    if (dono) { showToast(`A equipe ${equipeNova} já é de ${dono.name}.`, true); return; }
                    if (equipeAntiga && !confirm(`Renomear a equipe ${equipeAntiga} para ${equipeNova}?\n\nRankings, metas, filtros e relatórios passam a mostrar o novo nome.`)) return;
                    if (equipeAntiga && !node.equipePlanilha && getOrgTeamNames().some(t => rankingTeamKey(t) === rankingTeamKey(equipeAntiga))) node.equipePlanilha = equipeAntiga;
                    const kMeta = equipeAntiga && Object.keys(metasPorEquipe).find(n => rankingTeamKey(n) === rankingTeamKey(equipeAntiga));
                    if (kMeta) { metasPorEquipe[equipeNova] = metasPorEquipe[kMeta]; delete metasPorEquipe[kMeta]; saveLocalSetting(`${appId}-metas-equipe`, JSON.stringify(metasPorEquipe)); }
                    node.equipe = equipeNova;
                    equipeMudou = true;
                }
                const corEl = document.getElementById(`orgCor-${id}`);
                if (corEl && corEl.value !== corEl.dataset.padrao) node.cor = corEl.value;
            }
            node.sistemas = SISTEMAS_CORRETOR.map(x => x.k).filter(k => document.getElementById(`orgSis-${id}-${k}`)?.checked);
            node.sistema = node.sistemas.length ? 'com' : 'sem';
            const chave = orgPersonKey(node.name);
            const dados = {
                email: (document.getElementById(`orgEmail-${id}`)?.value || '').trim(),
                tel: (document.getElementById(`orgTel-${id}`)?.value || '').trim(),
                nasc: document.getElementById(`orgNasc-${id}`)?.value || '',
                obs: (document.getElementById(`orgObs-${id}`)?.value || '').trim()
            };
            const antes = dadosCorretores[chave] || {};
            if (['email', 'tel', 'nasc', 'obs'].some(k => dados[k] !== (antes[k] || ''))) {
                if (dados.email || dados.tel || dados.nasc || dados.obs) dadosCorretores[chave] = dados; else delete dadosCorretores[chave];
                salvarDadosCorretoresLocal();
                if (typeof fbDb !== 'undefined' && fbDb) {
                    const valor = dadosCorretores[chave] ? dados : firebase.firestore.FieldValue.delete();
                    docDadosCorretores().set({ pessoas: { [chave]: valor }, _updatedAt: Date.now() }, { merge: true })
                        .catch(err => { console.warn('Falha ao salvar dados do corretor:', err); if (typeof showToast === 'function') showToast('Dados pessoais salvos só neste navegador (falha na nuvem).', true); });
                }
            }
            if (node.role === 'Gerente') {
                node.parentId = 'regional'; saveOrganograma();
                showToast(equipeMudou ? `Equipe renomeada para ${node.equipe}.` : 'Cadastro salvo.');
                return;
            }
            const selectedParent = document.getElementById(`orgParent-${id}`).value;
            if (!organograma.some(n => n.id === selectedParent && n.role === 'Gerente')) { renderOrganograma(); return; }
            const atual = organograma.find(n => n.id === orgGerenteEfetivo(node, orgGerentesAtivos()));
            if (!atual || atual.id !== selectedParent) {
                const dest = organograma.find(n => n.id === selectedParent);
                if (!confirm(`Transferir ${node.name}${atual ? ` da equipe ${atual.equipe || atual.name}` : ''} para a equipe ${dest.equipe || dest.name}?`)) return;
            }
            node.role = document.getElementById(`orgRole-${id}`).value;
            node.parentId = node.role === 'Gerente' ? 'regional' : selectedParent;
            if (node.role !== 'Gerente') node.manualParent = true; else { delete node.manualParent; node.equipe = ''; }
            saveOrganograma();
            showToast('Cadastro salvo.');
        }
        function removeOrgMember(id) {
            if (!isDiretor) return;
            const node = organograma.find(n => n.id === id); if (!node) return;
            const filhos = organograma.filter(n => n.parentId === id).length;
            if (!confirm(`Remover ${node.name} do organograma?${filhos ? `\n\nOs ${filhos} integrantes vinculados ficam sem gerente até serem transferidos.` : ''}\n\nO histórico de produção não é apagado. Para só tirar dos indicadores, use "Desativar".`)) return;
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
                    if (typeof renderOrganograma === 'function') renderOrganograma();
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
                const meta = getDashboardMeta(c.campo, 'Mes', metasMensais[c.campo] || 0);
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
        // Resolve metas do Painel para o contexto escolhido no Organograma ou nos filtros.
        // Metas individuais e por equipe usam as mesmas chaves pr/ag/co/an/ap/vd + Hoje/Sem/Mes.
        function getDashboardMetaContext() {
            const brokerFilter = document.getElementById('filterCorretor')?.value || '';
            const brokerName = brokerFilter || (orgDashboardScope?.kind === 'broker' ? orgDashboardScope.name : '');
            if (brokerName) {
                const storedName = Object.keys(metasPorCorretor).find(n => orgPersonKey(n) === orgPersonKey(brokerName));
                if (storedName) return { kind: 'broker', name: brokerName, record: metasPorCorretor[storedName] || {} };
            }
            const teamFilter = document.getElementById('filterEquipe')?.value || '';
            const teamName = teamFilter || (orgDashboardScope?.kind === 'team' ? orgDashboardScope.team : '');
            if (teamName) {
                const wanted = rankingTeamKey(teamName);
                const storedName = Object.keys(metasPorEquipe).find(n => rankingTeamKey(n) === wanted);
                if (storedName) return { kind: 'team', name: teamName, record: metasPorEquipe[storedName] || {} };
            }
            return null;
        }
        function getDashboardMeta(metric, cadence, fallback) {
            const prefixes = { prospeccao: 'pr', agendamentos: 'ag', compareceu: 'co', analises: 'an', aprovacoes: 'ap', vendas: 'vd' };
            const prefix = prefixes[metric];
            if (!prefix) return Number(fallback) || 0;
            const context = getDashboardMetaContext();
            if (!context) return Number(fallback) || 0;
            return Number(context.record[prefix + cadence]) || 0;
        }
        function getDashboardMetaContextLabel() {
            const context = getDashboardMetaContext();
            if (!context) return 'Metas gerais';
            return context.kind === 'broker' ? `Metas de ${context.name}` : `Metas da equipe ${context.name}`;
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

        
