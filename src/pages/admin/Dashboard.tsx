import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/admin/StatCard";
import { NoProjectAccess } from "@/components/admin/NoProjectAccess";
import { Building2, Home, DollarSign, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useProjectAccess } from "@/hooks/useProjectAccess";

interface ProjectData {
  id: number;
  nombre: string;
  direccion: string;
  precio_m2_actual: number;
  tipo_uso: string;
  monto_total: number;
  monto_propiedades: number;
  monto_productos: number;
  tiene_disponibles: boolean;
}

const Dashboard = () => {
  // Project access control
  const { 
    accessibleProjectIds, 
    hasUnrestrictedAccess, 
    isLoading: isLoadingAccess, 
    hasNoAccess 
  } = useProjectAccess();

  // Fetch Sozu-managed projects (Inmobiliaria = Real Estate Ventures)
  const { data: sozuProjectIds = [] } = useQuery({
    queryKey: ['sozu-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('id_proyecto, personas!entidades_relacionadas_id_persona_fkey(nombre_legal)')
        .eq('id_tipo_entidad', 5) // Tipo Inmobiliaria
        .ilike('personas.nombre_legal', '%Real Estate Ventures%');

      if (error) throw error;
      return data?.map(er => er.id_proyecto) || [];
    }
  });

  // Fetch projects with amounts
  const { data: projectAmounts = [] } = useQuery({
    queryKey: ['dashboard-project-amounts', accessibleProjectIds],
    queryFn: async () => {
      // If user has no access and is not admin, return empty
      if (hasNoAccess) {
        return [];
      }

      let query = supabase
        .from('proyectos')
        .select(`
          id,
          nombre,
          direccion,
          precio_m2_actual,
          tipos_uso(nombre)
        `)
        .eq('activo', true)
        .not('nombre', 'in', '("Productos","Servicios","Mantenimientos")')
        .limit(10000);

      // Apply project access filter for non-admin users
      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        query = query.in('id', accessibleProjectIds);
      }

      const { data: projects, error: projectsError } = await query;

      if (projectsError) throw projectsError;

      // Get amounts for each project
      const projectsWithAmounts = await Promise.all(
        (projects || []).map(async (project) => {
          // Primero obtenemos las entidades relacionadas del proyecto
          const { data: entidades } = await supabase
            .from('entidades_relacionadas')
            .select('id')
            .eq('id_proyecto', project.id);

          if (!entidades || entidades.length === 0) {
            return {
              id: project.id,
              nombre: project.nombre,
              direccion: project.direccion,
              precio_m2_actual: project.precio_m2_actual || 0,
              tipo_uso: (project.tipos_uso as any)?.nombre || 'N/A',
              monto_total: 0,
              monto_propiedades: 0,
              monto_productos: 0
            };
          }

          const entidadIds = entidades.map(e => e.id);

          // Luego las propiedades de esas entidades
          const { data: propiedades } = await supabase
            .from('propiedades')
            .select('id')
            .in('id_entidad_relacionada_dueno', entidadIds);

          if (!propiedades || propiedades.length === 0) {
            return {
              id: project.id,
              nombre: project.nombre,
              direccion: project.direccion,
              precio_m2_actual: project.precio_m2_actual || 0,
              tipo_uso: (project.tipos_uso as any)?.nombre || 'N/A',
              monto_total: 0,
              monto_propiedades: 0,
              monto_productos: 0
            };
          }

          const propiedadIds = propiedades.map(p => p.id);

          // Luego las ofertas de esas propiedades (incluyendo id_producto para diferenciar)
          const { data: ofertas } = await supabase
            .from('ofertas')
            .select('id, id_producto')
            .in('id_propiedad', propiedadIds);

          if (!ofertas || ofertas.length === 0) {
            return {
              id: project.id,
              nombre: project.nombre,
              direccion: project.direccion,
              precio_m2_actual: project.precio_m2_actual || 0,
              tipo_uso: (project.tipos_uso as any)?.nombre || 'N/A',
              monto_total: 0,
              monto_propiedades: 0,
              monto_productos: 0
            };
          }

          // Separar ofertas de propiedades vs productos
          const ofertasPropiedades = ofertas.filter(o => o.id_producto === null).map(o => o.id);
          const ofertasProductos = ofertas.filter(o => o.id_producto !== null).map(o => o.id);

          // Obtener montos de propiedades
          let monto_propiedades = 0;
          if (ofertasPropiedades.length > 0) {
            const { data: cuentasPropiedades } = await supabase
              .from('cuentas_cobranza')
              .select('precio_final')
              .eq('activo', true)
              .in('id_oferta', ofertasPropiedades);
            
            monto_propiedades = (cuentasPropiedades || []).reduce((sum, c) => sum + Number(c.precio_final), 0);
          }

          // Obtener montos de productos
          let monto_productos = 0;
          if (ofertasProductos.length > 0) {
            const { data: cuentasProductos } = await supabase
              .from('cuentas_cobranza')
              .select('precio_final')
              .eq('activo', true)
              .in('id_oferta', ofertasProductos);
            
            monto_productos = (cuentasProductos || []).reduce((sum, c) => sum + Number(c.precio_final), 0);
          }

          const monto_total = monto_propiedades + monto_productos;

          // Check if project has available properties (id_estatus_disponibilidad = 2 is "Disponible")
          const { data: disponibles } = await supabase
            .from('propiedades')
            .select('id')
            .in('id_entidad_relacionada_dueno', entidadIds)
            .eq('id_estatus_disponibilidad', 2)
            .limit(1);

          return {
            id: project.id,
            nombre: project.nombre,
            direccion: project.direccion,
            precio_m2_actual: project.precio_m2_actual || 0,
            tipo_uso: (project.tipos_uso as any)?.nombre || 'N/A',
            monto_total,
            monto_propiedades,
            monto_productos,
            tiene_disponibles: (disponibles && disponibles.length > 0) || false
          };
        })
      );

      // Filter out projects with 0 monto_total and sort by monto_total descending
      return projectsWithAmounts
        .filter(p => p.monto_total > 0)
        .sort((a, b) => b.monto_total - a.monto_total);
    },
    enabled: !isLoadingAccess
  });

  // Filter projects to only show Sozu-managed ones (and accessible to user)
  const filteredProjects = useMemo(() => {
    let projects = projectAmounts.filter((p: ProjectData) => sozuProjectIds.includes(p.id));
    
    // Additional filter for non-admin users
    if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
      projects = projects.filter((p: ProjectData) => accessibleProjectIds.includes(p.id));
    }
    
    return projects;
  }, [projectAmounts, sozuProjectIds, hasUnrestrictedAccess, accessibleProjectIds]);

  // Fetch total buildings for filtered Sozu projects
  const projectIdsWithAmount = useMemo(() => 
    filteredProjects.map(p => p.id), 
    [filteredProjects]
  );

  const { data: totalBuildings = 0 } = useQuery({
    queryKey: ['dashboard-buildings', projectIdsWithAmount.join(',')],
    queryFn: async () => {
      if (projectIdsWithAmount.length === 0) return 0;
      
      const { count, error } = await supabase
        .from('edificios')
        .select('*', { count: 'exact', head: true })
        .in('id_proyecto', projectIdsWithAmount)
        .eq('activo', true);

      if (error) throw error;
      return count || 0;
    },
    enabled: projectIdsWithAmount.length > 0
  });

  // Calculate stats for Sozu projects only
  const stats = useMemo(() => {
    const totalProjects = filteredProjects.length;

    // Calculate average price per m2 only for projects with precio_m2_actual > 0
    const projectsWithPrice = filteredProjects.filter((p: ProjectData) => p.precio_m2_actual > 0);
    const avgPrice = projectsWithPrice.length > 0
      ? projectsWithPrice.reduce((sum: number, p: ProjectData) => sum + p.precio_m2_actual, 0) / projectsWithPrice.length
      : 0;

    return [
      {
        title: "Proyectos",
        value: totalProjects.toString(),
        icon: Building2,
      },
      {
        title: "Edificios", 
        value: totalBuildings.toString(),
        icon: Home,
      },
      {
        title: "Precio Promedio",
        value: `${Math.round(avgPrice).toLocaleString('es-MX')}`,
        subtitle: "MXN por m²",
        icon: DollarSign,
      }
    ];
  }, [filteredProjects, totalBuildings]);

  // Get top 5 projects to display
  const topProjects = useMemo(() => {
    return filteredProjects.slice(0, 5);
  }, [filteredProjects]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatCompactCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `${(amount / 1000000).toFixed(2)}M`;
    } else if (amount >= 1000) {
      return `${(amount / 1000).toFixed(2)}K`;
    }
    return formatCurrency(amount);
  };

  // Show no access message if user has no projects assigned
  if (!isLoadingAccess && hasNoAccess) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Panel de control</p>
          </div>
        </div>
        <NoProjectAccess message="No tienes proyectos asignados. Contacta al administrador para solicitar acceso a los proyectos." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Proyectos gestionados por Sozu</h1>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat, index) => (
          <StatCard key={index} {...stat} />
        ))}
      </div>

      {/* Projects List */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Proyectos a Comercializar</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {topProjects.map((project: ProjectData) => (
            <Card key={project.id} className="transition-all duration-200 hover:shadow-md">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{project.nombre}</h3>
                      <div className="flex items-center text-sm text-muted-foreground mt-1">
                        <MapPin className="h-4 w-4 mr-1 flex-shrink-0" />
                        <span className="line-clamp-2">{project.direccion || 'Sin dirección'}</span>
                      </div>
                    </div>
                    <Badge 
                      variant="default"
                      className={project.tiene_disponibles 
                        ? "bg-green-500 text-white hover:bg-green-600" 
                        : "bg-blue-500 text-white hover:bg-blue-600"
                      }
                    >
                      {project.tiene_disponibles ? 'En venta' : 'Vendido'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-primary font-semibold">
                      <DollarSign className="h-4 w-4 inline mr-1" />
                      {project.precio_m2_actual > 0 
                        ? `${formatCurrency(project.precio_m2_actual)}/m²`
                        : 'N/A'
                      }
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {project.tipo_uso}
                    </div>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="text-xs text-muted-foreground">Monto Total Colocado</div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="text-lg font-bold text-foreground cursor-help">
                            {formatCompactCurrency(project.monto_total)}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{formatCurrency(project.monto_total)}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {/* Desglose Propiedades vs Productos */}
                    <div className="flex items-center gap-4 mt-2 text-xs">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-help">
                              <Home className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Propiedades:</span>
                              <span className="font-medium text-foreground">{formatCompactCurrency(project.monto_propiedades)}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{formatCurrency(project.monto_propiedades)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1 cursor-help">
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                              <span className="text-muted-foreground">Productos:</span>
                              <span className="font-medium text-foreground">{formatCompactCurrency(project.monto_productos)}</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{formatCurrency(project.monto_productos)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {topProjects.length === 0 && !isLoadingAccess && (
          <div className="text-center py-12 text-muted-foreground">
            No hay proyectos disponibles
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
