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

interface Modelo {
  id: number;
  nombre: string;
  descripcion?: string;
  numero_recamaras?: number;
  numero_completo_banos?: number;
  numero_medio_bano?: number;
}

export default function Modelos() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: modelos, isLoading, refetch } = useQuery({
    queryKey: ["modelos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modelos")
        .select("*")
        .eq("activo", true)
        .order("nombre");

      if (error) {
        console.error("Error fetching modelos:", error);
        throw error;
      }

      return data || [];
    },
  });

  const handleModeloAdded = () => {
    refetch();
  };

  // Filter modelos based on search term
  const filteredModelos = modelos?.filter((modelo) =>
    modelo.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (modelo.descripcion && modelo.descripcion.toLowerCase().includes(searchTerm.toLowerCase()))
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
              placeholder="Buscar modelos..."
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
                  <TableHead>Descripción</TableHead>
                  <TableHead>Recámaras</TableHead>
                  <TableHead>Baños</TableHead>
                  <TableHead>1/2 Baños</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModelos.map((modelo) => (
                  <TableRow key={modelo.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        <Home className="h-4 w-4 text-primary" />
                        <span>{modelo.nombre}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {modelo.descripcion || "Sin descripción"}
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