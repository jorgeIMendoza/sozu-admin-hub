import { Receipt, Clock, TrendingUp, ChevronRight, AlertTriangle, CheckCircle2, CreditCard, FileText, Home, Loader2 } from "lucide-react";
import { mockPortfolio, getPortfolioTotals, fmtMXN as fmt, type ClienteInvestment } from "@/lib/clienteMockData";
import { useAuth } from "@/contexts/AuthContext";
import { useClienteImpersonation } from "@/contexts/ClienteImpersonationContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClienteActividad, URGENCIA_BORDER, URGENCIA_DOT, URGENCIA_BADGE, type ActividadItem } from "@/hooks/useClienteActividad";

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
};

const ClienteInicio = () => {
  const { profile } = useAuth();
  const { impersonatedClienteName, impersonatedClientePersonaId, isImpersonating } = useClienteImpersonation();
  
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

  const totals = getPortfolioTotals(mockPortfolio);
  const progress = totals.totalInvested > 0 ? (totals.totalPaid / totals.totalInvested) * 100 : 0;

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
            {mockPortfolio.length} propiedad{mockPortfolio.length !== 1 ? "es" : ""} activa{mockPortfolio.length !== 1 ? "s" : ""}
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
          <button className="flex flex-col items-start gap-2.5 bg-card rounded-2xl border border-border p-4 transition-all active:scale-[0.97] hover:border-[hsl(var(--inmob-green))]/30 text-left">
            <div className="w-9 h-9 rounded-xl bg-[hsl(var(--inmob-green))]/10 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-[hsl(var(--inmob-green))]" />
            </div>
            <div>
              <p className="font-semibold text-[13px] text-foreground leading-tight">Estado de cuenta</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Saldo y movimientos</p>
            </div>
          </button>
          <button className="flex flex-col items-start gap-2.5 bg-card rounded-2xl border border-border p-4 transition-all active:scale-[0.97] hover:border-[hsl(var(--inmob-green))]/30 text-left">
            <div className="w-9 h-9 rounded-xl bg-[hsl(var(--inmob-green))]/10 flex items-center justify-center">
              <Clock className="w-4 h-4 text-[hsl(var(--inmob-green))]" />
            </div>
            <div>
              <p className="font-semibold text-[13px] text-foreground leading-tight">Historial de pagos</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Todos tus pagos</p>
            </div>
          </button>
        </div>
      </section>

      {/* Financial Summary */}
      <section className="px-5 py-4 lg:px-0">
        <h2 className="font-semibold text-sm text-foreground mb-3">Resumen financiero</h2>
        <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Total invertido</p>
              <p className="font-bold text-xl text-foreground tabular-nums mt-0.5">{fmt(totals.totalInvested)}</p>
            </div>
            <div className="flex items-center gap-1 bg-[hsl(var(--inmob-green))]/10 px-2.5 py-1 rounded-full">
              <TrendingUp className="w-3 h-3 text-[hsl(var(--inmob-green))]" />
              <span className="text-xs font-semibold text-[hsl(var(--inmob-green))] tabular-nums">+{totals.appreciationPercent.toFixed(1)}%</span>
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[11px] text-muted-foreground font-medium">Progreso de pago</span>
              <span className="text-[11px] font-bold text-[hsl(var(--inmob-green))] tabular-nums">{progress.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-[hsl(var(--inmob-green))]" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Pagado</p>
              <p className="font-semibold text-sm text-[hsl(var(--inmob-green))] tabular-nums mt-0.5">{fmt(totals.totalPaid)}</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Pendiente</p>
              <p className="font-semibold text-sm text-foreground tabular-nums mt-0.5">{fmt(totals.totalPending)}</p>
            </div>
          </div>
        </div>
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
  const isStatus = item.tipo === "escrituracion" || item.tipo === "entrega";

  const iconMap: Record<string, React.ReactNode> = {
    pago: <CreditCard className="w-4 h-4" />,
    mantenimiento: <Home className="w-4 h-4" />,
    escrituracion: <FileText className="w-4 h-4" />,
    entrega: <Home className="w-4 h-4" />,
  };

  return (
    <div
      className={`bg-card rounded-2xl border border-border border-l-[3px] ${URGENCIA_BORDER[item.urgencia]} p-4`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-semibold text-sm text-foreground">
              {item.proyecto} {item.unidad && `U-${item.unidad}`}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${URGENCIA_BADGE[item.urgencia]}`}>
              {item.concepto}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{item.mensaje}</p>
        </div>
        {isPago && item.monto != null && (
          <div className="text-right shrink-0">
            <p className="font-bold text-base text-foreground tabular-nums">{fmt(item.monto)}</p>
            {item.tipo === "pago" && (
              <div className="flex items-center gap-1 mt-1 text-[hsl(var(--inmob-green))]">
                <CreditCard className="w-3 h-3" />
                <span className="text-[11px] font-semibold">Pagar</span>
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
