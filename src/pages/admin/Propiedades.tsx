import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Edit, Trash2, Upload, Plus } from "lucide-react";
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
import { EditPropertyDialog } from "@/components/admin/EditPropertyDialog";
import { BulkUploadPropertiesDialog } from "@/components/admin/BulkUploadPropertiesDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Property {
  id: number;
  numero_propiedad: string;
  numero_piso: number;
  m2_reales: number;
  precio_lista: number;
  clabe_stp_tmp_apartado: string | null;
  activo: boolean;
  es_aprobado: boolean;
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
  // Nueva propiedad para verificar si tiene ofertas
  tieneOfertas: boolean;
}

const Propiedades = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("activos");
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [selectedProperties, setSelectedProperties] = useState<number[]>([]);
  
  // Filtros de texto
  const [proyectoFilter, setProyectoFilter] = useState("");
  const [modeloFilter, setModeloFilter] = useState("");
  const [recamarasFilter, setRecamarasFilter] = useState("");
  const [banosFilter, setBanosFilter] = useState("");
  const [disponibilidadFilter, setDisponibilidadFilter] = useState("");
  
  // Paginación
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageDraft, setCurrentPageDraft] = useState(1);
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
          es_aprobado,
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
          estatus_disponibilidad!inner(nombre),
          ofertas!ofertas_id_propiedad_fkey(id)
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
        es_aprobado: property.es_aprobado,
        propietario: property.entidades_relacionadas?.personas?.nombre_legal || 'Sin propietario',
        proyecto: property.edificios_modelos?.edificios?.proyectos?.nombre || 'Sin proyecto',
        edificio: property.edificios_modelos?.edificios?.nombre || 'Sin edificio',
        modelo: property.edificios_modelos?.modelos?.nombre || 'Sin modelo',
        vista: property.vistas?.nombre || 'Sin vista',
        disponibilidad: property.estatus_disponibilidad?.nombre || 'Sin estatus',
        tieneOfertas: property.ofertas && property.ofertas.length > 0,
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

  // Filtrar propiedades por pestaña
  const getPropertiesByTab = (properties: Property[], tab: string) => {
    switch (tab) {
      case "activos":
        return properties.filter(p => p.activo && p.es_aprobado);
      case "draft":
        return properties.filter(p => p.activo && !p.es_aprobado);
      case "eliminados":
        return properties.filter(p => !p.activo && !p.es_aprobado);
      default:
        return [];
    }
  };

  // Filtrar propiedades
  const filteredProperties = properties?.filter(property => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = searchTerm === "" || 
      property.numero_propiedad.toString().includes(searchTerm) ||
      property.numero_propiedad.toLowerCase().includes(searchLower) ||
      property.propietario.toLowerCase().includes(searchLower) ||
      property.proyecto.toLowerCase().includes(searchLower) ||
      property.edificio.toLowerCase().includes(searchLower) ||
      property.modelo.toLowerCase().includes(searchLower);
    
    const matchesProyecto = proyectoFilter === "" || property.proyecto.toLowerCase().includes(proyectoFilter.toLowerCase());
    const matchesModelo = modeloFilter === "" || property.modelo.toLowerCase().includes(modeloFilter.toLowerCase());
    
    const matchesRecamaras = recamarasFilter === "" || property.configuracion_modelo.numero_recamaras.toString().includes(recamarasFilter);
    const matchesBanos = banosFilter === "" || property.configuracion_modelo.numero_completo_banos.toString().includes(banosFilter);
    
    const matchesDisponibilidad = disponibilidadFilter === "" || property.disponibilidad.toLowerCase().includes(disponibilidadFilter.toLowerCase());
    
    return matchesSearch && matchesProyecto && matchesModelo && matchesRecamaras && matchesBanos && matchesDisponibilidad;
  }) || [];

  // Separar propiedades por pestaña
  const activeProperties = getPropertiesByTab(filteredProperties, "activos");
  const draftProperties = getPropertiesByTab(filteredProperties, "draft");
  const inactiveProperties = getPropertiesByTab(filteredProperties, "eliminados");

  // Paginación para propiedades activas
  const totalActivePage = Math.ceil(activeProperties.length / itemsPerPage);
  const startIndexActive = (currentPageActive - 1) * itemsPerPage;
  const endIndexActive = startIndexActive + itemsPerPage;
  const paginatedActiveProperties = activeProperties.slice(startIndexActive, endIndexActive);

  // Paginación para propiedades draft
  const totalDraftPage = Math.ceil(draftProperties.length / itemsPerPage);
  const startIndexDraft = (currentPageDraft - 1) * itemsPerPage;
  const endIndexDraft = startIndexDraft + itemsPerPage;
  const paginatedDraftProperties = draftProperties.slice(startIndexDraft, endIndexDraft);

  // Paginación para propiedades inactivas
  const totalInactivePage = Math.ceil(inactiveProperties.length / itemsPerPage);
  const startIndexInactive = (currentPageInactive - 1) * itemsPerPage;
  const endIndexInactive = startIndexInactive + itemsPerPage;
  const paginatedInactiveProperties = inactiveProperties.slice(startIndexInactive, endIndexInactive);

  const handleDelete = async (propertyId: number) => {
    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ activo: false, es_aprobado: false })
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
        .update({ activo: true, es_aprobado: false })
        .eq('id', propertyId);

      if (error) throw error;

      toast({
        title: "Propiedad restaurada",
        description: "La propiedad se ha reactivado correctamente y está en Draft.",
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

  const handleApprove = async (propertyId: number) => {
    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ es_aprobado: true })
        .eq('id', propertyId);

      if (error) throw error;

      toast({
        title: "Propiedad aprobada",
        description: "La propiedad se ha aprobado correctamente.",
      });

      queryClient.invalidateQueries({ queryKey: ['properties-detailed'] });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo aprobar la propiedad.",
        variant: "destructive",
      });
    }
  };

  const handleBulkApprove = async () => {
    if (selectedProperties.length === 0) return;

    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ es_aprobado: true })
        .in('id', selectedProperties);

      if (error) throw error;

      toast({
        title: "Propiedades aprobadas",
        description: `${selectedProperties.length} propiedades han sido aprobadas correctamente.`,
      });

      setSelectedProperties([]);
      queryClient.invalidateQueries({ queryKey: ['properties-detailed'] });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron aprobar las propiedades seleccionadas.",
        variant: "destructive",
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedProperties.length === 0) return;

    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ activo: false, es_aprobado: false })
        .in('id', selectedProperties);

      if (error) throw error;

      toast({
        title: "Propiedades eliminadas",
        description: `${selectedProperties.length} propiedades han sido eliminadas correctamente.`,
      });

      setSelectedProperties([]);
      queryClient.invalidateQueries({ queryKey: ['properties-detailed'] });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron eliminar las propiedades seleccionadas.",
        variant: "destructive",
      });
    }
  };

  const handleApproveAllVisible = async () => {
    if (draftProperties.length === 0) return;

    try {
      const propertyIds = draftProperties.map(p => p.id);
      const { error } = await supabase
        .from('propiedades')
        .update({ es_aprobado: true })
        .in('id', propertyIds);

      if (error) throw error;

      toast({
        title: "Propiedades aprobadas",
        description: `${draftProperties.length} propiedades han sido aprobadas correctamente.`,
      });

      setSelectedProperties([]);
      queryClient.invalidateQueries({ queryKey: ['properties-detailed'] });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudieron aprobar todas las propiedades visibles.",
        variant: "destructive",
      });
    }
  };

  const handleSelectProperty = (propertyId: number) => {
    setSelectedProperties(prev => 
      prev.includes(propertyId) 
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handleSelectAll = (properties: Property[]) => {
    const currentTabProperties = properties.map(p => p.id);
    const allSelected = currentTabProperties.every(id => selectedProperties.includes(id));
    
    if (allSelected) {
      setSelectedProperties(prev => prev.filter(id => !currentTabProperties.includes(id)));
    } else {
      setSelectedProperties(prev => [...new Set([...prev, ...currentTabProperties])]);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const formatConfiguracion = (config: Property['configuracion_modelo']) => {
    return (
      <div className="text-sm">
        <div>{config.numero_recamaras} rec,</div>
        <div>{config.numero_completo_banos} baños,</div>
        <div>{config.numero_medio_bano} 1/2 baños</div>
      </div>
    );
  };

  const formatPrecioPorM2 = (precioLista: number, m2Reales: number) => {
    if (m2Reales === 0) return 'N/A';
    return formatCurrency(precioLista / m2Reales);
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

  const renderPropertiesTable = (propertiesToRender: Property[], tabType: string) => (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {tabType === "draft" && (
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={propertiesToRender.length > 0 && propertiesToRender.every(p => selectedProperties.includes(p.id))}
                    onChange={() => handleSelectAll(propertiesToRender)}
                    className="rounded"
                  />
                </TableHead>
              )}
              <TableHead>Proyecto</TableHead>
              <TableHead>Propietario</TableHead>
              <TableHead>Edificio</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>No. Departamento</TableHead>
              <TableHead>Piso</TableHead>
              <TableHead>Vista</TableHead>
              <TableHead>M2</TableHead>
              <TableHead>Configuración</TableHead>
              <TableHead>Precio de Lista</TableHead>
              <TableHead>Precio por M2</TableHead>
              <TableHead>Ofertas Comerciales</TableHead>
              <TableHead>Disponibilidad</TableHead>
              <TableHead>Colección Vinculada</TableHead>
              <TableHead>Cuenta Clabe</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {propertiesToRender.length === 0 ? (
              <TableRow>
                <TableCell colSpan={tabType === "draft" ? 17 : 16} className="text-center py-6">
                  {searchTerm || proyectoFilter || modeloFilter || recamarasFilter || banosFilter || disponibilidadFilter 
                    ? "No se encontraron resultados." 
                    : tabType === "eliminados"
                      ? "No hay propiedades eliminadas." 
                      : tabType === "draft"
                        ? "No hay propiedades en draft."
                        : "No hay propiedades activas."
                  }
                </TableCell>
              </TableRow>
            ) : (
              propertiesToRender.map((property) => (
                <TableRow key={property.id} className={tabType === "eliminados" ? "opacity-60" : ""}>
                  {tabType === "draft" && (
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedProperties.includes(property.id)}
                        onChange={() => handleSelectProperty(property.id)}
                        className="rounded"
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{property.proyecto}</TableCell>
                  <TableCell>{property.propietario}</TableCell>
                  <TableCell>{property.edificio}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{property.modelo}</Badge>
                  </TableCell>
                  <TableCell>{property.numero_propiedad}</TableCell>
                  <TableCell>{property.numero_piso}</TableCell>
                  <TableCell>{property.vista}</TableCell>
                  <TableCell>{property.m2_reales} m²</TableCell>
                  <TableCell className="text-sm">{formatConfiguracion(property.configuracion_modelo)}</TableCell>
                  <TableCell>{formatCurrency(property.precio_lista)}</TableCell>
                  <TableCell>{formatPrecioPorM2(property.precio_lista, property.m2_reales)}</TableCell>
                  <TableCell>
                    <Badge variant={property.tieneOfertas ? "default" : "outline"}>
                      {property.tieneOfertas ? "Sí" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{property.disponibilidad}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">N/A</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{property.clabe_stp_tmp_apartado || 'Sin CLABE'}</TableCell>
                  <TableCell>
                    {tabType === "eliminados" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(property.id)}
                        className="h-8 px-2 text-xs text-green-600 hover:text-green-700"
                      >
                        Restaurar
                      </Button>
                    ) : tabType === "draft" ? (
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleApprove(property.id)}
                          className="h-8 px-2 text-xs text-green-600 hover:text-green-700"
                        >
                          Aprobar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setEditingProperty(property)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              disabled={property.tieneOfertas}
                              title={property.tieneOfertas ? "No se puede eliminar una propiedad con ofertas asociadas" : "Eliminar propiedad"}
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
                    ) : (
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setEditingProperty(property)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              disabled={property.tieneOfertas}
                              title={property.tieneOfertas ? "No se puede eliminar una propiedad con ofertas asociadas" : "Eliminar propiedad"}
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
        <div className="flex gap-2">
          <Button
            onClick={() => setBulkUploadOpen(true)}
            variant="outline"
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Carga Masiva
          </Button>
          <NewPropertyDialog onPropertyAdded={handlePropertyAdded} />
        </div>
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-muted/50 rounded-lg">
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
                <label className="text-sm font-medium mb-2 block">Recámaras</label>
                <Input
                  placeholder="Ej: 2, 3..."
                  value={recamarasFilter}
                  onChange={(e) => setRecamarasFilter(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Baños</label>
                <Input
                  placeholder="Ej: 1, 2..."
                  value={banosFilter}
                  onChange={(e) => setBanosFilter(e.target.value)}
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="activos">
                Activos ({activeProperties.length})
              </TabsTrigger>
              <TabsTrigger value="draft">
                Draft ({draftProperties.length})
              </TabsTrigger>
              <TabsTrigger value="eliminados">
                Eliminados ({inactiveProperties.length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="activos" className="mt-4">
              {renderPropertiesTable(paginatedActiveProperties, "activos")}
              {renderPagination(currentPageActive, totalActivePage, setCurrentPageActive)}
            </TabsContent>

            <TabsContent value="draft" className="mt-4">
              <div className="mb-4 flex flex-wrap gap-2">
                {draftProperties.length > 0 && (
                  <Button onClick={handleApproveAllVisible} variant="default" className="bg-green-600 hover:bg-green-700">
                    Aprobar Todas las Visibles ({draftProperties.length})
                  </Button>
                )}
                {selectedProperties.length > 0 && (
                  <>
                    <Button onClick={handleBulkApprove} variant="outline">
                      Aprobar Seleccionadas ({selectedProperties.length})
                    </Button>
                    <Button onClick={handleBulkDelete} variant="destructive">
                      Eliminar Seleccionadas ({selectedProperties.length})
                    </Button>
                  </>
                )}
              </div>
              {renderPropertiesTable(paginatedDraftProperties, "draft")}
              {renderPagination(currentPageDraft, totalDraftPage, setCurrentPageDraft)}
            </TabsContent>

            <TabsContent value="eliminados" className="mt-4">
              {renderPropertiesTable(paginatedInactiveProperties, "eliminados")}
              {renderPagination(currentPageInactive, totalInactivePage, setCurrentPageInactive)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <BulkUploadPropertiesDialog 
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['properties-detailed'] });
          toast({
            title: "Éxito", 
            description: "Las propiedades se han cargado correctamente.",
          });
        }}
      />

      {editingProperty && (
        <EditPropertyDialog
          property={{
            id: editingProperty.id,
            dueño: editingProperty.propietario,
            numero_propiedad: editingProperty.numero_propiedad,
            numero_piso: editingProperty.numero_piso,
            m2_reales: editingProperty.m2_reales,
            precio_lista: editingProperty.precio_lista,
            clabe_stp: editingProperty.clabe_stp_tmp_apartado || '',
            vista: editingProperty.vista,
            transaccion: '', // Se obtendrá del componente
            tipo_propiedad: '', // Se obtendrá del componente
            disponibilidad: editingProperty.disponibilidad,
            activo: editingProperty.activo
          }}
          onClose={() => setEditingProperty(null)}
          onSuccess={() => {
            setEditingProperty(null);
            queryClient.invalidateQueries({ queryKey: ['properties-detailed'] });
          }}
        />
      )}
    </div>
  );
};

export default Propiedades;