import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/admin/StatCard";
import { Building2, Home, DollarSign, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ProjectData {
  id: number;
  nombre: string;
  direccion: string;
  precio_m2_actual: number;
  tipo_uso: string;
  monto_total: number;
}

const Dashboard = () => {

  // Fetch projects with amounts
  const { data: projectAmounts = [] } = useQuery({
    queryKey: ['dashboard-project-amounts'],
    queryFn: async () => {
      const { data: projects, error: projectsError } = await supabase
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
              monto_total: 0
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
              monto_total: 0
            };
          }

          const propiedadIds = propiedades.map(p => p.id);

          // Luego las ofertas de esas propiedades
          const { data: ofertas } = await supabase
            .from('ofertas')
            .select('id')
            .in('id_propiedad', propiedadIds);

          if (!ofertas || ofertas.length === 0) {
            return {
              id: project.id,
              nombre: project.nombre,
              direccion: project.direccion,
              precio_m2_actual: project.precio_m2_actual || 0,
              tipo_uso: (project.tipos_uso as any)?.nombre || 'N/A',
              monto_total: 0
            };
          }

          const ofertaIds = ofertas.map(o => o.id);

          // Finalmente las cuentas de cobranza
          const { data: cuentas, error: cuentasError } = await supabase
            .from('cuentas_cobranza')
            .select('precio_final')
            .eq('activo', true)
            .in('id_oferta', ofertaIds);

          if (cuentasError) {
            console.error('Error fetching cuentas:', cuentasError);
            return {
              id: project.id,
              nombre: project.nombre,
              direccion: project.direccion,
              precio_m2_actual: project.precio_m2_actual || 0,
              tipo_uso: (project.tipos_uso as any)?.nombre || 'N/A',
              monto_total: 0
            };
          }

          const monto_total = (cuentas || []).reduce((sum, c) => sum + Number(c.precio_final), 0);

          return {
            id: project.id,
            nombre: project.nombre,
            direccion: project.direccion,
            precio_m2_actual: project.precio_m2_actual || 0,
            tipo_uso: (project.tipos_uso as any)?.nombre || 'N/A',
            monto_total
          };
        })
      );

      // Filter out projects with 0 monto_total and sort by monto_total descending
      return projectsWithAmounts
        .filter(p => p.monto_total > 0)
        .sort((a, b) => b.monto_total - a.monto_total);
    }
  });

  // Fetch total buildings for all projects with monto > 0
  const projectIdsWithAmount = useMemo(() => 
    projectAmounts.map(p => p.id), 
    [projectAmounts]
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

  // Calculate stats
  const stats = useMemo(() => {
    const totalProjects = projectAmounts.length;

    // Calculate average price per m2
    const projectsWithPrice = projectAmounts.filter((p: ProjectData) => p.precio_m2_actual > 0);
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
        value: `$${Math.round(avgPrice).toLocaleString('es-MX')}`,
        subtitle: "MXN por m²",
        icon: DollarSign,
      }
    ];
  }, [projectAmounts, totalBuildings]);

  // Get top 5 projects to display
  const topProjects = useMemo(() => {
    return projectAmounts.slice(0, 5);
  }, [projectAmounts]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestión de Proyectos</h1>
          <p className="text-muted-foreground">Administra los proyectos inmobiliarios</p>
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
        <h2 className="text-xl font-semibold">Proyectos Activos</h2>
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
                      className="bg-green-500 text-white hover:bg-green-600"
                    >
                      Activo
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
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {topProjects.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No hay proyectos disponibles
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
