import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, ChevronDown, ChevronUp, FileText, User, Building2, Calendar, Tag, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PipelineOfferDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  oferta: any;
  formatCurrency: (v: number) => string;
  stageInfo: { key: string; label: string; color: string; borderColor: string };
}

export function PipelineOfferDetailDialog({
  open,
  onOpenChange,
  oferta,
  formatCurrency,
  stageInfo,
}: PipelineOfferDetailDialogProps) {
  const queryClient = useQueryClient();
  const [expandedSchemes, setExpandedSchemes] = useState(true);
  const [selectedSchemeId, setSelectedSchemeId] = useState<number | null>(null);

  const isProducto = oferta?.is_producto;
  const alreadyHasScheme = !!oferta?.id_esquema_pago_seleccionado;

  // Fetch property details
  const { data: propertyDetail } = useQuery({
    queryKey: ['pipeline-property', oferta?.id_propiedad],
    queryFn: async () => {
      if (!oferta?.id_propiedad) return null;
      const { data } = await (supabase as any)
        .from('propiedades')
        .select('id, numero_propiedad, precio_lista, id_edificio_modelo')
        .eq('id', oferta.id_propiedad)
        .limit(1)
        .single();
      return data;
    },
    enabled: open && !!oferta?.id_propiedad,
  });

  // Fetch associated products (bodegas + estacionamientos)
  const { data: asociados = [] } = useQuery({
    queryKey: ['pipeline-asociados', oferta?.id_propiedad],
    queryFn: async () => {
      if (!oferta?.id_propiedad) return [];
      const [{ data: bodegas }, { data: estacs }] = await Promise.all([
        (supabase as any).from('bodegas').select('id, nombre, m2, es_incluido, id_producto').eq('id_propiedad', oferta.id_propiedad).eq('activo', true),
        (supabase as any).from('estacionamientos').select('id, nombre, m2, es_incluido, id_producto').eq('id_propiedad', oferta.id_propiedad).eq('activo', true),
      ]);

      const prodIds = [
        ...((bodegas || []).filter((b: any) => !b.es_incluido).map((b: any) => b.id_producto)),
        ...((estacs || []).filter((e: any) => !e.es_incluido).map((e: any) => e.id_producto)),
      ].filter(Boolean);

      let prodMap = new Map<number, any>();
      if (prodIds.length > 0) {
        const { data: prods } = await (supabase as any).from('productos_servicios').select('id, nombre, precio_lista').in('id', prodIds);
        (prods || []).forEach((p: any) => prodMap.set(p.id, p));
      }

      const items: any[] = [];
      (bodegas || []).forEach((b: any) => {
        const prod = prodMap.get(b.id_producto);
        items.push({ type: 'bodega', name: b.nombre, es_incluido: b.es_incluido, precio: prod?.precio_lista || 0 });
      });
      (estacs || []).forEach((e: any) => {
        const prod = prodMap.get(e.id_producto);
        items.push({ type: 'estacionamiento', name: e.nombre, es_incluido: e.es_incluido, precio: prod?.precio_lista || 0 });
      });
      return items;
    },
    enabled: open && !!oferta?.id_propiedad && !isProducto,
  });

  // Fetch payment schemes
  const { data: schemes = [], isLoading: schemesLoading } = useQuery({
    queryKey: ['pipeline-schemes', oferta?.id_propiedad, isProducto, oferta?.id_producto],
    queryFn: async () => {
      if (isProducto) {
        // For product offers, fetch esquemas_pago from the product's project
        if (!oferta?.id_producto) return [];
        const { data: prod } = await (supabase as any)
          .from('productos_servicios')
          .select('id_proyecto')
          .eq('id', oferta.id_producto)
          .limit(1)
          .single();
        if (!prod?.id_proyecto) return [];
        const { data } = await (supabase as any)
          .from('esquemas_pago')
          .select('*')
          .eq('id_proyecto', prod.id_proyecto)
          .eq('activo', true)
          .eq('es_manual', false)
          .order('nombre');
        return data || [];
      }

      if (!propertyDetail?.id_edificio_modelo) return [];
      const { data: emData } = await (supabase as any)
        .from('edificios_modelos')
        .select('id_edificio')
        .eq('id', propertyDetail.id_edificio_modelo)
        .limit(1)
        .single();
      if (!emData?.id_edificio) return [];

      const { data: edificio } = await (supabase as any)
        .from('edificios')
        .select('id_proyecto')
        .eq('id', emData.id_edificio)
        .limit(1)
        .single();
      if (!edificio?.id_proyecto) return [];

      const { data } = await (supabase as any)
        .from('esquemas_pago')
        .select('*')
        .eq('id_proyecto', edificio.id_proyecto)
        .eq('activo', true)
        .eq('es_manual', false)
        .order('nombre');
      return data || [];
    },
    enabled: open && (isProducto ? !!oferta?.id_producto : !!propertyDetail?.id_edificio_modelo),
  });

  // Save selected scheme
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSchemeId) throw new Error("Selecciona un plan");
      const { error } = await (supabase as any)
        .from('ofertas')
        .update({
          id_esquema_pago_seleccionado: selectedSchemeId,
          id_estatus_aprobacion: 2, // Aprobada (preloaded scheme)
          url: null, // Force PDF regeneration
        })
        .eq('id', oferta.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plan de pago guardado");
      queryClient.invalidateQueries({ queryKey: ['agent-pipeline'] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message || "Error al guardar"),
  });

  const precioBase = isProducto
    ? oferta?.precio
    : (propertyDetail?.precio_lista || oferta?.precio);

  const productosAdicionales = useMemo(() => {
    return asociados.filter((a: any) => !a.es_incluido);
  }, [asociados]);

  const totalProductosAdicionales = useMemo(() => {
    return productosAdicionales.reduce((sum: number, a: any) => sum + (a.precio || 0), 0);
  }, [productosAdicionales]);

  const ofertaLabel = isProducto
    ? `OP-${String(oferta?.id).padStart(6, '0')}`
    : `O-${String(oferta?.id).padStart(6, '0')}`;

  if (!oferta) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md mx-auto p-0 gap-0 rounded-2xl max-h-[90vh]">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="text-base font-bold text-center">
            Detalle de Oferta
          </DialogTitle>
          <p className="text-xs text-muted-foreground text-center">
            {isProducto ? oferta.producto_nombre : oferta.propiedad_nombre}
            {oferta.proyecto_nombre ? ` de ${oferta.proyecto_nombre}` : ''}
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh]">
          <div className="p-4 space-y-4">
            {/* Offer info */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground font-mono">Oferta: {ofertaLabel}</span>
                <Badge className={cn("text-[10px] border-0", stageInfo.color)}>{stageInfo.label}</Badge>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">{oferta.lead_nombre}</span>
              </div>

              {oferta.inmobiliaria_nombre && (
                <div className="flex items-center gap-1.5 text-xs">
                  <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className={cn("truncate font-medium", oferta.inmobiliaria_nombre === 'Interno' ? 'text-orange-600' : 'text-primary')}>
                    {oferta.inmobiliaria_nombre}
                  </span>
                </div>
              )}

              {oferta.cuenta_cobranza_id && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3 shrink-0" />
                  <span>{formatCuentaCobranzaId(oferta.cuenta_cobranza_id, isProducto ? 'Producto' : 'Propiedad')}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" />
                <span>{format(new Date(oferta.fecha_generacion), "dd MMM yyyy", { locale: es })}</span>
              </div>
            </div>

            {/* Price section */}
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 space-y-1">
              {totalProductosAdicionales > 0 ? (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Precio {isProducto ? 'Producto' : 'Propiedad'}:</span>
                    <span className="font-semibold">{formatCurrency(precioBase || 0)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Productos adicionales:</span>
                    <span className="text-orange-600 font-medium">+{formatCurrency(totalProductosAdicionales)}</span>
                  </div>
                  <div className="border-t border-emerald-200 dark:border-emerald-700 pt-1 flex justify-between">
                    <span className="text-xs font-semibold">Total:</span>
                    <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                      {formatCurrency((precioBase || 0) + totalProductosAdicionales)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Precio {isProducto ? 'Producto' : 'Propiedad'}:</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(precioBase || 0)}</p>
                </div>
              )}
            </div>

            {/* Associated products */}
            {asociados.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  Productos asociados a esta propiedad:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {asociados.map((a: any, i: number) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        a.es_incluido
                          ? "bg-blue-50 text-blue-700 border-blue-300"
                          : "bg-orange-50 text-orange-700 border-orange-300"
                      )}
                    >
                      {a.es_incluido ? '↔' : '🔒'} {a.name}
                      {a.es_incluido ? ' (incluido)' : ` (${formatCurrency(a.precio)})`}
                    </Badge>
                  ))}
                </div>
                {productosAdicionales.length > 0 && (
                  <p className="text-[10px] text-muted-foreground italic">
                    Los productos No incluidos generan ofertas adicionales.
                  </p>
                )}
              </div>
            )}

            {/* Payment Schemes */}
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
                      const isSelected = alreadyHasScheme
                        ? scheme.id === oferta.id_esquema_pago_seleccionado
                        : scheme.id === selectedSchemeId;
                      const isLocked = alreadyHasScheme;
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

                      // Build header parts, skip 0%
                      const headerParts: string[] = [];
                      if (pctEnganche > 0) headerParts.push(`${pctEnganche}% Enganche`);
                      if (pctMensualidades > 0) headerParts.push(`${pctMensualidades}% Mensualidades`);
                      if (pctEntrega > 0) headerParts.push(`${pctEntrega}% Entrega`);

                      return (
                        <div
                          key={scheme.id}
                          onClick={() => {
                            if (!isLocked) {
                              setSelectedSchemeId(prev => prev === scheme.id ? null : scheme.id);
                            }
                          }}
                          className={cn(
                            "rounded-xl border-2 p-3 transition-all",
                            isSelected
                              ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm"
                              : "border-border hover:border-muted-foreground/30",
                            isLocked && !isSelected && "opacity-50",
                            !isLocked && "cursor-pointer"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              {isSelected && <Check className="h-4 w-4 text-emerald-600" />}
                              {isLocked && !isSelected && <Lock className="h-3 w-3 text-muted-foreground" />}
                              <span className="text-sm font-semibold">{scheme.nombre}</span>
                            </div>
                            {descuento != null && descuento !== 0 && (
                              <Badge className={cn(
                                "text-[10px]",
                                descuento < 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                              )}>
                                {descuento > 0 ? '+' : ''}{descuento}%
                              </Badge>
                            )}
                          </div>

                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <p>{headerParts.join('  ')}</p>
                            {numMens > 1 && <p>{numMens} meses</p>}
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

          </div>
        </ScrollArea>

        {/* Sticky save button */}
        {!alreadyHasScheme && selectedSchemeId && (
          <div className="border-t p-3 bg-background">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Guardar plan seleccionado
            </Button>
          </div>
        )}

        {alreadyHasScheme && (
          <div className="border-t p-2 bg-background text-center">
            <p className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
              <Lock className="h-3 w-3" /> Plan ya seleccionado — no se puede cambiar
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
