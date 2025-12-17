import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, Building2, Calendar, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { NewBuildingDialog } from "./NewBuildingDialog";

interface ProjectDetailsDialogProps {
  projectId: number;
  projectName: string;
}

export const ProjectDetailsDialog = ({ projectId, projectName }: ProjectDetailsDialogProps) => {
  const [open, setOpen] = useState(false);

  const { data: project, refetch } = useQuery({
    queryKey: ["project-details", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select(`
          *,
          tipos_uso:id_tipo_uso (nombre),
          edificios (
            id,
            nombre,
            numero_pisos,
            fecha_lanzamiento
          ),
          amenidades_proyectos (
            amenidades (
              id,
              nombre
            )
          )
        `)
        .eq("id", projectId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const formatPrice = (price: number | null) => {
    if (!price) return "No especificado";
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 2,
    }).format(price);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "No especificada";
    return new Date(dateString).toLocaleDateString('es-MX');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Eye className="h-4 w-4 mr-2" />
          Ver Detalles
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>{projectName}</DialogTitle>
        </DialogHeader>
        
        {project && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Información General</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <strong>Tipo de Uso:</strong> {project.tipos_uso?.nombre}
                  </div>
                  <div>
                    <strong>Dirección:</strong> {project.direccion || "No especificada"}
                  </div>
                  <div>
                    <strong>Descripción:</strong> {project.descripcion || "No especificada"}
                  </div>
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    <strong>Precio m²:</strong> {formatPrice((project as any).precio_m2_actual)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <strong>Fecha Inicio:</strong> {formatDate(project.fecha_inicio_construccion)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Amenidades</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {project.amenidades_proyectos && project.amenidades_proyectos.length > 0 ? (
                      project.amenidades_proyectos.map((ap: any) => (
                        <Badge key={ap.amenidades.id} variant="secondary">
                          {ap.amenidades.nombre}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">Sin amenidades asignadas</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Edificios ({project.edificios?.length || 0})
                </CardTitle>
                <NewBuildingDialog 
                  projectId={projectId} 
                  onBuildingAdded={refetch}
                />
              </CardHeader>
              <CardContent>
                {project.edificios && project.edificios.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {project.edificios.map((edificio: any) => (
                      <Card key={edificio.id} className="border">
                        <CardContent className="p-4">
                          <h4 className="font-semibold">{edificio.nombre}</h4>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <div>Niveles: {edificio.numero_pisos || "No especificado"}</div>
                            <div>Lanzamiento: {formatDate(edificio.fecha_lanzamiento)}</div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    No hay edificios registrados para este proyecto
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};