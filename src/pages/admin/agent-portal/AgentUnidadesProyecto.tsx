import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useInventarioDisponiblePaginado } from "@/hooks/useInventarioDisponiblePaginado";
import type { InventarioPropiedad } from "@/hooks/useInventarioDisponible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Building2, Loader2, ArrowLeft, BedDouble, Bath, ShowerHead, Maximize2, FileText, ChevronLeft, ChevronRight, ChevronDown, X, Layers, Car, Search, SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown, Package, User } from "lucide-react";
import bodegaIcon from "@/assets/icons/bodega.png";
import useEmblaCarousel from "embla-carousel-react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { NewOfferDialog } from "@/components/admin/NewOfferDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentOnboardingStatus } from "@/hooks/useAgentOnboardingStatus";
import { useAgentPortalPermissions } from "@/hooks/useAgentPortalPermissions";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";

const PAGE_SIZE = 30;
type SortOrder = "none" | "asc" | "desc";
type TriState = "todos" | "si" | "no";

const AgentUnidadesProyecto = () => {
  const [searchParams] = useSearchParams();
  const proyectoIdParam = searchParams.get("proyecto");
  const modeloIdParam = searchParams.get("modelo");
  const openFiltersParam = searchParams.get("openFilters");
  const navigate = useNavigate();
  const { permissions: agentPerms } = useAgentPortalPermissions();
  const canGenerateOffer = agentPerms['/admin/agent/inventario']?.canGenerateOffer;
  const { profile } = useAuth();
  const personaId = profile?.id_persona;
  const isAgentRole = profile?.rol_nombre === 'Agente Inmobiliario';
  const { percentage, isLoading: isLoadingOnboarding, hasTrainingComplete, hasBasicIdentityComplete } = useAgentOnboardingStatus(personaId);
  const nombreCompleto = profile?.nombre || "Agente";
  const initials = nombreCompleto.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");

  // Permissions, logging, tracking
  const { permissions } = useAgentPortalPermissions();
  const unidadesPerms = permissions['/admin/agent/inventario'];
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();

  // Log page view
  useEffect(() => {
    registrarVista('/admin/agent/inventario/unidades');
    track({ page: 'agent_unidades', elementId: 'page_view', elementType: 'page' });
  }, []);

  // State declarations from line 41 to line 100
  const [page, setPage] = useState(0);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [selectedSchemeId, setSelectedSchemeId] = useState<number | null>(null);
  const [schemesOpen, setSchemesOpen] = useState(false);

  // Filters
  const [filterProjectNames, setFilterProjectNames] = useState<string[]>([]);
  const [filterModelNames, setFilterModelNames] = useState<string[]>([]);
  const [filterLevels, setFilterLevels] = useState<string[]>([]);
  const [filterBodega, setFilterBodega] = useState<TriState>("todos");
  const [filterEstacionamiento, setFilterEstacionamiento] = useState<TriState>("todos");
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(openFiltersParam === 'true');
  const [sortOrder, setSortOrder] = useState<SortOrder>("none");
  const [priceRange, setPriceRange] = useState<[number, number] | null>(null);
  const [priceRangeLocal, setPriceRangeLocal] = useState<[number, number] | null>(null);
  const priceCommitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recamarasFilter, setRecamarasFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Resolve proyecto/modelo ID from URL to name for pre-selecting filter, then clean URL
  const [paramsResolved, setParamsResolved] = useState(!proyectoIdParam && !modeloIdParam);
  useEffect(() => {
    if (!proyectoIdParam && !modeloIdParam) return;
    const resolveParams = async () => {
      const promises: Promise<void>[] = [];
      if (proyectoIdParam) {
        const pid = parseInt(proyectoIdParam);
        if (!isNaN(pid)) {
          promises.push(
            (supabase as any).from("proyectos").select("nombre").eq("id", pid).maybeSingle()
              .then(({ data }: any) => { if (data?.nombre) setFilterProjectNames([data.nombre]); })
          );
        }
      }
      if (modeloIdParam) {
        const mid = parseInt(modeloIdParam);
        if (!isNaN(mid)) {
          promises.push(
            (supabase as any).from("modelos").select("nombre").eq("id", mid).maybeSingle()
              .then(({ data }: any) => { if (data?.nombre) setFilterModelNames([data.nombre]); })
          );
        }
      }
      await Promise.all(promises);
      setParamsResolved(true);
      navigate('/admin/agent/inventario/unidades', { replace: true });
    };
    resolveParams();
  }, []);

  const bedroomsForQuery = useMemo(() => {
    if (recamarasFilter.length === 0) return [];
    const nums: number[] = [];
    recamarasFilter.forEach(opt => {
      if (opt === '4+') { nums.push(4, 5, 6, 7, 8, 9, 10); }
      else { const n = parseInt(opt); if (!isNaN(n)) nums.push(n); }
    });
    return nums;
  }, [recamarasFilter]);

  // bodegaValue, estacionamientoValue, query hook, pageProperties, filter options, price bounds, helpers - lines 102 to 258
  const bodegaValue = filterBodega === "si" ? true : filterBodega === "no" ? false : null;
  const estacionamientoValue = filterEstacionamiento === "si" ? true : filterEstacionamiento === "no" ? false : null;

  const { data: inventarioData, isLoading: isLoadingData, isFetching } = useInventarioDisponiblePaginado({
    projectNames: filterProjectNames.length > 0 ? filterProjectNames : undefined,
    modelNames: filterModelNames.length > 0 ? filterModelNames : undefined,
    bedrooms: bedroomsForQuery,
    levels: filterLevels.length > 0 ? filterLevels : undefined,
    hasBodega: bodegaValue,
    hasEstacionamiento: estacionamientoValue,
    sortPrice: sortOrder === "none" ? null : sortOrder,
    minPrice: priceRange ? priceRange[0] : null,
    maxPrice: priceRange ? priceRange[1] : null,
    page,
    pageSize: PAGE_SIZE,
  });

  const pageProperties = useMemo(() => {
    return (inventarioData?.propiedades || []).map((p: InventarioPropiedad) => {
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
  }, [inventarioData?.propiedades]);

  const availableProjectNames = inventarioData?.filterOptions?.proyectos || [];
  const availableModelNames = inventarioData?.filterOptions?.modelos || [];
  const availableLevelOptions = useMemo(() => {
    const levels = inventarioData?.filterOptions?.niveles || [];
    return [...levels].sort((a, b) => {
      const na = parseFloat(a);
      const nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return a.localeCompare(b);
    });
  }, [inventarioData?.filterOptions?.niveles]);
  const availableRecamaras = inventarioData?.filterOptions?.recamaras || [];
  const totalCount = inventarioData?.totalCount || 0;
  const totalPages = inventarioData?.totalPages || 0;
  const projectCounts = inventarioData?.projectCounts || {};
  const isLoading = isLoadingData;

  const priceBoundsRef = useRef<{ min: number; max: number } | null>(null);
  const priceBounds = useMemo(() => {
    const props = inventarioData?.propiedades || [];
    if (props.length === 0) return priceBoundsRef.current || { min: 0, max: 10000000 };
    const prices = props.map(p => p.precio_lista).filter(Boolean) as number[];
    if (prices.length === 0) return priceBoundsRef.current || { min: 0, max: 10000000 };
    const computed = { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
    if (!priceRange) {
      priceBoundsRef.current = computed;
    }
    return priceBoundsRef.current || computed;
  }, [inventarioData?.propiedades, priceRange]);

  const hasActiveFilters = filterProjectNames.length > 0 || filterModelNames.length > 0 || recamarasFilter.length > 0 || filterLevels.length > 0 || filterBodega !== "todos" || filterEstacionamiento !== "todos" || priceRange !== null;

  const clearAllFilters = () => {
    setFilterProjectNames([]);
    setFilterModelNames([]);
    setRecamarasFilter([]);
    setFilterLevels([]);
    setFilterBodega("todos");
    setFilterEstacionamiento("todos");
    setPriceRange(null);
    priceBoundsRef.current = null;
    setPage(0);
  };

  const cycleSortOrder = () => {
    const next = sortOrder === "none" ? "asc" : sortOrder === "asc" ? "desc" : "none";
    setSortOrder(next);
    setPage(0);
    track({ page: 'agent_unidades', elementId: 'btn_ordenar_precio', elementLabel: 'Ordenar precio', metadata: { orden: next } });
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

  useEffect(() => { setPage(0); }, [filterProjectNames, filterModelNames, recamarasFilter, filterLevels, filterBodega, filterEstacionamiento, priceRange]);
  useEffect(() => { setSelectedSchemeId(null); setSchemesOpen(false); }, [selectedProperty?.id]);

  const SortIcon = sortOrder === "asc" ? ArrowUp : sortOrder === "desc" ? ArrowDown : ArrowUpDown;

  const filteredPageProperties = useMemo(() => {
    let result = pageProperties;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(p => String(p.numero_propiedad).toLowerCase().includes(q));
    }
    return result;
  }, [pageProperties, searchQuery]);

  const toggleChip = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];

  const recamarasOptions = availableRecamaras.length > 0
    ? [...new Set([...availableRecamaras.map(n => n <= 3 ? String(n) : '4+')])]
    : ['1', '2', '3', '4+'];

  const triStateOptions: { value: TriState; label: string }[] = [
    { value: "todos", label: "Todos" },
    { value: "si", label: "Sí" },
    { value: "no", label: "No" },
  ];

  const chipClass = (active: boolean) =>
    `px-3.5 py-2 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
      active
        ? "bg-emerald-600 text-white border-emerald-600"
        : "bg-white border-gray-200 text-foreground hover:bg-gray-50"
    }`;

  const activeFilterCount = (filterProjectNames.length > 0 ? 1 : 0) + (filterModelNames.length > 0 ? 1 : 0) + (recamarasFilter.length > 0 ? 1 : 0) + (filterLevels.length > 0 ? 1 : 0) + (filterBodega !== "todos" ? 1 : 0) + (filterEstacionamiento !== "todos" ? 1 : 0) + (priceRange ? 1 : 0);

  const filterContent = (
    <div className="space-y-6">
      {availableProjectNames.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Desarrollo</Label>
          <div className="flex flex-wrap gap-2">
            {availableProjectNames.map((name) => (
              <button key={name} onClick={() => setFilterProjectNames(prev => toggleChip(prev, name))} className={chipClass(filterProjectNames.includes(name))}>
                {name}{projectCounts[name] != null ? ` (${projectCounts[name]})` : ''}
              </button>
            ))}
          </div>
        </div>
      )}
      {availableModelNames.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modelo</Label>
          <div className="flex flex-wrap gap-2">
            {availableModelNames.map((m) => (
              <button key={m} onClick={() => setFilterModelNames(prev => toggleChip(prev, m))} className={chipClass(filterModelNames.includes(m))}>
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
      {availableLevelOptions.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nivel</Label>
          <div className="flex flex-wrap gap-2">
            {availableLevelOptions.map((l) => (
              <button key={l} onClick={() => setFilterLevels(prev => toggleChip(prev, l))} className={chipClass(filterLevels.includes(l))}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recámaras</Label>
        <div className="flex flex-wrap gap-2">
          {recamarasOptions.map((opt) => (
            <button key={opt} onClick={() => setRecamarasFilter(prev => toggleChip(prev, opt))} className={chipClass(recamarasFilter.includes(opt))}>
              {opt}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rango de precio</Label>
        <Slider
          min={priceBounds.min}
          max={priceBounds.max}
          step={10000}
          value={priceRangeLocal || priceRange || [priceBounds.min, priceBounds.max]}
          onValueChange={(val) => setPriceRangeLocal(val as [number, number])}
          onValueCommit={(val) => {
            setPriceRangeLocal(null);
            setPriceRange(val as [number, number]);
          }}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatPrice((priceRangeLocal || priceRange)?.[0] ?? priceBounds.min)}</span>
          <span>{formatPrice((priceRangeLocal || priceRange)?.[1] ?? priceBounds.max)}</span>
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Con bodega</Label>
        <div className="flex gap-2">
          {triStateOptions.map((opt) => (
            <button key={opt.value} onClick={() => setFilterBodega(opt.value)} className={chipClass(filterBodega === opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Con estacionamiento</Label>
        <div className="flex gap-2">
          {triStateOptions.map((opt) => (
            <button key={opt.value} onClick={() => setFilterEstacionamiento(opt.value)} className={chipClass(filterEstacionamiento === opt.value)}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const handleOpenFilters = () => {
    setFiltersDrawerOpen(true);
    track({ page: 'agent_unidades', elementId: 'btn_filtros', elementLabel: 'Filtros' });
  };

  const handleClickUnit = (prop: any) => {
    setSelectedProperty(prop);
    track({ page: 'agent_unidades', elementId: 'btn_detalle_unidad', elementLabel: `Depto ${prop.numero || prop.id}`, metadata: { propiedad_id: prop.id, proyecto: prop.proyecto_nombre } });
  };

  const handleConfigureOffer = () => {
    track({ page: 'agent_unidades', elementId: 'btn_configurar_oferta', elementLabel: 'Configurar Oferta', metadata: { propiedad_id: selectedProperty?.id, proyecto: selectedProperty?.proyecto_nombre } });
  };

  return (
    <div className="pb-24">
      {/* No verificado badge - fixed */}
      {isAgentRole && !isLoadingOnboarding && percentage < 100 && (
        <div className="fixed top-3 right-4 z-50">
          <Badge
            variant="outline"
            className="border-destructive/30 text-destructive gap-1 bg-white shadow-sm"
          >
            <span className="h-2 w-2 rounded-full bg-destructive inline-block" />
            No verificado
          </Badge>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 bg-[hsl(var(--agent-bg))] px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/admin/agent/inventario")} className="h-9 w-9 rounded-full bg-white border border-gray-200 flex items-center justify-center">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-9 w-9 rounded-full bg-[hsl(var(--agent-primary))] flex items-center justify-center shrink-0">
            {initials ? (
              <span className="text-sm font-bold text-white leading-none">{initials}</span>
            ) : (
              <User className="h-4 w-4 text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[hsl(var(--agent-text))]">{nombreCompleto}</p>
            <p className="text-xs text-emerald-700">{totalCount} unidades disponibles</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenFilters}
            className="flex items-center gap-2 px-4 h-10 rounded-xl border border-gray-200 bg-white text-sm font-medium"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="ml-0.5 h-5 min-w-[20px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
              placeholder="Buscar..."
            />
          </div>
          <button
            onClick={cycleSortOrder}
            className={`h-10 w-10 rounded-xl flex items-center justify-center border transition-colors ${
              sortOrder !== "none"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white border-gray-200 text-muted-foreground"
            }`}
            title={sortOrder === "none" ? "Ordenar por precio" : sortOrder === "asc" ? "Precio: menor a mayor" : "Precio: mayor a menor"}
          >
            <SortIcon className="h-4 w-4" />
          </button>
        </div>
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            {filterProjectNames.map(name => (
              <Badge key={`p-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterProjectNames(prev => prev.filter(n => n !== name))}>
                {name} <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
            {filterModelNames.map(name => (
              <Badge key={`m-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterModelNames(prev => prev.filter(n => n !== name))}>
                {name} <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
            {recamarasFilter.map(opt => (
              <Badge key={`r-${opt}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setRecamarasFilter(prev => prev.filter(v => v !== opt))}>
                {opt} rec. <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
            {filterLevels.map(name => (
              <Badge key={`l-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterLevels(prev => prev.filter(n => n !== name))}>
                Nivel {name} <X className="h-2.5 w-2.5" />
              </Badge>
            ))}
            {filterBodega !== "todos" && (
              <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterBodega("todos")}>
                {filterBodega === "si" ? "Con bodega" : "Sin bodega"} <X className="h-2.5 w-2.5" />
              </Badge>
            )}
            {filterEstacionamiento !== "todos" && (
              <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterEstacionamiento("todos")}>
                {filterEstacionamiento === "si" ? "Con estac." : "Sin estac."} <X className="h-2.5 w-2.5" />
              </Badge>
            )}
            {priceRange && (
              <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setPriceRange(null)}>
                Precio <X className="h-2.5 w-2.5" />
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
            <Button className="w-full rounded-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setFiltersDrawerOpen(false)}>
              <Search className="h-4 w-4" /> Ver {totalCount} unidades
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Properties Grid */}
      <div className="px-4 mt-2">
        {isLoading || !paramsResolved ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredPageProperties.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No hay unidades disponibles</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPageProperties.map((prop: any) => (
                <UnitCard key={prop.id} prop={prop} formatPrice={formatPrice} onClick={() => handleClickUnit(prop)} />
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
                  <div className="bg-emerald-50 rounded-xl p-4 text-center">
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
                              isSelected ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/20" : "border-border/60 bg-gradient-to-br from-card to-muted/30 hover:border-emerald-600/40"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isSelected && <span className="h-2 w-2 rounded-full bg-emerald-600 shrink-0" />}
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
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700 font-medium flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    Plan seleccionado: {getSchemesForProperty(selectedProperty).find((s: any) => s.id === selectedSchemeId)?.nombre || ""}
                  </div>
                )}
              </div>
              <div className="shrink-0 px-6 py-4 border-t bg-background">
                {canGenerateOffer ? (
                  isAgentRole && !hasTrainingComplete ? (
                    <Button className="w-full gap-2 rounded-full" size="lg" disabled>
                      <FileText className="h-5 w-5" /> Completa tu capacitación para generar ofertas
                    </Button>
                  ) : (
                  <div onClick={(e) => { e.stopPropagation(); handleConfigureOffer(); }}>
                    <NewOfferDialog
                      propertyId={selectedProperty.id}
                      propertyNumber={selectedProperty.numero || `${selectedProperty.id}`}
                      hideManualMode={true}
                      hidePdfOptions={true}
                      preSelectedSchemeId={selectedSchemeId}
                      hideBankingInPdf={isAgentRole && !hasBasicIdentityComplete}
                      customTrigger={
                        <button className="group relative w-full inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-emerald-600 text-white font-semibold text-sm shadow-lg hover:bg-emerald-700 active:scale-[0.98] transition-all">
                          <FileText className="h-5 w-5" />
                          <span>
                            Configurar Oferta
                            {selectedSchemeId && (
                              <span className="ml-1 text-xs opacity-80">({getSchemesForProperty(selectedProperty).find((s: any) => s.id === selectedSchemeId)?.nombre})</span>
                            )}
                          </span>
                        </button>
                      }
                    />
                  </div>
                  )
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
      <p className="text-[11px] text-muted-foreground">{prop.proyecto_nombre} • {prop.modelo_nombre}</p>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {prop.m2_total > 0 && (
          <span className="flex items-center gap-1"><Maximize2 className="h-3 w-3" /> {prop.m2_total.toFixed(1)} m²</span>
        )}
        {prop.recamaras > 0 && (
          <span className="flex items-center gap-1"><BedDouble className="h-4 w-4" /> {prop.recamaras}</span>
        )}
        {prop.banos > 0 && (
          <span className="flex items-center gap-1"><Bath className="h-4 w-4" /> {prop.banos}</span>
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
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi, onSelect]);

  if (images.length === 0) return null;

  return (
    <div className="relative rounded-xl overflow-hidden">
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {images.map((img: any, i: number) => (
            <div key={img.id || i} className="min-w-0 flex-[0_0_100%]">
              <img src={img.url} alt="" className="w-full h-56 object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      </div>
      {images.length > 1 && (
        <>
          <button onClick={scrollPrev} className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white flex items-center justify-center">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={scrollNext} className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/40 text-white flex items-center justify-center">
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_: any, i: number) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === currentIndex ? "bg-white" : "bg-white/50"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default AgentUnidadesProyecto;
