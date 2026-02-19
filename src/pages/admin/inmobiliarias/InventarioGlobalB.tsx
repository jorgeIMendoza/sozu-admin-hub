import { useNavigate, useSearchParams } from "react-router-dom";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useInventarioDisponible, InventarioPropiedad } from "@/hooks/useInventarioDisponible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Building2, Loader2, BedDouble, Bath, ShowerHead, Maximize2, DollarSign, FileText, ChevronLeft, ChevronRight, ChevronDown, X, Package, Layers, Car, Search, SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown, UserPlus, CalendarDays } from "lucide-react";
import { APP_VERSION } from "@/lib/config";
import bodegaIcon from "@/assets/icons/bodega.png";
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import useEmblaCarousel from "embla-carousel-react";
import { NewOfferDialog } from "@/components/admin/NewOfferDialog";
import { AgentImpersonationSelector } from "@/components/admin/AgentImpersonationSelector";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentImpersonation } from "@/contexts/AgentImpersonationContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAgentOnboardingStatus } from "@/hooks/useAgentOnboardingStatus";
import { AgentOnboardingStepDialog } from "@/components/admin/AgentOnboardingStepDialog";
import type { OnboardingStep } from "@/hooks/useAgentOnboardingStatus";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { User, Bell, LogOut, Check } from "lucide-react";
import { AddProspectoFloatingDialog } from "@/components/admin/AddProspectoFloatingDialog";
import { AgendarCitaShowroomDialog } from "@/components/admin/AgendarCitaShowroomDialog";

const SIMPLIFIED_ROLES = ["Agente Inmobiliario", "Inmobiliaria", "Super Administrador", "Administrador de Proyecto"];

const PAGE = "inventario";

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

type SortOrder = "none" | "asc" | "desc";

