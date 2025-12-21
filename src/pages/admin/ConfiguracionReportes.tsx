import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Plus, Edit, Trash2, FileText, Check, X, PlayCircle, Loader2, CheckCircle2, XCircle, HelpCircle, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface Reporte {
  id: number;
  nombre: string;
  descripcion: string | null;
  query_sql: string;
  filtros_configuracion: unknown[];
  nombre_archivo: string;
  id_submenu: number | null;
  activo: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
}

interface Submenu {
  id: number;
  nombre: string;
  vista_front_end: string;
}

interface FiltroConfig {
  nombre: string;
  label: string;
  tipo: 'select' | 'multiselect' | 'date' | 'daterange' | 'text';
  tabla?: string;
  campo_valor?: string;
  campo_label?: string;
}

export default function ConfiguracionReportes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canRead, canCreate, canUpdate, canDelete, isSuperAdmin, isLoading: permissionsLoading } = usePagePermissions('/admin/configuracion-reportes');
  const { registrarCreacion, registrarActualizacion, registrarEliminacion } = useActivityLogger();

  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReporte, setEditingReporte] = useState<Reporte | null>(null);
  const [activeTab, setActiveTab] = useState<string>("activos");
  
  // Query validation state
  const [isValidatingQuery, setIsValidatingQuery] = useState(false);
  const [queryValidation, setQueryValidation] = useState<{ valid: boolean; message: string; rowCount?: number } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    query_sql: "",
    filtros_configuracion: "[]",
    nombre_archivo: "",
    id_submenu: "",
    activo: true,
  });

  // Fetch reports (including inactive for the deleted tab)
  const { data: reportes = [], isLoading } = useQuery({
    queryKey: ['reportes-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reportes')
        .select('*')
        .order('nombre');
      
      if (error) throw error;
      return data as Reporte[];
    },
  });

  // Fetch submenus for dropdown (only reportes submenus)
  const { data: submenus = [] } = useQuery({
    queryKey: ['submenus-reportes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('submenus')
        .select('id, nombre, vista_front_end')
        .like('vista_front_end', '/admin/reportes/%')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return data as Submenu[];
    },
  });

  // Separate active and inactive reports
  const reportesActivos = useMemo(() => 
    reportes.filter(r => r.activo && (
      r.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.descripcion?.toLowerCase().includes(searchTerm.toLowerCase())
    )), [reportes, searchTerm]);

  const reportesEliminados = useMemo(() => 
    reportes.filter(r => !r.activo && (
      r.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.descripcion?.toLowerCase().includes(searchTerm.toLowerCase())
    )), [reportes, searchTerm]);

  const resetForm = () => {
    setFormData({
      nombre: "",
      descripcion: "",
      query_sql: "",
      filtros_configuracion: "[]",
      nombre_archivo: "",
      id_submenu: "",
      activo: true,
    });
    setEditingReporte(null);
    setQueryValidation(null);
  };

  const openDialog = (reporte?: Reporte) => {
    if (reporte) {
      setEditingReporte(reporte);
      setFormData({
        nombre: reporte.nombre,
        descripcion: reporte.descripcion || "",
        query_sql: reporte.query_sql,
        filtros_configuracion: JSON.stringify(reporte.filtros_configuracion, null, 2),
        nombre_archivo: reporte.nombre_archivo,
        id_submenu: reporte.id_submenu?.toString() || "",
        activo: reporte.activo,
      });
      // Si ya existe el reporte, asumimos que el query es válido
      setQueryValidation({ valid: true, message: "Query existente" });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  // Función para validar el query SQL
  const validateQuery = async () => {
    if (!formData.query_sql.trim()) {
      setQueryValidation({ valid: false, message: "El query no puede estar vacío" });
      return;
    }

    // Validar que inicie con SELECT
    const cleanQueryStart = formData.query_sql.trim().toUpperCase();
    if (!cleanQueryStart.startsWith('SELECT')) {
      setQueryValidation({ 
        valid: false, 
        message: "Solo se permiten consultas SELECT. El query debe iniciar con SELECT."
      });
      return;
    }

    // Validar palabras prohibidas
    const forbiddenKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'TRUNCATE', 'CREATE', 'GRANT', 'REVOKE'];
    const upperQuery = formData.query_sql.toUpperCase();
    const foundForbidden = forbiddenKeywords.find(kw => {
      // Buscar la palabra como token completo (no como parte de otra palabra)
      const regex = new RegExp(`\\b${kw}\\b`);
      return regex.test(upperQuery);
    });
    
    if (foundForbidden) {
      setQueryValidation({ 
        valid: false, 
        message: `Palabra prohibida encontrada: "${foundForbidden}". Solo se permiten consultas SELECT de lectura.`
      });
      return;
    }

    setIsValidatingQuery(true);
    setQueryValidation(null);

    try {
      // Limpiar los placeholders de filtros para la validación
      let cleanQuery = formData.query_sql;
      
      // PRIMERO: Eliminar comentarios SQL (-- hasta fin de línea)
      cleanQuery = cleanQuery.replace(/--.*$/gm, '');
      
      // Remover bloques completos con placeholders como {{AND id = :id_filtro}}
      cleanQuery = cleanQuery.replace(/\{\{[^}]+\}\}/g, '');
      // Reemplazar placeholders sueltos :nombre_filtro con valores de prueba
      cleanQuery = cleanQuery.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '1');
      
      // Normalizar todos los espacios en blanco (incluyendo saltos de línea) a un solo espacio
      cleanQuery = cleanQuery.replace(/\s+/g, ' ').trim();
      
      // DESPUÉS: Limpiar sintaxis SQL rota
      cleanQuery = cleanQuery.replace(/WHERE\s+AND/gi, 'WHERE');
      cleanQuery = cleanQuery.replace(/WHERE\s+OR/gi, 'WHERE');
      cleanQuery = cleanQuery.replace(/AND\s+AND/gi, 'AND');
      cleanQuery = cleanQuery.replace(/OR\s+OR/gi, 'OR');
      cleanQuery = cleanQuery.replace(/AND\s+ORDER/gi, 'ORDER');
      cleanQuery = cleanQuery.replace(/AND\s+GROUP/gi, 'GROUP');
      cleanQuery = cleanQuery.replace(/AND\s+LIMIT/gi, 'LIMIT');
      cleanQuery = cleanQuery.replace(/WHERE\s+ORDER/gi, 'ORDER');
      cleanQuery = cleanQuery.replace(/WHERE\s+GROUP/gi, 'GROUP');
      cleanQuery = cleanQuery.replace(/WHERE\s+LIMIT/gi, 'LIMIT');
      cleanQuery = cleanQuery.replace(/\s+AND\s*$/gi, '');
      cleanQuery = cleanQuery.replace(/\s+OR\s*$/gi, '');
      cleanQuery = cleanQuery.replace(/\s+WHERE\s*$/gi, '');
      cleanQuery = cleanQuery.trim();
      
      // Agregar LIMIT 1 para validación rápida
      if (!cleanQuery.toLowerCase().includes('limit')) {
        cleanQuery = cleanQuery.replace(/;?\s*$/, '') + ' LIMIT 1';
      }

      const { data, error } = await supabase.rpc('execute_safe_query', {
        query_text: cleanQuery,
        max_rows: 1
      });

      if (error) {
        // Parsear mensaje de error para hacerlo más legible
        let errorMessage = error.message || "Error al ejecutar el query";
        
        if (errorMessage.includes('column') || errorMessage.includes('columna')) {
          const match = errorMessage.match(/column "([^"]+)"/i) || errorMessage.match(/columna "([^"]+)"/i);
          if (match) {
            errorMessage = `Error de columna: No existe la columna "${match[1]}". Verifica el nombre de la columna en la tabla.`;
          } else {
            errorMessage = `Error de columna: ${errorMessage}`;
          }
        } else if (errorMessage.includes('relation') || errorMessage.includes('tabla')) {
          const match = errorMessage.match(/relation "([^"]+)"/i);
          if (match) {
            errorMessage = `Error de tabla: No existe la tabla "${match[1]}". Verifica el nombre de la tabla.`;
          } else {
            errorMessage = `Error de tabla: ${errorMessage}`;
          }
        } else if (errorMessage.includes('syntax') || errorMessage.includes('sintaxis')) {
          errorMessage = `Error de sintaxis SQL: ${errorMessage}. Revisa la estructura del query.`;
        } else if (errorMessage.includes('permission') || errorMessage.includes('permiso')) {
          errorMessage = `Error de permisos: No tienes acceso a esta tabla o columna.`;
        } else if (errorMessage.includes('ambiguous')) {
          const match = errorMessage.match(/column reference "([^"]+)" is ambiguous/i);
          if (match) {
            errorMessage = `Columna ambigua: "${match[1]}" existe en múltiples tablas. Usa el formato tabla.columna para especificar.`;
          }
        }
        
        setQueryValidation({ 
          valid: false, 
          message: errorMessage
        });
      } else {
        setQueryValidation({ 
          valid: true, 
          message: "Query válido ✓",
          rowCount: Array.isArray(data) ? data.length : 0
        });
      }
    } catch (error: any) {
      setQueryValidation({ 
        valid: false, 
        message: error.message || "Error desconocido al validar"
      });
    } finally {
      setIsValidatingQuery(false);
    }
  };

  const handleSave = async () => {
    try {
      // Validate JSON
      let parsedFiltros;
      try {
        parsedFiltros = JSON.parse(formData.filtros_configuracion);
      } catch {
        toast({
          title: "Error",
          description: "El campo de filtros debe ser un JSON válido",
          variant: "destructive",
        });
        return;
      }

      const dataToSave = {
        nombre: formData.nombre,
        descripcion: formData.descripcion || null,
        query_sql: formData.query_sql,
        filtros_configuracion: parsedFiltros,
        nombre_archivo: formData.nombre_archivo,
        id_submenu: formData.id_submenu ? parseInt(formData.id_submenu) : null,
        activo: formData.activo,
      };

      if (editingReporte) {
        const { error } = await supabase
          .from('reportes')
          .update(dataToSave)
          .eq('id', editingReporte.id);

        if (error) throw error;

        await registrarActualizacion('reportes', null, { 
          id_reporte: editingReporte.id, 
          nombre: formData.nombre 
        }, 'actualizar_reporte');

        toast({ title: "Éxito", description: "Reporte actualizado correctamente" });
      } else {
        const { data, error } = await supabase
          .from('reportes')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;

        await registrarCreacion('reportes', { 
          id_reporte: data.id, 
          nombre: formData.nombre 
        }, 'crear_reporte');

        toast({ title: "Éxito", description: "Reporte creado correctamente" });
      }

      queryClient.invalidateQueries({ queryKey: ['reportes-config'] });
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving report:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar el reporte",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (reporte: Reporte) => {
    try {
      const { error } = await supabase
        .from('reportes')
        .update({ activo: false })
        .eq('id', reporte.id);

      if (error) throw error;

      await registrarEliminacion('reportes', { 
        id_reporte: reporte.id, 
        nombre: reporte.nombre 
      }, 'eliminar_reporte');

      toast({ title: "Éxito", description: "Reporte eliminado correctamente" });
      queryClient.invalidateQueries({ queryKey: ['reportes-config'] });
    } catch (error) {
      console.error('Error deleting report:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el reporte",
        variant: "destructive",
      });
    }
  };

  const handleReactivar = async (reporte: Reporte) => {
    try {
      const { error } = await supabase
        .from('reportes')
        .update({ activo: true })
        .eq('id', reporte.id);

      if (error) throw error;

      await registrarActualizacion('reportes', null, { 
        id_reporte: reporte.id, 
        nombre: reporte.nombre 
      }, 'reactivar_reporte');

      toast({ title: "Éxito", description: "Reporte reactivado correctamente" });
      queryClient.invalidateQueries({ queryKey: ['reportes-config'] });
    } catch (error) {
      console.error('Error reactivating report:', error);
      toast({
        title: "Error",
        description: "No se pudo reactivar el reporte",
        variant: "destructive",
      });
    }
  };

  if (permissionsLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!canRead && !isSuperAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No tienes permisos para ver esta página.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderReportesTable = (reportesList: Reporte[], isDeletedTab: boolean = false) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Descripción</TableHead>
          <TableHead>Archivo</TableHead>
          <TableHead>Submenú</TableHead>
          {!isDeletedTab && <TableHead>Activo</TableHead>}
          <TableHead className="text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reportesList.map((reporte) => (
          <TableRow key={reporte.id}>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                {reporte.nombre}
              </div>
            </TableCell>
            <TableCell className="max-w-xs truncate">
              {reporte.descripcion || "-"}
            </TableCell>
            <TableCell>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {reporte.nombre_archivo}.csv
              </code>
            </TableCell>
            <TableCell>
              {submenus.find(s => s.id === reporte.id_submenu)?.nombre || "-"}
            </TableCell>
            {!isDeletedTab && (
              <TableCell>
                {reporte.activo ? (
                  <Badge variant="default" className="bg-green-600">
                    <Check className="h-3 w-3 mr-1" /> Activo
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <X className="h-3 w-3 mr-1" /> Inactivo
                  </Badge>
                )}
              </TableCell>
            )}
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                {isDeletedTab ? (
                  // Botón de reactivar para reportes eliminados
                  (canUpdate || isSuperAdmin) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReactivar(reporte)}
                            className="text-green-600 hover:text-green-700"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Reactivar</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                ) : (
                  // Botones normales para reportes activos
                  <>
                    {(canUpdate || isSuperAdmin) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDialog(reporte)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {(canDelete || isSuperAdmin) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar reporte?</AlertDialogTitle>
                            <AlertDialogDescription>
                              ¿Estás seguro de que deseas eliminar el reporte "{reporte.nombre}"? 
                              El reporte se moverá a la pestaña de eliminados y podrás reactivarlo después.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(reporte)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
        {reportesList.length === 0 && (
          <TableRow>
            <TableCell colSpan={isDeletedTab ? 5 : 6} className="text-center py-8 text-muted-foreground">
              {isDeletedTab ? "No hay reportes eliminados" : "No hay reportes configurados"}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Configuración de Reportes</h1>
        {(canCreate || isSuperAdmin) && (
          <Button onClick={() => openDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Reporte
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reportes Configurados</CardTitle>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar reportes..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="activos">
                Activos ({reportesActivos.length})
              </TabsTrigger>
              <TabsTrigger value="eliminados">
                Eliminados ({reportesEliminados.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="activos">
              {renderReportesTable(reportesActivos, false)}
            </TabsContent>
            <TabsContent value="eliminados">
              {renderReportesTable(reportesEliminados, true)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialog for Create/Edit */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingReporte ? "Editar Reporte" : "Nuevo Reporte"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre *</Label>
                <Input
                  id="nombre"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Inventario de Propiedades"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nombre_archivo">Nombre del Archivo *</Label>
                <Input
                  id="nombre_archivo"
                  value={formData.nombre_archivo}
                  onChange={(e) => setFormData({ ...formData, nombre_archivo: e.target.value })}
                  placeholder="inventario_propiedades"
                />
                <p className="text-xs text-muted-foreground">Sin extensión, se añadirá .csv automáticamente</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Input
                id="descripcion"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Descripción del reporte..."
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="query_sql">Query SQL *</Label>
                <Button 
                  type="button"
                  variant="outline" 
                  size="sm"
                  onClick={validateQuery}
                  disabled={isValidatingQuery || !formData.query_sql.trim()}
                  className="gap-2"
                >
                  {isValidatingQuery ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  Validar Query
                </Button>
              </div>
              <Textarea
                id="query_sql"
                value={formData.query_sql}
                onChange={(e) => {
                  setFormData({ ...formData, query_sql: e.target.value });
                  setQueryValidation(null); // Resetear validación al cambiar
                }}
                placeholder="SELECT * FROM tabla WHERE activo = true {{AND id = :id_filtro}}"
                className={`font-mono text-sm min-h-[200px] ${
                  queryValidation?.valid === false ? 'border-destructive' : 
                  queryValidation?.valid === true ? 'border-green-500' : ''
                }`}
              />
              {queryValidation && (
                <div className={`flex items-center gap-2 text-sm ${
                  queryValidation.valid ? 'text-green-600' : 'text-destructive'
                }`}>
                  {queryValidation.valid ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <span className="break-words">{queryValidation.message}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Usa {"{{AND condicion = :nombre_filtro}}"} para filtros dinámicos. Solo se permiten consultas SELECT.
              </p>
            </div>

            {/* Sección de Filtros Mejorada */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label>Configuración de Filtros</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p>Define los filtros que aparecerán en el formulario de generación del reporte.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="ayuda" className="border rounded-lg">
                  <AccordionTrigger className="px-4 text-sm text-muted-foreground hover:no-underline">
                    📚 Documentación: Tipos de Filtros y Ejemplos
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-4 text-sm">
                      <p>Los filtros se definen como un arreglo JSON. Cada filtro tiene estas propiedades:</p>
                      
                      {/* Propiedades comunes */}
                      <div className="bg-muted p-3 rounded-md space-y-1">
                        <p className="font-semibold mb-2">Propiedades comunes:</p>
                        <p><code className="bg-background px-1 rounded">nombre</code>: Nombre del parámetro (debe coincidir con el placeholder en el query)</p>
                        <p><code className="bg-background px-1 rounded">label</code>: Etiqueta que se mostrará al usuario</p>
                        <p><code className="bg-background px-1 rounded">tipo</code>: "select", "multiselect", "date", "daterange" o "text"</p>
                        <p><code className="bg-background px-1 rounded">requerido</code>: (Opcional) true si el filtro es obligatorio</p>
                      </div>

                      {/* SELECT */}
                      <div className="border rounded-lg p-3 space-y-2">
                        <h4 className="font-semibold text-primary">🔽 Tipo: select</h4>
                        <p className="text-muted-foreground">Dropdown de selección única con opciones de una tabla.</p>
                        <pre className="bg-muted p-2 rounded-md font-mono text-xs overflow-x-auto">
{`{
  "nombre": "id_proyecto",
  "label": "Proyecto",
  "tipo": "select",
  "tabla": "proyectos",
  "campo_valor": "id",
  "campo_label": "nombre"
}`}
                        </pre>
                      </div>

                      {/* SELECT CON DEPENDENCIA */}
                      <div className="border rounded-lg p-3 space-y-2">
                        <h4 className="font-semibold text-primary">🔗 Tipo: select con dependencia</h4>
                        <p className="text-muted-foreground">Dropdown que depende de otro filtro. Se habilita cuando el padre tiene valor.</p>
                        <pre className="bg-muted p-2 rounded-md font-mono text-xs overflow-x-auto">
{`{
  "nombre": "id_dueno",
  "label": "Dueño Vendedor",
  "tipo": "select",
  "depende_de": "id_proyecto",
  "query_opciones": "SELECT DISTINCT p.id, p.nombre_legal as nombre FROM personas p JOIN entidades_relacionadas er ON er.id_persona = p.id JOIN propiedades prop ON prop.id_entidad_relacionada_dueno = er.id JOIN edificios_modelos em ON prop.id_edificio_modelo = em.id JOIN edificios e ON em.id_edificio = e.id WHERE e.id_proyecto = :id_proyecto AND p.activo = true"
}`}
                        </pre>
                      </div>

                      {/* DATE */}
                      <div className="border rounded-lg p-3 space-y-2">
                        <h4 className="font-semibold text-primary">📅 Tipo: date</h4>
                        <p className="text-muted-foreground">Selector de fecha única.</p>
                        <pre className="bg-muted p-2 rounded-md font-mono text-xs overflow-x-auto">
{`{
  "nombre": "fecha_corte",
  "label": "Fecha de Corte",
  "tipo": "date",
  "requerido": true
}`}
                        </pre>
                        <p className="text-xs text-muted-foreground">En el query: <code>{"{{AND fecha <= :fecha_corte}}"}</code></p>
                      </div>

                      {/* DATERANGE */}
                      <div className="border rounded-lg p-3 space-y-2">
                        <h4 className="font-semibold text-primary">📆 Tipo: daterange</h4>
                        <p className="text-muted-foreground">Selector de rango de fechas (desde - hasta). Genera dos campos automáticamente.</p>
                        <pre className="bg-muted p-2 rounded-md font-mono text-xs overflow-x-auto">
{`{
  "nombre": "periodo",
  "label": "Período",
  "tipo": "daterange"
}`}
                        </pre>
                        <p className="text-xs text-muted-foreground">
                          Genera dos parámetros: <code>periodo_desde</code> y <code>periodo_hasta</code><br/>
                          En el query: <code>{"{{AND fecha >= :periodo_desde}} {{AND fecha <= :periodo_hasta}}"}</code>
                        </p>
                      </div>

                      {/* TEXT */}
                      <div className="border rounded-lg p-3 space-y-2">
                        <h4 className="font-semibold text-primary">✏️ Tipo: text</h4>
                        <p className="text-muted-foreground">Campo de texto libre para búsqueda.</p>
                        <pre className="bg-muted p-2 rounded-md font-mono text-xs overflow-x-auto">
{`{
  "nombre": "busqueda",
  "label": "Buscar",
  "tipo": "text",
  "placeholder": "Número de propiedad..."
}`}
                        </pre>
                        <p className="text-xs text-muted-foreground">En el query: <code>{"{{AND numero_propiedad ILIKE '%' || :busqueda || '%'}}"}</code></p>
                      </div>

                      {/* MULTISELECT */}
                      <div className="border rounded-lg p-3 space-y-2">
                        <h4 className="font-semibold text-primary">☑️ Tipo: multiselect</h4>
                        <p className="text-muted-foreground">Permite seleccionar múltiples opciones.</p>
                        <pre className="bg-muted p-2 rounded-md font-mono text-xs overflow-x-auto">
{`{
  "nombre": "estatus",
  "label": "Estatus",
  "tipo": "multiselect",
  "tabla": "estatus_disponibilidad",
  "campo_valor": "id",
  "campo_label": "nombre"
}`}
                        </pre>
                        <p className="text-xs text-muted-foreground">En el query: <code>{"{{AND id_estatus IN (:estatus)}}"}</code></p>
                      </div>

                      {/* Ejemplo completo */}
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                        <h4 className="font-semibold mb-2">Ejemplo completo de configuración:</h4>
                        <pre className="bg-muted p-2 rounded-md font-mono text-xs overflow-x-auto">
{`[
  {
    "nombre": "id_proyecto",
    "label": "Proyecto",
    "tipo": "select",
    "tabla": "proyectos",
    "requerido": true
  },
  {
    "nombre": "periodo",
    "label": "Período",
    "tipo": "daterange"
  },
  {
    "nombre": "busqueda",
    "label": "Buscar departamento",
    "tipo": "text"
  }
]`}
                        </pre>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <Textarea
                id="filtros"
                value={formData.filtros_configuracion}
                onChange={(e) => setFormData({ ...formData, filtros_configuracion: e.target.value })}
                placeholder='[]'
                className="font-mono text-sm min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="submenu">Submenú</Label>
                <Select
                  value={formData.id_submenu}
                  onValueChange={(value) => setFormData({ ...formData, id_submenu: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar submenú..." />
                  </SelectTrigger>
                  <SelectContent>
                    {submenus.map((submenu) => (
                      <SelectItem key={submenu.id} value={submenu.id.toString()}>
                        {submenu.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <Switch
                  id="activo"
                  checked={formData.activo}
                  onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
                />
                <Label htmlFor="activo">Activo</Label>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button 
                      onClick={handleSave} 
                      disabled={!formData.nombre || !formData.query_sql || !formData.nombre_archivo || queryValidation?.valid !== true}
                    >
                      {editingReporte ? "Guardar Cambios" : "Crear Reporte"}
                    </Button>
                  </span>
                </TooltipTrigger>
                {queryValidation?.valid !== true && (
                  <TooltipContent>
                    <p>Debes validar el query SQL antes de guardar</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
