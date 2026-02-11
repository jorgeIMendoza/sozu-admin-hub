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
import { Send, Search, Eye, Clock } from "lucide-react";

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
}

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

  const describeCron = (cron: string): string => {
    const presets: Record<string, string> = {
      '0 * * * *': 'Cada hora',
      '0 9 * * *': 'Cada día a las 9am',
      '0 9 * * 1-5': 'Lun-Vie a las 9am',
      '0 9 * * 1': 'Cada lunes a las 9am',
      '0 9 1 * *': 'Primer día del mes 9am',
    };
    return presets[cron] || cron;
  };

  const filtered = avisos.filter(a => a.nombre.toLowerCase().includes(searchTerm.toLowerCase()));

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
            ) : filtered.map(aviso => (
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
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewAviso} onOpenChange={() => setPreviewAviso(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preview: {previewAviso?.nombre}</DialogTitle>
          </DialogHeader>
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
          <p>
            ¿Enviar el aviso <strong>"{confirmAviso?.nombre}"</strong> a{' '}
            <strong>{confirmAviso?.destinatarios_count ?? 0}</strong> destinatario{confirmAviso?.destinatarios_count !== 1 ? 's' : ''}?
          </p>
          {confirmAviso?.destinatarios_count === 0 && (
            <p className="text-sm text-destructive">Este aviso no tiene destinatarios configurados.</p>
          )}
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
