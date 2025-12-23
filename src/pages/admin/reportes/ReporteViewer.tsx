import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, FileSpreadsheet, CalendarIcon, Table as TableIcon, BarChart3, RefreshCw, AlertCircle, ChevronDown, ChevronUp, Info, TrendingUp, Lock, ExternalLink } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell, AreaChart, Area, LabelList, PieChart, Pie } from 'recharts';
import { EditCuentaCobranzaDialog } from "@/components/admin/EditCuentaCobranzaDialog";

interface FiltroConfig {
  nombre: string;
  label: string;
  tipo: 'select' | 'multiselect' | 'date' | 'daterange' | 'text';
  tabla?: string;
  campo_valor?: string;
  campo_label?: string;
  opciones?: string[];
  opciones_estaticas?: { id: string; nombre: string }[];
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

// Apply filters to query - supports both single values and comma-separated multiple values (for IN clauses)
// List of filters that require string quoting (non-numeric values)
const STRING_FILTERS = ['tipo'];

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
        // Check if this filter requires string quoting
        const needsQuotes = STRING_FILTERS.includes(filterName);
        
        // Check if this is a multi-value (comma-separated) for IN clause
        if (filterValue.includes(',')) {
          // Convert "1,2,3" to "(1,2,3)" for IN clause
          const inValues = filterValue.split(',').map(v => {
            const trimmed = v.trim();
            return needsQuotes ? `'${trimmed}'` : trimmed;
          }).join(',');
          // Replace = :param with IN (values)
          let replacedCondition = condition.replace(`= :${filterName}`, `IN (${inValues})`);
          // Also handle cases without space before =
          replacedCondition = replacedCondition.replace(`=:${filterName}`, `IN (${inValues})`);
          processedQuery = processedQuery.replace(fullMatch, replacedCondition);
        } else {
          // Single value - wrap in quotes if needed
          const quotedValue = needsQuotes ? `'${filterValue}'` : String(filterValue);
          const replacedCondition = condition.replace(`:${filterName}`, quotedValue);
          processedQuery = processedQuery.replace(fullMatch, replacedCondition);
        }
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
  const { profile } = useAuth();
  const { 
    accessibleProjectIds, 
    ownershipEntityIds, 
    ownershipPersonaIds,
    isRepresentanteEmpresaDuena,
    isLoading: isLoadingProjectAccess 
  } = useProjectAccess();

  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [chartRecordLimit, setChartRecordLimit] = useState<number | 'all'>(50);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [progressChartType, setProgressChartType] = useState<'stacked-bar' | 'area' | 'bullet'>('stacked-bar');
  const [aggregateProjects, setAggregateProjects] = useState(true); // true = show as single bar, false = separate by project
  const [hasReportAccess, setHasReportAccess] = useState<boolean | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [metodoPagoFilter, setMetodoPagoFilter] = useState<string>('');
  
  // State for cuenta de cobranza dialog
  const [selectedCuentaId, setSelectedCuentaId] = useState<number | null>(null);
  const [showCuentaDialog, setShowCuentaDialog] = useState(false);
  
  // Check permission for cuentas de cobranza
  const { canRead: canReadCuentasCobranza } = usePagePermissions('/admin/cuentas-cobranza');

  // Check if user has access to this specific report
  useEffect(() => {
    const checkReportAccess = async () => {
      // Wait for permissions to load before checking access
      if (!id || permissionsLoading) return;
      
      // Super Admin has access to everything
      if (isSuperAdmin) {
        setHasReportAccess(true);
        setIsCheckingAccess(false);
        return;
      }
      
      try {
        const { data, error } = await supabase.rpc('user_can_access_report', {
          _reporte_id: parseInt(id)
        });
        
        if (error) {
          console.error('Error checking report access:', error);
          setHasReportAccess(false);
        } else {
          setHasReportAccess(data === true);
        }
      } catch (err) {
        console.error('Error checking report access:', err);
        setHasReportAccess(false);
      } finally {
        setIsCheckingAccess(false);
      }
    };
    
    checkReportAccess();
  }, [id, permissionsLoading, isSuperAdmin]);

  // Fetch owner entity info for locked filter display
  const { data: ownerEntityInfo } = useQuery({
    queryKey: ['owner-entity-info', ownershipPersonaIds],
    queryFn: async () => {
      if (ownershipPersonaIds.length === 0) return null;
      
      // Fetch persona info directly by id_persona
      const { data, error } = await supabase
        .from('personas')
        .select('id, nombre_legal')
        .in('id', ownershipPersonaIds)
        .eq('activo', true);
      
      if (error) throw error;
      return data?.[0] || null;
    },
    enabled: ownershipPersonaIds.length > 0 && isRepresentanteEmpresaDuena,
  });

  // Auto-set locked filters for Representante de empresa dueña
  useEffect(() => {
    if (isRepresentanteEmpresaDuena && !isLoadingProjectAccess) {
      const updates: Record<string, string> = {};
      
      // Lock project filter to accessible projects
      if (accessibleProjectIds.length > 0) {
        updates['id_proyecto'] = accessibleProjectIds.join(',');
      }
      
      // Lock owner filter to ownership personas (id_persona, not entidad_relacionada id)
      // This is used for filters like id_dueno that filter by er.id_persona
      if (ownershipPersonaIds.length > 0) {
        updates['id_dueno'] = ownershipPersonaIds.join(',');
      }
      
      // Also keep id_entidad_relacionada_dueno for backwards compatibility
      if (ownershipEntityIds.length > 0) {
        updates['id_entidad_relacionada_dueno'] = ownershipEntityIds.join(',');
      }
      
      if (Object.keys(updates).length > 0) {
        setFiltros(prev => ({ ...prev, ...updates }));
      }
    }
  }, [isRepresentanteEmpresaDuena, isLoadingProjectAccess, accessibleProjectIds, ownershipEntityIds, ownershipPersonaIds]);

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
      
      // Debug log to verify filters are being applied correctly
      console.log('[ReporteViewer] Executing query with filters:', JSON.stringify(filtros));
      console.log('[ReporteViewer] Processed query (first 500 chars):', processedQuery.substring(0, 500));

      const { data, error } = await supabase.rpc('execute_safe_query', {
        query_text: processedQuery,
        max_rows: 50000 // Higher limit for full data
      });

      if (error) throw error;
      console.log('[ReporteViewer] Query returned', (data as unknown[])?.length || 0, 'rows');
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

