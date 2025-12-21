import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, FileSpreadsheet, CalendarIcon, Table as TableIcon, BarChart3, RefreshCw, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

interface FiltroConfig {
  nombre: string;
  label: string;
  tipo: 'select' | 'multiselect' | 'date' | 'daterange' | 'text';
  tabla?: string;
  campo_valor?: string;
  campo_label?: string;
  opciones?: string[];
  requerido?: boolean;
  depende_de?: string;
  query_opciones?: string;
  placeholder?: string;
}

interface Reporte {
  id: number;
  nombre: string;
  descripcion: string | null;
  filtros_configuracion: FiltroConfig[];
  nombre_archivo: string;
  query_sql: string;
}

// Apply filters to query
function applyFiltersToQuery(querySql: string, filtros: Record<string, string>): string {
  let processedQuery = querySql;

  // Find all placeholders in format {{AND condition}}
  const placeholderRegex = /\{\{([^}]+)\}\}/g;
  let match;
  const matches: { fullMatch: string; condition: string }[] = [];

  while ((match = placeholderRegex.exec(querySql)) !== null) {
    matches.push({ fullMatch: match[0], condition: match[1] });
  }

  for (const { fullMatch, condition } of matches) {
    // Extract the filter name from the condition (e.g., :id_proyecto)
    const filterNameMatch = condition.match(/:(\w+)/);
    if (filterNameMatch) {
      const filterName = filterNameMatch[1];
      const filterValue = filtros[filterName];

      if (filterValue !== undefined && filterValue !== null && filterValue !== '') {
        // Replace the placeholder with the actual condition
        const replacedCondition = condition.replace(`:${filterName}`, String(filterValue));
        processedQuery = processedQuery.replace(fullMatch, replacedCondition);
      } else {
        // Remove the placeholder entirely if no filter value
        processedQuery = processedQuery.replace(fullMatch, '');
      }
    }
  }

  // FIRST: Normalize all whitespace (including newlines) to single spaces
  processedQuery = processedQuery.replace(/\s+/g, ' ').trim();

  // THEN: Clean up SQL syntax after removing placeholders
  processedQuery = processedQuery.replace(/WHERE\s+AND/gi, 'WHERE');
  processedQuery = processedQuery.replace(/WHERE\s+OR/gi, 'WHERE');
  processedQuery = processedQuery.replace(/AND\s+AND/gi, 'AND');
  processedQuery = processedQuery.replace(/OR\s+OR/gi, 'OR');
  processedQuery = processedQuery.replace(/AND\s+ORDER/gi, 'ORDER');
  processedQuery = processedQuery.replace(/AND\s+GROUP/gi, 'GROUP');
  processedQuery = processedQuery.replace(/AND\s+LIMIT/gi, 'LIMIT');
  processedQuery = processedQuery.replace(/WHERE\s+ORDER/gi, 'ORDER');
  processedQuery = processedQuery.replace(/WHERE\s+GROUP/gi, 'GROUP');
  processedQuery = processedQuery.replace(/WHERE\s+LIMIT/gi, 'LIMIT');
  processedQuery = processedQuery.replace(/\s+AND\s*$/gi, '');
  processedQuery = processedQuery.replace(/\s+OR\s*$/gi, '');
  processedQuery = processedQuery.replace(/\s+WHERE\s*$/gi, '');
  processedQuery = processedQuery.trim();

  return processedQuery;
}

