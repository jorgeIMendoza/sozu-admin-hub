import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, Loader2, DollarSign, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { supabase } from "@/integrations/supabase/client";
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

export default function ReportesFinanzas() {
  const navigate = useNavigate();
  const { canRead, isSuperAdmin, isLoading: permissionsLoading } = usePagePermissions('/admin/reportes/finanzas');

  const [searchTerm, setSearchTerm] = useState("");

  // Fetch available reports for this submenu
  const { data: reportes = [], isLoading } = useQuery({
    queryKey: ['reportes-finanzas'],
    queryFn: async () => {
      const { data: submenu } = await supabase
        .from('submenus')
        .select('id')
        .eq('vista_front_end', '/admin/reportes/finanzas')
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

  // Filter reports based on search term
  const filteredReportes = useMemo(() => {
    if (!searchTerm.trim()) return reportes;
    const term = searchTerm.toLowerCase();
    return reportes.filter(r => 
      r.nombre.toLowerCase().includes(term) || 
      (r.descripcion && r.descripcion.toLowerCase().includes(term))
    );
  }, [reportes, searchTerm]);

  const handleSelectReporte = (reporteId: string) => {
    navigate(`/admin/reportes/ver/${reporteId}?return=/admin/reportes/finanzas`);
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
            <DollarSign className="h-6 w-6" />
            Reportes de Finanzas
          </h1>
          <p className="text-muted-foreground">Selecciona un reporte para ver los detalles y exportar</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
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
                  <TooltipProvider key={reporte.id}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Card
                          className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                          onClick={() => handleSelectReporte(reporte.id.toString())}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-2">
                              <FileSpreadsheet className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-sm line-clamp-2">{reporte.nombre}</h3>
                                {reporte.descripcion && (
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {reporte.descripcion}
                                  </p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        <p className="font-medium">{reporte.nombre}</p>
                        {reporte.descripcion && (
                          <p className="text-xs text-muted-foreground mt-1">{reporte.descripcion}</p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
            </div>
          ) : reportes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay reportes de finanzas configurados</p>
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
    </div>
  );
}