// Profile Menu — same as Variant A
const ProfileMenu = ({ onLogout, onTrack }: { onLogout: () => void; onTrack?: () => void }) => {
  const { profile, user } = useAuth();
  const { impersonatedAgentPersonaId, impersonatedAgentName, isImpersonating } = useAgentImpersonation();
  const effectivePersonaId = isImpersonating ? impersonatedAgentPersonaId : profile?.id_persona;
  const effectiveName = isImpersonating ? impersonatedAgentName : (profile?.nombre || "Usuario");
  const effectiveEmail = isImpersonating ? impersonatedAgentName : (profile?.email || user?.email);

  const { data: agentCommission } = useQuery({
    queryKey: ["agent-commission", effectivePersonaId],
    queryFn: async () => {
      if (!effectivePersonaId) return null;
      const { data } = await supabase.from("entidades_relacionadas").select("porcentaje_comision").eq("id_persona", effectivePersonaId).eq("id_tipo_entidad", 19).eq("activo", true).is("id_proyecto", null).maybeSingle();
      return data?.porcentaje_comision ?? null;
    },
    enabled: !!effectivePersonaId,
  });

  const { steps, percentage, isLoading: onboardingLoading } = useAgentOnboardingStatus(effectivePersonaId ?? 0);
  const [activeStep, setActiveStep] = useState<OnboardingStep['id'] | null>(null);

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button onClick={() => onTrack?.()} className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors shrink-0">
            <User className="h-3.5 w-3.5 text-primary" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end">
          <div className="p-4 space-y-3">
            <div>
              <p className="font-semibold text-sm text-foreground">{effectiveName}</p>
              <p className="text-xs text-muted-foreground">{effectiveEmail}</p>
            </div>
            <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
              <span className="text-xs text-muted-foreground">Comisión</span>
              <Badge variant="outline" className="text-xs px-2 border-primary/30 text-primary font-semibold">
                {agentCommission != null ? `${agentCommission}%` : "2.00%"}
              </Badge>
            </div>
            {effectivePersonaId && !onboardingLoading && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Perfil</span>
                  <span className="text-xs font-bold text-foreground">{percentage}%</span>
                </div>
                <div className="flex items-center gap-1">
                  {steps.map((step, i) => (
                    <React.Fragment key={step.id}>
                      <button onClick={() => setActiveStep(step.id)} className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all shrink-0 ${step.isComplete ? "bg-emerald-500 text-white" : step.hasPartialData ? "border-2 border-emerald-500 text-emerald-600 bg-transparent" : "bg-muted text-muted-foreground hover:bg-muted-foreground/10"}`} title={step.label}>
                        {step.isComplete ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                      </button>
                      {i < steps.length - 1 && <div className={`flex-1 h-0.5 rounded-full ${step.isComplete ? "bg-emerald-400" : "bg-muted"}`} />}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
              <Bell className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Sin notificaciones</span>
            </div>
            <button onClick={onLogout} className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors text-sm font-medium">
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
            <p className="text-[10px] text-muted-foreground/40 text-center">{APP_VERSION}</p>
          </div>
        </PopoverContent>
      </Popover>
      {activeStep && effectivePersonaId && (
        <AgentOnboardingStepDialog step={activeStep} personaId={effectivePersonaId} open={!!activeStep} onOpenChange={(open) => { if (!open) setActiveStep(null); }} />
      )}
    </>
  );
};

const InventarioGlobalB = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { canGenerateOffer } = usePagePermissions('/admin/inmobiliarias/inventario');
  const { propiedades: rawPropiedades, isLoading } = useInventarioDisponible();
  const isMobile = useIsMobile();
  const { profile, signOut } = useAuth();
  const isSimplifiedRole = SIMPLIFIED_ROLES.includes(profile?.rol_nombre ?? "");
  const { track } = useCtaTracker();

  const pageViewTracked = useRef(false);
  useEffect(() => {
    if (!pageViewTracked.current) {
      track({ page: "inventario", elementId: "page_view" });
      pageViewTracked.current = true;
    }
  }, [track]);

  const initialProject = searchParams.get('proyecto');
  const shouldOpenFilters = searchParams.get('openFilters') === 'true';

  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [selectedSchemeId, setSelectedSchemeId] = useState<number | null>(null);
  const [filterProjectNames, setFilterProjectNames] = useState<string[]>(initialProject ? [initialProject] : []);
  const [filterModelNames, setFilterModelNames] = useState<string[]>([]);
  const [filterBedrooms, setFilterBedrooms] = useState<string[]>([]);
  const [filterLevels, setFilterLevels] = useState<string[]>([]);
  const [filterBodega, setFilterBodega] = useState<string | null>(null);
  const [filterEstacionamiento, setFilterEstacionamiento] = useState<string | null>(null);
  const [schemesOpen, setSchemesOpen] = useState(false);
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(shouldOpenFilters);
  const [sortOrder, setSortOrder] = useState<SortOrder>("none");
  const [addProspectoOpen, setAddProspectoOpen] = useState(false);
  const [agendarCitaOpen, setAgendarCitaOpen] = useState(false);

  const [showHeaderBar, setShowHeaderBar] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY > lastScrollY.current && currentY > 60) setShowHeaderBar(false);
      else if (currentY < lastScrollY.current) setShowHeaderBar(true);
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const allAvailableProperties = useMemo(() => {
    return rawPropiedades.map((p: InventarioPropiedad) => {
      const propImgs = p.propiedad_imagenes || [];
      const modelImgs = p.modelo_imagenes || [];
      const rawImages = shuffleArray(propImgs.length > 0 ? propImgs : modelImgs);
      return {
        id: p.id, numero_propiedad: p.numero_propiedad, numero: p.numero_propiedad, piso: p.numero_piso,
        precio_lista: p.precio_lista, m2_interiores: p.m2_interiores, m2_exteriores: p.m2_exteriores,
        m2_total: (p.m2_interiores || 0) + (p.m2_exteriores || 0),
        proyecto_id: p.proyecto_id, proyecto_nombre: p.proyecto_nombre, edificio_nombre: p.edificio_nombre,
        modelo_id: p.modelo_id, modelo_nombre: p.modelo_nombre,
        recamaras: p.numero_recamaras, banos: p.numero_completo_banos, medio_bano: p.numero_medio_bano,
        bodegas_count: p.bodegas_count, estacionamientos_count: p.estacionamientos_count,
        estacionamientos_tipos: p.estacionamientos_tipos || [],
        model_images: rawImages, esquemas_pago: p.esquemas_pago || [],
      };
    });
  }, [rawPropiedades]);

  const projectsWithAvailable = useMemo(() => [...new Set(allAvailableProperties.map(p => p.proyecto_nombre))].sort(), [allAvailableProperties]);
  const availableModelNames = useMemo(() => {
    let source = allAvailableProperties;
    if (filterProjectNames.length > 0) source = source.filter(p => filterProjectNames.includes(p.proyecto_nombre));
    return [...new Set(source.map(p => p.modelo_nombre).filter(Boolean))].sort();
  }, [allAvailableProperties, filterProjectNames]);
  const availableBedroomOptions = useMemo(() => [...new Set(allAvailableProperties.filter(p => p.recamaras > 0).map(p => `${p.recamaras} recámara${p.recamaras > 1 ? "s" : ""}`))].sort(), [allAvailableProperties]);
  const availableLevelOptions = useMemo(() => {
    const levels = [...new Set(allAvailableProperties.filter(p => p.piso).map(p => p.piso!))];
    return levels.sort((a, b) => { const na = parseInt(a), nb = parseInt(b); if (!isNaN(na) && !isNaN(nb)) return na - nb; return a.localeCompare(b); });
  }, [allAvailableProperties]);

  const filteredProperties = useMemo(() => {
    let result = allAvailableProperties;
    if (filterProjectNames.length > 0) result = result.filter(p => filterProjectNames.includes(p.proyecto_nombre));
    if (filterModelNames.length > 0) result = result.filter(p => filterModelNames.includes(p.modelo_nombre));
    if (filterBedrooms.length > 0) { const bedNums = filterBedrooms.map(b => parseInt(b)); result = result.filter(p => bedNums.includes(p.recamaras)); }
    if (filterLevels.length > 0) result = result.filter(p => p.piso && filterLevels.includes(p.piso));
    if (filterBodega === "con") result = result.filter(p => p.bodegas_count > 0);
    else if (filterBodega === "sin") result = result.filter(p => p.bodegas_count === 0);
    if (filterEstacionamiento === "con") result = result.filter(p => p.estacionamientos_count > 0);
    else if (filterEstacionamiento === "sin") result = result.filter(p => p.estacionamientos_count === 0);
    return result;
  }, [allAvailableProperties, filterProjectNames, filterModelNames, filterBedrooms, filterLevels, filterBodega, filterEstacionamiento]);

  const sortedProperties = useMemo(() => {
    if (sortOrder === "none") return filteredProperties;
    return [...filteredProperties].sort((a, b) => sortOrder === "asc" ? a.precio_lista - b.precio_lista : b.precio_lista - a.precio_lista);
  }, [filteredProperties, sortOrder]);

  // Group by project for carousel layout
  const groupedByProject = useMemo(() => {
    const map = new Map<string, any[]>();
    sortedProperties.forEach(p => {
      if (!map.has(p.proyecto_nombre)) map.set(p.proyecto_nombre, []);
      map.get(p.proyecto_nombre)!.push(p);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [sortedProperties]);

  const hasActiveFilters = filterProjectNames.length > 0 || filterModelNames.length > 0 || filterBedrooms.length > 0 || filterLevels.length > 0 || filterBodega !== null || filterEstacionamiento !== null;
  const activeFilterCount = filterProjectNames.length + filterModelNames.length + filterBedrooms.length + filterLevels.length + (filterBodega ? 1 : 0) + (filterEstacionamiento ? 1 : 0);

  const clearAllFilters = () => { setFilterProjectNames([]); setFilterModelNames([]); setFilterBedrooms([]); setFilterLevels([]); setFilterBodega(null); setFilterEstacionamiento(null); };
  const cycleSortOrder = () => { const next = sortOrder === "none" ? "asc" : sortOrder === "asc" ? "desc" : "none"; setSortOrder(next); track({ page: "inventario", elementId: "btn_ordenamiento", metadata: { orden: next } }); };

  const formatPrice = (price: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(price);

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

  const sortLabel = sortOrder === "asc" ? "Menor precio" : sortOrder === "desc" ? "Mayor precio" : "Ordenar";
  const SortIcon = sortOrder === "asc" ? ArrowUp : sortOrder === "desc" ? ArrowDown : ArrowUpDown;

  const filterContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-full bg-rose-100 flex items-center justify-center"><Building2 className="h-4 w-4 text-rose-500" /></div><span className="text-sm font-semibold text-foreground">Proyecto</span></div>
        <MultiSelectFilter values={filterProjectNames} onValuesChange={(v) => { setFilterProjectNames(v); if (v.length > filterProjectNames.length) track({ page: "inventario", elementId: "btn_busqueda", metadata: { filtro: "proyecto" } }); }} options={projectsWithAvailable} placeholder="Todos los proyectos" searchPlaceholder="Buscar proyecto..." />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center"><Maximize2 className="h-4 w-4 text-blue-500" /></div><span className="text-sm font-semibold text-foreground">Modelo</span></div>
        <MultiSelectFilter values={filterModelNames} onValuesChange={(v) => { setFilterModelNames(v); if (v.length > filterModelNames.length) track({ page: "inventario", elementId: "btn_busqueda", metadata: { filtro: "modelo" } }); }} options={availableModelNames} placeholder="Todos los modelos" searchPlaceholder="Buscar modelo..." />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-full bg-violet-100 flex items-center justify-center"><BedDouble className="h-4 w-4 text-violet-500" /></div><span className="text-sm font-semibold text-foreground">Recámaras</span></div>
        <MultiSelectFilter values={filterBedrooms} onValuesChange={(v) => { setFilterBedrooms(v); if (v.length > filterBedrooms.length) track({ page: "inventario", elementId: "btn_busqueda", metadata: { filtro: "recamaras" } }); }} options={availableBedroomOptions} placeholder="Todas" searchPlaceholder="Buscar..." />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center"><Layers className="h-4 w-4 text-amber-500" /></div><span className="text-sm font-semibold text-foreground">Nivel</span></div>
        <MultiSelectFilter values={filterLevels} onValuesChange={(v) => { setFilterLevels(v); if (v.length > filterLevels.length) track({ page: "inventario", elementId: "btn_busqueda", metadata: { filtro: "nivel" } }); }} options={availableLevelOptions} placeholder="Todos los niveles" searchPlaceholder="Buscar nivel..." />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center"><img src={bodegaIcon} alt="" className="h-4 w-4" /></div><span className="text-sm font-semibold text-foreground">Bodega</span></div>
        <MultiSelectFilter values={filterBodega ? [filterBodega === "con" ? "Con bodega" : "Sin bodega"] : []} onValuesChange={(vals) => { if (vals.length === 0) setFilterBodega(null); else { const last = vals[vals.length - 1]; setFilterBodega(last === "Con bodega" ? "con" : "sin"); track({ page: "inventario", elementId: "btn_busqueda", metadata: { filtro: "bodega" } }); } }} options={["Con bodega", "Sin bodega"]} placeholder="Todas" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2.5"><div className="h-8 w-8 rounded-full bg-sky-100 flex items-center justify-center"><Car className="h-4 w-4 text-sky-500" /></div><span className="text-sm font-semibold text-foreground">Estacionamiento</span></div>
        <MultiSelectFilter values={filterEstacionamiento ? [filterEstacionamiento === "con" ? "Con estac." : "Sin estac."] : []} onValuesChange={(vals) => { if (vals.length === 0) setFilterEstacionamiento(null); else { const last = vals[vals.length - 1]; setFilterEstacionamiento(last === "Con estac." ? "con" : "sin"); track({ page: "inventario", elementId: "btn_busqueda", metadata: { filtro: "estacionamiento" } }); } }} options={["Con estac.", "Sin estac."]} placeholder="Todos" />
      </div>
    </div>
  );

  if (isLoading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className={`max-w-5xl mx-auto px-3 ${isSimplifiedRole ? "pb-24" : "pb-10"}`}>
      {/* === HEADER — identical to Variant A === */}
      {isSimplifiedRole ? (
        <div className={`sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/50 -mx-3 px-3 py-2.5 transition-transform duration-300 ${showHeaderBar ? "translate-y-0" : "-translate-y-full"}`}>
          {profile?.rol_nombre === "Super Administrador" && <AgentImpersonationSelector />}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setFiltersDrawerOpen(true)} className="flex-1 flex items-center gap-2 px-3 py-2 rounded-full border border-border/80 bg-card shadow-sm hover:shadow-md transition-shadow">
              <Search className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground truncate">Buscar</span>
              {hasActiveFilters && <Badge className="text-[10px] px-1.5 py-0 ml-auto bg-emerald-500 text-white border-0 hover:bg-emerald-600">{activeFilterCount}</Badge>}
            </button>
            <button onClick={cycleSortOrder} className={`h-8 w-8 rounded-full flex items-center justify-center border transition-colors shrink-0 ${sortOrder !== "none" ? "bg-emerald-500 text-white border-emerald-500 shadow-md" : "bg-card border-border/80 text-muted-foreground hover:bg-muted"}`} title={sortLabel}>
              <SortIcon className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { track({ page: "inventario", elementId: "btn_desarrollos" }); navigate('/admin/inmobiliarias/proyectos'); }} className="h-8 w-8 rounded-full flex items-center justify-center bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 transition-colors shrink-0" title="Desarrollos"><Building2 className="h-3.5 w-3.5" /></button>
            <button onClick={() => { track({ page: "inventario", elementId: "btn_agregar_prospecto" }); setAddProspectoOpen(true); }} className="h-8 w-8 rounded-full flex items-center justify-center bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 transition-colors shrink-0" title="Agregar prospecto"><UserPlus className="h-3.5 w-3.5" /></button>
            <button onClick={() => { track({ page: "inventario", elementId: "btn_agendar_cita" }); setAgendarCitaOpen(true); }} className="h-8 w-8 rounded-full flex items-center justify-center bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 transition-colors shrink-0" title="Agendar cita al showroom"><CalendarDays className="h-3.5 w-3.5" /></button>
            <ProfileMenu onLogout={signOut} onTrack={() => track({ page: "inventario", elementId: "btn_perfil_usuario" })} />
          </div>
        </div>
      ) : (
        <div className="space-y-0 pt-6">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-0.5">
              <h1 className="text-xl font-bold text-foreground">Inventario Disponible</h1>
              <p className="text-sm text-muted-foreground">{sortedProperties.length} unidades disponibles</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/inmobiliarias/proyectos")} className="rounded-full gap-1.5 text-xs font-medium border-primary/30 text-primary hover:bg-primary/5">
              <Building2 className="h-3.5 w-3.5" /> Proyectos
            </Button>
          </div>
          <AgentImpersonationSelector />
        </div>
      )}

      {/* Count + sort label for simplified */}
      {isSimplifiedRole && (
        <div className="flex items-center justify-between pt-3 pb-1">
          <p className="text-sm text-muted-foreground">{sortedProperties.length} unidades</p>
          {sortOrder !== "none" && (
            <button onClick={cycleSortOrder} className="text-xs text-primary font-medium flex items-center gap-1">
              <SortIcon className="h-3 w-3" /> {sortLabel} <X className="h-3 w-3 ml-0.5" />
            </button>
          )}
        </div>
      )}

      {/* Search bar for non-simplified roles */}
      {!isSimplifiedRole && (
        <div className="space-y-3 mt-6">
          <div className="flex gap-2">
            <button onClick={() => setFiltersDrawerOpen(true)} className="flex-1 flex items-center gap-3 px-5 py-3.5 rounded-full border border-border/80 bg-card shadow-md hover:shadow-lg transition-shadow max-w-xl">
              <Search className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-foreground">Buscar propiedades</p>
                <p className="text-xs text-muted-foreground">{hasActiveFilters ? `${activeFilterCount} filtro${activeFilterCount > 1 ? 's' : ''} activo${activeFilterCount > 1 ? 's' : ''}` : "Filtrar por proyecto, modelo, recámaras..."}</p>
              </div>
              <div className="relative">
                <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                {hasActiveFilters && <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center font-bold">{activeFilterCount}</span>}
              </div>
            </button>
            <button onClick={cycleSortOrder} className={`h-12 px-4 rounded-full flex items-center gap-2 border transition-colors shrink-0 ${sortOrder !== "none" ? "bg-emerald-500 text-white border-emerald-500" : "bg-card border-border/80 text-muted-foreground hover:bg-muted"}`}>
              <SortIcon className="h-4 w-4" />
              <span className="text-sm font-medium hidden sm:inline">{sortLabel}</span>
            </button>
          </div>
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5">
              {filterProjectNames.map(name => <Badge key={`p-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterProjectNames(prev => prev.filter(n => n !== name))}>{name.length > 15 ? name.slice(0, 12) + "…" : name} <X className="h-2.5 w-2.5" /></Badge>)}
              {filterModelNames.map(name => <Badge key={`m-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterModelNames(prev => prev.filter(n => n !== name))}>{name} <X className="h-2.5 w-2.5" /></Badge>)}
              {filterBedrooms.map(name => <Badge key={`b-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterBedrooms(prev => prev.filter(n => n !== name))}>{name} <X className="h-2.5 w-2.5" /></Badge>)}
              {filterLevels.map(name => <Badge key={`l-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterLevels(prev => prev.filter(n => n !== name))}>Nivel {name} <X className="h-2.5 w-2.5" /></Badge>)}
              {filterBodega && <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterBodega(null)}>{filterBodega === "con" ? "Con bodega" : "Sin bodega"} <X className="h-2.5 w-2.5" /></Badge>}
              {filterEstacionamiento && <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterEstacionamiento(null)}>{filterEstacionamiento === "con" ? "Con estac." : "Sin estac."} <X className="h-2.5 w-2.5" /></Badge>}
              <button className="text-[10px] text-destructive font-medium px-1" onClick={clearAllFilters}>Limpiar</button>
            </div>
          )}
        </div>
      )}

      {/* Active filter badges for simplified roles */}
      {isSimplifiedRole && hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pb-2">
          {filterProjectNames.map(name => <Badge key={`p-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterProjectNames(prev => prev.filter(n => n !== name))}>{name.length > 15 ? name.slice(0, 12) + "…" : name} <X className="h-2.5 w-2.5" /></Badge>)}
          {filterModelNames.map(name => <Badge key={`m-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterModelNames(prev => prev.filter(n => n !== name))}>{name} <X className="h-2.5 w-2.5" /></Badge>)}
          {filterBedrooms.map(name => <Badge key={`b-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterBedrooms(prev => prev.filter(n => n !== name))}>{name} <X className="h-2.5 w-2.5" /></Badge>)}
          {filterLevels.map(name => <Badge key={`l-${name}`} variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterLevels(prev => prev.filter(n => n !== name))}>Nivel {name} <X className="h-2.5 w-2.5" /></Badge>)}
          {filterBodega && <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterBodega(null)}>{filterBodega === "con" ? "Con bodega" : "Sin bodega"} <X className="h-2.5 w-2.5" /></Badge>}
          {filterEstacionamiento && <Badge variant="secondary" className="text-[10px] gap-1 cursor-pointer px-2 py-0.5" onClick={() => setFilterEstacionamiento(null)}>{filterEstacionamiento === "con" ? "Con estac." : "Sin estac."} <X className="h-2.5 w-2.5" /></Badge>}
          <button className="text-[10px] text-destructive font-medium px-1" onClick={clearAllFilters}>Limpiar</button>
        </div>
      )}

      {/* Filters Drawer */}
      <Drawer open={filtersDrawerOpen} onOpenChange={setFiltersDrawerOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="flex items-center justify-between">
              <span>Filtrar propiedades</span>
              {hasActiveFilters && <Button variant="ghost" size="sm" className="text-xs text-destructive h-7" onClick={clearAllFilters}>Limpiar todo</Button>}
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6 max-h-[65vh]">{filterContent}</div>
          <div className="px-4 py-3 border-t">
            <Button className="w-full rounded-full gap-2" onClick={() => setFiltersDrawerOpen(false)}>
              <Search className="h-4 w-4" /> Ver {sortedProperties.length} resultados
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* === VARIANT B DIFFERENTIATOR: Grouped by project with swipe carousels === */}
      {groupedByProject.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No hay propiedades disponibles con los filtros seleccionados</p>
        </div>
      ) : (
        <div className="space-y-8 mt-4">
          {groupedByProject.map(([projectName, props]) => (
            <div key={projectName} className="space-y-3">
              <div className="flex items-center gap-3 px-1">
                <Building2 className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">{projectName}</h2>
                <Badge variant="secondary" className="text-xs">{props.length} disponibles</Badge>
              </div>
              <ProjectSwipeCarousel
                properties={props}
                formatPrice={formatPrice}
                onSelectProperty={(p) => {
                  setSelectedProperty(p);
                  track({ page: "inventario", elementId: "view_property_detail", elementLabel: `Depto ${p.numero || p.id}`, metadata: { propertyId: p.id, project: projectName } });
                }}
                onSwipe={() => track({ page: "inventario", elementId: "carousel_swipe", elementLabel: `Swipe ${projectName}`, metadata: { project: projectName } })}
              />
            </div>
          ))}
        </div>
      )}

      {/* === FLOATING BUTTONS — identical to Variant A === */}
      {isSimplifiedRole && !showHeaderBar && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button onClick={() => { track({ page: "inventario", elementId: "btn_desarrollos" }); navigate('/admin/inmobiliarias/proyectos'); }} className="h-12 w-12 rounded-full bg-emerald-500 text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform" title="Desarrollos"><Building2 className="h-5 w-5" /></button>
          <button onClick={() => { track({ page: "inventario", elementId: "btn_agregar_prospecto" }); setAddProspectoOpen(true); }} className="h-12 w-12 rounded-full bg-emerald-500 text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform" title="Agregar prospecto"><UserPlus className="h-5 w-5" /></button>
          <button onClick={() => { track({ page: "inventario", elementId: "btn_agendar_cita" }); setAgendarCitaOpen(true); }} className="h-12 w-12 rounded-full bg-emerald-500 text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform" title="Agendar cita al showroom"><CalendarDays className="h-5 w-5" /></button>
          <div className="h-6 w-px bg-white/30" />
          <button onClick={() => setFiltersDrawerOpen(true)} className="h-12 px-5 rounded-full bg-foreground text-background shadow-xl flex items-center gap-2 font-medium text-sm hover:scale-105 transition-transform">
            <SlidersHorizontal className="h-4 w-4" /> Filtros
            {hasActiveFilters && <span className="h-5 w-5 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center font-bold">{activeFilterCount}</span>}
          </button>
          <button onClick={cycleSortOrder} className={`h-12 w-12 rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform ${sortOrder !== "none" ? "bg-emerald-500 text-white" : "bg-foreground text-background"}`}>
            <SortIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Property Detail Dialog — identical to Variant A */}
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
                  {selectedProperty.recamaras > 0 && <span className="flex items-center gap-1"><BedDouble className="h-4 w-4" /> {selectedProperty.recamaras} recámara{selectedProperty.recamaras > 1 ? "s" : ""}</span>}
                  {selectedProperty.banos > 0 && <span className="flex items-center gap-1"><Bath className="h-4 w-4" /> {selectedProperty.banos} baño{selectedProperty.banos > 1 ? "s" : ""}</span>}
                  {selectedProperty.medio_bano > 0 && <span className="flex items-center gap-1"><ShowerHead className="h-4 w-4" /> {selectedProperty.medio_bano} medio baño</span>}
                </div>
                {(selectedProperty.bodegas_count > 0 || selectedProperty.estacionamientos_count > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {selectedProperty.bodegas_count > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground"><img src={bodegaIcon} alt="bodega" className="h-3 w-3 opacity-60" /> {selectedProperty.bodegas_count} bodega{selectedProperty.bodegas_count > 1 ? "s" : ""}</span>}
                    {selectedProperty.estacionamientos_count > 0 && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/60 text-xs font-medium text-foreground"><Car className="h-3 w-3 text-muted-foreground" /> {selectedProperty.estacionamientos_count} estac.{selectedProperty.estacionamientos_tipos?.length > 0 && <span className="ml-1 text-muted-foreground">({[...new Set(selectedProperty.estacionamientos_tipos as string[])].join(", ")})</span>}</span>}
                  </div>
                )}
                {selectedProperty.precio_lista > 0 && (
                  <div className="bg-primary/5 rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground">Precio de Lista</p>
                    <p className="text-xl font-bold text-foreground">{formatPrice(selectedProperty.precio_lista)}</p>
                  </div>
                )}
                {(selectedProperty.esquemas_pago || []).length > 0 && (
                  <Collapsible open={schemesOpen} onOpenChange={setSchemesOpen}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full py-2 group">
                      <p className="text-sm font-semibold text-foreground">Esquemas de Pago ({selectedProperty.esquemas_pago.length})</p>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${schemesOpen ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-1">
                      {selectedProperty.esquemas_pago.map((scheme: any) => {
                        const amounts = calcSchemeAmounts(scheme, selectedProperty.precio_lista);
                        const isSelected = selectedSchemeId === scheme.id;
                        return (
                          <button key={scheme.id} type="button" onClick={() => setSelectedSchemeId(prev => prev === scheme.id ? null : scheme.id)}
                            className={`w-full text-left rounded-xl border p-4 shadow-sm space-y-2 transition-all duration-200 ${isSelected ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border/60 bg-gradient-to-br from-card to-muted/30 hover:border-primary/40"}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {isSelected && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                                <p className="font-semibold text-sm text-foreground">{scheme.nombre}</p>
                              </div>
                              {scheme.porcentaje_descuento_aumento !== 0 && scheme.porcentaje_descuento_aumento != null && (
                                <Badge variant="outline" className={scheme.porcentaje_descuento_aumento < 0 ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-700 dark:text-emerald-400 text-xs" : "border-destructive/30 bg-destructive/10 text-destructive text-xs"}>
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
                      onTrackSubmit={() => track({ page: PAGE, elementId: "btn_generar_oferta_modal", elementLabel: "Generar Oferta (Modal)", metadata: { propertyId: selectedProperty.id, schemeId: selectedSchemeId } })}
                      onTrackFillIntent={() => track({ page: PAGE, elementId: "oferta_llenado_datos", elementLabel: "Llenado Datos Oferta", metadata: { propertyId: selectedProperty.id } })}
                      customTrigger={
                        <button onClick={() => track({ page: PAGE, elementId: "btn_generar_oferta_detalle", elementLabel: "Generar Oferta", metadata: { propertyId: selectedProperty.id, schemeId: selectedSchemeId } })}
                          className="group relative w-full inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-primary text-primary-foreground font-semibold text-sm shadow-lg hover:bg-primary/90 hover:-translate-y-1 active:translate-y-0 transition-all duration-300 ease-out">
                          <FileText className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                          <span className="tracking-wide">Generar Oferta{selectedSchemeId && <span className="ml-1 text-xs opacity-80">({selectedProperty.esquemas_pago.find((s: any) => s.id === selectedSchemeId)?.nombre})</span>}</span>
                        </button>
                      }
                    />
                  </div>
                ) : (
                  <Button className="w-full gap-2 rounded-full" size="lg" disabled><FileText className="h-5 w-5" /> Sin permiso para generar oferta</Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AddProspectoFloatingDialog open={addProspectoOpen} onOpenChange={setAddProspectoOpen} />
      <AgendarCitaShowroomDialog open={agendarCitaOpen} onOpenChange={setAgendarCitaOpen} />
    </div>
  );
};

// Swipe carousel per project — no arrows, swipe only. Cards identical to Variant A
const ProjectSwipeCarousel = ({ properties, formatPrice, onSelectProperty, onSwipe }: { properties: any[]; formatPrice: (n: number) => string; onSelectProperty: (p: any) => void; onSwipe: () => void }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, dragFree: true, align: "start", containScroll: "trimSnaps" });
  const swiped = useRef(false);

  useEffect(() => {
    if (!emblaApi) return;
    const onScroll = () => { if (!swiped.current) { swiped.current = true; onSwipe(); } };
    emblaApi.on("scroll", onScroll);
    return () => { emblaApi.off("scroll", onScroll); };
  }, [emblaApi, onSwipe]);

  return (
    <div ref={emblaRef} className="overflow-hidden">
      <div className="flex gap-4 touch-pan-y">
        {properties.map((prop: any) => (
          <div key={prop.id} className="flex-[0_0_280px] sm:flex-[0_0_300px] min-w-0">
            <Card
              className="overflow-hidden cursor-pointer hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-border/60 rounded-2xl bg-card h-full"
              onClick={() => onSelectProperty(prop)}
            >
              <div className="relative">
                <PropertyCardImage images={prop.model_images || []} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-3 pt-8 pointer-events-none">
                  <h4 className="font-bold text-white text-base truncate drop-shadow-md">Depto. {prop.numero || prop.id}</h4>
                  {prop.precio_lista > 0 && <p className="text-white/90 text-sm font-semibold drop-shadow-md">{formatPrice(prop.precio_lista)}</p>}
                </div>
              </div>
              <CardContent className="p-3 space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">{prop.proyecto_nombre}</p>
                  <p className="text-[11px] text-muted-foreground/70">{prop.edificio_nombre} • {prop.modelo_nombre}</p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {prop.m2_total > 0 && <span className="flex items-center gap-1"><Maximize2 className="h-3 w-3" /> {prop.m2_total.toFixed(1)} m²</span>}
                  {prop.recamaras > 0 && <span className="flex items-center gap-1"><BedDouble className="h-3 w-3" /> {prop.recamaras}</span>}
                  {prop.banos > 0 && <span className="flex items-center gap-1"><Bath className="h-3 w-3" /> {prop.banos}</span>}
                  {prop.bodegas_count > 0 && <span className="flex items-center gap-1"><img src={bodegaIcon} alt="bodega" className="h-3 w-3 opacity-60" /> {prop.bodegas_count}</span>}
                  {prop.estacionamientos_count > 0 && <span className="flex items-center gap-1"><Car className="h-3 w-3" /> {prop.estacionamientos_count}</span>}
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
};

// Single image for card (same visual as Variant A card image area)
const PropertyCardImage = ({ images }: { images: any[] }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, dragFree: false });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } }, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrentIndex(emblaApi.selectedScrollSnap());
    if (!hasInteracted) setHasInteracted(true);
  }, [emblaApi, hasInteracted]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    const onPointerDown = () => { if (!hasInteracted) setHasInteracted(true); };
    emblaApi.on("pointerDown", onPointerDown);
    onSelect();
    return () => { emblaApi.off("select", onSelect); emblaApi.off("pointerDown", onPointerDown); };
  }, [emblaApi, onSelect, hasInteracted]);

  if (images.length === 0) return <div className="h-40 bg-muted/60 flex items-center justify-center"><Package className="h-10 w-10 text-muted-foreground/30" /></div>;

  const visibleImages = !isVisible ? [] : hasInteracted ? images.slice(0, 5) : images.slice(0, 1);

  return (
    <div ref={containerRef} className="relative h-40 bg-muted overflow-hidden" onClick={(e) => e.stopPropagation()}>
      {isVisible ? (
        <div ref={emblaRef} className="h-full overflow-hidden">
          <div className="flex h-full touch-pan-y">
            {visibleImages.map((img: any) => (
              <div key={img.id} className="flex-[0_0_100%] min-w-0 h-full">
                <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="h-full flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground/40" /></div>
      )}
      {isVisible && images.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {images.slice(0, 5).map((_: any, i: number) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i === currentIndex ? "bg-white" : "bg-white/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
};

// Detail dialog carousel
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
      <div ref={emblaRef} className="h-full overflow-hidden rounded-lg"><div className="flex h-full">{images.map((img: any) => (<div key={img.id} className="flex-[0_0_100%] min-w-0 h-full"><img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" /></div>))}</div></div>
      {images.length > 1 && (
        <>
          <button onClick={scrollPrev} className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={scrollNext} className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"><ChevronRight className="h-4 w-4" /></button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">{images.map((_: any, i: number) => (<span key={i} className={`h-1.5 w-1.5 rounded-full transition-colors ${i === currentIndex ? "bg-white" : "bg-white/40"}`} />))}</div>
        </>
      )}
    </div>
  );
};

export default InventarioGlobalB;
