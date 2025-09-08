import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, DollarSign, Building, Home, Calendar, Trash2 } from "lucide-react";
import { EditProjectDialog } from "./EditProjectDialog";

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
  onProjectUpdated
}: ProjectCardProps) => {
  const formatPrice = (price?: number) => {
    if (!price) return "N/A";
    return `$${price.toLocaleString('es-MX')} MXN/m²`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString('es-MX');
  };

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
              <EditProjectDialog 
                projectId={id} 
                onProjectUpdated={onProjectUpdated || (() => {})}
              />
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                <Trash2 className="h-4 w-4 mr-1" />
                Eliminar
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};