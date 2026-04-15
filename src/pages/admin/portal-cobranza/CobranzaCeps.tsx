import { useState, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useRelacionPagos, type PagoRecord } from '@/hooks/useRelacionPagos';
import { useProyectosCobranza } from '@/hooks/useCobranzaDashboard';
import { formatCurrency, formatDate } from '@/components/cobranza/StatusBadges';
import { ActiveFilterBanner } from '@/components/cobranza/ActiveFilterBanner';
import {
  Search, X, FileCheck, Upload, Eye, UserCheck, Clock, AlertTriangle,
  CheckCircle2, FileX, Loader2, DollarSign, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 100;

const METODOS_PAGO = [
  'STP', 'Transferencia bancaria', 'Cheque', 'Efectivo',
  'Tarjeta de crédito', 'Tarjeta de débito', 'STP-manual', 'Cesión de derechos',
];

export default function CEPsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: PROYECTOS = [] } = useProyectosCobranza();
  const [projectFilter, setProjectFilter] = useState<number | null>(() => {
    const p = searchParams.get('proyecto');
    return p ? parseInt(p) : null;
  });
  const [metodoPagoFilter, setMetodoPagoFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCEP, setSelectedCEP] = useState<PagoRecord | null>(null);

  // Always filter for payments WITHOUT CEP
  const { pagos, total, isLoading, error } = useRelacionPagos({
    proyectoId: projectFilter,
    metodoPago: metodoPagoFilter,
    search: searchQuery,
    hasCep: false,
    page,
    pageSize: PAGE_SIZE,
  });

  const clearAllFilters = useCallback(() => {
    setProjectFilter(null);
    setMetodoPagoFilter(null);
    setSearchQuery('');
    setPage(1);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const hasFilters = projectFilter !== null || metodoPagoFilter !== null || searchQuery;
  const totalAmount = useMemo(() => pagos.reduce((s, r) => s + Number(r.monto), 0), [pagos]);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Group by proyecto for quick stats
  const byProyecto = useMemo(() => {
    const map: Record<string, { count: number; amount: number }> = {};
    pagos.forEach(r => {
      const key = r.proyecto || 'Sin proyecto';
      if (!map[key]) map[key] = { count: 0, amount: 0 };
      map[key].count++;
      map[key].amount += Number(r.monto);
    });
    return map;
  }, [pagos]);

  return (
    <div className="flex h-full -m-5">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-3 space-y-3">
          <div>
            <h1 className="sozu-page-title">CEPs Pendientes</h1>
            <div className="flex items-center gap-3 mt-0.5 text-[13px]">
              <span className="text-warning font-medium">{total.toLocaleString()} pagos sin CEP</span>
              {pagos.length > 0 && (
                <span className="text-muted-foreground">Página: {formatCurrency(totalAmount)}</span>
              )}
              {Object.entries(byProyecto).map(([proy, d]) => (
                <span key={proy} className="text-muted-foreground">{proy}: {d.count}</span>
              ))}
            </div>
          </div>
          <ActiveFilterBanner onClear={clearAllFilters} />
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
              <input type="text" placeholder="Nombre, CLABE o clave rastreo..." value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                className="w-full h-[38px] pl-9 pr-3 text-sm bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all duration-150" />
            </div>
            <select value={projectFilter ?? 'all'} onChange={e => { setProjectFilter(e.target.value === 'all' ? null : parseInt(e.target.value)); setPage(1); }} className="sozu-filter-select">
              <option value="all">Proyecto</option>
              {PROYECTOS.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <select value={metodoPagoFilter ?? 'all'} onChange={e => { setMetodoPagoFilter(e.target.value === 'all' ? null : e.target.value); setPage(1); }} className="sozu-filter-select">
              <option value="all">Método de pago</option>
              {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {hasFilters && (
              <button onClick={clearAllFilters}
                className="h-[38px] px-3 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg flex items-center gap-1.5 transition-colors duration-100">
                <X className="w-3.5 h-3.5" strokeWidth={1.75} /> Limpiar
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="text-center py-16">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin mx-auto" />
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <AlertTriangle className="w-6 h-6 text-danger mx-auto mb-2" />
              <p className="text-sm text-danger">{error}</p>
            </div>
          ) : pagos.length === 0 ? (
            <div className="text-center py-16">
              <FileCheck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground mb-1">No se encontraron CEPs pendientes</p>
              {hasFilters && <button onClick={clearAllFilters} className="text-[13px] text-primary hover:underline">Limpiar filtros</button>}
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="sozu-thead">
                  <tr>
                    <th>Fecha Pago</th>
                    <th>Cliente</th>
                    <th>Proyecto</th>
                    <th>Método</th>
                    <th className="text-right">Monto</th>
                    <th>Clave rastreo</th>
                    <th>CLABE</th>
                    <th className="text-center">Aplicado</th>
                  </tr>
                </thead>
                <tbody>
                  {pagos.map(r => (
                    <tr key={r.pago_id} className={cn('sozu-table-row h-[52px] cursor-pointer', selectedCEP?.pago_id === r.pago_id && 'bg-primary-muted')}
                      onClick={() => setSelectedCEP(r)}>
                      <td className="px-4 text-[13px] text-muted-foreground tabular-nums whitespace-nowrap">{formatDate(r.fecha_pago)}</td>
                      <td className="px-4">
                        <p className="text-[13px] font-medium text-foreground truncate max-w-[180px]">{r.cliente || 'Sin identificar'}</p>
                        {r.num_propiedad && <p className="text-[11px] text-muted-foreground">Prop. {r.num_propiedad}</p>}
                      </td>
                      <td className="px-4 text-[13px] text-foreground">{r.proyecto || '—'}</td>
                      <td className="px-4">
                        <span className={cn('sozu-chip text-[10px]',
                          r.metodo_pago === 'STP' ? 'bg-info/10 text-info' :
                          r.metodo_pago === 'Transferencia bancaria' ? 'bg-primary/10 text-primary' :
                          'bg-muted text-muted-foreground'
                        )}>{r.metodo_pago || '—'}</span>
                      </td>
                      <td className="px-4 text-right text-[13px] font-semibold text-foreground tabular-nums">{formatCurrency(Number(r.monto))}</td>
                      <td className="px-4 font-mono text-[11px] text-muted-foreground truncate max-w-[160px]">{r.clave_rastreo || '—'}</td>
                      <td className="px-4 font-mono text-[11px] text-muted-foreground truncate max-w-[140px]">{r.clabe_stp || '—'}</td>
                      <td className="px-4 text-center">
                        {r.num_aplicaciones > 0
                          ? <span className="sozu-chip bg-success-bg text-success text-[10px]">{r.num_aplicaciones}</span>
                          : <span className="text-[11px] text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-[12px] text-muted-foreground">
                    Mostrando {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} de {total.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-1">
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                      className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 transition-colors">
                      <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                    <span className="text-[12px] text-muted-foreground px-2">Pág. {page} / {totalPages}</span>
                    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                      className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30 transition-colors">
                      <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedCEP && (
        <div className="w-[380px] shrink-0 bg-card border-l border-border flex flex-col animate-slide-in-right">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h3 className="text-[14px] font-semibold text-foreground">Detalle CEP Pendiente</h3>
            <button onClick={() => setSelectedCEP(null)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><X className="w-4 h-4" strokeWidth={1.75} /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <span className="sozu-chip bg-warning-bg text-warning">Sin CEP</span>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              <InfoItem label="Cliente" value={selectedCEP.cliente || 'Sin identificar'} />
              <InfoItem label="Proyecto" value={selectedCEP.proyecto || '—'} />
              <InfoItem label="Cuenta" value={String(selectedCEP.id_cuenta_cobranza)} />
              <InfoItem label="Monto" value={formatCurrency(Number(selectedCEP.monto))} />
              <InfoItem label="Clave rastreo" value={selectedCEP.clave_rastreo || '—'} />
              <InfoItem label="Fecha Pago" value={formatDate(selectedCEP.fecha_pago)} />
              <InfoItem label="Método" value={selectedCEP.metodo_pago || '—'} />
              <InfoItem label="CLABE" value={selectedCEP.clabe_stp || '—'} />
              <InfoItem label="Propiedad" value={selectedCEP.num_propiedad || '—'} />
              <InfoItem label="Aplicaciones" value={selectedCEP.num_aplicaciones > 0 ? `${selectedCEP.num_aplicaciones} (${formatCurrency(Number(selectedCEP.monto_aplicado))})` : 'Sin aplicar'} />
            </div>
            {selectedCEP.descripcion && (
              <div>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Descripción</p>
                <p className="text-[13px] text-muted-foreground">{selectedCEP.descripcion}</p>
              </div>
            )}
            <div className="pt-1 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Acciones</p>
              <div className="grid grid-cols-2 gap-1.5">
                <ActionBtn icon={Upload} label="Adjuntar CEP" />
                <ActionBtn icon={FileCheck} label="Marcar validado" variant="success" />
                <ActionBtn icon={Eye} label="Ver expediente" onClick={() => navigate(`/cuenta/${selectedCEP.id_cuenta_cobranza}`)} />
                <ActionBtn icon={FileX} label="No aplica" variant="destructive" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className="text-[13px] font-medium text-foreground break-all">{value}</p></div>;
}

function ActionBtn({ icon: Icon, label, variant, onClick }: { icon: React.ElementType; label: string; variant?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={cn('flex items-center gap-2 px-3 py-2 rounded-md text-[12px] font-medium transition-colors duration-100',
      variant === 'destructive' ? 'bg-danger-bg text-danger hover:bg-danger/10' :
      variant === 'success' ? 'bg-success-bg text-success hover:bg-success/10' :
      'bg-muted hover:bg-border text-foreground')}>
      <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />{label}
    </button>
  );
}
