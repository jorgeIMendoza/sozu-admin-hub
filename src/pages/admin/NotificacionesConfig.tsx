import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bell, Save, Loader2, Plus, Trash2, ChevronDown, ChevronRight, Eye } from "lucide-react";
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
  mapeo_variables_postmark: Record<string, string>;
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
  mapeo_variables_postmark: {},
};

const SYSTEM_PLACEHOLDERS = ['{nombre_desarrollo}', '{nombre_esquema}', '{id_proyecto}'];

const NotificacionesConfig = () => {
  const [configs, setConfigs] = useState<NotificacionConfig[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [postmarkTemplates, setPostmarkTemplates] = useState<PostmarkTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [editItem, setEditItem] = useState<NotificacionConfig | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<NotificacionConfig | null>(null);
  const [templateVars, setTemplateVars] = useState<string[]>([]);
  const [loadingVars, setLoadingVars] = useState(false);
  const [mapeoJsonText, setMapeoJsonText] = useState<string>('{}');
  const [mapeoJsonError, setMapeoJsonError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, string>>({
    nombre_desarrollo: 'Torre Sozu Polanco',
    nombre_esquema: 'Plan 60/40',
    id_proyecto: '123',
  });
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

  const fetchPostmarkTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const { data, error } = await supabase.functions.invoke('listar-postmark-templates');
      if (!error && data?.templates) {
        setPostmarkTemplates(data.templates);
      }
    } catch (e) {
      console.error('Error fetching Postmark templates:', e);
    }
    setLoadingTemplates(false);
  };

  useEffect(() => { fetchData(); fetchPostmarkTemplates(); }, []);

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
    setMapeoJsonText('{}');
    setMapeoJsonError(null);
    setTemplateVars([]);
  };

  const handleOpenEdit = (item: NotificacionConfig) => {
    const mapeo = item.mapeo_variables_postmark || {};
    setEditItem({ ...item, mapeo_variables_postmark: mapeo });
    setIsNew(false);
    setMapeoJsonText(JSON.stringify(mapeo, null, 2));
    setMapeoJsonError(null);
    setTemplateVars([]);
    if (item.postmark_template_id) loadTemplateVariables(item.postmark_template_id);
  };

  const loadTemplateVariables = async (templateId: number) => {
    if (!templateId) return;
    setLoadingVars(true);
    try {
      const { data, error } = await supabase.functions.invoke('obtener-postmark-template', {
        body: { templateId },
      });
      if (!error && data?.variables) {
        setTemplateVars(data.variables);
        // Auto-prefill missing keys in mapeo (only if value not already set)
        setEditItem(prev => {
          if (!prev) return prev;
          // Build nested structure honoring dotted paths (e.g. "mensaje.proyecto" -> { mensaje: { proyecto: "" } })
          const current: Record<string, any> = JSON.parse(JSON.stringify(prev.mapeo_variables_postmark || {}));
          let changed = false;
          const suggestForLeaf = (leaf: string): string => {
            if (leaf === 'nombre_desarrollo') return '{nombre_desarrollo}';
            if (leaf === 'nombre_esquema') return '{nombre_esquema}';
            if (leaf === 'id_proyecto') return '{id_proyecto}';
            if (leaf === 'proyecto') return '{nombre_desarrollo}';
            if (leaf === 'esquema') return '{nombre_esquema}';
            return '';
          };
          const setNested = (obj: Record<string, any>, path: string[]): boolean => {
            const [head, ...rest] = path;
            if (!head) return false;
            if (rest.length === 0) {
              if (obj[head] === undefined) {
                obj[head] = suggestForLeaf(head);
                return true;
              }
              return false;
            }
            if (typeof obj[head] !== 'object' || obj[head] === null || Array.isArray(obj[head])) {
              obj[head] = {};
              // continue, will fill below
            }
            return setNested(obj[head], rest);
          };
          for (const v of data.variables as string[]) {
            const path = v.split('.').filter(Boolean);
            if (path.length === 0) continue;
            const wasChanged = setNested(current, path);
            if (wasChanged) changed = true;
          }
          if (changed) {
            setMapeoJsonText(JSON.stringify(current, null, 2));
            return { ...prev, mapeo_variables_postmark: current };
          }
          return prev;
        });
      }
    } catch (e) {
      console.error('Error fetching template variables:', e);
    }
    setLoadingVars(false);
  };

  const handleSave = async () => {
    if (!editItem) return;

    if (!editItem.tipo_evento.trim()) {
      toast({ title: "Error", description: "El identificador del evento es requerido.", variant: "destructive" });
      return;
    }

    // Validate JSON of mapeo
    let mapeoFinal: Record<string, string> = editItem.mapeo_variables_postmark || {};
    try {
      const parsed = JSON.parse(mapeoJsonText || '{}');
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
        throw new Error('Debe ser un objeto JSON');
      }
      mapeoFinal = parsed as Record<string, string>;
      setMapeoJsonError(null);
    } catch (e: any) {
      setMapeoJsonError(e.message);
      toast({ title: "JSON inválido", description: `Mapeo de variables: ${e.message}`, variant: "destructive" });
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
          mapeo_variables_postmark: mapeoFinal,
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
          mapeo_variables_postmark: mapeoFinal,
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

  // Detect if the mapping JSON already provides a value for a key path (e.g. "asunto" or "mensaje.detalles")
  const mapeoHasPath = (path: string): boolean => {
    try {
      const parsed = JSON.parse(mapeoJsonText || '{}');
      const parts = path.split('.');
      let cur: any = parsed;
      for (const p of parts) {
        if (cur && typeof cur === 'object' && p in cur) cur = cur[p];
        else return false;
      }
      // Consider present only if it's a non-empty string or a non-null value
      if (typeof cur === 'string') return cur.trim().length > 0;
      return cur !== undefined && cur !== null;
    } catch {
      return false;
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copiado', description: `${text} copiado al portapapeles` });
    } catch {
      toast({ title: 'Error', description: 'No se pudo copiar', variant: 'destructive' });
    }
  };

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
                  <Badge variant="outline" className="font-mono text-xs">
                    {(() => {
                      const tmpl = postmarkTemplates.find(t => t.id === item.postmark_template_id);
                      return tmpl ? tmpl.name : item.postmark_template_id;
                    })()}
                  </Badge>
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
                <Label>Plantilla de Postmark (Template ID)</Label>
                <Select
                  value={String(editItem.postmark_template_id ?? 41353048)}
                  onValueChange={v => {
                    const id = parseInt(v, 10);
                    setEditItem({ ...editItem, postmark_template_id: id });
                    loadTemplateVariables(id);
                  }}
                  disabled={loadingTemplates}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingTemplates ? 'Cargando plantillas...' : 'Selecciona una plantilla'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {postmarkTemplates.length === 0 && !loadingTemplates && (
                      <SelectItem value={String(editItem.postmark_template_id ?? 41353048)}>
                        {editItem.postmark_template_id ?? 41353048} (sin lista)
                      </SelectItem>
                    )}
                    {postmarkTemplates.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name} <span className="text-xs text-muted-foreground ml-2">#{t.id}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Plantilla de Postmark a usar para este evento. Default: Notificaciones internas (41353048).
                </p>
              </div>

              {/* Template variables + JSON mapping editor */}
              <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Mapeo de variables de la plantilla</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loadingVars || !editItem.postmark_template_id}
                    onClick={() => loadTemplateVariables(editItem.postmark_template_id)}
                  >
                    {loadingVars ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                    {loadingVars ? 'Detectando...' : 'Detectar variables'}
                  </Button>
                </div>

                {templateVars.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Variables que la plantilla espera:</p>
                    <div className="flex flex-wrap gap-1">
                      {templateVars.map(v => (
                        <Badge key={v} variant="secondary" className="font-mono text-xs">{`{{${v}}}`}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Placeholders del sistema que puedes usar como valor:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {SYSTEM_PLACEHOLDERS.map(p => (
                      <Badge
                        key={p}
                        variant="outline"
                        className="font-mono text-xs cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                        onClick={() => copyToClipboard(p)}
                        title="Click para copiar"
                      >{p}</Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Mapeo (JSON)</Label>
                  <Textarea
                    value={mapeoJsonText}
                    onChange={e => {
                      setMapeoJsonText(e.target.value);
                      try {
                        const parsed = JSON.parse(e.target.value || '{}');
                        if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
                          setMapeoJsonError(null);
                          setEditItem(prev => prev ? { ...prev, mapeo_variables_postmark: parsed } : prev);
                        }
                      } catch (err: any) {
                        setMapeoJsonError(err.message);
                      }
                    }}
                    rows={6}
                    className="font-mono text-xs"
                    placeholder={`{\n  "mensaje": {\n    "proyecto": "{nombre_desarrollo}"\n  }\n}`}
                  />
                  {mapeoJsonError && (
                    <p className="text-xs text-destructive mt-1">JSON inválido: {mapeoJsonError}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    <strong>Importante:</strong> los placeholders del sistema van <strong>entre comillas</strong> como cualquier texto JSON, ej. <code>{`"{nombre_desarrollo}"`}</code>. El sistema los detecta y reemplaza automáticamente al enviar. Si la plantilla usa <code>{`{{mensaje.proyecto}}`}</code>, anida el JSON como <code>{`{ "mensaje": { "proyecto": "{nombre_desarrollo}" } }`}</code>.
                  </p>
                </div>

                {/* Preview expandible */}
                <div className="border-t pt-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(o => !o)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    {previewOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <Eye className="h-3.5 w-3.5" />
                    Vista previa con valores de prueba
                  </button>

                  {previewOpen && (() => {
                    // Build live preview from current mapeo + previewValues
                    const replacePh = (s: string) =>
                      s
                        .replace(/\{nombre_desarrollo\}/g, previewValues.nombre_desarrollo || '')
                        .replace(/\{nombre_esquema\}/g, previewValues.nombre_esquema || '')
                        .replace(/\{id_proyecto\}/g, previewValues.id_proyecto || '');
                    const resolveMapping = (value: any): any => {
                      if (typeof value === 'string') return replacePh(value);
                      if (Array.isArray(value)) return value.map(resolveMapping);
                      if (value && typeof value === 'object') {
                        const out: Record<string, any> = {};
                        for (const [k, v] of Object.entries(value)) out[k] = resolveMapping(v);
                        return out;
                      }
                      return value;
                    };
                    let resolvedJson: any = {};
                    try {
                      const parsed = JSON.parse(mapeoJsonText || '{}');
                      resolvedJson = resolveMapping(parsed);
                    } catch {
                      resolvedJson = { error: 'JSON inválido — corrige arriba' };
                    }
                    const asuntoPreview = replacePh(editItem.asunto_email || '');
                    const detallesPreview = replacePh(editItem.plantilla_email_detalles || '');
                    const waPreview = replacePh(editItem.plantilla_wa || '');
                    return (
                      <div className="mt-3 space-y-3 bg-background border rounded-md p-3">
                        {/* Editable values per placeholder */}
                        <div>
                          <p className="text-xs font-semibold mb-1.5">Valores de prueba para placeholders:</p>
                          <div className="space-y-1.5">
                            {SYSTEM_PLACEHOLDERS.map(ph => {
                              const key = ph.replace(/[{}]/g, '');
                              return (
                                <div key={key} className="flex items-center gap-2">
                                  <code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded shrink-0 w-40">{ph}</code>
                                  <Input
                                    value={previewValues[key] || ''}
                                    onChange={e => setPreviewValues(v => ({ ...v, [key]: e.target.value }))}
                                    className="h-7 text-xs"
                                    placeholder="Valor de prueba"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold mb-1">templateModel resuelto (lo que recibirá Postmark):</p>
                          <pre className="text-[11px] bg-muted rounded p-2 overflow-x-auto font-mono">
{JSON.stringify(resolvedJson, null, 2)}
                          </pre>
                        </div>

                        {asuntoPreview && (
                          <div>
                            <p className="text-xs font-semibold mb-1">Asunto del email:</p>
                            <div className="text-xs bg-muted rounded p-2">{asuntoPreview}</div>
                          </div>
                        )}

                        {detallesPreview && (
                          <div>
                            <p className="text-xs font-semibold mb-1">Detalles del email (HTML):</p>
                            <div
                              className="text-xs bg-muted rounded p-2 prose prose-sm max-w-none"
                              dangerouslySetInnerHTML={{ __html: detallesPreview }}
                            />
                          </div>
                        )}

                        {waPreview && (
                          <div>
                            <p className="text-xs font-semibold mb-1">Mensaje WhatsApp:</p>
                            <div className="text-xs bg-muted rounded p-2 whitespace-pre-wrap">{waPreview}</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {!mapeoHasPath('asunto') && (
                <div>
                  <Label>Asunto del email</Label>
                  <Input
                    value={editItem.asunto_email}
                    onChange={e => setEditItem({ ...editItem, asunto_email: e.target.value })}
                    placeholder="Asunto..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Placeholders: {'{nombre_desarrollo}'}, {'{nombre_esquema}'}. Se oculta si lo defines en el mapeo como <code>"asunto"</code>.
                  </p>
                </div>
              )}

              {!mapeoHasPath('mensaje.detalles') && (
                <div>
                  <Label>Detalles del email (HTML)</Label>
                  <Textarea
                    value={editItem.plantilla_email_detalles}
                    onChange={e => setEditItem({ ...editItem, plantilla_email_detalles: e.target.value })}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Se oculta si lo defines en el mapeo como <code>"mensaje.detalles"</code>.
                  </p>
                </div>
              )}

              <div>
                <Label>Mensaje WhatsApp</Label>
                <Textarea
                  value={editItem.plantilla_wa}
                  onChange={e => setEditItem({ ...editItem, plantilla_wa: e.target.value })}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground mt-1">Usa *texto* para negritas en WhatsApp</p>
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
