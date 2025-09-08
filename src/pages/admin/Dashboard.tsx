import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/admin/StatCard";
import { Building2, Home, DollarSign, Plus, MapPin } from "lucide-react";

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
      id: 1,
      name: "Vive Daiku",
      address: "Av. Patria 1891, Puerta de Hierro, Zapopan, Jal.",
      pricePerSqm: "$52,000 MXN/m²",
      status: "Activo" as const,
      type: "Residencial"
    },
    {
      id: 2,
      name: "Margot", 
      address: "Av. López Mateos Sur 2375, Jardines del Country, Guadalajara, Jal.",
      pricePerSqm: "$45,000 MXN/m²",
      status: "Activo" as const,
      type: "Residencial"
    },
    {
      id: 3,
      name: "Bottura",
      address: "Av. Américas 1500, Providencia, Guadalajara, Jal.", 
      pricePerSqm: "$38,000 MXN/m²",
      status: "Activo" as const,
      type: "Turístico"
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
          {projects.map((project) => (
            <Card key={project.id} className="transition-all duration-200 hover:shadow-md">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{project.name}</h3>
                      <div className="flex items-center text-sm text-muted-foreground mt-1">
                        <MapPin className="h-4 w-4 mr-1" />
                        {project.address}
                      </div>
                    </div>
                    <Badge 
                      variant={project.status === "Activo" ? "default" : "secondary"}
                      className={project.status === "Activo" ? "bg-green-500 text-white hover:bg-green-600" : ""}
                    >
                      {project.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-primary font-semibold">
                      <DollarSign className="h-4 w-4 inline mr-1" />
                      {project.pricePerSqm}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {project.type}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;