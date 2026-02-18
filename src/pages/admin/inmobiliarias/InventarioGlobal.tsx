import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Building2, Loader2, ArrowLeft, BedDouble, Bath, ShowerHead, Maximize2, DollarSign, FileText, ChevronLeft, ChevronRight, ChevronDown, X, Package, Layers, Car, Archive } from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
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
  const [selectedSchemeId, setSelectedSchemeId] = useState<number | null>(null);
  const [filterProjectNames, setFilterProjectNames] = useState<string[]>([]);
  const [filterModelNames, setFilterModelNames] = useState<string[]>([]);
  const [filterBedrooms, setFilterBedrooms] = useState<string[]>([]);
  const [filterLevels, setFilterLevels] = useState<string[]>([]);
  const [filterBodega, setFilterBodega] = useState<string | null>(null);
  const [filterEstacionamiento, setFilterEstacionamiento] = useState<string | null>(null);
  const [schemesOpen, setSchemesOpen] = useState(false);

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
                multimedias_modelo!fk_multimedias_modelo_modelo (id, url, es_imagen, activo, ver_como_imagen_de_propiedad)
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
        .eq("activo", true)
        .eq("es_manual", false);
      if (error) { console.error("Error:", error); return []; }
      return data || [];
    },
    enabled: projectIds.length > 0,
  });

  // Collect all property IDs to fetch their images
  const allPropertyIds = useMemo(() => {
    const ids: number[] = [];
    projects.forEach((project: any) => {
      project.edificios?.forEach((e: any) => {
        e.edificios_modelos?.forEach((em: any) => {
          em.propiedades?.forEach((p: any) => {
            if (p.id_estatus_disponibilidad === 2) {
              ids.push(p.id);
            }
          });
        });
      });
    });
    return ids;
  }, [projects]);

  // Fetch property-specific images
  const { data: propertyImages = [] } = useQuery({
    queryKey: ["inventario-property-images", allPropertyIds],
    queryFn: async () => {
      if (allPropertyIds.length === 0) return [];
      const batchSize = 500;
      const results: any[] = [];
      for (let i = 0; i < allPropertyIds.length; i += batchSize) {
        const batch = allPropertyIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("multimedias_propiedad")
          .select("id, url, es_imagen, activo, id_propiedad")
          .in("id_propiedad", batch)
          .eq("activo", true)
          .eq("es_imagen", true);
        if (!error && data) results.push(...data);
      }
      return results;
    },
    enabled: allPropertyIds.length > 0,
  });

  // Fetch bodegas for all available properties
  const { data: allBodegas = [] } = useQuery({
    queryKey: ["inventario-bodegas", allPropertyIds],
    queryFn: async () => {
      if (allPropertyIds.length === 0) return [];
      const batchSize = 500;
      const results: any[] = [];
      for (let i = 0; i < allPropertyIds.length; i += batchSize) {
        const batch = allPropertyIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("bodegas")
          .select("id, id_propiedad, nombre, es_incluido")
          .in("id_propiedad", batch)
          .eq("activo", true);
        if (!error && data) results.push(...data);
      }
      return results;
    },
    enabled: allPropertyIds.length > 0,
  });

  // Fetch estacionamientos for all available properties
  const { data: allEstacionamientos = [] } = useQuery({
    queryKey: ["inventario-estacionamientos", allPropertyIds],
    queryFn: async () => {
      if (allPropertyIds.length === 0) return [];
      const batchSize = 500;
      const results: any[] = [];
      for (let i = 0; i < allPropertyIds.length; i += batchSize) {
        const batch = allPropertyIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from("estacionamientos")
          .select("id, id_propiedad, nombre, id_tipo, tipos_estacionamiento:id_tipo(nombre)")
          .in("id_propiedad", batch)
          .eq("activo", true);
        if (!error && data) results.push(...data);
      }
      return results;
    },
    enabled: allPropertyIds.length > 0,
  });

  // Index bodegas by property id
  const bodegasMap = useMemo(() => {
    const map = new Map<number, any[]>();
    allBodegas.forEach((b: any) => {
      if (!map.has(b.id_propiedad)) map.set(b.id_propiedad, []);
      map.get(b.id_propiedad)!.push(b);
    });
    return map;
  }, [allBodegas]);

  // Index estacionamientos by property id
  const estacionamientosMap = useMemo(() => {
    const map = new Map<number, any[]>();
    allEstacionamientos.forEach((e: any) => {
      if (!map.has(e.id_propiedad)) map.set(e.id_propiedad, []);
      map.get(e.id_propiedad)!.push(e);
    });
    return map;
  }, [allEstacionamientos]);

  // Index property images by property id
  const propertyImagesMap = useMemo(() => {
    const map = new Map<number, any[]>();
    propertyImages.forEach((img: any) => {
      if (!map.has(img.id_propiedad)) map.set(img.id_propiedad, []);
      map.get(img.id_propiedad)!.push(img);
    });
    return map;
  }, [propertyImages]);

  // Flatten all available properties
  const allAvailableProperties = useMemo(() => {
    const props: any[] = [];
    projects.forEach((project: any) => {
      project.edificios?.forEach((e: any) => {
        e.edificios_modelos?.forEach((em: any) => {
          const modelImages = em.modelos?.multimedias_modelo?.filter((m: any) => m.es_imagen && m.activo && m.ver_como_imagen_de_propiedad) || [];
          
          em.propiedades?.forEach((p: any) => {
            if (p.id_estatus_disponibilidad === 2) {
              const propImgs = propertyImagesMap.get(p.id) || [];
              const rawImages = propImgs.length > 0 ? [...propImgs] : [...modelImages];
              for (let si = rawImages.length - 1; si > 0; si--) {
                const sj = Math.floor(Math.random() * (si + 1));
                [rawImages[si], rawImages[sj]] = [rawImages[sj], rawImages[si]];
              }

              const bodegas = bodegasMap.get(p.id) || [];
              const estacionamientos = estacionamientosMap.get(p.id) || [];

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
                model_images: rawImages,
                bodegas_count: bodegas.length,
                estacionamientos_count: estacionamientos.length,
                estacionamientos_tipos: estacionamientos.map((est: any) => (est.tipos_estacionamiento as any)?.nombre || 'N/A'),
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
  }, [projects, propertyImagesMap, bodegasMap, estacionamientosMap]);

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

  // Available levels (pisos)
  const availableLevelOptions = useMemo(() => {
    const levels = new Set<string>();
    allAvailableProperties.forEach(p => { if (p.piso) levels.add(p.piso); });
    return Array.from(levels).sort((a, b) => {
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
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
    if (filterLevels.length > 0) {
      result = result.filter(p => p.piso && filterLevels.includes(p.piso));
    }
    if (filterBodega === "con") {
      result = result.filter(p => p.bodegas_count > 0);
    } else if (filterBodega === "sin") {
      result = result.filter(p => p.bodegas_count === 0);
    }
    if (filterEstacionamiento === "con") {
      result = result.filter(p => p.estacionamientos_count > 0);
    } else if (filterEstacionamiento === "sin") {
      result = result.filter(p => p.estacionamientos_count === 0);
    }
    return result;
  }, [allAvailableProperties, filterProjectNames, filterModelNames, filterBedrooms, filterLevels, filterBodega, filterEstacionamiento]);

  const hasActiveFilters = filterProjectNames.length > 0 || filterModelNames.length > 0 || filterBedrooms.length > 0 || filterLevels.length > 0 || filterBodega !== null || filterEstacionamiento !== null;

  const clearAllFilters = () => {
    setFilterProjectNames([]);
    setFilterModelNames([]);
    setFilterBedrooms([]);
    setFilterLevels([]);
    setFilterBodega(null);
    setFilterEstacionamiento(null);
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

  // Calculate amounts for a scheme given a price
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

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [filterProjectNames, filterModelNames, filterBedrooms, filterLevels, filterBodega, filterEstacionamiento]);

  // Reset scheme selection when property changes
  useEffect(() => {
    setSelectedSchemeId(null);
    setSchemesOpen(false);
  }, [selectedProperty?.id]);

  if (isLoading || isLoadingAccess) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10 px-3">
      <button
        onClick={() => navigate("/admin/inmobiliarias/mis-proyectos")}
        className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 text-primary font-medium text-sm border border-primary/20 shadow-sm hover:shadow-md hover:shadow-primary/10 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 ease-out"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
        <span className="tracking-wide">Volver</span>
      </button>

      <div className="px-1 space-y-1">
        <h1 className="text-xl font-bold text-foreground">Inventario Disponible</h1>
        <p className="text-sm text-muted-foreground">
          {filteredProperties.length} unidades disponibles
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
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

          <MultiSelectFilter
            values={filterLevels}
            onValuesChange={setFilterLevels}
            options={availableLevelOptions}
            placeholder="Nivel"
            searchPlaceholder="Buscar nivel..."
            icon={<Layers className="h-3.5 w-3.5" />}
          />
        </div>

        {/* Bodega / Estacionamiento toggle filters */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground self-center mr-1">Bodega:</span>
          {(["con", "sin"] as const).map(val => (
            <button
              key={`bod-${val}`}
              onClick={() => setFilterBodega(prev => prev === val ? null : val)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterBodega === val
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/60 text-muted-foreground border-border/60 hover:bg-muted"
              }`}
            >
              {val === "con" ? "Con bodega" : "Sin bodega"}
            </button>
          ))}

          <span className="text-xs text-muted-foreground self-center ml-3 mr-1">Estacionamiento:</span>
          {(["con", "sin"] as const).map(val => (
            <button
              key={`est-${val}`}
              onClick={() => setFilterEstacionamiento(prev => prev === val ? null : val)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterEstacionamiento === val
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/60 text-muted-foreground border-border/60 hover:bg-muted"
              }`}
            >
              {val === "con" ? "Con estac." : "Sin estac."}
            </button>
          ))}
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
            {filterLevels.map(name => (
              <Badge key={`l-${name}`} variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setFilterLevels(prev => prev.filter(n => n !== name))}>
                Nivel {name} <X className="h-3 w-3" />
              </Badge>
            ))}
            {filterBodega && (
              <Badge variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setFilterBodega(null)}>
                {filterBodega === "con" ? "Con bodega" : "Sin bodega"} <X className="h-3 w-3" />
              </Badge>
            )}
            {filterEstacionamiento && (
              <Badge variant="secondary" className="text-xs gap-1 cursor-pointer" onClick={() => setFilterEstacionamiento(null)}>
                {filterEstacionamiento === "con" ? "Con estac." : "Sin estac."} <X className="h-3 w-3" />
              </Badge>
            )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {pageProperties.map((prop: any) => (
              <Card
                key={prop.id}
                className="overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-border/60 rounded-2xl bg-card"
                onClick={() => setSelectedProperty(prop)}
              >
                {/* Image Carousel */}
                <PropertyCardCarousel images={prop.model_images || []} />

                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-foreground text-base truncate">Depto. {prop.numero || prop.id}</h4>
                      <p className="text-xs text-muted-foreground">{prop.proyecto_nombre}</p>
                      <p className="text-[11px] text-muted-foreground/70">{prop.edificio_nombre} • {prop.modelo_nombre}</p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-[10px] border-emerald-300 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-700 dark:text-emerald-400">
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

                  {/* Bodegas & Estacionamientos */}
                  {(prop.bodegas_count > 0 || prop.estacionamientos_count > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {prop.bodegas_count > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 text-[11px] text-muted-foreground">
                          <Archive className="h-3 w-3" /> {prop.bodegas_count} bodega{prop.bodegas_count > 1 ? "s" : ""}
                        </span>
                      )}
                      {prop.estacionamientos_count > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 text-[11px] text-muted-foreground">
                          <Car className="h-3 w-3" /> {prop.estacionamientos_count} estac.
                          {prop.estacionamientos_tipos?.length > 0 && (
                            <span className="text-foreground/70">
                              ({[...new Set(prop.estacionamientos_tipos as string[])].join(", ")})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )}

                  {prop.precio_lista > 0 && (
                    <div className="flex items-center gap-1.5 text-base font-bold text-foreground">
                      <DollarSign className="h-4 w-4 text-primary" />
                      {formatPrice(prop.precio_lista)}
                    </div>
                  )}

                  {/* Payment schemes count */}
                  {getSchemesForProject(prop.proyecto_id).length > 0 && (
                    <div className="text-[11px] text-primary/80 font-medium">
                      <FileText className="inline h-3 w-3 mr-1" />
                      {getSchemesForProject(prop.proyecto_id).length} esquema{getSchemesForProject(prop.proyecto_id).length > 1 ? "s" : ""} de pago
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
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
            <DialogTitle>Departamento {selectedProperty?.numero || selectedProperty?.id} de {selectedProperty?.proyecto_nombre}</DialogTitle>
          </DialogHeader>
          {selectedProperty && (
            <>
              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-4">
                {/* Model images in detail */}
                {selectedProperty.model_images?.length > 0 && (
                  <DetailCarousel images={selectedProperty.model_images} />
                )}

                {/* Info chips - compact inline */}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">
                    <Building2 className="h-3 w-3 text-muted-foreground" /> {selectedProperty.proyecto_nombre}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">
                    {selectedProperty.edificio_nombre}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">
                    {selectedProperty.modelo_nombre}
                  </span>
                  {selectedProperty.piso && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">
                      <Layers className="h-3 w-3 text-muted-foreground" /> Nivel {selectedProperty.piso}
                    </span>
                  )}
                  {selectedProperty.m2_total > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">
                      <Maximize2 className="h-3 w-3 text-muted-foreground" /> {selectedProperty.m2_total.toFixed(2)} m²
                    </span>
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

                {/* Bodegas & estacionamientos in detail */}
                {(selectedProperty.bodegas_count > 0 || selectedProperty.estacionamientos_count > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {selectedProperty.bodegas_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">
                        <Archive className="h-3 w-3 text-muted-foreground" /> {selectedProperty.bodegas_count} bodega{selectedProperty.bodegas_count > 1 ? "s" : ""}
                      </span>
                    )}
                    {selectedProperty.estacionamientos_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">
                        <Car className="h-3 w-3 text-muted-foreground" /> {selectedProperty.estacionamientos_count} estac.
                        {selectedProperty.estacionamientos_tipos?.length > 0 && (
                          <span className="ml-1 text-muted-foreground">
                            ({[...new Set(selectedProperty.estacionamientos_tipos as string[])].join(", ")})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )}

                {selectedProperty.precio_lista > 0 && (
                  <div className="bg-primary/5 rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground">Precio de Lista</p>
                    <p className="text-xl font-bold text-foreground">{formatPrice(selectedProperty.precio_lista)}</p>
                  </div>
                )}

                {/* Payment Schemes - Collapsible */}
                {getSchemesForProject(selectedProperty.proyecto_id).length > 0 && (
                  <Collapsible open={schemesOpen} onOpenChange={setSchemesOpen}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2 group">
                      <p className="text-sm font-semibold text-foreground">
                        Esquemas de Pago ({getSchemesForProject(selectedProperty.proyecto_id).length})
                      </p>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${schemesOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-1">
                      {getSchemesForProject(selectedProperty.proyecto_id).map((scheme: any) => {
                        const amounts = calcSchemeAmounts(scheme, selectedProperty.precio_lista);
                        const isSelected = selectedSchemeId === scheme.id;
                        return (
                          <button
                            key={scheme.id}
                            type="button"
                            onClick={() => setSelectedSchemeId(prev => prev === scheme.id ? null : scheme.id)}
                            className={`w-full text-left rounded-xl border p-4 shadow-sm space-y-2 transition-all duration-200 ${
                              isSelected
                                ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                : "border-border/60 bg-gradient-to-br from-card to-muted/30 hover:border-primary/40"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isSelected && (
                                  <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                )}
                                <p className="font-semibold text-sm text-foreground">{scheme.nombre}</p>
                              </div>
                              {scheme.porcentaje_descuento_aumento !== 0 && scheme.porcentaje_descuento_aumento != null && (
                                <Badge variant="outline" className={scheme.porcentaje_descuento_aumento < 0
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-700 dark:text-emerald-400 text-xs"
                                  : "border-destructive/30 bg-destructive/10 text-destructive text-xs"}>
                                  {scheme.porcentaje_descuento_aumento > 0 ? "+" : ""}{scheme.porcentaje_descuento_aumento}%
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {scheme.porcentaje_enganche > 0 && (
                                <span><span className="font-medium text-foreground">{scheme.porcentaje_enganche}%</span> Enganche</span>
                              )}
                              {scheme.porcentaje_mensualidades > 0 && (
                                <span><span className="font-medium text-foreground">{scheme.porcentaje_mensualidades}%</span> Mensualidades</span>
                              )}
                              {scheme.porcentaje_entrega > 0 && (
                                <span><span className="font-medium text-foreground">{scheme.porcentaje_entrega}%</span> Entrega</span>
                              )}
                              {scheme.numero_mensualidades > 0 && (
                                <span><span className="font-medium text-foreground">{scheme.numero_mensualidades}</span> meses</span>
                              )}
                            </div>
                            {/* Calculated amounts */}
                            {selectedProperty.precio_lista > 0 && (
                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 mt-1">
                                {amounts.enganche > 0 && (
                                  <div className="text-[11px]">
                                    <span className="text-muted-foreground">Enganche:</span>
                                    <span className="ml-1 font-medium text-foreground">{formatPrice(amounts.enganche)}</span>
                                  </div>
                                )}
                                {amounts.mensualidadesTotal > 0 && (
                                  <div className="text-[11px]">
                                    <span className="text-muted-foreground">Mensualidad:</span>
                                    <span className="ml-1 font-medium text-foreground">{formatPrice(amounts.mensualidad)}</span>
                                  </div>
                                )}
                                {amounts.entrega > 0 && (
                                  <div className="text-[11px]">
                                    <span className="text-muted-foreground">Entrega:</span>
                                    <span className="ml-1 font-medium text-foreground">{formatPrice(amounts.entrega)}</span>
                                  </div>
                                )}
                                {amounts.precioAjustado !== selectedProperty.precio_lista && (
                                  <div className="text-[11px]">
                                    <span className="text-muted-foreground">Precio ajustado:</span>
                                    <span className="ml-1 font-medium text-foreground">{formatPrice(amounts.precioAjustado)}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {/* Selected scheme indicator */}
                {selectedSchemeId && (
                  <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-xs text-primary font-medium flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    Plan seleccionado: {paymentSchemes.find((s: any) => s.id === selectedSchemeId)?.nombre || ""}
                  </div>
                )}
              </div>

              {/* Sticky CTA at bottom */}
              <div className="shrink-0 px-6 py-4 border-t bg-background">
                {canGenerateOffer ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <NewOfferDialog
                      propertyId={selectedProperty.id}
                      propertyNumber={selectedProperty.numero || `${selectedProperty.id}`}
                      hideManualMode={true}
                      hidePdfOptions={true}
                      preSelectedSchemeId={selectedSchemeId}
                      customTrigger={
                        <button className="group relative w-full inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-gradient-to-br from-primary via-primary/90 to-primary/70 text-primary-foreground font-semibold text-sm shadow-[0_8px_30px_-4px_hsl(var(--primary)/0.45)] hover:shadow-[0_12px_40px_-4px_hsl(var(--primary)/0.55)] hover:-translate-y-1 active:translate-y-0 transition-all duration-300 ease-out border border-white/20">
                          <FileText className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                          <span className="tracking-wide">
                            Generar Oferta
                            {selectedSchemeId && (
                              <span className="ml-1 text-xs opacity-80">
                                ({paymentSchemes.find((s: any) => s.id === selectedSchemeId)?.nombre})
                              </span>
                            )}
                          </span>
                          <span className="absolute inset-0 rounded-full bg-gradient-to-t from-transparent to-white/15 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        </button>
                      }
                    />
                  </div>
                ) : (
                  <Button className="w-full gap-2 rounded-full" size="lg" disabled>
                    <FileText className="h-5 w-5" />
                    Sin permiso para generar oferta
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Small carousel for property cards
const PropertyCardCarousel = ({ images }: { images: any[] }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, dragFree: false });
  const [currentIndex, setCurrentIndex] = useState(0);

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

  if (images.length === 0) {
    return (
      <div className="h-40 bg-muted/60 flex items-center justify-center">
        <Package className="h-10 w-10 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <div className="relative h-40 bg-muted overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div ref={emblaRef} className="h-full overflow-hidden">
        <div className="flex h-full touch-pan-y">
          {images.slice(0, 8).map((img: any) => (
            <div key={img.id} className="flex-[0_0_100%] min-w-0 h-full">
              <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      </div>
      {images.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {images.slice(0, 8).map((_: any, i: number) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i === currentIndex ? "bg-white" : "bg-white/40"}`} />
          ))}
        </div>
      )}
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
