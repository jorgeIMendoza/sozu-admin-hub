import { useState } from "react";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "@/components/admin/ProjectCard";
import { NewProjectDialog } from "@/components/admin/NewProjectDialog";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const Proyectos = () => {
  const [searchTerm, setSearchTerm] = useState("");

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
          numero_edificios,
          numero_amenidades,
          id_tipo_uso,
          tipos_uso:id_tipo_uso (
            nombre
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

  const filteredProjects = projects.filter(project =>
    project.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.direccion?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Buscar proyectos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredProjects.map((project) => (
          <ProjectCard 
            key={project.id} 
            id={project.id}
            nombre={project.nombre}
            direccion={project.direccion}
            precio_m2={project.precio_m2}
            activo={project.activo}
            tipo_uso={project.tipos_uso?.nombre}
            numero_edificios={project.numero_edificios || 0}
            numero_amenidades={project.numero_amenidades || 0}
            fecha_inicio={project.fecha_inicio}
            descripcion={project.descripcion}
          />
        ))}
      </div>

      {filteredProjects.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            {searchTerm ? "No se encontraron proyectos que coincidan con tu búsqueda." : "No hay proyectos disponibles."}
          </p>
        </div>
      )}
    </div>
  );
};

export default Proyectos;