import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Activity, Search, RefreshCw, Filter, Eye, ChevronLeft, ChevronRight, Calendar, User, Layers, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';

const ALLOWED_EMAIL = 'jorge.mendoza@sozu.com';
const PAGE_SIZE = 50;

interface LogEntry {
  id: number;
  usuario_id: string;
  actividad_id: number;
  valor_anterior: Record<string, unknown> | null;
  nuevo_valor: Record<string, unknown> | null;
  estatus_ejecucion: string | null;
  ambiente: string | null;
  datos_payload: Record<string, unknown> | null;
  workflow: string | null;
  primer_nodo: string | null;
  ultimo_nodo: string | null;
  id_ejecucion: number | null;
  fecha_creacion: string;
  actividades?: {
    nombre: string;
  };
}

interface Actividad {
  id: number;
  nombre: string;
}

export default function LogsActividad() {
  const { profile, user, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActividad, setSelectedActividad] = useState<string>('all');
  const [selectedAmbiente, setSelectedAmbiente] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [fechaInicio, setFechaInicio] = useState<Date | undefined>(undefined);
  const [fechaFin, setFechaFin] = useState<Date | undefined>(undefined);

  // New filter states
  const [selectedUsuarios, setSelectedUsuarios] = useState<string[]>([]);
  const [selectedWorkflows, setSelectedWorkflows] = useState<string[]>([]);
  const [selectedEstatus, setSelectedEstatus] = useState<string>('all');
  const [availableUsuarios, setAvailableUsuarios] = useState<string[]>([]);
  const [availableWorkflows, setAvailableWorkflows] = useState<string[]>([]);

  // Check authorization
  useEffect(() => {
    if (!isAuthLoading) {
      const userEmail = profile?.email || user?.email;
      if (userEmail !== ALLOWED_EMAIL) {
        navigate('/admin/access-denied');
      }
    }
  }, [profile, user, isAuthLoading, navigate]);

  // Fetch filter options
  const fetchFilterOptions = async () => {
    try {
     // Get unique usuarios from logs - these are the emails that have activity
     // This already includes deleted users since we're reading from logs, not from usuarios table
      const { data: usuariosData } = await supabase
        .from('logs_actividad')
        .select('usuario_id')
        .not('usuario_id', 'is', null)
       .limit(10000);
      
     // Get unique emails and sort them
     const uniqueUsuariosFromLogs = [...new Set(usuariosData?.map(u => u.usuario_id).filter(Boolean) || [])];
     
     // Also fetch all users (including deleted/inactive) to have a complete list
     const { data: allUsersData } = await supabase
       .from('usuarios')
       .select('email')
       .not('email', 'is', null);
     
     const allUserEmails = allUsersData?.map(u => u.email).filter(Boolean) || [];
     
     // Combine both sources and deduplicate
     const uniqueUsuarios = [...new Set([...uniqueUsuariosFromLogs, ...allUserEmails])].sort() as string[];
      setAvailableUsuarios(uniqueUsuarios as string[]);

      // Get unique workflows - use raw SQL via RPC for distinct values
      const { data: workflowsData } = await supabase.rpc('execute_safe_query', {
        query_text: `SELECT DISTINCT workflow FROM logs_actividad WHERE workflow IS NOT NULL ORDER BY workflow`,
        max_rows: 500
      });
      
      const uniqueWorkflows: string[] = [];
      if (Array.isArray(workflowsData)) {
        for (const row of workflowsData) {
          if (typeof row === 'object' && row !== null && 'workflow' in row) {
            const workflow = (row as { workflow: string }).workflow;
            if (workflow) uniqueWorkflows.push(workflow);
          }
        }
      }
      setAvailableWorkflows(uniqueWorkflows);
    } catch (err) {
      console.error('Error fetching filter options:', err);
    }
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      // First get total count
      let countQuery = supabase
        .from('logs_actividad')
        .select('*', { count: 'exact', head: true });

      if (selectedActividad !== 'all') {
        countQuery = countQuery.eq('actividad_id', parseInt(selectedActividad));
      }

      if (selectedAmbiente !== 'all') {
        countQuery = countQuery.eq('ambiente', selectedAmbiente);
      }

      if (fechaInicio) {
        countQuery = countQuery.gte('fecha_creacion', format(fechaInicio, 'yyyy-MM-dd'));
      }

      if (fechaFin) {
        const endDate = new Date(fechaFin);
        endDate.setDate(endDate.getDate() + 1);
        countQuery = countQuery.lt('fecha_creacion', format(endDate, 'yyyy-MM-dd'));
      }

      // Apply new filters to count query
      if (selectedUsuarios.length > 0) {
        countQuery = countQuery.in('usuario_id', selectedUsuarios);
      }

      if (selectedWorkflows.length > 0) {
        countQuery = countQuery.in('workflow', selectedWorkflows);
      }

      if (selectedEstatus !== 'all') {
        countQuery = countQuery.eq('estatus_ejecucion', selectedEstatus);
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // Then fetch paginated data
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('logs_actividad')
        .select(`
          *,
          actividades (nombre)
        `)
        .order('fecha_creacion', { ascending: false })
        .range(from, to);

      if (selectedActividad !== 'all') {
        query = query.eq('actividad_id', parseInt(selectedActividad));
      }

      if (selectedAmbiente !== 'all') {
        query = query.eq('ambiente', selectedAmbiente);
      }

      if (fechaInicio) {
        query = query.gte('fecha_creacion', format(fechaInicio, 'yyyy-MM-dd'));
      }

      if (fechaFin) {
        const endDate = new Date(fechaFin);
        endDate.setDate(endDate.getDate() + 1);
        query = query.lt('fecha_creacion', format(endDate, 'yyyy-MM-dd'));
      }

      // Apply new filters to main query
      if (selectedUsuarios.length > 0) {
        query = query.in('usuario_id', selectedUsuarios);
      }

      if (selectedWorkflows.length > 0) {
        query = query.in('workflow', selectedWorkflows);
      }

      if (selectedEstatus !== 'all') {
        query = query.eq('estatus_ejecucion', selectedEstatus);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching logs:', error);
        return;
      }

      setLogs((data || []) as unknown as LogEntry[]);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchActividades = async () => {
    const { data } = await supabase
      .from('actividades')
      .select('id, nombre')
      .eq('activo', true)
      .order('nombre');
    
    setActividades(data || []);
  };

  useEffect(() => {
    const userEmail = profile?.email || user?.email;
    if (userEmail === ALLOWED_EMAIL) {
      fetchActividades();
      fetchFilterOptions();
    }
  }, [profile, user]);

  useEffect(() => {
    const userEmail = profile?.email || user?.email;
    if (userEmail === ALLOWED_EMAIL) {
      fetchLogs();
    }
  }, [profile, user, selectedActividad, selectedAmbiente, currentPage, fechaInicio, fechaFin, selectedUsuarios, selectedWorkflows, selectedEstatus]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedActividad, selectedAmbiente, fechaInicio, fechaFin, selectedUsuarios, selectedWorkflows, selectedEstatus]);

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      log.usuario_id?.toLowerCase().includes(searchLower) ||
      log.workflow?.toLowerCase().includes(searchLower) ||
      log.actividades?.nombre?.toLowerCase().includes(searchLower) ||
      getEntidadFromLog(log)?.toLowerCase().includes(searchLower)
    );
  });

  const getEntidadFromLog = (log: LogEntry): string => {
    // Extract entity/menu from workflow or nuevo_valor
    if (log.workflow) {
      return log.workflow;
    }
    if (log.nuevo_valor && typeof log.nuevo_valor === 'object') {
      // Check for common entity indicators
      if ('entidad' in log.nuevo_valor) return String(log.nuevo_valor.entidad);
      if ('tabla' in log.nuevo_valor) return String(log.nuevo_valor.tabla);
      if ('tipo' in log.nuevo_valor) return String(log.nuevo_valor.tipo);
      if ('ruta' in log.nuevo_valor) return String(log.nuevo_valor.ruta);
    }
    if (log.datos_payload && typeof log.datos_payload === 'object') {
      if ('entidad' in log.datos_payload) return String(log.datos_payload.entidad);
      if ('tabla' in log.datos_payload) return String(log.datos_payload.tabla);
    }
    return '-';
  };

  const getStatusBadge = (estatus: string | null) => {
    if (!estatus) return null;
    const variant = estatus === 'exito' ? 'default' : 'destructive';
    return <Badge variant={variant}>{estatus}</Badge>;
  };

  const getAmbienteBadge = (ambiente: string | null) => {
    if (!ambiente) return null;
    const colors: Record<string, string> = {
      production: 'bg-red-500/10 text-red-500 border-red-500/20',
      staging: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      development: 'bg-green-500/10 text-green-500 border-green-500/20',
    };
    return (
      <Badge variant="outline" className={colors[ambiente] || ''}>
        {ambiente}
      </Badge>
    );
  };

  const openDetailDialog = (log: LogEntry) => {
    setSelectedLog(log);
    setDetailDialogOpen(true);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const clearDateFilters = () => {
    setFechaInicio(undefined);
    setFechaFin(undefined);
  };

  // Auth check
  const userEmail = profile?.email || user?.email;
  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (userEmail !== ALLOWED_EMAIL) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Activity className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Logs de Actividad</h1>
          <p className="text-muted-foreground">
            Registro de todas las actividades del sistema
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Historial de Actividades</span>
            <Button variant="outline" size="sm" onClick={fetchLogs}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualizar
            </Button>
          </CardTitle>
          <CardDescription>
            {totalCount} registros en total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <Select value={selectedActividad} onValueChange={setSelectedActividad}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Tipo de actividad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las actividades</SelectItem>
                  {actividades.map((act) => (
                    <SelectItem key={act.id} value={act.id.toString()}>
                      {act.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedAmbiente} onValueChange={setSelectedAmbiente}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Ambiente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los ambientes</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* New Advanced Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <MultiSelectFilter
                values={selectedUsuarios}
                onValuesChange={setSelectedUsuarios}
                options={availableUsuarios}
                placeholder="Usuario"
                searchPlaceholder="Buscar usuario..."
                emptyText="No se encontraron usuarios"
                className="w-full sm:w-[220px]"
                icon={<User className="h-4 w-4" />}
              />
              <MultiSelectFilter
                values={selectedWorkflows}
                onValuesChange={setSelectedWorkflows}
                options={availableWorkflows}
                placeholder="Entidad/Menú"
                searchPlaceholder="Buscar entidad..."
                emptyText="No se encontraron entidades"
                className="w-full sm:w-[220px]"
                icon={<Layers className="h-4 w-4" />}
              />
              <Select value={selectedEstatus} onValueChange={setSelectedEstatus}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Estatus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estatus</SelectItem>
                  <SelectItem value="exito">Éxito</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Fecha:</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full sm:w-[180px] justify-start text-left font-normal",
                      !fechaInicio && "text-muted-foreground"
                    )}
                  >
                    {fechaInicio ? format(fechaInicio, 'dd/MM/yyyy', { locale: es }) : "Desde"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={fechaInicio}
                    onSelect={setFechaInicio}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full sm:w-[180px] justify-start text-left font-normal",
                      !fechaFin && "text-muted-foreground"
                    )}
                  >
                    {fechaFin ? format(fechaFin, 'dd/MM/yyyy', { locale: es }) : "Hasta"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={fechaFin}
                    onSelect={setFechaFin}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {(fechaInicio || fechaFin) && (
                <Button variant="ghost" size="sm" onClick={clearDateFilters}>
                  Limpiar fechas
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Actividad</TableHead>
                  <TableHead>Entidad/Menú</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead>Ambiente</TableHead>
                  <TableHead className="w-[60px]">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No se encontraron registros
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-sm">
                        {format(new Date(log.fecha_creacion), 'dd/MM/yyyy HH:mm:ss', { locale: es })}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={log.usuario_id}>
                        {log.usuario_id}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {log.actividades?.nombre || `ID: ${log.actividad_id}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={getEntidadFromLog(log)}>
                        <Badge variant="outline">
                          {getEntidadFromLog(log)}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(log.estatus_ejecucion)}</TableCell>
                      <TableCell>{getAmbienteBadge(log.ambiente)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDetailDialog(log)}
                          title="Ver detalle"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              Mostrando {filteredLogs.length} de {totalCount} registros (Página {currentPage} de {totalPages || 1})
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      disabled={isLoading}
                      className="w-8 h-8 p-0"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || isLoading}
              >
                Siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Detalle del Registro
            </DialogTitle>
            <DialogDescription>
              {selectedLog && format(new Date(selectedLog.fecha_creacion), "dd 'de' MMMM 'de' yyyy 'a las' HH:mm:ss", { locale: es })}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Usuario</span>
                    <p className="text-sm">{selectedLog.usuario_id}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Actividad</span>
                    <p className="text-sm">{selectedLog.actividades?.nombre || `ID: ${selectedLog.actividad_id}`}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Entidad/Menú</span>
                    <p className="text-sm">{getEntidadFromLog(selectedLog)}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Estatus</span>
                    <p className="text-sm">{getStatusBadge(selectedLog.estatus_ejecucion)}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Ambiente</span>
                    <p className="text-sm">{getAmbienteBadge(selectedLog.ambiente)}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-muted-foreground">Workflow</span>
                    <p className="text-sm">{selectedLog.workflow || '-'}</p>
                  </div>
                </div>

                {/* Valor Anterior */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500/50"></span>
                    Valor Anterior
                  </h4>
                  <div className="bg-muted/50 rounded-md p-4 overflow-x-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                      {selectedLog.valor_anterior 
                        ? JSON.stringify(selectedLog.valor_anterior, null, 2) 
                        : 'Sin datos anteriores'}
                    </pre>
                  </div>
                </div>

                {/* Nuevo Valor */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500/50"></span>
                    Nuevo Valor
                  </h4>
                  <div className="bg-muted/50 rounded-md p-4 overflow-x-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                      {selectedLog.nuevo_valor 
                        ? JSON.stringify(selectedLog.nuevo_valor, null, 2) 
                        : 'Sin datos nuevos'}
                    </pre>
                  </div>
                </div>

                {/* Datos Payload */}
                {selectedLog.datos_payload && Object.keys(selectedLog.datos_payload).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500/50"></span>
                      Datos Adicionales (Payload)
                    </h4>
                    <div className="bg-muted/50 rounded-md p-4 overflow-x-auto">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                        {JSON.stringify(selectedLog.datos_payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
