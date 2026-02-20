import { NewProjectDialog } from "@/components/admin/NewProjectDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Search, Edit, Trash2, Eye, Image, Video, MapPin, Lock, Building2 } from "lucide-react";
import { Dialog as ShowroomDialog, DialogContent as ShowroomDialogContent, DialogHeader as ShowroomDialogHeader, DialogTitle as ShowroomDialogTitle } from "@/components/ui/dialog";
import { GoogleMapComponent } from "@/components/admin/GoogleMapComponent";
import { toast } from "sonner";
import { useState, useEffect, useRef, useMemo } from "react";
import { EditProjectDialog } from "@/components/admin/EditProjectDialog";
import { ProjectMultimediaModal } from "@/components/admin/ProjectMultimediaModal";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { usePagePermissions } from "@/hooks/usePagePermissions";

// Función para formatear moneda en formato corto (M/K)
const formatCurrencyShort = (value: number): string => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
};

// Función para formatear moneda completa
const formatCurrencyFull = (value: number): string => {
  return `$${value.toLocaleString('es-MX', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  })}`;
};

// ShowroomCell component that fetches showrooms per project
const ShowroomCell = ({ projectId, projectName, onShowDetail }: { 
  projectId: number; 
  projectName: string; 
  onShowDetail: (showrooms: Array<{ id: number; nombre: string; descripcion_direccion: string; latitud: number; longitud: number }>) => void;
}) => {
  const { data: showrooms = [] } = useQuery({
    queryKey: ["showrooms-proyecto", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('showrooms_proyecto')
        .select('id, nombre, descripcion_direccion, latitud, longitud')
        .eq('id_proyecto', projectId)
        .eq('activo', true);
      if (error) return [];
      return data || [];
    },
    staleTime: 60000,
  });

  if (showrooms.length === 0) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="p-1 h-auto"
      onClick={() => onShowDetail(showrooms as any)}
    >
      <Eye className="h-4 w-4" />
      {showrooms.length > 1 && <span className="text-xs ml-1">{showrooms.length}</span>}
    </Button>
  );
};

