import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, Loader2, FileSpreadsheet, CalendarIcon, Table, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
        .eq('id_tipo_entidad', 5) // Tipo Inmobiliaria
        .ilike('personas.nombre_legal', '%Real Estate Ventures%');

      if (error) throw error;
      return data?.map(er => er.id_proyecto) || [];
    }
  });

  // Fetch the report
  const { data: reporte, isLoading } = useQuery({
    queryKey: ['reporte', id],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from('reportes')
        .select('id, nombre, descripcion, filtros_configuracion, nombre_archivo')
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

  // Fetch options for select filters
  const { data: filterOptions = {} } = useQuery({
    queryKey: ['filter-options-viewer', id, filtros, realEstateProjectIds],
    queryFn: async () => {
      if (!reporte) return {};

      const options: Record<string, { value: string; label: string }[]> = {};

      for (const filtro of reporte.filtros_configuracion) {
        // Skip daterange and non-select types
        if (filtro.tipo === 'daterange' || filtro.tipo === 'date' || filtro.tipo === 'text') continue;

        // Skip dependent filters if parent is not selected
        if (filtro.depende_de && !filtros[filtro.depende_de]) {
          options[filtro.nombre] = [];
          continue;
        }

        if (filtro.tipo === 'select' && filtro.query_opciones && filtro.depende_de) {
          // Dynamic query for dependent filter
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
          // Special handling for proyectos - filter by Real Estate
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
    
    // Reset dependent filters when parent changes
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

      // Create download link
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

    // text type
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

  if (permissionsLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[calc(100vh-120px)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!reporte) {
    return (
      <div className="p-6">
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
      </div>
    );
  }

  return (
    <div className="h-full min-h-[calc(100vh-120px)] flex flex-col p-6">
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

      {/* Content */}
      <Card className="flex-1">
        <CardHeader>
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
                <Table className="h-4 w-4" />
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
        <CardContent className="space-y-6">
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
          <div className="border rounded-lg p-8 min-h-[400px] flex items-center justify-center bg-muted/30">
            <div className="text-center text-muted-foreground">
              <FileSpreadsheet className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Vista previa del reporte</p>
              <p className="text-sm">Aplica los filtros y exporta el reporte a Excel</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
