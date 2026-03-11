import { useState } from "react";
import { Receipt, Clock, TrendingUp, TrendingDown, ChevronRight, ChevronDown, AlertTriangle, CheckCircle2, CreditCard, FileText, Home, Loader2 } from "lucide-react";
import { mockPortfolio, fmtMXN as fmt, type ClienteInvestment } from "@/lib/clienteMockData";
import { useAuth } from "@/contexts/AuthContext";
import { useClienteImpersonation } from "@/contexts/ClienteImpersonationContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClienteActividad, URGENCIA_BORDER, URGENCIA_DOT, URGENCIA_BADGE, type ActividadItem } from "@/hooks/useClienteActividad";
import { useClienteResumenFinanciero } from "@/hooks/useClienteResumenFinanciero";
import { estadoCuentaEdgeFunctionService } from "@/services/estadoCuentaEdgeFunctionService";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
};

const ClienteInicio = () => {
  const { profile } = useAuth();
  const { impersonatedClienteName, impersonatedClientePersonaId, isImpersonating } = useClienteImpersonation();
  const navigate = useNavigate();
  const [generatingEdoCuenta, setGeneratingEdoCuenta] = useState(false);
  const [showEdoCuentaPicker, setShowEdoCuentaPicker] = useState(false);
  const [showInvestmentBreakdown, setShowInvestmentBreakdown] = useState(false);
  const [showAppreciationBreakdown, setShowAppreciationBreakdown] = useState(false);
  
  const effectivePersonaId = isImpersonating ? impersonatedClientePersonaId : profile?.id_persona;

  const { data: personaData } = useQuery({
    queryKey: ["portal-cliente-persona-greeting", effectivePersonaId],
    queryFn: async () => {
      if (!effectivePersonaId) return null;
      const { data } = await supabase
        .from("personas")
        .select("nombre_legal")
        .eq("id", effectivePersonaId)
        .maybeSingle();
      return data;
    },
    enabled: !!effectivePersonaId,
  });

  const displayName = isImpersonating
    ? impersonatedClienteName || "Cliente"
    : personaData?.nombre_legal || profile?.nombre || "Cliente";

  const { data: actividad, isLoading: actividadLoading } = useClienteActividad(effectivePersonaId);
  const { data: resumen, isLoading: resumenLoading } = useClienteResumenFinanciero(effectivePersonaId);

  // Count real active properties (non-product ofertas)
  const { data: propiedadesActivasCount } = useQuery({
    queryKey: ["portal-cliente-propiedades-count", effectivePersonaId],
    queryFn: async () => {
      if (!effectivePersonaId) return 0;

      // Direct ofertas (as lead)
      const { data: ofertasDirectas } = await supabase
        .from("ofertas")
        .select("id, id_producto, id_propiedad")
        .eq("id_persona_lead", effectivePersonaId)
        .eq("activo", true);

      // Co-owner ofertas (via compradores → cuentas_cobranza → ofertas)
      const { data: compradorCuentas } = await supabase
        .from("compradores")
        .select("id_cuenta_cobranza")
        .eq("id_persona", effectivePersonaId)
        .eq("activo", true);

      let ofertasCoprop: any[] = [];
      if (compradorCuentas && compradorCuentas.length > 0) {
        const cuentaIds = [...new Set(compradorCuentas.map((c) => c.id_cuenta_cobranza))];
        const { data: cuentasData } = await supabase
          .from("cuentas_cobranza")
          .select("id_oferta")
          .in("id", cuentaIds)
          .eq("activo", true);

        if (cuentasData && cuentasData.length > 0) {
          const ofertaIdsFromCoprop = [...new Set(cuentasData.map((c) => c.id_oferta))];
          const { data: copropOfertas } = await supabase
            .from("ofertas")
            .select("id, id_producto, id_propiedad")
            .in("id", ofertaIdsFromCoprop)
            .eq("activo", true);
          ofertasCoprop = copropOfertas || [];
        }
      }

      // Merge and deduplicate
      const ofertasMap = new Map<number, any>();
      (ofertasDirectas || []).forEach((o: any) => ofertasMap.set(o.id, o));
      ofertasCoprop.forEach((o: any) => ofertasMap.set(o.id, o));
      const allOfertas = Array.from(ofertasMap.values());

      // Only count non-product ofertas (real properties)
      return allOfertas.filter((o: any) => !o.id_producto).length;
    },
    enabled: !!effectivePersonaId,
  });
  const numPropiedades = propiedadesActivasCount ?? 0;

  // Real financial data from hook
  const totalInvested = resumen?.totalInvested ?? 0;
  const totalPaid = resumen?.totalPaid ?? 0;
  const totalPending = resumen?.totalPending ?? 0;
  const progress = totalInvested > 0 ? (totalPaid / totalInvested) * 100 : 0;
  const appreciationPercent = resumen?.appreciationPercent ?? 0;
  const isAppreciation = resumen?.isAppreciation ?? true;

  // Estado de cuenta handler
  const handleEstadoCuenta = async (cuentaId?: number) => {
    const properties = resumen?.properties || [];
    if (properties.length === 0) {
      toast.error("No se encontró cuenta para generar el estado de cuenta");
      return;
    }
    // If multiple properties and no specific cuenta selected, show picker
    if (properties.length > 1 && !cuentaId) {
      setShowEdoCuentaPicker(true);
      return;
    }
    const targetCuenta = cuentaId || properties[0].cuentaId;
    setShowEdoCuentaPicker(false);
    setGeneratingEdoCuenta(true);
    try {
      await estadoCuentaEdgeFunctionService.generateEstadoCuenta({ id_cuenta: targetCuenta });
    } catch {
      toast.error("Error al generar el estado de cuenta");
    } finally {
      setGeneratingEdoCuenta(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto lg:max-w-none space-y-0">
      {/* Welcome */}
      <section className="px-5 pt-5 pb-2 lg:px-0">
        <p className="text-sm text-muted-foreground">{getGreeting()},</p>
        <h2 className="font-bold text-xl text-foreground tracking-tight mt-0.5">
          {displayName}
        </h2>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-xs text-muted-foreground">Inversionista</span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span className="text-xs text-muted-foreground">
            {numPropiedades} propiedad{numPropiedades !== 1 ? "es" : ""} activa{numPropiedades !== 1 ? "s" : ""}
          </span>
        </div>
      </section>

      {/* Activity */}
      <section className="px-5 pt-6 pb-2 lg:px-0">
        <h2 className="font-bold text-lg text-foreground mb-4">Tu actividad</h2>
        {actividadLoading ? (
          <div className="bg-card rounded-2xl border border-border p-5 flex items-center gap-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Cargando actividad…</p>
          </div>
        ) : actividad && actividad.length > 0 ? (
          <div className="space-y-3">
            {/* Summary banner */}
            <div className="flex items-center gap-3 bg-amber-500/10 rounded-2xl px-4 py-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">
                  Tienes {actividad.length} pendiente{actividad.length > 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Revisa tus próximos pagos y notificaciones</p>
              </div>
            </div>

            {/* Individual activity items */}
            {actividad.map((item) => (
              <ActividadCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="font-semibold text-sm text-foreground">Estás al día</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sin pagos pendientes ni notificaciones</p>
            </div>
          </div>
        )}
      </section>

      {/* Quick Actions */}
      <section className="px-5 py-5 lg:px-0">
        <h2 className="font-semibold text-sm text-foreground mb-3">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleEstadoCuenta()}
            disabled={generatingEdoCuenta || !resumen?.properties?.length}
            className="flex flex-col items-start gap-2.5 bg-card rounded-2xl border border-border p-4 transition-all active:scale-[0.97] hover:border-[hsl(var(--inmob-green))]/30 text-left disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-xl bg-[hsl(var(--inmob-green))]/10 flex items-center justify-center">
              {generatingEdoCuenta ? <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--inmob-green))]" /> : <Receipt className="w-4 h-4 text-[hsl(var(--inmob-green))]" />}
            </div>
            <div>
              <p className="font-semibold text-[13px] text-foreground leading-tight">Estado de cuenta</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Descargar PDF</p>
            </div>
          </button>
          <button
            onClick={() => navigate("/admin/portal-cliente/pagos")}
            className="flex flex-col items-start gap-2.5 bg-card rounded-2xl border border-border p-4 transition-all active:scale-[0.97] hover:border-[hsl(var(--inmob-green))]/30 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-[hsl(var(--inmob-green))]/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-[hsl(var(--inmob-green))]" />
            </div>
            <div>
              <p className="font-semibold text-[13px] text-foreground leading-tight">Historial de pagos</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Pagos y aplicaciones</p>
            </div>
          </button>
        </div>

        {/* Property picker for estado de cuenta */}
        {showEdoCuentaPicker && resumen?.properties && resumen.properties.length > 1 && (
          <div className="mt-3 bg-card rounded-2xl border border-border p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground mb-2">Selecciona la propiedad:</p>
            {resumen.properties.map((prop) => (
              <button
                key={prop.cuentaId}
                onClick={() => handleEstadoCuenta(prop.cuentaId)}
                disabled={generatingEdoCuenta}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-border hover:border-[hsl(var(--inmob-green))]/30 hover:bg-muted/50 transition-all text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[hsl(var(--inmob-green))]/10 flex items-center justify-center">
                    <Home className="w-4 h-4 text-[hsl(var(--inmob-green))]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{prop.proyecto} {prop.unidad}</p>
                    <p className="text-[11px] text-muted-foreground">{prop.edificio}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
            <button
              onClick={() => setShowEdoCuentaPicker(false)}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1 transition-colors"
            >
              Cancelar
            </button>
          </div>
        )}
      </section>

      {/* Financial Summary */}
      <section className="px-5 py-4 lg:px-0">
        <h2 className="font-semibold text-sm text-foreground mb-3">Resumen financiero</h2>
        {resumenLoading ? (
          <div className="bg-card rounded-2xl border border-border p-5 flex items-center gap-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Cargando…</p>
          </div>
        ) : (
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Total invertido</p>
              <p className="font-bold text-xl text-foreground tabular-nums mt-0.5">{fmt(totalInvested)}</p>
            </div>
            {appreciationPercent > 0 && (
            <div className={`flex items-center gap-1 ${isAppreciation ? "bg-[hsl(var(--inmob-green))]/10" : "bg-destructive/10"} px-2.5 py-1 rounded-full`}>
              {isAppreciation ? <TrendingUp className="w-3 h-3 text-[hsl(var(--inmob-green))]" /> : <TrendingDown className="w-3 h-3 text-destructive" />}
              <span className={`text-xs font-semibold tabular-nums ${isAppreciation ? "text-[hsl(var(--inmob-green))]" : "text-destructive"}`}>{isAppreciation ? "+" : "-"}{appreciationPercent.toFixed(1)}%</span>
            </div>
            )}
          </div>
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-muted-foreground font-medium">Progreso de pago</span>
              <span className="text-[11px] font-bold text-[hsl(var(--inmob-green))] tabular-nums">{progress.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[hsl(var(--inmob-green))]" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Pagado</p>
              <p className="font-semibold text-sm text-[hsl(var(--inmob-green))] tabular-nums mt-0.5">{fmt(totalPaid)}</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Pendiente</p>
              <p className="font-semibold text-sm text-foreground tabular-nums mt-0.5">{fmt(totalPending)}</p>
            </div>
          </div>
        </div>
        )}
      </section>

      {/* Properties */}
      <section className="px-5 py-4 lg:px-0">
        <h2 className="font-semibold text-sm text-foreground mb-3">Mis propiedades</h2>
        <div className="space-y-3">
          {mockPortfolio.map((inv) => (
            <PropertyCardCompact key={inv.property.id} investment={inv} />
          ))}
        </div>
      </section>
    </div>
  );
};

/* ── Activity Card ── */
function ActividadCard({ item }: { item: ActividadItem }) {
  const isPago = item.tipo === "pago" || item.tipo === "mantenimiento";
  const isAtraso = item.tipo === "atraso";
  const isStatus = item.tipo === "escrituracion" || item.tipo === "entrega";

  const iconMap: Record<string, React.ReactNode> = {
    pago: <CreditCard className="w-4 h-4" />,
    mantenimiento: <Home className="w-4 h-4" />,
    escrituracion: <FileText className="w-4 h-4" />,
    entrega: <Home className="w-4 h-4" />,
    atraso: <AlertTriangle className="w-4 h-4" />,
  };

  return (
    <div
      className={`bg-card rounded-2xl border border-border border-l-[3px] ${URGENCIA_BORDER[item.urgencia]} p-4`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-semibold text-sm text-foreground">
              {item.proyecto} {item.unidad && item.unidad}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${URGENCIA_BADGE[item.urgencia]}`}>
              {isAtraso ? "Atraso" : item.concepto}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{item.mensaje}</p>
          {isAtraso && item.mensualidadesAtraso && (
            <p className="text-xs font-semibold text-destructive mt-1">
              {item.concepto}
            </p>
          )}
        </div>
        {(isPago || isAtraso) && item.monto != null && (
          <div className="text-right shrink-0">
            <p className="font-bold text-base text-foreground tabular-nums">{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.monto)}</p>
            {item.tipo === "pago" && (
              <div className="flex items-center gap-1 mt-1 text-[hsl(var(--inmob-green))]">
                <CreditCard className="w-3 h-3" />
                <span className="text-[11px] font-semibold">Pagar</span>
              </div>
            )}
            {isAtraso && (
              <div className="flex items-center gap-1 mt-1 text-destructive">
                <AlertTriangle className="w-3 h-3" />
                <span className="text-[11px] font-semibold">Adeudo</span>
              </div>
            )}
          </div>
        )}
        {isStatus && (
          <div className="shrink-0">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-[hsl(var(--inmob-green))]/10 text-[hsl(var(--inmob-green))]`}>
              {iconMap[item.tipo]}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Property Card ── */
function PropertyCardCompact({ investment }: { investment: ClienteInvestment }) {
  const { property, financials } = investment;
  const progress = financials.initialPrice > 0 ? (financials.totalPaid / financials.initialPrice) * 100 : 0;
  const isDelivered = property.deliveryDate === "Entregada";

  return (
    <div className="w-full text-left rounded-[20px] overflow-hidden bg-card shadow-[0_2px_16px_-4px_hsl(var(--foreground)/0.08)]">
      <div className={`relative w-full aspect-[16/9] bg-gradient-to-br ${property.imageGradient}`}>
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
        <div className="absolute top-3 right-3">
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm ${isDelivered ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"}`}>
            {isDelivered ? "Entregada" : `Entrega: ${property.deliveryDate}`}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-bold text-base text-white leading-tight">{property.projectName}</h3>
          <p className="text-white/70 text-xs mt-0.5">Unidad {property.unitNumber} · {property.location}</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">Valor del activo</p>
            <p className="font-bold text-lg text-foreground tabular-nums">{fmt(financials.initialPrice)}</p>
          </div>
          {financials.estimatedAppreciation > 0 && (
            <div className="flex items-center gap-1 text-[hsl(var(--inmob-green))]">
              <TrendingUp className="w-3 h-3" />
              <span className="text-xs font-semibold tabular-nums">+{financials.estimatedAppreciation}%</span>
            </div>
          )}
        </div>
        <div>
          <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[hsl(var(--inmob-green))]" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-[11px]">
            <span className="text-muted-foreground">Pagado <span className="font-semibold text-foreground tabular-nums">{fmt(financials.totalPaid)}</span></span>
            <span className="text-muted-foreground">Pendiente <span className="font-semibold text-foreground tabular-nums">{fmt(financials.pendingBalance)}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs font-medium text-[hsl(var(--inmob-green))] flex items-center gap-1">
            Ver detalle
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

export default ClienteInicio;
