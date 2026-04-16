import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '@/components/admin/portal-cobranza/StatusBadges';
import { CobranzaProjectFilter } from '@/components/admin/portal-cobranza/CobranzaProjectFilter';
import { navigateWithFilters } from '@/lib/navigationFilters';
import { useCobranzaDashboard, useProyectosCobranza } from '@/hooks/useCobranzaDashboard';
import { useBandejaOperativa } from '@/hooks/useBandejaOperativa';
import { useEntidadesDuenos } from '@/hooks/useEntidadesDuenos';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  TrendingUp, AlertTriangle, CheckCircle2, DollarSign, Calendar,
  Target, ArrowUpRight, BarChart3, Building2, Shield, Zap, HardHat,
  Clock, Activity, Loader2, Layers, Users, FileCheck, Gavel,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts';
import { cn } from '@/lib/utils';

const periods = ['Este mes', 'Mes pasado', 'Últimos 3 meses', 'Año actual'] as const;
type Period = typeof periods[number];

function getPeriodDates(period: Period): { fechaInicio: string; fechaFin: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
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

const agingColors = ['hsl(142,71%,45%)', 'hsl(38,92%,50%)', 'hsl(0,84%,60%)', 'hsl(270,50%,45%)'];

export default function CobranzaDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('Este mes');
  const [activeTab, setActiveTab] = useState<DashTab>('resumen');
  const [selectedProyecto, setSelectedProyecto] = useState<number | null>(null);
  const [selectedEntidad, setSelectedEntidad] = useState<string>('');

  const { fechaInicio, fechaFin, label: periodLabel } = useMemo(() => getPeriodDates(period), [period]);

  const { data: proyectos } = useProyectosCobranza();
  const { data: entidades } = useEntidadesDuenos();

  const selectedEntidadIds = useMemo(() => {
    if (!selectedEntidad || !entidades) return null;
    const found = entidades.find(e => e.nombre_legal === selectedEntidad);
    return found ? found.er_ids : null;
  }, [selectedEntidad, entidades]);

  const { data: kpis, isLoading, error } = useCobranzaDashboard(selectedProyecto, fechaInicio, fechaFin, selectedEntidadIds);
  const { data: bandejaCuentas } = useBandejaOperativa({ proyectoId: selectedProyecto, soloVencidas: true });

  const clientesCriticos = useMemo(() => {
    if (!bandejaCuentas) return [];
    return bandejaCuentas
      .filter(c => c.prioridad === 'purple')
      .sort((a, b) => (b.monto_vencido ?? 0) - (a.monto_vencido ?? 0))
      .slice(0, 20);
  }, [bandejaCuentas]);

  const mesActual = periodLabel;

  const accessibleIds = useMemo(() => {
    if (!proyectos) return null;
    return new Set(proyectos.map((p: any) => p.id as number));
  }, [proyectos]);

  useEffect(() => {
    if (selectedProyecto !== null && accessibleIds && !accessibleIds.has(selectedProyecto)) {
      setSelectedProyecto(null);
    }
  }, [selectedProyecto, accessibleIds]);

  const filteredPorProyecto = useMemo(() => {
    if (!kpis?.por_proyecto) return [];
    if (!accessibleIds) return kpis.por_proyecto;
    return kpis.por_proyecto.filter(p => accessibleIds.has(p.proyecto_id));
  }, [kpis?.por_proyecto, accessibleIds]);

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

  // Risk by project for Riesgo tab
  const riskByProject = filteredPorProyecto
    .filter(p => p.vencido > 0)
    .sort((a, b) => b.vencido - a.vencido);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header + Filters */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="sozu-page-title">Control Tower</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Centro de inteligencia de cobranza · {mesActual}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedEntidad}
            onChange={e => setSelectedEntidad(e.target.value)}
            className="sozu-filter-select"
          >
            <option value="">Todas las entidades</option>
            {(entidades ?? []).map(e => (
              <option key={e.nombre_legal} value={e.nombre_legal}>{e.nombre_legal}</option>
            ))}
          </select>
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

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 border-b border-border pb-0">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn('flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium rounded-t-lg border-b-2 transition-colors duration-100',
              activeTab === tab.id ? 'border-b-primary text-primary bg-primary-muted/50' : 'border-b-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50')}>
            <tab.icon className="w-3.5 h-3.5" strokeWidth={1.75} />{tab.label}
          </button>
        ))}
      </div>

      {/* ════ TAB: RESUMEN EJECUTIVO ════ */}
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

      {/* ════ TAB: FLUJO Y OBRA ════ */}
      {activeTab === 'flujo' && (
        <div className="space-y-5">
          {/* KPIs placeholder row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <FinKPICard label="Cobrado Semana" value="—" icon={DollarSign} sub="Datos pendientes" />
            <FinKPICard label="Proyectado Semana" value="—" icon={Calendar} sub="Datos pendientes" />
            <FinKPICard label="Prov. Obra Semana" value="—" icon={HardHat} sub="Datos pendientes" />
            <FinKPICard label="Déficit Acumulado" value="—" icon={AlertTriangle} sub="Datos pendientes" />
            <FinKPICard label="Semanas Críticas" value="—" icon={Clock} sub="Datos pendientes" />
            <FinKPICard label="Flujo Neto Proy." value="—" icon={Target} sub="Datos pendientes" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <FinKPICard label="Presupuesto Obra" value="—" icon={HardHat} sub="Datos pendientes" />
            <FinKPICard label="Monto Erogado" value="—" icon={DollarSign} sub="Datos pendientes" />
            <FinKPICard label="Por Erogar" value="—" icon={BarChart3} sub="Datos pendientes" />
            <FinKPICard label="Avance Físico" value="—" icon={Activity} sub="Datos pendientes" />
            <FinKPICard label="Avance Financiero" value="—" icon={TrendingUp} sub="Datos pendientes" />
            <FinKPICard label="Diferencia Sem." value="—" icon={TrendingUp} sub="Datos pendientes" />
          </div>

          {/* Alerts + Priority Actions placeholder */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="sozu-kpi-card !p-5 border-l-4 border-l-danger">
              <h2 className="sozu-section-title flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-danger" strokeWidth={1.75} /> Alertas Ejecutivas
              </h2>
              <p className="text-[13px] text-muted-foreground">Los datos de alertas ejecutivas de obra se activarán cuando se integren las tablas de avance físico y financiero.</p>
            </div>

            <div className="sozu-kpi-card !p-5">
              <h2 className="sozu-section-title flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-primary" strokeWidth={1.75} /> Acciones Prioritarias
              </h2>
              <p className="text-[13px] text-muted-foreground">Las acciones prioritarias de obra se activarán cuando se integren los datos correspondientes.</p>
            </div>
          </div>

          {/* Avance Físico vs Financiero placeholder */}
          <div className="sozu-kpi-card !p-5">
            <h2 className="sozu-section-title flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-primary" strokeWidth={1.75} /> Avance Físico vs Financiero por Proyecto
            </h2>
            <p className="text-[13px] text-muted-foreground text-center py-6">
              Los datos de avance físico y financiero por proyecto aún no están disponibles. Esta sección se activará cuando se integren las tablas de obra.
            </p>
          </div>

          {/* Flujo Semanal Table placeholder */}
          <div className="sozu-kpi-card !p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <h2 className="sozu-section-title flex items-center gap-2">
                <HardHat className="w-4 h-4 text-primary" strokeWidth={1.75} /> Flujo Semanal vs Pagos de Obra (12 semanas)
              </h2>
              <span className="text-[11px] text-muted-foreground">Provisión configurable por semana</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sozu-thead">
                  <tr>
                    <th className="text-center w-[50px]">Sem.</th>
                    <th>Periodo</th>
                    <th className="text-right">Cobr. Proyectada</th>
                    <th className="text-right">Cobr. Real</th>
                    <th className="text-right">Diferencia</th>
                    <th className="text-right">Prov. Obra</th>
                    <th className="text-right">Requerido</th>
                    <th className="text-right">Déficit</th>
                    <th className="text-right">Déf. Acum.</th>
                    <th className="text-center">Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-[64px]">
                    <td colSpan={10} className="text-center text-[13px] text-muted-foreground">
                      Los datos de flujo semanal aún no están disponibles.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Proyección de Flujo placeholder */}
          <div className="sozu-kpi-card">
            <h2 className="sozu-section-title mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" strokeWidth={1.75} /> Proyección de Flujo de Efectivo (8 meses)
            </h2>
            <p className="text-[13px] text-muted-foreground text-center py-8">
              La proyección de flujo de efectivo se activará cuando se integren los datos de entradas y salidas.
            </p>
          </div>

          {/* Control por Proyecto placeholder */}
          <div className="sozu-kpi-card !p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="sozu-section-title flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" strokeWidth={1.75} /> Control por Proyecto
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sozu-thead">
                  <tr>
                    <th>Proyecto</th>
                    <th className="text-right">Presupuesto</th>
                    <th className="text-right">Erogado</th>
                    <th className="text-right">Por Erogar</th>
                    <th className="text-center">Av. Físico</th>
                    <th className="text-center">Av. Financ.</th>
                    <th className="text-right">Cobrado</th>
                    <th className="text-right">Vencido</th>
                    <th className="text-right">Flujo Req.</th>
                    <th className="text-center">Estatus</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-[64px]">
                    <td colSpan={10} className="text-center text-[13px] text-muted-foreground">
                      Los datos de control por proyecto aún no están disponibles.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════ TAB: RIESGO Y CARTERA ════ */}
      {activeTab === 'riesgo' && (
        <div className="space-y-5">
          {/* Semaphore row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <OpCard label="1 Parc. Vencida" value={String(cuentas1)} dotColor="bg-warning" onClick={() => drill(navigate, '/bandeja', { parcVencidas: '1' })} />
            <OpCard label="2 Parc. Vencidas" value={String(cuentas2)} dotColor="bg-danger" onClick={() => drill(navigate, '/bandeja', { parcVencidas: '2' })} />
            <OpCard label="3+ / Prelegal" value={String(cuentas3Plus)} dotColor="bg-priority-purple" onClick={() => drill(navigate, '/bandeja', { parcVencidas: '3plus' })} />
            <OpCard label="Promesas Vencidas" value="—" dotColor="bg-danger" />
            <OpCard label="CEPs Pendientes" value="—" dotColor="bg-warning" />
            <OpCard label="Doc. Incompleta" value="—" dotColor="bg-warning" />
            <OpCard label="PLD Alertas" value="—" dotColor="bg-danger" />
            <OpCard label="Legal / Prelegal" value="—" dotColor="bg-priority-purple" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Aging Chart */}
            {kpis.aging && kpis.aging.length > 0 && (
              <div className="sozu-kpi-card">
                <h2 className="sozu-section-title mb-4">Antigüedad de Cartera</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={kpis.aging.map(a => ({ range: `${a.rango} días`, amount: a.monto_sin_ce, amountCE: a.monto }))} barSize={32}>
                    <XAxis dataKey="range" tick={{ fontSize: 10, fill: 'hsl(220,9%,46%)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(220,9%,46%)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000000).toFixed(0)}M`} />
                    <Tooltip
                      formatter={(v: number, name: string) => [formatCurrency(v), name === 'amount' ? 'Sin CE' : 'Con CE']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(220,13%,91%)' }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]} name="Sin CE">
                      {kpis.aging.map((_, i) => (
                        <Cell key={i} fill={agingColors[i % agingColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Risk by Project */}
            <div className="sozu-kpi-card">
              <h2 className="sozu-section-title mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-danger" strokeWidth={1.75} /> Riesgo por Proyecto
              </h2>
              <div className="space-y-2">
                {riskByProject.length > 0 ? riskByProject.map((p) => (
                  <div key={p.proyecto_id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-background hover:bg-muted transition-colors cursor-pointer"
                    onClick={() => drill(navigate, '/bandeja', { proyecto: p.proyecto })}>
                    <div>
                      <span className="text-[13px] font-medium text-foreground">{p.proyecto}</span>
                    </div>
                    <span className="text-[14px] font-semibold text-danger tabular-nums">{formatCurrency(p.vencido)}</span>
                  </div>
                )) : (
                  <p className="text-[13px] text-muted-foreground text-center py-4">Sin datos de riesgo por proyecto</p>
                )}
              </div>
            </div>
          </div>

          {/* Critical Clients */}
          <div className="sozu-kpi-card !p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="sozu-section-title flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-danger" strokeWidth={1.75} /> Clientes Críticos (3+ vencidas)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sozu-thead">
                  <tr>
                    <th>ID Cuenta</th>
                    <th>Cliente</th>
                    <th>Proyecto</th>
                    <th className="text-center">Parc. Vencidas</th>
                    <th className="text-right">Monto Vencido</th>
                    <th>Estatus Legal</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-[64px]">
                    <td colSpan={6} className="text-center text-[13px] text-muted-foreground">
                      Los datos detallados de clientes críticos se activarán próximamente.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════ TAB: COBRANZA POR PROYECTO ════ */}
      {activeTab === 'cobranza' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Project */}
            <div className="sozu-kpi-card !p-0 overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="sozu-section-title flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" strokeWidth={1.75} /> Cobranza por Proyecto
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sozu-thead">
                    <tr>
                      <th>Proyecto</th>
                      <th className="text-right">Cobrado</th>
                      <th className="text-right">Por Cobrar</th>
                      <th className="text-right">Vencido</th>
                      <th className="text-right">Sin CEP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPorProyecto.length > 0 ? filteredPorProyecto.map(p => (
                      <tr key={p.proyecto_id} className="border-b border-border-light hover:bg-primary-muted/50 cursor-pointer h-[44px]"
                        onClick={() => drill(navigate, '/bandeja', { proyecto: p.proyecto })}>
                        <td className="px-4 text-[13px] font-medium text-foreground">{p.proyecto}</td>
                        <td className="px-4 text-right text-[13px] text-success font-medium tabular-nums">{formatCurrency(p.cobrado)}</td>
                        <td className="px-4 text-right text-[13px] text-foreground tabular-nums">{formatCurrency(p.pendiente)}</td>
                        <td className="px-4 text-right text-[13px] text-danger font-medium tabular-nums">{formatCurrency(p.vencido)}</td>
                        <td className="px-4 text-right text-[13px] text-warning tabular-nums">—</td>
                      </tr>
                    )) : (
                      <tr className="h-[64px]">
                        <td colSpan={5} className="text-center text-[13px] text-muted-foreground">Sin datos</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* By Legal Entity */}
            <div className="sozu-kpi-card !p-0 overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h2 className="sozu-section-title flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" strokeWidth={1.75} /> Cobranza por Entidad Legal
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sozu-thead">
                    <tr>
                      <th>Entidad Legal</th>
                      <th className="text-right">Cobrado</th>
                      <th className="text-right">Por Cobrar</th>
                      <th className="text-right">Vencido</th>
                      <th className="text-right">Sin CEP</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="h-[64px]">
                      <td colSpan={5} className="text-center text-[13px] text-muted-foreground">
                        Los datos de cobranza por entidad legal se activarán próximamente.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* By Charge Type */}
          <div className="sozu-kpi-card !p-0 overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h2 className="sozu-section-title flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" strokeWidth={1.75} /> Cobranza por Tipo de Cobro
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sozu-thead">
                  <tr>
                    <th>Tipo</th>
                    <th className="text-right">Cobrado</th>
                    <th className="text-right">Por Cobrar</th>
                    <th className="text-right">Vencido</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="h-[64px]">
                    <td colSpan={4} className="text-center text-[13px] text-muted-foreground">
                      Los datos de cobranza por tipo de cobro se activarán próximamente.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cobrado por Proyecto chart */}
            {filteredPorProyecto.length > 0 && (
              <div className="sozu-kpi-card">
                <h2 className="sozu-section-title mb-4">Cobrado por Proyecto</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={filteredPorProyecto} barSize={24} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(220,9%,46%)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
                    <YAxis type="category" dataKey="proyecto" tick={{ fontSize: 11, fill: 'hsl(220,15%,7%)' }} axisLine={false} tickLine={false} width={70} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(220,13%,91%)' }} />
                    <Bar dataKey="cobrado" fill="hsl(142,71%,45%)" radius={[0, 4, 4, 0]} name="Cobrado" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Resumen por Periodo */}
            <div className="sozu-kpi-card">
              <h2 className="sozu-section-title mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" strokeWidth={1.75} /> Resumen por Periodo
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sozu-thead">
                    <tr>
                      <th>Periodo</th>
                      <th className="text-right">Meta</th>
                      <th className="text-right">Cobrado</th>
                      <th className="text-right">Pendiente</th>
                      <th className="text-right">% Cumpl.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="h-[64px]">
                      <td colSpan={5} className="text-center text-[13px] text-muted-foreground">
                        Los datos de resumen por periodo se activarán próximamente.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ TAB: OPERACIÓN Y SLA ════ */}
      {activeTab === 'operacion' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
            <OpCard label="Casos Abiertos" value="—" dotColor="bg-info" />
            <OpCard label="Fuera SLA" value="—" dotColor="bg-danger" />
            <OpCard label="Conc. Pendientes" value="—" dotColor="bg-warning" />
            <OpCard label="CEPs Faltantes" value="—" dotColor="bg-warning" />
            <OpCard label="Doc. Incompleta" value="—" dotColor="bg-warning" />
            <OpCard label="100% Conciliado" value="—" dotColor="bg-success" />
            <OpCard label="Promesas Activas" value="—" dotColor="bg-info" />
            <OpCard label="Prom. Vencidas" value="—" dotColor="bg-danger" />
          </div>

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

/* ════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ════════════════════════════════════════════════════════════════ */

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

function OpCard({ label, value, dotColor, onClick }: { label: string; value: string; dotColor: string; onClick?: () => void }) {
  return (
    <div className={cn('sozu-kpi-card !p-4', onClick && 'cursor-pointer hover:shadow-md')} onClick={onClick}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />
        <span className="text-[11px] text-muted-foreground truncate">{label}</span>
      </div>
      <p className="font-semibold text-foreground tabular-nums text-xl">{value}</p>
    </div>
  );
}

function AlertRow({ label, value, danger, onClick }: { label: string; value: string; danger?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between py-1 text-left hover:bg-muted/50 rounded px-1 -mx-1 transition-colors w-full">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className={cn('text-[13px] font-semibold tabular-nums', danger ? 'text-danger' : 'text-foreground')}>{value}</span>
    </button>
  );
}
