import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Ejecucion {
  id: number;
  aviso_id: number;
  fecha_ejecucion: string;
  tipo_trigger: string;
  total_destinatarios: number | null;
  total_enviados: number | null;
  total_errores: number | null;
  estado: string;
  detalle_error: string | null;
  avisos: { nombre: string } | null;
}

interface AvisoOption {
  id: number;
  nombre: string;
}

const estadoColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completado: 'default',
  enviando: 'secondary',
  pendiente: 'outline',
  error: 'destructive',
};

export default function Ejecuciones() {
  const { isLoading: permLoading } = usePagePermissions('/admin/comunicacion/ejecuciones');

  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([]);
  const [avisos, setAvisos] = useState<AvisoOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAviso, setFilterAviso] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const fetchData = async () => {
    setIsLoading(true);
    const [{ data: ejData }, { data: avData }] = await Promise.all([
      supabase.from('avisos_ejecuciones').select('*, avisos(nombre)').order('fecha_ejecucion', { ascending: false }).limit(200),
      supabase.from('avisos').select('id, nombre').order('nombre'),
    ]);
    setEjecuciones((ejData as any) || []);
    setAvisos(avData || []);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = ejecuciones.filter(e => {
    if (filterAviso !== 'all' && e.aviso_id !== parseInt(filterAviso)) return false;
    if (searchTerm) {
      const name = (e.avisos as any)?.nombre || '';
      if (!name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    }
    return true;
  });

  // Chart data: group by date
  const chartData = (() => {
    const map = new Map<string, { date: string; enviados: number; errores: number }>();
    filtered.forEach(e => {
      const date = new Date(e.fecha_ejecucion).toLocaleDateString('es-MX');
      const existing = map.get(date) || { date, enviados: 0, errores: 0 };
      existing.enviados += e.total_enviados || 0;
      existing.errores += e.total_errores || 0;
      map.set(date, existing);
    });
    return Array.from(map.values()).reverse().slice(-14);
  })();

  if (permLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ejecuciones de Avisos</h1>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-4">Envíos por día (últimos 14 días)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="enviados" fill="hsl(var(--primary))" name="Enviados" />
              <Bar dataKey="errores" fill="hsl(var(--destructive))" name="Errores" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterAviso} onValueChange={setFilterAviso}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrar por aviso" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los avisos</SelectItem>
            {avisos.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Aviso</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead className="text-right">Destinatarios</TableHead>
              <TableHead className="text-right">Enviados</TableHead>
              <TableHead className="text-right">Errores</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay ejecuciones</TableCell></TableRow>
            ) : filtered.map(e => (
              <TableRow key={e.id}>
                <TableCell className="text-sm">{new Date(e.fecha_ejecucion).toLocaleString('es-MX')}</TableCell>
                <TableCell className="font-medium">{(e.avisos as any)?.nombre || '—'}</TableCell>
                <TableCell>
                  <Badge variant="outline">{e.tipo_trigger}</Badge>
                </TableCell>
                <TableCell className="text-right">{e.total_destinatarios ?? 0}</TableCell>
                <TableCell className="text-right">{e.total_enviados ?? 0}</TableCell>
                <TableCell className="text-right">{e.total_errores ?? 0}</TableCell>
                <TableCell>
                  <Badge variant={estadoColors[e.estado] || 'outline'}>{e.estado}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
