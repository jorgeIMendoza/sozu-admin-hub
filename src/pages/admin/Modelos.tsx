import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Edit, Home } from "lucide-react";
import { NewModeloDialog } from "@/components/admin/NewModeloDialog";

export default function Modelos() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: modelos, isLoading, refetch } = useQuery({
    queryKey: ["modelos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modelos")
        .select(`
          *,
          modelos_caracteristicas (
            caracteristicas (
              id,
              nombre
            )
          )
        `)
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data;
    },
  });

  const handleModeloAdded = () => {
    refetch();
  };

  const filteredModelos = modelos?.filter((modelo) =>
    modelo.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (modelo.descripcion && modelo.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (isLoading) {
    return <div>Cargando modelos...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Modelos</h1>
          <p className="text-muted-foreground">
            Administra los modelos de propiedades
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar modelos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <NewModeloDialog onModeloAdded={handleModeloAdded} />
        </div>
      </div>

      {filteredModelos && filteredModelos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredModelos.map((modelo) => (
            <Card key={modelo.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Home className="h-5 w-5 text-primary" />
                    <span className="text-lg">{modelo.nombre}</span>
                  </div>
                  <Button variant="outline" size="sm">
                    <Edit className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {modelo.descripcion && (
                  <p className="text-sm text-muted-foreground">
                    {modelo.descripcion}
                  </p>
                )}
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {modelo.numero_recamaras && (
                    <div>
                      <span className="font-medium">Recámaras:</span> {modelo.numero_recamaras}
                    </div>
                  )}
                  {modelo.numero_completo_banos && (
                    <div>
                      <span className="font-medium">Baños:</span> {modelo.numero_completo_banos}
                    </div>
                  )}
                  {modelo.numero_medio_bano && (
                    <div>
                      <span className="font-medium">Medios baños:</span> {modelo.numero_medio_bano}
                    </div>
                  )}
                </div>

                {modelo.modelos_caracteristicas && modelo.modelos_caracteristicas.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Características:</p>
                    <div className="flex flex-wrap gap-1">
                      {modelo.modelos_caracteristicas.map((mc: any) => (
                        <Badge key={mc.caracteristicas.id} variant="secondary" className="text-xs">
                          {mc.caracteristicas.nombre}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <Home className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchTerm ? "No se encontraron modelos que coincidan con la búsqueda" : "No hay modelos disponibles"}
            </p>
            {searchTerm && (
              <p className="text-sm text-muted-foreground mt-1">
                Intenta con otros términos de búsqueda
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}