import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Search, Copy, Check, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/usePagination";
import { SimplePagination } from "@/components/ui/simple-pagination";

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

interface ParsedErrorItem {
  email: string;
  codigo: string;
  motivo: string;
}

const estadoColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completado: 'default',
  error: 'destructive',
  parcial: 'secondary',
};

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function translateErrorMessage(code: string | undefined, raw: string) {
  const normalized = raw.replace(/^undefined:\s*/i, '').trim();

  if (code === '406' || /marked as inactive|inactive recipients/i.test(normalized)) {
    return 'Correo inactivo (rebote previo o queja de spam)';
  }

  if (code === '300' || /invalid email|is not a valid email/i.test(normalized)) {
    return 'Correo inválido';
  }

  if (code === '405') {
    return 'No permitido enviar a este destinatario';
  }

  if (/From' address you supplied/i.test(normalized)) {
    return 'El remitente configurado no está autorizado en Postmark';
  }

  return normalized || 'Error desconocido';
}

function parseDetalleErrores(raw: string): ParsedErrorItem[] {
  if (!raw.trim()) return [];

  return raw
    .split(' | ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      try {
        const parsed = JSON.parse(part);
        return {
          email: String(parsed.email || 'Correo no identificado'),
          codigo: String(parsed.codigo || '—'),
          motivo: String(parsed.motivo || 'Error desconocido'),
        };
      } catch {
        const email = part.match(EMAIL_REGEX)?.[0] || 'Correo no identificado';
        const codigo = part.match(/\[(\d+)\]/)?.[1] || '—';

        return {
          email,
          codigo,
          motivo: translateErrorMessage(codigo === '—' ? undefined : codigo, part),
        };
      }
    });
}

function buildCopyText(items: ParsedErrorItem[], totalErrores: number) {
  const lines = items.map((item, index) => {
    const suffix = item.codigo !== '—' ? ` (código ${item.codigo})` : '';
    return `${index + 1}. ${item.email} — ${item.motivo}${suffix}`;
  });

  if (totalErrores > items.length) {
    lines.push('', `Nota: esta ejecución antigua solo guardó ${items.length} de ${totalErrores} errores en el detalle.`);
  }

  return lines.join('\n');
}

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

  const parsedErrors = useMemo(
    () => parseDetalleErrores(errorDetail?.detalle_error || ''),
    [errorDetail?.detalle_error]
  );

  const hiddenErrorCount = Math.max(
    0,
    (errorDetail?.total_errores ?? 0) - parsedErrors.length
  );

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

  const { paginated: pagedEjec, page, setPage, totalPages, total, from, to } = usePagination(filtered, 50);

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
            ) : pagedEjec.map(e => (
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
        <SimplePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          total={total}
          from={from}
          to={to}
        />
      </div>

      <Dialog open={!!errorDetail} onOpenChange={() => setErrorDetail(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Detalle de Error</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Aviso: <strong>{(errorDetail?.avisos as any)?.nombre}</strong> — {errorDetail && new Date(errorDetail.fecha_ejecucion).toLocaleString('es-MX')}
            </p>

            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                {errorDetail?.total_errores} error{(errorDetail?.total_errores ?? 0) > 1 ? 'es' : ''} de {errorDetail?.total_destinatarios} destinatarios
              </div>
              {hiddenErrorCount > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-destructive shrink-0" />
                  <span>
                    Esta ejecución antigua solo guardó <strong>{parsedErrors.length}</strong> detalles de <strong>{errorDetail?.total_errores}</strong> errores. Los próximos envíos ya guardan todos completos.
                  </span>
                </div>
              )}
            </div>

            <ScrollArea className="h-[360px] rounded-lg border bg-muted/40 pr-3">
              <div className="space-y-2 p-4">
                {parsedErrors.length > 0 ? parsedErrors.map((err, i) => (
                  <div key={`${err.email}-${i}`} className="flex items-start gap-2 rounded-md border border-border/60 bg-background/80 p-3 text-sm">
                    <Badge variant="destructive" className="shrink-0 text-xs">{err.codigo}</Badge>
                    <div className="min-w-0">
                      <p className="font-medium break-all">{err.email}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">{err.motivo}</p>
                    </div>
                  </div>
                )) : (
                  <p className="p-4 text-sm text-muted-foreground">Sin detalle disponible.</p>
                )}
              </div>
            </ScrollArea>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopyError(buildCopyText(parsedErrors, errorDetail?.total_errores ?? parsedErrors.length))}
              disabled={parsedErrors.length === 0}
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
