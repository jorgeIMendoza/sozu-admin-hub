import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CobranzaProjectFilter } from '@/components/admin/portal-cobranza/CobranzaProjectFilter';
import { useRelacionPagos, type PagoRecord } from '@/hooks/useRelacionPagos';
import { useProyectosCobranza } from '@/hooks/useCobranzaDashboard';
import { formatCurrency, formatDate } from '@/components/cobranza/StatusBadges';
import { ActiveFilterBanner } from '@/components/cobranza/ActiveFilterBanner';
import {
  Search, X, CheckCircle2, Clock, AlertTriangle, FileText, Link2, Eye,
  MessageSquare, DollarSign, Shield, ChevronLeft, ChevronRight, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 50;

const METODOS_PAGO = [
  'STP', 'Transferencia bancaria', 'Cheque', 'Efectivo',
  'Tarjeta de crédito', 'Tarjeta de débito', 'STP-manual', 'Cesión de derechos',
];

export default function RelacionPagosPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: proyectos } = useProyectosCobranza();
  const [projectFilter, setProjectFilter] = useState<number | null>(() => {
    const p = searchParams.get('proyecto');
    return p ? parseInt(p) : null;
  });
  const [metodoPagoFilter, setMetodoPagoFilter] = useState<string | null>(() => searchParams.get('metodo') || null);
  const [cepFilter, setCepFilter] = useState<boolean | null>(null);
  const [tipoCuentaFilter, setTipoCuentaFilter] = useState<'propiedad' | 'producto' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const { pagos, total, isLoading, error } = useRelacionPagos({
    proyectoId: projectFilter,
    metodoPago: metodoPagoFilter,
    search: searchQuery,
    hasCep: cepFilter,
    tipoCuenta: tipoCuentaFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  const clearAllFilters = useCallback(() => {
    setProjectFilter(null);
    setMetodoPagoFilter(null);
    setCepFilter(null);
    setTipoCuentaFilter(null);
    setSearchQuery('');
    setPage(1);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const hasFilters = projectFilter !== null || metodoPagoFilter !== null || cepFilter !== null || tipoCuentaFilter !== null || searchQuery;

  const formatCuenta = (id: number, tipo: 'propiedad' | 'producto' | null) => {
    const padded = String(id).padStart(6, '0');
    return tipo === 'producto' ? `CCP-${padded}` : `CC-${padded}`;
  };

  // Stats from current result set
  const totalAmount = useMemo(() => pagos.reduce((s, r) => s + Number(r.monto), 0), [pagos]);
  const conCep = useMemo(() => pagos.filter(r => r.tiene_cep).length, [pagos]);
  const sinCep = useMemo(() => pagos.filter(r => !r.tiene_cep).length, [pagos]);
  const aplicados = useMemo(() => pagos.filter(r => r.num_aplicaciones > 0).length, [pagos]);
  const sinAplicar = useMemo(() => pagos.filter(r => r.num_aplicaciones === 0).length, [pagos]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  useEffect(() => {
    if (projectFilter !== null && proyectos && !proyectos.some((project) => project.id === projectFilter)) {
      setProjectFilter(null);
      setPage(1);
    }
  }, [projectFilter, proyectos]);

  return (
    <div className="space-y-5 animate-fade-in -m-5">
      <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="sozu-page-title">Relación de Pagos</h1>
            <div className="flex items-center gap-3 mt-0.5 text-[13px]">
              <span className="text-muted-foreground">{total.toLocaleString()} pagos</span>
              {pagos.length > 0 && (
                <>
                  <span className="text-foreground font-medium">Página: {formatCurrency(totalAmount)}</span>
                  <span className="text-success font-medium">{conCep} con CEP</span>
                  <span className="text-warning font-medium">{sinCep} sin CEP</span>
                  <span className="text-primary font-medium">{aplicados} aplicados</span>
                  <span className="text-muted-foreground">{sinAplicar} sin aplicar</span>
                </>
              )}
            </div>
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
          <select value={cepFilter === null ? 'all' : cepFilter ? 'con' : 'sin'} onChange={e => { setCepFilter(e.target.value === 'all' ? null : e.target.value === 'con'); setPage(1); }} className="sozu-filter-select">
            <option value="all">CEP</option>
            <option value="con">Con CEP</option>
            <option value="sin">Sin CEP</option>
          </select>
          <select
            value={tipoCuentaFilter ?? 'all'}
            onChange={e => {
              const v = e.target.value;
              setTipoCuentaFilter(v === 'all' ? null : (v as 'propiedad' | 'producto'));
              setPage(1);
            }}
            className="sozu-filter-select"
          >
            <option value="all">Propiedad / Producto</option>
            <option value="propiedad">Propiedades</option>
            <option value="producto">Productos / Servicios</option>
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
      <div className="px-5 grid grid-cols-5 gap-3">
        <div className="sozu-kpi-card !p-4">
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} /><span className="text-[11px] text-muted-foreground">Total Pagos</span></div>
          <p className="text-lg font-semibold text-foreground tabular-nums">{total.toLocaleString()}</p>
        </div>
        <div className="sozu-kpi-card !p-4">
          <div className="flex items-center gap-1.5 mb-1"><DollarSign className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} /><span className="text-[11px] text-muted-foreground">Monto página</span></div>
          <p className="text-lg font-semibold text-foreground tabular-nums">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="sozu-kpi-card !p-4">
          <div className="flex items-center gap-1.5 mb-1"><CheckCircle2 className="w-3.5 h-3.5 text-success" strokeWidth={1.75} /><span className="text-[11px] text-muted-foreground">Con CEP</span></div>
          <p className="text-lg font-semibold text-success tabular-nums">{conCep}</p>
        </div>
        <div className="sozu-kpi-card !p-4">
          <div className="flex items-center gap-1.5 mb-1"><Clock className="w-3.5 h-3.5 text-warning" strokeWidth={1.75} /><span className="text-[11px] text-muted-foreground">Sin CEP</span></div>
          <p className="text-lg font-semibold text-warning tabular-nums">{sinCep}</p>
        </div>
        <div className="sozu-kpi-card !p-4">
          <div className="flex items-center gap-1.5 mb-1"><Shield className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} /><span className="text-[11px] text-muted-foreground">Aplicados</span></div>
          <p className="text-lg font-semibold text-primary tabular-nums">{aplicados}</p>
        </div>
      </div>

      <div className="px-5">
        <div className="sozu-kpi-card !p-0 overflow-hidden rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sozu-thead">
                <tr>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Proyecto</th>
                  <th>Método</th>
                  <th className="text-center">Monto</th>
                  <th>Clave rastreo</th>
                  <th>CLABE</th>
                  <th className="text-center">CEP</th>
                  <th className="text-center">Aplicado</th>
                  <th className="text-center w-[90px]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={10} className="text-center py-12">
                    <Loader2 className="w-6 h-6 text-muted-foreground animate-spin mx-auto" />
                  </td></tr>
                )}
                {error && (
                  <tr><td colSpan={10} className="text-center py-12">
                    <AlertTriangle className="w-6 h-6 text-danger mx-auto mb-2" />
                    <p className="text-sm text-danger">{error}</p>
                  </td></tr>
                )}
                {!isLoading && !error && pagos.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-12">
                    <DollarSign className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No se encontraron pagos</p>
                  </td></tr>
                )}
                {!isLoading && pagos.map(r => (
                  <tr key={r.pago_id} className="sozu-table-row h-[52px]">
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
                      {r.tiene_cep ? (
                        r.url_cep ? (
                          <a
                            href={r.url_cep}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="CEP disponible — Clic para abrir el comprobante"
                            className="inline-flex items-center justify-center p-1 rounded-md hover:bg-success/10 transition-colors"
                          >
                            <CheckCircle2 className="w-4 h-4 text-success" strokeWidth={1.75} />
                          </a>
                        ) : (
                          <span title="CEP registrado (sin enlace disponible)">
                            <CheckCircle2 className="w-4 h-4 text-success mx-auto" strokeWidth={1.75} />
                          </span>
                        )
                      ) : (
                        <span title="CEP pendiente — aún no se ha generado el comprobante">
                          <Clock className="w-4 h-4 text-warning mx-auto" strokeWidth={1.75} />
                        </span>
                      )}
                    </td>
                    <td className="px-4 text-center">
                      {r.num_aplicaciones > 0 ? (
                        <span
                          className="sozu-chip bg-success-bg text-success text-[10px] cursor-help"
                          title={`Aplicado a ${r.num_aplicaciones} ${r.num_aplicaciones === 1 ? 'parcialidad' : 'parcialidades'} · Monto total aplicado: ${formatCurrency(Number(r.monto_aplicado))}`}
                        >
                          {r.num_aplicaciones} {r.num_aplicaciones === 1 ? 'parc.' : 'parcs.'} · {formatCurrency(Number(r.monto_aplicado))}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground" title="Pago sin aplicar a parcialidades">—</span>
                      )}
                    </td>
                    <td className="px-4">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          className="p-1.5 rounded-md hover:bg-muted transition-colors duration-100"
                          title="Ver expediente de la cuenta"
                          onClick={() => navigate(`/cuenta/${r.id_cuenta_cobranza}`)}
                        >
                          <Eye className="w-[14px] h-[14px] text-muted-foreground" strokeWidth={1.75} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
        </div>
      </div>
    </div>
  );
}
