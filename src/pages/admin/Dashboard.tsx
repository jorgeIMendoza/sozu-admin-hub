import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/admin/StatCard";
import { ProjectCard } from "@/components/admin/ProjectCard";
import { Building2, Home, DollarSign, Plus } from "lucide-react";

const Dashboard = () => {
  // Mock data - this would come from your API
  const stats = [
    {
      title: "Proyectos",
      value: "3",
      icon: Building2,
    },
    {
      title: "Edificios", 
      value: "3",
      icon: Home,
    },
    {
      title: "Precio Promedio",
      value: "$45,000",
      subtitle: "MXN por m²",
      icon: DollarSign,
    }
  ];

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
          <h1 className="text-3xl font-bold text-foreground">Gestión de Proyectos</h1>
          <p className="text-muted-foreground">Administra los proyectos inmobiliarios</p>
        </div>
        <Button className="bg-primary hover:bg-primary-hover">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Proyecto
        </Button>
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
          {projects.map((project, index) => (
            <ProjectCard key={index} {...project} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;