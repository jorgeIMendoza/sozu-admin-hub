import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useInventarioDisponiblePaginado } from "@/hooks/useInventarioDisponiblePaginado";
import type { InventarioPropiedad } from "@/hooks/useInventarioDisponible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Building2, Loader2, ArrowLeft, BedDouble, Bath, ShowerHead, Maximize2, FileText, ChevronLeft, ChevronRight, ChevronDown, X, Layers, Car, Search, SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown, Package } from "lucide-react";
import bodegaIcon from "@/assets/icons/bodega.png";
import useEmblaCarousel from "embla-carousel-react";
import { NewOfferDialog } from "@/components/admin/NewOfferDialog";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { usePagePermissions } from "@/hooks/usePagePermissions";

const PAGE_SIZE = 30;
type SortOrder = "none" | "asc" | "desc";

const AgentUnidadesProyecto = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const navigate = useNavigate();
  const { canGenerateOffer } = usePagePermissions('/admin/inmobiliarias/inventario');

  const [page, setPage] = useState(0);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [selectedSchemeId, setSelectedSchemeId] = useState<number | null>(null);
  const [schemesOpen, setSchemesOpen] = useState(false);

  // Filters
  const [filterModelNames, setFilterModelNames] = useState<string[]>([]);
  const [filterBedrooms, setFilterBedrooms] = useState<string[]>([]);
  const [filterLevels, setFilterLevels] = useState<string[]>([]);
  const [filterBodega, setFilterBodega] = useState<string | null>(null);
  const [filterEstacionamiento, setFilterEstacionamiento] = useState<string | null>(null);
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("none");

  // We need to get the project name to filter by it
  const [projectName, setProjectName] = useState<string | null>(null);

  // First, fetch project name
  const { data: inventarioData, isLoading, isFetching } = useInventarioDisponiblePaginado({
    projectNames: projectName ? [projectName] : undefined,
    modelNames: filterModelNames.length > 0 ? filterModelNames : undefined,
    bedrooms: useMemo(() => filterBedrooms.map(b => parseInt(b)).filter(n => !isNaN(n)), [filterBedrooms]),
    levels: filterLevels.length > 0 ? filterLevels : undefined,
    hasBodega: filterBodega === "con" ? true : filterBodega === "sin" ? false : null,
    hasEstacionamiento: filterEstacionamiento === "con" ? true : filterEstacionamiento === "sin" ? false : null,
    sortPrice: sortOrder === "none" ? null : sortOrder,
    page,
    pageSize: PAGE_SIZE,
  });

  // Get project name from first results or filter options
  useEffect(() => {
    if (!projectName && inventarioData.filterOptions.proyectos.length > 0 && !projectId) {
      // fallback
    }
  }, [inventarioData.filterOptions.proyectos, projectName, projectId]);

  // Fetch project name separately
  const { data: projectInfo } = React.useMemo(() => ({ data: null }), []);

  // We need to fetch the project name from supabase directly
  const [projNameLoaded, setProjNameLoaded] = useState(false);
  useEffect(() => {
    if (projNameLoaded || !projectId) return;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      (supabase as any).from("proyectos").select("nombre").eq("id", projectId).maybeSingle().then(({ data }: any) => {
        if (data?.nombre) setProjectName(data.nombre);
        setProjNameLoaded(true);
      });
    });
  }, [projectId, projNameLoaded]);

  const pageProperties = useMemo(() => {
    return inventarioData.propiedades.map((p: InventarioPropiedad) => {
      const propImgs = p.propiedad_imagenes || [];
      const modelImgs = p.modelo_imagenes || [];
      const images = propImgs.length > 0 ? propImgs : modelImgs;
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
        model_images: images,
        esquemas_pago: p.esquemas_pago || [],
      };
    });
  }, [inventarioData.propiedades]);

  const availableModelNames = inventarioData.filterOptions.modelos;
  const availableBedroomOptions = useMemo(() =>
    inventarioData.filterOptions.recamaras.map(r => `${r} recámara${r > 1 ? "s" : ""}`),
    [inventarioData.filterOptions.recamaras]
  );
  const availableLevelOptions = inventarioData.filterOptions.niveles;
  const totalCount = inventarioData.totalCount;
  const totalPages = inventarioData.totalPages;

  const hasActiveFilters = filterModelNames.length > 0 || filterBedrooms.length > 0 || filterLevels.length > 0 || filterBodega !== null || filterEstacionamiento !== null;
  const activeFilterCount = filterModelNames.length + filterBedrooms.length + filterLevels.length + (filterBodega ? 1 : 0) + (filterEstacionamiento ? 1 : 0);

  const clearAllFilters = () => {
    setFilterModelNames([]);
    setFilterBedrooms([]);
    setFilterLevels([]);
    setFilterBodega(null);
    setFilterEstacionamiento(null);
    setPage(0);
  };

  const cycleSortOrder = () => {
    const next = sortOrder === "none" ? "asc" : sortOrder === "asc" ? "desc" : "none";
    setSortOrder(next);
    setPage(0);
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(price);

  const getSchemesForProperty = (prop: any) => prop.esquemas_pago || [];

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

  useEffect(() => { setPage(0); }, [filterModelNames, filterBedrooms, filterLevels, filterBodega, filterEstacionamiento]);
  useEffect(() => { setSelectedSchemeId(null); setSchemesOpen(false); }, [selectedProperty?.id]);

  const SortIcon = sortOrder === "asc" ? ArrowUp : sortOrder === "desc" ? ArrowDown : ArrowUpDown;
  const sortLabel = sortOrder === "asc" ? "Menor precio" : sortOrder === "desc" ? "Mayor precio" : "Ordenar";

  const filterContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
            <Maximize2 className="h-4 w-4 text-blue-500" />
          </div>
          <span className="text-sm font-semibold text-foreground">Modelo</span>
        </div>
        <MultiSelectFilter values={filterModelNames} onValuesChange={setFilterModelNames} options={availableModelNames} placeholder="Todos los modelos" searchPlaceholder="Buscar modelo..." />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center">
            <BedDouble className="h-4 w-4 text-violet-500" />
          </div>
          <span className="text-sm font-semibold text-foreground">Recámaras</span>
        </div>
        <MultiSelectFilter values={filterBedrooms} onValuesChange={setFilterBedrooms} options={availableBedroomOptions} placeholder="Todas" searchPlaceholder="Buscar..." />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
            <Layers className="h-4 w-4 text-amber-500" />
          </div>
          <span className="text-sm font-semibold text-foreground">Nivel</span>
        </div>
        <MultiSelectFilter values={filterLevels} onValuesChange={setFilterLevels} options={availableLevelOptions} placeholder="Todos los niveles" searchPlaceholder="Buscar nivel..." />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
            <img src={bodegaIcon} alt="" className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-foreground">Bodega</span>
        </div>
        <MultiSelectFilter
          values={filterBodega ? [filterBodega === "con" ? "Con bodega" : "Sin bodega"] : []}
          onValuesChange={(vals) => {
            if (vals.length === 0) setFilterBodega(null);
            else { const last = vals[vals.length - 1]; setFilterBodega(last === "Con bodega" ? "con" : "sin"); }
          }}
          options={["Con bodega", "Sin bodega"]}
          placeholder="Todas"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-sky-100 flex items-center justify-center">
            <Car className="h-4 w-4 text-sky-500" />
          </div>
          <span className="text-sm font-semibold text-foreground">Estacionamiento</span>
        </div>
        <MultiSelectFilter
          values={filterEstacionamiento ? [filterEstacionamiento === "con" ? "Con estac." : "Sin estac."] : []}
          onValuesChange={(vals) => {
            if (vals.length === 0) setFilterEstacionamiento(null);
            else { const last = vals[vals.length - 1]; setFilterEstacionamiento(last === "Con estac." ? "con" : "sin"); }
          }}
          options={["Con estac.", "Sin estac."]}
          placeholder="Todos"
        />
      </div>
    </div>
  );

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[hsl(var(--agent-bg))] px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/admin/agent/inventario")} className="h-9 w-9 rounded-full bg-white border border-gray-200 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">{projectName || "Unidades"}</h1>
            <p className="text-xs text-muted-foreground">{totalCount} unidades disponibles</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltersDrawerOpen(true)}
            className="flex items-center gap-2 px-4 h-10 rounded-xl border border-gray-200 bg-white text-sm font-medium"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {hasActiveFilters && (
              <Badge className="text-[10px] px-1.5 py-0 bg-[hsl(var(--agent-primary))] text-white border-0 hover:bg-[hsl(var(--agent-primary))]">
                {activeFilterCount}
              </Badge>
            )}
          </button>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--agent-primary))]/20"
              placeholder="Buscar..."
            />
          </div>
          <button
            onClick={cycleSortOrder}
            className={`h-10 w-10 rounded-xl flex items-center justify-center border transition-colors ${
              sortOrder !== "none"
                ? "bg-[hsl(var(--agent-primary))] text-white border-[hsl(var(--agent-primary))]"
                : "bg-white border-gray-200 text-muted-foreground"
            }`}
          >
            <SortIcon className="h-4 w-4" />
          </button>
        </div>
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {filterModelNames.map(name => (
              <Badge key={`m-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterModelNames(prev => prev.filter(n => n !== name))}>
                {name} <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
            {filterBedrooms.map(name => (
              <Badge key={`b-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterBedrooms(prev => prev.filter(n => n !== name))}>
                {name} <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
            {filterLevels.map(name => (
              <Badge key={`l-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterLevels(prev => prev.filter(n => n !== name))}>
                Nivel {name} <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
            {filterBodega && (
              <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterBodega(null)}>
                {filterBodega === "con" ? "Con bodega" : "Sin bodega"} <X className="h-2.5 w-2.5" />
              </Badge>
            )}
            {filterEstacionamiento && (
              <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterEstacionamiento(null)}>
                {filterEstacionamiento === "con" ? "Con estac." : "Sin estac."} <X className="h-2.5 w-2.5" />
              </Badge>
            )}
            <button className="text-[10px] text-destructive font-medium px-1" onClick={clearAllFilters}>Limpiar</button>
          </div>
        )}
      </div>

      {/* Filters Drawer */}
      <Drawer open={filtersDrawerOpen} onOpenChange={setFiltersDrawerOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center justify-between">
              <span>Filtrar unidades</span>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="text-xs text-destructive h-7" onClick={clearAllFilters}>Limpiar todo</Button>
              )}
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6 max-h-[65vh]">{filterContent}</div>
          <div className="px-4 py-3 border-t">
            <Button className="w-full rounded-full gap-2 bg-[hsl(var(--agent-primary))] hover:bg-[hsl(var(--agent-primary))]/90" onClick={() => setFiltersDrawerOpen(false)}>
              <Search className="h-4 w-4" /> Ver {totalCount} resultados
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Properties Grid */}
      <div className="px-4 mt-2">
        {isLoading || !projNameLoaded ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pageProperties.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No hay unidades disponibles</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pageProperties.map((prop: any) => (
                <UnitCard key={prop.id} prop={prop} formatPrice={formatPrice} onClick={() => setSelectedProperty(prop)} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-4 pb-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page + 1} / {totalPages}
                  {isFetching && !isLoading && <Loader2 className="inline h-3 w-3 animate-spin ml-1.5" />}
                </span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                  Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Property Detail Dialog */}
      <Dialog open={!!selectedProperty} onOpenChange={(open) => !open && setSelectedProperty(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
            <DialogTitle>Departamento {selectedProperty?.numero || selectedProperty?.id} de {selectedProperty?.proyecto_nombre}</DialogTitle>
          </DialogHeader>
          {selectedProperty && (
            <>
              <div className="flex-1 overflow-y-auto px-6 space-y-4 pb-4">
                {selectedProperty.model_images?.length > 0 && (
                  <DetailCarousel images={selectedProperty.model_images} />
                )}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">
                    <Building2 className="h-3 w-3 text-muted-foreground" /> {selectedProperty.proyecto_nombre}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">{selectedProperty.edificio_nombre}</span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">{selectedProperty.modelo_nombre}</span>
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
                {(selectedProperty.bodegas_count > 0 || selectedProperty.estacionamientos_count > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {selectedProperty.bodegas_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">
                        <img src={bodegaIcon} alt="bodega" className="h-3 w-3 opacity-60" /> {selectedProperty.bodegas_count} bodega{selectedProperty.bodegas_count > 1 ? "s" : ""}
                      </span>
                    )}
                    {selectedProperty.estacionamientos_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground">
                        <Car className="h-3 w-3 text-muted-foreground" /> {selectedProperty.estacionamientos_count} estac.
                        {selectedProperty.estacionamientos_tipos?.length > 0 && (
                          <span className="ml-1 text-muted-foreground">({[...new Set(selectedProperty.estacionamientos_tipos as string[])].join(", ")})</span>
                        )}
                      </span>
                    )}
                  </div>
                )}
                {selectedProperty.precio_lista > 0 && (
                  <div className="bg-[hsl(var(--agent-primary))]/5 rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground">Precio de Lista</p>
                    <p className="text-xl font-bold text-foreground">{formatPrice(selectedProperty.precio_lista)}</p>
                  </div>
                )}
                {getSchemesForProperty(selectedProperty).length > 0 && (
                  <Collapsible open={schemesOpen} onOpenChange={setSchemesOpen}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2 group">
                      <p className="text-sm font-semibold text-foreground">Esquemas de Pago ({getSchemesForProperty(selectedProperty).length})</p>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${schemesOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-1">
                      {getSchemesForProperty(selectedProperty).map((scheme: any) => {
                        const amounts = calcSchemeAmounts(scheme, selectedProperty.precio_lista);
                        const isSelected = selectedSchemeId === scheme.id;
                        return (
                          <button
                            key={scheme.id}
                            type="button"
                            onClick={() => setSelectedSchemeId(prev => prev === scheme.id ? null : scheme.id)}
                            className={`w-full text-left rounded-xl border p-4 shadow-sm space-y-2 transition-all duration-200 ${
                              isSelected ? "border-[hsl(var(--agent-primary))] bg-[hsl(var(--agent-primary))]/5 ring-2 ring-[hsl(var(--agent-primary))]/20" : "border-border/60 bg-gradient-to-br from-card to-muted/30 hover:border-[hsl(var(--agent-primary))]/40"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isSelected && <span className="h-2 w-2 rounded-full bg-[hsl(var(--agent-primary))] shrink-0" />}
                                <p className="font-semibold text-sm text-foreground">{scheme.nombre}</p>
                              </div>
                              {scheme.porcentaje_descuento_aumento !== 0 && scheme.porcentaje_descuento_aumento != null && (
                                <Badge variant="outline" className={scheme.porcentaje_descuento_aumento < 0
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 text-xs"
                                  : "border-destructive/30 bg-destructive/10 text-destructive text-xs"}>
                                  {scheme.porcentaje_descuento_aumento > 0 ? "+" : ""}{scheme.porcentaje_descuento_aumento}%
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              {scheme.porcentaje_enganche > 0 && <span><span className="font-medium text-foreground">{scheme.porcentaje_enganche}%</span> Enganche</span>}
                              {scheme.porcentaje_mensualidades > 0 && <span><span className="font-medium text-foreground">{scheme.porcentaje_mensualidades}%</span> Mensualidades</span>}
                              {scheme.porcentaje_entrega > 0 && <span><span className="font-medium text-foreground">{scheme.porcentaje_entrega}%</span> Entrega</span>}
                              {scheme.numero_mensualidades > 0 && <span><span className="font-medium text-foreground">{scheme.numero_mensualidades}</span> meses</span>}
                            </div>
                            {selectedProperty.precio_lista > 0 && (
                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40 mt-1">
                                {amounts.enganche > 0 && <div className="text-[11px]"><span className="text-muted-foreground">Enganche:</span><span className="ml-1 font-medium text-foreground">{formatPrice(amounts.enganche)}</span></div>}
                                {amounts.mensualidadesTotal > 0 && <div className="text-[11px]"><span className="text-muted-foreground">Mensualidad:</span><span className="ml-1 font-medium text-foreground">{formatPrice(amounts.mensualidad)}</span></div>}
                                {amounts.entrega > 0 && <div className="text-[11px]"><span className="text-muted-foreground">Entrega:</span><span className="ml-1 font-medium text-foreground">{formatPrice(amounts.entrega)}</span></div>}
                                <div className="text-[11px]"><span className="text-muted-foreground">Precio final:</span><span className="ml-1 font-medium text-foreground">{formatPrice(amounts.precioAjustado)}</span></div>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {selectedSchemeId && (
                  <div className="bg-[hsl(var(--agent-primary))]/10 border border-[hsl(var(--agent-primary))]/20 rounded-lg px-3 py-2 text-xs text-[hsl(var(--agent-primary))] font-medium flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    Plan seleccionado: {getSchemesForProperty(selectedProperty).find((s: any) => s.id === selectedSchemeId)?.nombre || ""}
                  </div>
                )}
              </div>
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
                        <button className="group relative w-full inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-[hsl(var(--agent-primary))] text-white font-semibold text-sm shadow-lg hover:opacity-90 active:scale-[0.98] transition-all">
                          <FileText className="h-5 w-5" />
                          <span>
                            Generar Oferta
                            {selectedSchemeId && (
                              <span className="ml-1 text-xs opacity-80">({getSchemesForProperty(selectedProperty).find((s: any) => s.id === selectedSchemeId)?.nombre})</span>
                            )}
                          </span>
                        </button>
                      }
                    />
                  </div>
                ) : (
                  <Button className="w-full gap-2 rounded-full" size="lg" disabled>
                    <FileText className="h-5 w-5" /> Sin permiso para generar oferta
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

// Unit card component
const UnitCard = React.memo(({ prop, formatPrice, onClick }: {
  prop: any;
  formatPrice: (price: number) => string;
  onClick: () => void;
}) => (
  <Card
    className="overflow-hidden cursor-pointer hover:shadow-md active:scale-[0.98] transition-all border border-border/60 rounded-xl bg-card"
    onClick={onClick}
  >
    <div className="relative h-36">
      <UnitCardImage images={prop.model_images || []} />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2.5 pt-6 pointer-events-none">
        <h4 className="font-bold text-white text-sm truncate drop-shadow-md">Depto. {prop.numero || prop.id}</h4>
        {prop.precio_lista > 0 && (
          <p className="text-white/90 text-xs font-semibold drop-shadow-md">{formatPrice(prop.precio_lista)}</p>
        )}
      </div>
    </div>
    <CardContent className="p-3 space-y-1.5">
      <p className="text-[11px] text-muted-foreground">{prop.edificio_nombre} • {prop.modelo_nombre}</p>
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
        {prop.bodegas_count > 0 && (
          <span className="flex items-center gap-1">
            <img src={bodegaIcon} alt="" className="h-3 w-3 opacity-60" /> {prop.bodegas_count}
          </span>
        )}
        {prop.estacionamientos_count > 0 && (
          <span className="flex items-center gap-1"><Car className="h-3 w-3" /> {prop.estacionamientos_count}</span>
        )}
      </div>
    </CardContent>
  </Card>
));
UnitCard.displayName = "UnitCard";

// Simple image for unit card
const UnitCardImage = ({ images }: { images: any[] }) => {
  if (images.length === 0) {
    return (
      <div className="h-full bg-muted/60 flex items-center justify-center">
        <Package className="h-8 w-8 text-muted-foreground/30" />
      </div>
    );
  }
  return <img src={images[0].url} alt="" className="w-full h-full object-cover" loading="lazy" />;
};

// Detail carousel
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
              <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      </div>
      {images.length > 1 && (
        <>
          <button onClick={scrollPrev} className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={scrollNext} className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_: any, i: number) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i === currentIndex ? "bg-white" : "bg-white/40"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default AgentUnidadesProyecto;
