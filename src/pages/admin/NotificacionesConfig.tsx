import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bell, Save, Loader2 } from "lucide-react";
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
}

interface Rol {
  id: number;
  nombre: string;
}

const NotificacionesConfig = () => {
  const [configs, setConfigs] = useState<NotificacionConfig[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editItem, setEditItem] = useState<NotificacionConfig | null>(null);
  const [saving, setSaving] = useState(false);
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

  const handleSaveEdit = async () => {
    if (!editItem) return;
    setSaving(true);

    const { error } = await (supabase as any)
      .from('notificaciones_configuracion')
      .update({
        canal: editItem.canal,
        roles_destino: editItem.roles_destino,
        requiere_acceso_proyecto: editItem.requiere_acceso_proyecto,
        asunto_email: editItem.asunto_email,
        plantilla_wa: editItem.plantilla_wa,
        plantilla_email_detalles: editItem.plantilla_email_detalles,
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
      <div className="flex items-center gap-3">
        <Bell className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Configuración de Notificaciones</h1>
          <p className="text-muted-foreground">Administra los eventos que disparan notificaciones por email y/o WhatsApp.</p>
        </div>
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
                  <Button variant="outline" size="sm" onClick={() => setEditItem({ ...item })}>
                    Editar
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
              </div>
            </CardContent>
          </Card>
        ))}

        {configs.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No hay notificaciones configuradas.</p>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Notificación</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4">
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

              <div className="flex items-center gap-2">
                <Checkbox
                  checked={editItem.requiere_acceso_proyecto}
                  onCheckedChange={(checked) => setEditItem({ ...editItem, requiere_acceso_proyecto: !!checked })}
                />
                <Label>Requiere acceso al proyecto</Label>
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
                <Button variant="outline" onClick={() => setEditItem(null)}>Cancelar</Button>
                <Button onClick={handleSaveEdit} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Guardar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NotificacionesConfig;
