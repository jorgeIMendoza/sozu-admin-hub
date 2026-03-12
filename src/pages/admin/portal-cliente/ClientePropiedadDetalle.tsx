import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, Check, FileText, Clock, CreditCard, Package, Calendar, AlertTriangle, ChevronRight, ChevronDown, ChevronUp, Download, Loader2 } from "lucide-react";
import { useClientePropiedadDetalle } from "@/hooks/useClientePropiedadDetalle";
import { useClienteResumenFinanciero } from "@/hooks/useClienteResumenFinanciero";
import { fmtMXN as fmt } from "@/lib/clienteMockData";
import { estadoCuentaEdgeFunctionService } from "@/services/estadoCuentaEdgeFunctionService";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useClienteImpersonation } from "@/contexts/ClienteImpersonationContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";


/* ── Investment process steps mapped to estatus_disponibilidad ── */
const PROCESS_STEPS = [
  { label: "Preventa", statusIds: [4] },
  { label: "Pago Final", statusIds: [5] },
  { label: "Escrituración", statusIds: [7] },
  { label: "Entrega", statusIds: [8] },
  { label: "Post-Entrega", statusIds: [9] },
];

function getCompletedStepIndex(estatusId: number): number {
  for (let i = PROCESS_STEPS.length - 1; i >= 0; i--) {
    if (PROCESS_STEPS[i].statusIds.includes(estatusId)) return i;
  }
  if (estatusId >= 5) return 0;
  return -1;
}

const fmtDate = (d: string) => {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
};

/* ── Product payment detail interfaces ── */
interface ProductPagoRow {
  id: number;
  fecha_pago: string;
  monto: number;
  metodo: string;
  clave_rastreo: string | null;
  url_cep: string | null;
}

