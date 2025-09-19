import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Edit, Trash2, Upload, Plus, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { BulkUploadBodegasDialog } from "@/components/admin/BulkUploadBodegasDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Bodega {
  id: number;
  nombre: string;
  m2: number;
  ubicacion: string;
  es_incluido: boolean;
  activo: boolean;
  proyecto_nombre: string;
  numero_propiedad: string;
}

const Bodegas = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("activos");
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [proyectoFilter, setProyectoFilter] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query para obtener TODAS las bodegas (activas e inactivas)
  const { data: allBodegas = [], isLoading } = useQuery({
    queryKey: ['bodegas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bodegas')
        .select(`
          *,
          propiedades!fk_bodegas_propiedad(
            numero_propiedad,
            id_entidad_relacionada_dueno
          )
        `);

      if (error) throw error;

      // Get all unique entity IDs to fetch project names
      const entityIds = [...new Set(data.map(item => item.propiedades?.id_entidad_relacionada_dueno).filter(Boolean))];
      
      let entitiesData = [];
      if (entityIds.length > 0) {
        const { data: entities, error: entitiesError } = await supabase
          .from('entidades_relacionadas')
          .select(`
            id,
            proyectos!entidades_relacionadas_id_proyecto_fkey(nombre)
          `)
          .in('id', entityIds);
        
        if (!entitiesError) {
          entitiesData = entities || [];
        }
      }

      return data.map((item: any) => {
        const entity = entitiesData.find(e => e.id === item.propiedades?.id_entidad_relacionada_dueno);
        return {
          id: item.id,
          nombre: item.nombre,
          m2: item.m2,
          ubicacion: item.ubicacion,
          es_incluido: item.es_incluido,
          activo: item.activo,
          proyecto_nombre: entity?.proyectos?.nombre || 'N/A',
          numero_propiedad: item.propiedades?.numero_propiedad || 'N/A'
        };
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
  });

  // Query para obtener proyectos para el filtro
  const { data: proyectos = [] } = useQuery({
    queryKey: ['proyectos-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proyectos')
        .select('nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutos
  });

  const handleDelete = async (bodegaId: number) => {
    try {
      const { error } = await supabase
        .from('bodegas')
        .update({ activo: false })
        .eq('id', bodegaId);

      if (error) throw error;

      toast({
        title: "Bodega eliminada",
        description: "La bodega se ha marcado como inactiva.",
      });

      queryClient.invalidateQueries({ queryKey: ['bodegas'] });
    } catch (error) {
      console.error('Error deleting bodega:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la bodega.",
        variant: "destructive",
      });
    }
  };

  const handleRestore = async (bodegaId: number) => {
    try {
      const { error } = await supabase
        .from('bodegas')
        .update({ activo: true })
        .eq('id', bodegaId);

      if (error) throw error;

      toast({
        title: "Bodega restaurada",
        description: "La bodega se ha reactivado.",
      });

      queryClient.invalidateQueries({ queryKey: ['bodegas'] });
    } catch (error) {
      console.error('Error restoring bodega:', error);
      toast({
        title: "Error",
        description: "No se pudo restaurar la bodega.",
        variant: "destructive",
      });
    }
  };

  // Filtrado optimizado del lado del cliente usando useMemo
  const filteredBodegas = useMemo(() => {
    return allBodegas.filter((bodega) => {
      // Filtrar por status activo/inactivo según la pestaña
      const matchesStatus = activeTab === 'activos' ? bodega.activo : !bodega.activo;
      
      // Filtrar por búsqueda
      const matchesSearch = searchTerm === "" || 
        bodega.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bodega.numero_propiedad.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filtrar por proyecto
      const matchesProyecto = proyectoFilter === "" || proyectoFilter === "all" || 
        bodega.proyecto_nombre === proyectoFilter;

      return matchesStatus && matchesSearch && matchesProyecto;
    });
  }, [allBodegas, activeTab, searchTerm, proyectoFilter]);

  if (isLoading) {
    return <div className="flex justify-center items-center h-64">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Bodegas</h1>
        <div className="flex gap-2">
          <Button
            onClick={() => setBulkUploadOpen(true)}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Carga Masiva
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por nombre de bodega o número de departamento..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Proyecto</label>
              <Select value={proyectoFilter} onValueChange={setProyectoFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los proyectos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los proyectos</SelectItem>
                  {proyectos.map((proyecto) => (
                    <SelectItem key={proyecto.nombre} value={proyecto.nombre}>
                      {proyecto.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="activos">Activos</TabsTrigger>
          <TabsTrigger value="eliminados">Eliminados</TabsTrigger>
        </TabsList>

        <TabsContent value="activos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bodegas Activas ({filteredBodegas.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Número Departamento</TableHead>
                      <TableHead>Nombre Bodega</TableHead>
                      <TableHead>M2</TableHead>
                      <TableHead>Incluido</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBodegas.map((bodega) => (
                      <TableRow key={bodega.id}>
                        <TableCell>{bodega.proyecto_nombre}</TableCell>
                        <TableCell>{bodega.numero_propiedad}</TableCell>
                        <TableCell>{bodega.nombre}</TableCell>
                        <TableCell>{bodega.m2} m²</TableCell>
                        <TableCell>
                          <Badge variant={bodega.es_incluido ? "default" : "secondary"}>
                            {bodega.es_incluido ? "Sí" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell>{bodega.ubicacion || "N/A"}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Eliminar bodega?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta acción marcará la bodega como inactiva.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => handleDelete(bodega.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Eliminar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="eliminados" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bodegas Eliminadas ({filteredBodegas.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Número Departamento</TableHead>
                      <TableHead>Nombre Bodega</TableHead>
                      <TableHead>M2</TableHead>
                      <TableHead>Incluido</TableHead>
                      <TableHead>Ubicación</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBodegas.map((bodega) => (
                      <TableRow key={bodega.id}>
                        <TableCell>{bodega.proyecto_nombre}</TableCell>
                        <TableCell>{bodega.numero_propiedad}</TableCell>
                        <TableCell>{bodega.nombre}</TableCell>
                        <TableCell>{bodega.m2} m²</TableCell>
                        <TableCell>
                          <Badge variant={bodega.es_incluido ? "default" : "secondary"}>
                            {bodega.es_incluido ? "Sí" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell>{bodega.ubicacion || "N/A"}</TableCell>
                        <TableCell>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleRestore(bodega.id)}
                            className="gap-2"
                          >
                            <Undo2 className="h-4 w-4" />
                            Restaurar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <BulkUploadBodegasDialog
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['bodegas'] });
          setBulkUploadOpen(false);
        }}
      />
    </div>
  );
};

export default Bodegas;