  // Fetch distinct projects from the report data (for filtering project dropdown to only show relevant projects)
  const { data: reportProjectIds = [] } = useQuery({
    queryKey: ['report-project-ids', id, reporte?.query_sql],
    queryFn: async () => {
      if (!reporte?.query_sql) return [];
      
      // Execute the query without project filter to get all projects in the report
      const baseQuery = applyFiltersToQuery(reporte.query_sql, {});
      
      try {
        const { data, error } = await supabase.rpc('execute_safe_query', {
          query_text: baseQuery,
          max_rows: 50000
        });
        
        if (error) throw error;
        
        // Extract unique project names from results
        const projectNames = new Set<string>();
        ((data as Record<string, unknown>[]) || []).forEach(row => {
          if (row.proyecto && typeof row.proyecto === 'string') {
            projectNames.add(row.proyecto);
          }
        });
        
        // Get project IDs for these names
        if (projectNames.size > 0) {
          const { data: projectsData } = await supabase
            .from('proyectos')
            .select('id, nombre')
            .in('nombre', Array.from(projectNames))
            .eq('activo', true);
          
          return projectsData?.map(p => p.id) || [];
        }
        
        return [];
      } catch (e) {
        console.error('[ReporteViewer] Error fetching report project IDs:', e);
        return [];
      }
    },
    enabled: !!reporte?.query_sql,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch options for select filters
  const { data: filterOptions = {} } = useQuery({
    queryKey: ['filter-options-viewer', id, filtros, realEstateProjectIds, accessibleProjectIds, isRepresentanteEmpresaDuena, reportProjectIds],
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
          let fetchedOptions = ((data as unknown as Record<string, unknown>[]) || []).map((item) => ({
            value: String(item.id),
            label: String(item.nombre_legal || item.nombre),
          }));
          
          // For Representante de empresa dueña, handle project filter specially
          if (filtro.nombre === 'id_proyecto' && isRepresentanteEmpresaDuena && accessibleProjectIds.length > 0) {
            // Filter to only accessible projects
            fetchedOptions = fetchedOptions.filter(opt => accessibleProjectIds.includes(parseInt(opt.value)));
            
            // If no projects found in query but user has accessible projects, fetch them directly
            if (fetchedOptions.length === 0) {
              const { data: projectsData } = await supabase
                .from('proyectos')
                .select('id, nombre')
                .in('id', accessibleProjectIds)
                .eq('activo', true);
              
              if (projectsData && projectsData.length > 0) {
                fetchedOptions = projectsData.map(p => ({
                  value: String(p.id),
                  label: p.nombre,
                }));
              }
            }
          }
          
          options[filtro.nombre] = fetchedOptions;
        } else if (filtro.tipo === 'select' && filtro.tabla) {
          if (filtro.tabla === 'proyectos') {
            // For project filter, use projects from report data if available
            let projectIdsToUse = reportProjectIds.length > 0 ? reportProjectIds : realEstateProjectIds;
            
            // For Representante de empresa dueña, intersect with accessible projects
            if (isRepresentanteEmpresaDuena && accessibleProjectIds.length > 0) {
              projectIdsToUse = projectIdsToUse.filter(id => accessibleProjectIds.includes(id));
            }
            
            if (projectIdsToUse.length > 0) {
              const { data } = await supabase
                .from('proyectos')
                .select('*')
                .eq('activo', true)
                .in('id', projectIdsToUse)
                .order('nombre');

              options[filtro.nombre] = ((data as unknown as Record<string, unknown>[]) || []).map((item) => ({
                value: String(item[filtro.campo_valor || 'id']),
                label: String(item[filtro.campo_label || 'nombre']),
              }));
            } else {
              options[filtro.nombre] = [];
            }
          } else {
            const { data } = await supabase
              .from(filtro.tabla as 'proyectos' | 'estatus_disponibilidad')
              .select('*')
              .eq('activo', true);

            options[filtro.nombre] = ((data as unknown as Record<string, unknown>[]) || []).map((item) => ({
              value: String(item[filtro.campo_valor || 'id']),
              label: String(item[filtro.campo_label || 'nombre']),
            }));
          }
        } else if (filtro.tipo === 'select' && filtro.opciones_estaticas) {
          // Handle static options defined in filtros_configuracion
          options[filtro.nombre] = filtro.opciones_estaticas.map(opt => ({ 
            value: opt.id, 
            label: opt.nombre 
          }));
        } else if (filtro.tipo === 'select' && filtro.opciones) {
          options[filtro.nombre] = filtro.opciones.map(opt => ({ value: opt, label: opt }));
        }
      }

      return options;
    },
    enabled: !!reporte && realEstateProjectIds.length >= 0,
  });

  // Check if this is the "Pagos actuales y futuros" pivot report
  const isPagosFuturosReport = reporte?.id === 4;

  // Check if this is the "Cartera Vencida" report (use both id and nombre_archivo for robustness)
  const isCarteraVencidaReport = reporte?.id === 5 || reporte?.nombre_archivo === 'cartera_vencida';

  // Check if this is the "Solo resta pagos a contraentrega" report
  const isContraentregaReport = reporte?.id === 6 || reporte?.nombre_archivo === 'solo_falta_pagos_contraentrega';

  // Check if this is the "Completamente liquidados" report
  const isLiquidadosReport = reporte?.id === 7 || reporte?.nombre_archivo === 'completamente_liquidados';

  // Check if this is the "Reporte Mensual de Pagos" report
  const isPagosMensualesReport = reporte?.id === 8 || reporte?.nombre_archivo === 'reporte_mensual_pagos';

  // Define preferred column order for known reports
  const preferredColumnOrder = useMemo(() => [
    // Unified report columns - exact order requested
    'proyecto', 'dueno', 'compradores', 
    'numero_departamento', 'id_cuenta_cobranza', 'numero_cuenta', 'tipo', 'categoria', 'producto', 'nombre_producto',
    'precio_final', 'monto_durante_obra', 'monto_a_la_entrega',
    'pagado_durante_obra', 'pagado_a_la_entrega', 
    'restante_durante_obra', 'restante_a_la_entrega',
    // Simple products report columns
    'pagado', 'restante',
    // Pagos actuales y futuros report columns
    'mes', 'monto_por_cobrar', 'monto_cobrado', 'monto_faltante',
    // Cartera Vencida report columns
    'ultima_fecha_pago', 'monto_a_pagar', 'monto_pagado', 'monto_restante',
    // Solo resta pagos a contraentrega columns
    'fecha_compra', 'fecha_pago_contraentrega', 'monto_pagado_total', 'monto_contraentrega', 'monto_pagado_contraentrega',
    // Completamente liquidados columns
    'monto_total_a_pagar', 'monto_total_pagado',
    // Reporte Mensual de Pagos columns
    'numero_departamento', 'tipo', 'nombre_producto', 'numero_cuenta', 'fecha_pago',
    'metodo_pago', 'clave_rastreo', 'cuenta_clabe', 'concepto_pago', 'monto_pago', 'compradores',
  ], []);

  // Calculate Cartera Vencida chart data
  const carteraVencidaChartData = useMemo(() => {
    if (!isCarteraVencidaReport) return [];
    
    // Use fullData if available, otherwise fall back to previewData
    const dataSource = fullData && fullData.length > 0 ? fullData : previewData;
    if (!dataSource || dataSource.length === 0) return [];
    
    const totalPagado = dataSource.reduce((sum, row) => sum + (Number(row.monto_pagado) || 0), 0);
    const totalRestante = dataSource.reduce((sum, row) => sum + (Number(row.monto_restante) || 0), 0);
    const total = totalPagado + totalRestante;
    
    // Debug log
    console.log('[CarteraVencida Chart]', { totalPagado, totalRestante, total, rowCount: dataSource.length });
    
    return [
      { 
        name: 'Monto Pagado a la Fecha', 
        value: totalPagado, 
        percentage: total > 0 ? ((totalPagado / total) * 100).toFixed(1) : '0',
        fill: 'hsl(142, 76%, 36%)' // green using HSL
      },
      { 
        name: 'Monto Pendiente a la Fecha', 
        value: totalRestante, 
        percentage: total > 0 ? ((totalRestante / total) * 100).toFixed(1) : '0',
        fill: 'hsl(0, 84%, 60%)' // red using HSL
      }
    ];
  }, [isCarteraVencidaReport, fullData, previewData]);

  // Calculate Contraentrega chart data (pie chart showing pagado vs pendiente)
  const contraentregaChartData = useMemo(() => {
    if (!isContraentregaReport) return [];
    
    // Use fullData if available, otherwise fall back to previewData
    const dataSource = fullData && fullData.length > 0 ? fullData : previewData;
    if (!dataSource || dataSource.length === 0) return [];
    
    const totalContraentrega = dataSource.reduce((sum, row) => sum + (Number(row.monto_contraentrega) || 0), 0);
    const totalPagadoContraentrega = dataSource.reduce((sum, row) => sum + (Number(row.monto_pagado_contraentrega) || 0), 0);
    const totalPendienteContraentrega = totalContraentrega - totalPagadoContraentrega;
    const total = totalContraentrega;
    
    // Debug log
    console.log('[Contraentrega Chart]', { totalContraentrega, totalPagadoContraentrega, totalPendienteContraentrega, rowCount: dataSource.length });
    
    return [
      { 
        name: 'Pagado a Contraentrega', 
        value: totalPagadoContraentrega, 
        percentage: total > 0 ? ((totalPagadoContraentrega / total) * 100).toFixed(1) : '0',
        fill: 'hsl(142, 76%, 36%)' // green using HSL
      },
      { 
        name: 'Pendiente a Contraentrega', 
        value: totalPendienteContraentrega, 
        percentage: total > 0 ? ((totalPendienteContraentrega / total) * 100).toFixed(1) : '0',
        fill: 'hsl(25, 95%, 53%)' // orange using HSL
      }
    ];
  }, [isContraentregaReport, fullData, previewData]);

  // Calculate Liquidados chart data (pie chart showing distribution by tipo: Propiedad vs Producto)
  const liquidadosChartData = useMemo(() => {
    if (!isLiquidadosReport) return [];
    
    // Use fullData if available, otherwise fall back to previewData
    const dataSource = fullData && fullData.length > 0 ? fullData : previewData;
    if (!dataSource || dataSource.length === 0) return [];
    
    // Group by tipo (Propiedad vs Producto)
    const propiedadTotal = dataSource
      .filter(row => row.tipo === 'Propiedad')
      .reduce((sum, row) => sum + (Number(row.monto_total_pagado) || 0), 0);
    
    const productoTotal = dataSource
      .filter(row => row.tipo === 'Producto')
      .reduce((sum, row) => sum + (Number(row.monto_total_pagado) || 0), 0);
    
    const total = propiedadTotal + productoTotal;
    
    // Debug log
    console.log('[Liquidados Chart]', { propiedadTotal, productoTotal, total, rowCount: dataSource.length });
    
    const result = [];
    
    if (propiedadTotal > 0) {
      result.push({ 
        name: 'Propiedades', 
        value: propiedadTotal, 
        percentage: total > 0 ? ((propiedadTotal / total) * 100).toFixed(1) : '0',
        fill: 'hsl(217, 91%, 60%)' // blue
      });
    }
    
    if (productoTotal > 0) {
      result.push({ 
        name: 'Productos', 
        value: productoTotal, 
        percentage: total > 0 ? ((productoTotal / total) * 100).toFixed(1) : '0',
        fill: 'hsl(142, 76%, 36%)' // green
      });
    }
    
    return result;
  }, [isLiquidadosReport, fullData, previewData]);

  // Get unique payment methods for filter (for Pagos Mensuales report)
  const availableMetodosPago = useMemo(() => {
    if (!isPagosMensualesReport) return [];
    
    const dataSource = fullData && fullData.length > 0 ? fullData : previewData;
    if (!dataSource || dataSource.length === 0) return [];
    
    const uniqueMetodos = [...new Set(dataSource.map(row => String(row.metodo_pago || 'Sin especificar')))]
      .filter(m => m.trim() !== ''); // Filter out empty strings
    return uniqueMetodos.sort();
  }, [isPagosMensualesReport, fullData, previewData]);

  // Filter data by metodo_pago for Pagos Mensuales report
  const filteredPagosMensualesData = useMemo(() => {
    if (!isPagosMensualesReport) return fullData || [];
    
    const dataSource = fullData && fullData.length > 0 ? fullData : previewData;
    if (!dataSource || dataSource.length === 0) return [];
    
    if (!metodoPagoFilter || metodoPagoFilter === 'all') return dataSource;
    
    return dataSource.filter(row => String(row.metodo_pago || 'Sin especificar') === metodoPagoFilter);
  }, [isPagosMensualesReport, fullData, previewData, metodoPagoFilter]);

  // Calculate Pagos Mensuales chart data (bar chart showing distribution by método de pago)
  const pagosMensualesChartData = useMemo(() => {
    if (!isPagosMensualesReport) return [];
    
    // Use filteredPagosMensualesData for chart
    const dataSource = filteredPagosMensualesData;
    if (!dataSource || dataSource.length === 0) return [];
    
    // Group by método de pago
    const groupedByMetodo: Record<string, number> = {};
    dataSource.forEach(row => {
      const metodo = String(row.metodo_pago || 'Sin especificar');
      const monto = Number(row.monto_pago) || 0;
      groupedByMetodo[metodo] = (groupedByMetodo[metodo] || 0) + monto;
    });
    
    const total = Object.values(groupedByMetodo).reduce((sum, val) => sum + val, 0);
    
    // Color palette for bar chart
    const colors = [
      'hsl(217, 91%, 60%)', // blue
      'hsl(142, 76%, 36%)', // green
      'hsl(25, 95%, 53%)',  // orange
      'hsl(280, 87%, 65%)', // purple
      'hsl(0, 84%, 60%)',   // red
      'hsl(174, 72%, 45%)', // teal
      'hsl(47, 92%, 50%)',  // yellow
      'hsl(340, 82%, 52%)', // pink
    ];
    
    // Debug log
    console.log('[PagosMensuales Chart]', { groupedByMetodo, total, rowCount: dataSource.length });
    
    return Object.entries(groupedByMetodo)
      .sort((a, b) => b[1] - a[1]) // Sort by amount descending
      .map(([metodo, monto], index) => ({
        name: metodo,
        value: monto,
        percentage: total > 0 ? ((monto / total) * 100).toFixed(1) : '0',
        fill: colors[index % colors.length]
      }));
  }, [isPagosMensualesReport, filteredPagosMensualesData]);

  // Get columns from preview data with preferred ordering
  const columns = useMemo(() => {
    if (!previewData || previewData.length === 0) return [];
    
    const dataKeys = Object.keys(previewData[0]);
    console.log('[ReporteViewer] Available columns from data:', dataKeys);
    
    // Sort columns based on preferred order, keeping unknown columns at the end
    const sortedColumns = dataKeys.sort((a, b) => {
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
    
    console.log('[ReporteViewer] Sorted columns:', sortedColumns);
    return sortedColumns;
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

    // Calculate total for percentage
    const totalSum = availableOrderedColumns.reduce((sum, col) => sum + (summaryData.totals[col] || 0), 0);

    return availableOrderedColumns.map(col => ({
      name: col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: summaryData.totals[col] || 0,
      percentage: totalSum > 0 ? ((summaryData.totals[col] || 0) / totalSum * 100) : 0,
      key: col,
      fill: barColorMap[col] || '#888'
    }));
  }, [summaryData]);

  // Prepare progress chart data - aggregated by project
  const progressChartData = useMemo(() => {
    if (!fullData || fullData.length === 0) return [];

    const projectColumn = columns.find(col => col.toLowerCase().includes('proyecto'));
    if (!projectColumn) return [];

    // Check if we have the required columns for progress chart
    const hasDetailedBreakdown = columns.includes('pagado_durante_obra') || columns.includes('pagado_a_la_entrega');
    const hasSimplePagado = columns.includes('pagado');
    
    if (!hasDetailedBreakdown && !hasSimplePagado) return [];

    // Group data by project
    const projectMap = new Map<string, {
      proyecto: string;
      precio_final: number;
      pagado_durante_obra: number;
      pagado_a_la_entrega: number;
      restante_durante_obra: number;
      restante_a_la_entrega: number;
      pagado_total: number;
      restante_total: number;
    }>();

    fullData.forEach(row => {
      const proyecto = String(row[projectColumn] || 'Sin Proyecto');
      
      if (!projectMap.has(proyecto)) {
        projectMap.set(proyecto, {
          proyecto,
          precio_final: 0,
          pagado_durante_obra: 0,
          pagado_a_la_entrega: 0,
          restante_durante_obra: 0,
          restante_a_la_entrega: 0,
          pagado_total: 0,
          restante_total: 0,
        });
      }

      const current = projectMap.get(proyecto)!;
      current.precio_final += Number(row['precio_final']) || 0;
      
      if (hasDetailedBreakdown) {
        current.pagado_durante_obra += Number(row['pagado_durante_obra']) || 0;
        current.pagado_a_la_entrega += Number(row['pagado_a_la_entrega']) || 0;
        current.restante_durante_obra += Number(row['restante_durante_obra']) || 0;
        current.restante_a_la_entrega += Number(row['restante_a_la_entrega']) || 0;
        current.pagado_total = current.pagado_durante_obra + current.pagado_a_la_entrega;
        current.restante_total = current.restante_durante_obra + current.restante_a_la_entrega;
      } else {
        current.pagado_total += Number(row['pagado']) || 0;
        current.restante_total += Number(row['restante']) || 0;
      }
    });

    // Convert to array and calculate percentages for each segment
    const result = Array.from(projectMap.values()).map(p => {
      const porcentaje_pagado = p.precio_final > 0 ? (p.pagado_total / p.precio_final) * 100 : 0;
      
      // Calculate percentage each segment represents within the total precio_final
      const pct_pagado_durante_obra = p.precio_final > 0 ? (p.pagado_durante_obra / p.precio_final) * 100 : 0;
      const pct_pagado_a_la_entrega = p.precio_final > 0 ? (p.pagado_a_la_entrega / p.precio_final) * 100 : 0;
      const pct_restante_durante_obra = p.precio_final > 0 ? (p.restante_durante_obra / p.precio_final) * 100 : 0;
      const pct_restante_a_la_entrega = p.precio_final > 0 ? (p.restante_a_la_entrega / p.precio_final) * 100 : 0;
      const pct_pagado_total = p.precio_final > 0 ? (p.pagado_total / p.precio_final) * 100 : 0;
      const pct_restante_total = p.precio_final > 0 ? (p.restante_total / p.precio_final) * 100 : 0;
      
      return {
        ...p,
        porcentaje_pagado,
        // Segment percentages
        pct_pagado_durante_obra,
        pct_pagado_a_la_entrega,
        pct_restante_durante_obra,
        pct_restante_a_la_entrega,
        pct_pagado_total,
        pct_restante_total,
        // Label for total amount only (displayed at end of bar)
        label_total: formatCurrencyCompact(p.precio_final),
      };
    });

    // Sort by percentage paid (descending) - most paid first
    return result.sort((a, b) => b.porcentaje_pagado - a.porcentaje_pagado);
  }, [fullData, columns]);

  // Aggregated progress data (single bar combining all projects)
  const aggregatedProgressData = useMemo(() => {
    if (!progressChartData || progressChartData.length === 0) return [];
    
    const totals = progressChartData.reduce((acc, p) => ({
      proyecto: 'Total General',
      precio_final: acc.precio_final + p.precio_final,
      pagado_durante_obra: acc.pagado_durante_obra + p.pagado_durante_obra,
      pagado_a_la_entrega: acc.pagado_a_la_entrega + p.pagado_a_la_entrega,
      restante_durante_obra: acc.restante_durante_obra + p.restante_durante_obra,
      restante_a_la_entrega: acc.restante_a_la_entrega + p.restante_a_la_entrega,
      pagado_total: acc.pagado_total + p.pagado_total,
      restante_total: acc.restante_total + p.restante_total,
    }), {
      proyecto: 'Total General',
      precio_final: 0,
      pagado_durante_obra: 0,
      pagado_a_la_entrega: 0,
      restante_durante_obra: 0,
      restante_a_la_entrega: 0,
      pagado_total: 0,
      restante_total: 0,
    });

    const porcentaje_pagado = totals.precio_final > 0 ? (totals.pagado_total / totals.precio_final) * 100 : 0;
    const pct_pagado_durante_obra = totals.precio_final > 0 ? (totals.pagado_durante_obra / totals.precio_final) * 100 : 0;
    const pct_pagado_a_la_entrega = totals.precio_final > 0 ? (totals.pagado_a_la_entrega / totals.precio_final) * 100 : 0;
    const pct_restante_durante_obra = totals.precio_final > 0 ? (totals.restante_durante_obra / totals.precio_final) * 100 : 0;
    const pct_restante_a_la_entrega = totals.precio_final > 0 ? (totals.restante_a_la_entrega / totals.precio_final) * 100 : 0;
    const pct_pagado_total = totals.precio_final > 0 ? (totals.pagado_total / totals.precio_final) * 100 : 0;
    const pct_restante_total = totals.precio_final > 0 ? (totals.restante_total / totals.precio_final) * 100 : 0;

    return [{
      ...totals,
      porcentaje_pagado,
      pct_pagado_durante_obra,
      pct_pagado_a_la_entrega,
      pct_restante_durante_obra,
      pct_restante_a_la_entrega,
      pct_pagado_total,
      pct_restante_total,
      label_total: formatCurrencyCompact(totals.precio_final),
    }];
  }, [progressChartData]);

  // Use aggregated or separated data based on toggle
  const displayProgressData = aggregateProjects ? aggregatedProgressData : progressChartData;

  // Colors for progress chart
  const progressColors = {
    pagado_durante_obra: '#22c55e',     // green
    pagado_a_la_entrega: '#3b82f6',     // blue
    restante_durante_obra: '#f97316',   // orange
    restante_a_la_entrega: '#ef4444',   // red
    pagado_total: '#22c55e',            // green (for simple view)
    restante_total: '#f97316',          // orange (for simple view)
  };

  // Colors for chart lines - matching column order
  const chartColorMap: Record<string, string> = {
    'precio_final': '#6b7280',       // gray
    'pagado': '#16a34a',             // green - simple products
    'restante': '#dc2626',           // red - simple products
    'monto_durante_obra': '#1e40af', // dark blue
    'monto_a_la_entrega': '#3b82f6', // light blue
    'pagado_durante_obra': '#166534', // dark green
    'pagado_a_la_entrega': '#22c55e', // light green
    'restante_durante_obra': '#991b1b', // dark red
    'restante_a_la_entrega': '#ef4444'  // light red
  };

  // Stroke width for lines
  const chartStrokeWidth: Record<string, number> = {
    'precio_final': 3,
    'monto_durante_obra': 2,
    'monto_a_la_entrega': 2,
    'pagado_durante_obra': 2,
    'pagado_a_la_entrega': 2,
    'restante_durante_obra': 2,
    'restante_a_la_entrega': 2,
  };

  // Stroke dash array for lines (solid, dashed, dotted)
  const chartStrokeDash: Record<string, string> = {
    'precio_final': '0',              // solid
    'monto_durante_obra': '0',        // solid
    'monto_a_la_entrega': '0',        // solid
    'pagado_durante_obra': '8 4',     // dashed
    'pagado_a_la_entrega': '8 4',     // dashed
    'restante_durante_obra': '2 2',   // dotted
    'restante_a_la_entrega': '2 2',   // dotted
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
      // For Representante de empresa dueña, always apply locked filters on export
      const exportFilters: Record<string, string> = {};
      
      if (isRepresentanteEmpresaDuena) {
        // Lock project filter
        if (accessibleProjectIds.length > 0) {
          exportFilters['id_proyecto'] = accessibleProjectIds.join(',');
        }
        // Lock owner filter using id_persona (for id_dueno filter in query)
        if (ownershipPersonaIds.length > 0) {
          exportFilters['id_dueno'] = ownershipPersonaIds.join(',');
        }
        // Also keep id_entidad_relacionada_dueno for backwards compatibility
        if (ownershipEntityIds.length > 0) {
          exportFilters['id_entidad_relacionada_dueno'] = ownershipEntityIds.join(',');
        }
      }
      
      const response = await supabase.functions.invoke('exportar-reporte', {
        body: {
          id_reporte: reporte.id,
          filtros: exportFilters, // Apply locked filters for Representante
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
    
    // Check if this filter is locked for Representante de empresa dueña
    const isLockedProyecto = isRepresentanteEmpresaDuena && filtro.nombre === 'id_proyecto';
    const isLockedDueno = isRepresentanteEmpresaDuena && (
      filtro.nombre === 'id_entidad_relacionada_dueno' || 
      filtro.nombre === 'id_dueno' ||
      filtro.nombre.includes('dueno')
    );
    const isLocked = isLockedDueno; // Only dueño is locked, proyecto can be filtered

    // Locked filter display for dueño
    if (isLocked) {
      const displayName = ownerEntityInfo?.nombre_legal || 'Cargando...';
      return (
        <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
          <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{displayName}</span>
        </div>
      );
    }

    // Multiselect for proyecto filter - for Representante, limit options to accessible projects
    if (filtro.tipo === 'select' && filtro.nombre === 'id_proyecto') {
      const selectedValues = filtros[filtro.nombre] ? filtros[filtro.nombre].split(',') : [];
      let options = filterOptions[filtro.nombre] || [];
      
      // For Representante, filter options to only accessible projects
      if (isRepresentanteEmpresaDuena && accessibleProjectIds.length > 0) {
        options = options.filter(opt => accessibleProjectIds.includes(parseInt(opt.value)));
      }
      
      return (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-full justify-start text-left font-normal", isDisabled && "opacity-50")}
              disabled={isDisabled}
            >
              {selectedValues.length > 0 
                ? selectedValues.length === 1 
                  ? options.find(o => o.value === selectedValues[0])?.label || 'Seleccionar...'
                  : `${selectedValues.length} proyectos seleccionados`
                : 'Todos los proyectos'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-2" align="start">
            <div className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-left"
                onClick={() => handleFilterChange(filtro.nombre, '')}
              >
                Todos
              </Button>
              {options.map((opt) => (
                <Button
                  key={opt.value}
                  variant={selectedValues.includes(opt.value) ? "secondary" : "ghost"}
                  size="sm"
                  className="w-full justify-start text-left"
                  onClick={() => {
                    const newSelected = selectedValues.includes(opt.value)
                      ? selectedValues.filter(v => v !== opt.value)
                      : [...selectedValues, opt.value];
                    handleFilterChange(filtro.nombre, newSelected.join(','));
                  }}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      );
    }

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

  // Extract cuenta ID from formatted string (CC-000001 -> 1, CCP-000123 -> 123)
  const extractCuentaId = (formattedId: string): number | null => {
    if (!formattedId || formattedId === '-') return null;
    // Match CC-XXXXXX or CCP-XXXXXX format
    const match = formattedId.match(/^(?:CC|CCP)-(\d+)$/);
    if (match) {
      return parseInt(match[1], 10);
    }
    // Try to parse as plain number if not formatted
    const plainNumber = parseInt(formattedId, 10);
    return isNaN(plainNumber) ? null : plainNumber;
  };

  // Handle cuenta click - open dialog
  const handleCuentaClick = (cuentaId: number) => {
    setSelectedCuentaId(cuentaId);
    setShowCuentaDialog(true);
  };

  // Render clickable cuenta cell
  const renderCuentaCell = (value: unknown, columnName: string): React.ReactNode => {
    const cuentaColumns = ['numero_cuenta', 'id_cuenta', 'id_cuenta_cobranza', 'cuenta'];
    const isAccountColumn = cuentaColumns.some(col => columnName.toLowerCase().includes(col));
    
    if (!isAccountColumn) {
      return formatCellValue(value, columnName);
    }
    
    const displayValue = String(value || '-');
    const cuentaId = extractCuentaId(displayValue);
    
    // If user has permission and we have a valid cuenta ID, make it clickable
    if (canReadCuentasCobranza && cuentaId) {
      return (
        <Button
          variant="link"
          className="p-0 h-auto font-mono text-sm text-primary hover:text-primary/80 underline-offset-4"
          onClick={(e) => {
            e.stopPropagation();
            handleCuentaClick(cuentaId);
          }}
        >
          {displayValue}
          <ExternalLink className="h-3 w-3 ml-1" />
        </Button>
      );
    }
    
    return displayValue;
  };

  // Format cell value for display
  const formatCellValue = (value: unknown, columnName?: string): string => {
    if (value === null || value === undefined) return '-';
    
    // Check if the column name suggests it's a date value
    const dateColumns = ['fecha', 'date', 'ultima_fecha'];
    const isDateColumn = columnName ? 
      dateColumns.some(col => columnName.toLowerCase().includes(col)) : 
      false;
    
    // Format as date if it's a date column and looks like a date string
    if (isDateColumn && typeof value === 'string') {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return format(date, 'dd/MM/yyyy', { locale: es });
        }
      } catch {
        // Fall through to string conversion
      }
    }
    
    if (typeof value === 'number') {
      // Check if the column name suggests it's a monetary value
      const monetaryColumns = ['monto', 'precio', 'pagado', 'restante', 'cobrar', 'pagar', 'total', 'pendiente'];
      const isMonetary = columnName ? 
        monetaryColumns.some(col => columnName.toLowerCase().includes(col)) : 
        false;
      
      // Format as currency if it's a monetary column - ALWAYS include $ symbol for monetary values
      if (isMonetary) {
        return new Intl.NumberFormat('es-MX', { 
          style: 'currency', 
          currency: 'MXN',
          minimumFractionDigits: 2 
        }).format(value);
      }
      // For non-monetary numbers >= 1000, still format with currency
      if (value >= 1000) {
        return new Intl.NumberFormat('es-MX', { 
          style: 'currency', 
          currency: 'MXN',
          minimumFractionDigits: 2 
        }).format(value);
      }
      return value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(value);
  };

  // Show loading state only for the content area, not the whole page
  const isInitialLoading = permissionsLoading || isLoading || isCheckingAccess || isLoadingProjectAccess;

  return (
    <div className="h-full min-h-[calc(100vh-120px)] flex flex-col p-6">
      {isInitialLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : hasReportAccess === false ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <p className="text-lg font-medium mb-2">Acceso Denegado</p>
              <p className="text-muted-foreground mb-4">No tienes permisos para ver este reporte.</p>
            </div>
            <div className="flex justify-center mt-4">
              <Button variant="outline" onClick={() => navigate(returnPath)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
            </div>
          </CardContent>
        </Card>
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

          {/* Dynamic Filter for Pagos Mensuales - Payment Method */}
          {isPagosMensualesReport && availableMetodosPago.length > 0 && (
            <div className="space-y-4">
              <Label className="text-base font-semibold">Filtros</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="metodo_pago">Método de Pago</Label>
                  <Select
                    value={metodoPagoFilter}
                    onValueChange={setMetodoPagoFilter}
                  >
                    <SelectTrigger id="metodo_pago">
                      <SelectValue placeholder="Todos los métodos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los métodos</SelectItem>
                      {availableMetodosPago.map((metodo) => (
                        <SelectItem key={metodo} value={metodo}>
                          {metodo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Summary Section - Collapsible - NOT for Pagos Futuros report (ID 4), Cartera Vencida, Contraentrega, Liquidados, or Pagos Mensuales (they have their own summary) */}
          {previewData && previewData.length > 0 && summaryData && !isPagosFuturosReport && !isCarteraVencidaReport && !isContraentregaReport && !isLiquidadosReport && !isPagosMensualesReport && (
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
                              {summaryData.numericColumns.includes('monto_durante_obra') && (() => {
                                const montoTotal = (summaryData.totals['monto_durante_obra'] || 0) + (summaryData.totals['monto_a_la_entrega'] || 0);
                                const porcentaje = montoTotal > 0 ? ((summaryData.totals['monto_durante_obra'] || 0) / montoTotal * 100) : 0;
                                return (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Durante Obra</span>
                                    <span className="font-medium">{formatCurrencyCompact(summaryData.totals['monto_durante_obra'])} <span className="text-xs text-muted-foreground">({porcentaje.toFixed(1)}%)</span></span>
                                  </div>
                                );
                              })()}
                              {summaryData.numericColumns.includes('monto_a_la_entrega') && (() => {
                                const montoTotal = (summaryData.totals['monto_durante_obra'] || 0) + (summaryData.totals['monto_a_la_entrega'] || 0);
                                const porcentaje = montoTotal > 0 ? ((summaryData.totals['monto_a_la_entrega'] || 0) / montoTotal * 100) : 0;
                                return (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">A la Entrega</span>
                                    <span className="font-medium">{formatCurrencyCompact(summaryData.totals['monto_a_la_entrega'])} <span className="text-xs text-muted-foreground">({porcentaje.toFixed(1)}%)</span></span>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Pagado Column */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-green-600">Pagado</h4>
                            {/* Total */}
                            {(() => {
                              const precioFinal = summaryData.totals['precio_final'] || 0;
                              const pagadoTotal = (summaryData.totals['pagado_durante_obra'] || 0) + (summaryData.totals['pagado_a_la_entrega'] || 0);
                              const porcentajePagado = precioFinal > 0 ? (pagadoTotal / precioFinal * 100) : 0;
                              return (
                                <div>
                                  <p className="text-xl font-bold text-green-600">
                                    {formatCurrencyCompact(pagadoTotal)}
                                    <span className="text-sm font-normal text-muted-foreground ml-2">({porcentajePagado.toFixed(1)}%)</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">Total (Durante Obra + Entrega)</p>
                                </div>
                              );
                            })()}
                            {/* Breakdown */}
                            <div className="space-y-2 pt-2 border-t">
                              {summaryData.numericColumns.includes('pagado_durante_obra') && (() => {
                                const pagadoTotal = (summaryData.totals['pagado_durante_obra'] || 0) + (summaryData.totals['pagado_a_la_entrega'] || 0);
                                const porcentaje = pagadoTotal > 0 ? ((summaryData.totals['pagado_durante_obra'] || 0) / pagadoTotal * 100) : 0;
                                return (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Durante Obra</span>
                                    <span className="font-medium">{formatCurrencyCompact(summaryData.totals['pagado_durante_obra'])} <span className="text-xs text-muted-foreground">({porcentaje.toFixed(1)}%)</span></span>
                                  </div>
                                );
                              })()}
                              {summaryData.numericColumns.includes('pagado_a_la_entrega') && (() => {
                                const pagadoTotal = (summaryData.totals['pagado_durante_obra'] || 0) + (summaryData.totals['pagado_a_la_entrega'] || 0);
                                const porcentaje = pagadoTotal > 0 ? ((summaryData.totals['pagado_a_la_entrega'] || 0) / pagadoTotal * 100) : 0;
                                return (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">A la Entrega</span>
                                    <span className="font-medium">{formatCurrencyCompact(summaryData.totals['pagado_a_la_entrega'])} <span className="text-xs text-muted-foreground">({porcentaje.toFixed(1)}%)</span></span>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Restante Column */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-orange-500">Restante por Cobrar</h4>
                            {/* Total */}
                            {(() => {
                              const precioFinal = summaryData.totals['precio_final'] || 0;
                              const restanteTotal = (summaryData.totals['restante_durante_obra'] || 0) + (summaryData.totals['restante_a_la_entrega'] || 0);
                              const porcentajeRestante = precioFinal > 0 ? (restanteTotal / precioFinal * 100) : 0;
                              return (
                                <div>
                                  <p className="text-xl font-bold text-orange-500">
                                    {formatCurrencyCompact(restanteTotal)}
                                    <span className="text-sm font-normal text-muted-foreground ml-2">({porcentajeRestante.toFixed(1)}%)</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">Total (Durante Obra + Entrega)</p>
                                </div>
                              );
                            })()}
                            {/* Breakdown */}
                            <div className="space-y-2 pt-2 border-t">
                              {summaryData.numericColumns.includes('restante_durante_obra') && (() => {
                                const restanteTotal = (summaryData.totals['restante_durante_obra'] || 0) + (summaryData.totals['restante_a_la_entrega'] || 0);
                                const porcentaje = restanteTotal > 0 ? ((summaryData.totals['restante_durante_obra'] || 0) / restanteTotal * 100) : 0;
                                return (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Durante Obra</span>
                                    <span className="font-medium">{formatCurrencyCompact(summaryData.totals['restante_durante_obra'])} <span className="text-xs text-muted-foreground">({porcentaje.toFixed(1)}%)</span></span>
                                  </div>
                                );
                              })()}
                              {summaryData.numericColumns.includes('restante_a_la_entrega') && (() => {
                                const restanteTotal = (summaryData.totals['restante_durante_obra'] || 0) + (summaryData.totals['restante_a_la_entrega'] || 0);
                                const porcentaje = restanteTotal > 0 ? ((summaryData.totals['restante_a_la_entrega'] || 0) / restanteTotal * 100) : 0;
                                return (
                                  <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">A la Entrega</span>
                                    <span className="font-medium">{formatCurrencyCompact(summaryData.totals['restante_a_la_entrega'])} <span className="text-xs text-muted-foreground">({porcentaje.toFixed(1)}%)</span></span>
                                  </div>
                                );
                              })()}
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
            ) : viewMode === 'chart' && !isPagosFuturosReport && !isCarteraVencidaReport && !isContraentregaReport && !isLiquidadosReport ? (
              // Chart View - Two charts: Line Chart + Bar Chart for totals (only for generic reports)
              <div className="space-y-8 p-4">
                {/* Line Chart - Trends per property */}
                <div className="h-[400px]">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Tendencia por Desglose de Pagos</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Zoom (datos visibles):</span>
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
                          <SelectItem value="all">Todos</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">({chartData.length} total)</span>
                    </div>
                  </div>
                  {chartData.length > 0 ? (
                    (() => {
                      // Zoom level determines how many items fit in the visible viewport
                      const zoomLevel = chartRecordLimit === 'all' ? chartData.length : chartRecordLimit;
                      const totalDataPoints = chartData.length;
                      const viewportWidth = 700; // visible chart area width (excluding Y-axis)
                      const widthPerItem = viewportWidth / zoomLevel;
                      const totalChartWidth = totalDataPoints * widthPerItem;
                      const needsScroll = totalChartWidth > viewportWidth;
                      const activeColumns = orderedChartColumns.filter(col => columns.includes(col));
                      
                      return (
                        <div className="flex flex-col" style={{ height: 'calc(100% - 30px)' }}>
                          {/* Chart area with fixed Y-axis */}
                          <div className="flex flex-1" style={{ minHeight: '280px' }}>
                            {/* Fixed Y-Axis */}
                            <div className="flex-shrink-0" style={{ width: '100px', height: '100%' }}>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart 
                                  data={chartData} 
                                  margin={{ top: 20, right: 0, left: 20, bottom: 20 }}
                                >
                                  <YAxis 
                                    tickFormatter={(value) => formatCurrencyCompact(value)}
                                    className="fill-muted-foreground"
                                    width={80}
                                    domain={[0, 'auto']}
                                    axisLine={false}
                                  />
                                  {activeColumns.map((col) => (
                                    <Line 
                                      key={col} 
                                      type="monotone"
                                      dataKey={col} 
                                      stroke="transparent"
                                      dot={false}
                                    />
                                  ))}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            
                            {/* Scrollable Chart Content */}
                            <div className="flex-1 overflow-x-auto">
                              <div style={{ width: needsScroll ? `${totalChartWidth}px` : '100%', height: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart 
                                    data={chartData} 
                                    margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
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
                                      domain={[0, 'auto']}
                                      hide={true}
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
                                    {activeColumns.map((col) => (
                                      <Line 
                                        key={col} 
                                        type="monotone"
                                        dataKey={col} 
                                        stroke={chartColorMap[col] || '#888'} 
                                        strokeWidth={chartStrokeWidth[col] || 2}
                                        strokeDasharray={chartStrokeDash[col] || '0'}
                                        dot={false}
                                        name={col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                      />
                                    ))}
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          </div>
                          
                          {/* Fixed Legend */}
                          <div className="flex flex-wrap justify-center gap-4 pt-2 border-t mt-2">
                            {activeColumns.map((col) => (
                              <div key={col} className="flex items-center gap-2">
                                <svg width="30" height="12" className="flex-shrink-0">
                                  <line 
                                    x1="0" 
                                    y1="6" 
                                    x2="30" 
                                    y2="6" 
                                    stroke={chartColorMap[col] || '#888'}
                                    strokeWidth={chartStrokeWidth[col] || 2}
                                    strokeDasharray={chartStrokeDash[col] || '0'}
                                  />
                                </svg>
                                <span className="text-xs text-muted-foreground">
                                  {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-muted-foreground">No hay datos numéricos para graficar</p>
                    </div>
                  )}
                </div>

                {/* Bar Chart - Totals */}
                <div className="h-[350px] mt-24">
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">Totales por Desglose de Pagos</h4>
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
                          formatter={(value: number, name: string, props: { payload?: { percentage?: number } }) => {
                            const pct = props.payload?.percentage;
                            return [`${formatCurrencyCompact(value)} (${pct?.toFixed(1)}%)`];
                          }}
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
                          <LabelList 
                            dataKey="value" 
                            position="top" 
                            formatter={(value: number) => formatCurrencyCompact(value)}
                            style={{ fontSize: 10, fill: 'hsl(var(--foreground))' }}
                          />
                          <LabelList 
                            dataKey="percentage" 
                            position="center" 
                            formatter={(value: number) => `${value.toFixed(1)}%`}
                            style={{ fontSize: 9, fill: '#ffffff', fontWeight: 'bold' }}
                          />
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

                {/* Progress Chart - By Project */}
                {progressChartData.length > 0 && (
                  <div className="h-auto min-h-[400px] mt-6">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-muted-foreground" />
                        <h4 className="text-base font-semibold text-foreground">
                          Progreso de Cobranza {aggregateProjects ? '(Total)' : 'por Proyecto'}
                        </h4>
                      </div>
                      <div className="flex items-center gap-4">
                        {/* Aggregate toggle - only show if more than 1 project */}
                        {progressChartData.length > 1 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAggregateProjects(!aggregateProjects)}
                            className="h-8 text-xs gap-1"
                          >
                            {aggregateProjects ? '📊 Separar por Proyecto' : '📦 Aglomerar Todo'}
                          </Button>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Tipo de gráfica:</span>
                          <Select 
                            value={progressChartType} 
                            onValueChange={(val) => setProgressChartType(val as 'stacked-bar' | 'area' | 'bullet')}
                          >
                            <SelectTrigger className="w-[160px] h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="stacked-bar">📊 Barras</SelectItem>
                              <SelectItem value="area">📈 Área</SelectItem>
                              <SelectItem value="bullet">🎯 Progreso Simple</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Stacked Horizontal Bar Chart */}
                    {progressChartType === 'stacked-bar' && (
                      <div className="space-y-4">
                        {/* Custom Legend - Horizontal compact */}
                        <div className="flex items-center justify-center gap-6 text-xs flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: progressColors.pagado_durante_obra }} />
                            <span>Pagado D.Obra</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: progressColors.pagado_a_la_entrega }} />
                            <span>Pagado Entrega</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: progressColors.restante_durante_obra }} />
                            <span>Restante D.Obra</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: progressColors.restante_a_la_entrega }} />
                            <span>Restante Entrega</span>
                          </div>
                        </div>

                        <div style={{ height: aggregateProjects ? 120 : Math.max(280, displayProgressData.length * 90) }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                              data={displayProgressData} 
                              layout="vertical"
                              margin={{ top: 10, right: 220, left: 80, bottom: 10 }}
                              barSize={aggregateProjects ? 50 : 40}
                            >
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={true} vertical={false} />
                              <XAxis 
                                type="number"
                                tickFormatter={(value) => formatCurrencyCompact(value)}
                                className="fill-muted-foreground"
                                tick={{ fontSize: 11 }}
                              />
                              <YAxis 
                                type="category"
                                dataKey="proyecto"
                                tick={{ fontSize: 12 }}
                                width={90}
                                className="fill-muted-foreground"
                              />
                              <RechartsTooltip 
                                formatter={(value: number, name: string, props: { payload?: Record<string, number> }) => {
                                  const payload = props.payload;
                                  if (!payload) return [formatCurrencyCompact(value), name];
                                  let pct = 0;
                                  if (name === 'Pagado Durante Obra') pct = payload.pct_pagado_durante_obra || 0;
                                  else if (name === 'Pagado A la Entrega') pct = payload.pct_pagado_a_la_entrega || 0;
                                  else if (name === 'Restante Durante Obra') pct = payload.pct_restante_durante_obra || 0;
                                  else if (name === 'Restante A la Entrega') pct = payload.pct_restante_a_la_entrega || 0;
                                  else if (name === 'Pagado') pct = payload.pct_pagado_total || 0;
                                  else if (name === 'Restante') pct = payload.pct_restante_total || 0;
                                  return [`${formatCurrencyCompact(value)} (${pct.toFixed(1)}%)`, name];
                                }}
                                contentStyle={{ 
                                  backgroundColor: 'hsl(var(--background))', 
                                  border: '1px solid hsl(var(--border))',
                                  borderRadius: '8px'
                                }}
                                labelFormatter={(label) => {
                                  const project = displayProgressData.find(p => p.proyecto === label);
                                  return project ? `${label} (${project.porcentaje_pagado.toFixed(1)}% pagado)` : label;
                                }}
                              />
                              {columns.includes('pagado_durante_obra') ? (
                                <>
                                  <Bar dataKey="pagado_durante_obra" stackId="a" fill={progressColors.pagado_durante_obra} name="Pagado Durante Obra">
                                    <LabelList dataKey="pct_pagado_durante_obra" position="center" formatter={(v: number) => v > 8 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 10, fill: '#fff', fontWeight: 'bold' }} />
                                  </Bar>
                                  <Bar dataKey="pagado_a_la_entrega" stackId="a" fill={progressColors.pagado_a_la_entrega} name="Pagado A la Entrega">
                                    <LabelList dataKey="pct_pagado_a_la_entrega" position="center" formatter={(v: number) => v > 8 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 10, fill: '#fff', fontWeight: 'bold' }} />
                                  </Bar>
                                  <Bar dataKey="restante_durante_obra" stackId="a" fill={progressColors.restante_durante_obra} name="Restante Durante Obra">
                                    <LabelList dataKey="pct_restante_durante_obra" position="center" formatter={(v: number) => v > 8 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 10, fill: '#fff', fontWeight: 'bold' }} />
                                  </Bar>
                                  <Bar dataKey="restante_a_la_entrega" stackId="a" fill={progressColors.restante_a_la_entrega} name="Restante A la Entrega" radius={[0, 4, 4, 0]}>
                                    <LabelList dataKey="pct_restante_a_la_entrega" position="center" formatter={(v: number) => v > 8 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 10, fill: '#fff', fontWeight: 'bold' }} />
                                    <LabelList 
                                      position="right"
                                      content={(props) => {
                                        const { x, y, width, height, index } = props;
                                        if (x === undefined || y === undefined || width === undefined || height === undefined || index === undefined) return null;
                                        const numX = Number(x);
                                        const numY = Number(y);
                                        const numW = Number(width);
                                        const numH = Number(height);
                                        const numIndex = Number(index);
                                        if (isNaN(numX) || isNaN(numY) || isNaN(numW) || isNaN(numH) || isNaN(numIndex)) return null;
                                        const data = displayProgressData[numIndex];
                                        if (!data) return null;
                                        const startX = numX + numW + 10;
                                        const centerY = numY + numH / 2;
                                        const duranteObra = data.pagado_durante_obra + data.restante_durante_obra;
                                        const entrega = data.pagado_a_la_entrega + data.restante_a_la_entrega;
                                        const pctDurante = data.precio_final > 0 ? (duranteObra / data.precio_final * 100) : 0;
                                        const pctEntrega = data.precio_final > 0 ? (entrega / data.precio_final * 100) : 0;
                                        return (
                                          <g>
                                            <text x={startX} y={centerY} fontSize={11} fill="hsl(var(--foreground))" fontWeight="bold" dominantBaseline="middle">
                                              {formatCurrencyCompact(data.precio_final)}
                                            </text>
                                            <path 
                                              d={`M${startX + 62} ${centerY - 12} Q${startX + 70} ${centerY - 12} ${startX + 70} ${centerY} Q${startX + 70} ${centerY + 12} ${startX + 62} ${centerY + 12}`}
                                              stroke="hsl(var(--muted-foreground))"
                                              strokeWidth={1}
                                              fill="none"
                                            />
                                            <text x={startX + 76} y={centerY - 7} fontSize={9} fill="hsl(var(--muted-foreground))" dominantBaseline="middle">
                                              D.Obra: {formatCurrencyCompact(duranteObra)} ({pctDurante.toFixed(0)}%)
                                            </text>
                                            <text x={startX + 76} y={centerY + 7} fontSize={9} fill="hsl(var(--muted-foreground))" dominantBaseline="middle">
                                              Entrega: {formatCurrencyCompact(entrega)} ({pctEntrega.toFixed(0)}%)
                                            </text>
                                          </g>
                                        );
                                      }}
                                    />
                                  </Bar>
                                </>
                              ) : (
                                <>
                                  <Bar dataKey="pagado_total" stackId="a" fill={progressColors.pagado_total} name="Pagado">
                                    <LabelList dataKey="pct_pagado_total" position="center" formatter={(v: number) => v > 8 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 10, fill: '#fff', fontWeight: 'bold' }} />
                                  </Bar>
                                  <Bar dataKey="restante_total" stackId="a" fill={progressColors.restante_total} name="Restante" radius={[0, 4, 4, 0]}>
                                    <LabelList dataKey="pct_restante_total" position="center" formatter={(v: number) => v > 8 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 10, fill: '#fff', fontWeight: 'bold' }} />
                                    <LabelList dataKey="label_total" position="right" style={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                                  </Bar>
                                </>
                              )}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Stacked Area Chart */}
                    {progressChartType === 'area' && (
                      <div className="h-[350px]">
                        {displayProgressData.length === 1 ? (
                          // Single project/aggregated: Show as stacked bar since area needs 2+ points
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                              data={displayProgressData} 
                              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis 
                                dataKey="proyecto"
                                tick={{ fontSize: 12 }}
                                className="fill-muted-foreground"
                              />
                              <YAxis 
                                tickFormatter={(value) => formatCurrencyCompact(value)}
                                className="fill-muted-foreground"
                                width={100}
                              />
                              <RechartsTooltip 
                                formatter={(value: number, name: string, props: { payload?: Record<string, number> }) => {
                                  const payload = props.payload;
                                  if (!payload) return [formatCurrencyCompact(value), name];
                                  let pct = 0;
                                  if (name === 'Pagado Durante Obra') pct = payload.pct_pagado_durante_obra || 0;
                                  else if (name === 'Pagado A la Entrega') pct = payload.pct_pagado_a_la_entrega || 0;
                                  else if (name === 'Restante Durante Obra') pct = payload.pct_restante_durante_obra || 0;
                                  else if (name === 'Restante A la Entrega') pct = payload.pct_restante_a_la_entrega || 0;
                                  else if (name === 'Pagado') pct = payload.pct_pagado_total || 0;
                                  else if (name === 'Restante') pct = payload.pct_restante_total || 0;
                                  return [`${formatCurrencyCompact(value)} (${pct.toFixed(1)}%)`, name];
                                }}
                                contentStyle={{ 
                                  backgroundColor: 'hsl(var(--background))', 
                                  border: '1px solid hsl(var(--border))',
                                  borderRadius: '8px'
                                }}
                                labelFormatter={(label) => {
                                  const project = displayProgressData.find(p => p.proyecto === label);
                                  return project ? `${label} (${project.porcentaje_pagado.toFixed(1)}% pagado)` : label;
                                }}
                              />
                              <Legend wrapperStyle={{ paddingTop: '10px' }} />
                              {columns.includes('pagado_durante_obra') ? (
                                <>
                                  <Bar dataKey="pagado_durante_obra" stackId="a" fill={progressColors.pagado_durante_obra} name="Pagado Durante Obra">
                                    <LabelList dataKey="pct_pagado_durante_obra" position="center" formatter={(v: number) => v > 8 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 8, fill: '#fff', fontWeight: 'bold' }} />
                                  </Bar>
                                  <Bar dataKey="pagado_a_la_entrega" stackId="a" fill={progressColors.pagado_a_la_entrega} name="Pagado A la Entrega">
                                    <LabelList dataKey="pct_pagado_a_la_entrega" position="center" formatter={(v: number) => v > 8 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 8, fill: '#fff', fontWeight: 'bold' }} />
                                  </Bar>
                                  <Bar dataKey="restante_durante_obra" stackId="a" fill={progressColors.restante_durante_obra} name="Restante Durante Obra">
                                    <LabelList dataKey="pct_restante_durante_obra" position="center" formatter={(v: number) => v > 8 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 8, fill: '#fff', fontWeight: 'bold' }} />
                                  </Bar>
                                  <Bar dataKey="restante_a_la_entrega" stackId="a" fill={progressColors.restante_a_la_entrega} name="Restante A la Entrega" radius={[4, 4, 0, 0]}>
                                    <LabelList dataKey="pct_restante_a_la_entrega" position="center" formatter={(v: number) => v > 8 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 8, fill: '#fff', fontWeight: 'bold' }} />
                                    <LabelList dataKey="label_total" position="top" style={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} />
                                  </Bar>
                                </>
                              ) : (
                                <>
                                  <Bar dataKey="pagado_total" stackId="a" fill={progressColors.pagado_total} name="Pagado">
                                    <LabelList dataKey="pct_pagado_total" position="center" formatter={(v: number) => v > 8 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 8, fill: '#fff', fontWeight: 'bold' }} />
                                  </Bar>
                                  <Bar dataKey="restante_total" stackId="a" fill={progressColors.restante_total} name="Restante" radius={[4, 4, 0, 0]}>
                                    <LabelList dataKey="pct_restante_total" position="center" formatter={(v: number) => v > 8 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 8, fill: '#fff', fontWeight: 'bold' }} />
                                    <LabelList dataKey="label_total" position="top" style={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} />
                                  </Bar>
                                </>
                              )}
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          // Multiple projects: Show area chart
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart 
                              data={displayProgressData} 
                              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                              <XAxis 
                                dataKey="proyecto"
                                angle={-30}
                                textAnchor="end"
                                height={80}
                                interval={0}
                                tick={{ fontSize: 10 }}
                                className="fill-muted-foreground"
                              />
                              <YAxis 
                                tickFormatter={(value) => formatCurrencyCompact(value)}
                                className="fill-muted-foreground"
                                width={100}
                              />
                              <RechartsTooltip 
                                formatter={(value: number, name: string, props: { payload?: Record<string, number> }) => {
                                  const payload = props.payload;
                                  if (!payload) return [formatCurrencyCompact(value), name];
                                  let pct = 0;
                                  if (name === 'Pagado Durante Obra') pct = payload.pct_pagado_durante_obra || 0;
                                  else if (name === 'Pagado A la Entrega') pct = payload.pct_pagado_a_la_entrega || 0;
                                  else if (name === 'Restante Durante Obra') pct = payload.pct_restante_durante_obra || 0;
                                  else if (name === 'Restante A la Entrega') pct = payload.pct_restante_a_la_entrega || 0;
                                  else if (name === 'Pagado') pct = payload.pct_pagado_total || 0;
                                  else if (name === 'Restante') pct = payload.pct_restante_total || 0;
                                  return [`${formatCurrencyCompact(value)} (${pct.toFixed(1)}%)`, name];
                                }}
                                contentStyle={{ 
                                  backgroundColor: 'hsl(var(--background))', 
                                  border: '1px solid hsl(var(--border))',
                                  borderRadius: '8px'
                                }}
                                labelFormatter={(label) => {
                                  const project = displayProgressData.find(p => p.proyecto === label);
                                  return project ? `${label} (${project.porcentaje_pagado.toFixed(1)}% pagado)` : label;
                                }}
                              />
                              <Legend wrapperStyle={{ paddingTop: '10px' }} />
                              {columns.includes('pagado_durante_obra') ? (
                                <>
                                  <Area type="monotone" dataKey="pagado_durante_obra" stackId="1" stroke={progressColors.pagado_durante_obra} fill={progressColors.pagado_durante_obra} fillOpacity={0.8} name="Pagado Durante Obra">
                                    <LabelList dataKey="pct_pagado_durante_obra" position="insideBottom" formatter={(v: number) => v > 10 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 8, fill: '#fff', fontWeight: 'bold' }} />
                                  </Area>
                                  <Area type="monotone" dataKey="pagado_a_la_entrega" stackId="1" stroke={progressColors.pagado_a_la_entrega} fill={progressColors.pagado_a_la_entrega} fillOpacity={0.8} name="Pagado A la Entrega">
                                    <LabelList dataKey="pct_pagado_a_la_entrega" position="insideBottom" formatter={(v: number) => v > 10 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 8, fill: '#fff', fontWeight: 'bold' }} />
                                  </Area>
                                  <Area type="monotone" dataKey="restante_durante_obra" stackId="1" stroke={progressColors.restante_durante_obra} fill={progressColors.restante_durante_obra} fillOpacity={0.6} name="Restante Durante Obra">
                                    <LabelList dataKey="pct_restante_durante_obra" position="insideBottom" formatter={(v: number) => v > 10 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 8, fill: '#fff', fontWeight: 'bold' }} />
                                  </Area>
                                  <Area type="monotone" dataKey="restante_a_la_entrega" stackId="1" stroke={progressColors.restante_a_la_entrega} fill={progressColors.restante_a_la_entrega} fillOpacity={0.6} name="Restante A la Entrega">
                                    <LabelList dataKey="pct_restante_a_la_entrega" position="insideBottom" formatter={(v: number) => v > 10 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 8, fill: '#fff', fontWeight: 'bold' }} />
                                    <LabelList dataKey="label_total" position="top" style={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} />
                                  </Area>
                                </>
                              ) : (
                                <>
                                  <Area type="monotone" dataKey="pagado_total" stackId="1" stroke={progressColors.pagado_total} fill={progressColors.pagado_total} fillOpacity={0.8} name="Pagado">
                                    <LabelList dataKey="pct_pagado_total" position="insideBottom" formatter={(v: number) => v > 10 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 8, fill: '#fff', fontWeight: 'bold' }} />
                                  </Area>
                                  <Area type="monotone" dataKey="restante_total" stackId="1" stroke={progressColors.restante_total} fill={progressColors.restante_total} fillOpacity={0.6} name="Restante">
                                    <LabelList dataKey="pct_restante_total" position="insideBottom" formatter={(v: number) => v > 10 ? `${v.toFixed(0)}%` : ''} style={{ fontSize: 8, fill: '#fff', fontWeight: 'bold' }} />
                                    <LabelList dataKey="label_total" position="top" style={{ fontSize: 9, fill: 'hsl(var(--foreground))' }} />
                                  </Area>
                                </>
                              )}
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    )}

                    {/* Bullet/Progress Chart */}
                    {progressChartType === 'bullet' && (
                      <div className="space-y-8 p-6 bg-muted/20 rounded-lg">
                        {displayProgressData.map((project, index) => (
                          <div key={project.proyecto} className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-base truncate max-w-[250px]" title={project.proyecto}>
                                {project.proyecto}
                              </span>
                              <div className="flex items-center gap-6 text-sm">
                                <span className="text-muted-foreground">
                                  Pagado: <span className="font-semibold text-foreground">{formatCurrencyCompact(project.pagado_total)}</span>
                                </span>
                                <span className="text-muted-foreground">
                                  Total: <span className="font-semibold text-foreground">{formatCurrencyCompact(project.precio_final)}</span>
                                </span>
                                <span className={cn(
                                  "font-bold text-lg min-w-[70px] text-right",
                                  project.porcentaje_pagado >= 90 ? "text-green-600" :
                                  project.porcentaje_pagado >= 50 ? "text-blue-600" :
                                  project.porcentaje_pagado >= 25 ? "text-orange-500" : "text-red-500"
                                )}>
                                  {project.porcentaje_pagado.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            <div className="relative h-10 bg-muted rounded-full overflow-hidden">
                              {/* Background track */}
                              <div className="absolute inset-0 bg-gradient-to-r from-muted to-muted/50" />
                              
                              {/* Progress bar */}
                              <div 
                                className={cn(
                                  "absolute h-full rounded-full transition-all duration-500 ease-out",
                                  project.porcentaje_pagado >= 90 ? "bg-gradient-to-r from-green-500 to-green-400" :
                                  project.porcentaje_pagado >= 50 ? "bg-gradient-to-r from-blue-500 to-blue-400" :
                                  project.porcentaje_pagado >= 25 ? "bg-gradient-to-r from-orange-500 to-orange-400" : 
                                  "bg-gradient-to-r from-red-500 to-red-400"
                                )}
                                style={{ width: `${Math.min(project.porcentaje_pagado, 100)}%` }}
                              />
                              
                              {/* 100% marker */}
                              <div className="absolute right-0 top-0 h-full w-0.5 bg-foreground/20" />
                              
                              {/* Percentage label inside bar */}
                              {project.porcentaje_pagado > 15 && (
                                <div 
                                  className="absolute h-full flex items-center px-3 text-sm font-bold text-white"
                                  style={{ width: `${Math.min(project.porcentaje_pagado, 100)}%`, justifyContent: 'flex-end' }}
                                >
                                  {project.porcentaje_pagado.toFixed(0)}%
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        {/* Legend for bullet chart */}
                        <div className="flex items-center justify-center gap-8 pt-6 border-t mt-6 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-r from-green-500 to-green-400" />
                            <span>≥90% Pagado</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-r from-blue-500 to-blue-400" />
                            <span>50-89%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-r from-orange-500 to-orange-400" />
                            <span>25-49%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-r from-red-500 to-red-400" />
                            <span>&lt;25%</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : isCarteraVencidaReport && previewData && previewData.length > 0 ? (
              // Special view for Cartera Vencida report
              <div className="space-y-6">
                {/* Summary Section */}
                <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
                  <div className="border rounded-lg overflow-hidden">
                    <CollapsibleTrigger className="w-full px-4 py-3 bg-muted/50 hover:bg-muted/70 flex items-center justify-between transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Resumen de Cartera Vencida</span>
                        <span className="text-sm text-muted-foreground">({fullData?.length || 0} cuentas)</span>
                      </div>
                      {summaryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Monto a Pagar a la Fecha */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-blue-600">Monto a Pagar a la Fecha</h4>
                            <div>
                              <p className="text-xl font-bold text-blue-600">
                                {formatCurrencyCompact((fullData || []).reduce((sum, row) => sum + (Number(row.monto_a_pagar) || 0), 0))}
                              </p>
                              <p className="text-xs text-muted-foreground">Total a pagar a la fecha</p>
                            </div>
                          </div>

                          {/* Monto Pagado a la Fecha */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-green-600">Monto Pagado a la Fecha</h4>
                            {(() => {
                              const totalAPagar = (fullData || []).reduce((sum, row) => sum + (Number(row.monto_a_pagar) || 0), 0);
                              const totalPagado = (fullData || []).reduce((sum, row) => sum + (Number(row.monto_pagado) || 0), 0);
                              const porcentaje = totalAPagar > 0 ? (totalPagado / totalAPagar * 100) : 0;
                              return (
                                <div>
                                  <p className="text-xl font-bold text-green-600">
                                    {formatCurrencyCompact(totalPagado)}
                                    <span className="text-sm font-normal text-muted-foreground ml-2">({porcentaje.toFixed(1)}%)</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">Total cobrado a la fecha</p>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Monto Pendiente a la Fecha */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-red-500">Monto Pendiente a la Fecha</h4>
                            {(() => {
                              const totalAPagar = (fullData || []).reduce((sum, row) => sum + (Number(row.monto_a_pagar) || 0), 0);
                              const totalRestante = (fullData || []).reduce((sum, row) => sum + (Number(row.monto_restante) || 0), 0);
                              const porcentaje = totalAPagar > 0 ? (totalRestante / totalAPagar * 100) : 0;
                              return (
                                <div>
                                  <p className="text-xl font-bold text-red-500">
                                    {formatCurrencyCompact(totalRestante)}
                                    <span className="text-sm font-normal text-muted-foreground ml-2">({porcentaje.toFixed(1)}%)</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">Total pendiente a la fecha</p>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>

                {/* Conditional: Show Table OR Chart based on viewMode */}
                {viewMode === 'table' ? (
                  /* Table view for Cartera Vencida */
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold min-w-[150px]">Proyecto</TableHead>
                          <TableHead className="font-semibold min-w-[150px]">Dueño</TableHead>
                          <TableHead className="font-semibold min-w-[200px]">Compradores</TableHead>
                          <TableHead className="font-semibold min-w-[100px]">Num. Depto</TableHead>
                          <TableHead className="font-semibold min-w-[120px]">Num. Cuenta</TableHead>
                          <TableHead className="font-semibold min-w-[100px]">Tipo</TableHead>
                          <TableHead className="font-semibold min-w-[120px]">Categoría</TableHead>
                          <TableHead className="font-semibold min-w-[150px]">Producto</TableHead>
                          <TableHead className="font-semibold min-w-[130px]">Última Fecha Pago</TableHead>
                          <TableHead className="text-right font-semibold min-w-[160px] text-blue-600">Monto a Pagar a la Fecha</TableHead>
                          <TableHead className="text-right font-semibold min-w-[160px] text-green-600">Monto Pagado a la Fecha</TableHead>
                          <TableHead className="text-right font-semibold min-w-[170px] text-red-500">Monto Pendiente a la Fecha</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.map((row, idx) => (
                          <TableRow key={idx} className="hover:bg-muted/30">
                            <TableCell className="font-medium">{String(row.proyecto || '-')}</TableCell>
                            <TableCell>{String(row.dueno || '-')}</TableCell>
                            <TableCell className="max-w-[200px] truncate" title={String(row.compradores || '')}>{String(row.compradores || '-')}</TableCell>
                            <TableCell>{String(row.numero_departamento || '-')}</TableCell>
                            <TableCell className="font-mono text-sm">{renderCuentaCell(row.numero_cuenta, 'numero_cuenta')}</TableCell>
                            <TableCell>{String(row.tipo || '-')}</TableCell>
                            <TableCell>{String(row.categoria || '-')}</TableCell>
                            <TableCell>{String(row.nombre_producto || '-')}</TableCell>
                            <TableCell>{formatCellValue(row.ultima_fecha_pago, 'ultima_fecha_pago')}</TableCell>
                            <TableCell className="text-right font-mono">{formatCellValue(row.monto_a_pagar, 'monto_a_pagar')}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">{formatCellValue(row.monto_pagado, 'monto_pagado')}</TableCell>
                            <TableCell className="text-right font-mono text-red-500">{formatCellValue(row.monto_restante, 'monto_restante')}</TableCell>
                          </TableRow>
                        ))}
                        {/* Total Row */}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={9} className="font-bold">Total</TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {formatCellValue((fullData || []).reduce((sum, row) => sum + (Number(row.monto_a_pagar) || 0), 0), 'monto_a_pagar')}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-green-600">
                            {formatCellValue((fullData || []).reduce((sum, row) => sum + (Number(row.monto_pagado) || 0), 0), 'monto_pagado')}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-red-500">
                            {formatCellValue((fullData || []).reduce((sum, row) => sum + (Number(row.monto_restante) || 0), 0), 'monto_restante')}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                ) : (
                  /* Pie Chart for Cartera Vencida */
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Distribución de Cartera Vencida</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {carteraVencidaChartData.length > 0 && carteraVencidaChartData.some(d => d.value > 0) ? (
                        <div className="h-[400px] flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={carteraVencidaChartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={140}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {carteraVencidaChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                              </Pie>
                              <RechartsTooltip 
                                formatter={(value: number, name: string) => [formatCurrencyCompact(value), name]}
                                contentStyle={{ 
                                  backgroundColor: 'hsl(var(--background))', 
                                  border: '1px solid hsl(var(--border))',
                                  borderRadius: '8px'
                                }}
                              />
                              <Legend 
                                formatter={(value, entry) => {
                                  const item = carteraVencidaChartData.find(d => d.name === value);
                                  return `${value}: ${formatCurrencyCompact(item?.value || 0)} (${item?.percentage}%)`;
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                          {isLoadingFullData ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-5 w-5 animate-spin" />
                              <span>Cargando datos de la gráfica...</span>
                            </div>
                          ) : (
                            <span>No hay datos disponibles para mostrar la gráfica. Intente aplicar filtros.</span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : isPagosFuturosReport && previewData && previewData.length > 0 ? (
              // Special pivot view for "Pagos actuales y futuros" report
              <div className="space-y-6">
                {/* Resumen de Cobranza - Always visible */}
                <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
                  <div className="border rounded-lg overflow-hidden">
                    <CollapsibleTrigger className="w-full px-4 py-3 bg-muted/50 hover:bg-muted/70 flex items-center justify-between transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Resumen de Cobranza</span>
                        <span className="text-sm text-muted-foreground">({previewData.length} registros)</span>
                      </div>
                      {summaryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Monto por Cobrar */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-blue-600">Monto por Cobrar</h4>
                            <div>
                              <p className="text-xl font-bold text-blue-600">
                                {formatCurrencyCompact(previewData.reduce((sum, row) => sum + (Number(row.monto_por_cobrar) || 0), 0))}
                              </p>
                              <p className="text-xs text-muted-foreground">Total ({previewData.length} meses)</p>
                            </div>
                          </div>

                          {/* Pagado */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-green-600">Pagado</h4>
                            {(() => {
                              const totalPorCobrar = previewData.reduce((sum, row) => sum + (Number(row.monto_por_cobrar) || 0), 0);
                              const totalCobrado = previewData.reduce((sum, row) => sum + (Number(row.monto_cobrado) || 0), 0);
                              const porcentaje = totalPorCobrar > 0 ? (totalCobrado / totalPorCobrar * 100) : 0;
                              return (
                                <div>
                                  <p className="text-xl font-bold text-green-600">
                                    {formatCurrencyCompact(totalCobrado)}
                                    <span className="text-sm font-normal text-muted-foreground ml-2">({porcentaje.toFixed(1)}%)</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">Total cobrado</p>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Restante por Cobrar */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-orange-500">Restante por Cobrar</h4>
                            {(() => {
                              const totalPorCobrar = previewData.reduce((sum, row) => sum + (Number(row.monto_por_cobrar) || 0), 0);
                              const totalFaltante = previewData.reduce((sum, row) => sum + (Number(row.monto_faltante) || 0), 0);
                              const porcentaje = totalPorCobrar > 0 ? (totalFaltante / totalPorCobrar * 100) : 0;
                              return (
                                <div>
                                  <p className="text-xl font-bold text-orange-500">
                                    {formatCurrencyCompact(totalFaltante)}
                                    <span className="text-sm font-normal text-muted-foreground ml-2">({porcentaje.toFixed(1)}%)</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">Total restante por cobrar</p>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>

                {/* Conditional: Show Table OR Chart based on viewMode */}
                {viewMode === 'table' ? (
                  /* Pivot Table - Months as columns */
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold min-w-[200px]">Mes</TableHead>
                          <TableHead className="text-center font-semibold min-w-[160px] text-blue-600">Monto Por Cobrar</TableHead>
                          <TableHead className="text-center font-semibold min-w-[160px] text-green-600">Monto Cobrado</TableHead>
                          <TableHead className="text-center font-semibold min-w-[160px] text-orange-500">Restante Por Cobrar</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.map((row, idx) => {
                          const esMesActual = row.es_mes_actual === true;
                          return (
                            <TableRow key={idx} className={cn("hover:bg-muted/30", esMesActual && "bg-emerald-500/20 border-l-4 border-l-emerald-500")}>
                              <TableCell className={cn("font-medium", esMesActual && "text-emerald-600 dark:text-emerald-400 font-bold")}>
                                {esMesActual ? "Mes actual" : String(row.mes)}
                              </TableCell>
                              <TableCell className={cn("text-center font-mono", esMesActual && "font-semibold")}>
                                {formatCellValue(row.monto_por_cobrar)}
                              </TableCell>
                              <TableCell className={cn("text-center font-mono text-green-600", esMesActual && "font-semibold")}>
                                {formatCellValue(row.monto_cobrado)}
                              </TableCell>
                              <TableCell className={cn("text-center font-mono text-orange-500", esMesActual && "font-semibold")}>
                                {formatCellValue(row.monto_faltante)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {/* Total Row */}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell className="font-bold">Total</TableCell>
                          <TableCell className="text-center font-mono font-bold">
                            {formatCellValue(previewData.reduce((sum, row) => sum + (Number(row.monto_por_cobrar) || 0), 0))}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold text-green-600">
                            {formatCellValue(previewData.reduce((sum, row) => sum + (Number(row.monto_cobrado) || 0), 0))}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold text-orange-500">
                            {formatCellValue(previewData.reduce((sum, row) => sum + (Number(row.monto_faltante) || 0), 0))}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  /* Bar Chart for visualization */
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Proyección de Cobros por Mes</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <BarChart 
                        width={800}
                        height={400}
                        data={previewData.map(row => ({
                          mes: row.es_mes_actual === true ? "Mes actual" : String(row.mes),
                          por_cobrar: Number(row.monto_por_cobrar) || 0,
                          cobrado: Number(row.monto_cobrado) || 0,
                          restante: Number(row.monto_faltante) || 0
                        }))} 
                        margin={{ top: 20, right: 30, left: 60, bottom: 80 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis 
                          dataKey="mes" 
                          tick={{ fontSize: 11, fill: '#374151' }} 
                          angle={-45}
                          textAnchor="end"
                          interval={0}
                          height={80}
                        />
                        <YAxis 
                          tickFormatter={(value) => formatCurrencyCompact(value)} 
                          tick={{ fontSize: 11, fill: '#374151' }} 
                        />
                        <RechartsTooltip 
                          formatter={(value: number, name: string) => [formatCurrencyCompact(value), name]}
                          contentStyle={{ 
                            backgroundColor: 'white', 
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                          }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                        <Bar dataKey="por_cobrar" fill="#3b82f6" name="Por Cobrar" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="cobrado" fill="#22c55e" name="Cobrado" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="restante" fill="#f97316" name="Restante" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : isContraentregaReport && previewData && previewData.length > 0 ? (
              // Special view for "Solo resta pagos a contraentrega" report
              <div className="space-y-6">
                {/* Summary Section */}
                <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
                  <div className="border rounded-lg overflow-hidden">
                    <CollapsibleTrigger className="w-full px-4 py-3 bg-muted/50 hover:bg-muted/70 flex items-center justify-between transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Resumen de Pagos a Contraentrega</span>
                        <span className="text-sm text-muted-foreground">({fullData?.length || 0} cuentas)</span>
                      </div>
                      {summaryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Monto Total Contraentrega */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-blue-600">Monto Total a Contraentrega</h4>
                            <div>
                              <p className="text-xl font-bold text-blue-600">
                                {formatCurrencyCompact((fullData || []).reduce((sum, row) => sum + (Number(row.monto_contraentrega) || 0), 0))}
                              </p>
                              <p className="text-xs text-muted-foreground">Total a pagar a la entrega</p>
                            </div>
                          </div>

                          {/* Monto Pagado Contraentrega */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-green-600">Pagado a Contraentrega</h4>
                            {(() => {
                              const totalContraentrega = (fullData || []).reduce((sum, row) => sum + (Number(row.monto_contraentrega) || 0), 0);
                              const totalPagado = (fullData || []).reduce((sum, row) => sum + (Number(row.monto_pagado_contraentrega) || 0), 0);
                              const porcentaje = totalContraentrega > 0 ? (totalPagado / totalContraentrega * 100) : 0;
                              return (
                                <div>
                                  <p className="text-xl font-bold text-green-600">
                                    {formatCurrencyCompact(totalPagado)}
                                    <span className="text-sm font-normal text-muted-foreground ml-2">({porcentaje.toFixed(1)}%)</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">Total abonado a contraentrega</p>
                                </div>
                              );
                            })()}
                          </div>

                          {/* Monto Pendiente Contraentrega */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-orange-500">Pendiente a Contraentrega</h4>
                            {(() => {
                              const totalContraentrega = (fullData || []).reduce((sum, row) => sum + (Number(row.monto_contraentrega) || 0), 0);
                              const totalPagado = (fullData || []).reduce((sum, row) => sum + (Number(row.monto_pagado_contraentrega) || 0), 0);
                              const totalPendiente = totalContraentrega - totalPagado;
                              const porcentaje = totalContraentrega > 0 ? (totalPendiente / totalContraentrega * 100) : 0;
                              return (
                                <div>
                                  <p className="text-xl font-bold text-orange-500">
                                    {formatCurrencyCompact(totalPendiente)}
                                    <span className="text-sm font-normal text-muted-foreground ml-2">({porcentaje.toFixed(1)}%)</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">Total pendiente a contraentrega</p>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>

                {/* Conditional: Show Table OR Chart based on viewMode */}
                {viewMode === 'table' ? (
                  /* Table view for Contraentrega */
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold min-w-[150px]">Proyecto</TableHead>
                          <TableHead className="font-semibold min-w-[150px]">Dueño</TableHead>
                          <TableHead className="font-semibold min-w-[200px]">Compradores</TableHead>
                          <TableHead className="font-semibold min-w-[100px]">Num. Depto</TableHead>
                          <TableHead className="font-semibold min-w-[120px]">Num. Cuenta</TableHead>
                          <TableHead className="font-semibold min-w-[120px]">Fecha Compra</TableHead>
                          <TableHead className="font-semibold min-w-[150px]">Fecha Contraentrega</TableHead>
                          <TableHead className="text-right font-semibold min-w-[150px] text-blue-600">Monto Pagado Total</TableHead>
                          <TableHead className="text-right font-semibold min-w-[150px] text-orange-500">Monto Contraentrega</TableHead>
                          <TableHead className="text-right font-semibold min-w-[170px] text-green-600">Pagado Contraentrega</TableHead>
                          <TableHead className="text-right font-semibold min-w-[170px] text-red-500">Restante Contraentrega</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.map((row, idx) => {
                          const restanteContraentrega = (Number(row.monto_contraentrega) || 0) - (Number(row.monto_pagado_contraentrega) || 0);
                          return (
                            <TableRow key={idx} className="hover:bg-muted/30">
                              <TableCell className="font-medium">{String(row.proyecto || '-')}</TableCell>
                              <TableCell>{String(row.dueno || '-')}</TableCell>
                              <TableCell className="max-w-[200px] truncate" title={String(row.compradores || '')}>{String(row.compradores || '-')}</TableCell>
                              <TableCell>{String(row.numero_departamento || '-')}</TableCell>
                              <TableCell className="font-mono text-sm">{renderCuentaCell(row.numero_cuenta, 'numero_cuenta')}</TableCell>
                              <TableCell>{formatCellValue(row.fecha_compra, 'fecha_compra')}</TableCell>
                              <TableCell>{formatCellValue(row.fecha_pago_contraentrega, 'fecha_pago_contraentrega')}</TableCell>
                              <TableCell className="text-right font-mono">{formatCellValue(row.monto_pagado_total, 'monto_pagado_total')}</TableCell>
                              <TableCell className="text-right font-mono text-orange-500">{formatCellValue(row.monto_contraentrega, 'monto_contraentrega')}</TableCell>
                              <TableCell className="text-right font-mono text-green-600">{formatCellValue(row.monto_pagado_contraentrega, 'monto_pagado_contraentrega')}</TableCell>
                              <TableCell className="text-right font-mono text-red-500">{formatCellValue(restanteContraentrega, 'restante_contraentrega')}</TableCell>
                            </TableRow>
                          );
                        })}
                        {/* Total Row */}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={7} className="font-bold">Total</TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {formatCellValue((fullData || []).reduce((sum, row) => sum + (Number(row.monto_pagado_total) || 0), 0), 'monto_pagado_total')}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-orange-500">
                            {formatCellValue((fullData || []).reduce((sum, row) => sum + (Number(row.monto_contraentrega) || 0), 0), 'monto_contraentrega')}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-green-600">
                            {formatCellValue((fullData || []).reduce((sum, row) => sum + (Number(row.monto_pagado_contraentrega) || 0), 0), 'monto_pagado_contraentrega')}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-red-500">
                            {formatCellValue((fullData || []).reduce((sum, row) => sum + ((Number(row.monto_contraentrega) || 0) - (Number(row.monto_pagado_contraentrega) || 0)), 0), 'restante_contraentrega')}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                ) : (
                  /* Chart View - Pie chart */
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Distribución de Pagos a Contraentrega</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {contraentregaChartData.length > 0 && contraentregaChartData.some(d => d.value > 0) ? (
                        <div className="h-[400px] flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={contraentregaChartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={140}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {contraentregaChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                              </Pie>
                              <RechartsTooltip 
                                formatter={(value: number, name: string) => [formatCurrencyCompact(value), name]}
                                contentStyle={{ 
                                  backgroundColor: 'hsl(var(--background))', 
                                  border: '1px solid hsl(var(--border))',
                                  borderRadius: '8px'
                                }}
                              />
                              <Legend 
                                formatter={(value, entry) => {
                                  const item = contraentregaChartData.find(d => d.name === value);
                                  return `${value}: ${formatCurrencyCompact(item?.value || 0)} (${item?.percentage}%)`;
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                          {isLoadingFullData ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-5 w-5 animate-spin" />
                              <span>Cargando datos de la gráfica...</span>
                            </div>
                          ) : (
                            <span>No hay datos disponibles para mostrar la gráfica. Intente aplicar filtros.</span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : isLiquidadosReport && previewData && previewData.length > 0 ? (
              // Special view for "Completamente liquidados" report
              <div className="space-y-6">
                {/* Summary Section */}
                <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
                  <div className="border rounded-lg overflow-hidden">
                    <CollapsibleTrigger className="w-full px-4 py-3 bg-muted/50 hover:bg-muted/70 flex items-center justify-between transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Resumen de Propiedades Liquidadas</span>
                        <span className="text-sm text-muted-foreground">({fullData?.length || 0} cuentas)</span>
                      </div>
                      {summaryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Monto Total a Pagar */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-blue-600">Monto Total a Pagar</h4>
                            <div>
                              <p className="text-xl font-bold text-blue-600">
                                {formatCurrencyCompact((fullData || []).reduce((sum, row) => sum + (Number(row.monto_total_a_pagar) || 0), 0))}
                              </p>
                              <p className="text-xs text-muted-foreground">Suma del precio final de todas las cuentas</p>
                            </div>
                          </div>

                          {/* Monto Total Pagado */}
                          <div className="space-y-4 p-4 bg-background rounded-lg border">
                            <h4 className="font-semibold text-sm border-b pb-2 text-green-600">Monto Total Pagado</h4>
                            {(() => {
                              const totalAPagar = (fullData || []).reduce((sum, row) => sum + (Number(row.monto_total_a_pagar) || 0), 0);
                              const totalPagado = (fullData || []).reduce((sum, row) => sum + (Number(row.monto_total_pagado) || 0), 0);
                              const porcentaje = totalAPagar > 0 ? (totalPagado / totalAPagar * 100) : 0;
                              return (
                                <div>
                                  <p className="text-xl font-bold text-green-600">
                                    {formatCurrencyCompact(totalPagado)}
                                    <span className="text-sm font-normal text-muted-foreground ml-2">({porcentaje.toFixed(1)}%)</span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">Total de pagos aplicados</p>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>

                {/* Conditional: Show Table OR Chart based on viewMode */}
                {viewMode === 'table' ? (
                  /* Table view for Liquidados */
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold min-w-[150px]">Proyecto</TableHead>
                          <TableHead className="font-semibold min-w-[150px]">Dueño</TableHead>
                          <TableHead className="font-semibold min-w-[200px]">Compradores</TableHead>
                          <TableHead className="font-semibold min-w-[100px]">Num. Depto</TableHead>
                          <TableHead className="font-semibold min-w-[120px]">Num. Cuenta</TableHead>
                          <TableHead className="font-semibold min-w-[100px]">Tipo</TableHead>
                          <TableHead className="font-semibold min-w-[120px]">Estatus Propiedad</TableHead>
                          <TableHead className="font-semibold min-w-[120px]">Fecha Compra</TableHead>
                          <TableHead className="text-right font-semibold min-w-[150px] text-blue-600">Monto Total a Pagar</TableHead>
                          <TableHead className="text-right font-semibold min-w-[150px] text-green-600">Monto Total Pagado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.map((row, idx) => (
                          <TableRow key={idx} className="hover:bg-muted/30">
                            <TableCell className="font-medium">{String(row.proyecto || '-')}</TableCell>
                            <TableCell>{String(row.dueno || '-')}</TableCell>
                            <TableCell className="max-w-[200px] truncate" title={String(row.compradores || '')}>{String(row.compradores || '-')}</TableCell>
                            <TableCell>{String(row.numero_departamento || '-')}</TableCell>
                            <TableCell className="font-mono text-sm">{renderCuentaCell(row.numero_cuenta, 'numero_cuenta')}</TableCell>
                            <TableCell>{String(row.tipo || '-')}</TableCell>
                            <TableCell>{String(row.estatus_propiedad || '-')}</TableCell>
                            <TableCell>{formatCellValue(row.fecha_compra, 'fecha_compra')}</TableCell>
                            <TableCell className="text-right font-mono text-blue-600">{formatCellValue(row.monto_total_a_pagar, 'monto_total_a_pagar')}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">{formatCellValue(row.monto_total_pagado, 'monto_total_pagado')}</TableCell>
                          </TableRow>
                        ))}
                        {/* Total Row */}
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={8} className="font-bold">Total</TableCell>
                          <TableCell className="text-right font-mono font-bold text-blue-600">
                            {formatCellValue((fullData || []).reduce((sum, row) => sum + (Number(row.monto_total_a_pagar) || 0), 0), 'monto_total_a_pagar')}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-green-600">
                            {formatCellValue((fullData || []).reduce((sum, row) => sum + (Number(row.monto_total_pagado) || 0), 0), 'monto_total_pagado')}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                ) : (
                  /* Chart View - Pie chart */
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Distribución por Tipo (Propiedades vs Productos)</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {liquidadosChartData.length > 0 && liquidadosChartData.some(d => d.value > 0) ? (
                        <div className="h-[400px] flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={liquidadosChartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={140}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {liquidadosChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                              </Pie>
                              <RechartsTooltip 
                                formatter={(value: number, name: string) => [formatCurrencyCompact(value), name]}
                                contentStyle={{ 
                                  backgroundColor: 'hsl(var(--background))', 
                                  border: '1px solid hsl(var(--border))',
                                  borderRadius: '8px'
                                }}
                              />
                              <Legend 
                                formatter={(value, entry) => {
                                  const item = liquidadosChartData.find(d => d.name === value);
                                  return `${value}: ${formatCurrencyCompact(item?.value || 0)} (${item?.percentage}%)`;
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                          {isLoadingFullData ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-5 w-5 animate-spin" />
                              <span>Cargando datos de la gráfica...</span>
                            </div>
                          ) : (
                            <span>No hay datos disponibles para mostrar la gráfica. Intente aplicar filtros.</span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : isPagosMensualesReport && previewData && previewData.length > 0 ? (
              // Special view for "Reporte Mensual de Pagos"
              <div className="space-y-6">
                {/* Summary Cards for Pagos Mensuales */}
                {filteredPagosMensualesData && filteredPagosMensualesData.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-200/50">
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground">Total de Pagos</div>
                        <div className="text-2xl font-bold text-blue-600">{filteredPagosMensualesData.length}</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-200/50">
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground">Monto Total</div>
                        <div className="text-2xl font-bold text-green-600">
                          {formatCurrencyCompact(filteredPagosMensualesData.reduce((sum, row) => sum + (Number(row.monto_pago) || 0), 0))}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-200/50">
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground">Pagos Propiedades</div>
                        <div className="text-2xl font-bold text-purple-600">
                          {formatCurrencyCompact(filteredPagosMensualesData.filter(r => r.tipo === 'propiedad').reduce((sum, row) => sum + (Number(row.monto_pago) || 0), 0))}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-200/50">
                      <CardContent className="p-4">
                        <div className="text-sm text-muted-foreground">Pagos Productos</div>
                        <div className="text-2xl font-bold text-orange-600">
                          {formatCurrencyCompact(filteredPagosMensualesData.filter(r => r.tipo === 'producto').reduce((sum, row) => sum + (Number(row.monto_pago) || 0), 0))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Conditional: Show Table OR Chart based on viewMode */}
                {viewMode === 'table' ? (
                  /* Table view for Pagos Mensuales */
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold min-w-[150px]">Proyecto</TableHead>
                          <TableHead className="font-semibold min-w-[100px]">Num. Depto</TableHead>
                          <TableHead className="font-semibold min-w-[100px]">Tipo</TableHead>
                          <TableHead className="font-semibold min-w-[150px]">Nombre Producto</TableHead>
                          <TableHead className="font-semibold min-w-[120px]">Num. Cuenta</TableHead>
                          <TableHead className="font-semibold min-w-[100px]">Fecha Pago</TableHead>
                          <TableHead className="font-semibold min-w-[120px]">Método Pago</TableHead>
                          <TableHead className="font-semibold min-w-[180px]">Clave Rastreo</TableHead>
                          <TableHead className="font-semibold min-w-[180px]">Cuenta CLABE</TableHead>
                          <TableHead className="font-semibold min-w-[150px]">Concepto</TableHead>
                          <TableHead className="font-semibold min-w-[120px] text-right">Monto</TableHead>
                          <TableHead className="font-semibold min-w-[200px]">Compradores</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPagosMensualesData.slice(0, 100).map((row, idx) => (
                          <TableRow key={idx} className="hover:bg-muted/30">
                            <TableCell>{String(row.proyecto || '-')}</TableCell>
                            <TableCell>{String(row.numero_departamento || '-')}</TableCell>
                            <TableCell>
                              <span className={cn(
                                "px-2 py-1 rounded-full text-xs font-medium",
                                row.tipo === 'propiedad' ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" : 
                                row.tipo === 'producto' ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" : 
                                "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
                              )}>
                                {String(row.tipo || '-')}
                              </span>
                            </TableCell>
                            <TableCell>{String(row.nombre_producto || '-')}</TableCell>
                            <TableCell>{renderCuentaCell(row.numero_cuenta, 'numero_cuenta')}</TableCell>
                            <TableCell>{formatCellValue(row.fecha_pago, 'fecha_pago')}</TableCell>
                            <TableCell>{String(row.metodo_pago || '-')}</TableCell>
                            <TableCell className="font-mono text-xs">{String(row.clave_rastreo || '-')}</TableCell>
                            <TableCell className="font-mono text-xs">{String(row.cuenta_clabe || '-')}</TableCell>
                            <TableCell>{String(row.concepto_pago || '-')}</TableCell>
                            <TableCell className="text-right font-medium">{formatCellValue(row.monto_pago, 'monto_pago')}</TableCell>
                            <TableCell>{String(row.compradores || '-')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                ) : (
                  /* Chart view for Pagos Mensuales - Bar chart by payment method */
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Pagos por Método de Pago</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {pagosMensualesChartData.length > 0 ? (
                        <div className="h-[400px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={pagosMensualesChartData} layout="vertical" margin={{ left: 100, right: 80 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis 
                                type="number" 
                                tickFormatter={(value) => formatCurrencyCompact(value)}
                              />
                              <YAxis 
                                type="category" 
                                dataKey="name" 
                                width={90}
                              />
                              <RechartsTooltip 
                                formatter={(value: number) => [formatCurrencyCompact(value), 'Monto']}
                                contentStyle={{ 
                                  backgroundColor: 'hsl(var(--background))', 
                                  border: '1px solid hsl(var(--border))',
                                  borderRadius: '8px'
                                }}
                              />
                              <Bar dataKey="value" name="Monto" radius={[0, 4, 4, 0]}>
                                {pagosMensualesChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                                <LabelList 
                                  dataKey="value" 
                                  position="right" 
                                  formatter={(value: number) => formatCurrencyCompact(value)}
                                  style={{ fontSize: 12, fill: 'hsl(var(--foreground))' }}
                                />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                          {isLoadingFullData ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-5 w-5 animate-spin" />
                              <span>Cargando datos de la gráfica...</span>
                            </div>
                          ) : (
                            <span>No hay datos disponibles para mostrar la gráfica.</span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
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
                            {renderCuentaCell(row[col], col)}
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
      
      {/* EditCuentaCobranzaDialog for viewing cuenta details */}
      {showCuentaDialog && selectedCuentaId && (
        <EditCuentaCobranzaDialog
          cuenta={{ id: selectedCuentaId, precio_final: 0 }}
          onClose={() => {
            setShowCuentaDialog(false);
            setSelectedCuentaId(null);
          }}
          onUpdate={() => {
            // Refresh report data if needed
            queryClient.invalidateQueries({ queryKey: ['reporte-full-data', id, filtros] });
          }}
        />
      )}
    </div>
  );
}
