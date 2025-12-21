import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Download, Loader2, Info, Search, BarChart3, Table, Check, Package, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { cn } from "@/lib/utils";

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

export default function ReportesInventarios() {
  const { toast } = useToast();
  const { canRead, canExport, isSuperAdmin, isLoading: permissionsLoading } = usePagePermissions('/admin/reportes/inventarios');
  const { registrarExportacion } = useActivityLogger();

  const [selectedReporteId, setSelectedReporteId] = useState<string>("");
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');

  // Fetch available reports for this submenu
  const { data: reportes = [], isLoading } = useQuery({
    queryKey: ['reportes-inventarios'],
    queryFn: async () => {
      const { data: submenu } = await supabase
        .from('submenus')
        .select('id')
        .eq('vista_front_end', '/admin/reportes/inventarios')
        .single();

      if (!submenu) return [];

      const { data, error } = await supabase
        .from('reportes')
        .select('id, nombre, descripcion, filtros_configuracion, nombre_archivo')
        .eq('id_submenu', submenu.id)
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;
      return (data || []).map(r => ({
        ...r,
        filtros_configuracion: (r.filtros_configuracion || []) as unknown as FiltroConfig[]
      })) as Reporte[];
    },
  });

  const selectedReporte = reportes.find(r => r.id.toString() === selectedReporteId);

  // Filter reports based on search term
  const filteredReportes = useMemo(() => {
    if (!searchTerm.trim()) return reportes;
    const term = searchTerm.toLowerCase();
    return reportes.filter(r => 
      r.nombre.toLowerCase().includes(term) || 
      (r.descripcion && r.descripcion.toLowerCase().includes(term))
    );
  }, [reportes, searchTerm]);

  // Fetch options for select filters
  const { data: filterOptions = {} } = useQuery({
    queryKey: ['filter-options-inventarios', selectedReporteId, filtros],
    queryFn: async () => {
      if (!selectedReporte) return {};

      const options: Record<string, { value: string; label: string }[]> = {};

      for (const filtro of selectedReporte.filtros_configuracion) {
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
          const { data } = await supabase
            .from(filtro.tabla as 'proyectos' | 'estatus_disponibilidad')
            .select('*')
            .eq('activo', true);

          options[filtro.nombre] = ((data as unknown as Record<string, unknown>[]) || []).map((item) => ({
            value: String(item[filtro.campo_valor || 'id']),
            label: String(item[filtro.campo_label || 'nombre']),
          }));
        } else if (filtro.tipo === 'select' && filtro.opciones) {
          options[filtro.nombre] = filtro.opciones.map(opt => ({ value: opt, label: opt }));
        }
      }

      return options;
    },
    enabled: !!selectedReporte,
  });

  const handleSelectReporte = (reporteId: string) => {
    setSelectedReporteId(reporteId);
    setFiltros({});
  };

  const handleFilterChange = (filterName: string, value: string) => {
    const newFiltros = { ...filtros, [filterName]: value };
    
    // Reset dependent filters when parent changes
    if (selectedReporte) {
      selectedReporte.filtros_configuracion.forEach(f => {
        if (f.depende_de === filterName) {
          newFiltros[f.nombre] = "";
        }
      });
    }
    
    setFiltros(newFiltros);
  };

  const handleExport = async () => {
    if (!selectedReporte) return;

    setIsExporting(true);
    try {
      const response = await supabase.functions.invoke('exportar-reporte', {
        body: {
          id_reporte: selectedReporte.id,
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
      a.download = `${selectedReporte.nombre_archivo}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      await registrarExportacion('reportes_inventarios', {
        id_reporte: selectedReporte.id,
        nombre_reporte: selectedReporte.nombre,
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
            <SelectValue placeholder={isDisabled ? `Selecciona ${selectedReporte?.filtros_configuracion.find(f => f.nombre === filtro.depende_de)?.label || 'el filtro anterior'} primero` : `Seleccionar ${filtro.label.toLowerCase()}...`} />
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Reportes de Inventarios
          </h1>
          <p className="text-muted-foreground">Selecciona un reporte y aplica filtros para exportar</p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-6">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar reportes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Report Cards Grid */}
          {filteredReportes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredReportes.map((reporte) => (
                <Card
                  key={reporte.id}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md hover:border-primary/50",
                    selectedReporteId === reporte.id.toString() && "border-primary bg-primary/5 ring-1 ring-primary"
                  )}
                  onClick={() => handleSelectReporte(reporte.id.toString())}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
                          <h3 className="font-medium text-sm truncate">{reporte.nombre}</h3>
                        </div>
                        {reporte.descripcion && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {reporte.descripcion}
                          </p>
                        )}
                      </div>
                      {selectedReporteId === reporte.id.toString() && (
                        <div className="shrink-0 ml-2">
                          <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                            <Check className="h-3 w-3 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : reportes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay reportes de inventarios configurados</p>
              <p className="text-sm">Contacta al administrador para agregar reportes</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No se encontraron reportes con "{searchTerm}"</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters and Actions */}
      {selectedReporte && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {selectedReporte.nombre}
            </CardTitle>
            {selectedReporte.descripcion && (
              <CardDescription>{selectedReporte.descripcion}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-4">
              <Label className="text-sm text-muted-foreground">Modo de visualización:</Label>
              <div className="flex items-center gap-2">
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

            {/* Dynamic Filters */}
            {selectedReporte.filtros_configuracion.length > 0 && (
              <div className="space-y-4">
                <Label className="text-base font-semibold">Filtros</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectedReporte.filtros_configuracion.map((filtro) => {
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
                                  <p>Requiere seleccionar {selectedReporte.filtros_configuracion.find(f => f.nombre === filtro.depende_de)?.label || filtro.depende_de} primero</p>
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

            {/* Export Button */}
            {(canExport || isSuperAdmin) && (
              <div className="flex justify-end pt-4 border-t">
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
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
