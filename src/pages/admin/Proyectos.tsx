import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/admin/ProjectCard";
import { Plus, Filter } from "lucide-react";

const Proyectos = () => {
  const projects = [
    {
      name: "Vive Daiku",
      address: "Av. Patria 1891, Puerta de Hierro, Zapopan, Jal.",
      pricePerSqm: "$52,000 MXN/m²",
      status: "Activo" as const,
      type: "Tipo",
      category: "Residencial"
    },
    {
      name: "Margot", 
      address: "Av. López Mateos Sur 2375, Jardines del Country, Guadalajara, Jal.",
      pricePerSqm: "$45,000 MXN/m²",
      status: "Activo" as const,
      type: "Tipo",
      category: "Residencial"
    },
    {
      name: "Bottura",
      address: "Av. Américas 1500, Providencia, Guadalajara, Jal.", 
      pricePerSqm: "$38,000 MXN/m²",
      status: "Activo" as const,
      type: "Tipo",
      category: "Turístico"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Proyectos</h1>
          <p className="text-muted-foreground">Gestiona todos los proyectos inmobiliarios</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
          <Button className="bg-primary hover:bg-primary-hover">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Proyecto
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {projects.map((project, index) => (
          <ProjectCard key={index} {...project} />
        ))}
      </div>
    </div>
  );
};

export default Proyectos;