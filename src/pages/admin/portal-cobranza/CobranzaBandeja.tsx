import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CobranzaProjectFilter } from '@/components/admin/portal-cobranza/CobranzaProjectFilter';
import { PriorityLegend } from '@/components/admin/portal-cobranza/PriorityLegend';
import { useBandejaOperativa, type BandejaCuenta } from '@/hooks/useBandejaOperativa';
import { useProyectosCobranza } from '@/hooks/useCobranzaDashboard';
import { formatCurrency } from '@/components/admin/portal-cobranza/StatusBadges';
import {
  Search, X, AlertTriangle, Loader2, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
import { SimplePagination } from '@/components/ui/simple-pagination';

type PriorityLevel = 'purple' | 'red_dark' | 'red' | 'yellow' | 'green' | 'blue' | 'gray';

const priorityConfig: Record<PriorityLevel, { bg: string; text: string; label: string; order: number }> = {
  gray: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Doc. incompleta', order: 0 },
  blue: { bg: 'bg-info-bg', text: 'text-info', label: 'Conciliación', order: 1 },
  purple: { bg: 'bg-priority-purple/15', text: 'text-priority-purple', label: 'Prelegal (90+)', order: 2 },
  red_dark: { bg: 'bg-danger-bg', text: 'text-danger', label: 'Vencida 3+ (60-89)', order: 3 },
  red: { bg: 'bg-danger-bg', text: 'text-danger', label: 'Vencida 2 (30-59)', order: 4 },
  yellow: { bg: 'bg-warning-bg', text: 'text-warning', label: 'Vencida 1 (1-29)', order: 5 },
  green: { bg: 'bg-success-bg', text: 'text-success', label: 'Al corriente', order: 6 },
};

function PriorityBadge({ priority }: { priority: PriorityLevel }) {
  const c = priorityConfig[priority];
  return <span className={cn('sozu-chip text-[10px] font-semibold whitespace-nowrap', c.bg, c.text)}>{c.label}</span>;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function BandejaOperativaPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [projectFilter, setProjectFilter] = useState<number | null>(() => {
    const p = searchParams.get('proyecto');
    return p ? Number(p) : null;
  });
  const [priorityFilter, setPriorityFilter] = useState<PriorityLevel | 'all'>(() =>
    (searchParams.get('prioridad') as PriorityLevel) || 'all'
  );
  const [soloVencidas, setSoloVencidas] = useState(() => searchParams.get('preset') === 'critical');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  const searchTimeout = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimeout[0]) clearTimeout(searchTimeout[0]);
    searchTimeout[0] = setTimeout(() => setDebouncedSearch(value), 400);
  }, [searchTimeout]);

  const { data: cuentas, isLoading, error } = useBandejaOperativa({
    proyectoId: projectFilter,
    search: debouncedSearch || undefined,
    soloVencidas,
  });
  const { data: proyectos } = useProyectosCobranza();

  useEffect(() => {
    if (projectFilter !== null && proyectos && !proyectos.some((project) => project.id === projectFilter)) {
      setProjectFilter(null);
    }
  }, [projectFilter, proyectos]);

  // Client-side priority filter
  const filtered = useMemo(() => {
    if (!cuentas) return [];
    let result = [...cuentas];
    if (priorityFilter !== 'all') result = result.filter(c => c.prioridad === priorityFilter);
    return result;
  }, [cuentas, priorityFilter]);

  const { paginated, page, setPage, totalPages, total, from, to } = usePagination(filtered, 50);

  const counts = useMemo(() => ({
    total: filtered.length,
    critical: filtered.filter(c => c.prioridad === 'purple' || c.prioridad === 'red_dark' || c.prioridad === 'red').length,
    pending: filtered.filter(c => c.prioridad === 'yellow').length,
    ok: filtered.filter(c => c.prioridad === 'green').length,
  }), [filtered]);

  const clearAllFilters = useCallback(() => {
    setProjectFilter(null);
    setPriorityFilter('all');
    setSoloVencidas(false);
    setSearchQuery('');
    setDebouncedSearch('');
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const hasFilters = projectFilter !== null || priorityFilter !== 'all' || soloVencidas || searchQuery;

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <AlertTriangle className="w-6 h-6 text-danger" />
        <span className="ml-2 text-danger text-sm">Error: {(error as Error)?.message}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-5">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="sozu-page-title">Bandeja Operativa</h1>
            <div className="flex items-center gap-3 mt-0.5 text-[13px]">
              <span className="text-muted-foreground">{counts.total} cuentas</span>
              <span className="text-danger font-medium">{counts.critical} críticas</span>
              <span className="text-warning font-medium">{counts.pending} seguimiento</span>
              <span className="text-success">{counts.ok} al corriente</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
            <input type="text" placeholder="Nombre del cliente, CLABE..." value={searchQuery} onChange={e => handleSearch(e.target.value)}
              className="w-full h-[38px] pl-9 pr-3 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all duration-150" />
          </div>
          <CobranzaProjectFilter
            projects={proyectos ?? []}
            value={projectFilter}
            onChange={setProjectFilter}
            className="w-[240px]"
          />
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as PriorityLevel | 'all')} className="sozu-filter-select">
            <option value="all">Prioridad</option>
            <option value="purple">3+ / Prelegal</option>
            <option value="red">2 vencidas</option>
            <option value="yellow">1 vencida</option>
            <option value="green">Al corriente</option>
          </select>
          <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={soloVencidas} onChange={e => setSoloVencidas(e.target.checked)} className="rounded border-border" />
            Solo vencidas
          </label>
          {hasFilters && (
            <button onClick={clearAllFilters}
              className="h-[38px] px-3 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg flex items-center gap-1.5 transition-colors duration-100">
              <X className="w-3.5 h-3.5" strokeWidth={1.75} /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Cargando cuentas...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <AlertTriangle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground mb-1">No se encontraron cuentas con estos filtros</p>
            {hasFilters && <button onClick={clearAllFilters} className="text-[13px] text-primary hover:underline">Limpiar filtros</button>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sozu-thead">
              <tr>
                <th className="w-[110px]">Prioridad</th>
                <th>Cliente</th>
                <th>Proyecto / Unidad</th>
                <th className="text-center">Precio</th>
                <th className="text-center">Vencido</th>
                <th className="text-center">Saldo Pendiente</th>
                <th className="text-center w-[60px]">Parc.</th>
                <th>Próx. Venc.</th>
                <th>CLABE</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((cuenta) => (
                <tr key={cuenta.cuenta_id} className="sozu-table-row h-[52px]">
                  <td className="px-3"><PriorityBadge priority={cuenta.prioridad} /></td>
                  <td className="px-3">
                    <p className="text-[13px] font-semibold text-foreground leading-snug truncate max-w-[200px]">
                      {cuenta.cliente_nombre || 'Sin cliente'}
                    </p>
                    {cuenta.cliente_email && (
                      <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{cuenta.cliente_email}</p>
                    )}
                  </td>
                  <td className="px-3">
                    <p className="text-[13px] text-foreground">{cuenta.proyecto || '—'}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {[cuenta.edificio, cuenta.numero_propiedad].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </td>
                  <td className="px-3 text-center text-[13px] text-foreground tabular-nums">
                    {cuenta.precio_final ? formatCurrency(cuenta.precio_final) : '—'}
                  </td>
                  <td className="px-3 text-center">
                    {cuenta.monto_vencido > 0
                      ? <span className="text-[13px] font-semibold text-danger tabular-nums">{formatCurrency(cuenta.monto_vencido)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 text-center text-[13px] text-foreground tabular-nums">
                    {cuenta.saldo_pendiente > 0 ? formatCurrency(cuenta.saldo_pendiente) : '—'}
                  </td>
                  <td className="px-3 text-center">
                    {cuenta.parcialidades_vencidas > 0
                      ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-danger-bg text-danger text-xs font-semibold">{cuenta.parcialidades_vencidas}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 text-[13px] text-muted-foreground tabular-nums">{formatDate(cuenta.proximo_vencimiento)}</td>
                  <td className="px-3 text-[11px] text-muted-foreground font-mono tracking-wide truncate max-w-[160px]">
                    {cuenta.clabe_stp || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <SimplePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          total={total}
          from={from}
          to={to}
        />
      </div>
    </div>
  );
}
