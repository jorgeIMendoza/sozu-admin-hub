import { useState } from "react";
import { ArrowLeft, CreditCard, FileText, ChevronDown, ChevronUp, Loader2, Receipt, Eye, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

const ClienteHistorialPagos = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { impersonatedClientePersonaId, isImpersonating } = useClienteImpersonation();
  const effectivePersonaId = isImpersonating ? impersonatedClientePersonaId : profile?.id_persona;

  const { data: resumen, isLoading: resumenLoading } = useClienteResumenFinanciero(effectivePersonaId);
  const [selectedProperty, setSelectedProperty] = useState<number | null>(null);

  const properties = resumen?.properties || [];
  const activePropertyIdx = selectedProperty ?? (properties.length > 0 ? 0 : null);
  const activeProp = activePropertyIdx !== null ? properties[activePropertyIdx] : null;

  return (
    <div className="max-w-lg mx-auto lg:max-w-none space-y-0">
      {/* Header */}
      <section className="px-5 pt-5 pb-2 lg:px-0">
        <button onClick={() => navigate("/admin/portal-cliente/inicio")} className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3 hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Inicio
        </button>
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

          {activeProp && <PagosPropertySection property={activeProp} />}
        </>
      )}
    </div>
  );
};

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
      toast.error("Error al generar el recibo");
    } finally {
      setGeneratingRecibo(false);
    }
  };

  return (
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
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{fmtDate(pago.fecha_pago)}</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span>{pago.metodo}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Evidencia de pago (CEP) */}
          {pago.url_cep && (
            <button
              onClick={(e) => { e.stopPropagation(); window.open(pago.url_cep!, '_blank'); }}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="Ver evidencia de pago"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          {/* Recibo de pago */}
          <button
            onClick={(e) => { e.stopPropagation(); handleRecibo(); }}
            disabled={generatingRecibo}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Descargar recibo de pago"
          >
            {generatingRecibo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
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
                Evidencia de pago
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
            {pago.url_recibo && (
              <button
                onClick={() => window.open(pago.url_recibo!, '_blank')}
                className="flex items-center gap-1.5 text-xs font-medium text-[hsl(var(--inmob-green))] hover:underline"
              >
                <Receipt className="w-3.5 h-3.5" />
                Recibo
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
  );
}

export default ClienteHistorialPagos;
