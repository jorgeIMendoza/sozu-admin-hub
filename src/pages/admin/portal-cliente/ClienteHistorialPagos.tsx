import { useState, useEffect } from "react";
import { ArrowLeft, CreditCard, FileText, ChevronDown, ChevronUp, Loader2, Receipt, Eye, ExternalLink, CheckCircle2, Clock, CircleDot } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useClienteImpersonation } from "@/contexts/ClienteImpersonationContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClienteResumenFinanciero, type PropertyFinancialSummary } from "@/hooks/useClienteResumenFinanciero";
import { reciboPagoService } from "@/services/reciboPagoService";
import { toast } from "sonner";


const fmtMXN = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtDate = (d: string) => {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
};

interface PagoRow {
  id: number;
  fecha_pago: string;
  monto: number;
  descripcion: string | null;
  clave_rastreo: string | null;
  metodo: string;
  url_recibo: string | null;
  url_cep: string | null;
  aplicaciones: AplicacionRow[];
}

interface AplicacionRow {
  id: number;
  monto: number;
  concepto: string;
  es_multa: boolean;
}

interface AcuerdoRow {
  id: number;
  orden: number;
  monto: number;
  fecha_pago: string | null;
  pago_completado: boolean;
  concepto: string;
  totalAplicado: number;
  aplicaciones: {
    id: number;
    monto: number;
    es_multa: boolean;
    fecha_pago: string;
    metodo: string;
    clave_rastreo: string | null;
  }[];
}

