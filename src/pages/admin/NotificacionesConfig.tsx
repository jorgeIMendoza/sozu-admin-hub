import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bell, Save, Loader2, Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface NotificacionConfig {
  id: number;
  tipo_evento: string;
  descripcion: string | null;
  canal: string;
  roles_destino: number[];
  activo: boolean;
  requiere_acceso_proyecto: boolean;
  asunto_email: string;
  plantilla_wa: string;
  plantilla_email_detalles: string;
  postmark_template_id: number;
}

interface Rol {
  id: number;
  nombre: string;
}

interface PostmarkTemplate {
  id: number;
  name: string;
  active: boolean;
}

const EMPTY_CONFIG: Omit<NotificacionConfig, 'id'> = {
  tipo_evento: '',
  descripcion: '',
  canal: 'ambos',
  roles_destino: [1, 3, 9],
  activo: true,
  requiere_acceso_proyecto: true,
  asunto_email: '',
  plantilla_wa: '',
  plantilla_email_detalles: '',
  postmark_template_id: 41353048,
};

const NotificacionesConfig = () => {
  const [configs, setConfigs] = useState<NotificacionConfig[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editItem, setEditItem] = useState<NotificacionConfig | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<NotificacionConfig | null>(null);
  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    const [configRes, rolesRes] = await Promise.all([
      (supabase as any).from('notificaciones_configuracion').select('*').order('id'),
      supabase.from('roles').select('id, nombre').eq('activo', true).order('id'),
    ]);

    if (configRes.data) setConfigs(configRes.data as unknown as NotificacionConfig[]);
    if (rolesRes.data) setRoles(rolesRes.data);
    setIsLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleToggleActivo = async (item: NotificacionConfig) => {
    const { error } = await (supabase as any)
      .from('notificaciones_configuracion')
      .update({ activo: !item.activo })
      .eq('id', item.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setConfigs(prev => prev.map(c => c.id === item.id ? { ...c, activo: !c.activo } : c));
    }
  };

  const handleOpenNew = () => {
    setEditItem({ ...EMPTY_CONFIG, id: 0 } as NotificacionConfig);
    setIsNew(true);
  };

  const handleOpenEdit = (item: NotificacionConfig) => {
    setEditItem({ ...item });
    setIsNew(false);
  };

  const handleSave = async () => {
    if (!editItem) return;

    if (!editItem.tipo_evento.trim()) {
      toast({ title: "Error", description: "El identificador del evento es requerido.", variant: "destructive" });
      return;
    }

    setSaving(true);

    if (isNew) {
      const { data, error } = await (supabase as any)
        .from('notificaciones_configuracion')
        .insert({
          tipo_evento: editItem.tipo_evento.trim().toLowerCase().replace(/\s+/g, '_'),
          descripcion: editItem.descripcion || null,
          canal: editItem.canal,
          roles_destino: editItem.roles_destino,
          activo: editItem.activo,
          requiere_acceso_proyecto: editItem.requiere_acceso_proyecto,
          asunto_email: editItem.asunto_email,
          plantilla_wa: editItem.plantilla_wa,
          plantilla_email_detalles: editItem.plantilla_email_detalles,
          postmark_template_id: editItem.postmark_template_id,
        })
        .select()
        .single();

      setSaving(false);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Creado", description: "Nuevo evento de notificación creado." });
        setConfigs(prev => [...prev, data as unknown as NotificacionConfig]);
        setEditItem(null);
        setIsNew(false);
      }
    } else {
      const { error } = await (supabase as any)
        .from('notificaciones_configuracion')
        .update({
          descripcion: editItem.descripcion || null,
          canal: editItem.canal,
          roles_destino: editItem.roles_destino,
          requiere_acceso_proyecto: editItem.requiere_acceso_proyecto,
          asunto_email: editItem.asunto_email,
          plantilla_wa: editItem.plantilla_wa,
          plantilla_email_detalles: editItem.plantilla_email_detalles,
          postmark_template_id: editItem.postmark_template_id,
        })
        .eq('id', editItem.id);

      setSaving(false);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Guardado", description: "Configuración actualizada." });
        setConfigs(prev => prev.map(c => c.id === editItem.id ? editItem : c));
        setEditItem(null);
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    const { error } = await (supabase as any)
      .from('notificaciones_configuracion')
      .delete()
      .eq('id', deleteItem.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Eliminado", description: "Evento de notificación eliminado." });
      setConfigs(prev => prev.filter(c => c.id !== deleteItem.id));
    }
    setDeleteItem(null);
  };

  const getRolName = (id: number) => roles.find(r => r.id === id)?.nombre || `Rol ${id}`;

  const canalLabel = (canal: string) => {
    switch (canal) {
      case 'email': return 'Email';
      case 'whatsapp': return 'WhatsApp';
      case 'ambos': return 'Ambos';
      default: return canal;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Configuración de Notificaciones</h1>
            <p className="text-muted-foreground">Administra los eventos que disparan notificaciones por email y/o WhatsApp.</p>
          </div>
        </div>
        <Button onClick={handleOpenNew}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Evento
        </Button>
      </div>

      <div className="grid gap-4">
        {configs.map(item => (
          <Card key={item.id} className={!item.activo ? 'opacity-60' : ''}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{item.tipo_evento.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</CardTitle>
                  {item.descripcion && <CardDescription>{item.descripcion}</CardDescription>}
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={item.activo} onCheckedChange={() => handleToggleActivo(item)} />
                  <Button variant="outline" size="sm" onClick={() => handleOpenEdit(item)}>
                    Editar
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteItem(item)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Canal: </span>
                  <Badge variant="secondary">{canalLabel(item.canal)}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Roles: </span>
                  {item.roles_destino.map(r => (
                    <Badge key={r} variant="outline" className="mr-1">{getRolName(r)}</Badge>
                  ))}
                </div>
                <div>
                  <span className="text-muted-foreground">Filtro proyecto: </span>
                  <Badge variant={item.requiere_acceso_proyecto ? "default" : "secondary"}>
                    {item.requiere_acceso_proyecto ? 'Sí' : 'No'}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Identificador: </span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{item.tipo_evento}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">Plantilla Postmark: </span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{item.postmark_template_id}</code>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {configs.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No hay notificaciones configuradas. Crea una con el botón "Nuevo Evento".</p>
        )}
      </div>

      {/* Edit / Create Dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) { setEditItem(null); setIsNew(false); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isNew ? 'Crear Nuevo Evento' : 'Editar Notificación'}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4">
              {isNew && (
                <>
                  <div>
                    <Label>Identificador del evento *</Label>
                    <Input
                      value={editItem.tipo_evento}
                      onChange={e => setEditItem({ ...editItem, tipo_evento: e.target.value })}
                      placeholder="ej: nueva_reserva, pago_recibido"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Este identificador se usa en n8n o en el código para disparar la notificación. Usa snake_case.
                    </p>
                  </div>
                  <div>
                    <Label>Descripción</Label>
                    <Input
                      value={editItem.descripcion || ''}
                      onChange={e => setEditItem({ ...editItem, descripcion: e.target.value })}
                      placeholder="Descripción del evento..."
                    />
                  </div>
                </>
              )}

              <div>
                <Label>Canal de envío</Label>
                <Select value={editItem.canal} onValueChange={v => setEditItem({ ...editItem, canal: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Roles destinatarios</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {roles.map(rol => (
                    <div key={rol.id} className="flex items-center gap-2">
                      <Checkbox
                        checked={editItem.roles_destino.includes(rol.id)}
                        onCheckedChange={(checked) => {
                          setEditItem({
                            ...editItem,
                            roles_destino: checked
                              ? [...editItem.roles_destino, rol.id]
                              : editItem.roles_destino.filter(r => r !== rol.id),
                          });
                        }}
                      />
                      <span className="text-sm">{rol.nombre}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 mt-2">
                <Label className="text-sm font-semibold mb-1 block">Filtro de proyecto</Label>
                <div className="flex items-start gap-2 bg-muted/50 rounded-lg p-3">
                  <Checkbox
                    id="requiere_acceso"
                    checked={editItem.requiere_acceso_proyecto}
                    onCheckedChange={(checked) => setEditItem({ ...editItem, requiere_acceso_proyecto: !!checked })}
                    className="mt-0.5"
                  />
                  <div>
                    <Label htmlFor="requiere_acceso" className="font-medium cursor-pointer">Requiere acceso al proyecto</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Si está activo, solo se notifica a usuarios que tengan acceso al proyecto específico en "Proyectos Acceso". Los Super Admins siempre reciben sin importar esta opción.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <Label>Asunto del email</Label>
                <Input
                  value={editItem.asunto_email}
                  onChange={e => setEditItem({ ...editItem, asunto_email: e.target.value })}
                  placeholder="Asunto..."
                />
                <p className="text-xs text-muted-foreground mt-1">Placeholders: {'{nombre_desarrollo}'}, {'{nombre_esquema}'}</p>
              </div>

              <div>
                <Label>Plantilla de Postmark (Template ID)</Label>
                <Input
                  type="number"
                  value={editItem.postmark_template_id ?? 41353048}
                  onChange={e => setEditItem({ ...editItem, postmark_template_id: parseInt(e.target.value || '0', 10) })}
                  placeholder="41353048"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  ID numérico de la plantilla de Postmark a usar para este evento. Default: 41353048 (Notificaciones internas).
                </p>
              </div>

              <div>
                <Label>Mensaje WhatsApp</Label>
                <Textarea
                  value={editItem.plantilla_wa}
                  onChange={e => setEditItem({ ...editItem, plantilla_wa: e.target.value })}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">Usa *texto* para negritas en WhatsApp</p>
              </div>

              <div>
                <Label>Detalles del email (HTML)</Label>
                <Textarea
                  value={editItem.plantilla_email_detalles}
                  onChange={e => setEditItem({ ...editItem, plantilla_email_detalles: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setEditItem(null); setIsNew(false); }}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {isNew ? 'Crear' : 'Guardar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteItem} onOpenChange={(o) => { if (!o) setDeleteItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el evento <strong>{deleteItem?.tipo_evento}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default NotificacionesConfig;
