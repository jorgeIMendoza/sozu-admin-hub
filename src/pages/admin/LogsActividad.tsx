import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Activity, Search, RefreshCw, Filter } from 'lucide-react';
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

const ALLOWED_EMAIL = 'jorge.mendoza@sozu.com';

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

  // Check authorization
  useEffect(() => {
    if (!isAuthLoading) {
      const userEmail = profile?.email || user?.email;
      if (userEmail !== ALLOWED_EMAIL) {
        navigate('/admin/access-denied');
      }
    }
  }, [profile, user, isAuthLoading, navigate]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('logs_actividad')
        .select(`
          *,
          actividades (nombre)
        `)
        .order('fecha_creacion', { ascending: false })
        .limit(500);

      if (selectedActividad !== 'all') {
        query = query.eq('actividad_id', parseInt(selectedActividad));
      }

      if (selectedAmbiente !== 'all') {
        query = query.eq('ambiente', selectedAmbiente);
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
      fetchLogs();
    }
  }, [profile, user, selectedActividad, selectedAmbiente]);

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      log.usuario_id?.toLowerCase().includes(searchLower) ||
      log.workflow?.toLowerCase().includes(searchLower) ||
      log.actividades?.nombre?.toLowerCase().includes(searchLower)
    );
  });

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
            Últimos 500 registros de actividad
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por usuario, workflow..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
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

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Actividad</TableHead>
                  <TableHead>Workflow</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead>Ambiente</TableHead>
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
                    </TableRow>
                  ))
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
                      <TableCell className="max-w-[150px] truncate" title={log.workflow || ''}>
                        {log.workflow || '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(log.estatus_ejecucion)}</TableCell>
                      <TableCell>{getAmbienteBadge(log.ambiente)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 text-sm text-muted-foreground">
            Mostrando {filteredLogs.length} de {logs.length} registros
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
