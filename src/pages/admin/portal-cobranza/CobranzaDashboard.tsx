import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/components/admin/portal-cobranza/StatusBadges';
import { mockKPIs, mockFinancialMetrics, mockAccounts, mockWeeklyFlow, mockLegalEntities } from '@/data/cobranza/mockData';
import { mockObraProjects, mockObraWeekly, mockCashFlowProjection, getObraStatus, obraStatusConfig } from '@/data/cobranza/obraData';
import { navigateWithFilters } from '@/lib/navigationFilters';
import {
  TrendingUp, AlertTriangle, CheckCircle2, DollarSign, Calendar,
  Target, ArrowUpRight, BarChart3, Building2, Shield, Zap, HardHat,
  Clock, Activity,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area, ReferenceLine } from 'recharts';
import { cn } from '@/lib/utils';

const kpi = mockKPIs;
const fin = mockFinancialMetrics;
const periods = ['Este mes', 'Mes pasado', 'Últimos 3 meses', 'Año actual'];

type DashTab = 'resumen' | 'flujo' | 'riesgo' | 'cobranza' | 'operacion';
const tabs: { id: DashTab; label: string; icon: React.ElementType }[] = [
  { id: 'resumen', label: 'Resumen Ejecutivo', icon: Target },
  { id: 'flujo', label: 'Flujo y Obra', icon: HardHat },
  { id: 'riesgo', label: 'Riesgo y Cartera', icon: Shield },
  { id: 'cobranza', label: 'Cobranza por Proyecto', icon: Building2 },
  { id: 'operacion', label: 'Operación y SLA', icon: Activity },
];

function drill(navigate: ReturnType<typeof useNavigate>, path: string, filters: Record<string, string> = {}) {
  navigateWithFilters(navigate, `/admin/portal-cobranza${path}`, { ...filters, from: 'dashboard' });
}

