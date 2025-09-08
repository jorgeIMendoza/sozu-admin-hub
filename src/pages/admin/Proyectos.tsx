import { ProjectCard } from "@/components/admin/ProjectCard";
import { NewProjectDialog } from "@/components/admin/NewProjectDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const Proyectos = () => {

  const { data: projects = [], refetch } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select(`
          id,
          nombre,
          descripcion,
          direccion,
          activo,
          precio_m2,
          fecha_inicio,
          id_tipo_uso,
          tipos_uso:id_tipo_uso (
            nombre
          ),
          edificios!fk_edificios_proyecto (
            id
          ),
          amenidades_proyectos (
            amenidades (
              id,
              nombre
            )
          )
        `)
        .eq("activo", true)
        .order("fecha_creacion", { ascending: false });
      
      if (error) {
        console.error("Error fetching projects:", error);
        return [];
      }
      return data || [];
    },
  });


  const handleProjectAdded = () => {
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Proyectos</h1>
          <p className="text-muted-foreground">Gestiona todos los proyectos inmobiliarios</p>
        </div>
        <NewProjectDialog onProjectAdded={handleProjectAdded} />
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {projects.map((project) => (
          <ProjectCard 
            key={project.id} 
            id={project.id}
            nombre={project.nombre}
            direccion={project.direccion}
            precio_m2={project.precio_m2}
            activo={project.activo}
            tipo_uso={project.tipos_uso?.nombre}
            numero_edificios={project.edificios?.length || 0}
            numero_amenidades={project.amenidades_proyectos?.length || 0}
            fecha_inicio={project.fecha_inicio}
            descripcion={project.descripcion}
          />
        ))}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            No hay proyectos disponibles.
          </p>
        </div>
      )}
    </div>
  );
};

export default Proyectos;