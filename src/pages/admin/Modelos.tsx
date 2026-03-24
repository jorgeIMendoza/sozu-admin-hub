import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
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
import { Search, Edit, Home, Trash2, Eye, ChevronDown, ChevronRight, X, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NewModeloDialog } from "@/components/admin/NewModeloDialog";
import { EditModeloDialog } from "@/components/admin/EditModeloDialog";
import { ModelMultimediaSection } from "@/components/admin/ModelMultimediaSection";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { NoProjectAccess } from "@/components/admin/NoProjectAccess";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface Modelo {
  id: number;
  nombre: string;
  descripcion?: string;
  numero_recamaras?: number;
  numero_completo_banos?: number;
  numero_medio_bano?: number;
  id_proyecto?: number | null;
  plano_arquitectonico?: string | null;
}

interface Proyecto {
  id: number;
  nombre: string;
}

export default function Modelos() {
  const { canCreate, canUpdate, canDelete, canApprove, isSuperAdmin, isLoading: permissionsLoading } = 
    usePagePermissions('/admin/modelos');
  
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "deleted">("active");
  const [modeloToDelete, setModeloToDelete] = useState<Modelo | null>(null);
  const [selectedModelForMultimedia, setSelectedModelForMultimedia] = useState<Modelo | null>(null);
  const [isMultimediaDialogOpen, setIsMultimediaDialogOpen] = useState(false);
  const [selectedDescripcion, setSelectedDescripcion] = useState<{ nombre: string; descripcion: string } | null>(null);
  const [selectedProyectoFilter, setSelectedProyectoFilter] = useState<number[]>([]);
  const [isProjectFilterOpen, setIsProjectFilterOpen] = useState(false);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  
  // Pagination states
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1);
  const itemsPerPage = 50;
  
  const { toast } = useToast();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { registrarEliminacion, registrarRestauracion } = useActivityLogger();
  
  // Project access control
  const { accessibleProjectIds, hasUnrestrictedAccess, isLoading: isLoadingAccess, hasNoAccess } = useProjectAccess();
  
  const showDeletedTab = canDelete || isSuperAdmin;

  useEffect(() => {
    if (!isLoadingAccess) {
      fetchProyectos();
    }
  }, [isLoadingAccess, hasUnrestrictedAccess, accessibleProjectIds]);

  // Debounce search input to prevent focus loss
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(inputValue);
      // Reset to page 1 when search changes
      setCurrentPageActive(1);
      setCurrentPageDeleted(1);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  const fetchProyectos = async () => {
    try {
      let query = supabase
        .from('proyectos')
        .select('id, nombre')
        .eq('activo', true)
        .not("id_tipo_uso", "in", "(9,10,11)")
        .order('nombre', { ascending: true });

      // Apply project access filter for non-admin users
      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        query = query.in('id', accessibleProjectIds);
      }

      const { data, error } = await query;

      if (error) throw error;
      setProyectos(data || []);
    } catch (error) {
      console.error('Error fetching proyectos:', error);
    }
  };

  const { data: modelosActivosData, isLoading: loadingActivos, refetch: refetchActivos } = useQuery({
    queryKey: ["modelos", "active", currentPageActive, searchTerm, selectedProyectoFilter, accessibleProjectIds],
    queryFn: async () => {
      // If user has no access and is not admin, return empty
      if (hasNoAccess) {
        return { modelos: [], count: 0 };
      }

      const from = (currentPageActive - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from("modelos")
        .select("id, nombre, descripcion, numero_recamaras, numero_completo_banos, numero_medio_bano, id_proyecto, activo, plano_arquitectonico, url_imagen_portada", { count: 'exact' })
        .eq("activo", true);

      // Apply project access filter for non-admin users
      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        query = query.in("id_proyecto", accessibleProjectIds);
      }

      // Apply filters
      if (searchTerm) {
        query = query.or(`nombre.ilike.%${searchTerm}%,descripcion.ilike.%${searchTerm}%`);
      }
      if (selectedProyectoFilter.length > 0) {
        query = query.in("id_proyecto", selectedProyectoFilter);
      }

      const { data, error, count } = await query
        .order("nombre")
        .range(from, to);

      if (error) {
        console.error("Error fetching modelos activos:", error);
        return { modelos: [], count: 0 };
      }

      return { modelos: (data || []) as Modelo[], count: count || 0 };
    },
    enabled: !isLoadingAccess,
  });

  const { data: modelosEliminadosData, isLoading: loadingEliminados, refetch: refetchEliminados } = useQuery({
    queryKey: ["modelos", "deleted", currentPageDeleted, searchTerm, selectedProyectoFilter],
    queryFn: async () => {
      const from = (currentPageDeleted - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from("modelos")
        .select("id, nombre, descripcion, numero_recamaras, numero_completo_banos, numero_medio_bano, id_proyecto, activo, plano_arquitectonico, url_imagen_portada", { count: 'exact' })
        .eq("activo", false);

      // Apply filters
      if (searchTerm) {
        query = query.or(`nombre.ilike.%${searchTerm}%,descripcion.ilike.%${searchTerm}%`);
      }
      if (selectedProyectoFilter.length > 0) {
        query = query.in("id_proyecto", selectedProyectoFilter);
      }

      const { data, error, count } = await query
        .order("nombre")
        .range(from, to);

      if (error) {
        console.error("Error fetching modelos eliminados:", error);
        return { modelos: [], count: 0 };
      }

      return { modelos: (data || []) as Modelo[], count: count || 0 };
    },
    enabled: activeTab === "deleted",
  });

  const modelosActivos = modelosActivosData?.modelos || [];
  const totalActivosCount = modelosActivosData?.count || 0;
  const modelosEliminados = modelosEliminadosData?.modelos || [];
  const totalEliminadosCount = modelosEliminadosData?.count || 0;

  // Maintain focus on search input after re-render
  useEffect(() => {
    // Restore focus after query completes if user was typing
    if (inputValue && searchInputRef.current && !loadingActivos && !loadingEliminados) {
      searchInputRef.current.focus();
    }
  }, [loadingActivos, loadingEliminados, inputValue]); // Re-run when loading state changes

  const handleModeloAdded = () => {
    refetchActivos();
    setCurrentPageActive(1);
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
      registrarEliminacion('modelo', { id: modelo.id, nombre: modelo.nombre });

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
      registrarRestauracion('modelo',
        { id: modelo.id, activo: false },
        { id: modelo.id, activo: true, nombre: modelo.nombre }
      );

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
  const currentPage = activeTab === "active" ? currentPageActive : currentPageDeleted;
  const totalCount = activeTab === "active" ? totalActivosCount : totalEliminadosCount;
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const setCurrentPage = (page: number) => {
    if (activeTab === "active") {
      setCurrentPageActive(page);
    } else {
      setCurrentPageDeleted(page);
    }
  };

  // Group modelos by project (no additional filtering needed, already filtered by query)
  const filteredModelos = currentModelos;

  const toggleProjectSelection = (projectId: number) => {
    setSelectedProyectoFilter(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
    // Reset to first page when filter changes
    setCurrentPageActive(1);
    setCurrentPageDeleted(1);
  };

  const clearProjectFilters = () => {
    setSelectedProyectoFilter([]);
    setCurrentPageActive(1);
    setCurrentPageDeleted(1);
  };

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

  if (isLoading || isLoadingAccess) {
    return <div>Cargando modelos...</div>;
  }

  // Show no access message if user has no projects assigned
  if (hasNoAccess) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Modelos</h1>
          <p className="text-muted-foreground">
            Administra los modelos de propiedades
          </p>
        </div>
        <NoProjectAccess />
      </div>
    );
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
                ref={searchInputRef}
                placeholder="Buscar modelos..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="pl-10"
              />
            </div>
            <Popover open={isProjectFilterOpen} onOpenChange={setIsProjectFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={isProjectFilterOpen}
                  className="w-[300px] justify-between"
                >
                  {selectedProyectoFilter.length === 0 ? (
                    "Seleccionar proyectos..."
                  ) : selectedProyectoFilter.length === 1 ? (
                    proyectos.find(p => p.id === selectedProyectoFilter[0])?.nombre
                  ) : (
                    `${selectedProyectoFilter.length} proyectos seleccionados`
                  )}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder="Buscar proyecto..." />
                  <CommandList>
                    <CommandEmpty>No se encontraron proyectos.</CommandEmpty>
                    <CommandGroup>
                      {proyectos.map((proyecto) => (
                        <CommandItem
                          key={proyecto.id}
                          onSelect={() => toggleProjectSelection(proyecto.id)}
                        >
                          <Checkbox
                            checked={selectedProyectoFilter.includes(proyecto.id)}
                            className="mr-2"
                          />
                          <span>{proyecto.nombre}</span>
                          <Check
                            className={cn(
                              "ml-auto h-4 w-4",
                              selectedProyectoFilter.includes(proyecto.id) ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
                {selectedProyectoFilter.length > 0 && (
                  <div className="border-t p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={clearProjectFilters}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Limpiar filtros
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
          {(canCreate || isSuperAdmin) && (
            <NewModeloDialog onModeloAdded={handleModeloAdded} proyectos={proyectos} />
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "active" | "deleted")}>
        <TabsList>
          <TabsTrigger value="active">Modelos Activos ({totalActivosCount})</TabsTrigger>
          {showDeletedTab && (
            <TabsTrigger value="deleted">Modelos Eliminados ({totalEliminadosCount})</TabsTrigger>
          )}
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
                                        {(canUpdate || isSuperAdmin) && (
                                          <EditModeloDialog 
                                            modelo={modelo} 
                                            onModeloUpdated={handleModeloUpdated}
                                            proyectos={proyectos}
                                          />
                                        )}
                                        {(canUpdate || isSuperAdmin) && (
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
                                        )}
                                        {(canDelete || isSuperAdmin) && (
                                          <Button 
                                            variant="outline" 
                                            size="sm"
                                            onClick={() => setModeloToDelete(modelo)}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        )}
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
          
          {/* Pagination for active models */}
          {totalPages > 1 && (
            <div className="mt-6">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  
                  {[...Array(Math.min(totalPages, 5))].map((_, idx) => {
                    let pageNumber;
                    if (totalPages <= 5) {
                      pageNumber = idx + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = idx + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + idx;
                    } else {
                      pageNumber = currentPage - 2 + idx;
                    }
                    
                    return (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink
                          onClick={() => setCurrentPage(pageNumber)}
                          isActive={currentPage === pageNumber}
                          className="cursor-pointer"
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  
                  {totalPages > 5 && currentPage < totalPages - 2 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}
                  
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
              <div className="text-center text-sm text-muted-foreground mt-2">
                Página {currentPage} de {totalPages} ({totalCount} modelos en total)
              </div>
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
                                      {(canApprove || isSuperAdmin) && (
                                        <Button 
                                          variant="outline" 
                                          size="sm"
                                          onClick={() => handleRestoreModelo(modelo)}
                                        >
                                          Restaurar
                                        </Button>
                                      )}
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
          
          {/* Pagination for deleted models */}
          {totalPages > 1 && (
            <div className="mt-6">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  
                  {[...Array(Math.min(totalPages, 5))].map((_, idx) => {
                    let pageNumber;
                    if (totalPages <= 5) {
                      pageNumber = idx + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = idx + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + idx;
                    } else {
                      pageNumber = currentPage - 2 + idx;
                    }
                    
                    return (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink
                          onClick={() => setCurrentPage(pageNumber)}
                          isActive={currentPage === pageNumber}
                          className="cursor-pointer"
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  
                  {totalPages > 5 && currentPage < totalPages - 2 && (
                    <PaginationItem>
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}
                  
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
              <div className="text-center text-sm text-muted-foreground mt-2">
                Página {currentPage} de {totalPages} ({totalCount} modelos en total)
              </div>
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