import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search, Copy, Check } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";

interface Ejecucion {
  id: number;
  id_aviso: number;
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
  error: 'destructive',
};

export default function Ejecuciones() {
  const { isLoading: permLoading } = usePagePermissions('/admin/comunicacion/ejecuciones');
  const { toast } = useToast();

  const [ejecuciones, setEjecuciones] = useState<Ejecucion[]>([]);
  const [avisos, setAvisos] = useState<AvisoOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterAviso, setFilterAviso] = useState<string>("all");
  const [filterEstado, setFilterEstado] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [errorDetail, setErrorDetail] = useState<Ejecucion | null>(null);
  const [copied, setCopied] = useState(false);

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
    if (filterAviso !== 'all' && e.id_aviso !== parseInt(filterAviso)) return false;
    if (filterEstado !== 'all' && e.estado !== filterEstado) return false;
    if (searchTerm) {
      const name = (e.avisos as any)?.nombre || '';
      if (!name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    }
    return true;
  });

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

  const handleCopyError = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copiado", description: "Detalle de error copiado al portapapeles" });
    setTimeout(() => setCopied(false), 2000);
  };

  if (permLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Ejecuciones de Avisos</h1>

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
        <Select value={filterEstado} onValueChange={setFilterEstado}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filtrar por estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="completado">Completado</SelectItem>
            <SelectItem value="error">Error</SelectItem>
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
                <TableCell className="text-right">
                  {(e.total_errores ?? 0) > 0 && e.detalle_error ? (
                    <Badge variant="destructive" className="cursor-pointer" onClick={() => setErrorDetail(e)}>
                      {e.total_errores}
                    </Badge>
                  ) : (e.total_errores ?? 0)}
                </TableCell>
                <TableCell>
                  {e.estado === 'error' && e.detalle_error ? (
                    <Badge
                      variant="destructive"
                      className="cursor-pointer"
                      onClick={() => setErrorDetail(e)}
                    >
                      error
                    </Badge>
                  ) : (
                    <Badge variant={estadoColors[e.estado] || 'outline'}>{e.estado}</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Error Detail Dialog */}
      <Dialog open={!!errorDetail} onOpenChange={() => setErrorDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de Error</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Aviso: <strong>{(errorDetail?.avisos as any)?.nombre}</strong> — {errorDetail && new Date(errorDetail.fecha_ejecucion).toLocaleString('es-MX')}
            </p>
            <div className="text-sm text-muted-foreground mb-2">
              {errorDetail?.total_errores} error{(errorDetail?.total_errores ?? 0) > 1 ? 'es' : ''} de {errorDetail?.total_destinatarios} destinatarios
            </div>
            <div className="bg-muted rounded-lg p-4 max-h-[300px] overflow-y-auto space-y-2">
              {(() => {
                const raw = errorDetail?.detalle_error || '';
                // Try to parse structured JSON errors (new format)
                const parts = raw.split(' | ');
                const parsed = parts.map(p => {
                  try { return JSON.parse(p); } catch { return null; }
                }).filter(Boolean);

                if (parsed.length > 0) {
                  return parsed.map((err: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <Badge variant="destructive" className="shrink-0 text-xs">{err.codigo}</Badge>
                      <div>
                        <p className="font-medium break-all">{err.email}</p>
                        <p className="text-muted-foreground text-xs">{err.motivo}</p>
                      </div>
                    </div>
                  ));
                }

                // Fallback: old format - split by | and show as list
                return parts.map((part: string, i: number) => {
                  const trimmed = part.trim();
                  // Try to extract email from old format "email: [code] message"
                  const match = trimmed.match(/^(?:undefined:\s*)?\[(\d+)\]\s*.*?addresses?:\s*([^\s.]+)/i);
                  if (match) {
                    return (
                      <div key={i} className="flex items-start gap-2 text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
                        <Badge variant="destructive" className="shrink-0 text-xs">{match[1]}</Badge>
                        <div>
                          <p className="font-medium break-all">{match[2]}</p>
                          <p className="text-muted-foreground text-xs">Correo inactivo (rebote previo o queja de spam)</p>
                        </div>
                      </div>
                    );
                  }
                  return <p key={i} className="text-sm text-muted-foreground break-all">{trimmed}</p>;
                });
              })()}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!errorDetail?.detalle_error) return;
                // For copy, extract just emails
                const parts = errorDetail.detalle_error.split(' | ');
                const parsed = parts.map(p => { try { return JSON.parse(p); } catch { return null; } }).filter(Boolean);
                const text = parsed.length > 0
                  ? parsed.map((e: any) => `${e.email} - ${e.motivo}`).join('\n')
                  : errorDetail.detalle_error;
                handleCopyError(text);
              }}
              disabled={!errorDetail?.detalle_error}
            >
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? 'Copiado' : 'Copiar detalle'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
