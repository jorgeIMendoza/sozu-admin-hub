import { useState, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  mockCases, caseTypeLabels, caseStatusLabels, mockFollowUps, mockReminders,
  followUpTypeLabels, followUpResultLabels,
  type CustomerCase, type CaseStatus, type CaseFollowUp,
} from '@/data/cobranza/mockDataExtended';
import {
  mockClients, getAccountsForClient, getCRMHistoryForClient, getClientIdFromAccountId, addCRMHistoryEntry,
  personTypeLabels, clientStatusLabels, clientAccountRoleLabels,
  crmInteractionLabels,
  type ClientEntity, type CRMInteractionType,
} from '@/data/cobranza/clientData';
import { getBitacoraEntries, addBitacoraEntry, categoryLabels, type BitacoraEntry, type BitacoraCategory } from '@/data/cobranza/bitacoraData';
import { getAvisosForCase, getAvisosForAccount, getAvisosWithErrors, sendStatusConfig, sendStatusLabels, avisoCategoryLabels, errorTypeLabels, suggestedActionLabels, type AvisoRecord } from '@/data/cobranza/avisosData';
import { BitacoraEntryModal } from '@/components/cobranza/BitacoraEntryModal';
import { SendAvisoModal } from '@/components/cobranza/SendAvisoModal';
import { formatDate, formatCurrency } from '@/components/cobranza/StatusBadges';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Search, X, Clock, MessageSquare, Phone, Mail,
  Send, FileText, Handshake, Eye, ArrowUpRight, AlertTriangle,
  CreditCard, Download, ChevronRight, Zap, BookOpen, Bell,
  Plus, MailWarning, CheckCircle2, XCircle,
  StickyNote, Scale, History, CalendarClock, Timer,
  ClipboardList, UserCheck, CalendarDays, Calendar as CalendarIcon,
  User, Building2, Link2, Briefcase,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Status config ───────────────────────────────────────────────
const statusConfig: Record<CaseStatus, { bg: string; text: string }> = {
  abierto: { bg: 'bg-danger-bg', text: 'text-danger' },
  en_atencion: { bg: 'bg-warning-bg', text: 'text-warning' },
  esperando_cliente: { bg: 'bg-info/10', text: 'text-info' },
  resuelto: { bg: 'bg-success-bg', text: 'text-success' },
  escalado: { bg: 'bg-priority-purple/10', text: 'text-priority-purple' },
  archivado: { bg: 'bg-muted', text: 'text-muted-foreground' },
};

const priorityConfig: Record<string, { bg: string; text: string; label: string }> = {
  critica: { bg: 'bg-danger', text: 'text-white', label: 'Crítica' },
  alta: { bg: 'bg-danger-bg', text: 'text-danger', label: 'Alta' },
  media: { bg: 'bg-warning-bg', text: 'text-warning', label: 'Media' },
  baja: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Baja' },
};

const channelIcons: Record<string, React.ElementType> = {
  whatsapp: MessageSquare, email: Mail, llamada: Phone, interno: FileText,
};

const crmTypeIcons: Record<string, React.ElementType> = {
  llamada: Phone, email: Mail, whatsapp: MessageSquare, nota: StickyNote,
  tarea: ClipboardList, recordatorio: Bell, cambio_estado: History,
  escalamiento: ArrowUpRight, respuesta_cliente: UserCheck, error_envio: MailWarning, aviso: Send,
};

type DetailTab = 'resumen' | 'caso' | 'seguimientos' | 'cuentas' | 'avisos' | 'historial';

// ── Helpers ─────────────────────────────────────────────────────
const today = '2026-03-28';
const isOverdue = (date: string) => date < today;
const isToday = (date: string) => date === today;

function getFollowUpStatus(c: CustomerCase) {
  if (c.status === 'resuelto' || c.status === 'archivado') return 'none';
  if (!c.nextAction) return 'missing';
  if (isOverdue(c.nextFollowUpDate)) return 'overdue';
  if (isToday(c.nextFollowUpDate)) return 'today';
  return 'future';
}

function isFueraSLA(c: CustomerCase) {
  if (c.status === 'resuelto' || c.status === 'archivado') return false;
  const slaHours = parseInt(c.sla) || 48;
  const openMs = new Date(c.openDate).getTime();
  const nowMs = new Date(today).getTime();
  return (nowMs - openMs) / (1000 * 60 * 60) > slaHours;
}

