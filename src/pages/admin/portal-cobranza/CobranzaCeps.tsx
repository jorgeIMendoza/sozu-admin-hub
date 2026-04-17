import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CobranzaProjectFilter } from '@/components/admin/portal-cobranza/CobranzaProjectFilter';
import { useRelacionPagos, type PagoRecord } from '@/hooks/useRelacionPagos';
import { useProyectosCobranza } from '@/hooks/useCobranzaDashboard';
import { formatCurrency, formatDate } from '@/components/cobranza/StatusBadges';
import { ActiveFilterBanner } from '@/components/cobranza/ActiveFilterBanner';
import { AddCepDialog } from '@/components/admin/AddCepDialog';
import {
  Search, X, FileCheck, Upload, Eye, AlertTriangle,
  Loader2, DollarSign, ChevronLeft, ChevronRight, Clock, Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

const METODOS_PAGO = ['STP', 'STP-manual', 'Transferencia bancaria'];

function formatWithThousands(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCompactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${formatWithThousands(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${formatWithThousands(n / 1_000)}K`;
  return n.toLocaleString();
}

function formatCompactCurrency(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${formatWithThousands(n / 1_000_000)}M`;
  if (abs >= 1_000) return `$${formatWithThousands(n / 1_000)}K`;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CEPsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: proyectos } = useProyectosCobranza();
  const [projectFilter, setProjectFilter] = useState<number | null>(() => {
    const p = searchParams.get('proyecto');
    return p ? parseInt(p) : null;
  });
  const [metodoPagoFilter, setMetodoPagoFilter] = useState<string | null>(null);
  const [aplicacionFilter, setAplicacionFilter] = useState<'aplicados' | 'sin_aplicar' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCEP, setSelectedCEP] = useState<PagoRecord | null>(null);
  const [cepDialogOpen, setCepDialogOpen] = useState(false);

  // Always filter for payments WITHOUT CEP
  const {
    pagos,
    total,
    totalMonto,
    totalSinAplicar,
    totalAplicados,
    isLoading,
    error,
  } = useRelacionPagos({
    proyectoId: projectFilter,
    metodoPago: metodoPagoFilter,
    metodosPermitidos: METODOS_PAGO,
    search: searchQuery,
    hasCep: false,
    page,
    pageSize: PAGE_SIZE,
  });

  const filteredPagos = useMemo(() => {
    if (!aplicacionFilter) return pagos;
    if (aplicacionFilter === 'aplicados') return pagos.filter(p => p.num_aplicaciones > 0);
    return pagos.filter(p => p.num_aplicaciones === 0);
  }, [pagos, aplicacionFilter]);

  const clearAllFilters = useCallback(() => {
    setProjectFilter(null);
    setMetodoPagoFilter(null);
    setAplicacionFilter(null);
    setSearchQuery('');
    setPage(1);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const hasFilters = projectFilter !== null || metodoPagoFilter !== null || aplicacionFilter !== null || searchQuery;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  useEffect(() => {
    if (projectFilter !== null && proyectos && !proyectos.some((project) => project.id === projectFilter)) {
      setProjectFilter(null);
      setPage(1);
    }
  }, [projectFilter, proyectos]);

  const handleCepDialogClose = () => {
    setCepDialogOpen(false);
    // Refresh the list after CEP added
    queryClient.invalidateQueries({ queryKey: ['relacion-pagos'] });
    setSelectedCEP(null);
  };

  return (
    <div className="space-y-5 animate-fade-in -m-5">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-3 space-y-3">
        <div>
          <h1 className="sozu-page-title">CEPs Pendientes</h1>
          <div className="flex items-center gap-3 mt-0.5 text-[13px]">
            <span className="text-warning font-medium">{total.toLocaleString()} pagos sin CEP</span>
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
          <CobranzaProjectFilter
            projects={proyectos ?? []}
            value={projectFilter}
            onChange={(value) => {
              setProjectFilter(value);
              setPage(1);
            }}
            allLabel="Proyecto"
            className="w-[240px]"
          />
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

      {/* Summary cards */}
      <div className="px-5 grid grid-cols-4 gap-3">
        <div className="sozu-kpi-card !p-4">
          <div className="flex items-center gap-1.5 mb-1"><Clock className="w-3.5 h-3.5 text-warning" strokeWidth={1.75} /><span className="text-[11px] text-muted-foreground">Pagos sin CEP</span></div>
          <p className="text-lg font-semibold text-warning tabular-nums" title={total.toLocaleString()}>{formatCompactNumber(total)}</p>
        </div>
        <div className="sozu-kpi-card !p-4">
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} /><span className="text-[11px] text-muted-foreground">Monto total</span></div>
          <p className="text-lg font-semibold text-foreground tabular-nums" title={formatCurrency(totalMonto)}>{formatCompactCurrency(totalMonto)}</p>
        </div>
        <button
          type="button"
          onClick={() => { setAplicacionFilter(prev => prev === 'aplicados' ? null : 'aplicados'); setPage(1); }}
          className={cn('sozu-kpi-card !p-4 text-left transition-all hover:shadow-md cursor-pointer',
            aplicacionFilter === 'aplicados' && 'ring-2 ring-primary border-primary')}>
          <div className="flex items-center gap-1.5 mb-1"><Shield className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} /><span className="text-[11px] text-muted-foreground">Aplicados</span></div>
          <p className="text-lg font-semibold text-primary tabular-nums" title={totalAplicados.toLocaleString()}>{formatCompactNumber(totalAplicados)}</p>
        </button>
        <button
          type="button"
          onClick={() => { setAplicacionFilter(prev => prev === 'sin_aplicar' ? null : 'sin_aplicar'); setPage(1); }}
          className={cn('sozu-kpi-card !p-4 text-left transition-all hover:shadow-md cursor-pointer',
            aplicacionFilter === 'sin_aplicar' && 'ring-2 ring-danger border-danger')}>
          <div className="flex items-center gap-1.5 mb-1"><AlertTriangle className="w-3.5 h-3.5 text-danger" strokeWidth={1.75} /><span className="text-[11px] text-danger">Sin aplicar</span></div>
          <p className="text-lg font-semibold text-danger tabular-nums" title={totalSinAplicar.toLocaleString()}>{formatCompactNumber(totalSinAplicar)}</p>
        </button>
      </div>

      <div className="flex h-full px-5 gap-5">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="sozu-kpi-card !p-0 overflow-hidden rounded-xl">
            <div className="overflow-x-auto">
              {isLoading ? (
                <div className="text-center py-16">
                  <Loader2 className="w-6 h-6 text-muted-foreground animate-spin mx-auto" />
                </div>
              ) : error ? (
                <div className="text-center py-16">
                  <AlertTriangle className="w-6 h-6 text-danger mx-auto mb-2" />
                  <p className="text-sm text-danger">{error}</p>
                </div>
              ) : filteredPagos.length === 0 ? (
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
                        <th className="text-center">Monto</th>
                        <th>Clave rastreo</th>
                        <th>CLABE</th>
                        <th className="text-center" title="Número de aplicaciones del pago a acuerdos de pago">Aplicaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPagos.map(r => {
                        const sinAplicar = r.num_aplicaciones === 0;
                        return (
                        <tr key={r.pago_id} className={cn('sozu-table-row h-[52px] cursor-pointer',
                          selectedCEP?.pago_id === r.pago_id && 'bg-primary-muted',
                          sinAplicar && 'border-l-2 border-l-danger bg-danger/[0.03] hover:bg-danger/[0.06]')}
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
                          <td className="px-4 text-center text-[13px] font-semibold text-foreground tabular-nums">{formatCurrency(Number(r.monto))}</td>
                          <td className="px-4 font-mono text-[11px] text-muted-foreground truncate max-w-[160px]">{r.clave_rastreo || '—'}</td>
                          <td className="px-4 font-mono text-[11px] text-muted-foreground truncate max-w-[140px]">{r.clabe_stp || '—'}</td>
                          <td className="px-4 text-center">
                            {r.num_aplicaciones > 0
                              ? <span className="sozu-chip bg-success-bg text-success text-[10px]" title={`${r.num_aplicaciones} aplicación(es) — Total aplicado: ${formatCurrency(Number(r.monto_aplicado))}`}>{r.num_aplicaciones}</span>
                              : <span className="sozu-chip bg-danger/10 text-danger text-[10px]" title="Pago sin aplicar a ningún acuerdo">Sin aplicar</span>}
                          </td>
                        </tr>
                        );
                      })}
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
        </div>

        {/* Detail panel */}
        {selectedCEP && (
          <div className={cn('w-[380px] shrink-0 bg-card border rounded-xl flex flex-col animate-slide-in-right self-start sticky top-[180px]',
            selectedCEP.num_aplicaciones === 0 ? 'border-danger/40' : 'border-border')}>
            <div className={cn('flex items-center justify-between px-5 py-3 border-b',
              selectedCEP.num_aplicaciones === 0 ? 'border-danger/30 bg-danger/[0.04]' : 'border-border')}>
              <h3 className="text-[14px] font-semibold text-foreground">Detalle CEP Pendiente</h3>
              <button onClick={() => setSelectedCEP(null)} className="p-1.5 rounded-md hover:bg-muted transition-colors"><X className="w-4 h-4" strokeWidth={1.75} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="sozu-chip bg-warning-bg text-warning">Sin CEP</span>
                {selectedCEP.num_aplicaciones === 0 && (
                  <span className="sozu-chip bg-danger/10 text-danger">Sin aplicar</span>
                )}
              </div>
              {selectedCEP.num_aplicaciones === 0 && (
                <div className="rounded-md border border-danger/30 bg-danger/[0.06] px-3 py-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-danger" strokeWidth={1.75} />
                    <p className="text-[11px] font-semibold text-danger uppercase tracking-wider">Pago no aplicado — motivo</p>
                  </div>
                  <p className="text-[12px] text-foreground leading-relaxed">
                    {selectedCEP.descripcion?.trim() || 'Este pago aún no se ha asociado a ningún acuerdo de pago. No hay descripción registrada que indique el motivo.'}
                  </p>
                </div>
              )}
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
              {selectedCEP.descripcion && selectedCEP.num_aplicaciones > 0 && (
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Descripción</p>
                  <p className="text-[13px] text-muted-foreground">{selectedCEP.descripcion}</p>
                </div>
              )}
              <div className="pt-1 space-y-2">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Acciones</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <ActionBtn icon={Upload} label="Adjuntar CEP" onClick={() => setCepDialogOpen(true)} />
                  <ActionBtn icon={Eye} label="Ver expediente" onClick={() => navigate(`/cuenta/${selectedCEP.id_cuenta_cobranza}`)} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedCEP && (
        <AddCepDialog
          open={cepDialogOpen}
          onClose={handleCepDialogClose}
          paymentId={selectedCEP.pago_id}
          cuentaCobranzaId={selectedCEP.id_cuenta_cobranza}
        />
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
