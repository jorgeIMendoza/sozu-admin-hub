import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Edit, Home, Building2 } from "lucide-react";
import { NewModeloDialog } from "@/components/admin/NewModeloDialog";

interface ModeloWithRelations {
  modelo_id: number;
  modelo_nombre: string;
  modelo_descripcion?: string;
  numero_recamaras?: number;
  numero_completo_banos?: number;
  numero_medio_bano?: number;
  edificio_id: number;
  edificio_nombre: string;
  proyecto_id: number;
  proyecto_nombre: string;
}

export default function Modelos() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: modelos, isLoading, refetch } = useQuery({
    queryKey: ["modelos-with-relations"],
    queryFn: async () => {
      // Based on the SQL query: select p.nombre as proyecto, e.nombre as edificio, m.nombre as modelo
      const { data, error } = await supabase
        .from("edificios_modelos")
        .select(`
          id_edificio,
          id_modelo,
          edificios!inner (
            id,
            nombre,
            id_proyecto,
            activo,
            proyectos!inner (
              id,
              nombre,
              activo
            )
          ),
          modelos!inner (
            id,
            nombre,
            descripcion,
            numero_recamaras,
            numero_completo_banos,
            numero_medio_bano,
            activo
          )
        `)
        .eq("activo", true)
        .eq("edificios.activo", true)
        .eq("proyectos.activo", true)
        .eq("modelos.activo", true);

      if (error) {
        console.error("Error fetching modelos:", error);
        throw error;
      }

      // Transform data to match our interface
      const modelosWithRelations: ModeloWithRelations[] = data?.map((item: any) => ({
        modelo_id: item.modelos.id,
        modelo_nombre: item.modelos.nombre,
        modelo_descripcion: item.modelos.descripcion,
        numero_recamaras: item.modelos.numero_recamaras,
        numero_completo_banos: item.modelos.numero_completo_banos,
        numero_medio_bano: item.modelos.numero_medio_bano,
        edificio_id: item.edificios.id,
        edificio_nombre: item.edificios.nombre,
        proyecto_id: item.edificios.proyectos.id,
        proyecto_nombre: item.edificios.proyectos.nombre,
      })) || [];

      return modelosWithRelations;
    },
  });

  const handleModeloAdded = () => {
    refetch();
  };

  // Filter modelos based on search term
  const filteredModelos = modelos?.filter((modelo) =>
    modelo.modelo_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    modelo.edificio_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    modelo.proyecto_nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (modelo.modelo_descripcion && modelo.modelo_descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  if (isLoading) {
    return <div>Cargando modelos...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Modelos</h1>
          <p className="text-muted-foreground">
            Administra los modelos de propiedades agrupados por proyecto
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar modelos, edificios o proyectos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <NewModeloDialog onModeloAdded={handleModeloAdded} />
        </div>
      </div>

      {filteredModelos.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Home className="h-5 w-5" />
              <span>Modelos Disponibles</span>
              <Badge variant="secondary" className="ml-2">
                {filteredModelos.length} modelo{filteredModelos.length !== 1 ? 's' : ''}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Edificio</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Recámaras</TableHead>
                  <TableHead>Baños</TableHead>
                  <TableHead>1/2 Baños</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModelos.map((modelo) => (
                  <TableRow key={`${modelo.modelo_id}-${modelo.edificio_id}`}>
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        <Home className="h-4 w-4 text-primary" />
                        <span>{modelo.modelo_nombre}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span>{modelo.edificio_nombre}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{modelo.proyecto_nombre}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {modelo.modelo_descripcion || "Sin descripción"}
                    </TableCell>
                    <TableCell>{modelo.numero_recamaras || "-"}</TableCell>
                    <TableCell>{modelo.numero_completo_banos || "-"}</TableCell>
                    <TableCell>{modelo.numero_medio_bano || "-"}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
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