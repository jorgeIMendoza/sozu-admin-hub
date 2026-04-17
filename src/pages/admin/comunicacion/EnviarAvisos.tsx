import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Send, Search, Eye, Clock, Users, Mail } from "lucide-react";
import { usePagination } from "@/hooks/usePagination";
import { SimplePagination } from "@/components/ui/simple-pagination";

interface AvisoRolDestinatario {
  correos: { destinatarios?: { nombre?: string; email?: string }[] } | null;
}

interface Aviso {
  id: number;
  nombre: string;
  asunto: string;
  mensaje_html: string;
  tipo_envio: string;
  cron_expression: string | null;
  activo: boolean;
  destinatarios_count: number;
  postmark_template_id: number;
}

const DIAS_SEMANA: Record<string, string> = { '0': 'domingo', '1': 'lunes', '2': 'martes', '3': 'miércoles', '4': 'jueves', '5': 'viernes', '6': 'sábado', '7': 'domingo' };
const MESES: Record<string, string> = { '1': 'enero', '2': 'febrero', '3': 'marzo', '4': 'abril', '5': 'mayo', '6': 'junio', '7': 'julio', '8': 'agosto', '9': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre' };

const countUniqueEmails = (roles: AvisoRolDestinatario[]): number => {
  const emailSet = new Set<string>();
  for (const row of roles) {
    const destinatarios = (row.correos as any)?.destinatarios || [];
    for (const dest of destinatarios) {
      if (dest.email) emailSet.add(dest.email);
    }
  }
  return emailSet.size;
};

function validateCronField(field: string, min: number, max: number): boolean {
  if (field === '*') return true;
  const stepMatch = field.match(/^(.+)\/(\d+)$/);
  let base = field;
  if (stepMatch) {
    const step = parseInt(stepMatch[2], 10);
    if (isNaN(step) || step < 1) return false;
    base = stepMatch[1];
    if (base === '*') return true;
  }
  const parts = base.split(',');
  for (const part of parts) {
    if (part.includes('-')) {
      const [a, b] = part.split('-');
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (isNaN(na) || isNaN(nb)) return false;
      if (na < min || na > max || nb < min || nb > max) return false;
      if (na > nb) return false;
    } else {
      const n = parseInt(part, 10);
      if (isNaN(n)) return false;
      if (n < min || n > max) return false;
    }
  }
  return true;
}

function validateCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const ranges = [{ min: 0, max: 59 }, { min: 0, max: 23 }, { min: 1, max: 31 }, { min: 1, max: 12 }, { min: 0, max: 7 }];
  for (let i = 0; i < 5; i++) {
    if (!validateCronField(parts[i], ranges[i].min, ranges[i].max)) return false;
  }
  return true;
}

function formatList(items: string[], joinWord = 'y'): string {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ` ${joinWord} ` + items[items.length - 1];
}

