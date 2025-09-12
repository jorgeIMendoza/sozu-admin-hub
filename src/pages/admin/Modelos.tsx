import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Edit, Home, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NewModeloDialog } from "@/components/admin/NewModeloDialog";
import { EditModeloDialog } from "@/components/admin/EditModeloDialog";
import { ModelMultimediaSection } from "@/components/admin/ModelMultimediaSection";
import { useToast } from "@/hooks/use-toast";

interface Modelo {
  id: number;
  nombre: string;
  descripcion?: string;
  numero_recamaras?: number;
  numero_completo_banos?: number;
  numero_medio_bano?: number;
  habilitar_asignar?: boolean;
}

export default function Modelos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "deleted">("active");
  const [modeloToDelete, setModeloToDelete] = useState<Modelo | null>(null);
  const [selectedModelForMultimedia, setSelectedModelForMultimedia] = useState<Modelo | null>(null);
  const [isMultimediaDialogOpen, setIsMultimediaDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: modelosActivos, isLoading: loadingActivos, refetch: refetchActivos } = useQuery({
    queryKey: ["modelos", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modelos")
        .select("*")
        .eq("activo", true)
        .order("nombre");

      if (error) {
        console.error("Error fetching modelos activos:", error);
        throw error;
      }

      return data || [];
    },
  });

  const { data: modelosEliminados, isLoading: loadingEliminados, refetch: refetchEliminados } = useQuery({
    queryKey: ["modelos", "deleted"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modelos")
        .select("*")
        .eq("activo", false)
        .order("nombre");

      if (error) {
        console.error("Error fetching modelos eliminados:", error);
        throw error;
      }

      return data || [];
    },
    enabled: activeTab === "deleted",
  });

  const handleModeloAdded = () => {
    refetchActivos();
  };

  const handleModeloUpdated = () => {
    refetchActivos();
    refetchEliminados();
  };

  const handleDeleteModelo = async (modelo: Modelo) => {
    try {
      const { error } = await supabase
        .from("modelos")
        .update({ activo: false })
        .eq("id", modelo.id);

      if (error) throw error;

      toast({
        title: "Modelo eliminado",
        description: `El modelo "${modelo.nombre}" ha sido eliminado.`,
      });

      refetchActivos();
      setModeloToDelete(null);
    } catch (error) {
      console.error("Error deleting modelo:", error);
      toast({
        title: "Error",
        description: "Hubo un error al eliminar el modelo.",
        variant: "destructive",
      });
    }
  };

  const handleRestoreModelo = async (modelo: Modelo) => {
    try {
      const { error } = await supabase
        .from("modelos")
        .update({ activo: true })
        .eq("id", modelo.id);

      if (error) throw error;

      toast({
        title: "Modelo restaurado",
        description: `El modelo "${modelo.nombre}" ha sido restaurado.`,
      });

      refetchEliminados();
      refetchActivos();
    } catch (error) {
      console.error("Error restoring modelo:", error);
      toast({
        title: "Error",
        description: "Hubo un error al restaurar el modelo.",
        variant: "destructive",
      });
    }
  };

  const currentModelos = activeTab === "active" ? modelosActivos : modelosEliminados;
  const isLoading = activeTab === "active" ? loadingActivos : loadingEliminados;

  // Filter modelos based on search term
  const filteredModelos = currentModelos?.filter((modelo) =>
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

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "active" | "deleted")}>
        <TabsList>
          <TabsTrigger value="active">Modelos Activos ({modelosActivos?.length || 0})</TabsTrigger>
          <TabsTrigger value="deleted">Modelos Eliminados ({modelosEliminados?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {filteredModelos.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Home className="h-5 w-5" />
                  <span>Modelos Activos</span>
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
                      <TableHead>Habilitado Asignar</TableHead>
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
                          <Badge variant={modelo.habilitar_asignar ? "default" : "secondary"}>
                            {modelo.habilitar_asignar ? "Sí" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <EditModeloDialog 
                              modelo={modelo} 
                              onModeloUpdated={handleModeloUpdated} 
                            />
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setSelectedModelForMultimedia(modelo);
                                setIsMultimediaDialogOpen(true);
                              }}
                              title="Gestionar multimedia"
                            >
                              🎥
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setModeloToDelete(modelo)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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
                  {searchTerm ? "No se encontraron modelos que coincidan con la búsqueda" : "No hay modelos activos"}
                </p>
                {searchTerm && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Intenta con otros términos de búsqueda
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="deleted">
          {filteredModelos.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Home className="h-5 w-5" />
                  <span>Modelos Eliminados</span>
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
                      <TableHead>Habilitado Asignar</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredModelos.map((modelo) => (
                      <TableRow key={modelo.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center space-x-2">
                            <Home className="h-4 w-4 text-muted-foreground" />
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
                          <Badge variant={modelo.habilitar_asignar ? "default" : "secondary"}>
                            {modelo.habilitar_asignar ? "Sí" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleRestoreModelo(modelo)}
                          >
                            Restaurar
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
                  {searchTerm ? "No se encontraron modelos eliminados que coincidan con la búsqueda" : "No hay modelos eliminados"}
                </p>
                {searchTerm && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Intenta con otros términos de búsqueda
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!modeloToDelete} onOpenChange={() => setModeloToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el modelo "{modeloToDelete?.nombre}". 
              El modelo se marcará como inactivo y se podrá restaurar desde la pestaña de eliminados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => modeloToDelete && handleDeleteModelo(modeloToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para multimedia */}
      <Dialog open={isMultimediaDialogOpen} onOpenChange={setIsMultimediaDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Multimedia - {selectedModelForMultimedia?.nombre}</DialogTitle>
          </DialogHeader>
          {selectedModelForMultimedia && (
            <ModelMultimediaSection modelId={selectedModelForMultimedia.id} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}