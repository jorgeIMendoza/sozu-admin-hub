import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Edit, Trash2 } from "lucide-react";
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
import { NewPropertyDialog } from "@/components/admin/NewPropertyDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Property {
  id: number;
  numero_propiedad: string;
  numero_piso: number;
  m2_reales: number;
  precio_lista: number;
  clabe_stp_tmp_apartado: string | null;
  activo: boolean;
  // Relaciones
  propietario: string;
  proyecto: string;
  edificio: string;
  modelo: string;
  vista: string;
  disponibilidad: string;
  configuracion_modelo: {
    numero_recamaras: number;
    numero_completo_banos: number;
    numero_medio_bano: number;
  };
}

const Propiedades = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("activas");
  
  // Filtros de texto
  const [proyectoFilter, setProyectoFilter] = useState("");
  const [modeloFilter, setModeloFilter] = useState("");
  const [configuracionFilter, setConfiguracionFilter] = useState("");
  const [disponibilidadFilter, setDisponibilidadFilter] = useState("");
  
  // Paginación
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageInactive, setCurrentPageInactive] = useState(1);
  const itemsPerPage = 25;
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: properties, isLoading } = useQuery({
    queryKey: ['properties-detailed'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('propiedades')
        .select(`
          id,
          numero_propiedad,
          numero_piso,
          m2_reales,
          precio_lista,
          clabe_stp_tmp_apartado,
          activo,
          edificios_modelos!inner(
            edificios!edificios_modelos_id_edificio_fkey!inner(
              nombre,
              proyectos!edificios_id_proyecto_fkey!inner(nombre)
            ),
            modelos!edificios_modelos_id_modelo_fkey!inner(
              nombre,
              numero_recamaras,
              numero_completo_banos,
              numero_medio_bano
            )
          ),
          entidades_relacionadas(
            personas!entidades_relacionadas_id_persona_fkey(nombre_legal)
          ),
          vistas(nombre),
          estatus_disponibilidad!inner(nombre)
        `)
        .order('id', { ascending: false });
      
      if (error) {
        console.error('Error fetching properties:', error);
        throw error;
      }
      
      // Transformar los datos para facilitar su uso
      const transformedData = data?.map((property: any) => ({
        id: property.id,
        numero_propiedad: property.numero_propiedad,
        numero_piso: property.numero_piso,
        m2_reales: property.m2_reales,
        precio_lista: property.precio_lista,
        clabe_stp_tmp_apartado: property.clabe_stp_tmp_apartado,
        activo: property.activo,
        propietario: property.entidades_relacionadas?.personas?.nombre_legal || 'Sin propietario',
        proyecto: property.edificios_modelos?.edificios?.proyectos?.nombre || 'Sin proyecto',
        edificio: property.edificios_modelos?.edificios?.nombre || 'Sin edificio',
        modelo: property.edificios_modelos?.modelos?.nombre || 'Sin modelo',
        vista: property.vistas?.nombre || 'Sin vista',
        disponibilidad: property.estatus_disponibilidad?.nombre || 'Sin estatus',
        configuracion_modelo: {
          numero_recamaras: property.edificios_modelos?.modelos?.numero_recamaras || 0,
          numero_completo_banos: property.edificios_modelos?.modelos?.numero_completo_banos || 0,
          numero_medio_bano: property.edificios_modelos?.modelos?.numero_medio_bano || 0,
        }
      })) || [];
      
      return transformedData;
    },
  });

  const { data: availabilityOptions } = useQuery({
    queryKey: ['availability-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estatus_disponibilidad')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Filtrar propiedades
  const filteredProperties = properties?.filter(property => {
    const matchesSearch = 
      property.numero_propiedad.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.propietario.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.proyecto.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.edificio.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.modelo.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTab = activeTab === "activas" ? property.activo : !property.activo;
    
    const matchesProyecto = property.proyecto.toLowerCase().includes(proyectoFilter.toLowerCase());
    const matchesModelo = property.modelo.toLowerCase().includes(modeloFilter.toLowerCase());
    
    const configuracionText = `${property.configuracion_modelo.numero_recamaras} rec, ${property.configuracion_modelo.numero_completo_banos} baños, ${property.configuracion_modelo.numero_medio_bano} medios baños`;
    const matchesConfiguracion = configuracionText.toLowerCase().includes(configuracionFilter.toLowerCase());
    
    const matchesDisponibilidad = property.disponibilidad.toLowerCase().includes(disponibilidadFilter.toLowerCase());
    
    return matchesSearch && matchesTab && matchesProyecto && matchesModelo && matchesConfiguracion && matchesDisponibilidad;
  }) || [];

  // Separar propiedades activas e inactivas
  const activeProperties = filteredProperties.filter(p => p.activo);
  const inactiveProperties = filteredProperties.filter(p => !p.activo);

  // Paginación para propiedades activas
  const totalActivePage = Math.ceil(activeProperties.length / itemsPerPage);
  const startIndexActive = (currentPageActive - 1) * itemsPerPage;
  const endIndexActive = startIndexActive + itemsPerPage;
  const paginatedActiveProperties = activeProperties.slice(startIndexActive, endIndexActive);

  // Paginación para propiedades inactivas
  const totalInactivePage = Math.ceil(inactiveProperties.length / itemsPerPage);
  const startIndexInactive = (currentPageInactive - 1) * itemsPerPage;
  const endIndexInactive = startIndexInactive + itemsPerPage;
  const paginatedInactiveProperties = inactiveProperties.slice(startIndexInactive, endIndexInactive);

  const handleDelete = async (propertyId: number) => {
    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ activo: false })
        .eq('id', propertyId);

      if (error) throw error;

      toast({
        title: "Propiedad eliminada",
        description: "La propiedad se ha marcado como inactiva correctamente.",
      });

      queryClient.invalidateQueries({ queryKey: ['properties-detailed'] });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar la propiedad.",
        variant: "destructive",
      });
    }
  };

  const handleRestore = async (propertyId: number) => {
    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ activo: true })
        .eq('id', propertyId);

      if (error) throw error;

      toast({
        title: "Propiedad restaurada",
        description: "La propiedad se ha reactivado correctamente.",
      });

      queryClient.invalidateQueries({ queryKey: ['properties-detailed'] });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo restaurar la propiedad.",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const formatConfiguracion = (config: Property['configuracion_modelo']) => {
    return `${config.numero_recamaras} rec, ${config.numero_completo_banos} baños, ${config.numero_medio_bano} 1/2 baños`;
  };

  const handlePropertyAdded = () => {
    queryClient.invalidateQueries({ queryKey: ['properties-detailed'] });
  };

  const renderPagination = (currentPage: number, totalPages: number, onPageChange: (page: number) => void) => {
    if (totalPages <= 1) return null;

    return (
      <div className="mt-4">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <PaginationItem key={page}>
                <PaginationLink
                  onClick={() => onPageChange(page)}
                  isActive={currentPage === page}
                  className="cursor-pointer"
                >
                  {page}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext 
                onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    );
  };

  const renderPropertiesTable = (propertiesToRender: Property[], isDeleted = false) => (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proyecto</TableHead>
              <TableHead>Propietario</TableHead>
              <TableHead>Edificio</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>No. Departamento</TableHead>
              <TableHead>No. Piso</TableHead>
              <TableHead>Cuenta CLABE</TableHead>
              <TableHead>Vista</TableHead>
              <TableHead>M² Reales</TableHead>
              <TableHead>Configuración</TableHead>
              <TableHead>Precio Lista</TableHead>
              <TableHead>Disponibilidad</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {propertiesToRender.length === 0 ? (
              <TableRow>
                <TableCell colSpan={13} className="text-center py-6">
                  {searchTerm || proyectoFilter || modeloFilter || configuracionFilter || disponibilidadFilter 
                    ? "No se encontraron resultados." 
                    : isDeleted 
                      ? "No hay propiedades eliminadas." 
                      : "No hay propiedades activas."
                  }
                </TableCell>
              </TableRow>
            ) : (
              propertiesToRender.map((property) => (
                <TableRow key={property.id} className={isDeleted ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{property.proyecto}</TableCell>
                  <TableCell>{property.propietario}</TableCell>
                  <TableCell>{property.edificio}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{property.modelo}</Badge>
                  </TableCell>
                  <TableCell>{property.numero_propiedad}</TableCell>
                  <TableCell>{property.numero_piso}</TableCell>
                  <TableCell className="font-mono text-sm">{property.clabe_stp_tmp_apartado || 'Sin CLABE'}</TableCell>
                  <TableCell>{property.vista}</TableCell>
                  <TableCell>{property.m2_reales} m²</TableCell>
                  <TableCell className="text-sm">{formatConfiguracion(property.configuracion_modelo)}</TableCell>
                  <TableCell>{formatCurrency(property.precio_lista)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{property.disponibilidad}</Badge>
                  </TableCell>
                  <TableCell>
                    {isDeleted ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(property.id)}
                        className="h-8 px-2 text-xs text-green-600 hover:text-green-700"
                      >
                        Restaurar
                      </Button>
                    ) : (
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar propiedad?</AlertDialogTitle>
                              <AlertDialogDescription>
                                ¿Estás seguro de que deseas eliminar la propiedad {property.numero_propiedad}? Esta acción se puede revertir posteriormente.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(property.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Cargando propiedades...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Propiedades</h1>
          <p className="text-muted-foreground">
            Gestiona el inventario de propiedades del sistema
          </p>
        </div>
        <NewPropertyDialog onPropertyAdded={handlePropertyAdded} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Propiedades</CardTitle>
          <div className="space-y-4">
            {/* Búsqueda general */}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número de propiedad, propietario, proyecto, edificio o modelo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            
            {/* Filtros específicos */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
              <div>
                <label className="text-sm font-medium mb-2 block">Proyecto</label>
                <Input
                  placeholder="Filtrar por proyecto..."
                  value={proyectoFilter}
                  onChange={(e) => setProyectoFilter(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Modelo</label>
                <Input
                  placeholder="Filtrar por modelo..."
                  value={modeloFilter}
                  onChange={(e) => setModeloFilter(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Configuración</label>
                <Input
                  placeholder="Ej: 2 rec, 1 baño..."
                  value={configuracionFilter}
                  onChange={(e) => setConfiguracionFilter(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Disponibilidad</label>
                <Select value={disponibilidadFilter} onValueChange={setDisponibilidadFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filtrar por disponibilidad..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availabilityOptions?.map((option) => (
                      <SelectItem key={option.id} value={option.nombre}>
                        {option.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="activas">
                Propiedades Activas ({activeProperties.length})
              </TabsTrigger>
              <TabsTrigger value="eliminadas">
                Propiedades Eliminadas ({inactiveProperties.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="activas" className="mt-4">
              {renderPropertiesTable(paginatedActiveProperties, false)}
              {renderPagination(currentPageActive, totalActivePage, setCurrentPageActive)}
            </TabsContent>

            <TabsContent value="eliminadas" className="mt-4">
              {renderPropertiesTable(paginatedInactiveProperties, true)}
              {renderPagination(currentPageInactive, totalInactivePage, setCurrentPageInactive)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Propiedades;