function describeCron(expr: string): string {
  if (!validateCron(expr)) return 'Expresión cron inválida';

  const parts = expr.trim().split(/\s+/);
  const [min, hour, dom, mon, dow] = parts;

  let time = '';
  if (min.startsWith('*/') && hour === '*') {
    time = `cada ${min.slice(2)} minutos`;
  } else if (min.startsWith('*/') && hour !== '*' && !hour.startsWith('*/') && !hour.includes('-')) {
    time = `cada ${min.slice(2)} minutos de ${hour}:00 a ${hour}:59`;
  } else if (min.includes(',') && hour !== '*' && !hour.startsWith('*/') && !hour.includes('-')) {
    const mins = min.split(',').map(m => `${hour}:${m.padStart(2, '0')}`);
    time = `a las ${formatList(mins)}`;
  } else if (min.includes('-') && min.includes('/') && hour !== '*' && !hour.startsWith('*/') && !hour.includes('-')) {
    const [range, step] = min.split('/');
    const [minStart, minEnd] = range.split('-');
    time = `cada ${step} minutos de ${hour}:${minStart.padStart(2, '0')} a ${hour}:${minEnd.padStart(2, '0')}`;
  } else if (hour.startsWith('*/') && min === '*') {
    time = `cada ${hour.slice(2)} horas`;
  } else if (hour.includes('-') && !hour.startsWith('*/')) {
    const [startHour, endHour] = hour.split('-');
    if (min !== '*' && !min.includes('*') && !min.includes(',') && !min.includes('-')) {
      time = `a las ${startHour}:${min.padStart(2, '0')} a ${endHour}:${min.padStart(2, '0')}`;
    } else if (min.startsWith('*/')) {
      time = `cada ${min.slice(2)} minutos de ${startHour}:00 a ${endHour}:59`;
    } else {
      time = `de las ${startHour}:00 a ${endHour}:59`;
    }
  } else if (min !== '*' && hour !== '*') {
    time = `a las ${hour}:${min.padStart(2, '0')}`;
  } else if (hour !== '*') {
    time = `a las ${hour}:00`;
  } else if (min !== '*') {
    time = `en el minuto ${min}`;
  }

  let when = '';
  if (dow !== '*') {
    const dayParts = dow.replace(/\/\d+$/, '').split(',').map(d => {
      if (d.includes('-')) {
        const [a, b] = d.split('-');
        return `${DIAS_SEMANA[a] || a} a ${DIAS_SEMANA[b] || b}`;
      }
      return DIAS_SEMANA[d] || d;
    });
    when = `los ${formatList(dayParts)}`;
  }

  if (dom !== '*') {
    const domParts = dom.replace(/\/\d+$/, '').split(',').map(d => {
      if (d.includes('-')) { const [a, b] = d.split('-'); return `${a} al ${b}`; }
      return d;
    });
    const domStr = domParts.length === 1 && !dom.includes('-')
      ? `el día ${domParts[0]} del mes`
      : `los días ${formatList(domParts)} del mes`;
    when += (when ? ' y ' : '') + domStr;
  }

  if (mon !== '*') {
    const monParts = mon.replace(/\/\d+$/, '').split(',').map(m => {
      if (m.includes('-')) {
        const [a, b] = m.split('-');
        const na = MESES[a] || a, nb = MESES[b] || b;
        const diff = parseInt(b, 10) - parseInt(a, 10);
        return diff === 1 ? `${na} y ${nb}` : `${na} a ${nb}`;
      }
      return MESES[m] || m;
    });
    when += (when ? ' en ' : 'en ') + formatList(monParts);
  }

  if (!when && !time) return 'Cada minuto';
  if (!when && (min.startsWith('*/') || hour.startsWith('*/'))) return time.charAt(0).toUpperCase() + time.slice(1);
  if (!when) return `Todos los días ${time}`;
  return `${when.charAt(0).toUpperCase() + when.slice(1)} ${time}`.trim();
}

