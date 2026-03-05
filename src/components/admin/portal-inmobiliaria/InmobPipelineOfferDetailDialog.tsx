import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, ChevronDown, ChevronUp, FileText, User, Building2, Calendar, DollarSign, Lock, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: any;
  stageInfo: { key: string; label: string; color: string };
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(v);

export function InmobPipelineOfferDetailDialog({ open, onOpenChange, card, stageInfo }: Props) {
  const [expandedSchemes, setExpandedSchemes] = useState(true);

  const isProducto = card?.is_producto;
  const alreadyHasScheme = !!card?.id_esquema_pago_seleccionado;

  const ofertaLabel = isProducto
    ? `OP-${String(card?.id).padStart(6, "0")}`
    : `O-${String(card?.id).padStart(6, "0")}`;

  // Fetch property details for resolving project
  const { data: propertyDetail } = useQuery({
    queryKey: ["inmob-pipeline-prop-detail", card?.id_propiedad],
    queryFn: async () => {
      if (!card?.id_propiedad) return null;
      const { data } = await (supabase as any)
        .from("propiedades")
        .select("id, numero_propiedad, precio_lista, id_edificio_modelo")
        .eq("id", card.id_propiedad)
        .limit(1)
        .single();
      return data;
    },
    enabled: open && !!card?.id_propiedad,
  });

  // Fetch payment schemes
  const { data: schemes = [], isLoading: schemesLoading } = useQuery({
    queryKey: ["inmob-pipeline-schemes", card?.id_propiedad, isProducto, card?.id_producto, propertyDetail?.id_edificio_modelo, card?.id_esquema_pago_seleccionado],
    queryFn: async () => {
      let projectId: number | null = null;

      if (isProducto) {
        if (!card?.id_producto) return [];
        const { data: prod } = await (supabase as any)
          .from("productos_servicios")
          .select("id_proyecto")
          .eq("id", card.id_producto)
          .limit(1)
          .single();
        projectId = prod?.id_proyecto || null;
      } else {
        if (!propertyDetail?.id_edificio_modelo) return [];
        const { data: emData } = await (supabase as any)
          .from("edificios_modelos")
          .select("id_edificio")
          .eq("id", propertyDetail.id_edificio_modelo)
          .limit(1)
          .single();
        if (!emData?.id_edificio) return [];
        const { data: edificio } = await (supabase as any)
          .from("edificios")
          .select("id_proyecto")
          .eq("id", emData.id_edificio)
          .limit(1)
          .single();
        projectId = edificio?.id_proyecto || null;
      }

      if (!projectId) return [];

      // If the offer has a selected scheme, check if it's manual
      if (card?.id_esquema_pago_seleccionado) {
        const { data: selectedScheme } = await (supabase as any)
          .from("esquemas_pago")
          .select("*")
          .eq("id", card.id_esquema_pago_seleccionado)
          .limit(1)
          .single();

        if (selectedScheme?.es_manual) {
          // Manual offer: show only the manual scheme with label "Manual"
          return [{ ...selectedScheme, nombre: "Manual" }];
        }
      }

      // Non-manual: show all preloaded schemes
      const { data: nonManual } = await (supabase as any)
        .from("esquemas_pago")
        .select("*")
        .eq("id_proyecto", projectId)
        .eq("activo", true)
        .eq("es_manual", false)
        .order("nombre");

      return nonManual || [];
    },
    enabled: open && (isProducto ? !!card?.id_producto : !!propertyDetail?.id_edificio_modelo),
  });

  const precioBase = isProducto ? card?.precio : (propertyDetail?.precio_lista || card?.precio);
  const isAsignada = card?.estatus_disponibilidad === 10;
  const isRegistro = !isAsignada && card?.precio_final_cuenta != null && card?.precio_final_cuenta === 0 && !!card?.cuenta_cobranza_id;
  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg mx-auto p-0 gap-0 rounded-2xl max-h-[90vh]">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="text-base font-bold text-center">Detalle de Oferta</DialogTitle>
          <p className="text-xs text-muted-foreground text-center">
            {isProducto ? card.producto_nombre : card.propiedad_nombre}
            {card.proyecto_nombre ? ` · ${card.proyecto_nombre}` : ""}
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh]">
          <div className="p-4 space-y-4">
            {/* Info */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-mono">Oferta: {ofertaLabel}</span>
                <Badge className={cn("text-[10px] border-0", stageInfo.color)}>{stageInfo.label}</Badge>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {isProducto ? "Producto" : "Propiedad"}
                </Badge>
                {isProducto && card.producto_nombre && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{card.producto_nombre}</Badge>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">{card.lead_nombre || "Sin cliente"}</span>
              </div>

              {card.proyecto_nombre && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span>{card.proyecto_nombre} · {card.propiedad_nombre || "—"}</span>
                </div>
              )}

              {card.cuenta_cobranza_id && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="font-mono">{isProducto ? "CCP" : "CC"}-{String(card.cuenta_cobranza_id).padStart(6, "0")}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" />
                <span>{format(new Date(card.fecha_generacion), "dd MMM yyyy", { locale: es })}</span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="truncate">Agente: {card.agente_nombre || card.email_creador}</span>
              </div>
            </div>

            {/* Price */}
            {precioBase != null && precioBase > 0 && (
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-center">
                <p className="text-xs text-muted-foreground">Precio {isProducto ? "Producto" : "Propiedad"}:</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(precioBase)}</p>
              </div>
            )}

            {/* Special cases or Payment Schemes */}
            {isAsignada ? (
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Propiedad Asignada</p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Esta oferta corresponde a una asignación directa de la unidad. No genera esquema de pagos.
                  </p>
                </div>
              </div>
            ) : isRegistro ? (
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Registro de Unidad</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Oferta generada para registrar la unidad en el sistema. No tiene pagos asociados.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => setExpandedSchemes(!expandedSchemes)}
                  className="flex items-center justify-between w-full text-sm font-semibold text-foreground"
                >
                  <span>Esquemas de Pago ({schemes.length})</span>
                  {expandedSchemes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {expandedSchemes && (
                  <div className="space-y-2">
                    {schemesLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : schemes.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-3">No hay esquemas disponibles</p>
                    ) : (
                      schemes.map((scheme: any) => {
                        const isSelected = scheme.id === card.id_esquema_pago_seleccionado;
                        const descuento = scheme.porcentaje_descuento_aumento;
                        const base = precioBase || 0;
                        const precioFinal = descuento ? base * (1 + descuento / 100) : base;
                        const enganche = (scheme.porcentaje_enganche || 0) / 100 * precioFinal;
                        const entrega = (scheme.porcentaje_entrega || 0) / 100 * precioFinal;
                        const mensualidades = (scheme.porcentaje_mensualidades || 0) / 100 * precioFinal;
                        const numMens = scheme.numero_mensualidades || 1;
                        const mensualidad = mensualidades / numMens;

                        const pctEnganche = scheme.porcentaje_enganche || 0;
                        const pctMensualidades = scheme.porcentaje_mensualidades || 0;
                        const pctEntrega = scheme.porcentaje_entrega || 0;

                        const headerParts: string[] = [];
                        if (pctEnganche > 0) headerParts.push(`${pctEnganche}% Enganche`);
                        if (pctMensualidades > 0) headerParts.push(`${pctMensualidades}% Mensualidades`);
                        if (pctEntrega > 0) headerParts.push(`${pctEntrega}% Entrega`);

                        return (
                          <div
                            key={scheme.id}
                            className={cn(
                              "rounded-xl border-2 p-3 transition-all",
                              isSelected
                                ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                                : "border-border"
                            )}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                {isSelected && <Check className="h-4 w-4 text-primary" />}
                                <span className="text-sm font-semibold">{scheme.nombre}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {isSelected && (
                                  <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30">
                                    Seleccionado
                                  </Badge>
                                )}
                                {descuento != null && descuento !== 0 && (
                                  <Badge className={cn(
                                    "text-[10px]",
                                    descuento < 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                                  )}>
                                    {descuento > 0 ? "+" : ""}{descuento}%
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="text-xs text-muted-foreground space-y-0.5">
                              {headerParts.length > 0 && <p>{headerParts.join("  ")}</p>}
                              {numMens > 1 && <p>{numMens} meses</p>}
                              {scheme.es_manual && headerParts.length === 0 && (
                                <p className="italic">Esquema personalizado — pagos en cuenta de cobranza</p>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 text-[11px]">
                              {enganche > 0 && <span className="text-emerald-700 dark:text-emerald-400">Enganche: {formatCurrency(enganche)}</span>}
                              {mensualidad > 0 && <span className="text-purple-700 dark:text-purple-400">Mensualidad: {formatCurrency(mensualidad)}</span>}
                              {entrega > 0 && <span className="text-emerald-700 dark:text-emerald-400">Entrega: {formatCurrency(entrega)}</span>}
                              <span className="text-muted-foreground">Precio final: {formatCurrency(precioFinal)}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
