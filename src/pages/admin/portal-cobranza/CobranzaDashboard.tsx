import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/components/admin/portal-cobranza/StatusBadges';
import { CobranzaProjectFilter } from '@/components/admin/portal-cobranza/CobranzaProjectFilter';
import { navigateWithFilters } from '@/lib/navigationFilters';
import { useCobranzaDashboard, useProyectosCobranza } from '@/hooks/useCobranzaDashboard';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  TrendingUp, AlertTriangle, CheckCircle2, DollarSign, Calendar,
  Target, ArrowUpRight, BarChart3, Building2, Shield, Zap, HardHat,
  Clock, Activity, Loader2,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';

const periods = ['Este mes', 'Mes pasado', 'Últimos 3 meses', 'Año actual'] as const;
type Period = typeof periods[number];

function getPeriodDates(period: Period): { fechaInicio: string; fechaFin: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const lastDay = (year: number, month: number) => new Date(year, month + 1, 0);

  switch (period) {
    case 'Mes pasado': {
      const start = new Date(y, m - 1, 1);
      const end = lastDay(y, m - 1);
      return { fechaInicio: fmt(start), fechaFin: fmt(end), label: format(start, 'MMMM yyyy', { locale: es }) };
    }
    case 'Últimos 3 meses': {
      const start = new Date(y, m - 2, 1);
      return { fechaInicio: fmt(start), fechaFin: fmt(now), label: 'Últimos 3 meses' };
    }
    case 'Año actual': {
      const start = new Date(y, 0, 1);
      return { fechaInicio: fmt(start), fechaFin: fmt(now), label: `Año ${y}` };
    }
    case 'Este mes':
    default: {
      const start = new Date(y, m, 1);
      const end = lastDay(y, m);
      return { fechaInicio: fmt(start), fechaFin: fmt(end), label: format(start, 'MMMM yyyy', { locale: es }) };
    }
  }
}

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
  const [period, setPeriod] = useState<Period>('Este mes');
  const [activeTab, setActiveTab] = useState<DashTab>('resumen');
  const [selectedProyecto, setSelectedProyecto] = useState<number | null>(null);

  const { fechaInicio, fechaFin, label: periodLabel } = useMemo(() => getPeriodDates(period), [period]);

  const { data: kpis, isLoading, error } = useCobranzaDashboard(selectedProyecto, fechaInicio, fechaFin);
  const { data: proyectos } = useProyectosCobranza();

  const mesActual = periodLabel;

  // Set of accessible project IDs (null = unrestricted)
  const accessibleIds = useMemo(() => {
    if (!proyectos) return null;
    return new Set(proyectos.map((p: any) => p.id as number));
  }, [proyectos]);

  useEffect(() => {
    if (selectedProyecto !== null && accessibleIds && !accessibleIds.has(selectedProyecto)) {
      setSelectedProyecto(null);
    }
  }, [selectedProyecto, accessibleIds]);

  // Filter por_proyecto to only show accessible projects
  const filteredPorProyecto = useMemo(() => {
    if (!kpis?.por_proyecto) return [];
    if (!accessibleIds) return kpis.por_proyecto;
    return kpis.por_proyecto.filter(p => accessibleIds.has(p.proyecto_id));
  }, [kpis?.por_proyecto, accessibleIds]);

  // Merge cobrado + programado mensual for chart
  const chartData = useMemo(() => {
    if (!kpis?.cobrado_mensual) return [];
    const programadoMap = new Map(
      (kpis.programado_mensual ?? []).map(p => [p.mes, p.programado])
    );
    return kpis.cobrado_mensual.map(c => ({
      month: c.mes,
      cobrado: c.cobrado,
      programado: programadoMap.get(c.mes) ?? 0,
    }));
  }, [kpis?.cobrado_mensual, kpis?.programado_mensual]);

  // Morosidad helpers
  const getMorosidad = (grupo: string) =>
    kpis?.morosidad?.find(m => m.grupo === grupo)?.cuentas ?? 0;

  const cuentas1 = getMorosidad('1_vencida');
  const cuentas2 = getMorosidad('2_vencidas');
  const cuentas3Plus = getMorosidad('3_plus');
  const totalMorosas = cuentas1 + cuentas2 + cuentas3Plus;

  const recoveryRate = kpis?.recovery_rate ?? 0;
  const cumplimiento = kpis && kpis.programado_mes > 0
    ? Math.round((kpis.cobrado_mes / kpis.programado_mes) * 100)
    : 0;
  const porCobrarMes = kpis?.por_cobrar_mes ?? 0;
  const porCobrarMesSinCe = kpis?.por_cobrar_mes_sin_ce ?? 0;

  const riskLevel = cuentas3Plus >= 100 ? 'Crítico' : cuentas3Plus >= 50 ? 'Alto riesgo' : totalMorosas > 200 ? 'Controlado con riesgo' : 'Controlado';
  const riskColor = cuentas3Plus >= 100 ? 'text-priority-purple' : cuentas3Plus >= 50 ? 'text-danger' : totalMorosas > 200 ? 'text-warning' : 'text-success';

  const priorityActions = kpis ? [
    { label: `Recuperar ${formatCurrency(kpis.vencido_total)} vencidos`, icon: DollarSign, color: 'text-danger', onClick: () => drill(navigate, '/bandeja', { preset: 'critical' }) },
    { label: `Atacar ${cuentas3Plus} cuentas críticas 3+`, icon: AlertTriangle, color: 'text-priority-purple', onClick: () => drill(navigate, '/bandeja', { preset: 'prelegal' }) },
    { label: `Cerrar ${formatCurrency(Math.max(porCobrarMes, 0))} para meta del mes`, icon: Target, color: 'text-warning', onClick: () => drill(navigate, '/pagos') },
    { label: `${cuentas2} cuentas con 2 parcialidades vencidas`, icon: Shield, color: 'text-info', onClick: () => drill(navigate, '/bandeja') },
  ] : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground text-sm">Cargando dashboard...</span>
      </div>
    );
  }

  if (error || !kpis) {
    return (
      <div className="flex items-center justify-center h-64">
        <AlertTriangle className="w-6 h-6 text-danger" />
        <span className="ml-2 text-danger text-sm">Error al cargar datos: {(error as Error)?.message}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="sozu-page-title">Control Tower</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Centro de inteligencia de cobranza · {mesActual}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value as Period)} className="sozu-filter-select">
            {periods.map(p => <option key={p}>{p}</option>)}
          </select>
          <CobranzaProjectFilter
            projects={proyectos ?? []}
            value={selectedProyecto}
            onChange={setSelectedProyecto}
            className="w-[300px]"
            popoverAlign="end"
          />
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
            <FinKPICard label={`Programado — ${period}`} value={formatCurrency(kpis.programado_mes_sin_ce)} icon={Calendar} sub="Sin contraentrega" secondaryValue={formatCurrency(kpis.programado_mes)} secondarySub="Con contraentrega" />
            <FinKPICard label={`Cobrado — ${period}`} value={formatCurrency(kpis.cobrado_mes)} icon={DollarSign} sub={periodLabel} />
            <FinKPICard label="% Cumplimiento" value={`${cumplimiento}%`} icon={Target} trend={cumplimiento >= 90 ? 'En meta' : 'Bajo meta'} trendUp={cumplimiento >= 90} />
            <FinKPICard label={`Por Cobrar — ${period}`} value={formatCurrency(Math.max(porCobrarMesSinCe, 0))} icon={BarChart3} sub="Sin contraentrega" secondaryValue={formatCurrency(Math.max(porCobrarMes, 0))} secondarySub="Con contraentrega" />
            <FinKPICard label="Saldo Vencido" value={formatCurrency(kpis.vencido_total_sin_ce)} icon={AlertTriangle} variant="danger" sub="Sin contraentrega" secondaryValue={formatCurrency(kpis.vencido_total)} secondarySub="Con contraentrega" onClick={() => drill(navigate, '/bandeja', { preset: 'critical' })} />
            <FinKPICard label="Recovery Rate" value={`${recoveryRate}%`} icon={TrendingUp} sub={periodLabel} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="sozu-kpi-card !p-5 border-l-4 border-l-danger">
              <h2 className="sozu-section-title flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-danger" strokeWidth={1.75} /> Alertas Clave
              </h2>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                <AlertRow label="Cartera vencida total" value={formatCurrency(kpis.vencido_total)} danger onClick={() => drill(navigate, '/bandeja', { preset: 'critical' })} />
                <AlertRow label="Cuentas 3+ parc." value={String(cuentas3Plus)} danger={cuentas3Plus > 0} onClick={() => drill(navigate, '/bandeja', { preset: 'prelegal' })} />
                <AlertRow label="Cuentas 2 parc." value={String(cuentas2)} danger={cuentas2 > 0} />
                <AlertRow label="Cuentas 1 parc." value={String(cuentas1)} danger={false} />
                <AlertRow label="Pendiente futuro" value={formatCurrency(kpis.pendiente_total)} />
                <AlertRow label="Cobrado histórico" value={formatCurrency(kpis.cobrado_total)} />
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

          {chartData.length > 0 && (
            <div className="sozu-kpi-card">
              <h2 className="sozu-section-title mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" strokeWidth={1.75} /> Cobrado vs Programado por Mes
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,91%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(220,9%,46%)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(220,9%,46%)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(220,13%,91%)' }} />
                  <Line type="monotone" dataKey="cobrado" stroke="hsl(142,71%,45%)" strokeWidth={2} dot={{ r: 3 }} name="Cobrado" />
                  <Line type="monotone" dataKey="programado" stroke="hsl(220,9%,46%)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="Programado" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {activeTab === 'flujo' && (
        <div className="space-y-5">
          <div className="sozu-kpi-card !p-8 text-center">
            <HardHat className="w-10 h-10 text-muted-foreground mx-auto mb-3" strokeWidth={1.25} />
            <h3 className="text-[15px] font-semibold text-foreground mb-1">Flujo y Obra</h3>
            <p className="text-[13px] text-muted-foreground max-w-md mx-auto">
              Los datos de provisión de obra y flujo semanal aún no están disponibles en la base de datos.
              Esta sección se activará cuando se integren las tablas de avance físico y financiero.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'riesgo' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FinKPICard label="1 Parc. Vencida" value={String(cuentas1)} icon={AlertTriangle} sub="Preventivo" />
            <FinKPICard label="2 Parc. Vencidas" value={String(cuentas2)} icon={AlertTriangle} variant="danger" />
            <FinKPICard label="3+ Parc. / Prelegal" value={String(cuentas3Plus)} icon={Shield} variant="danger" />
            <FinKPICard label="Total Morosas" value={String(totalMorosas)} icon={Shield} variant={totalMorosas > 200 ? 'danger' : undefined} />
          </div>
          {kpis.aging && kpis.aging.length > 0 && (
            <div className="sozu-kpi-card">
              <h2 className="sozu-section-title mb-3">Antigüedad de Cartera</h2>
              <div className="space-y-3">
                {kpis.aging.map(a => (
                  <div key={a.rango} className="flex items-center gap-4">
                    <span className="text-[13px] text-muted-foreground w-24">{a.rango} días</span>
                    <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-danger rounded-full"
                        style={{ width: `${kpis.vencido_total_sin_ce > 0 ? (a.monto_sin_ce / kpis.vencido_total_sin_ce) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="w-32 text-right" title={`Con contraentrega: ${formatCurrency(a.monto)}`}>
                      <span className="text-[13px] font-semibold text-foreground">{formatCurrency(a.monto_sin_ce)}</span>
                      <div className="text-[10px] text-muted-foreground/60 italic cursor-help">Con CE: {formatCurrency(a.monto)}</div>
                    </div>
                    <span className="text-[12px] text-muted-foreground w-20 text-right">{a.cantidad} parc.</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'cobranza' && (
        <div className="space-y-5">
          {filteredPorProyecto.length > 0 ? (
            <div className="sozu-kpi-card !p-0 overflow-hidden">
              <div className="px-5 py-3 border-b border-border"><h2 className="sozu-section-title">Cobranza por Proyecto</h2></div>
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[22%]" />
                  <col className="w-[22%]" />
                  <col className="w-[22%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead className="sozu-thead">
                  <tr>
                    <th className="px-4 text-left">Proyecto</th>
                    <th className="px-0"><div className="w-full text-center">Cobrado</div></th>
                    <th className="px-0"><div className="w-full text-center">Pendiente</div></th>
                    <th className="px-0"><div className="w-full text-center">Vencido</div></th>
                    <th className="px-0"><div className="w-full text-center">%</div></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPorProyecto.map(p => {
                    const total = p.cobrado + p.pendiente + p.vencido;
                    const pct = total > 0 ? Math.round((p.cobrado / total) * 100) : 0;
                    return (
                      <tr key={p.proyecto_id} className="sozu-table-row h-[52px]">
                        <td className="px-4 text-[13px] font-medium text-foreground">{p.proyecto}</td>
                        <td className="px-0"><div className="w-full text-center text-[13px] text-success font-semibold tabular-nums">{formatCurrency(p.cobrado)}</div></td>
                        <td className="px-0"><div className="w-full text-center text-[13px] text-foreground tabular-nums">{formatCurrency(p.pendiente)}</div></td>
                        <td className="px-0"><div className="w-full text-center text-[13px] text-danger font-semibold tabular-nums">{formatCurrency(p.vencido)}</div></td>
                        <td className="px-0"><div className="w-full text-center text-[13px] font-semibold text-foreground tabular-nums">{pct}%</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="sozu-kpi-card !p-8 text-center">
              <p className="text-muted-foreground text-sm">No hay datos de proyectos disponibles.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'operacion' && (
        <div className="space-y-5">
          <div className="sozu-kpi-card !p-8 text-center">
            <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" strokeWidth={1.25} />
            <h3 className="text-[15px] font-semibold text-foreground mb-1">Operación y SLA</h3>
            <p className="text-[13px] text-muted-foreground max-w-md mx-auto">
              No hay datos de ejecutivos asignados, SLA ni bitácora disponibles aún.
              Esta sección se activará cuando se integren las tablas correspondientes.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function FinKPICard({ label, value, icon: Icon, sub, trend, trendUp, variant, onClick, secondaryValue, secondarySub }: {
  label: string; value: string; icon: React.ElementType; sub?: string; trend?: string;
  trendUp?: boolean; variant?: 'danger'; onClick?: () => void;
  secondaryValue?: string; secondarySub?: string;
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
      {secondaryValue && (
        <div className="mt-1.5 pt-1.5 border-t border-border/50">
          <p className={cn('text-[13px] tabular-nums text-muted-foreground')}>{secondaryValue}</p>
          {secondarySub && <span className="text-[9px] text-muted-foreground/70">{secondarySub}</span>}
        </div>
      )}
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
