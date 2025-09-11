import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, DollarSign, Building, Home, Calendar, Trash2, RotateCcw } from "lucide-react";
import { EditProjectDialog } from "./EditProjectDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ProjectCardProps {
  id: number;
  nombre: string;
  direccion?: string;
  precio_m2?: number;
  activo: boolean;
  tipo_uso?: string;
  numero_edificios?: number;
  numero_amenidades?: number;
  fecha_inicio?: string;
  descripcion?: string;
  onProjectUpdated?: () => void;
  onProjectDeleted?: () => void;
}

export const ProjectCard = ({ 
  id, 
  nombre, 
  direccion, 
  precio_m2, 
  activo, 
  tipo_uso,
  numero_edificios = 0,
  numero_amenidades = 0,
  fecha_inicio,
  descripcion,
  onProjectUpdated,
  onProjectDeleted
}: ProjectCardProps) => {
  const { toast } = useToast();

  const formatPrice = (price?: number) => {
    if (!price) return "N/A";
    return `$${price.toLocaleString('es-MX')} MXN/m²`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('es-MX');
  };

  const handleDeleteProject = async () => {
    try {
      const { error } = await supabase
        .from("proyectos")
        .update({ activo: false })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Proyecto eliminado",
        description: "El proyecto se ha eliminado exitosamente.",
      });

      onProjectDeleted?.();
    } catch (error) {
      console.error("Error deleting project:", error);
      toast({
        title: "Error",
        description: "Hubo un error al eliminar el proyecto.",
        variant: "destructive",
      });
    }
  };

  const handleRestoreProject = async () => {
    try {
      const { error } = await supabase
        .from("proyectos")
        .update({ activo: true })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Proyecto restaurado",
        description: "El proyecto se ha restaurado exitosamente.",
      });

      onProjectUpdated?.();
    } catch (error) {
      console.error("Error restoring project:", error);
      toast({
        title: "Error",
        description: "Hubo un error al restaurar el proyecto.",
        variant: "destructive",
      });
    }
  };

  const hasBuildings = numero_edificios > 0;

  return (
    <Card className="transition-all duration-200 hover:shadow-lg border border-border">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-semibold text-lg text-foreground">{nombre}</h3>
              {direccion && (
                <div className="flex items-center text-sm text-muted-foreground mt-1">
                  <MapPin className="h-4 w-4 mr-1" />
                  {direccion}
                </div>
              )}
            </div>
            <Badge 
              variant={activo ? "default" : "secondary"}
              className={activo ? "bg-green-500 text-white hover:bg-green-600" : ""}
            >
              {activo ? "Activo" : "Inactivo"}
            </Badge>
          </div>

          <div className="flex items-center text-primary font-semibold text-lg">
            <DollarSign className="h-5 w-5 mr-1" />
            {formatPrice(precio_m2)}
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center text-muted-foreground">
              <Building className="h-4 w-4 mr-2 text-blue-500" />
              <span className="font-medium">Tipo:</span>
              <span className="ml-2">{tipo_uso || "N/A"}</span>
            </div>
            <div className="flex items-center text-muted-foreground">
              <Home className="h-4 w-4 mr-2 text-orange-500" />
              <span className="font-medium">Edificios:</span>
              <span className="ml-2">{numero_edificios}</span>
            </div>
            <div className="flex items-center text-muted-foreground">
              <span className="h-4 w-4 mr-2 bg-purple-500 rounded-full flex items-center justify-center text-white text-xs">A</span>
              <span className="font-medium">Amenidades:</span>
              <span className="ml-2">{numero_amenidades}</span>
            </div>
            <div className="flex items-center text-muted-foreground">
              <Calendar className="h-4 w-4 mr-2 text-blue-400" />
              <span className="font-medium">Inicio:</span>
              <span className="ml-2">{formatDate(fecha_inicio)}</span>
            </div>
          </div>

          {descripcion && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {descripcion}
            </p>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex space-x-2">
              {activo ? (
                <>
                  <EditProjectDialog 
                    projectId={id} 
                    onProjectUpdated={onProjectUpdated || (() => {})}
                  />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        disabled={hasBuildings}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Eliminar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar proyecto?</AlertDialogTitle>
                        <AlertDialogDescription>
                          ¿Estás seguro de que deseas eliminar este proyecto? Esta acción no se puede deshacer.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteProject}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={handleRestoreProject}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Restaurar
                </Button>
              )}
            </div>
            {activo && hasBuildings && (
              <p className="text-xs text-muted-foreground">
                No se puede eliminar: contiene {numero_edificios} edificio{numero_edificios !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};