function caseSortScore(c: CustomerCase): number {
  const fs = getFollowUpStatus(c);
  let score = 0;
  if (fs === 'overdue') score += 1000;
  if (isFueraSLA(c)) score += 500;
  if (c.priority === 'critica') score += 200;
  if (c.priority === 'alta') score += 100;
  if (fs === 'today') score += 80;
  if (fs === 'missing') score += 60;
  return -score;
}

// ── Get client for a case ───────────────────────────────────────
function getClientForCase(c: CustomerCase): ClientEntity | undefined {
  const clientId = getClientIdFromAccountId(c.accountId);
  return clientId ? mockClients.find(cl => cl.id === clientId) : undefined;
}

// Group cases by client
function getCasesForClient(clientId: string): CustomerCase[] {
  return mockCases.filter(c => {
    const cId = getClientIdFromAccountId(c.accountId);
    return cId === clientId;
  });
}

// ── Main component ──────────────────────────────────────────────
export default function InboxPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<CaseStatus | 'all'>(() => (searchParams.get('estado') as CaseStatus) || 'all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [agendaFilter, setAgendaFilter] = useState<'all' | 'hoy' | 'manana' | 'vencidos' | 'semana'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCase, setSelectedCase] = useState<CustomerCase | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('resumen');
  const [showBitacoraModal, setShowBitacoraModal] = useState(false);
  const [showAvisoModal, setShowAvisoModal] = useState(false);

  const filtered = useMemo(() => {
    let cases = [...mockCases];
    if (statusFilter !== 'all') cases = cases.filter(c => c.status === statusFilter);
    if (typeFilter !== 'all') cases = cases.filter(c => c.type === typeFilter);
    if (agendaFilter !== 'all') {
      cases = cases.filter(c => {
        const fs = getFollowUpStatus(c);
        if (agendaFilter === 'hoy') return fs === 'today';
        if (agendaFilter === 'manana') return c.nextFollowUpDate === '2026-03-29';
        if (agendaFilter === 'vencidos') return fs === 'overdue';
        if (agendaFilter === 'semana') return fs !== 'none';
        return true;
      });
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      cases = cases.filter(c => c.clientName.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || c.accountId.toLowerCase().includes(q));
    }
    return cases.sort((a, b) => caseSortScore(a) - caseSortScore(b));
  }, [statusFilter, typeFilter, agendaFilter, searchQuery]);

  // Stats
  const activeCases = mockCases.filter(c => c.status !== 'resuelto' && c.status !== 'archivado');
  const stats = {
    abiertos: mockCases.filter(c => c.status === 'abierto').length,
    enAtencion: mockCases.filter(c => c.status === 'en_atencion').length,
    esperando: mockCases.filter(c => c.status === 'esperando_cliente').length,
    escalados: mockCases.filter(c => c.status === 'escalado').length,
    fueraSLA: activeCases.filter(c => isFueraSLA(c)).length,
    seguimientoVencido: activeCases.filter(c => getFollowUpStatus(c) === 'overdue').length,
    seguimientoHoy: activeCases.filter(c => getFollowUpStatus(c) === 'today').length,
    erroresEnvio: getAvisosWithErrors().length,
  };

  const selectedClient = selectedCase ? getClientForCase(selectedCase) : undefined;
  const clientAccounts = selectedClient ? getAccountsForClient(selectedClient.id) : [];
  const clientCases = selectedClient ? getCasesForClient(selectedClient.id) : [];
  const clientHistory = selectedClient ? getCRMHistoryForClient(selectedClient.id) : [];

  const caseFollowUps = useMemo(() =>
    selectedCase ? mockFollowUps.filter(f => f.caseId === selectedCase.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : [],
    [selectedCase]
  );

  const caseReminders = useMemo(() =>
    selectedCase ? mockReminders.filter(r => r.caseId === selectedCase.id) : [],
    [selectedCase]
  );

  const caseAvisos = useMemo(() =>
    selectedCase ? [...getAvisosForCase(selectedCase.id), ...getAvisosForAccount(selectedCase.accountId).filter(av => !av.caseId)] : [],
    [selectedCase]
  );

  const handleQuickAction = useCallback((action: string) => {
    if (!selectedCase || !selectedClient) return;
    const actionMap: Record<string, [CRMInteractionType, string, string]> = {
      llamada: ['llamada', 'Llamada registrada', `Se registró llamada con ${selectedCase.clientName}.`],
      seguimiento: ['tarea', 'Seguimiento registrado', `Se registró seguimiento en caso ${selectedCase.id}.`],
      recordatorio: ['recordatorio', 'Recordatorio creado', `Se creó recordatorio para caso ${selectedCase.id}.`],
      responder: ['email', 'Respuesta enviada', `Se respondió al caso ${selectedCase.id}.`],
      escalar: ['escalamiento', 'Caso escalado', `Se escaló caso ${selectedCase.id} a supervisor.`],
      resolver: ['cambio_estado', 'Caso resuelto', `Se marcó como resuelto el caso ${selectedCase.id}.`],
    };
    const [type, title, detail] = actionMap[action] || ['nota', 'Acción registrada', `Acción "${action}" ejecutada.`];
    addCRMHistoryEntry({
      id: `CRM-${Date.now()}`, clientId: selectedClient.id, caseId: selectedCase.id,
      type, title, detail, executive: selectedCase.assignee, date: new Date().toISOString(),
    });
    // Also log to account Bitácora if it impacts the account
    if (['escalar', 'resolver', 'llamada'].includes(action)) {
      addBitacoraEntry({
        id: `bit-crm-${Date.now()}`, accountId: selectedCase.accountId,
        category: action === 'llamada' ? 'comunicacion' : 'atencion',
        eventType: 'aclaracion_pagos' as any, title, description: detail,
        user: selectedCase.assignee, date: new Date().toISOString(),
        origin: 'Atención de Clientes', result: 'Registrado',
      });
    }
  }, [selectedCase, selectedClient]);

  return (
    <div className="flex h-full -m-5">
      {/* ── Case list ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-3 space-y-3">
          <div>
            <h1 className="sozu-page-title">Atención de Clientes</h1>
            <p className="text-[12px] text-muted-foreground mt-0.5">CRM de seguimiento por cliente · Casos, agenda y atención personalizada</p>
          </div>

          {/* KPI strip */}
          <div className="flex items-center gap-2 flex-wrap">
            <KPIChip label="Abiertos" value={stats.abiertos} color="danger" onClick={() => setStatusFilter('abierto')} />
            <KPIChip label="En atención" value={stats.enAtencion} color="warning" onClick={() => setStatusFilter('en_atencion')} />
            <KPIChip label="Esperando" value={stats.esperando} color="info" onClick={() => setStatusFilter('esperando_cliente')} />
            <KPIChip label="Escalados" value={stats.escalados} color="purple" onClick={() => setStatusFilter('escalado')} />
            <span className="w-px h-5 bg-border mx-1" />
            {stats.fueraSLA > 0 && <KPIChip label="Fuera SLA" value={stats.fueraSLA} color="danger" icon={AlertTriangle} />}
            {stats.seguimientoVencido > 0 && <KPIChip label="Seg. vencido" value={stats.seguimientoVencido} color="danger" icon={Timer} onClick={() => setAgendaFilter('vencidos')} />}
            <KPIChip label="Hoy" value={stats.seguimientoHoy} color="warning" icon={CalendarDays} onClick={() => setAgendaFilter('hoy')} />
            {stats.erroresEnvio > 0 && <KPIChip label="Errores" value={stats.erroresEnvio} color="danger" icon={MailWarning} />}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
              <input type="text" placeholder="Buscar cliente, caso o cuenta..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-[38px] pl-9 pr-3 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all duration-150" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="sozu-filter-select">
              <option value="all">Estado</option>
              {Object.entries(caseStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="sozu-filter-select">
              <option value="all">Tipo de caso</option>
              {Object.entries(caseTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={agendaFilter} onChange={e => setAgendaFilter(e.target.value as any)} className="sozu-filter-select">
              <option value="all">Agenda</option>
              <option value="hoy">Hoy</option>
              <option value="manana">Mañana</option>
              <option value="vencidos">Vencidos</option>
              <option value="semana">Esta semana</option>
            </select>
            {(statusFilter !== 'all' || typeFilter !== 'all' || searchQuery || agendaFilter !== 'all') && (
              <button onClick={() => { setStatusFilter('all'); setTypeFilter('all'); setSearchQuery(''); setAgendaFilter('all'); }}
                className="h-[38px] px-3 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg flex items-center gap-1.5 transition-colors duration-100">
                <X className="w-3.5 h-3.5" strokeWidth={1.75} /> Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Case list */}
        <div className="flex-1 overflow-auto p-5 space-y-2">
          {filtered.map(c => <CaseCard key={c.id} c={c} selected={selectedCase?.id === c.id} onSelect={() => { setSelectedCase(c); setDetailTab('resumen'); }} />)}
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <ClipboardList className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No se encontraron casos</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail panel ──────────────────────────────── */}
      {selectedCase && selectedClient && (
        <div className="w-[480px] shrink-0 bg-card border-l border-border flex flex-col animate-slide-in-right">
          {/* Panel header - Client focused */}
          <div className="px-5 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="w-4.5 h-4.5 text-primary" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold text-foreground truncate">{selectedClient.name}</h3>
                  <p className="text-[11px] text-muted-foreground">{personTypeLabels[selectedClient.personType]} · {selectedClient.rfc}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/cuenta/${selectedCase.accountId}`)} title="Ver expediente">
                  <Eye className="w-4 h-4" strokeWidth={1.75} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedCase(null)}>
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </Button>
              </div>
            </div>
            {/* Case badge strip */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono text-muted-foreground">{selectedCase.id}</span>
              <span className={cn('sozu-chip', statusConfig[selectedCase.status].bg, statusConfig[selectedCase.status].text)}>
                {caseStatusLabels[selectedCase.status]}
              </span>
              <span className={cn('sozu-chip', priorityConfig[selectedCase.priority].bg, priorityConfig[selectedCase.priority].text)}>
                {priorityConfig[selectedCase.priority].label}
              </span>
              {isFueraSLA(selectedCase) && <span className="sozu-chip bg-danger-bg text-danger">Fuera SLA</span>}
              {clientAccounts.length > 1 && (
                <span className="sozu-chip bg-info/10 text-info">+{clientAccounts.length - 1} cuentas</span>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center border-b border-border px-2 overflow-x-auto">
            {([
              { id: 'resumen' as DetailTab, label: 'Resumen', icon: User },
              { id: 'caso' as DetailTab, label: 'Caso', icon: ClipboardList },
              { id: 'seguimientos' as DetailTab, label: 'Seguimientos', icon: CalendarClock, count: caseFollowUps.length },
              { id: 'cuentas' as DetailTab, label: 'Cuentas', icon: Briefcase, count: clientAccounts.length },
              { id: 'avisos' as DetailTab, label: 'Avisos', icon: Bell, count: caseAvisos.length },
              { id: 'historial' as DetailTab, label: 'Historial CRM', icon: History, count: clientHistory.length },
            ]).map(tab => (
              <button key={tab.id} onClick={() => setDetailTab(tab.id)}
                className={cn('flex items-center gap-1 px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                  detailTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                <tab.icon className="w-3 h-3" strokeWidth={1.75} />
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span className="text-[10px] px-1 rounded-full min-w-[16px] text-center bg-muted text-muted-foreground">{tab.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {/* ── TAB: Resumen del Cliente ── */}
            {detailTab === 'resumen' && (
              <div className="px-5 py-4 space-y-5">
                {/* Client data */}
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Datos del Cliente</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <InfoItem label="Nombre" value={selectedClient.name} />
                    <InfoItem label="Tipo" value={personTypeLabels[selectedClient.personType]} />
                    <InfoItem label="RFC" value={selectedClient.rfc} />
                    <InfoItem label="Email" value={selectedClient.email} />
                    <InfoItem label="Teléfono" value={selectedClient.phone} />
                    <InfoItem label="Ejecutivo" value={selectedClient.executiveAssigned} />
                    <InfoItem label="Estatus" value={clientStatusLabels[selectedClient.status]} />
                    {selectedClient.clabes.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-[11px] text-muted-foreground">CLABE(s)</p>
                        {selectedClient.clabes.map((cl, i) => (
                          <p key={i} className="text-[12px] font-mono text-foreground">{cl}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Accounts summary */}
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Cuentas vinculadas ({clientAccounts.length})</p>
                  <div className="space-y-1.5">
                    {clientAccounts.slice(0, 3).map(({ account, role }) => (
                      <button key={account.id} onClick={() => navigate(`/cuenta/${account.id}`)}
                        className="w-full p-2.5 rounded-lg border border-border-light bg-background hover:bg-muted/30 text-left transition-colors">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[12px] font-semibold text-foreground">{account.project.name} · {account.unitNumber}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{account.accountId}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="sozu-chip bg-muted text-muted-foreground">{clientAccountRoleLabels[role]}</span>
                          <span>Vencido: {formatCurrency(account.overdueAmount)}</span>
                          <span>·</span>
                          <span>Saldo: {formatCurrency(account.balance)}</span>
                        </div>
                      </button>
                    ))}
                    {clientAccounts.length > 3 && (
                      <button onClick={() => setDetailTab('cuentas')} className="text-[11px] text-primary font-medium hover:underline">
                        Ver las {clientAccounts.length} cuentas →
                      </button>
                    )}
                  </div>
                </div>

                {/* Cases summary */}
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Casos del cliente ({clientCases.length})</p>
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat label="Abiertos" value={clientCases.filter(c => c.status === 'abierto').length} color="danger" />
                    <MiniStat label="En atención" value={clientCases.filter(c => c.status === 'en_atencion').length} color="warning" />
                    <MiniStat label="Escalados" value={clientCases.filter(c => c.status === 'escalado').length} color="purple" />
                    <MiniStat label="Resueltos" value={clientCases.filter(c => c.status === 'resuelto').length} color="success" />
                  </div>
                </div>

                {/* CRM Actions */}
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Acciones CRM</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <ActionBtn icon={Phone} label="Registrar llamada" onClick={() => handleQuickAction('llamada')} />
                    <ActionBtn icon={CalendarClock} label="Agendar seguimiento" onClick={() => handleQuickAction('seguimiento')} />
                    <ActionBtn icon={Bell} label="Crear recordatorio" onClick={() => handleQuickAction('recordatorio')} />
                    <ActionBtn icon={Send} label="Enviar aviso" onClick={() => setShowAvisoModal(true)} />
                    <ActionBtn icon={Handshake} label="Crear promesa" onClick={() => handleQuickAction('promesa')} />
                    <ActionBtn icon={ArrowUpRight} label="Escalar caso" variant="destructive" onClick={() => handleQuickAction('escalar')} />
                    <ActionBtn icon={CheckCircle2} label="Marcar resuelto" onClick={() => handleQuickAction('resolver')} />
                    <ActionBtn icon={Eye} label="Ver expediente" onClick={() => navigate(`/cuenta/${selectedCase.accountId}`)} />
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: Caso ── */}
            {detailTab === 'caso' && (
              <div className="px-5 py-4 space-y-4">
                {/* Case info */}
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Detalle del Caso</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <InfoItem label="Tipo" value={caseTypeLabels[selectedCase.type]} />
                    <InfoItem label="Canal" value={selectedCase.channel} />
                    <InfoItem label="Ejecutivo" value={selectedCase.assignee} />
                    <InfoItem label="SLA" value={selectedCase.sla} />
                    <InfoItem label="Apertura" value={formatDate(selectedCase.openDate)} />
                    <InfoItem label="Cuenta principal" value={selectedCase.accountId} />
                    <InfoItem label="Proyecto" value={`${selectedCase.projectName} · ${selectedCase.unitNumber}`} />
                  </div>
                </div>

                {/* Next action */}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <CalendarClock className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
                    <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">Próximo Seguimiento</p>
                  </div>
                  {selectedCase.nextAction ? (
                    <div className="space-y-1.5">
                      <p className="text-[13px] font-medium text-foreground">{selectedCase.nextAction}</p>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className={cn('flex items-center gap-1 font-medium',
                          isOverdue(selectedCase.nextFollowUpDate) ? 'text-danger' :
                            isToday(selectedCase.nextFollowUpDate) ? 'text-warning' : 'text-muted-foreground')}>
                          <CalendarIcon className="w-3 h-3" strokeWidth={1.75} />
                          {formatDate(selectedCase.nextFollowUpDate)}
                          {selectedCase.nextFollowUpTime && ` · ${selectedCase.nextFollowUpTime}`}
                        </span>
                        {selectedCase.followUpType && (
                          <span className="sozu-chip bg-muted text-muted-foreground">{followUpTypeLabels[selectedCase.followUpType]}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-[12px] text-danger font-medium">⚠ Sin próxima acción definida</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2.5">
                    <Button size="sm" className="h-7 text-[11px]" onClick={() => handleQuickAction('seguimiento')}>
                      <Plus className="w-3 h-3 mr-1" strokeWidth={1.75} />Registrar seguimiento
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => handleQuickAction('recordatorio')}>
                      <Bell className="w-3 h-3 mr-1" strokeWidth={1.75} />Recordatorio
                    </Button>
                  </div>
                </div>

                {/* Conversation */}
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Conversación</p>
                  <div className="space-y-3">
                    {selectedCase.messages.map((msg, i) => {
                      const MsgIcon = channelIcons[msg.channel] || MessageSquare;
                      const isAgent = msg.from !== selectedCase.clientName;
                      return (
                        <div key={i} className={cn('flex gap-2', isAgent && 'flex-row-reverse')}>
                          <div className={cn('max-w-[85%] rounded-lg px-3 py-2', isAgent ? 'bg-primary-light' : 'bg-muted')}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <MsgIcon className="w-3 h-3 text-muted-foreground" strokeWidth={1.75} />
                              <span className="text-[11px] font-medium text-foreground">{msg.from}</span>
                              <span className="text-[10px] text-muted-foreground">{msg.date.split(' ')[1] || ''}</span>
                            </div>
                            <p className="text-[13px] text-foreground">{msg.content}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── TAB: Seguimientos ── */}
            {detailTab === 'seguimientos' && (
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Historial de Seguimientos</p>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => handleQuickAction('seguimiento')}>
                    <Plus className="w-3 h-3 mr-1" strokeWidth={1.75} />Registrar
                  </Button>
                </div>

                {/* Reminders */}
                {caseReminders.filter(r => !r.completed).length > 0 && (
                  <div className="mb-4 p-3 rounded-lg border border-warning/20 bg-warning/5">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Bell className="w-3.5 h-3.5 text-warning" strokeWidth={1.75} />
                      <p className="text-[11px] font-semibold text-warning uppercase tracking-wider">Recordatorios activos</p>
                    </div>
                    {caseReminders.filter(r => !r.completed).map(r => (
                      <div key={r.id} className="flex items-start gap-2 py-1.5">
                        <CalendarClock className={cn('w-3.5 h-3.5 mt-0.5', isOverdue(r.date) ? 'text-danger' : isToday(r.date) ? 'text-warning' : 'text-muted-foreground')} strokeWidth={1.75} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-foreground">{r.description}</p>
                          <p className={cn('text-[10px]', isOverdue(r.date) ? 'text-danger font-medium' : 'text-muted-foreground')}>
                            {formatDate(r.date)} · {r.time} · {r.executive}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  {caseFollowUps.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground text-center py-6">Sin seguimientos registrados</p>
                  ) : caseFollowUps.map(fu => (
                    <div key={fu.id} className="p-3 rounded-lg border border-border-light bg-background hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="sozu-chip bg-primary/10 text-primary text-[10px]">{followUpTypeLabels[fu.type]}</span>
                        <span className="sozu-chip bg-muted text-muted-foreground text-[10px]">{followUpResultLabels[fu.result]}</span>
                      </div>
                      <p className="text-[12px] font-semibold text-foreground">{fu.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{fu.detail}</p>
                      {fu.nextAction && (
                        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-primary">
                          <ChevronRight className="w-3 h-3" strokeWidth={1.75} />
                          <span className="font-medium">Próxima: {fu.nextAction}</span>
                          {fu.nextDate && <span className="text-muted-foreground">· {formatDate(fu.nextDate)}</span>}
                        </div>
                      )}
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        <span>{fu.executive}</span><span>·</span><span>{formatDate(fu.date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB: Cuentas vinculadas ── */}
            {detailTab === 'cuentas' && (
              <div className="px-5 py-4">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">Cuentas de Cobranza vinculadas al cliente</p>
                <div className="space-y-2">
                  {clientAccounts.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground text-center py-6">Sin cuentas vinculadas</p>
                  ) : clientAccounts.map(({ account, role, percentage }) => (
                    <button key={account.id} onClick={() => navigate(`/cuenta/${account.id}`)}
                      className="w-full p-3 rounded-lg border border-border-light bg-background hover:bg-muted/30 text-left transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] font-semibold text-foreground">{account.project.name} · {account.unitNumber}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{account.accountId}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11px] mt-1.5">
                        <div>
                          <p className="text-muted-foreground">Rol</p>
                          <p className="text-foreground font-medium">{clientAccountRoleLabels[role]}{percentage && percentage < 100 ? ` (${percentage}%)` : ''}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Vencido</p>
                          <p className={cn('font-medium', account.overdueAmount > 0 ? 'text-danger' : 'text-success')}>
                            {formatCurrency(account.overdueAmount)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Saldo</p>
                          <p className="text-foreground font-medium">{formatCurrency(account.balance)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                        <span>{account.legalEntity.name}</span>
                        <span>·</span>
                        <span>Ejecutivo: {account.assignedExecutive}</span>
                        <span>·</span>
                        <span>Próx. pago: {formatDate(account.nextDueDate)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB: Avisos ── */}
            {detailTab === 'avisos' && (
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Avisos enviados</p>
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setShowAvisoModal(true)}>
                    <Send className="w-3 h-3 mr-1" strokeWidth={1.75} />Enviar aviso
                  </Button>
                </div>
                <div className="space-y-2">
                  {caseAvisos.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground text-center py-6">Sin avisos enviados</p>
                  ) : caseAvisos.map(av => (
                    <AvisoCard key={av.id} aviso={av} />
                  ))}
                </div>
              </div>
            )}

            {/* ── TAB: Historial CRM ── */}
            {detailTab === 'historial' && (
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Historial CRM del cliente</p>
                </div>
                <div className="space-y-2.5">
                  {clientHistory.length === 0 ? (
                    <div className="text-center py-8">
                      <History className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" strokeWidth={1.5} />
                      <p className="text-[12px] text-muted-foreground">Sin interacciones registradas</p>
                    </div>
                  ) : clientHistory.map(entry => {
                    const TypeIcon = crmTypeIcons[entry.type] || FileText;
                    return (
                      <div key={entry.id} className="p-3 rounded-lg border border-border-light bg-background hover:bg-muted/30 transition-colors">
                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 rounded flex items-center justify-center bg-muted shrink-0 mt-0.5">
                            <TypeIcon className="w-3 h-3 text-muted-foreground" strokeWidth={1.75} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-semibold text-foreground">{entry.title}</p>
                            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{entry.detail}</p>
                            <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                              <span>{entry.executive}</span>
                              <span>·</span>
                              <span>{formatDate(entry.date)}</span>
                              <span className="sozu-chip bg-muted text-muted-foreground">{crmInteractionLabels[entry.type]}</span>
                              {entry.result && <span className="sozu-chip bg-primary/10 text-primary">{entry.result}</span>}
                              {entry.caseId && <span className="font-mono text-[9px]">{entry.caseId}</span>}
                            </div>
                            {entry.nextStep && (
                              <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-primary">
                                <ChevronRight className="w-3 h-3" strokeWidth={1.75} />
                                <span className="font-medium">{entry.nextStep}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Modals */}
          {selectedCase && (
            <>
              <BitacoraEntryModal open={showBitacoraModal} onOpenChange={setShowBitacoraModal} accountId={selectedCase.accountId} onEntryAdded={() => {}} />
              <SendAvisoModal open={showAvisoModal} onOpenChange={setShowAvisoModal} accountId={selectedCase.accountId} clientName={selectedCase.clientName} caseId={selectedCase.id} onAvisoSent={() => {}} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────
function KPIChip({ label, value, color, icon: Icon, onClick }: { label: string; value: number; color: string; icon?: React.ElementType; onClick?: () => void }) {
  const colorMap: Record<string, string> = {
    danger: 'text-danger', warning: 'text-warning', info: 'text-info', purple: 'text-priority-purple', success: 'text-success',
  };
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-[12px] hover:bg-muted/50 px-1.5 py-0.5 rounded transition-colors">
      {Icon && <Icon className={cn('w-3 h-3', colorMap[color])} strokeWidth={1.75} />}
      <span className={cn('font-semibold', colorMap[color])}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </button>
  );
}

function CaseCard({ c, selected, onSelect }: { c: CustomerCase; selected: boolean; onSelect: () => void }) {
  const ChannelIcon = channelIcons[c.channel] || MessageSquare;
  const sConf = statusConfig[c.status];
  const pConf = priorityConfig[c.priority];
  const overSLA = isFueraSLA(c);
  const fs = getFollowUpStatus(c);
  const client = getClientForCase(c);
  const clientAccs = client ? getAccountsForClient(client.id) : [];

  return (
    <div onClick={onSelect}
      className={cn('sozu-kpi-card !p-4 cursor-pointer', selected && 'ring-1 ring-primary',
        overSLA && 'border-l-4 border-l-danger',
        fs === 'overdue' && !overSLA && 'border-l-4 border-l-warning')}>
      {/* Top block: case type + client + status */}
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', pConf.bg)}>
            <ChannelIcon className={cn('w-4 h-4', pConf.text)} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">{caseTypeLabels[c.type]}</p>
            <p className="text-[12px] text-foreground font-medium truncate">{c.clientName}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {c.projectName} · {c.unitNumber}
              {clientAccs.length > 1 && <span className="ml-1 text-info font-medium">+{clientAccs.length - 1} cuentas</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-wrap justify-end shrink-0">
          {overSLA && <span className="sozu-chip bg-danger-bg text-danger text-[10px]">Fuera SLA</span>}
          <span className={cn('sozu-chip', sConf.bg, sConf.text)}>{caseStatusLabels[c.status]}</span>
        </div>
      </div>

      {/* Middle: next action or summary */}
      {c.nextAction && c.status !== 'resuelto' && c.status !== 'archivado' && (
        <div className="ml-11 mb-1.5">
          <div className="flex items-center gap-1.5">
            <CalendarClock className={cn('w-3 h-3', fs === 'overdue' ? 'text-danger' : fs === 'today' ? 'text-warning' : 'text-primary')} strokeWidth={1.75} />
            <span className="text-[11px] font-medium text-foreground truncate">{c.nextAction}</span>
            <span className={cn('text-[10px]', fs === 'overdue' ? 'text-danger font-medium' : fs === 'today' ? 'text-warning' : 'text-muted-foreground')}>
              {formatDate(c.nextFollowUpDate)}
            </span>
          </div>
        </div>
      )}
      {!c.nextAction && c.status !== 'resuelto' && c.status !== 'archivado' && (
        <div className="ml-11 mb-1.5">
          <span className="text-[10px] text-danger font-medium flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" strokeWidth={1.75} />Sin próxima acción
          </span>
        </div>
      )}

      {/* Bottom: metadata */}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground ml-11">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" strokeWidth={1.75} /> {formatDate(c.openDate)}</span>
        <span>SLA: {c.sla}</span>
        <span>{c.assignee}</span>
        <span className={cn('sozu-chip', pConf.bg, pConf.text)}>{pConf.label}</span>
        {c.hasReminder && <Bell className="w-3 h-3 text-primary" strokeWidth={1.75} />}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-[12px] font-medium text-foreground truncate">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    danger: 'text-danger', warning: 'text-warning', info: 'text-info', purple: 'text-priority-purple', success: 'text-success',
  };
  return (
    <div className="p-2 rounded-lg border border-border-light bg-background">
      <p className={cn('text-[16px] font-semibold', colorMap[color] || 'text-foreground')}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, variant, onClick }: { icon: React.ElementType; label: string; variant?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={cn('flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium transition-colors duration-100',
      variant === 'destructive' ? 'bg-danger-bg text-danger hover:bg-danger/10' : 'bg-muted hover:bg-border text-foreground')}>
      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />{label}
    </button>
  );
}

function AvisoCard({ aviso }: { aviso: AvisoRecord }) {
  return (
    <div className="p-3 rounded-lg border border-border-light bg-background hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between mb-1">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-foreground">{aviso.subject}</p>
          <p className="text-[11px] text-muted-foreground line-clamp-1">{aviso.preview}</p>
        </div>
        <span className={cn('sozu-chip shrink-0 ml-2', sendStatusConfig[aviso.status].bg, sendStatusConfig[aviso.status].text)}>
          {sendStatusLabels[aviso.status]}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
        <span className="sozu-chip bg-muted text-muted-foreground">{avisoCategoryLabels[aviso.category]}</span>
        <span>{aviso.channel}</span>
        <span>·</span>
        <span>{aviso.sentBy}</span>
        <span>·</span>
        <span>{formatDate(aviso.sentDate)}</span>
      </div>
    </div>
  );
}
