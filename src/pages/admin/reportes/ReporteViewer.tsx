import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, FileSpreadsheet, CalendarIcon, Table as TableIcon, BarChart3, RefreshCw, AlertCircle, ChevronDown, ChevronUp, Info } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell } from 'recharts';

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

  // FIRST: Remove SQL comments (-- until end of line) BEFORE normalizing whitespace
  processedQuery = processedQuery.replace(/--.*$/gm, '');

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

  // Normalize all whitespace (including newlines) to single spaces
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

// Format currency with proper symbol position and comma separators: $1,453.92 M
function formatCurrencyCompact(value: number): string {
  // Handle edge cases
  let cleanValue = +value.toFixed(2);
  if (Math.abs(cleanValue) < 0.01) cleanValue = 0;
  
  if (Math.abs(cleanValue) >= 1000000) {
    const millions = cleanValue / 1000000;
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(millions);
    return `$${formatted} M`;
  } else if (Math.abs(cleanValue) >= 1000) {
    const thousands = cleanValue / 1000;
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(thousands);
    return `$${formatted} K`;
  } else {
    return new Intl.NumberFormat('es-MX', { 
      style: 'currency', 
      currency: 'MXN',
      minimumFractionDigits: 2 
    }).format(cleanValue);
  }
}

export default function ReporteViewer() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnPath = searchParams.get('return') || '/admin/reportes/finanzas';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canExport, isSuperAdmin, isLoading: permissionsLoading } = usePagePermissions(returnPath);
  const { registrarExportacion } = useActivityLogger();

  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [chartRecordLimit, setChartRecordLimit] = useState<number | 'all'>(50);
  const [summaryOpen, setSummaryOpen] = useState(true);

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

  // Fetch ALL data for summary (no limit)
  const { data: fullData, isLoading: isLoadingFullData, error: fullDataError, refetch: refetchPreview } = useQuery({
    queryKey: ['reporte-full-data', id, filtros],
    queryFn: async () => {
      if (!reporte?.query_sql) return [];

      const processedQuery = applyFiltersToQuery(reporte.query_sql, filtros);

      const { data, error } = await supabase.rpc('execute_safe_query', {
        query_text: processedQuery,
        max_rows: 50000 // Higher limit for full data
      });

      if (error) throw error;
      return (data as Record<string, unknown>[]) || [];
    },
    enabled: !!reporte?.query_sql,
  });

  // Preview data is just the first 100 rows for table display
  const previewData = useMemo(() => {
    return fullData?.slice(0, 100) || [];
  }, [fullData]);

  const isLoadingPreview = isLoadingFullData;
  const previewError = fullDataError;

  // Handle refresh - invalidate and refetch all report-related queries
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Remove queries from cache completely
      queryClient.removeQueries({ queryKey: ['reporte-full-data', id, filtros] });
      // Refetch fresh data
      await refetchPreview();
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, id, filtros, refetchPreview]);

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

        // Handle query_opciones - works with or without depende_de
        if (filtro.tipo === 'select' && filtro.query_opciones) {
          let query = filtro.query_opciones;
          
          // Replace parent value if depende_de exists
          if (filtro.depende_de) {
            const parentValue = filtros[filtro.depende_de];
            if (parentValue) {
              query = query.replace(`:${filtro.depende_de}`, parentValue);
            }
          }
          
          const { data } = await supabase.rpc('execute_safe_query', { query_text: query });
          options[filtro.nombre] = ((data as unknown as Record<string, unknown>[]) || []).map((item) => ({
            value: String(item.id),
            label: String(item.nombre_legal || item.nombre),
          }));
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

  // Define preferred column order for known reports
  const preferredColumnOrder = useMemo(() => [
    // Products report columns
    'proyecto', 'categoria', 'producto', 'compradores', 'precio_final', 'pagado', 'restante',
    // Properties report columns  
    'numero_departamento', 'monto_durante_obra', 'monto_a_la_entrega',
    'pagado_durante_obra', 'pagado_a_la_entrega', 'restante_durante_obra', 'restante_a_la_entrega'
  ], []);

  // Get columns from preview data with preferred ordering
  const columns = useMemo(() => {
    if (!previewData || previewData.length === 0) return [];
    
    const dataKeys = Object.keys(previewData[0]);
    
    // Sort columns based on preferred order, keeping unknown columns at the end
    return dataKeys.sort((a, b) => {
      const aIndex = preferredColumnOrder.indexOf(a);
      const bIndex = preferredColumnOrder.indexOf(b);
      
      // Both in preferred order - sort by preference
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      // Only a is in preferred order - a comes first
      if (aIndex !== -1) return -1;
      // Only b is in preferred order - b comes first
      if (bIndex !== -1) return 1;
      // Neither in preferred order - keep original order
      return 0;
    });
  }, [previewData, preferredColumnOrder]);

  // Calculate summary data from FULL data (not just preview)
  const summaryData = useMemo(() => {
    if (!fullData || fullData.length === 0 || columns.length === 0) return null;

    const numericColumns = columns.filter(col => {
      const firstValue = fullData[0][col];
      return typeof firstValue === 'number' && !col.toLowerCase().includes('id');
    });

    const totals: Record<string, number> = {};
    numericColumns.forEach(col => {
      totals[col] = fullData.reduce((sum, row) => sum + (Number(row[col]) || 0), 0);
    });

    return { totals, numericColumns, totalRows: fullData.length };
  }, [fullData, columns]);

  // Ordered columns for charts (matching report column order)
  const orderedChartColumns = [
    'precio_final',
    'pagado',           // Simple products report
    'restante',         // Simple products report
    'monto_durante_obra',
    'monto_a_la_entrega',
    'pagado_durante_obra',
    'pagado_a_la_entrega',
    'restante_durante_obra',
    'restante_a_la_entrega'
  ];

  // Prepare chart data for line chart
  const chartData = useMemo(() => {
    if (!previewData || previewData.length === 0 || columns.length === 0) return [];

    // Find label columns
    const projectColumn = columns.find(col => col.toLowerCase().includes('proyecto'));
    const deptColumn = columns.find(col => 
      col.toLowerCase().includes('numero_departamento') || 
      col.toLowerCase().includes('numero departamento') ||
      col.toLowerCase().includes('departamento')
    );
    const productColumn = columns.find(col => col.toLowerCase() === 'producto');

    // Filter to available numeric columns in preferred order
    const availableOrderedColumns = orderedChartColumns.filter(col => columns.includes(col));

    // Use fullData to show ALL records in the trend chart
    return fullData.map(row => {
      const proyecto = projectColumn ? String(row[projectColumn]) : '';
      const depto = deptColumn ? String(row[deptColumn]) : '';
      const producto = productColumn ? String(row[productColumn]) : '';
      
      // For properties: "Proyecto - Depto XXX", for products: "Proyecto - Producto YYY"
      let fullLabel = proyecto;
      if (depto) {
        fullLabel = `${proyecto} - Depto ${depto}`;
      } else if (producto) {
        fullLabel = `${proyecto} - ${producto}`;
      }
      
      const item: Record<string, unknown> = { 
        name: proyecto.substring(0, 15),
        fullName: fullLabel,
        proyecto: proyecto,
        departamento: depto,
        producto: producto
      };
      availableOrderedColumns.forEach(col => {
        item[col] = Number(row[col]) || 0;
      });
      return item;
    });
  }, [previewData, columns]);

  // Prepare bar chart data for totals with individual colors
  const barChartData = useMemo(() => {
    if (!summaryData) return [];

    const availableOrderedColumns = orderedChartColumns.filter(col => summaryData.numericColumns.includes(col));

    // Color scheme: blues for "durante obra", greens for "a la entrega"
    const barColorMap: Record<string, string> = {
      'precio_final': '#6366f1', // indigo
      'pagado': '#16a34a',        // green - simple products
      'restante': '#f97316',      // orange - simple products
      'monto_durante_obra': '#3b82f6', // blue
      'monto_a_la_entrega': '#22c55e', // green
      'pagado_durante_obra': '#60a5fa', // lighter blue
      'pagado_a_la_entrega': '#4ade80', // lighter green
      'restante_durante_obra': '#1d4ed8', // darker blue
      'restante_a_la_entrega': '#15803d'  // darker green
    };

    return availableOrderedColumns.map(col => ({
      name: col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: summaryData.totals[col] || 0,
      key: col,
      fill: barColorMap[col] || '#888'
    }));
  }, [summaryData]);

  // Colors for chart lines - matching column order
  const chartColorMap: Record<string, string> = {
    'precio_final': 'hsl(var(--primary))',
    'pagado': '#16a34a',            // green - simple products
    'restante': '#f97316',          // orange - simple products
    'monto_durante_obra': '#3b82f6', // blue
    'monto_a_la_entrega': '#22c55e', // green
    'pagado_durante_obra': '#60a5fa', // lighter blue
    'pagado_a_la_entrega': '#4ade80', // lighter green
    'restante_durante_obra': '#8b5cf6', // purple
    'restante_a_la_entrega': '#06b6d4'  // cyan
  };

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
      // Export ALL data without filters (different from properties page)
      const response = await supabase.functions.invoke('exportar-reporte', {
        body: {
          id_reporte: reporte.id,
          filtros: {}, // Always export all data, no filters
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
        filtros_aplicados: {},
      });

      toast({ title: "Éxito", description: "Reporte exportado correctamente (todos los datos)" });
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
                  <FileSpreadsheet className="h-6 w-6 flex-shrink-0" />
                  <span className="truncate max-w-md">{reporte.nombre}</span>
                </h1>
                {reporte.descripcion && (
                  <p className="text-muted-foreground text-sm">{reporte.descripcion}</p>
                )}
              </div>
            </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing || isLoadingPreview}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", (isRefreshing || isLoadingPreview) && "animate-spin")} />
            {isRefreshing ? 'Actualizando...' : 'Actualizar'}
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

          {/* Summary Section - Collapsible */}
          {previewData && previewData.length > 0 && summaryData && (
            <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
              <div className="border rounded-lg bg-muted/30">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full flex items-center justify-between p-4 h-auto">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">Resumen de Cobranza</span>
                      <span className="text-xs text-muted-foreground">({summaryData.totalRows} registros)</span>
                    </div>
                    {summaryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="px-4 pb-4">
                    {/* Main summary: Precio Final + Promedio */}
                    {summaryData.numericColumns.includes('precio_final') && (
                      <div className="mb-6 p-4 bg-background rounded-lg border">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Suma Total de Precio Final</p>
                            <p className="text-2xl font-bold text-primary">
                              {formatCurrencyCompact(summaryData.totals['precio_final'])}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Precio Promedio</p>
                            <p className="text-2xl font-bold text-primary">
                              {formatCurrencyCompact(summaryData.totals['precio_final'] / summaryData.totalRows)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Check if this is a simple report (products) or detailed (properties) */}
                    {(() => {
                      const hasDetailedBreakdown = summaryData.numericColumns.includes('monto_durante_obra') || 
                                                   summaryData.numericColumns.includes('monto_a_la_entrega');
                      const hasSimplePagado = summaryData.numericColumns.includes('pagado');
                      const hasSimpleRestante = summaryData.numericColumns.includes('restante');
                      
                      // Simple view for products report (only pagado/restante without breakdown)
                      if (!hasDetailedBreakdown && (hasSimplePagado || hasSimpleRestante)) {
                        return (
                          <div className="grid md:grid-cols-2 gap-6">
                            {/* Pagado Column */}
                            {hasSimplePagado && (
                              <div className="space-y-4 p-4 bg-background rounded-lg border">
                                <h4 className="font-semibold text-sm border-b pb-2 text-green-600">Total Pagado</h4>
                                <div>
                                  <p className="text-xl font-bold text-green-600">
                                    {formatCurrencyCompact(summaryData.totals['pagado'] || 0)}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Restante Column */}
                            {hasSimpleRestante && (
                              <div className="space-y-4 p-4 bg-background rounded-lg border">
                                <h4 className="font-semibold text-sm border-b pb-2 text-orange-500">Restante por Cobrar</h4>
                                <div>
                                  <p className="text-xl font-bold text-orange-500">
                                    {formatCurrencyCompact(summaryData.totals['restante'] || 0)}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }
                      
                      // Detailed view for properties report (with durante_obra/a_la_entrega breakdown)
                      return (
                        <div className="grid md:grid-cols-3 gap-6">
                          {/* Monto Column */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-blue-600">Monto por Cobrar</h4>
                            {/* Total */}
                            <div>
                              <p className="text-xl font-bold text-blue-600">
                                {formatCurrencyCompact(
                                  (summaryData.totals['monto_durante_obra'] || 0) + 
                                  (summaryData.totals['monto_a_la_entrega'] || 0)
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">Total (Durante Obra + Entrega)</p>
                            </div>
                            {/* Breakdown */}
                            <div className="space-y-2 pt-2 border-t">
                              {summaryData.numericColumns.includes('monto_durante_obra') && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Durante Obra</span>
                                  <span className="font-medium">{formatCurrencyCompact(summaryData.totals['monto_durante_obra'])}</span>
                                </div>
                              )}
                              {summaryData.numericColumns.includes('monto_a_la_entrega') && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">A la Entrega</span>
                                  <span className="font-medium">{formatCurrencyCompact(summaryData.totals['monto_a_la_entrega'])}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Pagado Column */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-green-600">Pagado</h4>
                            {/* Total */}
                            <div>
                              <p className="text-xl font-bold text-green-600">
                                {formatCurrencyCompact(
                                  (summaryData.totals['pagado_durante_obra'] || 0) + 
                                  (summaryData.totals['pagado_a_la_entrega'] || 0)
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">Total (Durante Obra + Entrega)</p>
                            </div>
                            {/* Breakdown */}
                            <div className="space-y-2 pt-2 border-t">
                              {summaryData.numericColumns.includes('pagado_durante_obra') && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Durante Obra</span>
                                  <span className="font-medium">{formatCurrencyCompact(summaryData.totals['pagado_durante_obra'])}</span>
                                </div>
                              )}
                              {summaryData.numericColumns.includes('pagado_a_la_entrega') && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">A la Entrega</span>
                                  <span className="font-medium">{formatCurrencyCompact(summaryData.totals['pagado_a_la_entrega'])}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Restante Column */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-orange-500">Restante por Cobrar</h4>
                            {/* Total */}
                            <div>
                              <p className="text-xl font-bold text-orange-500">
                                {formatCurrencyCompact(
                                  (summaryData.totals['restante_durante_obra'] || 0) + 
                                  (summaryData.totals['restante_a_la_entrega'] || 0)
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">Total (Durante Obra + Entrega)</p>
                            </div>
                            {/* Breakdown */}
                            <div className="space-y-2 pt-2 border-t">
                              {summaryData.numericColumns.includes('restante_durante_obra') && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Durante Obra</span>
                                  <span className="font-medium">{formatCurrencyCompact(summaryData.totals['restante_durante_obra'])}</span>
                                </div>
                              )}
                              {summaryData.numericColumns.includes('restante_a_la_entrega') && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">A la Entrega</span>
                                  <span className="font-medium">{formatCurrencyCompact(summaryData.totals['restante_a_la_entrega'])}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
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
            ) : viewMode === 'chart' ? (
              // Chart View - Two charts: Line Chart + Bar Chart for totals
              <div className="space-y-8 p-4">
                {/* Line Chart - Trends per property */}
                <div className="h-[400px]">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Tendencia por Desglose de Pagos</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Mostrar:</span>
                      <Select 
                        value={String(chartRecordLimit)} 
                        onValueChange={(val) => setChartRecordLimit(val === 'all' ? 'all' : Number(val))}
                      >
                        <SelectTrigger className="w-[100px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                          <SelectItem value="all">Todos ({chartData.length})</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart 
                        data={chartRecordLimit === 'all' ? chartData : chartData.slice(0, chartRecordLimit)} 
                        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="name" 
                          tick={false}
                          axisLine={true}
                          tickLine={false}
                          height={20}
                        />
                        <YAxis 
                          tickFormatter={(value) => formatCurrencyCompact(value)}
                          className="fill-muted-foreground"
                          width={100}
                          domain={[0, 'auto']}
                        />
                        <RechartsTooltip 
                          formatter={(value: number) => formatCurrencyCompact(value)}
                          labelFormatter={(label, payload) => {
                            if (payload && payload.length > 0 && payload[0].payload) {
                              return payload[0].payload.fullName || label;
                            }
                            return label;
                          }}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--background))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                        {orderedChartColumns.filter(col => columns.includes(col)).map((col) => (
                          <Line 
                            key={col} 
                            type="monotone"
                            dataKey={col} 
                            stroke={chartColorMap[col] || '#888'} 
                            strokeWidth={2}
                            dot={false}
                            name={col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-muted-foreground">No hay datos numéricos para graficar</p>
                    </div>
                  )}
                </div>

                {/* Bar Chart - Totals */}
                <div className="h-[350px]">
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">Totales por Concepto</h4>
                  {barChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barChartData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="name" 
                          angle={-30}
                          textAnchor="end"
                          height={100}
                          interval={0}
                          tick={{ fontSize: 11 }}
                          className="fill-muted-foreground"
                        />
                        <YAxis 
                          tickFormatter={(value) => formatCurrencyCompact(value)}
                          className="fill-muted-foreground"
                          width={100}
                          domain={[0, 'auto']}
                        />
                        <RechartsTooltip 
                          formatter={(value: number) => formatCurrencyCompact(value)}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--background))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar 
                          dataKey="value" 
                          radius={[4, 4, 0, 0]}
                        >
                          {barChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-muted-foreground">No hay datos para la gráfica de barras</p>
                    </div>
                  )}
                </div>
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
