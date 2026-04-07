import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bell, CheckCircle, XCircle, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface NotificacionLog {
  id: number;
  tipo_evento: string;
  canal: string;
  destinatarios_count: number;
  id_proyecto: number | null;
  nombre_desarrollo: string | null;
  resultado: string;
  error_detalle: string | null;
  created_at: string;
}

const NotificacionesLog = () => {
  const [filtroResultado, setFiltroResultado] = useState<string>('todos');
  const [filtroEvento, setFiltroEvento] = useState<string>('');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['notificaciones-log', filtroResultado, filtroEvento],
    queryFn: async () => {
      let query = supabase
        .from('notificaciones_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (filtroResultado !== 'todos') {
        query = query.eq('resultado', filtroResultado);
      }
      if (filtroEvento) {
        query = query.ilike('tipo_evento', `%${filtroEvento}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as NotificacionLog[];
    },
  });

  const canalLabel = (canal: string) => {
    switch (canal) {
      case 'email': return 'Email';
      case 'whatsapp': return 'WhatsApp';
      case 'ambos': return 'Email + WA';
      default: return canal;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bell className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Logs de Notificaciones</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="w-48">
            <label className="text-sm text-muted-foreground mb-1 block">Resultado</label>
            <Select value={filtroResultado} onValueChange={setFiltroResultado}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="success">Exitoso</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-64">
            <label className="text-sm text-muted-foreground mb-1 block">Tipo de evento</label>
            <Input
              placeholder="Buscar evento..."
              value={filtroEvento}
              onChange={(e) => setFiltroEvento(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Cargando logs...</div>
          ) : !logs?.length ? (
            <div className="p-8 text-center text-muted-foreground">No hay registros de notificaciones</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead className="text-center">Destinatarios</TableHead>
                    <TableHead>Proyecto</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {log.tipo_evento}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{canalLabel(log.canal)}</TableCell>
                      <TableCell className="text-center font-medium">{log.destinatarios_count}</TableCell>
                      <TableCell className="text-sm">{log.nombre_desarrollo || '-'}</TableCell>
                      <TableCell>
                        {log.resultado === 'success' ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                            <CheckCircle className="h-3 w-3 mr-1" /> Exitoso
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" /> Error
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-destructive max-w-xs truncate">
                        {log.error_detalle || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificacionesLog;
