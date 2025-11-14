import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Edit, Trash2, Upload, Plus, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { BulkUploadBodegasDialog } from "@/components/admin/BulkUploadBodegasDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { EditBodegaDialog } from "@/components/admin/EditBodegaDialog";
import { Combobox } from "@/components/ui/combobox";
import { highlightText } from "@/lib/highlightText";

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
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("activos");
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [proyectoFilter, setProyectoFilter] = useState("");
  const [editingBodega, setEditingBodega] = useState<Bodega | null>(null);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Pagination states
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1);
  const itemsPerPage = 50;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query para obtener bodegas activas
  const { data: activeData, isLoading: isLoadingActive } = useQuery({
    queryKey: ['bodegas', 'active', currentPageActive, searchTerm, proyectoFilter],
    queryFn: async () => {
      let query = supabase
        .from('bodegas')
        .select(`
          *,
          propiedades!fk_bodegas_propiedad(
            numero_propiedad,
            id_entidad_relacionada_dueno
          )
        `, { count: 'exact' })
        .eq('activo', true)
        .order('id', { ascending: false });

      // Si hay búsqueda, obtenemos más resultados para filtrar localmente
      if (searchTerm) {
        const { data: allData, error } = await query.range(0, 999);
        
        if (error) throw error;

        // Obtener nombres de proyecto para TODOS los datos
        const entityIds = [...new Set(allData.map(item => item.propiedades?.id_entidad_relacionada_dueno).filter(Boolean))];
        
        let entitiesData: any[] = [];
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

        // Enriquecer TODOS los datos con nombres de proyecto
        const enrichedData = allData.map((item: any) => {
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

        // Filtrar localmente por nombre de bodega o número de departamento
        let filteredData = enrichedData.filter(item => {
          const matchesNombre = item.nombre?.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesNumero = item.numero_propiedad?.toLowerCase().includes(searchTerm.toLowerCase());
          return matchesNombre || matchesNumero;
        });

        // Aplicar filtro de proyecto si existe
        if (proyectoFilter && proyectoFilter !== "all") {
          filteredData = filteredData.filter(item => item.proyecto_nombre === proyectoFilter);
        }

        // Aplicar paginación local
        const from = (currentPageActive - 1) * itemsPerPage;
        const to = from + itemsPerPage;
        const paginatedData = filteredData.slice(from, to);

        return {
          items: paginatedData,
          count: filteredData.length
        };
      }

      // Sin búsqueda, usar paginación normal del servidor
      const from = (currentPageActive - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      
      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      // Get all unique entity IDs to fetch project names
      const entityIds = [...new Set(data.map(item => item.propiedades?.id_entidad_relacionada_dueno).filter(Boolean))];
      
      let entitiesData: any[] = [];
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

      const items = data.map((item: any) => {
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

      // Filter by project on client-side as it's a derived field
      const filteredItems = proyectoFilter && proyectoFilter !== "all" 
        ? items.filter(item => item.proyecto_nombre === proyectoFilter)
        : items;

      return { items: filteredItems, count: count || 0 };
    },
    staleTime: 5 * 60 * 1000,
  });

  // Query para obtener bodegas eliminadas
  const { data: deletedData, isLoading: isLoadingDeleted } = useQuery({
    queryKey: ['bodegas', 'deleted', currentPageDeleted, searchTerm, proyectoFilter],
    queryFn: async () => {
      let query = supabase
        .from('bodegas')
        .select(`
          *,
          propiedades!fk_bodegas_propiedad(
            numero_propiedad,
            id_entidad_relacionada_dueno
          )
        `, { count: 'exact' })
        .eq('activo', false)
        .order('id', { ascending: false });

      // Si hay búsqueda, obtenemos más resultados para filtrar localmente
      if (searchTerm) {
        const { data: allData, error } = await query.range(0, 999);
        
        if (error) throw error;

        // Obtener nombres de proyecto para TODOS los datos
        const entityIds = [...new Set(allData.map(item => item.propiedades?.id_entidad_relacionada_dueno).filter(Boolean))];
        
        let entitiesData: any[] = [];
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

        // Enriquecer TODOS los datos con nombres de proyecto
        const enrichedData = allData.map((item: any) => {
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

        // Filtrar localmente por nombre de bodega o número de departamento
        let filteredData = enrichedData.filter(item => {
          const matchesNombre = item.nombre?.toLowerCase().includes(searchTerm.toLowerCase());
          const matchesNumero = item.numero_propiedad?.toLowerCase().includes(searchTerm.toLowerCase());
          return matchesNombre || matchesNumero;
        });

        // Aplicar filtro de proyecto si existe
        if (proyectoFilter && proyectoFilter !== "all") {
          filteredData = filteredData.filter(item => item.proyecto_nombre === proyectoFilter);
        }

        // Aplicar paginación local
        const from = (currentPageDeleted - 1) * itemsPerPage;
        const to = from + itemsPerPage;
        const paginatedData = filteredData.slice(from, to);

        return {
          items: paginatedData,
          count: filteredData.length
        };
      }

      // Sin búsqueda, usar paginación normal del servidor
      const from = (currentPageDeleted - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      
      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      // Get all unique entity IDs to fetch project names
      const entityIds = [...new Set(data.map(item => item.propiedades?.id_entidad_relacionada_dueno).filter(Boolean))];
      
      let entitiesData: any[] = [];
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

      const items = data.map((item: any) => {
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

      // Filter by project on client-side as it's a derived field
      const filteredItems = proyectoFilter && proyectoFilter !== "all" 
        ? items.filter(item => item.proyecto_nombre === proyectoFilter)
        : items;

      return { items: filteredItems, count: count || 0 };
    },
    staleTime: 5 * 60 * 1000,
  });

  const filteredBodegas = activeTab === 'activos' ? activeData?.items || [] : deletedData?.items || [];
  const currentCount = activeTab === 'activos' ? activeData?.count || 0 : deletedData?.count || 0;
  const totalPages = Math.ceil(currentCount / itemsPerPage);
  const currentPage = activeTab === 'activos' ? currentPageActive : currentPageDeleted;
  const setCurrentPage = (page: number) => {
    if (activeTab === 'activos') {
      setCurrentPageActive(page);
    } else {
      setCurrentPageDeleted(page);
    }
  };
  const isLoading = isLoadingActive || isLoadingDeleted;

  // Totals for tabs
  const activosCount = activeData?.count || 0;
  const eliminadosCount = deletedData?.count || 0;

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

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  // Maintain focus on search input after re-render
  useEffect(() => {
    if (inputValue && searchInputRef.current && !isLoading) {
      searchInputRef.current.focus();
    }
  }, [isLoading, inputValue]);

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

  const handleUpdate = async (id: number, data: Partial<Bodega>) => {
    try {
      // Exclude readonly fields  
      const { id: _, proyecto_nombre, numero_propiedad, activo, ...updateData } = data;
      
      const { error } = await supabase
        .from('bodegas')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Bodega actualizada",
        description: "Los cambios se han guardado correctamente.",
      });

      queryClient.invalidateQueries({ queryKey: ['bodegas'] });
      setEditingBodega(null);
    } catch (error) {
      console.error('Error updating bodega:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la bodega.",
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

  // Filtrado optimizado del lado del servidor con paginación

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
                  ref={searchInputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Proyecto</label>
              <Combobox
                value={proyectoFilter || "all"}
                onValueChange={setProyectoFilter}
                options={[
                  { value: "all", label: "Todos los proyectos" },
                  ...proyectos.map((proyecto) => ({
                    value: proyecto.nombre,
                    label: proyecto.nombre,
                  })),
                ]}
                placeholder="Seleccionar proyecto"
                searchPlaceholder="Buscar proyecto..."
                emptyText="No se encontró el proyecto"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="activos">Bodegas Activas ({activosCount})</TabsTrigger>
          <TabsTrigger value="eliminados">Bodegas Eliminadas ({eliminadosCount})</TabsTrigger>
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
                        <TableCell>{highlightText(bodega.numero_propiedad || "", searchTerm)}</TableCell>
                        <TableCell>{highlightText(bodega.nombre, searchTerm)}</TableCell>
                        <TableCell>{bodega.m2} m²</TableCell>
                        <TableCell>
                          <Badge variant={bodega.es_incluido ? "default" : "secondary"}>
                            {bodega.es_incluido ? "Sí" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell>{bodega.ubicacion || "N/A"}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setEditingBodega(bodega)}
                            >
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

              {totalPages > 1 && (
                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationPrevious 
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} 
                      className="cursor-pointer"
                    />
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationNext 
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      className="cursor-pointer"
                    />
                  </PaginationContent>
                </Pagination>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="eliminados" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bodegas Eliminadas ({eliminadosCount})</CardTitle>
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
                        <TableCell>{highlightText(bodega.numero_propiedad || "", searchTerm)}</TableCell>
                        <TableCell>{highlightText(bodega.nombre, searchTerm)}</TableCell>
                        <TableCell>{bodega.m2} m²</TableCell>
                        <TableCell>
                          <Badge variant={bodega.es_incluido ? "default" : "secondary"}>
                            {bodega.es_incluido ? "Sí" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell>{bodega.ubicacion || "N/A"}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Undo2 className="h-4 w-4" />
                                  Restaurar
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Restaurar bodega?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Esta acción reactivará la bodega.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => handleRestore(bodega.id)}
                                    className="bg-green-600 text-white hover:bg-green-700"
                                  >
                                    Restaurar
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

              {totalPages > 1 && (
                <Pagination className="mt-4">
                  <PaginationContent>
                    <PaginationPrevious 
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} 
                      className="cursor-pointer"
                    />
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <PaginationItem key={page}>
                        <PaginationLink
                          onClick={() => setCurrentPage(page)}
                          isActive={currentPage === page}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationNext 
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      className="cursor-pointer"
                    />
                  </PaginationContent>
                </Pagination>
              )}
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
      <EditBodegaDialog
        bodega={editingBodega}
        open={!!editingBodega}
        onClose={() => setEditingBodega(null)}
        onSave={handleUpdate}
      />
    </div>
  );
};

export default Bodegas;