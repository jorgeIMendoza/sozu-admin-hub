import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/admin/StatCard";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Building2, Home, DollarSign, MapPin } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ProjectData {
  id: number;
  nombre: string;
  direccion: string;
  precio_m2_actual: number;
  tipo_uso: string;
  monto_total: number;
}

const Dashboard = () => {
  const [showSozuOnly, setShowSozuOnly] = useState(true);

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
        .not('nombre', 'in', '("Productos","Servicios","Mantenimientos")');

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

      return projectsWithAmounts.sort((a, b) => b.monto_total - a.monto_total);
    }
  });

  // Fetch total buildings
  const { data: totalBuildings = 0 } = useQuery({
    queryKey: ['dashboard-buildings'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('edificios')
        .select('*', { count: 'exact', head: true })
        .eq('activo', true);

      if (error) throw error;
      return count || 0;
    }
  });

  // Filter projects based on checkbox
  const filteredProjects = useMemo(() => {
    if (!showSozuOnly) return projectAmounts;
    return projectAmounts.filter((p: ProjectData) => sozuProjectIds.includes(p.id));
  }, [projectAmounts, sozuProjectIds, showSozuOnly]);

  // Calculate buildings for filtered projects
  const { data: filteredBuildings = 0 } = useQuery({
    queryKey: ['dashboard-filtered-buildings', filteredProjects.map(p => p.id).join(',')],
    queryFn: async () => {
      if (filteredProjects.length === 0) return 0;
      
      const { count, error } = await supabase
        .from('edificios')
        .select('*', { count: 'exact', head: true })
        .in('id_proyecto', filteredProjects.map(p => p.id))
        .eq('activo', true);

      if (error) throw error;
      return count || 0;
    },
    enabled: filteredProjects.length > 0
  });

  // Calculate stats based on filtered projects
  const stats = useMemo(() => {
    const totalProjects = filteredProjects.length;
    const buildingsCount = showSozuOnly ? filteredBuildings : totalBuildings;

    // Calculate average price per m2
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
        value: buildingsCount.toString(),
        icon: Home,
      },
      {
        title: "Precio Promedio",
        value: `$${Math.round(avgPrice).toLocaleString('es-MX')}`,
        subtitle: "MXN por m²",
        icon: DollarSign,
      }
    ];
  }, [filteredProjects, filteredBuildings, totalBuildings, showSozuOnly]);

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

      {/* Filter Checkbox */}
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="sozu-filter" 
          checked={showSozuOnly}
          onCheckedChange={(checked) => setShowSozuOnly(checked === true)}
        />
        <Label 
          htmlFor="sozu-filter"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          Gestionados por inmobiliaria Sozu (Real Estate Ventures)
        </Label>
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
                    <div className="text-lg font-bold text-foreground">
                      {formatCurrency(project.monto_total)}
                    </div>
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
