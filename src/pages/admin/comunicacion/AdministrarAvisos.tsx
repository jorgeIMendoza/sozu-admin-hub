import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";

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

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAviso, setEditingAviso] = useState<Aviso | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Form state
  const [nombre, setNombre] = useState("");
  const [asunto, setAsunto] = useState("");
  const [mensajeHtml, setMensajeHtml] = useState("");
  const [tipoEnvio, setTipoEnvio] = useState("manual");
  const [cronExpression, setCronExpression] = useState("");
  const [activo, setActivo] = useState(true);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);

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

  useEffect(() => {
    fetchAvisos();
    fetchRoles();
  }, []);

  const openCreate = () => {
    setEditingAviso(null);
    setNombre(""); setAsunto(""); setMensajeHtml(""); setTipoEnvio("manual");
    setCronExpression(""); setActivo(true); setSelectedRoles([]);
    setDialogOpen(true);
  };

  const openEdit = async (aviso: Aviso) => {
    setEditingAviso(aviso);
    setNombre(aviso.nombre); setAsunto(aviso.asunto); setMensajeHtml(aviso.mensaje_html);
    setTipoEnvio(aviso.tipo_envio); setCronExpression(aviso.cron_expression || "");
    setActivo(aviso.activo);

    const { data } = await supabase.from('avisos_roles_destinatarios').select('rol_id').eq('aviso_id', aviso.id);
    setSelectedRoles(data?.map(r => r.rol_id) || []);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!nombre || !asunto || !mensajeHtml) {
      toast({ title: "Error", description: "Nombre, asunto y mensaje son requeridos", variant: "destructive" });
      return;
    }

    if (tipoEnvio === 'automatico' && !cronExpression) {
      toast({ title: "Error", description: "La expresión cron es requerida para envío automático", variant: "destructive" });
      return;
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

    // Update roles
    await supabase.from('avisos_roles_destinatarios').delete().eq('aviso_id', avisoId);
    if (selectedRoles.length > 0) {
      await supabase.from('avisos_roles_destinatarios').insert(
        selectedRoles.map(rol_id => ({ aviso_id: avisoId, rol_id }))
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
    setSelectedRoles(prev => prev.includes(rolId) ? prev.filter(r => r !== rolId) : [...prev, rolId]);
  };

  const filtered = avisos.filter(a => a.nombre.toLowerCase().includes(searchTerm.toLowerCase()));

  if (permLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAviso ? 'Editar Aviso' : 'Nuevo Aviso'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form */}
            <div className="space-y-4">
              <div>
                <Label>Nombre</Label>
                <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del aviso" />
              </div>
              <div>
                <Label>Asunto</Label>
                <Input value={asunto} onChange={e => setAsunto(e.target.value)} placeholder="Asunto del email" />
              </div>
              <div>
                <Label>Mensaje HTML</Label>
                <Textarea value={mensajeHtml} onChange={e => setMensajeHtml(e.target.value)}
                  placeholder="<h1>Hola</h1><p>Tu mensaje aquí...</p>" rows={10} className="font-mono text-xs" />
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
                  <Input value={cronExpression} onChange={e => setCronExpression(e.target.value)}
                    placeholder="* * * * *" className="font-mono" />
                  <p className="text-xs text-muted-foreground">Formato: minuto hora día-mes mes día-semana</p>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={activo} onCheckedChange={setActivo} />
                <Label>Activo</Label>
              </div>
              <div>
                <Label>Roles Destinatarios</Label>
                <div className="grid grid-cols-2 gap-1 mt-2 max-h-40 overflow-y-auto border rounded p-2">
                  {roles.map(rol => (
                    <label key={rol.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted p-1 rounded">
                      <input type="checkbox" checked={selectedRoles.includes(rol.id)} onChange={() => toggleRole(rol.id)} className="rounded" />
                      {rol.nombre}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview */}
            <div>
              <Label>Vista previa</Label>
              <div className="border rounded-lg mt-2 bg-background overflow-hidden" style={{ height: '500px' }}>
                <iframe
                  srcDoc={mensajeHtml || '<p style="color:#999;padding:20px;">El preview aparecerá aquí...</p>'}
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

      {/* Delete Confirmation */}
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