export default function EnviarAvisos() {
  const { isLoading: permLoading } = usePagePermissions('/admin/comunicacion/enviar-avisos');
  const { user } = useAuth();
  const { toast } = useToast();

  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [previewAviso, setPreviewAviso] = useState<Aviso | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [confirmAviso, setConfirmAviso] = useState<Aviso | null>(null);

  const fetchAvisos = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('avisos')
      .select('*, avisos_roles_destinatarios(correos)')
      .eq('activo', true)
      .order('nombre');
    const mapped = (data || []).map((a: any) => ({
      ...a,
      destinatarios_count: countUniqueEmails(a.avisos_roles_destinatarios || []),
    }));
    setAvisos(mapped);
    setIsLoading(false);
  };

  useEffect(() => { fetchAvisos(); }, []);

  const handleSend = async (aviso: Aviso) => {
    setSendingId(aviso.id);
    setConfirmAviso(null);

    try {
      const { data, error } = await supabase.functions.invoke('enviar-aviso-bulk', {
        body: { aviso_id: aviso.id, ejecutado_por: user?.email, tipo_trigger: 'manual' },
      });

      if (error) throw error;

      toast({
        title: "Aviso enviado",
        description: `Enviados: ${data.total_enviados}, Errores: ${data.total_errores}`,
      });
    } catch (err: any) {
      toast({ title: "Error al enviar", description: err.message, variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const filtered = avisos.filter(a => a.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
  const { paginated: pagedAvisos, page, setPage, totalPages, total, from, to } = usePagination(filtered, 50);

  if (permLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Enviar Avisos</h1>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar avisos..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Asunto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Programación</TableHead>
              <TableHead className="text-right">Destinatarios</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay avisos activos</TableCell></TableRow>
            ) : pagedAvisos.map(aviso => (
              <TableRow key={aviso.id}>
                <TableCell className="font-medium">{aviso.nombre}</TableCell>
                <TableCell className="text-muted-foreground">{aviso.asunto}</TableCell>
                <TableCell>
                  <Badge variant={aviso.tipo_envio === 'automatico' ? 'default' : 'secondary'}>
                    {aviso.tipo_envio}
                  </Badge>
                </TableCell>
                <TableCell>
                  {aviso.tipo_envio === 'automatico' && aviso.cron_expression ? (
                    <div className="flex items-center gap-1 text-sm">
                      <Clock className="h-3 w-3" />
                      {describeCron(aviso.cron_expression)}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{aviso.destinatarios_count}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="icon" onClick={() => setPreviewAviso(aviso)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {aviso.tipo_envio === 'manual' && (
                    <Button size="sm" onClick={() => setConfirmAviso(aviso)} disabled={sendingId === aviso.id}>
                      <Send className="h-4 w-4 mr-1" />
                      {sendingId === aviso.id ? 'Enviando...' : 'Enviar'}
                    </Button>
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

      {/* Preview Dialog */}
      <Dialog open={!!previewAviso} onOpenChange={() => setPreviewAviso(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview: {previewAviso?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="bg-muted/30 rounded-lg p-3 mb-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Asunto:</span>
              <span className="font-medium">{previewAviso?.asunto}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Destinatarios:</span>
              <Badge variant="secondary">{previewAviso?.destinatarios_count ?? 0}</Badge>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs">Template ID:</span>
              <Badge variant="outline" className="font-mono text-xs">{previewAviso?.postmark_template_id || 36978552}</Badge>
            </div>
          </div>
          <div className="border rounded bg-background" style={{ height: '400px' }}>
            <iframe srcDoc={previewAviso?.mensaje_html || ''} className="w-full h-full" sandbox="" title="Preview" />
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Send Dialog */}
      <Dialog open={!!confirmAviso} onOpenChange={() => setConfirmAviso(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envío</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p>
              ¿Enviar el aviso <strong>"{confirmAviso?.nombre}"</strong> a{' '}
              <strong>{confirmAviso?.destinatarios_count ?? 0}</strong> destinatario{confirmAviso?.destinatarios_count !== 1 ? 's' : ''}?
            </p>
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              <div><span className="text-muted-foreground">Asunto:</span> <strong>{confirmAviso?.asunto}</strong></div>
              <div><span className="text-muted-foreground">Template Postmark:</span> <Badge variant="outline" className="font-mono text-xs ml-1">{confirmAviso?.postmark_template_id || 36978552}</Badge></div>
              <div><span className="text-muted-foreground">Tipo:</span> {confirmAviso?.tipo_envio}</div>
            </div>
            {confirmAviso?.destinatarios_count === 0 && (
              <p className="text-sm text-destructive">Este aviso no tiene destinatarios configurados.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAviso(null)}>Cancelar</Button>
            <Button onClick={() => confirmAviso && handleSend(confirmAviso)} disabled={confirmAviso?.destinatarios_count === 0}>
              <Send className="h-4 w-4 mr-1" />Confirmar Envío
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