export default function CobranzaDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState('Este mes');
  const [activeTab, setActiveTab] = useState<DashTab>('resumen');

  const cepsPending = 3;
  const penalizados = mockAccounts.filter(a => a.overdueInstallments >= 3).length;
  const docIncomplete = mockAccounts.filter(a => !a.documentationComplete).length;
  const fueraSLA = 2;
  const pldAlerts = mockAccounts.filter(a => a.pldStatus !== 'validado' && a.pldStatus !== 'liberado_pld').length;
  const legalCases = mockAccounts.filter(a => a.legalStatus !== 'sin_accion').length;
  const plus90 = penalizados;

  const riskLevel = penalizados >= 4 ? 'Crítico' : penalizados >= 2 ? 'Alto riesgo' : pldAlerts > 0 ? 'Controlado con riesgo' : 'Controlado';
  const riskColor = penalizados >= 4 ? 'text-priority-purple' : penalizados >= 2 ? 'text-danger' : pldAlerts > 0 ? 'text-warning' : 'text-success';

  const priorityActions = [
    { label: `Recuperar ${formatCurrency(fin.overdueBalance)} vencidos`, icon: DollarSign, color: 'text-danger', onClick: () => drill(navigate, '/bandeja', { preset: 'critical' }) },
    { label: `Atacar ${plus90} clientes críticos +90d`, icon: AlertTriangle, color: 'text-priority-purple', onClick: () => drill(navigate, '/bandeja', { preset: 'prelegal' }) },
    { label: `Cerrar ${formatCurrency(fin.scheduledMonth - fin.collectedMonth)} para meta`, icon: Target, color: 'text-warning', onClick: () => drill(navigate, '/pagos') },
    { label: `Resolver ${cepsPending} CEPs pendientes`, icon: CheckCircle2, color: 'text-info', onClick: () => drill(navigate, '/ceps') },
    { label: `Cerrar ${fueraSLA} casos fuera de SLA`, icon: Clock, color: 'text-danger', onClick: () => drill(navigate, '/atencion') },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="sozu-page-title">Control Tower</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Centro de inteligencia de cobranza · Abril 2026</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="sozu-filter-select">
            <option>Todas las entidades</option>
            {mockLegalEntities.map(le => <option key={le.id}>{le.name}</option>)}
          </select>
          <select value={period} onChange={e => setPeriod(e.target.value)} className="sozu-filter-select">
            {periods.map(p => <option key={p}>{p}</option>)}
          </select>
          <select className="sozu-filter-select">
            <option>Todos los proyectos</option>
            <option>Daiku</option><option>Bottura</option><option>Margot</option><option>Monócolo</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border pb-0">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn('flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-t-lg border-b-2 transition-colors duration-100',
              activeTab === tab.id ? 'border-b-primary text-primary bg-primary-muted/50' : 'border-b-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50')}>
            <tab.icon className="w-3.5 h-3.5" strokeWidth={1.75} />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'resumen' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <FinKPICard label="Programado Mes" value={formatCurrency(fin.scheduledMonth)} icon={Calendar} sub="Meta del periodo" />
            <FinKPICard label="Cobrado del Mes" value={formatCurrency(fin.collectedMonth)} icon={DollarSign} trend="+12.3%" trendUp />
            <FinKPICard label="% Cumplimiento" value={`${fin.collectedVsTarget}%`} icon={Target} trend={fin.collectedVsTarget >= 90 ? 'En meta' : 'Bajo meta'} trendUp={fin.collectedVsTarget >= 90} />
            <FinKPICard label="Por Cobrar Mes" value={formatCurrency(fin.toCollectMonth)} icon={BarChart3} sub="Pendiente periodo" />
            <FinKPICard label="Saldo Vencido" value={formatCurrency(fin.overdueBalance)} icon={AlertTriangle} variant="danger" onClick={() => drill(navigate, '/bandeja', { preset: 'critical' })} />
            <FinKPICard label="Recovery Rate" value={`${fin.recoveryRate}%`} icon={TrendingUp} sub="Periodo actual" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="sozu-kpi-card !p-5 border-l-4 border-l-danger">
              <h2 className="sozu-section-title flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-danger" strokeWidth={1.75} /> Alertas Clave
              </h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                <AlertRow label="Cartera vencida total" value={formatCurrency(fin.overdueBalance)} danger onClick={() => drill(navigate, '/bandeja', { preset: 'critical' })} />
                <AlertRow label="Clientes +90 días" value={String(plus90)} danger={plus90 > 0} onClick={() => drill(navigate, '/bandeja', { preset: 'prelegal' })} />
                <AlertRow label="Alertas PLD" value={String(pldAlerts)} danger={pldAlerts > 0} />
                <AlertRow label="Doc. crítica faltante" value={String(docIncomplete)} danger={docIncomplete > 0} />
                <AlertRow label="Promesas vencidas" value={String(kpi.brokenPromises)} danger={kpi.brokenPromises > 0} onClick={() => drill(navigate, '/promesas', { estatus: 'vencida' })} />
                <AlertRow label="En prelegal" value={String(legalCases)} danger={legalCases > 0} />
                <AlertRow label="CEPs pendientes" value={String(cepsPending)} danger={cepsPending > 0} onClick={() => drill(navigate, '/ceps')} />
                <AlertRow label="Fuera SLA" value={String(fueraSLA)} danger={fueraSLA > 0} />
              </div>
              <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Status general:</span>
                <span className={cn('text-[13px] font-semibold', riskColor)}>{riskLevel}</span>
              </div>
            </div>

            <div className="sozu-kpi-card !p-5">
              <h2 className="sozu-section-title flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-primary" strokeWidth={1.75} /> Acciones Prioritarias
              </h2>
              <div className="space-y-1.5">
                {priorityActions.map((action, i) => (
                  <button key={i} onClick={action.onClick}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-background hover:bg-muted border border-border transition-colors duration-100 text-left group">
                    <action.icon className={cn('w-4 h-4 shrink-0', action.color)} strokeWidth={1.75} />
                    <span className="text-[13px] text-foreground group-hover:text-primary transition-colors flex-1">{action.label}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" strokeWidth={1.75} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="sozu-kpi-card">
            <h2 className="sozu-section-title mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" strokeWidth={1.75} /> Cobrado vs Meta por Mes
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={fin.collectedByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,91%)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(220,9%,46%)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(220,9%,46%)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(220,13%,91%)' }} />
                <Line type="monotone" dataKey="collected" stroke="hsl(142,71%,45%)" strokeWidth={2} dot={{ r: 3 }} name="Cobrado" />
                <Line type="monotone" dataKey="target" stroke="hsl(220,9%,46%)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Meta" />
                <Line type="monotone" dataKey="overdue" stroke="hsl(0,84%,60%)" strokeWidth={1.5} dot={false} name="Vencido" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'flujo' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <FinKPICard label="Cobrado Semana" value={formatCurrency(1250000)} icon={DollarSign} sub="Última semana" />
            <FinKPICard label="Proyectado Semana" value={formatCurrency(1300000)} icon={Calendar} sub="Semana actual" />
            <FinKPICard label="Prov. Obra Semana" value={formatCurrency(1050000)} icon={HardHat} sub="Provisión requerida" />
            <FinKPICard label="Déficit Acumulado" value={formatCurrency(mockWeeklyFlow.reduce((s, w) => s + w.deficit, 0))} icon={AlertTriangle} variant="danger" />
            <FinKPICard label="Semanas Críticas" value={`${mockWeeklyFlow.filter(w => w.status === 'critico' || w.status === 'alto').length}`} icon={Shield} variant="danger" />
            <FinKPICard label="Proyectos Activos" value={String(mockObraProjects.length)} icon={Building2} sub="En ejecución" />
          </div>
          <div className="sozu-kpi-card">
            <h2 className="sozu-section-title mb-4">Flujo Semanal: Cobranza vs Provisión de Obra</h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={mockWeeklyFlow}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,91%)" />
                <XAxis dataKey="range" tick={{ fontSize: 9, fill: 'hsl(220,9%,46%)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(220,9%,46%)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="collected" fill="hsl(142,71%,45%,0.15)" stroke="hsl(142,71%,45%)" strokeWidth={2} name="Cobrado" />
                <Area type="monotone" dataKey="projected" fill="hsl(217,91%,60%,0.08)" stroke="hsl(217,91%,60%)" strokeWidth={1.5} strokeDasharray="4 4" name="Proyectado" />
                <ReferenceLine y={0} stroke="hsl(220,13%,91%)" />
                <Line type="monotone" dataKey="obraProvision" stroke="hsl(0,84%,60%)" strokeWidth={1.5} dot={false} name="Provisión Obra" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="sozu-kpi-card">
            <h2 className="sozu-section-title mb-3">Proyectos de Obra</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {mockObraProjects.map(p => {
                const st = getObraStatus(p.avanceFisico, p.avanceFinanciero);
                const c = obraStatusConfig[st];
                return (
                  <div key={p.id} className="p-4 rounded-lg border border-border bg-background">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[14px] font-semibold text-foreground">{p.project}</span>
                      <span className={cn('sozu-chip', c.bg, c.text)}>{c.label}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[12px]">
                      <div><span className="text-muted-foreground">Físico</span><p className="font-semibold text-foreground">{p.avanceFisico}%</p></div>
                      <div><span className="text-muted-foreground">Financiero</span><p className="font-semibold text-foreground">{p.avanceFinanciero}%</p></div>
                      <div><span className="text-muted-foreground">Provisión/sem</span><p className="font-semibold text-foreground">{formatCurrency(p.provisionSemanal)}</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'riesgo' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FinKPICard label="1 Parc. Vencida" value={String(kpi.accounts1Overdue)} icon={AlertTriangle} sub="Preventivo" />
            <FinKPICard label="2 Parc. Vencidas" value={String(kpi.accounts2Overdue)} icon={AlertTriangle} variant="danger" />
            <FinKPICard label="3+ Parc. / Prelegal" value={String(kpi.accounts3PlusOverdue)} icon={Shield} variant="danger" />
            <FinKPICard label="Alertas PLD" value={String(pldAlerts)} icon={Shield} variant={pldAlerts > 0 ? 'danger' : undefined} />
          </div>
          <div className="sozu-kpi-card">
            <h2 className="sozu-section-title mb-3">Aging de Cartera</h2>
            <div className="space-y-2">
              {kpi.agingData.map(a => (
                <div key={a.range} className="flex items-center gap-4">
                  <span className="text-[13px] text-muted-foreground w-24">{a.range}</span>
                  <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-danger rounded-full" style={{ width: `${(a.amount / kpi.overduePortfolio) * 100}%` }} />
                  </div>
                  <span className="text-[13px] font-semibold text-foreground w-28 text-right">{formatCurrency(a.amount)}</span>
                  <span className="text-[12px] text-muted-foreground w-16 text-right">{a.count} ctas</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'cobranza' && (
        <div className="space-y-5">
          <div className="sozu-kpi-card !p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-border"><h2 className="sozu-section-title">Cobranza por Proyecto</h2></div>
            <table className="w-full text-sm">
              <thead className="sozu-thead"><tr><th>Proyecto</th><th className="text-right">Cobrado</th><th className="text-right">Por Cobrar</th><th className="text-right">Vencido</th><th className="text-center">%</th></tr></thead>
              <tbody>
                {fin.collectedByProject.map(p => (
                  <tr key={p.project} className="sozu-table-row h-[52px]">
                    <td className="px-4 text-[13px] font-medium text-foreground">{p.project}</td>
                    <td className="px-4 text-right text-[13px] text-success font-semibold tabular-nums">{formatCurrency(p.collected)}</td>
                    <td className="px-4 text-right text-[13px] text-foreground tabular-nums">{formatCurrency(p.toCollect)}</td>
                    <td className="px-4 text-right text-[13px] text-danger font-semibold tabular-nums">{formatCurrency(p.overdue)}</td>
                    <td className="px-4 text-center text-[13px] font-semibold text-foreground tabular-nums">{Math.round((p.collected / (p.collected + p.toCollect)) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'operacion' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FinKPICard label="Casos Abiertos" value={String(8)} icon={Activity} />
            <FinKPICard label="Fuera de SLA" value={String(fueraSLA)} icon={Clock} variant="danger" />
            <FinKPICard label="CEPs Pendientes" value={String(cepsPending)} icon={CheckCircle2} />
            <FinKPICard label="Doc. Incompleta" value={String(docIncomplete)} icon={AlertTriangle} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {executives.map(exec => {
              const accts = mockAccounts.filter(a => a.assignedExecutive === exec);
              const overdue = accts.filter(a => a.overdueInstallments > 0).length;
              return (
                <div key={exec} className="sozu-kpi-card !p-4">
                  <h3 className="text-[14px] font-semibold text-foreground mb-2">{exec}</h3>
                  <div className="grid grid-cols-3 gap-3 text-[12px]">
                    <div><span className="text-muted-foreground">Total cuentas</span><p className="text-lg font-semibold text-foreground">{accts.length}</p></div>
                    <div><span className="text-muted-foreground">Con vencimiento</span><p className="text-lg font-semibold text-danger">{overdue}</p></div>
                    <div><span className="text-muted-foreground">Al corriente</span><p className="text-lg font-semibold text-success">{accts.length - overdue}</p></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FinKPICard({ label, value, icon: Icon, sub, trend, trendUp, variant, onClick }: {
  label: string; value: string; icon: React.ElementType; sub?: string; trend?: string;
  trendUp?: boolean; variant?: 'danger'; onClick?: () => void;
}) {
  return (
    <div className={cn('sozu-kpi-card !p-4', onClick && 'cursor-pointer hover:border-primary/30')} onClick={onClick}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('w-3.5 h-3.5', variant === 'danger' ? 'text-danger' : 'text-primary')} strokeWidth={1.75} />
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <p className={cn('text-lg font-semibold tabular-nums', variant === 'danger' ? 'text-danger' : 'text-foreground')}>{value}</p>
      {trend && <span className={cn('text-[11px] font-medium', trendUp ? 'text-success' : 'text-danger')}>{trend}</span>}
      {sub && !trend && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function AlertRow({ label, value, danger, onClick }: { label: string; value: string; danger?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between py-1 text-left hover:bg-muted/50 rounded px-1 -mx-1 transition-colors">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className={cn('text-[13px] font-semibold tabular-nums', danger ? 'text-danger' : 'text-foreground')}>{value}</span>
    </button>
  );
}