const Proyectos = () => {
  const queryClient = useQueryClient();
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProjectMultimedia, setSelectedProjectMultimedia] = useState<{
    multimedia: any[];
    youtubeVideos: any[];
    projectName: string;
  } | null>(null);
  const [showroomDetail, setShowroomDetail] = useState<{
    showrooms: Array<{ id: number; nombre: string; descripcion_direccion: string; latitud: number; longitud: number }>;
    projectName: string;
  } | null>(null);
  const [selectedShowroomIndex, setSelectedShowroomIndex] = useState(0);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Project access hook
  const { accessibleProjectIds, hasUnrestrictedAccess, isLoading: isLoadingAccess, hasNoAccess } = useProjectAccess();
  
  // Page permissions
  const { canCreate, canUpdate, canDelete, isLoading: isLoadingPermissions, isSuperAdmin } = usePagePermissions('/admin/proyectos');
  
  // Check if user has any action permission
  const hasAnyActionPermission = canUpdate || canDelete || isSuperAdmin;
  
  // Filtros específicos
  const [nombreFilter, setNombreFilter] = useState("");
  const [desarrolladorFilter, setDesarrolladorFilter] = useState("");
  const [ciudadFilter, setCiudadFilter] = useState("");
  const [estatusFilter, setEstatusFilter] = useState("all");
  const [sozuFilter, setSozuFilter] = useState("all");
  
  // Pagination states
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1);
  const itemsPerPage = 25;

  // Query to get project inmobiliaria names (entidades with id_tipo_entidad = 5)
  const { data: inmobiliariaProjectMap = new Map<number, string>() } = useQuery({
    queryKey: ["inmobiliaria-project-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('id_proyecto, personas!entidades_relacionadas_id_persona_fkey(nombre_comercial, nombre_legal)')
        .eq('id_tipo_entidad', 5)
        .eq('activo', true);
      
      if (error) {
        console.error("Error fetching inmobiliaria projects:", error);
        return new Map<number, string>();
      }
      
      const map = new Map<number, string>();
      data?.forEach(e => {
        if (e.id_proyecto != null) {
          const persona = e.personas as any;
          map.set(e.id_proyecto, persona?.nombre_comercial || persona?.nombre_legal || 'Inmobiliaria');
        }
      });
      return map;
    },
    staleTime: 60000,
  });

  // Derive sozuProjectIds from the map for backward compatibility
  const sozuProjectIds = useMemo(() => new Set(inmobiliariaProjectMap.keys()), [inmobiliariaProjectMap]);

  const { data: activeProjectsData, refetch: refetchActive } = useQuery({
    queryKey: ["projects", "active", currentPageActive, searchTerm, nombreFilter, ciudadFilter, estatusFilter, sozuFilter, accessibleProjectIds, Array.from(sozuProjectIds)],
    queryFn: async () => {
      // If user has no access and is not admin, return empty
      if (hasNoAccess) {
        return { projects: [], count: 0 };
      }

      const from = (currentPageActive - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      
      let query = supabase
        .from("proyectos")
        .select(`
          id,
          nombre,
          descripcion,
          direccion,
          latitud,
          longitud,
          activo,
          fecha_inicio_construccion,
          id_tipo_uso,
          id_estatus_proyecto,
          publicar,
          direccion_id_pais,
          direccion_id_estado,
          direccion_id_municipio,
          tipos_uso:id_tipo_uso (
            nombre
          ),
          estatus_proyecto:id_estatus_proyecto (
            id,
            nombre
          ),
          paises:direccion_id_pais (
            nombre
          ),
          estados_mx:direccion_id_estado (
            nombre
          ),
          municipios_mx:direccion_id_municipio (
            nombre
          ),
          edificios!fk_edificios_proyecto (
            id,
            nombre,
            edificios_modelos!fk_edificios_modelos_edificio (
              id,
              propiedades!fk_propiedades_edificio_modelo (
                id,
                precio_lista,
                m2_interiores,
                m2_exteriores
              )
            )
          ),
          multimedias_proyecto (
            id,
            url,
            es_imagen,
            activo
          ),
          videos_youtube (
            id,
            nombre,
            link,
            activo
          ),
          amenidades_proyectos (
            amenidades (
              id,
              nombre
            )
          ),
          entidades_relacionadas!fk_entrel_proyecto (
            id,
            id_persona,
            id_tipo_entidad,
            activo,
            personas!fk_entrel_persona (
              id,
              nombre_comercial,
              nombre_legal
            )
          )
        `, { count: 'exact' })
        .eq("entidades_relacionadas.activo", true)
        .eq("entidades_relacionadas.id_tipo_entidad", 3)
        .eq("activo", true);
      
      // Apply project access filter for non-admin users
      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        query = query.in("id", accessibleProjectIds);
      }
      
      // Aplicar filtros
      if (searchTerm) {
        query = query.ilike("nombre", `%${searchTerm}%`);
      }
      if (nombreFilter) {
        query = query.ilike("nombre", `%${nombreFilter}%`);
      }
      if (estatusFilter !== "all") {
        query = query.eq("id_estatus_proyecto", parseInt(estatusFilter));
      }
      
      // Apply Sozu filter
      if (sozuFilter === "sozu" && sozuProjectIds.size > 0) {
        query = query.in("id", Array.from(sozuProjectIds));
      } else if (sozuFilter === "no-sozu" && sozuProjectIds.size > 0) {
        // Filter out Sozu projects server-side using NOT IN
        const sozuIds = Array.from(sozuProjectIds);
        // Supabase doesn't have a direct "not in" on .in(), so we use .not()
        query = query.not("id", "in", `(${sozuIds.join(",")})`);
      }
      
      const { data, error, count } = await query
        .order("nombre", { ascending: true })
        .range(from, to);
      
      if (error) {
        console.error("Error fetching active projects:", error);
        return { projects: [], count: 0 };
      }
      
      // Add precio_m2_actual from raw query if available
      let projects = ((data || []) as any[]).map((project: any) => ({
        ...project,
        precio_m2_actual: project.precio_m2_actual || null
      }));
      
      return { projects, count: count || 0 };
    },
    enabled: !isLoadingAccess,
  });

  const activeProjects = activeProjectsData?.projects || [];
  const totalActiveCount = activeProjectsData?.count || 0;

  const { data: deletedProjectsData, refetch: refetchDeleted } = useQuery({
    queryKey: ["projects", "deleted", currentPageDeleted, searchTerm, nombreFilter, ciudadFilter, estatusFilter],
    queryFn: async () => {
      const from = (currentPageDeleted - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      
      let query = supabase
        .from("proyectos")
        .select(`
          id,
          nombre,
          descripcion,
          direccion,
          latitud,
          longitud,
          activo,
          fecha_inicio_construccion,
          id_tipo_uso,
          id_estatus_proyecto,
          publicar,
          direccion_id_pais,
          direccion_id_estado,
          direccion_id_municipio,
          tipos_uso:id_tipo_uso (
            nombre
          ),
          estatus_proyecto:id_estatus_proyecto (
            id,
            nombre
          ),
          paises:direccion_id_pais (
            nombre
          ),
          estados_mx:direccion_id_estado (
            nombre
          ),
          municipios_mx:direccion_id_municipio (
            nombre
          ),
          edificios!fk_edificios_proyecto (
            id,
            nombre,
            edificios_modelos!fk_edificios_modelos_edificio (
              id,
              propiedades!fk_propiedades_edificio_modelo (
                id,
                precio_lista,
                m2_interiores,
                m2_exteriores
              )
            )
          ),
          multimedias_proyecto (
            id,
            url,
            es_imagen,
            activo
          ),
          videos_youtube (
            id,
            nombre,
            link,
            activo
          ),
          amenidades_proyectos (
            amenidades (
              id,
              nombre
            )
          ),
          entidades_relacionadas!fk_entrel_proyecto (
            id,
            id_persona,
            id_tipo_entidad,
            activo,
            personas!fk_entrel_persona (
              id,
              nombre_comercial,
              nombre_legal
            )
          )
        `, { count: 'exact' })
        .eq("entidades_relacionadas.activo", true)
        .eq("entidades_relacionadas.id_tipo_entidad", 3)
        .eq("activo", false);
      
      // Aplicar filtros
      if (searchTerm) {
        query = query.ilike("nombre", `%${searchTerm}%`);
      }
      if (nombreFilter) {
        query = query.ilike("nombre", `%${nombreFilter}%`);
      }
      if (estatusFilter !== "all") {
        query = query.eq("id_estatus_proyecto", parseInt(estatusFilter));
      }
      
      const { data, error, count } = await query
        .order("nombre", { ascending: true })
        .range(from, to);
      
      if (error) {
        console.error("Error fetching deleted projects:", error);
        return { projects: [], count: 0 };
      }
      
      // Add precio_m2_actual from raw query if available
      const projects = ((data || []) as any[]).map((project: any) => ({
        ...project,
        precio_m2_actual: project.precio_m2_actual || null
      }));
      
      return { projects, count: count || 0 };
    },
  });

  const deletedProjects = deletedProjectsData?.projects || [];
  const totalDeletedCount = deletedProjectsData?.count || 0;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  // Maintain focus on search input after re-render
  useEffect(() => {
    if (inputValue && searchInputRef.current && !activeProjectsData && !deletedProjectsData) {
      searchInputRef.current.focus();
    }
  }, [activeProjectsData, deletedProjectsData, inputValue]);

  // Reset pages when filters change
  useEffect(() => {
    setCurrentPageActive(1);
  }, [searchTerm, nombreFilter, ciudadFilter, estatusFilter, sozuFilter]);

  useEffect(() => {
    setCurrentPageDeleted(1);
  }, [searchTerm, nombreFilter, ciudadFilter, estatusFilter, sozuFilter]);

  // Query para obtener estatus de proyecto para el filtro
  const { data: estatusProyecto = [] } = useQuery({
    queryKey: ["estatus-proyecto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estatus_proyecto")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) {
        console.error("Error fetching project status:", error);
        return [];
      }
      return data || [];
    },
  });

  const handleTogglePublicar = async (projectId: number, currentValue: boolean) => {
    try {
      // If trying to publish, validate requirements
      if (!currentValue) {
        // Check brochures (documentos with id_tipo_documento = 30)
        const { data: brochures, error: brochError } = await supabase
          .from("documentos")
          .select("id")
          .eq("id_proyecto", projectId)
          .eq("id_tipo_documento", 30)
          .eq("activo", true);

        if (brochError) {
          console.error("Error checking brochures:", brochError);
          toast.error("Error al validar requisitos de publicación");
          return;
        }

        // Check multimedia images
        const { data: multimedia, error: mmError } = await supabase
          .from("multimedias_proyecto")
          .select("id")
          .eq("id_proyecto", projectId)
          .eq("es_imagen", true)
          .eq("activo", true);

        if (mmError) {
          console.error("Error checking multimedia:", mmError);
          toast.error("Error al validar requisitos de publicación");
          return;
        }

        const brochureCount = brochures?.length || 0;
        const multimediaCount = multimedia?.length || 0;
        const issues: string[] = [];

        if (brochureCount === 0) {
          issues.push("al menos 1 brochure");
        }
        if (multimediaCount < 5) {
          issues.push(`al menos 5 imágenes multimedia (tiene ${multimediaCount})`);
        }

        if (issues.length > 0) {
          toast.error(`No se puede publicar. Requiere: ${issues.join(" y ")}.`, { duration: 6000 });
          return;
        }
      }

      const { error } = await supabase
        .from("proyectos")
        .update({ publicar: !currentValue })
        .eq("id", projectId);

      if (error) {
        console.error("Error toggling publicar:", error);
        toast.error("Error al cambiar el estado de publicación");
        return;
      }

      toast.success(!currentValue ? "Proyecto publicado" : "Proyecto despublicado");
      refetchActive();
      refetchDeleted();
    } catch (error) {
      console.error("Error toggling publicar:", error);
      toast.error("Error al cambiar el estado de publicación");
    }
  };


  const handleProjectAdded = () => {
    refetchActive();
  };

  const handleProjectUpdated = () => {
    refetchActive();
    refetchDeleted();
  };

  const handleProjectDeleted = async (projectId: number) => {
    try {
      const { error } = await supabase
        .from("proyectos")
        .update({ activo: false })
        .eq("id", projectId);

      if (error) {
        console.error("Error deleting project:", error);
        return;
      }

      refetchActive();
      refetchDeleted();
    } catch (error) {
      console.error("Error deleting project:", error);
    }
  };

  // Helper functions
  const getMultimediaCount = (project: any) => {
    const images = project.multimedias_proyecto?.filter((m: any) => m.es_imagen && m.activo) || [];
    const videos = project.multimedias_proyecto?.filter((m: any) => !m.es_imagen && m.activo) || [];
    const youtubeVideos = project.videos_youtube?.filter((v: any) => v.activo) || [];
    return { 
      images: images.length, 
      videos: videos.length + youtubeVideos.length 
    };
  };

  const getCityName = (project: any) => {
    if (project.municipios_mx?.nombre && project.estados_mx?.nombre) {
      return `${project.municipios_mx.nombre}, ${project.estados_mx.nombre}`;
    }
    if (project.estados_mx?.nombre) {
      return project.estados_mx.nombre;
    }
    if (project.paises?.nombre) {
      return project.paises.nombre;
    }
    return "No especificada";
  };

  const getBadgeVariant = (status: string | undefined) => {
    switch (status?.toLowerCase()) {
      case 'activo':
      case 'en desarrollo':
        return 'default';
      case 'finalizado':
      case 'completado':
        return 'secondary';
      case 'en construcción':
      case 'construcción':
        return 'outline';
      case 'pausado':
      case 'suspendido':
        return 'destructive';
      case 'planeado':
      case 'planificado':
        return 'default';
      default:
        return 'secondary';
    }
  };

  const getAveragePropertyPrice = (project: any) => {
    console.log('Calculating average price for project:', project.nombre);
    console.log('Project edificios:', project.edificios);
    
    const properties = project.edificios?.flatMap((edificio: any) => {
      console.log('Processing edificio:', edificio);
      return edificio.edificios_modelos?.flatMap((modelo: any) => {
        console.log('Processing modelo:', modelo);
        console.log('Modelo propiedades:', modelo.propiedades);
        return modelo.propiedades || [];
      }) || [];
    }) || [];
    
    console.log('Total properties found:', properties.length);
    console.log('Properties sample:', properties.slice(0, 2));
    
    if (properties.length === 0) return 0;
    
    const validProperties = properties.filter((property: any) => 
      property.precio_lista && property.precio_lista > 0
    );
    
    console.log('Valid properties with precio_lista:', validProperties.length);
    
    if (validProperties.length === 0) return 0;
    
    const totalPrice = validProperties.reduce((sum: number, property: any) => 
      sum + (property.precio_lista || 0), 0);
    
    const average = totalPrice / validProperties.length;
    console.log('Average price calculated:', average);
    
    return average;
  };

  const getTotalPrecioLista = (project: any) => {
    const properties = project.edificios?.flatMap((edificio: any) => 
      edificio.edificios_modelos?.flatMap((modelo: any) => 
        modelo.propiedades || []
      ) || []
    ) || [];
    
    if (properties.length === 0) return 0;
    
    const validProperties = properties.filter((property: any) => 
      property.precio_lista && property.precio_lista > 0
    );
    
    if (validProperties.length === 0) return 0;
    
    return validProperties.reduce((sum: number, property: any) => 
      sum + (property.precio_lista || 0), 0);
  };

  const getAveragePricePerM2 = (project: any) => {
    console.log('Calculating average price per M2 for project:', project.nombre);
    
    const properties = project.edificios?.flatMap((edificio: any) => 
      edificio.edificios_modelos?.flatMap((modelo: any) => 
        modelo.propiedades || []
      ) || []
    ) || [];
    
    console.log('Total properties for M2 calculation:', properties.length);
    
    if (properties.length === 0) return 0;
    
    const validProperties = properties.filter((property: any) => {
      const totalM2 = (property.m2_interiores || 0) + (property.m2_exteriores || 0);
      return property.precio_lista && property.precio_lista > 0 && totalM2 > 0;
    });
    
    console.log('Valid properties with precio_lista and m2:', validProperties.length);
    
    if (validProperties.length === 0) return 0;
    
    const totalPrice = validProperties.reduce((sum: number, property: any) => 
      sum + (property.precio_lista || 0), 0);
    const totalM2 = validProperties.reduce((sum: number, property: any) => {
      const m2 = (property.m2_interiores || 0) + (property.m2_exteriores || 0);
      return sum + m2;
    }, 0);
    
    if (totalM2 === 0) return 0;
    
    const averagePerM2 = totalPrice / totalM2;
    console.log('Average price per M2 calculated:', averagePerM2);
    
    return averagePerM2;
  };

  // Pagination logic para proyectos activos (ahora del lado del servidor)
  const totalActivePages = Math.ceil(totalActiveCount / itemsPerPage);

  // Pagination logic para proyectos eliminados (ahora del lado del servidor)
  const totalDeletedPages = Math.ceil(totalDeletedCount / itemsPerPage);

  const handleProjectRestored = async (projectId: number) => {
    try {
      const { error } = await supabase
        .from("proyectos")
        .update({ activo: true })
        .eq("id", projectId);

      if (error) {
        console.error("Error restoring project:", error);
        return;
      }

      refetchActive();
      refetchDeleted();
    } catch (error) {
      console.error("Error restoring project:", error);
    }
  };

  // Helper function to generate pagination items
  const getPaginationItems = (currentPage: number, totalPages: number) => {
    const items: (number | 'ellipsis')[] = [];
    const maxVisible = 7; // Maximum number of page buttons to show
    
    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    // Always show first page
    items.push(1);
    
    // Calculate range around current page
    let rangeStart = Math.max(2, currentPage - 1);
    let rangeEnd = Math.min(totalPages - 1, currentPage + 1);
    
    // Adjust range if we're near the start or end
    if (currentPage <= 3) {
      rangeEnd = Math.min(4, totalPages - 1);
    }
    if (currentPage >= totalPages - 2) {
      rangeStart = Math.max(totalPages - 3, 2);
    }
    
    // Add ellipsis after first page if needed
    if (rangeStart > 2) {
      items.push('ellipsis');
    }
    
    // Add range around current page
    for (let i = rangeStart; i <= rangeEnd; i++) {
      items.push(i);
    }
    
    // Add ellipsis before last page if needed
    if (rangeEnd < totalPages - 1) {
      items.push('ellipsis');
    }
    
    // Always show last page
    if (totalPages > 1) {
      items.push(totalPages);
    }
    
    return items;
  };

  const renderProjectsTable = (projects: any[], emptyMessage: string, isDeletedTab: boolean = false) => (
    <TooltipProvider>
      {projects.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre del Proyecto</TableHead>
                <TableHead>Desarrollador</TableHead>
                <TableHead>Número de Departamentos</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>Total del proyecto</TableHead>
                <TableHead>Precio Promedio Propiedades</TableHead>
                <TableHead>Precio Promedio por M2</TableHead>
                <TableHead>Multimedia</TableHead>
                <TableHead>Showroom</TableHead>
                <TableHead>Estatus</TableHead>
                <TableHead>Comercializada por</TableHead>
                <TableHead>Publicar</TableHead>
                {hasAnyActionPermission && <TableHead>Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const multimedia = getMultimediaCount(project);
                const city = getCityName(project);
                const developer = project.entidades_relacionadas?.[0]?.personas?.nombre_comercial || 
                  project.entidades_relacionadas?.[0]?.personas?.nombre_legal || 
                  "Por definir";
                const departmentCount = project.edificios?.reduce((total: number, edificio: any) => {
                  return total + (edificio.edificios_modelos?.reduce((edificioTotal: number, modelo: any) => {
                    return edificioTotal + (modelo.propiedades?.length || 0);
                  }, 0) || 0);
                }, 0) || 0;
                const totalPrecioLista = getTotalPrecioLista(project);
                const avgPropertyPrice = getAveragePropertyPrice(project);
                const avgPricePerM2 = getAveragePricePerM2(project);
                
                return (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">{project.nombre}</TableCell>
                    <TableCell>{developer}</TableCell>
                    <TableCell>{departmentCount}</TableCell>
                    <TableCell>{city}</TableCell>
                    <TableCell>
                      {project.latitud && project.longitud ? (
                        <a 
                          href={`https://www.google.com/maps?q=${project.latitud},${project.longitud}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80 inline-flex items-center"
                          title={project.direccion || "Ver en mapa"}
                        >
                          <MapPin className="h-5 w-5" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center" title="Sin coordenadas">
                          <MapPin className="h-5 w-5 text-muted-foreground/50" />
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {totalPrecioLista > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{formatCurrencyShort(totalPrecioLista)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{formatCurrencyFull(totalPrecioLista)}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : "N/A"}
                    </TableCell>
                    <TableCell>
                      {avgPropertyPrice > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{formatCurrencyShort(avgPropertyPrice)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{formatCurrencyFull(avgPropertyPrice)}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : "N/A"}
                    </TableCell>
                    <TableCell>
                      {avgPricePerM2 > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{formatCurrencyShort(avgPricePerM2)}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{formatCurrencyFull(avgPricePerM2)}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : "N/A"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {multimedia.images > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex items-center gap-1 p-1 h-auto"
                            onClick={() => setSelectedProjectMultimedia({
                              multimedia: project.multimedias_proyecto || [],
                              youtubeVideos: project.videos_youtube || [],
                              projectName: project.nombre
                            })}
                          >
                            <Image className="h-4 w-4" />
                            <span className="text-sm">{multimedia.images}</span>
                          </Button>
                        )}
                        {multimedia.videos > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex items-center gap-1 p-1 h-auto"
                            onClick={() => setSelectedProjectMultimedia({
                              multimedia: project.multimedias_proyecto || [],
                              youtubeVideos: project.videos_youtube || [],
                              projectName: project.nombre
                            })}
                          >
                            <Video className="h-4 w-4" />
                            <span className="text-sm">{multimedia.videos}</span>
                          </Button>
                        )}
                        {multimedia.images === 0 && multimedia.videos === 0 && (
                          <span className="text-muted-foreground text-sm">Sin multimedia</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ShowroomCell projectId={project.id} projectName={project.nombre} onShowDetail={(showrooms) => {
                        setShowroomDetail({ showrooms, projectName: project.nombre });
                        setSelectedShowroomIndex(0);
                      }} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={getBadgeVariant(project.estatus_proyecto?.nombre)}>
                        {project.estatus_proyecto?.nombre || "Sin estatus"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {inmobiliariaProjectMap.has(project.id) ? (
                        <Badge variant="default">{inmobiliariaProjectMap.get(project.id)}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {sozuProjectIds.has(project.id) ? (
                        <Switch
                          checked={!!project.publicar}
                          onCheckedChange={() => handleTogglePublicar(project.id, !!project.publicar)}
                          disabled={isDeletedTab}
                        />
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    {hasAnyActionPermission && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {!isDeletedTab && (canUpdate || isSuperAdmin) && (
                            <EditProjectDialog
                              projectId={project.id}
                              onProjectUpdated={handleProjectUpdated}
                              canCreate={canCreate || isSuperAdmin}
                              canUpdate={canUpdate || isSuperAdmin}
                              canDelete={canDelete || isSuperAdmin}
                              trigger={
                                <Button variant="ghost" size="sm">
                                  <Edit className="h-4 w-4" />
                                </Button>
                              }
                            />
                          )}
                          {(canDelete || isSuperAdmin) && !(project.id_tipo_uso === 9 || project.id_tipo_uso === 10 || project.id_tipo_uso === 11) && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                variant="ghost" 
                                size="sm" 
                                className={isDeletedTab ? "text-green-600 hover:text-green-700 hover:bg-green-50" : "text-red-600 hover:text-red-700 hover:bg-red-50"}
                                disabled={!isDeletedTab && project.edificios && project.edificios.length > 0}
                                title={isDeletedTab ? "Restaurar proyecto" : "Eliminar proyecto"}
                              >
                                {isDeletedTab ? (
                                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                                    <path d="M8 12l2 2 4-4"/>
                                  </svg>
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {isDeletedTab ? 'Restaurar Proyecto' : 'Eliminar Proyecto'}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {isDeletedTab
                                    ? `¿Estás seguro de que deseas restaurar el proyecto "${project.nombre}"?`
                                    : `¿Estás seguro de que deseas eliminar el proyecto "${project.nombre}"? Esta acción se puede revertir posteriormente.`
                                  }
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => isDeletedTab ? handleProjectRestored(project.id) : handleProjectDeleted(project.id)}
                                  className={isDeletedTab ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
                                >
                                  {isDeletedTab ? 'Restaurar' : 'Eliminar'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                           </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            {emptyMessage}
          </p>
        </div>
      )}
    </TooltipProvider>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Proyectos</h1>
          <p className="text-muted-foreground">Gestiona todos los proyectos inmobiliarios</p>
        </div>
        {(hasUnrestrictedAccess && (canCreate || isSuperAdmin)) && <NewProjectDialog onProjectAdded={handleProjectAdded} />}
      </div>

      {hasNoAccess ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Lock className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Sin acceso a proyectos</h2>
          <p className="text-muted-foreground max-w-md">
            No tienes acceso a ningún proyecto. Contacta a un administrador para que te asigne los proyectos que necesitas ver.
          </p>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar proyectos..."
              ref={searchInputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="pl-10"
            />
          </div>

      {/* Filtros específicos */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-muted/50 rounded-lg">
        <div>
          <label className="text-sm font-medium mb-2 block">Nombre del Proyecto</label>
          <Input
            placeholder="Filtrar por nombre..."
            value={nombreFilter}
            onChange={(e) => setNombreFilter(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">Desarrollador</label>
          <Input
            placeholder="Filtrar por desarrollador..."
            value={desarrolladorFilter}
            onChange={(e) => setDesarrolladorFilter(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">Ciudad</label>
          <Input
            placeholder="Filtrar por ciudad..."
            value={ciudadFilter}
            onChange={(e) => setCiudadFilter(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">Estatus</label>
          <Select value={estatusFilter} onValueChange={setEstatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Todos los estatus" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estatus</SelectItem>
              {estatusProyecto.map((estatus) => (
                <SelectItem key={estatus.id} value={estatus.id.toString()}>
                  {estatus.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium mb-2 block">Comercializada por</label>
          <Select value={sozuFilter} onValueChange={setSozuFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="sozu">Sozu</SelectItem>
              <SelectItem value="no-sozu">No Sozu</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active">
            Proyectos Activos ({totalActiveCount})
          </TabsTrigger>
          <TabsTrigger value="deleted">
            Proyectos Eliminados ({totalDeletedCount})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="active" className="mt-6">
          {activeProjects.length === 0 && totalActiveCount > 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No se encontraron proyectos activos que coincidan con la búsqueda.
              </p>
            </div>
          ) : (
            <>
              {renderProjectsTable(
                activeProjects, 
                "No hay proyectos activos disponibles.",
                false
              )}
              {totalActivePages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPageActive(Math.max(1, currentPageActive - 1))}
                          className={currentPageActive === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {getPaginationItems(currentPageActive, totalActivePages).map((item, index) => (
                        item === 'ellipsis' ? (
                          <PaginationItem key={`ellipsis-${index}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={item}>
                            <PaginationLink
                              onClick={() => setCurrentPageActive(item as number)}
                              isActive={currentPageActive === item}
                              className="cursor-pointer"
                            >
                              {item}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      ))}
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPageActive(Math.min(totalActivePages, currentPageActive + 1))}
                          className={currentPageActive === totalActivePages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </TabsContent>
        
        <TabsContent value="deleted" className="mt-6">
          {deletedProjects.length === 0 && totalDeletedCount > 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No se encontraron proyectos eliminados que coincidan con la búsqueda.
              </p>
            </div>
          ) : (
            <>
              {renderProjectsTable(
                deletedProjects, 
                "No hay proyectos eliminados.",
                true
              )}
              {totalDeletedPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPageDeleted(Math.max(1, currentPageDeleted - 1))}
                          className={currentPageDeleted === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {getPaginationItems(currentPageDeleted, totalDeletedPages).map((item, index) => (
                        item === 'ellipsis' ? (
                          <PaginationItem key={`ellipsis-${index}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={item}>
                            <PaginationLink
                              onClick={() => setCurrentPageDeleted(item as number)}
                              isActive={currentPageDeleted === item}
                              className="cursor-pointer"
                            >
                              {item}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      ))}
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPageDeleted(Math.min(totalDeletedPages, currentPageDeleted + 1))}
                          className={currentPageDeleted === totalDeletedPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

          {selectedProjectMultimedia && (
            <ProjectMultimediaModal
              isOpen={true}
              onClose={() => setSelectedProjectMultimedia(null)}
              multimedia={selectedProjectMultimedia.multimedia}
              youtubeVideos={selectedProjectMultimedia.youtubeVideos}
              projectName={selectedProjectMultimedia.projectName}
            />
          )}

          {/* Showroom Detail Dialog */}
          <ShowroomDialog open={!!showroomDetail} onOpenChange={() => setShowroomDetail(null)}>
            <ShowroomDialogContent className="max-w-md">
              <ShowroomDialogHeader>
                <ShowroomDialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Showrooms — {showroomDetail?.projectName}
                </ShowroomDialogTitle>
              </ShowroomDialogHeader>
              {showroomDetail && showroomDetail.showrooms.length > 0 && (
                <div className="space-y-4">
                  {showroomDetail.showrooms.length > 1 && (
                    <div className="flex gap-2 flex-wrap">
                      {showroomDetail.showrooms.map((s, idx) => (
                        <Button
                          key={idx}
                          variant={selectedShowroomIndex === idx ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedShowroomIndex(idx)}
                        >
                          {s.nombre || `Showroom ${idx + 1}`}
                        </Button>
                      ))}
                    </div>
                  )}
                  {showroomDetail.showrooms[selectedShowroomIndex]?.nombre && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Nombre</p>
                      <p className="text-sm">{showroomDetail.showrooms[selectedShowroomIndex]?.nombre}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Dirección</p>
                    <p className="text-sm">{showroomDetail.showrooms[selectedShowroomIndex]?.descripcion_direccion}</p>
                  </div>
                  <div className="rounded-lg overflow-hidden border">
                    <GoogleMapComponent
                      onLocationSelect={() => {}}
                      initialLocation={{ 
                        lat: showroomDetail.showrooms[selectedShowroomIndex]?.latitud, 
                        lng: showroomDetail.showrooms[selectedShowroomIndex]?.longitud 
                      }}
                      readOnly
                    />
                  </div>
                </div>
              )}
            </ShowroomDialogContent>
          </ShowroomDialog>
        </>
      )}
    </div>
  );
};

export default Proyectos;