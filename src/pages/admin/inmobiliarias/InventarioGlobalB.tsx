import { useNavigate } from "react-router-dom";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useInventarioDisponible, InventarioPropiedad } from "@/hooks/useInventarioDisponible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Building2, Loader2, ArrowLeft, BedDouble, Bath, ShowerHead, Maximize2, DollarSign, FileText, ChevronDown, X, Package, Layers, Car, ChevronLeft, ChevronRight } from "lucide-react";
import bodegaIcon from "@/assets/icons/bodega.png";
import { useState, useMemo, useCallback, useEffect } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { NewOfferDialog } from "@/components/admin/NewOfferDialog";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { useCtaTracker } from "@/hooks/useCtaTracker";

const PAGE = "/admin/inmobiliarias/inventario";

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const InventarioGlobalB = () => {
  const navigate = useNavigate();
  const { canGenerateOffer } = usePagePermissions('/admin/inmobiliarias/inventario');
  const { propiedades: rawPropiedades, isLoading } = useInventarioDisponible();
  const { track } = useCtaTracker();

  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [selectedSchemeId, setSelectedSchemeId] = useState<number | null>(null);
  const [schemesOpen, setSchemesOpen] = useState(false);
  const [filterProjectNames, setFilterProjectNames] = useState<string[]>([]);
  const [filterModelNames, setFilterModelNames] = useState<string[]>([]);
  const [filterBedrooms, setFilterBedrooms] = useState<string[]>([]);
  const [filterBodega, setFilterBodega] = useState<string | null>(null);
  const [filterEstacionamiento, setFilterEstacionamiento] = useState<string | null>(null);

  const allProps = useMemo(() => {
    return rawPropiedades.map((p: InventarioPropiedad) => {
      const propImgs = p.propiedad_imagenes || [];
      const modelImgs = p.modelo_imagenes || [];
      const rawImages = shuffleArray(propImgs.length > 0 ? propImgs : modelImgs);
      return {
        id: p.id,
        numero_propiedad: p.numero_propiedad,
        numero: p.numero_propiedad,
        piso: p.numero_piso,
        precio_lista: p.precio_lista,
        m2_interiores: p.m2_interiores,
        m2_exteriores: p.m2_exteriores,
        m2_total: (p.m2_interiores || 0) + (p.m2_exteriores || 0),
        proyecto_id: p.proyecto_id,
        proyecto_nombre: p.proyecto_nombre,
        edificio_nombre: p.edificio_nombre,
        modelo_id: p.modelo_id,
        modelo_nombre: p.modelo_nombre,
        recamaras: p.numero_recamaras,
        banos: p.numero_completo_banos,
        medio_bano: p.numero_medio_bano,
        bodegas_count: p.bodegas_count,
        estacionamientos_count: p.estacionamientos_count,
        estacionamientos_tipos: p.estacionamientos_tipos || [],
        model_images: rawImages,
        esquemas_pago: p.esquemas_pago || [],
      };
    });
  }, [rawPropiedades]);

  // Filter options
  const projectNames = useMemo(() => [...new Set(allProps.map(p => p.proyecto_nombre))].sort(), [allProps]);
  const modelNames = useMemo(() => {
    let src = allProps;
    if (filterProjectNames.length) src = src.filter(p => filterProjectNames.includes(p.proyecto_nombre));
    return [...new Set(src.map(p => p.modelo_nombre).filter(Boolean))].sort();
  }, [allProps, filterProjectNames]);
  const bedroomOpts = useMemo(() => [...new Set(allProps.filter(p => p.recamaras > 0).map(p => `${p.recamaras} rec.`))].sort(), [allProps]);

  // Filtered
  const filtered = useMemo(() => {
    let r = allProps;
    if (filterProjectNames.length) r = r.filter(p => filterProjectNames.includes(p.proyecto_nombre));
    if (filterModelNames.length) r = r.filter(p => filterModelNames.includes(p.modelo_nombre));
    if (filterBedrooms.length) {
      const nums = filterBedrooms.map(b => parseInt(b));
      r = r.filter(p => nums.includes(p.recamaras));
    }
    if (filterBodega === "con") r = r.filter(p => p.bodegas_count > 0);
    else if (filterBodega === "sin") r = r.filter(p => p.bodegas_count === 0);
    if (filterEstacionamiento === "con") r = r.filter(p => p.estacionamientos_count > 0);
    else if (filterEstacionamiento === "sin") r = r.filter(p => p.estacionamientos_count === 0);
    return r;
  }, [allProps, filterProjectNames, filterModelNames, filterBedrooms, filterBodega, filterEstacionamiento]);

  // Group by project
  const groupedByProject = useMemo(() => {
    const map = new Map<string, any[]>();
    filtered.forEach(p => {
      if (!map.has(p.proyecto_nombre)) map.set(p.proyecto_nombre, []);
      map.get(p.proyecto_nombre)!.push(p);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const hasActiveFilters = filterProjectNames.length > 0 || filterModelNames.length > 0 || filterBedrooms.length > 0 || filterBodega !== null || filterEstacionamiento !== null;

  const clearAllFilters = () => {
    setFilterProjectNames([]); setFilterModelNames([]); setFilterBedrooms([]); setFilterBodega(null); setFilterEstacionamiento(null);
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(price);

  const calcSchemeAmounts = (scheme: any, precioLista: number) => {
    const descuento = scheme.porcentaje_descuento_aumento || 0;
    const precioAjustado = precioLista * (1 + descuento / 100);
    const enganche = precioAjustado * ((scheme.porcentaje_enganche || 0) / 100);
    const mensualidadesTotal = precioAjustado * ((scheme.porcentaje_mensualidades || 0) / 100);
    const entrega = precioAjustado * ((scheme.porcentaje_entrega || 0) / 100);
    const numMensualidades = scheme.numero_mensualidades || 1;
    const mensualidad = numMensualidades > 0 ? mensualidadesTotal / numMensualidades : 0;
    return { precioAjustado, enganche, mensualidadesTotal, entrega, mensualidad, numMensualidades };
  };

  useEffect(() => { setSelectedSchemeId(null); setSchemesOpen(false); }, [selectedProperty?.id]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10 px-3">
      <button
        onClick={() => navigate("/admin/inmobiliarias/proyectos")}
        className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 text-primary font-medium text-sm border border-primary/20 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300"
      >
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        <span className="tracking-wide">Volver</span>
      </button>

      <div className="px-1 space-y-1">
        <h1 className="text-xl font-bold text-foreground">Inventario Disponible</h1>
        <p className="text-sm text-muted-foreground">{filtered.length} unidades disponibles</p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MultiSelectFilter values={filterProjectNames} onValuesChange={(v) => { setFilterProjectNames(v); track({ page: PAGE, elementId: "filter_project", elementLabel: "Filtro Proyecto", metadata: { values: v } }); }} options={projectNames} placeholder="Proyectos" icon={<Building2 className="h-3.5 w-3.5" />} />
          <MultiSelectFilter values={filterModelNames} onValuesChange={(v) => { setFilterModelNames(v); track({ page: PAGE, elementId: "filter_model", elementLabel: "Filtro Modelo", metadata: { values: v } }); }} options={modelNames} placeholder="Modelos" />
          <MultiSelectFilter values={filterBedrooms} onValuesChange={(v) => { setFilterBedrooms(v); track({ page: PAGE, elementId: "filter_bedrooms", elementLabel: "Filtro Recámaras", metadata: { values: v } }); }} options={bedroomOpts} placeholder="Recámaras" icon={<BedDouble className="h-3.5 w-3.5" />} />
          <MultiSelectFilter
            values={filterBodega ? [filterBodega === "con" ? "Con bodega" : "Sin bodega"] : []}
            onValuesChange={(vals) => { const v = vals.length === 0 ? null : vals[vals.length - 1] === "Con bodega" ? "con" : "sin"; setFilterBodega(v); track({ page: PAGE, elementId: "filter_bodega", elementLabel: "Filtro Bodega", metadata: { value: v } }); }}
            options={["Con bodega", "Sin bodega"]}
            placeholder="Bodega"
            icon={<img src={bodegaIcon} alt="" className="h-3.5 w-3.5 opacity-60" />}
          />
          <MultiSelectFilter
            values={filterEstacionamiento ? [filterEstacionamiento === "con" ? "Con estac." : "Sin estac."] : []}
            onValuesChange={(vals) => { const v = vals.length === 0 ? null : vals[vals.length - 1] === "Con estac." ? "con" : "sin"; setFilterEstacionamiento(v); track({ page: PAGE, elementId: "filter_estacionamiento", elementLabel: "Filtro Estacionamiento", metadata: { value: v } }); }}
            options={["Con estac.", "Sin estac."]}
            placeholder="Estac."
            icon={<Car className="h-3.5 w-3.5" />}
          />
        </div>
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtros:</span>
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2 text-destructive" onClick={clearAllFilters}>
              <X className="h-3 w-3 mr-1" /> Limpiar
            </Button>
          </div>
        )}
      </div>

      {/* Grouped by project - horizontal carousels */}
      {groupedByProject.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No hay propiedades disponibles</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedByProject.map(([projectName, props]) => (
            <div key={projectName} className="space-y-3">
              <div className="flex items-center gap-3 px-1">
                <Building2 className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">{projectName}</h2>
                <Badge variant="secondary" className="text-xs">{props.length} disponibles</Badge>
              </div>
              <ProjectCarousel
                properties={props}
                formatPrice={formatPrice}
                onSelectProperty={(p) => {
                  setSelectedProperty(p);
                  track({ page: PAGE, elementId: "view_property_detail", elementLabel: `Depto ${p.numero}`, metadata: { propertyId: p.id, project: projectName } });
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Property Detail Dialog — same as Variant A */}
      <Dialog open={!!selectedProperty} onOpenChange={(open) => !open && setSelectedProperty(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
            <DialogTitle>Departamento {selectedProperty?.numero || selectedProperty?.id} de {selectedProperty?.proyecto_nombre}</DialogTitle>
          </DialogHeader>
          {selectedProperty && (
            <>
              <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-4">
                {selectedProperty.model_images?.length > 0 && <DetailCarousel images={selectedProperty.model_images} />}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground"><Building2 className="h-3 w-3 text-muted-foreground" /> {selectedProperty.proyecto_nombre}</span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">{selectedProperty.edificio_nombre}</span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">{selectedProperty.modelo_nombre}</span>
                  {selectedProperty.piso && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground"><Layers className="h-3 w-3 text-muted-foreground" /> Nivel {selectedProperty.piso}</span>}
                  {selectedProperty.m2_total > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground"><Maximize2 className="h-3 w-3 text-muted-foreground" /> {selectedProperty.m2_total.toFixed(2)} m²</span>}
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {selectedProperty.recamaras > 0 && <span className="flex items-center gap-1"><BedDouble className="h-4 w-4" /> {selectedProperty.recamaras} rec.</span>}
                  {selectedProperty.banos > 0 && <span className="flex items-center gap-1"><Bath className="h-4 w-4" /> {selectedProperty.banos} baño{selectedProperty.banos > 1 ? "s" : ""}</span>}
                  {selectedProperty.medio_bano > 0 && <span className="flex items-center gap-1"><ShowerHead className="h-4 w-4" /> {selectedProperty.medio_bano} m. baño</span>}
                </div>
                {selectedProperty.precio_lista > 0 && (
                  <div className="bg-primary/5 rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground">Precio de Lista</p>
                    <p className="text-xl font-bold text-foreground">{formatPrice(selectedProperty.precio_lista)}</p>
                  </div>
                )}

                {/* Payment schemes */}
                {(selectedProperty.esquemas_pago || []).length > 0 && (
                  <Collapsible open={schemesOpen} onOpenChange={(o) => { setSchemesOpen(o); if (o) track({ page: PAGE, elementId: "expand_schemes", elementLabel: "Expandir Esquemas", metadata: { propertyId: selectedProperty.id } }); }}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
                      <p className="text-sm font-semibold text-foreground">Esquemas de Pago ({selectedProperty.esquemas_pago.length})</p>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${schemesOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-1">
                      {selectedProperty.esquemas_pago.map((scheme: any) => {
                        const amounts = calcSchemeAmounts(scheme, selectedProperty.precio_lista);
                        const isSelected = selectedSchemeId === scheme.id;
                        return (
                          <button key={scheme.id} type="button" onClick={() => { setSelectedSchemeId(prev => prev === scheme.id ? null : scheme.id); track({ page: PAGE, elementId: "select_scheme", elementLabel: scheme.nombre, metadata: { schemeId: scheme.id, propertyId: selectedProperty.id } }); }}
                            className={`w-full text-left rounded-xl border p-4 shadow-sm space-y-2 transition-all ${isSelected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border/60 bg-card hover:border-primary/40"}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isSelected && <span className="h-2 w-2 rounded-full bg-primary" />}
                                <p className="font-semibold text-sm text-foreground">{scheme.nombre}</p>
                              </div>
                              {scheme.porcentaje_descuento_aumento !== 0 && scheme.porcentaje_descuento_aumento != null && (
                                <Badge variant="outline" className={scheme.porcentaje_descuento_aumento < 0 ? "border-emerald-300 bg-emerald-50 text-emerald-700 text-xs" : "border-destructive/30 bg-destructive/10 text-destructive text-xs"}>
                                  {scheme.porcentaje_descuento_aumento > 0 ? "+" : ""}{scheme.porcentaje_descuento_aumento}%
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {scheme.porcentaje_enganche > 0 && <span><span className="font-medium text-foreground">{scheme.porcentaje_enganche}%</span> Eng.</span>}
                              {scheme.porcentaje_mensualidades > 0 && <span><span className="font-medium text-foreground">{scheme.porcentaje_mensualidades}%</span> Mens.</span>}
                              {scheme.porcentaje_entrega > 0 && <span><span className="font-medium text-foreground">{scheme.porcentaje_entrega}%</span> Ent.</span>}
                              {scheme.numero_mensualidades > 0 && <span><span className="font-medium text-foreground">{scheme.numero_mensualidades}</span> meses</span>}
                            </div>
                            {selectedProperty.precio_lista > 0 && (
                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 mt-1">
                                {amounts.enganche > 0 && <div className="text-[11px]"><span className="text-muted-foreground">Enganche:</span> <span className="font-medium text-foreground">{formatPrice(amounts.enganche)}</span></div>}
                                {amounts.mensualidadesTotal > 0 && <div className="text-[11px]"><span className="text-muted-foreground">Mensualidad:</span> <span className="font-medium text-foreground">{formatPrice(amounts.mensualidad)}</span></div>}
                                {amounts.entrega > 0 && <div className="text-[11px]"><span className="text-muted-foreground">Entrega:</span> <span className="font-medium text-foreground">{formatPrice(amounts.entrega)}</span></div>}
                                <div className="text-[11px]"><span className="text-muted-foreground">Precio final:</span> <span className="font-medium text-foreground">{formatPrice(amounts.precioAjustado)}</span></div>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {selectedSchemeId && (
                  <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-xs text-primary font-medium flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    Plan seleccionado: {selectedProperty.esquemas_pago.find((s: any) => s.id === selectedSchemeId)?.nombre || ""}
                  </div>
                )}
              </div>
              <div className="shrink-0 px-6 py-4 border-t bg-background">
                {canGenerateOffer ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <NewOfferDialog propertyId={selectedProperty.id} propertyNumber={selectedProperty.numero || `${selectedProperty.id}`} hideManualMode hidePdfOptions preSelectedSchemeId={selectedSchemeId}
                      customTrigger={
                        <button onClick={() => track({ page: PAGE, elementId: "generate_offer", elementLabel: "Generar Oferta", metadata: { propertyId: selectedProperty.id, schemeId: selectedSchemeId } })}
                          className="group relative w-full inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-gradient-to-br from-primary via-primary/90 to-primary/70 text-primary-foreground font-semibold text-sm shadow-[0_8px_30px_-4px_hsl(var(--primary)/0.45)] hover:shadow-[0_12px_40px_-4px_hsl(var(--primary)/0.55)] hover:-translate-y-1 active:translate-y-0 transition-all duration-300 border border-white/20">
                          <FileText className="h-5 w-5 group-hover:scale-110 transition-transform" />
                          <span className="tracking-wide">Generar Oferta {selectedSchemeId && <span className="text-xs opacity-80">({selectedProperty.esquemas_pago.find((s: any) => s.id === selectedSchemeId)?.nombre})</span>}</span>
                        </button>
                      }
                    />
                  </div>
                ) : (
                  <Button className="w-full gap-2 rounded-full" size="lg" disabled><FileText className="h-5 w-5" />Sin permiso</Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Horizontal carousel per project
const ProjectCarousel = ({ properties, formatPrice, onSelectProperty }: { properties: any[]; formatPrice: (n: number) => string; onSelectProperty: (p: any) => void }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, dragFree: true, align: "start", containScroll: "trimSnaps" });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateButtons = useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", updateButtons);
    emblaApi.on("reInit", updateButtons);
    updateButtons();
  }, [emblaApi, updateButtons]);

  return (
    <div className="relative group">
      {canPrev && (
        <button onClick={() => emblaApi?.scrollPrev()} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-background/90 border shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity -ml-3">
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </button>
      )}
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex gap-4 touch-pan-y">
          {properties.map((prop: any) => (
            <div key={prop.id} className="flex-[0_0_280px] min-w-0">
              <Card className="overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-border/60 rounded-2xl bg-card h-full"
                onClick={() => onSelectProperty(prop)}>
                <HorizontalCardCarousel images={prop.model_images || []} />
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <h4 className="font-bold text-foreground text-sm truncate">Depto. {prop.numero || prop.id}</h4>
                      <p className="text-[11px] text-muted-foreground truncate">{prop.edificio_nombre} • {prop.modelo_nombre}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[9px] border-emerald-300 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-700 dark:text-emerald-400">Disp.</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {prop.m2_total > 0 && <span className="flex items-center gap-0.5"><Maximize2 className="h-3 w-3" /> {prop.m2_total.toFixed(1)}m²</span>}
                    {prop.recamaras > 0 && <span className="flex items-center gap-0.5"><BedDouble className="h-3 w-3" /> {prop.recamaras}</span>}
                    {prop.banos > 0 && <span className="flex items-center gap-0.5"><Bath className="h-3 w-3" /> {prop.banos}</span>}
                  </div>
                  {prop.precio_lista > 0 && (
                    <div className="flex items-center gap-1 text-sm font-bold text-foreground">
                      <DollarSign className="h-3.5 w-3.5 text-primary" />
                      {formatPrice(prop.precio_lista)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
      {canNext && (
        <button onClick={() => emblaApi?.scrollNext()} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-background/90 border shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity -mr-3">
          <ChevronRight className="h-5 w-5 text-foreground" />
        </button>
      )}
    </div>
  );
};

const HorizontalCardCarousel = ({ images }: { images: any[] }) => {
  if (images.length === 0) {
    return <div className="h-32 bg-muted/60 flex items-center justify-center"><Package className="h-8 w-8 text-muted-foreground/30" /></div>;
  }
  return (
    <div className="h-32 bg-muted overflow-hidden">
      <img src={images[0]?.url} alt="" className="w-full h-full object-cover" loading="lazy" />
    </div>
  );
};

const DetailCarousel = ({ images }: { images: any[] }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const onSelect = useCallback(() => { if (emblaApi) setCurrentIndex(emblaApi.selectedScrollSnap()); }, [emblaApi]);
  useEffect(() => { if (!emblaApi) return; emblaApi.on("select", onSelect); onSelect(); return () => { emblaApi.off("select", onSelect); }; }, [emblaApi, onSelect]);
  if (images.length === 0) return null;
  return (
    <div className="h-48 bg-muted rounded-lg relative overflow-hidden group">
      <div ref={emblaRef} className="h-full overflow-hidden rounded-lg"><div className="flex h-full">{images.map((img: any) => (<div key={img.id} className="flex-[0_0_100%] min-w-0 h-full"><img src={img.url} alt="" className="w-full h-full object-cover" /></div>))}</div></div>
      {images.length > 1 && (<><button onClick={scrollPrev} className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><ChevronLeft className="h-4 w-4" /></button><button onClick={scrollNext} className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight className="h-4 w-4" /></button><div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">{images.slice(0, 8).map((_: any, i: number) => (<span key={i} className={`h-1.5 w-1.5 rounded-full ${i === currentIndex ? "bg-white" : "bg-white/40"}`} />))}</div></>)}
    </div>
  );
};

export default InventarioGlobalB;
