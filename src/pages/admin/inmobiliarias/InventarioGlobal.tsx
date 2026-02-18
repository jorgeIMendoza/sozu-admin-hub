import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Loader2, ArrowLeft, BedDouble, Bath, ShowerHead, Maximize2, DollarSign, FileText, ChevronLeft, ChevronRight, X, Filter } from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { toast } from "sonner";
import useEmblaCarousel from "embla-carousel-react";
import { NewOfferDialog } from "@/components/admin/NewOfferDialog";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";

const PAGE_SIZE = 30;

const InventarioGlobal = () => {
  const navigate = useNavigate();
  const { accessibleProjectIds, hasUnrestrictedAccess, isLoading: isLoadingAccess, hasNoAccess } = useProjectAccess();
  const { canGenerateOffer } = usePagePermissions('/admin/inmobiliarias/inventario');
  const [page, setPage] = useState(0);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [filterProjectNames, setFilterProjectNames] = useState<string[]>([]);
  const [filterModelNames, setFilterModelNames] = useState<string[]>([]);
  const [filterBedrooms, setFilterBedrooms] = useState<string[]>([]);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["inventario-global-projects", accessibleProjectIds],
    queryFn: async () => {
      if (hasNoAccess) return [];
      let query = supabase
        .from("proyectos")
        .select(`
          id, nombre,
          edificios!fk_edificios_proyecto (
            id, nombre,
            edificios_modelos!fk_edificios_modelos_edificio (
              id,
              modelos!fk_edificios_modelos_modelo (
                id, nombre, numero_recamaras, numero_completo_banos, numero_medio_bano,
                multimedias_modelo!fk_multimedias_modelo_modelo (id, url, es_imagen, activo)
              ),
              propiedades!fk_propiedades_edificio_modelo (
                id, numero_propiedad, numero_piso, precio_lista, m2_interiores, m2_exteriores,
                id_estatus_disponibilidad,
                estatus_disponibilidad:id_estatus_disponibilidad (nombre)
              )
            )
          )
        `)
        .eq("activo", true)
        .eq("publicar", true);

      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        query = query.in("id", accessibleProjectIds);
      }

      const { data, error } = await query.order("nombre");
      if (error) { console.error("Error:", error); return []; }
      return data || [];
    },
    enabled: !isLoadingAccess,
  });

  // Fetch payment schemes for all projects
  const projectIds = projects.map((p: any) => p.id);
  const { data: paymentSchemes = [] } = useQuery({
    queryKey: ["inventario-payment-schemes", projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return [];
      const { data, error } = await supabase
        .from("esquemas_pago")
        .select("id, nombre, id_proyecto, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, numero_mensualidades, porcentaje_descuento_aumento")
        .in("id_proyecto", projectIds)
        .eq("activo", true);
      if (error) { console.error("Error:", error); return []; }
      return data || [];
    },
    enabled: projectIds.length > 0,
  });

  // Flatten all available properties
  const allAvailableProperties = useMemo(() => {
    const props: any[] = [];
    projects.forEach((project: any) => {
      project.edificios?.forEach((e: any) => {
        e.edificios_modelos?.forEach((em: any) => {
          // Collect model images
          const modelImages = em.modelos?.multimedias_modelo?.filter((m: any) => m.es_imagen && m.activo) || [];
          
          em.propiedades?.forEach((p: any) => {
            if (p.id_estatus_disponibilidad === 2) {
              props.push({
                ...p,
                numero: p.numero_propiedad,
                piso: p.numero_piso,
                proyecto_id: project.id,
                proyecto_nombre: project.nombre,
                edificio_nombre: e.nombre,
                modelo_id: em.modelos?.id,
                modelo_nombre: em.modelos?.nombre,
                recamaras: em.modelos?.numero_recamaras,
                banos: em.modelos?.numero_completo_banos,
                medio_bano: em.modelos?.numero_medio_bano,
                m2_total: (p.m2_interiores || 0) + (p.m2_exteriores || 0),
                model_images: modelImages,
              });
            }
          });
        });
      });
    });
    // Shuffle
    for (let i = props.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [props[i], props[j]] = [props[j], props[i]];
    }
    return props;
  }, [projects]);

  // Projects with available properties only
  const projectsWithAvailable = useMemo(() => {
    const names = new Set<string>();
    allAvailableProperties.forEach(p => { if (p.proyecto_nombre) names.add(p.proyecto_nombre); });
    return Array.from(names).sort();
  }, [allAvailableProperties]);

  // Available models (filtered by selected projects)
  const availableModelNames = useMemo(() => {
    let source = allAvailableProperties;
    if (filterProjectNames.length > 0) {
      source = source.filter(p => filterProjectNames.includes(p.proyecto_nombre));
    }
    const names = new Set<string>();
    source.forEach(p => { if (p.modelo_nombre) names.add(p.modelo_nombre); });
    return Array.from(names).sort();
  }, [allAvailableProperties, filterProjectNames]);

  // Available bedrooms
  const availableBedroomOptions = useMemo(() => {
    const beds = new Set<string>();
    allAvailableProperties.forEach(p => { if (p.recamaras > 0) beds.add(`${p.recamaras} recámara${p.recamaras > 1 ? "s" : ""}`); });
    return Array.from(beds).sort();
  }, [allAvailableProperties]);

  // Apply filters
  const filteredProperties = useMemo(() => {
    let result = allAvailableProperties;
    if (filterProjectNames.length > 0) {
      result = result.filter(p => filterProjectNames.includes(p.proyecto_nombre));
    }
    if (filterModelNames.length > 0) {
      result = result.filter(p => filterModelNames.includes(p.modelo_nombre));
    }
    if (filterBedrooms.length > 0) {
      const bedNums = filterBedrooms.map(b => parseInt(b));
      result = result.filter(p => bedNums.includes(p.recamaras));
    }
    return result;
  }, [allAvailableProperties, filterProjectNames, filterModelNames, filterBedrooms]);

  const hasActiveFilters = filterProjectNames.length > 0 || filterModelNames.length > 0 || filterBedrooms.length > 0;

  const clearAllFilters = () => {
    setFilterProjectNames([]);
    setFilterModelNames([]);
    setFilterBedrooms([]);
    setPage(0);
  };

  const totalPages = Math.ceil(filteredProperties.length / PAGE_SIZE);
  const pageProperties = filteredProperties.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(price);

  // Get schemes for a property's project
  const getSchemesForProject = (projectId: number) => {
    return paymentSchemes.filter((s: any) => s.id_proyecto === projectId);
  };

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [filterProjectNames, filterModelNames, filterBedrooms]);

  if (isLoading || isLoadingAccess) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/inmobiliarias/mis-proyectos")} className="gap-1 text-primary">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
      </div>

      <div className="px-1 space-y-1">
        <h1 className="text-xl font-bold text-foreground">Inventario Disponible</h1>
        <p className="text-sm text-muted-foreground">
          {filteredProperties.length} unidades disponibles
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3 px-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MultiSelectFilter
            values={filterProjectNames}
            onValuesChange={setFilterProjectNames}
            options={projectsWithAvailable}
            placeholder="Todos los proyectos"
            searchPlaceholder="Buscar proyecto..."
            icon={<Building2 className="h-3.5 w-3.5" />}
          />

          <MultiSelectFilter
            values={filterModelNames}
            onValuesChange={setFilterModelNames}
            options={availableModelNames}
            placeholder="Todos los modelos"
            searchPlaceholder="Buscar modelo..."
          />

          <MultiSelectFilter
            values={filterBedrooms}
            onValuesChange={setFilterBedrooms}
            options={availableBedroomOptions}
            placeholder="Recámaras"
            searchPlaceholder="Buscar..."
            icon={<BedDouble className="h-3.5 w-3.5" />}
          />
        </div>

        {/* Active filter badges */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtros activos:</span>
            {filterProjectNames.map(name => (
              <Badge key={`p-${name}`} variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setFilterProjectNames(prev => prev.filter(n => n !== name))}>
                {name} <X className="h-3 w-3" />
              </Badge>
            ))}
            {filterModelNames.map(name => (
              <Badge key={`m-${name}`} variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setFilterModelNames(prev => prev.filter(n => n !== name))}>
                {name} <X className="h-3 w-3" />
              </Badge>
            ))}
            {filterBedrooms.map(name => (
              <Badge key={`b-${name}`} variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setFilterBedrooms(prev => prev.filter(n => n !== name))}>
                {name} <X className="h-3 w-3" />
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="text-xs h-6 px-2 text-destructive" onClick={clearAllFilters}>
              <X className="h-3 w-3 mr-1" /> Limpiar filtros
            </Button>
          </div>
        )}
      </div>

      {/* Properties Grid */}
      {filteredProperties.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No hay propiedades disponibles con los filtros seleccionados</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-1">
            {pageProperties.map((prop: any) => (
              <Card
                key={prop.id}
                className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow border"
                onClick={() => setSelectedProperty(prop)}
              >
                {/* Image Carousel */}
                {prop.model_images?.length > 0 && (
                  <PropertyCardCarousel images={prop.model_images} />
                )}

                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-foreground">{prop.numero || `Unidad ${prop.id}`}</h4>
                      <p className="text-xs text-muted-foreground">{prop.proyecto_nombre}</p>
                      <p className="text-[11px] text-muted-foreground">{prop.edificio_nombre} • {prop.modelo_nombre}</p>
                    </div>
                    <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-[10px]">
                      Disponible
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {prop.m2_total > 0 && (
                      <span className="flex items-center gap-1"><Maximize2 className="h-3 w-3" /> {prop.m2_total.toFixed(1)} m²</span>
                    )}
                    {prop.recamaras > 0 && (
                      <span className="flex items-center gap-1"><BedDouble className="h-3 w-3" /> {prop.recamaras}</span>
                    )}
                    {prop.banos > 0 && (
                      <span className="flex items-center gap-1"><Bath className="h-3 w-3" /> {prop.banos}</span>
                    )}
                  </div>

                  {prop.precio_lista > 0 && (
                    <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
                      <DollarSign className="h-3.5 w-3.5" />
                      {formatPrice(prop.precio_lista)}
                    </div>
                  )}

                  {/* Payment schemes count */}
                  {getSchemesForProject(prop.proyecto_id).length > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-medium">{getSchemesForProject(prop.proyecto_id).length} esquema{getSchemesForProject(prop.proyecto_id).length > 1 ? "s" : ""} de pago</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Property Detail Dialog */}
      <Dialog open={!!selectedProperty} onOpenChange={(open) => !open && setSelectedProperty(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedProperty?.numero || `Unidad ${selectedProperty?.id}`}</DialogTitle>
          </DialogHeader>
          {selectedProperty && (
            <div className="space-y-4">
              {/* Model images in detail */}
              {selectedProperty.model_images?.length > 0 && (
                <DetailCarousel images={selectedProperty.model_images} />
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Proyecto</p>
                  <p className="font-medium text-sm">{selectedProperty.proyecto_nombre}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Edificio</p>
                  <p className="font-medium text-sm">{selectedProperty.edificio_nombre}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Modelo</p>
                  <p className="font-medium text-sm">{selectedProperty.modelo_nombre}</p>
                </div>
                {selectedProperty.piso && (
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Piso</p>
                    <p className="font-medium text-sm">{selectedProperty.piso}</p>
                  </div>
                )}
                {selectedProperty.m2_total > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Superficie</p>
                    <p className="font-medium text-sm">{selectedProperty.m2_total.toFixed(2)} m²</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {selectedProperty.recamaras > 0 && (
                  <span className="flex items-center gap-1"><BedDouble className="h-4 w-4" /> {selectedProperty.recamaras} recámara{selectedProperty.recamaras > 1 ? "s" : ""}</span>
                )}
                {selectedProperty.banos > 0 && (
                  <span className="flex items-center gap-1"><Bath className="h-4 w-4" /> {selectedProperty.banos} baño{selectedProperty.banos > 1 ? "s" : ""}</span>
                )}
                {selectedProperty.medio_bano > 0 && (
                  <span className="flex items-center gap-1"><ShowerHead className="h-4 w-4" /> {selectedProperty.medio_bano} medio baño</span>
                )}
              </div>

              {selectedProperty.precio_lista > 0 && (
                <div className="bg-primary/5 rounded-lg p-4 text-center">
                  <p className="text-xs text-muted-foreground">Precio de Lista</p>
                  <p className="text-xl font-bold text-foreground">{formatPrice(selectedProperty.precio_lista)}</p>
                </div>
              )}

              {/* Payment Schemes */}
              {getSchemesForProject(selectedProperty.proyecto_id).length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-foreground">Esquemas de Pago</p>
                  <div className="space-y-2">
                    {getSchemesForProject(selectedProperty.proyecto_id).map((scheme: any) => (
                      <div key={scheme.id} className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
                        <p className="font-medium text-foreground">{scheme.nombre}</p>
                        <div className="flex flex-wrap gap-3 text-muted-foreground">
                          {scheme.porcentaje_enganche > 0 && <span>Enganche: {scheme.porcentaje_enganche}%</span>}
                          {scheme.porcentaje_mensualidades > 0 && <span>Mensualidades: {scheme.porcentaje_mensualidades}%</span>}
                          {scheme.porcentaje_entrega > 0 && <span>Entrega: {scheme.porcentaje_entrega}%</span>}
                          {scheme.numero_mensualidades > 0 && <span>{scheme.numero_mensualidades} meses</span>}
                          {scheme.porcentaje_descuento_aumento !== 0 && scheme.porcentaje_descuento_aumento != null && (
                            <span className={scheme.porcentaje_descuento_aumento < 0 ? "text-green-600" : "text-destructive"}>
                              {scheme.porcentaje_descuento_aumento > 0 ? "+" : ""}{scheme.porcentaje_descuento_aumento}%
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generate Offer Button - controlled by permission */}
              {canGenerateOffer ? (
                <div onClick={(e) => e.stopPropagation()}>
                  <NewOfferDialog
                    propertyId={selectedProperty.id}
                    propertyNumber={selectedProperty.numero || `${selectedProperty.id}`}
                    hideManualMode={true}
                    hidePdfOptions={true}
                  />
                </div>
              ) : (
                <Button className="w-full gap-2" size="lg" disabled>
                  <FileText className="h-5 w-5" />
                  Sin permiso para generar oferta
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Small carousel for property cards
const PropertyCardCarousel = ({ images }: { images: any[] }) => {
  const [emblaRef] = useEmblaCarousel({ loop: true, dragFree: true });

  if (images.length === 0) return null;

  return (
    <div className="h-36 bg-muted overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div ref={emblaRef} className="h-full overflow-hidden">
        <div className="flex h-full">
          {images.slice(0, 5).map((img: any) => (
            <div key={img.id} className="flex-[0_0_100%] min-w-0 h-full">
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Carousel for detail dialog
const DetailCarousel = ({ images }: { images: any[] }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [currentIndex, setCurrentIndex] = useState(0);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrentIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi, onSelect]);

  if (images.length === 0) return null;

  return (
    <div className="h-48 bg-muted rounded-lg relative overflow-hidden group">
      <div ref={emblaRef} className="h-full overflow-hidden rounded-lg">
        <div className="flex h-full">
          {images.map((img: any) => (
            <div key={img.id} className="flex-[0_0_100%] min-w-0 h-full">
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
      {images.length > 1 && (
        <>
          <button onClick={scrollPrev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={scrollNext} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {images.slice(0, 8).map((_: any, i: number) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i === currentIndex ? "bg-white" : "bg-white/50"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default InventarioGlobal;
