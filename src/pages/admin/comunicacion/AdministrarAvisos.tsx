import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { AvisoDestinatariosSection } from "@/components/admin/AvisoDestinatariosSection";
import { RichTextEditor } from "@/components/admin/RichTextEditor";

interface Aviso {
  id: number;
  nombre: string;
  asunto: string;
  mensaje_html: string;
  tipo_envio: string;
  cron_expression: string | null;
  activo: boolean;
  fecha_creacion: string;
}

interface Rol {
  id: number;
  nombre: string;
}

interface Destinatario {
  nombre: string;
  email: string;
}

const DIAS_SEMANA: Record<string, string> = { '0': 'domingo', '1': 'lunes', '2': 'martes', '3': 'miércoles', '4': 'jueves', '5': 'viernes', '6': 'sábado', '7': 'domingo' };
const MESES: Record<string, string> = { '1': 'enero', '2': 'febrero', '3': 'marzo', '4': 'abril', '5': 'mayo', '6': 'junio', '7': 'julio', '8': 'agosto', '9': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre' };

function validateCronField(field: string, min: number, max: number, name: string): { valid: boolean; error?: string } {
  if (field === '*') return { valid: true };
  // handle step: */n or range/n
  const stepMatch = field.match(/^(.+)\/(\d+)$/);
  let base = field;
  if (stepMatch) {
    const step = parseInt(stepMatch[2], 10);
    if (isNaN(step) || step < 1) return { valid: false, error: `${name}: paso inválido "${stepMatch[2]}"` };
    base = stepMatch[1];
    if (base === '*') return { valid: true };
  }
  // split by comma for lists
  const parts = base.split(',');
  for (const part of parts) {
    if (part.includes('-')) {
      const [a, b] = part.split('-');
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (isNaN(na) || isNaN(nb)) return { valid: false, error: `${name}: valor no numérico en rango "${part}"` };
      if (na < min || na > max || nb < min || nb > max) return { valid: false, error: `${name}: debe estar entre ${min} y ${max}` };
      if (na > nb) return { valid: false, error: `${name}: rango invertido "${part}"` };
    } else {
      const n = parseInt(part, 10);
      if (isNaN(n)) return { valid: false, error: `${name}: valor inválido "${part}"` };
      if (n < min || n > max) return { valid: false, error: `${name}: debe estar entre ${min} y ${max}` };
    }
  }
  return { valid: true };
}

function validateCron(expr: string): { valid: boolean; error?: string } {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { valid: false, error: 'Debe tener 5 campos: minuto hora día-mes mes día-semana' };
  const ranges = [
    { name: 'Minuto', min: 0, max: 59 },
    { name: 'Hora', min: 0, max: 23 },
    { name: 'Día del mes', min: 1, max: 31 },
    { name: 'Mes', min: 1, max: 12 },
    { name: 'Día de semana', min: 0, max: 7 },
  ];
  for (let i = 0; i < 5; i++) {
    const r = validateCronField(parts[i], ranges[i].min, ranges[i].max, ranges[i].name);
    if (!r.valid) return r;
  }
  return { valid: true };
}

function formatList(items: string[], joinWord = 'y'): string {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ` ${joinWord} ` + items[items.length - 1];
}

function describeCron(expr: string): string {
  const v = validateCron(expr);
  if (!v.valid) return v.error || 'Expresión cron inválida';

  const parts = expr.trim().split(/\s+/);
  const [min, hour, dom, mon, dow] = parts;

  // Time part
  let time = '';
  if (min.startsWith('*/') && hour === '*') {
    time = `cada ${min.slice(2)} minutos`;
  } else if (hour.startsWith('*/')) {
    time = `cada ${hour.slice(2)} horas`;
  } else if (min !== '*' && hour !== '*') {
    time = `a las ${hour}:${min.padStart(2, '0')}`;
  } else if (hour !== '*') {
    time = `a las ${hour}:00`;
  } else if (min !== '*') {
    time = `en el minuto ${min}`;
  }

  // Day of week
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

  // Day of month
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

  // Month
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

const CRON_PRESETS = [
  { label: 'Cada hora', value: '0 * * * *' },
  { label: 'Cada día 9am', value: '0 9 * * *' },
  { label: 'Lunes a Viernes 9am', value: '0 9 * * 1-5' },
  { label: 'Lunes 9am', value: '0 9 * * 1' },
  { label: 'Primer día del mes 9am', value: '0 9 1 * *' },
];

export default function AdministrarAvisos() {
  const { canCreate, canUpdate, canDelete, isLoading: permLoading } = usePagePermissions('/admin/comunicacion/administrar-avisos');
  const { toast } = useToast();

  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAviso, setEditingAviso] = useState<Aviso | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [nombre, setNombre] = useState("");
  const [asunto, setAsunto] = useState("");
  const [mensajeHtml, setMensajeHtml] = useState("");
  const [tipoEnvio, setTipoEnvio] = useState("manual");
  const [cronExpression, setCronExpression] = useState("");
  const [cronError, setCronError] = useState("");
  const [activo, setActivo] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);

  const fetchAvisos = async () => {
    setIsLoading(true);
    const { data } = await supabase.from('avisos').select('*').order('fecha_creacion', { ascending: false });
    setAvisos(data || []);
    setIsLoading(false);
  };

  const fetchRoles = async () => {
    const { data } = await supabase.from('roles').select('id, nombre').eq('activo', true).order('nombre');
    setRoles(data || []);
  };

  useEffect(() => { fetchAvisos(); fetchRoles(); }, []);

  const openCreate = () => {
    setEditingAviso(null);
    setNombre(""); setAsunto(""); setMensajeHtml(""); setTipoEnvio("manual");
    setCronExpression(""); setCronError(""); setActivo(true); setSelectedRoles([]); setDestinatarios([]);
  };

  const openEdit = async (aviso: Aviso) => {
    setEditingAviso(aviso);
    setNombre(aviso.nombre); setAsunto(aviso.asunto); setMensajeHtml(aviso.mensaje_html);
    setTipoEnvio(aviso.tipo_envio); setCronExpression(aviso.cron_expression || "");
    setActivo(aviso.activo);

    // Load existing roles and their correos
    const { data } = await supabase.from('avisos_roles_destinatarios').select('id_rol, correos').eq('id_aviso', aviso.id);
    const rolIds: number[] = [];
    const allDests: Destinatario[] = [];
    data?.forEach(r => {
      rolIds.push(r.id_rol);
      const correos = r.correos as any;
      const dests: Destinatario[] = correos?.destinatarios || [];
      dests.forEach(d => {
        if (!allDests.some(x => x.email === d.email)) {
          allDests.push(d);
        }
      });
    });
    setSelectedRoles(rolIds);
    setDestinatarios(allDests);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!nombre || !asunto || !mensajeHtml) {
      toast({ title: "Error", description: "Nombre, asunto y mensaje son requeridos", variant: "destructive" });
      return;
    }
    if (tipoEnvio === 'automatico') {
      if (!cronExpression) {
        toast({ title: "Error", description: "La expresión cron es requerida para envío automático", variant: "destructive" });
        return;
      }
      const cronValidation = validateCron(cronExpression);
      if (!cronValidation.valid) {
        toast({ title: "Expresión cron inválida", description: cronValidation.error, variant: "destructive" });
        return;
      }
    }

    const payload = {
      nombre, asunto, mensaje_html: mensajeHtml, tipo_envio: tipoEnvio,
      cron_expression: tipoEnvio === 'automatico' ? cronExpression : null,
      activo, fecha_actualizacion: new Date().toISOString(),
    };

    let avisoId: number;
    if (editingAviso) {
      const { error } = await supabase.from('avisos').update(payload).eq('id', editingAviso.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      avisoId = editingAviso.id;
    } else {
      const { data, error } = await supabase.from('avisos').insert(payload).select('id').single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      avisoId = data.id;
    }

    // Save roles with correos - store all destinatarios under each selected role
    await supabase.from('avisos_roles_destinatarios').delete().eq('id_aviso', avisoId);
    if (selectedRoles.length > 0) {
      const correosJson = JSON.parse(JSON.stringify({ destinatarios }));
      await supabase.from('avisos_roles_destinatarios').insert(
        selectedRoles.map(id_rol => ({
          id_aviso: avisoId,
          id_rol,
          correos: correosJson,
        }))
      );
    }

    toast({ title: editingAviso ? "Aviso actualizado" : "Aviso creado" });
    setDialogOpen(false);
    fetchAvisos();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('avisos').delete().eq('id', deleteId);
    toast({ title: "Aviso eliminado" });
    setDeleteId(null);
    fetchAvisos();
  };

  const toggleActivo = async (aviso: Aviso) => {
    await supabase.from('avisos').update({ activo: !aviso.activo }).eq('id', aviso.id);
    fetchAvisos();
  };

  const toggleRole = (rolId: number) => {
    setSelectedRoles(prev =>
      prev.includes(rolId) ? prev.filter(r => r !== rolId) : [...prev, rolId]
    );
  };

  const filtered = avisos.filter(a => a.nombre.toLowerCase().includes(searchTerm.toLowerCase()));

  if (permLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  // Build preview HTML with subject header
  const previewHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #f3f4f6; padding: 12px 16px; border-bottom: 2px solid #e5e7eb;">
        <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">Asunto:</div>
        <div style="font-size: 14px; font-weight: 600; color: #111827;">${asunto || '(Sin asunto)'}</div>
      </div>
      <div style="padding: 16px;">
        ${mensajeHtml || '<p style="color:#999;">El contenido aparecerá aquí...</p>'}
      </div>
    </div>
  `;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Administrar Avisos</h1>
        {canCreate && (
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Nuevo Aviso</Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar avisos..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead>Fecha Creación</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No hay avisos</TableCell></TableRow>
            ) : filtered.map(aviso => (
              <TableRow key={aviso.id}>
                <TableCell className="font-medium">{aviso.nombre}</TableCell>
                <TableCell>
                  <Badge variant={aviso.tipo_envio === 'automatico' ? 'default' : 'secondary'}>
                    {aviso.tipo_envio}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch checked={aviso.activo} onCheckedChange={() => canUpdate && toggleActivo(aviso)} disabled={!canUpdate} />
                </TableCell>
                <TableCell>{new Date(aviso.fecha_creacion).toLocaleDateString('es-MX')}</TableCell>
                <TableCell className="text-right space-x-2">
                  {canUpdate && <Button variant="ghost" size="icon" onClick={() => openEdit(aviso)}><Pencil className="h-4 w-4" /></Button>}
                  {canDelete && <Button variant="ghost" size="icon" onClick={() => setDeleteId(aviso.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAviso ? 'Editar Aviso' : 'Nuevo Aviso'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del aviso" />
              </div>
              <div>
                <Label>Asunto del email</Label>
                <Input value={asunto} onChange={e => setAsunto(e.target.value)} placeholder="Asunto del email" />
              </div>
              <div>
                <Label>Contenido del mensaje</Label>
                <RichTextEditor value={mensajeHtml} onChange={setMensajeHtml} />
              </div>
              <div>
                <Label>Tipo de envío</Label>
                <Select value={tipoEnvio} onValueChange={setTipoEnvio}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="automatico">Automático</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {tipoEnvio === 'automatico' && (
                <div className="space-y-2">
                  <Label>Expresión Cron (horario México UTC-6)</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {CRON_PRESETS.map(p => (
                      <Button key={p.value} variant={cronExpression === p.value ? 'default' : 'outline'} size="sm"
                        onClick={() => setCronExpression(p.value)}>{p.label}</Button>
                    ))}
                  </div>
                  <Input value={cronExpression} onChange={e => {
                    const val = e.target.value;
                    setCronExpression(val);
                    if (val.trim()) {
                      const result = validateCron(val);
                      setCronError(result.valid ? "" : result.error || "Expresión inválida");
                    } else {
                      setCronError("");
                    }
                  }}
                    placeholder="* * * * *" className="font-mono" />
                  <p className="text-xs text-muted-foreground">Formato: minuto hora día-mes mes día-semana</p>
                  {cronError && <p className="text-sm text-destructive">{cronError}</p>}
                  {!cronError && cronExpression && (
                    <p className="text-sm font-medium text-primary">{describeCron(cronExpression)}</p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={activo} onCheckedChange={setActivo} />
                <Label>Activo</Label>
              </div>

              <AvisoDestinatariosSection
                roles={roles}
                selectedRoles={selectedRoles}
                onToggleRole={toggleRole}
                destinatarios={destinatarios}
                onDestinatariosChange={setDestinatarios}
              />
            </div>

            <div>
              <Label>Vista previa del email</Label>
              <div className="border rounded-lg mt-2 bg-background overflow-hidden" style={{ height: '600px' }}>
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-full"
                  sandbox=""
                  title="Preview"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingAviso ? 'Guardar Cambios' : 'Crear Aviso'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationDialog
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar Aviso"
        description="¿Estás seguro de que deseas eliminar este aviso? Esta acción no se puede deshacer."
      />
    </div>
  );
}
