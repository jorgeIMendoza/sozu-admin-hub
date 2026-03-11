import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, Check, FileText, Clock, CreditCard, Package, Calendar, AlertTriangle, ChevronRight, ChevronDown, Download, Home, Loader2 } from "lucide-react";
import { useClientePropiedadDetalle } from "@/hooks/useClientePropiedadDetalle";
import { useClienteResumenFinanciero } from "@/hooks/useClienteResumenFinanciero";
import { fmtMXN as fmt } from "@/lib/clienteMockData";
import { estadoCuentaEdgeFunctionService } from "@/services/estadoCuentaEdgeFunctionService";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useClienteImpersonation } from "@/contexts/ClienteImpersonationContext";

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

const ClientePropiedadDetalle = () => {
  const { cuentaId } = useParams<{ cuentaId: string }>();
  const navigate = useNavigate();
  const { data: prop, isLoading } = useClientePropiedadDetalle(cuentaId ? Number(cuentaId) : null);
  const [generatingEdoCuenta, setGeneratingEdoCuenta] = useState(false);
  const [showValueBreakdown, setShowValueBreakdown] = useState(false);
  const [showAppreciationBreakdown, setShowAppreciationBreakdown] = useState(false);

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

  const contratos = prop.documentos.filter(d => [1, 2, 3, 4, 5].includes(d.idTipoDocumento));
  const docsNotariales = prop.documentos.filter(d => !contratos.includes(d));

  // Value breakdown: how the estimated value is calculated
  const m2Label = prop.m2Total > 0 ? `${prop.m2Total.toFixed(1)} m²` : null;
  const isAppreciation = prop.appreciationPercent >= 0;

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

          {/* Value breakdown */}
          {showValueBreakdown && (
            <div className="mt-3 space-y-1.5 pl-1 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-border">
                <span className="text-muted-foreground">Precio de compra</span>
                <span className="font-semibold text-foreground tabular-nums">{fmt(prop.precioFinal)}</span>
              </div>
              {m2Label && (
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="text-muted-foreground">Superficie total</span>
                  <span className="font-semibold text-foreground">{m2Label}</span>
                </div>
              )}
              {prop.precioM2Compra > 0 && (
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="text-muted-foreground">Precio/m² compra</span>
                  <span className="font-semibold text-foreground tabular-nums">{fmt(prop.precioM2Compra, 0)}/m²</span>
                </div>
              )}
              {prop.precioM2Actual > 0 && (
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="text-muted-foreground">Precio/m² actual</span>
                  <span className="font-semibold text-foreground tabular-nums">{fmt(prop.precioM2Actual, 0)}/m²</span>
                </div>
              )}
              <div className="flex items-center justify-between py-1.5">
                <span className="text-muted-foreground font-medium">Valor estimado actual</span>
                <span className="font-bold text-foreground tabular-nums">{fmt(prop.valorEstimado)}</span>
              </div>
            </div>
          )}

          {/* Appreciation breakdown */}
          {showAppreciationBreakdown && (
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
              <div className="flex items-center justify-between py-1.5">
                <span className="text-muted-foreground">Diferencia</span>
                <span className={`font-bold tabular-nums ${isAppreciation ? "text-[hsl(var(--inmob-green))]" : "text-destructive"}`}>
                  {isAppreciation ? "+" : ""}{fmt(prop.valorEstimado - prop.precioFinal)}
                </span>
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

      {/* ─── Products Adicionales ─── */}
      {prop.productosAdicionales.length > 0 && (
        <div className="mx-5 mt-6">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">Productos adicionales</p>
          <div className="space-y-2">
            {prop.productosAdicionales.map(prod => (
              <div key={prod.id} className="flex items-center gap-3 bg-card rounded-2xl border border-border p-4">
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
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>
      )}

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
            onClick={() => navigate("/admin/portal-cliente/pagos")}
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
          <h3 className="font-semibold text-sm text-foreground mb-3">Mantenimiento</h3>
          <div className="space-y-2">
            {prop.cuotaMensualMantenimiento > 0 && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CreditCard className="w-4 h-4" />
                  <span>Cuota mensual</span>
                </div>
                <span className="font-semibold text-foreground tabular-nums">{fmt(prop.cuotaMensualMantenimiento)}</span>
              </div>
            )}
            {nextMaintenanceFormatted && (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Próximo vencimiento</span>
                </div>
                <span className={`font-semibold tabular-nums ${maintenanceOverdue ? "text-destructive" : "text-amber-600"}`}>
                  {nextMaintenanceFormatted}
                </span>
              </div>
            )}
          </div>

          {paidMaintenance.length > 0 && (
            <div className="mt-4">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Historial</p>
              <div className="space-y-1.5">
                {paidMaintenance.map(m => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {new Date(m.fechaPago + "T00:00:00").toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium tabular-nums text-foreground">{fmt(m.monto)}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">Pagado</span>
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientePropiedadDetalle;
