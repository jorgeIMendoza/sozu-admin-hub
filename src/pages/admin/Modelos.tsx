import { useState, useEffect } from "react";
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
import { Search, Edit, Home, Trash2, Eye, ChevronDown, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NewModeloDialog } from "@/components/admin/NewModeloDialog";
import { EditModeloDialog } from "@/components/admin/EditModeloDialog";
import { ModelMultimediaSection } from "@/components/admin/ModelMultimediaSection";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Modelo {
  id: number;
  nombre: string;
  descripcion?: string;
  numero_recamaras?: number;
  numero_completo_banos?: number;
  numero_medio_bano?: number;
  id_proyecto?: number | null;
}

interface Proyecto {
  id: number;
  nombre: string;
}

export default function Modelos() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "deleted">("active");
  const [modeloToDelete, setModeloToDelete] = useState<Modelo | null>(null);
  const [selectedModelForMultimedia, setSelectedModelForMultimedia] = useState<Modelo | null>(null);
  const [isMultimediaDialogOpen, setIsMultimediaDialogOpen] = useState(false);
  const [selectedDescripcion, setSelectedDescripcion] = useState<{ nombre: string; descripcion: string } | null>(null);
  const [selectedProyectoFilter, setSelectedProyectoFilter] = useState<string>("all");
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    fetchProyectos();
  }, []);

  const fetchProyectos = async () => {
    try {
      const { data, error } = await supabase
        .from('proyectos')
        .select('id, nombre')
        .eq('activo', true)
        .not("id_tipo_uso", "in", "(9,10,11)")
        .order('nombre', { ascending: true });

      if (error) throw error;
      setProyectos(data || []);
    } catch (error) {
      console.error('Error fetching proyectos:', error);
    }
  };

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

      return (data || []) as Modelo[];
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

      return (data || []) as Modelo[];
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

  // Filter modelos based on search term and project
  const filteredModelos = currentModelos?.filter((modelo) => {
    const matchesSearch = modelo.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (modelo.descripcion && modelo.descripcion.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesProyecto = selectedProyectoFilter === "all" || (modelo.id_proyecto?.toString() === selectedProyectoFilter);
    return matchesSearch && matchesProyecto;
  }) || [];

  // Group modelos by project
  const modelosByProject = filteredModelos.reduce((acc, modelo) => {
    const projectId = modelo.id_proyecto || 0; // 0 for modelos without project
    if (!acc[projectId]) {
      acc[projectId] = [];
    }
    acc[projectId].push(modelo);
    return acc;
  }, {} as Record<number, Modelo[]>);

  const getProyectoNombre = (id?: number | null) => {
    if (!id) return "Sin Proyecto";
    return proyectos.find(p => p.id === id)?.nombre || "Proyecto Desconocido";
  };

  const toggleProject = (projectId: number) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

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
          <div className="flex items-center space-x-2 flex-1">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar modelos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={selectedProyectoFilter}
              onValueChange={setSelectedProyectoFilter}
            >
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Filtrar por proyecto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proyectos</SelectItem>
                {proyectos.map((proyecto) => (
                  <SelectItem key={proyecto.id} value={proyecto.id.toString()}>
                    {proyecto.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <NewModeloDialog onModeloAdded={handleModeloAdded} proyectos={proyectos} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "active" | "deleted")}>
        <TabsList>
          <TabsTrigger value="active">Modelos Activos ({modelosActivos?.length || 0})</TabsTrigger>
          <TabsTrigger value="deleted">Modelos Eliminados ({modelosEliminados?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {Object.keys(modelosByProject).length === 0 ? (
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
          ) : (
            <div className="space-y-4">
              {Object.entries(modelosByProject).map(([projectId, projectModelos]) => {
                const numProjectId = parseInt(projectId);
                const isExpanded = expandedProjects.has(numProjectId);
                const projectName = getProyectoNombre(numProjectId === 0 ? null : numProjectId);

                return (
                  <Collapsible
                    key={projectId}
                    open={isExpanded}
                    onOpenChange={() => toggleProject(numProjectId)}
                  >
                    <Card>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5" />
                              ) : (
                                <ChevronRight className="h-5 w-5" />
                              )}
                              <CardTitle className="text-lg">{projectName}</CardTitle>
                              <Badge variant="secondary">{projectModelos.length}</Badge>
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent>
                          <div className="rounded-md border">
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
                                {projectModelos.map((modelo) => (
                                  <TableRow key={modelo.id}>
                                    <TableCell className="font-medium">
                                      <div className="flex items-center space-x-2">
                                        <Home className="h-4 w-4 text-primary" />
                                        <span>{modelo.nombre}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {modelo.descripcion ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setSelectedDescripcion({ nombre: modelo.nombre, descripcion: modelo.descripcion || "" })}
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                      ) : (
                                        <span className="text-muted-foreground text-sm">Sin descripción</span>
                                      )}
                                    </TableCell>
                                    <TableCell>{modelo.numero_recamaras || "-"}</TableCell>
                                    <TableCell>{modelo.numero_completo_banos || "-"}</TableCell>
                                    <TableCell>{modelo.numero_medio_bano || "-"}</TableCell>
                                    <TableCell>
                                      <div className="flex items-center space-x-2">
                                        <EditModeloDialog 
                                          modelo={modelo} 
                                          onModeloUpdated={handleModeloUpdated}
                                          proyectos={proyectos}
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
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="deleted">
          {Object.keys(modelosByProject).length === 0 ? (
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
          ) : (
            <div className="space-y-4">
              {Object.entries(modelosByProject).map(([projectId, projectModelos]) => {
                const numProjectId = parseInt(projectId);
                const isExpanded = expandedProjects.has(numProjectId);
                const projectName = getProyectoNombre(numProjectId === 0 ? null : numProjectId);

                return (
                  <Collapsible
                    key={projectId}
                    open={isExpanded}
                    onOpenChange={() => toggleProject(numProjectId)}
                  >
                    <Card>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5" />
                              ) : (
                                <ChevronRight className="h-5 w-5" />
                              )}
                              <CardTitle className="text-lg">{projectName}</CardTitle>
                              <Badge variant="secondary">{projectModelos.length}</Badge>
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent>
                          <div className="rounded-md border">
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
                                {projectModelos.map((modelo) => (
                                  <TableRow key={modelo.id}>
                                    <TableCell className="font-medium">
                                      <div className="flex items-center space-x-2">
                                        <Home className="h-4 w-4 text-muted-foreground" />
                                        <span>{modelo.nombre}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {modelo.descripcion ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => setSelectedDescripcion({ nombre: modelo.nombre, descripcion: modelo.descripcion || "" })}
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                      ) : (
                                        <span className="text-muted-foreground text-sm">Sin descripción</span>
                                      )}
                                    </TableCell>
                                    <TableCell>{modelo.numero_recamaras || "-"}</TableCell>
                                    <TableCell>{modelo.numero_completo_banos || "-"}</TableCell>
                                    <TableCell>{modelo.numero_medio_bano || "-"}</TableCell>
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
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
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

      {/* Dialog para ver descripción */}
      <Dialog open={!!selectedDescripcion} onOpenChange={() => setSelectedDescripcion(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Descripción - {selectedDescripcion?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="whitespace-pre-wrap text-sm">{selectedDescripcion?.descripcion}</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}