export default function ReporteViewer() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnPath = searchParams.get('return') || '/admin/reportes/finanzas';
  const { toast } = useToast();
  const { canExport, isSuperAdmin, isLoading: permissionsLoading } = usePagePermissions(returnPath);
  const { registrarExportacion } = useActivityLogger();

  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');

  // Fetch Real Estate projects IDs
  const { data: realEstateProjectIds = [] } = useQuery({
    queryKey: ['real-estate-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('id_proyecto, personas!entidades_relacionadas_id_persona_fkey(nombre_legal)')
        .eq('id_tipo_entidad', 5)
        .ilike('personas.nombre_legal', '%Real Estate Ventures%');

      if (error) throw error;
      return data?.map(er => er.id_proyecto) || [];
    }
  });

  // Fetch the report with query_sql
  const { data: reporte, isLoading } = useQuery({
    queryKey: ['reporte', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('reportes')
        .select('id, nombre, descripcion, filtros_configuracion, nombre_archivo, query_sql')
        .eq('id', parseInt(id))
        .single();

      if (error) throw error;
      return {
        ...data,
        filtros_configuracion: (data.filtros_configuracion || []) as unknown as FiltroConfig[]
      } as Reporte;
    },
    enabled: !!id,
  });

  // Fetch preview data
  const { data: previewData, isLoading: isLoadingPreview, error: previewError, refetch: refetchPreview } = useQuery({
    queryKey: ['reporte-preview', id, filtros],
    queryFn: async () => {
      if (!reporte?.query_sql) return [];

      const processedQuery = applyFiltersToQuery(reporte.query_sql, filtros);
      
      // Add LIMIT for preview
      let previewQuery = processedQuery;
      if (!previewQuery.toLowerCase().includes('limit')) {
        previewQuery = previewQuery.replace(/;?\s*$/, '') + ' LIMIT 100';
      }

      const { data, error } = await supabase.rpc('execute_safe_query', {
        query_text: previewQuery,
        max_rows: 100
      });

      if (error) throw error;
      return (data as Record<string, unknown>[]) || [];
    },
    enabled: !!reporte?.query_sql,
  });

  // Fetch options for select filters
  const { data: filterOptions = {} } = useQuery({
    queryKey: ['filter-options-viewer', id, filtros, realEstateProjectIds],
    queryFn: async () => {
      if (!reporte) return {};

      const options: Record<string, { value: string; label: string }[]> = {};

      for (const filtro of reporte.filtros_configuracion) {
        if (filtro.tipo === 'daterange' || filtro.tipo === 'date' || filtro.tipo === 'text') continue;

        if (filtro.depende_de && !filtros[filtro.depende_de]) {
          options[filtro.nombre] = [];
          continue;
        }

        if (filtro.tipo === 'select' && filtro.query_opciones && filtro.depende_de) {
          const parentValue = filtros[filtro.depende_de];
          if (parentValue) {
            const query = filtro.query_opciones.replace(`:${filtro.depende_de}`, parentValue);
            const { data } = await supabase.rpc('execute_safe_query', { query_text: query });
            options[filtro.nombre] = ((data as unknown as Record<string, unknown>[]) || []).map((item) => ({
              value: String(item.id),
              label: String(item.nombre_legal || item.nombre),
            }));
          }
        } else if (filtro.tipo === 'select' && filtro.tabla) {
          if (filtro.tabla === 'proyectos' && realEstateProjectIds.length > 0) {
            const { data } = await supabase
              .from('proyectos')
              .select('*')
              .eq('activo', true)
              .in('id', realEstateProjectIds);

            options[filtro.nombre] = ((data as unknown as Record<string, unknown>[]) || []).map((item) => ({
              value: String(item[filtro.campo_valor || 'id']),
              label: String(item[filtro.campo_label || 'nombre']),
            }));
          } else if (filtro.tabla !== 'proyectos') {
            const { data } = await supabase
              .from(filtro.tabla as 'proyectos' | 'estatus_disponibilidad')
              .select('*')
              .eq('activo', true);

            options[filtro.nombre] = ((data as unknown as Record<string, unknown>[]) || []).map((item) => ({
              value: String(item[filtro.campo_valor || 'id']),
              label: String(item[filtro.campo_label || 'nombre']),
            }));
          } else {
            options[filtro.nombre] = [];
          }
        } else if (filtro.tipo === 'select' && filtro.opciones) {
          options[filtro.nombre] = filtro.opciones.map(opt => ({ value: opt, label: opt }));
        }
      }

      return options;
    },
    enabled: !!reporte && realEstateProjectIds.length >= 0,
  });

  const handleFilterChange = (filterName: string, value: string) => {
    const newFiltros = { ...filtros, [filterName]: value };
    
    if (reporte) {
      reporte.filtros_configuracion.forEach(f => {
        if (f.depende_de === filterName) {
          newFiltros[f.nombre] = "";
        }
      });
    }
    
    setFiltros(newFiltros);
  };

  const handleExport = async () => {
    if (!reporte) return;

    setIsExporting(true);
    try {
      const response = await supabase.functions.invoke('exportar-reporte', {
        body: {
          id_reporte: reporte.id,
          filtros,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reporte.nombre_archivo}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      await registrarExportacion('reportes', {
        id_reporte: reporte.id,
        nombre_reporte: reporte.nombre,
        filtros_aplicados: filtros,
      });

      toast({ title: "Éxito", description: "Reporte exportado correctamente" });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Error",
        description: "No se pudo exportar el reporte",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const renderFilterInput = (filtro: FiltroConfig) => {
    const isDisabled = filtro.depende_de && !filtros[filtro.depende_de];

    if (filtro.tipo === 'select') {
      return (
        <Select
          value={filtros[filtro.nombre] || "__all__"}
          onValueChange={(value) => handleFilterChange(filtro.nombre, value === "__all__" ? "" : value)}
          disabled={isDisabled}
        >
          <SelectTrigger className={cn(isDisabled && "opacity-50")}>
            <SelectValue placeholder={isDisabled ? `Selecciona ${reporte?.filtros_configuracion.find(f => f.nombre === filtro.depende_de)?.label || 'el filtro anterior'} primero` : `Seleccionar ${filtro.label.toLowerCase()}...`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {(filterOptions[filtro.nombre] || []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (filtro.tipo === 'date') {
      const selectedDate = filtros[filtro.nombre] ? new Date(filtros[filtro.nombre]) : undefined;
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !filtros[filtro.nombre] && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {filtros[filtro.nombre] 
                ? format(new Date(filtros[filtro.nombre]), "PPP", { locale: es })
                : "Seleccionar fecha..."}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => handleFilterChange(filtro.nombre, date ? format(date, 'yyyy-MM-dd') : '')}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      );
    }

    if (filtro.tipo === 'daterange') {
      const desdeKey = `${filtro.nombre}_desde`;
      const hastaKey = `${filtro.nombre}_hasta`;
      const selectedDesde = filtros[desdeKey] ? new Date(filtros[desdeKey]) : undefined;
      const selectedHasta = filtros[hastaKey] ? new Date(filtros[hastaKey]) : undefined;

      return (
        <div className="flex gap-2">
          <div className="flex-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !filtros[desdeKey] && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filtros[desdeKey] 
                    ? format(new Date(filtros[desdeKey]), "dd/MM/yy", { locale: es })
                    : "Desde"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDesde}
                  onSelect={(date) => handleFilterChange(desdeKey, date ? format(date, 'yyyy-MM-dd') : '')}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !filtros[hastaKey] && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filtros[hastaKey] 
                    ? format(new Date(filtros[hastaKey]), "dd/MM/yy", { locale: es })
                    : "Hasta"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedHasta}
                  onSelect={(date) => handleFilterChange(hastaKey, date ? format(date, 'yyyy-MM-dd') : '')}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      );
    }

    return (
      <Input
        type="text"
        id={filtro.nombre}
        value={filtros[filtro.nombre] || ""}
        onChange={(e) => handleFilterChange(filtro.nombre, e.target.value)}
        placeholder={filtro.placeholder || `Ingresa ${filtro.label.toLowerCase()}...`}
      />
    );
  };

  // Get columns from preview data
  const columns = previewData && previewData.length > 0 
    ? Object.keys(previewData[0]) 
    : [];

  // Format cell value for display
  const formatCellValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number') {
      // Format as currency if it looks like money
      if (value >= 1000) {
        return new Intl.NumberFormat('es-MX', { 
          style: 'currency', 
          currency: 'MXN',
          minimumFractionDigits: 2 
        }).format(value);
      }
      return value.toLocaleString('es-MX');
    }
    return String(value);
  };

  // Show loading state only for the content area, not the whole page
  const isInitialLoading = permissionsLoading || isLoading;

  return (
    <div className="h-full min-h-[calc(100vh-120px)] flex flex-col p-6">
      {isInitialLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !reporte ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Reporte no encontrado.</p>
            <div className="flex justify-center mt-4">
              <Button variant="outline" onClick={() => navigate(returnPath)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" onClick={() => navigate(returnPath)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <FileSpreadsheet className="h-6 w-6" />
                  {reporte.nombre}
                </h1>
                {reporte.descripcion && (
                  <p className="text-muted-foreground">{reporte.descripcion}</p>
                )}
              </div>
            </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => refetchPreview()}
            disabled={isLoadingPreview}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isLoadingPreview && "animate-spin")} />
            Actualizar
          </Button>
          {(canExport || isSuperAdmin) && (
            <Button
              onClick={handleExport}
              disabled={isExporting}
              className="gap-2"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Exportar a Excel
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle>Configuración del Reporte</CardTitle>
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Vista:</Label>
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="gap-2"
              >
                <TableIcon className="h-4 w-4" />
                Tabla
              </Button>
              <Button
                variant={viewMode === 'chart' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('chart')}
                className="gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                Gráfica
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col space-y-4">
          {/* Dynamic Filters */}
          {reporte.filtros_configuracion.length > 0 && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">Filtros</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {reporte.filtros_configuracion.map((filtro) => {
                  const isDisabled = filtro.depende_de && !filtros[filtro.depende_de];
                  
                  return (
                    <div key={filtro.nombre} className="space-y-2">
                      <Label htmlFor={filtro.nombre} className={cn(isDisabled && "text-muted-foreground")}>
                        {filtro.label}
                        {filtro.requerido && <span className="text-destructive ml-1">*</span>}
                        {filtro.depende_de && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3 w-3 inline ml-1 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Requiere seleccionar {reporte.filtros_configuracion.find(f => f.nombre === filtro.depende_de)?.label || filtro.depende_de} primero</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </Label>
                      {renderFilterInput(filtro)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preview Area */}
          <div className="flex-1 border rounded-lg overflow-hidden">
            {isLoadingPreview ? (
              <div className="flex items-center justify-center h-full min-h-[300px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : previewError ? (
              <div className="p-4">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Error al cargar los datos: {(previewError as Error).message}
                  </AlertDescription>
                </Alert>
              </div>
            ) : previewData && previewData.length > 0 ? (
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((col) => (
                        <TableHead key={col} className="whitespace-nowrap font-semibold">
                          {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((row, idx) => (
                      <TableRow key={idx}>
                        {columns.map((col) => (
                          <TableCell key={col} className="whitespace-nowrap">
                            {formatCellValue(row[col])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[300px] bg-muted/30">
                <div className="text-center text-muted-foreground">
                  <FileSpreadsheet className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Sin datos</p>
                  <p className="text-sm">No se encontraron registros con los filtros aplicados</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Row count */}
          {previewData && previewData.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Mostrando {previewData.length} registro{previewData.length !== 1 ? 's' : ''} (máximo 100 en preview)
            </p>
          )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