const ClienteHistorialPagos = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const { impersonatedClientePersonaId, isImpersonating } = useClienteImpersonation();
  const effectivePersonaId = isImpersonating ? impersonatedClientePersonaId : profile?.id_persona;

  const { data: resumen, isLoading: resumenLoading } = useClienteResumenFinanciero(effectivePersonaId);
  const [selectedProperty, setSelectedProperty] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"pagos" | "acuerdos">("pagos");

  const properties = resumen?.properties || [];
  const activePropertyIdx = selectedProperty ?? (properties.length > 0 ? 0 : null);

  // Auto-select property from URL query param
  const cuentaIdParam = searchParams.get("cuentaId");
  useEffect(() => {
    if (cuentaIdParam && properties.length > 0) {
      const idx = properties.findIndex(p => p.cuentaId === Number(cuentaIdParam));
      if (idx !== -1) setSelectedProperty(idx);
    }
  }, [cuentaIdParam, properties.length]);
  const activeProp = activePropertyIdx !== null ? properties[activePropertyIdx] : null;

  return (
    <div className="max-w-lg mx-auto lg:max-w-none space-y-0">
      {/* Header */}
      <section className="px-5 pt-5 pb-2 lg:px-0">
        <h1 className="font-bold text-xl text-foreground">Historial de pagos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Consulta todos tus pagos y aplicaciones</p>
      </section>

      {resumenLoading ? (
        <div className="px-5 py-10 flex items-center justify-center gap-3 lg:px-0">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Cargando…</span>
        </div>
      ) : properties.length === 0 ? (
        <div className="px-5 py-10 text-center lg:px-0">
          <p className="text-sm text-muted-foreground">No se encontraron propiedades</p>
        </div>
      ) : (
        <>
          {/* Property selector */}
          {properties.length > 1 && (
            <section className="px-5 pt-4 pb-2 lg:px-0">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {properties.map((prop, idx) => (
                  <button
                    key={prop.cuentaId}
                    onClick={() => setSelectedProperty(idx)}
                    className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      activePropertyIdx === idx
                        ? "bg-[hsl(var(--inmob-green))]/10 border-[hsl(var(--inmob-green))]/30 text-[hsl(var(--inmob-green))]"
                        : "bg-card border-border text-muted-foreground hover:border-[hsl(var(--inmob-green))]/20"
                    }`}
                  >
                    {prop.proyecto} {prop.unidad}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Tabs */}
          <section className="px-5 pt-3 pb-1 lg:px-0">
            <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
              <button
                onClick={() => setActiveTab("pagos")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "pagos"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pagos
              </button>
              <button
                onClick={() => setActiveTab("acuerdos")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  activeTab === "acuerdos"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Aplicaciones de pago
              </button>
            </div>
          </section>

          {activeProp && activeTab === "pagos" && <PagosPropertySection property={activeProp} />}
          {activeProp && activeTab === "acuerdos" && <AcuerdosPropertySection property={activeProp} />}
        </>
      )}
    </div>
  );
};

/* ─────────── PAGOS TAB ─────────── */

function PagosPropertySection({ property }: { property: PropertyFinancialSummary }) {
  const { data: pagos, isLoading } = useQuery({
    queryKey: ["cliente-historial-pagos", property.cuentaId],
    queryFn: async (): Promise<PagoRow[]> => {
      const { data: pagosData } = await supabase
        .from("pagos")
        .select("id, fecha_pago, monto, descripcion, clave_rastreo, url_recibo, url_cep, id_metodos_pago, metodos_pago!fk_pagos_metodo(nombre)")
        .eq("id_cuenta_cobranza", property.cuentaId)
        .eq("activo", true)
        .order("fecha_pago", { ascending: true });

      if (!pagosData || pagosData.length === 0) return [];

      const pagoIds = pagosData.map((p: any) => p.id);

      const { data: aplicaciones } = await supabase
        .from("aplicaciones_pago")
        .select("id, id_pago, monto, es_multa, id_acuerdo_pago, acuerdos_pago!aplicaciones_pago_id_acuerdo_pago_fkey(id_concepto, conceptos_pago!acuerdos_pago_id_concepto_fkey(nombre))")
        .in("id_pago", pagoIds)
        .eq("activo", true);

      const appsByPago = new Map<number, AplicacionRow[]>();
      (aplicaciones || []).forEach((a: any) => {
        const concepto = a.acuerdos_pago?.conceptos_pago?.nombre || "Pago";
        const row: AplicacionRow = {
          id: a.id,
          monto: a.monto,
          concepto,
          es_multa: a.es_multa,
        };
        const existing = appsByPago.get(a.id_pago) || [];
        existing.push(row);
        appsByPago.set(a.id_pago, existing);
      });

      return pagosData.map((p: any) => ({
        id: p.id,
        fecha_pago: p.fecha_pago,
        monto: p.monto,
        descripcion: p.descripcion,
        clave_rastreo: p.clave_rastreo,
        metodo: (p.metodos_pago as any)?.nombre || "—",
        url_recibo: p.url_recibo,
        url_cep: p.url_cep,
        aplicaciones: appsByPago.get(p.id) || [],
      }));
    },
  });

  if (isLoading) {
    return (
      <section className="px-5 py-8 flex items-center justify-center gap-3 lg:px-0">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Cargando pagos…</span>
      </section>
    );
  }

  if (!pagos || pagos.length === 0) {
    return (
      <section className="px-5 py-8 text-center lg:px-0">
        <p className="text-sm text-muted-foreground">Sin pagos registrados para {property.proyecto} {property.unidad}</p>
      </section>
    );
  }

  const totalPagado = pagos.reduce((s, p) => s + p.monto, 0);

  return (
    <section className="px-5 pt-4 pb-8 lg:px-0 space-y-3">
      {/* Summary */}
      <div className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Total pagado</p>
          <p className="font-bold text-lg text-foreground tabular-nums">{fmtMXN(totalPagado)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Pagos</p>
          <p className="font-bold text-lg text-foreground tabular-nums">{pagos.length}</p>
        </div>
      </div>

      {/* Pagos list */}
      {pagos.map((pago) => (
        <PagoCard key={pago.id} pago={pago} />
      ))}
    </section>
  );
}

function PagoCard({ pago }: { pago: PagoRow }) {
  const [expanded, setExpanded] = useState(false);
  const [generatingRecibo, setGeneratingRecibo] = useState(false);

  const handleRecibo = async () => {
    setGeneratingRecibo(true);
    try {
      await reciboPagoService.generateRecibo({ pagoId: pago.id });
    } catch {
      toast.error("Error al generar el comprobante");
    } finally {
      setGeneratingRecibo(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full p-4 flex items-center justify-between text-left"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <CreditCard className="w-4 h-4 text-[hsl(var(--inmob-green))] shrink-0" />
              <span className="font-semibold text-sm text-foreground tabular-nums">{fmtMXN(pago.monto)}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
              <span>{fmtDate(pago.fecha_pago)}</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>{pago.metodo}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* CEP */}
            {pago.url_cep && (
              <button
                onClick={(e) => { e.stopPropagation(); window.open(pago.url_cep!, '_blank'); }}
                className="relative group p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title="Ver CEP"
              >
                <Eye className="w-4 h-4" />
                <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover border border-border px-2 py-1 text-xs text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity hidden lg:block">
                  Ver CEP
                </span>
              </button>
            )}
            {/* Comprobante */}
            <button
              onClick={(e) => { e.stopPropagation(); handleRecibo(); }}
              disabled={generatingRecibo}
              className="relative group p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Ver comprobante"
            >
              {generatingRecibo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
              <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover border border-border px-2 py-1 text-xs text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity hidden lg:block">
                Ver comprobante
              </span>
            </button>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="border-t border-border px-4 py-3 space-y-2 bg-muted/30">
            {pago.clave_rastreo && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Clave rastreo</span>
                <span className="font-mono text-foreground">{pago.clave_rastreo}</span>
              </div>
            )}
            {pago.descripcion && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Descripción</span>
                <span className="text-foreground">{pago.descripcion}</span>
              </div>
            )}

            {/* Documentos */}
            <div className="flex gap-2 pt-1">
              {pago.url_cep && (
                <button
                  onClick={() => window.open(pago.url_cep!, '_blank')}
                  className="flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--inmob-green))] hover:underline"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Evidencia formal
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
              {pago.url_recibo && (
                <button
                  onClick={() => window.open(pago.url_recibo!, '_blank')}
                  className="flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--inmob-green))] hover:underline"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Comprobante
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Aplicaciones */}
            {pago.aplicaciones.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Aplicaciones ({pago.aplicaciones.length})
                </p>
                {pago.aplicaciones.map((app) => (
                  <div key={app.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-foreground">{app.concepto}</span>
                      {app.es_multa && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">Multa</span>}
                    </div>
                    <span className="text-xs font-semibold text-foreground tabular-nums">{fmtMXN(app.monto)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/30">
                  <span className="text-[11px] font-semibold text-muted-foreground">Total aplicado</span>
                  <span className="text-xs font-bold text-foreground tabular-nums">
                    {fmtMXN(pago.aplicaciones.reduce((s, a) => s + a.monto, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────── ACUERDOS / APLICACIONES TAB ─────────── */

function AcuerdosPropertySection({ property }: { property: PropertyFinancialSummary }) {
  const { data: acuerdos, isLoading } = useQuery({
    queryKey: ["cliente-acuerdos-pago", property.cuentaId],
    queryFn: async (): Promise<AcuerdoRow[]> => {
      const { data: acuerdosData } = await supabase
        .from("acuerdos_pago")
        .select("id, orden, monto, fecha_pago, pago_completado, id_concepto")
        .eq("id_cuenta_cobranza", property.cuentaId)
        .eq("activo", true)
        .order("orden", { ascending: true });

      if (!acuerdosData || acuerdosData.length === 0) return [];

      const conceptoIds = [...new Set(acuerdosData.map((a: any) => a.id_concepto))];
      const acuerdoIds = acuerdosData.map((a: any) => a.id);

      const [conceptosRes, aplicacionesRes] = await Promise.all([
        supabase.from("conceptos_pago").select("id, nombre").in("id", conceptoIds),
        supabase
          .from("aplicaciones_pago")
          .select("id, monto, es_multa, id_acuerdo_pago, id_pago")
          .in("id_acuerdo_pago", acuerdoIds)
          .eq("activo", true),
      ]);

      const conceptos = conceptosRes.data || [];
      const aplicaciones = aplicacionesRes.data || [];

      // Get pago details
      const pagoIds = [...new Set(aplicaciones.map((a: any) => a.id_pago).filter(Boolean))];
      let pagosMap = new Map<number, any>();
      if (pagoIds.length > 0) {
        const { data: pagosData } = await supabase
          .from("pagos")
          .select("id, fecha_pago, clave_rastreo, metodos_pago!fk_pagos_metodo(nombre)")
          .in("id", pagoIds);
        (pagosData || []).forEach((p: any) => pagosMap.set(p.id, p));
      }

      return acuerdosData.map((a: any) => {
        const concepto = conceptos.find((c: any) => c.id === a.id_concepto);
        const apps = aplicaciones.filter((ap: any) => ap.id_acuerdo_pago === a.id);
        const totalAplicado = apps.reduce((s: number, ap: any) => s + (ap.monto || 0), 0);

        return {
          id: a.id,
          orden: a.orden,
          monto: a.monto,
          fecha_pago: a.fecha_pago,
          pago_completado: a.pago_completado,
          concepto: concepto?.nombre || "Sin concepto",
          totalAplicado,
          aplicaciones: apps.map((ap: any) => {
            const pago = pagosMap.get(ap.id_pago);
            return {
              id: ap.id,
              monto: ap.monto,
              es_multa: ap.es_multa,
              fecha_pago: pago?.fecha_pago || "",
              metodo: (pago?.metodos_pago as any)?.nombre || "—",
              clave_rastreo: pago?.clave_rastreo || null,
            };
          }),
        };
      });
    },
  });

  if (isLoading) {
    return (
      <section className="px-5 py-8 flex items-center justify-center gap-3 lg:px-0">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Cargando acuerdos…</span>
      </section>
    );
  }

  if (!acuerdos || acuerdos.length === 0) {
    return (
      <section className="px-5 py-8 text-center lg:px-0">
        <p className="text-sm text-muted-foreground">Sin acuerdos de pago para {property.proyecto} {property.unidad}</p>
      </section>
    );
  }

  const totalAcuerdos = acuerdos.reduce((s, a) => s + a.monto, 0);
  const totalAplicado = acuerdos.reduce((s, a) => s + a.totalAplicado, 0);
  const completados = acuerdos.filter(a => a.pago_completado).length;

  return (
    <section className="px-5 pt-4 pb-8 lg:px-0 space-y-3">
      {/* Summary */}
      <div className="bg-card rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Total acordado</p>
            <p className="font-bold text-lg text-foreground tabular-nums">{fmtMXN(totalAcuerdos)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">Aplicado</p>
            <p className="font-bold text-lg text-foreground tabular-nums">{fmtMXN(totalAplicado)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-[hsl(var(--inmob-green))]" />{completados} completados</span>
          <span className="flex items-center gap-1"><CircleDot className="w-3.5 h-3.5 text-amber-500" />{acuerdos.filter(a => !a.pago_completado && a.totalAplicado > 0).length} parciales</span>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-muted-foreground" />{acuerdos.filter(a => !a.pago_completado && a.totalAplicado === 0).length} pendientes</span>
        </div>
      </div>

      {/* Acuerdos list */}
      {acuerdos.map((acuerdo) => (
        <AcuerdoCard key={acuerdo.id} acuerdo={acuerdo} />
      ))}
    </section>
  );
}

function AcuerdoCard({ acuerdo }: { acuerdo: AcuerdoRow }) {
  const [expanded, setExpanded] = useState(false);
  const porcentaje = acuerdo.monto > 0 ? Math.min((acuerdo.totalAplicado / acuerdo.monto) * 100, 100) : 0;

  const status = acuerdo.pago_completado
    ? "completado"
    : acuerdo.totalAplicado > 0
    ? "parcial"
    : "pendiente";

  const statusConfig = {
    completado: {
      icon: <CheckCircle2 className="w-4 h-4 text-[hsl(var(--inmob-green))]" />,
      label: "Completado",
      badgeClass: "bg-[hsl(var(--inmob-green))]/10 text-[hsl(var(--inmob-green))]",
      barClass: "bg-[hsl(var(--inmob-green))]",
    },
    parcial: {
      icon: <CircleDot className="w-4 h-4 text-amber-500" />,
      label: "Parcial",
      badgeClass: "bg-amber-500/10 text-amber-600",
      barClass: "bg-amber-500",
    },
    pendiente: {
      icon: <Clock className="w-4 h-4 text-muted-foreground" />,
      label: "Pendiente",
      badgeClass: "bg-muted text-muted-foreground",
      barClass: "bg-muted-foreground/30",
    },
  };

  const cfg = statusConfig[status];

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {cfg.icon}
            <span className="font-semibold text-sm text-foreground truncate">{acuerdo.concepto}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${cfg.badgeClass}`}>
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground">
            {acuerdo.fecha_pago ? fmtDate(acuerdo.fecha_pago) : "Sin fecha"}
            <span className="mx-1.5">·</span>
            #{acuerdo.orden}
          </span>
          <span className="font-semibold text-foreground tabular-nums">{fmtMXN(acuerdo.monto)}</span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${cfg.barClass}`}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Aplicado: {fmtMXN(acuerdo.totalAplicado)}</span>
          <span>Restante: {fmtMXN(Math.max(acuerdo.monto - acuerdo.totalAplicado, 0))}</span>
        </div>
      </button>

      {expanded && acuerdo.aplicaciones.length > 0 && (
        <div className="border-t border-border px-4 py-3 space-y-1.5 bg-muted/30">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Pagos aplicados ({acuerdo.aplicaciones.length})
          </p>
          {acuerdo.aplicaciones.map((app) => (
            <div key={app.id} className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-foreground">{app.fecha_pago ? fmtDate(app.fecha_pago) : "—"}</span>
                <span className="text-[10px] text-muted-foreground">{app.metodo}</span>
                {app.clave_rastreo && <span className="text-[10px] font-mono text-muted-foreground">{app.clave_rastreo}</span>}
                {app.es_multa && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">Multa</span>}
              </div>
              <span className="text-xs font-semibold text-foreground tabular-nums">{fmtMXN(app.monto)}</span>
            </div>
          ))}
        </div>
      )}

      {expanded && acuerdo.aplicaciones.length === 0 && (
        <div className="border-t border-border px-4 py-3 bg-muted/30">
          <p className="text-xs text-muted-foreground text-center">Sin pagos aplicados aún</p>
        </div>
      )}
    </div>
  );
}

export default ClienteHistorialPagos;
