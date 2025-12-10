import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2, Eye, RotateCcw, ChevronDown, ChevronRight, X, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { NoProjectAccess } from "@/components/admin/NoProjectAccess";

interface Vista {
  id: number;
  nombre: string;
  url?: string | null;
  id_proyecto?: number | null;
  activo: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

interface Proyecto {
  id: number;
  nombre: string;
}

const vistaFormSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  id_proyecto: z.string().min(1, "El proyecto es requerido"),
  url: z.string().optional(),
});

export default function Vistas() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProyectoFilter, setSelectedProyectoFilter] = useState<number[]>([]);
  const [isProjectFilterOpen, setIsProjectFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("activos");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [selectedVista, setSelectedVista] = useState<Vista | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set());
  const [currentPageActive, setCurrentPageActive] = useState(1);
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1);
  const itemsPerPage = 50;

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Project access control
  const { accessibleProjectIds, hasUnrestrictedAccess, isLoading: isLoadingAccess, hasNoAccess } = useProjectAccess();

  const createForm = useForm<z.infer<typeof vistaFormSchema>>({
    resolver: zodResolver(vistaFormSchema),
    defaultValues: {
      nombre: "",
      url: "",
      id_proyecto: ""
    },
  });

  const editForm = useForm<z.infer<typeof vistaFormSchema>>({
    resolver: zodResolver(vistaFormSchema),
    defaultValues: {
      nombre: "",
      url: "",
      id_proyecto: ""
    },
  });

  useEffect(() => {
    if (!isLoadingAccess) {
      fetchProyectos();
    }
  }, [isLoadingAccess, hasUnrestrictedAccess, accessibleProjectIds]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  // Maintain focus on search input after re-render
  useEffect(() => {
    if (inputValue && searchInputRef.current) {
      searchInputRef.current.focus();
    }
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
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar los proyectos",
      });
    }
  };

  // Query para vistas activas
  const { data: activeData, isLoading: isLoadingActive } = useQuery({
    queryKey: ["vistas", "active", currentPageActive, searchTerm, selectedProyectoFilter, accessibleProjectIds, hasUnrestrictedAccess],
    queryFn: async () => {
      // If no access and no unrestricted access, return empty
      if (!hasUnrestrictedAccess && accessibleProjectIds.length === 0) {
        return { items: [], count: 0 };
      }

      const from = (currentPageActive - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('vistas')
        .select('*', { count: 'exact' })
        .eq('activo', true);

      // Apply project access filter
      if (!hasUnrestrictedAccess) {
        query = query.in('id_proyecto', accessibleProjectIds);
      }

      if (searchTerm) {
        query = query.ilike('nombre', `%${searchTerm}%`);
      }

      if (selectedProyectoFilter.length > 0) {
        query = query.in('id_proyecto', selectedProyectoFilter);
      }

      const { data, error, count } = await query
        .order('id_proyecto', { ascending: true })
        .order('nombre', { ascending: true })
        .range(from, to);

      if (error) throw error;
      return { items: data || [], count: count || 0 };
    },
    enabled: !isLoadingAccess,
  });

  // Query para vistas eliminadas
  const { data: deletedData, isLoading: isLoadingDeleted } = useQuery({
    queryKey: ["vistas", "deleted", currentPageDeleted, searchTerm, selectedProyectoFilter, accessibleProjectIds, hasUnrestrictedAccess],
    queryFn: async () => {
      // If no access and no unrestricted access, return empty
      if (!hasUnrestrictedAccess && accessibleProjectIds.length === 0) {
        return { items: [], count: 0 };
      }

      const from = (currentPageDeleted - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('vistas')
        .select('*', { count: 'exact' })
        .eq('activo', false);

      // Apply project access filter
      if (!hasUnrestrictedAccess) {
        query = query.in('id_proyecto', accessibleProjectIds);
      }

      if (searchTerm) {
        query = query.ilike('nombre', `%${searchTerm}%`);
      }

      if (selectedProyectoFilter.length > 0) {
        query = query.in('id_proyecto', selectedProyectoFilter);
      }

      const { data, error, count } = await query
        .order('id_proyecto', { ascending: true })
        .order('nombre', { ascending: true })
        .range(from, to);

      if (error) throw error;
      return { items: data || [], count: count || 0 };
    },
    enabled: !isLoadingAccess,
  });

  const currentVistas = activeTab === "activos" ? activeData?.items || [] : deletedData?.items || [];
  const currentCount = activeTab === "activos" ? activeData?.count || 0 : deletedData?.count || 0;
  const totalPages = Math.ceil(currentCount / itemsPerPage);
  const currentPage = activeTab === "activos" ? currentPageActive : currentPageDeleted;
  const setCurrentPage = (page: number) => {
    if (activeTab === "activos") {
      setCurrentPageActive(page);
    } else {
      setCurrentPageDeleted(page);
    }
  };
  const loading = isLoadingActive || isLoadingDeleted;

  const handleCreateVista = async (values: z.infer<typeof vistaFormSchema>) => {
    try {
      setIsSubmitting(true);

      // Validar que no exista una vista con el mismo nombre en el mismo proyecto
      const normalizedName = values.nombre.trim().toUpperCase();
      const { data: existingVistas } = await supabase
        .from('vistas')
        .select('id, nombre')
        .eq('id_proyecto', parseInt(values.id_proyecto))
        .eq('activo', true);

      const duplicateFound = existingVistas?.some(
        vista => vista.nombre.trim().toUpperCase() === normalizedName
      );

      if (duplicateFound) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Ya existe una vista con este nombre en el proyecto seleccionado",
        });
        setIsSubmitting(false);
        return;
      }

      const { data, error } = await supabase
        .from('vistas')
        .insert([{
          nombre: values.nombre.trim(),
          url: values.url || null,
          id_proyecto: parseInt(values.id_proyecto),
          activo: true
        }])
        .select()
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["vistas"] });
      setIsCreateDialogOpen(false);
      createForm.reset();
      toast({
        title: "Éxito",
        description: "Vista creada correctamente",
      });
    } catch (error) {
      console.error('Error creating vista:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo crear la vista",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditVista = async (values: z.infer<typeof vistaFormSchema>) => {
    if (!selectedVista) return;

    try {
      setIsSubmitting(true);

      // Validar que no exista otra vista con el mismo nombre en el mismo proyecto
      const normalizedName = values.nombre.trim().toUpperCase();
      const { data: existingVistas } = await supabase
        .from('vistas')
        .select('id, nombre')
        .eq('id_proyecto', parseInt(values.id_proyecto))
        .eq('activo', true)
        .neq('id', selectedVista.id); // Excluir la vista actual

      const duplicateFound = existingVistas?.some(
        vista => vista.nombre.trim().toUpperCase() === normalizedName
      );

      if (duplicateFound) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Ya existe una vista con este nombre en el proyecto seleccionado",
        });
        setIsSubmitting(false);
        return;
      }

      const updateData: any = {
        nombre: values.nombre.trim(),
        id_proyecto: parseInt(values.id_proyecto),
      };

      // Only update URL if there's a change
      if (values.url !== selectedVista.url) {
        updateData.url = values.url || null;
      }

      const { data, error } = await supabase
        .from('vistas')
        .update(updateData)
        .eq('id', selectedVista.id)
        .select()
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["vistas"] });
      setIsEditDialogOpen(false);
      setSelectedVista(null);
      editForm.reset();
      toast({
        title: "Éxito",
        description: "Vista actualizada correctamente",
      });
    } catch (error) {
      console.error('Error updating vista:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo actualizar la vista",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteVista = async () => {
    if (!selectedVista) return;

    try {
      setIsSubmitting(true);
      const { error } = await supabase
        .from('vistas')
        .update({ activo: false })
        .eq('id', selectedVista.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["vistas"] });
      setIsDeleteDialogOpen(false);
      setSelectedVista(null);
      toast({
        title: "Éxito",
        description: "Vista eliminada correctamente",
      });
    } catch (error) {
      console.error('Error deleting vista:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo eliminar la vista",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestoreVista = async () => {
    if (!selectedVista) return;

    try {
      setIsSubmitting(true);
      const { error } = await supabase
        .from('vistas')
        .update({ activo: true })
        .eq('id', selectedVista.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["vistas"] });
      setIsRestoreDialogOpen(false);
      setSelectedVista(null);
      toast({
        title: "Éxito",
        description: "Vista restaurada correctamente",
      });
    } catch (error) {
      console.error('Error restoring vista:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo restaurar la vista",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditDialog = (vista: Vista) => {
    setSelectedVista(vista);
    editForm.reset({
      nombre: vista.nombre,
      url: vista.url || "",
      id_proyecto: vista.id_proyecto?.toString() || ""
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (vista: Vista) => {
    setSelectedVista(vista);
    setIsDeleteDialogOpen(true);
  };

  const openRestoreDialog = (vista: Vista) => {
    setSelectedVista(vista);
    setIsRestoreDialogOpen(true);
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

  const toggleProjectSelection = (projectId: number) => {
    setSelectedProyectoFilter(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const clearProjectFilters = () => {
    setSelectedProyectoFilter([]);
  };

  // Group vistas by project
  const vistasByProject = currentVistas.reduce((acc, vista) => {
    const projectId = vista.id_proyecto || 0; // 0 for vistas without project
    if (!acc[projectId]) {
      acc[projectId] = [];
    }
    acc[projectId].push(vista);
    return acc;
  }, {} as Record<number, Vista[]>);

  const getProyectoNombre = (id?: number | null) => {
    if (!id) return "Sin Proyecto";
    return proyectos.find(p => p.id === id)?.nombre || "Proyecto Desconocido";
  };

  // Counts from server
  const activosCount = activeData?.count || 0;
  const eliminadosCount = deletedData?.count || 0;

  if (loading || isLoadingAccess) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Cargando vistas...</div>
        </div>
      </div>
    );
  }

  // Show no access message if user has no projects assigned
  if (hasNoAccess) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Vistas</h1>
          <p className="text-muted-foreground">
            Administra las vistas disponibles para las propiedades
          </p>
        </div>
        <NoProjectAccess />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Vistas</h1>
          <p className="text-muted-foreground">
            Administra las vistas disponibles para las propiedades
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Vista
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear Nueva Vista</DialogTitle>
              <DialogDescription>
                Ingresa los datos de la nueva vista
              </DialogDescription>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreateVista)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="nombre"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Vista al mar, Vista a la montaña" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="id_proyecto"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proyecto</FormLabel>
                      <FormControl>
                        <Combobox
                          value={field.value}
                          onValueChange={field.onChange}
                          options={proyectos.map((proyecto) => ({
                            value: proyecto.id.toString(),
                            label: proyecto.nombre,
                          }))}
                          placeholder="Selecciona un proyecto"
                          searchPlaceholder="Buscar proyecto..."
                          emptyText="No se encontró el proyecto"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <ImageUploadField
                        label="Imagen de la Vista"
                        value={field.value || ""}
                        onChange={field.onChange}
                        accept="image/*"
                      />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      createForm.reset();
                    }}
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creando..." : "Crear Vista"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="activos">
            Vistas Activas ({activosCount})
          </TabsTrigger>
          <TabsTrigger value="eliminados">
            Vistas Eliminadas ({eliminadosCount})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value={activeTab}>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Eye className="h-6 w-6" />
                <CardTitle className="text-2xl">
                  Vistas {activeTab === "activos" ? "Activas" : "Eliminadas"}
                </CardTitle>
                <Badge variant="secondary" className="text-base px-3 py-1">
                  {currentVistas.length} {currentVistas.length === 1 ? 'vista' : 'vistas'}
                </Badge>
              </div>
              <CardDescription>
                {activeTab === "activos" 
                  ? "Lista de todas las vistas activas en el sistema"
                  : "Lista de todas las vistas eliminadas en el sistema"
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2 mb-6">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar vistas..."
                    ref={searchInputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="pl-8"
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

              <div className="space-y-4">
                {Object.keys(vistasByProject).length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No se encontraron vistas
                  </div>
                ) : (
                  Object.entries(vistasByProject).map(([projectId, projectVistas]) => {
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
                                  <Badge variant="secondary">{projectVistas.length}</Badge>
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
                                       <TableHead>Nombre</TableHead>
                                       <TableHead>Imagen</TableHead>
                                       <TableHead className="text-right">Acciones</TableHead>
                                     </TableRow>
                                   </TableHeader>
                                  <TableBody>
                                     {projectVistas.map((vista) => (
                                       <TableRow key={vista.id}>
                                         <TableCell>{vista.nombre}</TableCell>
                                         <TableCell>
                                          {vista.url ? (
                                            <img 
                                              src={vista.url} 
                                              alt={vista.nombre}
                                              className="w-10 h-10 object-cover rounded-md"
                                              onError={(e) => {
                                                e.currentTarget.src = '/placeholder.svg';
                                              }}
                                            />
                                          ) : (
                                            <span className="text-muted-foreground text-sm">Sin imagen</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <div className="flex items-center justify-end space-x-2">
                                            {activeTab === "activos" ? (
                                              <>
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => openEditDialog(vista)}
                                                >
                                                  <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => openDeleteDialog(vista)}
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </>
                                            ) : (
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openRestoreDialog(vista)}
                                              >
                                                <RotateCcw className="h-4 w-4" />
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
                  })
                )}
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
              <div className="flex items-center gap-2">
                <CardTitle>
                  Vistas Eliminadas
                </CardTitle>
                <Badge variant="secondary" className="text-base px-3 py-1">
                  {eliminadosCount}
                </Badge>
              </div>
              <CardDescription>
                Lista de todas las vistas eliminadas en el sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Buscar por nombre..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Popover open={isProjectFilterOpen} onOpenChange={setIsProjectFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="whitespace-nowrap">
                      Proyectos {selectedProyectoFilter.length > 0 && `(${selectedProyectoFilter.length})`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Buscar proyecto..." />
                      <CommandEmpty>No se encontraron proyectos.</CommandEmpty>
                      <CommandList>
                        <CommandGroup>
                          {proyectos.map((proyecto) => (
                            <CommandItem
                              key={proyecto.id}
                              onSelect={() => {
                                toggleProjectSelection(proyecto.id);
                              }}
                              className="cursor-pointer"
                            >
                              <Checkbox
                                checked={selectedProyectoFilter.includes(proyecto.id)}
                                onCheckedChange={() => toggleProjectSelection(proyecto.id)}
                                className="mr-2"
                              />
                              {proyecto.nombre}
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

              <div className="space-y-4">
                {Object.keys(vistasByProject).length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No se encontraron vistas
                  </div>
                ) : (
                  Object.entries(vistasByProject).map(([projectId, projectVistas]) => {
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
                                  <Badge variant="secondary">{projectVistas.length}</Badge>
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
                                       <TableHead>Nombre</TableHead>
                                       <TableHead>Imagen</TableHead>
                                       <TableHead className="text-right">Acciones</TableHead>
                                     </TableRow>
                                   </TableHeader>
                                  <TableBody>
                                     {projectVistas.map((vista) => (
                                       <TableRow key={vista.id}>
                                         <TableCell>{vista.nombre}</TableCell>
                                         <TableCell>
                                          {vista.url ? (
                                            <img 
                                              src={vista.url} 
                                              alt={vista.nombre}
                                              className="w-10 h-10 object-cover rounded-md"
                                              onError={(e) => {
                                                e.currentTarget.src = '/placeholder.svg';
                                              }}
                                            />
                                          ) : (
                                            <span className="text-muted-foreground text-sm">Sin imagen</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <div className="flex items-center justify-end space-x-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => openRestoreDialog(vista)}
                                            >
                                              <RotateCcw className="h-4 w-4" />
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
                  })
                )}
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

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Vista</DialogTitle>
            <DialogDescription>
              Modifica los datos de la vista
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditVista)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Vista al mar, Vista a la montaña" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="id_proyecto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proyecto</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onValueChange={field.onChange}
                        options={proyectos.map((proyecto) => ({
                          value: proyecto.id.toString(),
                          label: proyecto.nombre,
                        }))}
                        placeholder="Selecciona un proyecto"
                        searchPlaceholder="Buscar proyecto..."
                        emptyText="No se encontró el proyecto"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <ImageUploadField
                      label="Imagen de la Vista"
                      value={field.value || ""}
                      onChange={field.onChange}
                      accept="image/*"
                    />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsEditDialogOpen(false);
                    setSelectedVista(null);
                    editForm.reset();
                  }}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Guardando..." : "Guardar Cambios"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <DeleteConfirmationDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDeleteVista}
        title="Eliminar Vista"
        description={`¿Estás seguro de que deseas eliminar la vista "${selectedVista?.nombre}"? Esta acción se puede deshacer desde la pestaña de eliminados.`}
        isLoading={isSubmitting}
      />

      {/* Restore Dialog */}
      <DeleteConfirmationDialog
        open={isRestoreDialogOpen}
        onOpenChange={setIsRestoreDialogOpen}
        onConfirm={handleRestoreVista}
        title="Restaurar Vista"
        description={`¿Estás seguro de que deseas restaurar la vista "${selectedVista?.nombre}"?`}
        isLoading={isSubmitting}
        actionType="restore"
      />
    </div>
  );
}