const ClientePropiedadDetalle = () => {
  const { cuentaId } = useParams<{ cuentaId: string }>();
  const navigate = useNavigate();
  const { data: prop, isLoading } = useClientePropiedadDetalle(cuentaId ? Number(cuentaId) : null);
  const [generatingEdoCuenta, setGeneratingEdoCuenta] = useState(false);
  const [showValueBreakdown, setShowValueBreakdown] = useState(false);
  const [showAppreciationBreakdown, setShowAppreciationBreakdown] = useState(false);
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [showPendingMaintenance, setShowPendingMaintenance] = useState(false);
  const [showPendingParcialidades, setShowPendingParcialidades] = useState(false);

  // Get resumen for breakdown across all properties
  const { profile } = useAuth();
  const { impersonatedClientePersonaId, isImpersonating } = useClienteImpersonation();
  const effectivePersonaId = isImpersonating ? impersonatedClientePersonaId : profile?.id_persona;
  const { data: resumen } = useClienteResumenFinanciero(effectivePersonaId);


  const handleDownloadEdoCuenta = async () => {
    if (!prop) return;
    setGeneratingEdoCuenta(true);
    try {
      await estadoCuentaEdgeFunctionService.generateEstadoCuenta({ id_cuenta: prop.cuentaId });
      toast.success("Estado de cuenta generado");
    } catch {
      toast.error("Error al generar estado de cuenta");
    } finally {
      setGeneratingEdoCuenta(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!prop) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Regresar
        </button>
        <p className="text-muted-foreground">No se encontró la propiedad.</p>
      </div>
    );
  }

  const progress = prop.precioFinal > 0 ? Math.min(100, (prop.totalPaid / prop.precioFinal) * 100) : 0;
  const completedStep = getCompletedStepIndex(prop.estatusPropiedad);

  const statusBadge = (() => {
    switch (prop.estatusPropiedad) {
      case 4: return { label: "Apartado", color: "bg-amber-500/15 text-amber-600" };
      case 5: return { label: "Vendido", color: "bg-blue-500/15 text-blue-600" };
      case 7: return { label: "Escrituración", color: "bg-purple-500/15 text-purple-600" };
      case 8: return { label: "Entregada", color: "bg-[hsl(var(--inmob-green))]/20 text-[hsl(var(--inmob-green))]" };
      case 9: return { label: "Pagada", color: "bg-[hsl(var(--inmob-green))]/20 text-[hsl(var(--inmob-green))]" };
      default: return { label: prop.estatusNombre, color: "bg-muted text-muted-foreground" };
    }
  })();

  const maintenanceOverdue = prop.mantenimientosAtrasados > 0;
  const nextMaintenanceFormatted = prop.proximoMantenimiento
    ? new Date(prop.proximoMantenimiento + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const paidMaintenance = prop.mantenimientoHistorial
    .filter(m => m.pagado)
    .sort((a, b) => b.fechaPago.localeCompare(a.fechaPago))
    .slice(0, 3);

  // Pending maintenance calculations
  const pendingMaintenance = prop.mantenimientoHistorial
    .filter(m => !m.pagado)
    .sort((a, b) => a.fechaPago.localeCompare(b.fechaPago));
  const totalPendingAmount = pendingMaintenance.reduce((s, m) => s + m.monto, 0);
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const overdueMaintenance = pendingMaintenance.filter(m => m.fechaPago < today && m.fechaPago.slice(0, 7) < currentMonth);
  const oldestOverdue = overdueMaintenance.length > 0 ? overdueMaintenance[0] : null;
  const newestOverdue = overdueMaintenance.length > 0 ? overdueMaintenance[overdueMaintenance.length - 1] : null;
  const completedTotal = prop.mantenimientoHistorial.filter(m => m.pagado).reduce((s, m) => s + m.monto, 0);
  const saldoAFavor = Math.max(0, prop.mantenimientoTotalPagado - completedTotal - totalPendingAmount);
  const isAlCorriente = pendingMaintenance.length === 0;

  const contratos = prop.documentos.filter(d => [1, 2, 3, 4, 5].includes(d.idTipoDocumento));
  const docsNotariales = prop.documentos.filter(d => !contratos.includes(d));

  // Value breakdown
  const m2Label = prop.m2Total > 0 ? `${prop.m2Total.toFixed(1)} m²` : null;
  const isAppreciation = prop.appreciationPercent >= 0;
  const valorCompra = prop.precioFinal;
  const valorActual = prop.valorEstimado;
  const diferencia = valorActual - valorCompra;

  return (
    <div className="max-w-lg mx-auto lg:max-w-2xl pb-24">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-background border-b border-border px-5 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-foreground font-medium">
          <ArrowLeft className="w-4 h-4" />
          <div>
            <p className="font-semibold text-sm leading-tight">{prop.proyecto}</p>
            <p className="text-xs text-muted-foreground">Unidad {prop.unidad}</p>
          </div>
        </button>
        <span className={`text-[11px] font-semibold px-3 py-1 rounded-full ${statusBadge.color}`}>
          • {statusBadge.label}
        </span>
      </div>

      {/* ─── Value & Payment Progress ─── */}
      <div className="mx-5 mt-4 rounded-2xl bg-card border border-border p-5 space-y-4">
        <div>
          <div
            className="flex items-start justify-between cursor-pointer select-none"
            onClick={() => setShowValueBreakdown(!showValueBreakdown)}
          >
            <div className="flex items-center gap-1.5">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Valor del activo</p>
                <p className="font-bold text-2xl text-foreground tabular-nums mt-0.5">{fmt(prop.valorEstimado)}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform mt-4 ${showValueBreakdown ? "rotate-180" : ""}`} />
            </div>
            {prop.appreciationPercent !== 0 && (
              <div
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full cursor-pointer ${isAppreciation ? "bg-[hsl(var(--inmob-green))]/10" : "bg-destructive/10"}`}
                onClick={(e) => { e.stopPropagation(); setShowAppreciationBreakdown(!showAppreciationBreakdown); }}
              >
                {isAppreciation ? <TrendingUp className="w-3 h-3 text-[hsl(var(--inmob-green))]" /> : <TrendingDown className="w-3 h-3 text-destructive" />}
                <span className={`text-xs font-semibold tabular-nums ${isAppreciation ? "text-[hsl(var(--inmob-green))]" : "text-destructive"}`}>
                  {isAppreciation ? "+" : ""}{prop.appreciationPercent.toFixed(1)}%
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isAppreciation ? "text-[hsl(var(--inmob-green))]" : "text-destructive"} ${showAppreciationBreakdown ? "rotate-180" : ""}`} />
              </div>
            )}
          </div>

          {/* Appreciation breakdown — comparison style */}
          {(showValueBreakdown || showAppreciationBreakdown) && (
            <div className="mt-3 space-y-1.5 pl-1 text-xs">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Desglose de plusvalía</p>
              <div className="flex items-center justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Compra</span>
                <span className="font-semibold text-foreground tabular-nums">{fmt(prop.precioM2Compra, 0)}/m²</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Actual</span>
                <span className="font-semibold text-foreground tabular-nums">{fmt(prop.precioM2Actual, 0)}/m²</span>
              </div>
              {/* Comparison: Valor compra vs Valor actual */}
              <div className="rounded-xl bg-muted/40 p-3 mt-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Valor de compra</span>
                  <span className="font-semibold text-foreground tabular-nums">{fmt(valorCompra)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Valor actual estimado</span>
                  <span className="font-semibold text-foreground tabular-nums">{fmt(valorActual)}</span>
                </div>
                <div className="border-t border-border pt-2 flex items-center justify-between">
                  <span className="text-muted-foreground font-medium">Diferencia</span>
                  <span className={`font-bold tabular-nums ${isAppreciation ? "text-[hsl(var(--inmob-green))]" : "text-destructive"}`}>
                    {isAppreciation ? "+" : ""}{fmt(diferencia)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">Progreso de pago</span>
            <span className="font-semibold text-[hsl(var(--inmob-green))]">{progress.toFixed(0)}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-[hsl(var(--inmob-green))] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex justify-between pt-1">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pagado</p>
            <p className="font-bold text-sm text-[hsl(var(--inmob-green))] tabular-nums">{fmt(prop.totalPaid)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Restante</p>
            <p className="font-bold text-sm text-foreground tabular-nums">{fmt(prop.pending)}</p>
          </div>
        </div>
      </div>

      {/* ─── Quick messages ─── */}
      {(maintenanceOverdue || prop.estatusPropiedad === 7) && (
        <div className="mx-5 mt-3 rounded-2xl bg-card border border-border p-4">
          {maintenanceOverdue && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {prop.mantenimientosAtrasados} cuota{prop.mantenimientosAtrasados > 1 ? "s" : ""} atrasada{prop.mantenimientosAtrasados > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground">Regulariza tu mantenimiento</p>
              </div>
            </div>
          )}
          {prop.estatusPropiedad === 7 && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                <FileText className="w-4 h-4 text-purple-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">En proceso de escrituración</p>
                <p className="text-xs text-muted-foreground">Tu escritura está siendo procesada</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Investment Process Timeline ─── */}
      <div className="mx-5 mt-5">
        <h3 className="font-semibold text-sm text-foreground mb-4">Proceso de inversión</h3>
        <div className="flex items-start justify-between">
          {PROCESS_STEPS.map((step, i) => {
            const isDone = i <= completedStep;
            const isCurrent = i === completedStep;
            return (
              <div key={step.label} className="flex flex-col items-center gap-1.5 flex-1">
                <div className="flex items-center w-full">
                  {i > 0 && (
                    <div className={`h-0.5 flex-1 ${i <= completedStep ? "bg-[hsl(var(--inmob-green))]" : "bg-muted"}`} />
                  )}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                    ${isDone
                      ? "bg-[hsl(var(--inmob-green))] text-white"
                      : "bg-muted text-muted-foreground border border-border"
                    }
                    ${isCurrent ? "ring-2 ring-[hsl(var(--inmob-green))]/30" : ""}
                  `}>
                    {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  {i < PROCESS_STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 ${i < completedStep ? "bg-[hsl(var(--inmob-green))]" : "bg-muted"}`} />
                  )}
                </div>
                <span className={`text-[10px] text-center leading-tight ${isDone ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Products Adicionales (expandable with payment detail) ─── */}
      {prop.productosAdicionales.length > 0 && (
        <div className="mx-5 mt-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">Productos adicionales</p>
          <div className="space-y-2">
            {prop.productosAdicionales.map(prod => {
              const isExpanded = expandedProductId === prod.id;
              const prodProgress = prod.precio > 0 ? Math.min(100, (prod.totalPaid / prod.precio) * 100) : 0;
              return (
                <div key={prod.id} className="bg-card rounded-2xl border border-border overflow-hidden">
                  <button
                    onClick={() => setExpandedProductId(isExpanded ? null : prod.id)}
                    className="flex items-center gap-3 w-full p-4 text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center">
                      <Package className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{prod.nombre}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{fmt(prod.precio)}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                      prod.isFullyPaid
                        ? "bg-[hsl(var(--inmob-green))]/15 text-[hsl(var(--inmob-green))]"
                        : "bg-amber-500/15 text-amber-600"
                    }`}>
                      {prod.isFullyPaid ? "Entregado" : "Pendiente"}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-3 bg-muted/30 space-y-3">
                      {/* Progress */}
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">Progreso</span>
                          <span className="font-semibold tabular-nums text-foreground">{prodProgress.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[hsl(var(--inmob-green))] transition-all" style={{ width: `${prodProgress}%` }} />
                        </div>
                      </div>
                      <div className="flex justify-between text-xs">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase">Pagado</p>
                          <p className="font-semibold text-[hsl(var(--inmob-green))] tabular-nums">{fmt(prod.totalPaid)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground uppercase">Pendiente</p>
                          <p className="font-semibold text-foreground tabular-nums">{fmt(Math.max(0, prod.precio - prod.totalPaid))}</p>
                        </div>
                      </div>
                      {/* Inline payment history for this product */}
                      <ProductPagosInline productId={prod.id} propiedadId={prop.propiedadId} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Parcialidades / Pagar propiedad section ─── */}
      {prop.propiedadClabeStp && prop.pending > 0 && (() => {
        const today = new Date().toISOString().slice(0, 10);
        const overdueParcialidades = prop.parcialidades.filter(p => !p.pagado && p.fechaPago && p.fechaPago < today);
        const pendingParcialidades = prop.parcialidades.filter(p => !p.pagado);
        const totalOverdueAmount = overdueParcialidades.reduce((s, p) => s + p.saldoPendiente, 0);
        const oldestOverdueParc = overdueParcialidades.length > 0 ? overdueParcialidades[0] : null;
        const newestOverdueParc = overdueParcialidades.length > 0 ? overdueParcialidades[overdueParcialidades.length - 1] : null;
        const isPropertyAlCorriente = pendingParcialidades.length === 0;

        return (
          <div className="mx-5 mt-6">
            <h3 className="font-bold text-sm text-foreground mb-3">Parcialidades</h3>
            <div className="bg-card rounded-2xl border border-border p-4 space-y-3">

              {/* Status summary */}
              {isPropertyAlCorriente ? (
                <div className="flex items-center gap-2 text-[hsl(var(--inmob-green))]">
                  <Check className="w-4 h-4" />
                  <span className="text-sm font-semibold">Al corriente</span>
                </div>
              ) : overdueParcialidades.length > 0 ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm font-semibold">
                      {overdueParcialidades.length} pago{overdueParcialidades.length > 1 ? "s" : ""} vencido{overdueParcialidades.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground pl-6 space-y-0.5">
                    {oldestOverdueParc && (
                      <p>Más antiguo: <span className="text-foreground font-medium capitalize">{new Date(oldestOverdueParc.fechaPago + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}</span></p>
                    )}
                    {newestOverdueParc && overdueParcialidades.length > 1 && (
                      <p>Más reciente: <span className="text-foreground font-medium capitalize">{new Date(newestOverdueParc.fechaPago + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}</span></p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-600">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-semibold">Pagos pendientes</span>
                </div>
              )}

              {/* Saldo a pagar (overdue total, expandable) */}
              {overdueParcialidades.length > 0 && (
                <>
                  <button
                    onClick={() => setShowPendingParcialidades(!showPendingParcialidades)}
                    className="flex items-center justify-between w-full text-sm"
                  >
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CreditCard className="w-4 h-4" />
                      <span>Saldo a pagar</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-foreground tabular-nums">{fmt(totalOverdueAmount)}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showPendingParcialidades ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  {showPendingParcialidades && (
                    <div className="pl-6 space-y-1.5 border-l-2 border-border ml-2">
                      {overdueParcialidades.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-xs gap-2">
                          <div className="flex flex-col text-muted-foreground">
                            <span>{p.concepto} #{p.orden}</span>
                            <span className="text-[10px] capitalize">{p.fechaPago ? new Date(p.fechaPago + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span>
                          </div>
                          <span className="font-semibold tabular-nums text-foreground shrink-0">{fmt(p.saldoPendiente)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Last 5 payments */}
              {prop.ultimosPagos.length > 0 && (
                <>
                  <div className="border-t border-border pt-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Últimos pagos</p>
                  </div>
                  <div className="space-y-2">
                    {prop.ultimosPagos.map(p => (
                      <div key={p.id} className="flex items-center justify-between text-sm">
                        <span className="text-foreground capitalize">
                          {new Date(p.fechaPago + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground">{fmt(p.monto)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">Se muestran los últimos 5 pagos registrados</p>
                  <button
                    onClick={() => navigate(`/admin/portal-cliente/pagos?cuentaId=${prop.cuentaId}`)}
                    className="text-xs text-[hsl(var(--inmob-green))] font-semibold text-center w-full"
                  >
                    Ver historial completo →
                  </button>
                </>
              )}

              {/* CTA */}
              <button
                onClick={() => navigate(`/admin/portal-cliente/propiedad-pago/${prop.cuentaId}`)}
                className="w-full py-3 rounded-xl bg-[hsl(var(--inmob-green))] text-white font-semibold text-sm active:scale-[0.98] transition-transform mt-1"
              >
                Pagar propiedad
              </button>
            </div>
          </div>
        );
      })()}

      {/* ─── Finanzas ─── */}
      <div className="mx-5 mt-6">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">Finanzas</p>
        <div className="bg-card rounded-2xl border border-border divide-y divide-border">
          <button
            onClick={handleDownloadEdoCuenta}
            disabled={generatingEdoCuenta}
            className="flex items-center gap-3 w-full p-4 text-left hover:bg-muted/30 transition-colors"
          >
            <FileText className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium text-foreground">Estado de cuenta</span>
            {generatingEdoCuenta ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <Download className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={() => navigate(`/admin/portal-cliente/pagos?cuentaId=${prop.cuentaId}`)}
            className="flex items-center gap-3 w-full p-4 text-left hover:bg-muted/30 transition-colors"
          >
            <Clock className="w-5 h-5 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium text-foreground">Historial de pagos</span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* ─── Documentos ─── */}
      {prop.documentos.length > 0 && (
        <div className="mx-5 mt-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">Documentos</p>
          <div className="bg-card rounded-2xl border border-border divide-y divide-border">
            {prop.documentos.map(doc => (
              <a
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full p-4 text-left hover:bg-muted/30 transition-colors"
              >
                <FileText className="w-5 h-5 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium text-foreground">{doc.tipoDocumento}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ─── Mantenimiento ─── */}
      {(prop.cuotaMensualMantenimiento > 0 || prop.mantenimientoHistorial.length > 0) && (
        <div className="mx-5 mt-6">
          <h3 className="font-bold text-sm text-foreground mb-3">Mantenimiento</h3>
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">

            {/* Status summary */}
            {isAlCorriente ? (
              <div className="flex items-center gap-2 text-[hsl(var(--inmob-green))]">
                <Check className="w-4 h-4" />
                <span className="text-sm font-semibold">Al corriente</span>
              </div>
            ) : overdueMaintenance.length > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-semibold">
                    {overdueMaintenance.length} pago{overdueMaintenance.length > 1 ? "s" : ""} vencido{overdueMaintenance.length > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground pl-6 space-y-0.5">
                  {oldestOverdue && (
                    <p>Más antiguo: <span className="text-foreground font-medium capitalize">{new Date(oldestOverdue.fechaPago + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}</span></p>
                  )}
                  {newestOverdue && overdueMaintenance.length > 1 && (
                    <p>Más reciente: <span className="text-foreground font-medium capitalize">{new Date(newestOverdue.fechaPago + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}</span></p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-600">
                <Calendar className="w-4 h-4" />
                <span className="text-sm font-semibold">Pagos pendientes</span>
              </div>
            )}

            {/* Pago pendiente (expandable) */}
            {pendingMaintenance.length > 0 && (
              <>
                <button
                  onClick={() => setShowPendingMaintenance(!showPendingMaintenance)}
                  className="flex items-center justify-between w-full text-sm"
                >
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CreditCard className="w-4 h-4" />
                    <span>Pago pendiente</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-foreground tabular-nums">{fmt(totalPendingAmount)}</span>
                    <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${showPendingMaintenance ? "rotate-180" : ""}`} />
                  </div>
                </button>
                {showPendingMaintenance && (
                  <div className="pl-6 space-y-1.5 border-l-2 border-border ml-2">
                    {pendingMaintenance.map(m => (
                      <div key={m.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground capitalize">
                          {new Date(m.fechaPago + "T00:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground">{fmt(m.monto)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}


            {/* Saldo a favor */}
            {saldoAFavor > 0 && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-[hsl(var(--inmob-green))]">
                  <TrendingUp className="w-4 h-4" />
                  <span className="font-medium">Saldo a favor</span>
                </div>
                <span className="font-bold text-[hsl(var(--inmob-green))] tabular-nums">{fmt(saldoAFavor)}</span>
              </div>
            )}

            {/* Historial (paid) */}
            {paidMaintenance.length > 0 && (
              <>
                <div className="border-t border-border pt-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Historial</p>
                </div>
                <div className="space-y-2">
                  {paidMaintenance.map(m => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground capitalize">
                        {new Date(m.fechaPago + "T00:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums text-foreground">{fmt(m.monto)}</span>
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Pagado</span>
                        <FileText className="w-3.5 h-3.5 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Pagar mantenimiento button */}
            {prop.mantenimientoClabeStp && (
              <button
                onClick={() => navigate(`/admin/portal-cliente/mantenimiento-pago/${prop.cuentaId}`)}
                className="w-full py-3 rounded-xl bg-[hsl(var(--inmob-green))] text-white font-semibold text-sm active:scale-[0.98] transition-transform mt-1"
              >
                Pagar mantenimiento
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─────────── Product Payment Detail (inline) ─────────── */

function ProductPagosInline({ productId, propiedadId }: { productId: number; propiedadId: number }) {
  const { data: pagos, isLoading } = useQuery({
    queryKey: ["producto-pagos-inline", productId, propiedadId],
    queryFn: async (): Promise<ProductPagoRow[]> => {
      // Find the oferta for this product+propiedad
      const { data: oferta } = await supabase
        .from("ofertas")
        .select("id")
        .eq("id_producto", productId)
        .eq("id_propiedad", propiedadId)
        .eq("activo", true)
        .maybeSingle();

      if (!oferta) return [];

      // Find cuenta_cobranza
      const { data: cuenta } = await supabase
        .from("cuentas_cobranza")
        .select("id")
        .eq("id_oferta", oferta.id)
        .eq("activo", true)
        .maybeSingle();

      if (!cuenta) return [];

      const { data: pagosData } = await supabase
        .from("pagos")
        .select("id, fecha_pago, monto, clave_rastreo, url_cep, id_metodos_pago, metodos_pago!fk_pagos_metodo(nombre)")
        .eq("id_cuenta_cobranza", cuenta.id)
        .eq("activo", true)
        .order("fecha_pago", { ascending: true });

      return (pagosData || []).map((p: any) => ({
        id: p.id,
        fecha_pago: p.fecha_pago,
        monto: p.monto,
        metodo: (p.metodos_pago as any)?.nombre || "—",
        clave_rastreo: p.clave_rastreo,
        url_cep: p.url_cep,
      }));
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 justify-center py-2">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Cargando pagos…</span>
      </div>
    );
  }

  if (!pagos || pagos.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-1">Sin pagos registrados</p>;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pagos ({pagos.length})</p>
      {pagos.map(p => (
        <div key={p.id} className="flex items-center justify-between py-1.5">
          <div className="flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-foreground">{fmtDate(p.fecha_pago)}</span>
            <span className="text-[10px] text-muted-foreground">{p.metodo}</span>
          </div>
          <span className="text-xs font-semibold text-foreground tabular-nums">{fmt(p.monto)}</span>
        </div>
      ))}
    </div>
  );
}

export default ClientePropiedadDetalle;
