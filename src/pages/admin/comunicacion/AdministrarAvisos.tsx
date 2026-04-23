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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Pencil, Trash2, Search, Users, Mail, Loader2, Info, Clock, CalendarClock, Bell } from "lucide-react";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { AvisoDestinatariosSection } from "@/components/admin/AvisoDestinatariosSection";
import { AvisoPayloadSection } from "@/components/admin/AvisoPayloadSection";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { usePagination } from "@/hooks/usePagination";
import { SimplePagination } from "@/components/ui/simple-pagination";

interface PostmarkTemplate {
  id: number;
  name: string;
  active: boolean;
}

interface Aviso {
  id: number;
  nombre: string;
  asunto: string;
  mensaje_html: string;
  mensajes_whatsapp?: any;
  tipo_envio: string;
  cron_expression: string | null;
  activo: boolean;
  fecha_creacion: string;
  postmark_template_id: number;
  modo_trigger?: string | null;
  payload_postmark?: any;
}

interface ProyectoPublicado {
  id: number;
  nombre: string;
}

interface Rol {
  id: number;
  nombre: string;
}

interface Destinatario {
  nombre: string;
  email: string;
  telefono?: string;
}

interface FuenteTrigger {
  id: number;
  clave: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

interface TriggerEvento {
  id?: number;
  id_aviso?: number;
  id_fuente: number;
  offsets_dias: number[];
  hora_envio: string; // HH:MM
  canal: 'email' | 'whatsapp' | 'ambos';
  filtros?: any;
  activo: boolean;
}

const DIAS_SEMANA: Record<string, string> = { '0': 'domingo', '1': 'lunes', '2': 'martes', '3': 'miércoles', '4': 'jueves', '5': 'viernes', '6': 'sábado', '7': 'domingo' };
const MESES: Record<string, string> = { '1': 'enero', '2': 'febrero', '3': 'marzo', '4': 'abril', '5': 'mayo', '6': 'junio', '7': 'julio', '8': 'agosto', '9': 'septiembre', '10': 'octubre', '11': 'noviembre', '12': 'diciembre' };

function validateCronField(field: string, min: number, max: number, name: string): { valid: boolean; error?: string } {
  if (field === '*') return { valid: true };
  const stepMatch = field.match(/^(.+)\/(\d+)$/);
  let base = field;
  if (stepMatch) {
    const step = parseInt(stepMatch[2], 10);
    if (isNaN(step) || step < 1) return { valid: false, error: `${name}: paso inválido "${stepMatch[2]}"` };
    base = stepMatch[1];
    if (base === '*') return { valid: true };
  }
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

  let time = '';
  if (min.startsWith('*/') && hour === '*') {
    time = `cada ${min.slice(2)} minutos`;
  } else if (min.startsWith('*/') && hour !== '*' && !hour.startsWith('*/') && !hour.includes('-')) {
    const step = min.slice(2);
    time = `cada ${step} minutos de ${hour}:00 a ${hour}:59`;
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
      const step = min.slice(2);
      time = `cada ${step} minutos de ${startHour}:00 a ${endHour}:59`;
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

const CRON_PRESETS = [
  { label: 'Cada hora', value: '0 * * * *' },
  { label: 'Cada día 9am', value: '0 9 * * *' },
  { label: 'Lunes a Viernes 9am', value: '0 9 * * 1-5' },
  { label: 'Lunes 9am', value: '0 9 * * 1' },
  { label: 'Primer día del mes 9am', value: '0 9 1 * *' },
];

function describeOffsets(offsets: number[]): string {
  if (!offsets || offsets.length === 0) return 'sin desfases configurados';
  const sorted = [...offsets].sort((a, b) => a - b);
  const parts = sorted.map((o) => {
    if (o === 0) return 'el mismo día del vencimiento';
    if (o < 0) return `${Math.abs(o)} día${Math.abs(o) === 1 ? '' : 's'} antes`;
    return `${o} día${o === 1 ? '' : 's'} después`;
  });
  return formatList(parts);
}

function describeEventTrigger(trigger: TriggerEvento, fuente?: FuenteTrigger): string {
  const fuenteNombre = fuente?.nombre || 'fuente desconocida';
  const offsetsTxt = describeOffsets(trigger.offsets_dias || []);
  const hora = (trigger.hora_envio || '').slice(0, 5);
  const canalTxt = trigger.canal === 'ambos'
    ? 'por correo y WhatsApp'
    : trigger.canal === 'whatsapp'
    ? 'por WhatsApp'
    : 'por correo';
  return `Se dispara automáticamente cuando un registro de "${fuenteNombre}" cumple la condición: ${offsetsTxt} respecto a su fecha objetivo. El envío se realiza ${canalTxt} a las ${hora || '--:--'} (hora México).`;
}

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
  const [postmarkTemplateId, setPostmarkTemplateId] = useState<string>("36978552");
  const [selectedProyectos, setSelectedProyectos] = useState<string[]>([]);
  const [proyectosPublicados, setProyectosPublicados] = useState<ProyectoPublicado[]>([]);
  const [mensajesWhatsapp, setMensajesWhatsapp] = useState<string[]>(["", "", ""]);
  const [postmarkTemplates, setPostmarkTemplates] = useState<PostmarkTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Modo trigger por evento
  const [modoTrigger, setModoTrigger] = useState<'cron' | 'evento'>('cron');
  const [fuentesTrigger, setFuentesTrigger] = useState<FuenteTrigger[]>([]);
  const [eventoFuenteId, setEventoFuenteId] = useState<string>('');
  const [eventoOffsets, setEventoOffsets] = useState<string>('-5,-3,-1');
  const [eventoHora, setEventoHora] = useState<string>('10:00');
  const [eventoCanal, setEventoCanal] = useState<'email' | 'whatsapp' | 'ambos'>('email');
  const [eventoActivo, setEventoActivo] = useState<boolean>(true);

  // Payload Postmark personalizado
  const [payloadEnabled, setPayloadEnabled] = useState<boolean>(false);
  const [payloadJson, setPayloadJson] = useState<string>("");

  // Modal de detalle/preview de un aviso
  const [detailAviso, setDetailAviso] = useState<Aviso | null>(null);
  const [detailTriggers, setDetailTriggers] = useState<TriggerEvento[]>([]);
  const [detailRoles, setDetailRoles] = useState<Array<{ id_rol: number; correos: any }>>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = async (aviso: Aviso) => {
    setDetailAviso(aviso);
    setDetailTriggers([]);
    setDetailRoles([]);
    setDetailLoading(true);
    const [{ data: trigs }, { data: rolesData }] = await Promise.all([
      supabase.from('avisos_triggers_evento').select('*').eq('id_aviso', aviso.id),
      supabase.from('avisos_roles_destinatarios').select('id_rol, correos').eq('id_aviso', aviso.id),
    ]);
    setDetailTriggers((trigs as any) || []);
    setDetailRoles((rolesData as any) || []);
    setDetailLoading(false);
  };

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

  const fetchFuentes = async () => {
    const { data } = await supabase
      .from('aviso_triggers_fuentes')
      .select('*')
      .eq('activo', true)
      .order('nombre');
    const list = (data as any[]) || [];
    setFuentesTrigger(list);
    // Auto-select the first available source (single conceptual source: acuerdos_pago.fecha_pago)
    if (list.length > 0) {
      setEventoFuenteId(prev => prev || String(list[0].id));
    }
  };

  const fetchProyectosPublicados = async () => {
    const { data } = await supabase
      .from('proyectos')
      .select('id, nombre')
      .eq('activo', true)
      .eq('publicar', true)
      .order('nombre');
    setProyectosPublicados((data as ProyectoPublicado[]) || []);
  };

  useEffect(() => { fetchAvisos(); fetchRoles(); fetchPostmarkTemplates(); fetchFuentes(); fetchProyectosPublicados(); }, []);

  const openCreate = () => {
    setEditingAviso(null);
    setNombre(""); setAsunto(""); setMensajeHtml(""); setTipoEnvio("manual");
    setCronExpression(""); setCronError(""); setActivo(true); setSelectedRoles([]); setDestinatarios([]);
    setPostmarkTemplateId("36978552"); setSelectedProyectos(proyectosPublicados.map((p) => p.nombre));
    setMensajesWhatsapp(["", "", ""]);
    setModoTrigger('cron');
    setEventoFuenteId(fuentesTrigger[0] ? String(fuentesTrigger[0].id) : '');
    setEventoOffsets('-5,-3,-1');
    setEventoHora('10:00'); setEventoCanal('email'); setEventoActivo(true);
    setPayloadEnabled(false);
    setPayloadJson("");
    setDialogOpen(true);
  };

  const openEdit = async (aviso: Aviso) => {
    setEditingAviso(aviso);
    setNombre(aviso.nombre); setAsunto(aviso.asunto); setMensajeHtml(aviso.mensaje_html);
    setTipoEnvio(aviso.tipo_envio); setCronExpression(aviso.cron_expression || "");
    setActivo(aviso.activo);
    setPostmarkTemplateId(String(aviso.postmark_template_id || 36978552));
    setMensajesWhatsapp(Array.isArray(aviso.mensajes_whatsapp)
      ? [...aviso.mensajes_whatsapp.slice(0, 3), ...Array(Math.max(0, 3 - aviso.mensajes_whatsapp.length)).fill("")]
      : ["", "", ""]);
    setModoTrigger((aviso.modo_trigger as any) || 'cron');

    // Load payload personalizado
    if (aviso.payload_postmark) {
      setPayloadEnabled(true);
      try { setPayloadJson(JSON.stringify(aviso.payload_postmark, null, 2)); }
      catch { setPayloadJson(""); }
    } else {
      setPayloadEnabled(false);
      setPayloadJson("");
    }

    // Load existing roles and their correos
    const [{ data }, { data: avisoProyectos }] = await Promise.all([
      supabase.from('avisos_roles_destinatarios').select('id_rol, correos').eq('id_aviso', aviso.id),
      supabase.from('avisos_proyectos').select('id_proyecto').eq('id_aviso', aviso.id).eq('activo', true),
    ]);
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
    setSelectedProyectos(
      avisoProyectos && avisoProyectos.length > 0
        ? avisoProyectos
            .map((item: any) => proyectosPublicados.find((proyecto) => proyecto.id === item.id_proyecto)?.nombre)
            .filter(Boolean)
        : proyectosPublicados.map((proyecto) => proyecto.nombre)
    );

    // Load existing event trigger config (single row per aviso in V1)
    const { data: trigData } = await supabase
      .from('avisos_triggers_evento')
      .select('*')
      .eq('id_aviso', aviso.id)
      .maybeSingle();
    if (trigData) {
      setEventoFuenteId(String((trigData as any).id_fuente));
      setEventoOffsets(((trigData as any).offsets_dias || []).join(','));
      setEventoHora(((trigData as any).hora_envio || '10:00:00').substring(0, 5));
      setEventoCanal(((trigData as any).canal as any) || 'email');
      setEventoActivo(!!(trigData as any).activo);
    } else {
      setEventoFuenteId(fuentesTrigger[0] ? String(fuentesTrigger[0].id) : '');
      setEventoOffsets('-5,-3,-1'); setEventoHora('10:00');
      setEventoCanal('email'); setEventoActivo(true);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!nombre || !asunto || !mensajeHtml) {
      toast({ title: "Error", description: "Nombre, asunto y mensaje son requeridos", variant: "destructive" });
      return;
    }
    let parsedOffsets: number[] = [];
    if (tipoEnvio === 'automatico') {
      if (modoTrigger === 'cron') {
        if (!cronExpression) {
          toast({ title: "Error", description: "La expresión cron es requerida para envío automático", variant: "destructive" });
          return;
        }
        const cronValidation = validateCron(cronExpression);
        if (!cronValidation.valid) {
          toast({ title: "Expresión cron inválida", description: cronValidation.error, variant: "destructive" });
          return;
        }
      } else {
        if (!eventoFuenteId) {
          toast({ title: "Error", description: "Selecciona la fuente del evento", variant: "destructive" });
          return;
        }
        parsedOffsets = eventoOffsets.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        if (parsedOffsets.length === 0) {
          toast({ title: "Error", description: "Ingresa al menos un offset de días (ej. -5,-3,-1)", variant: "destructive" });
          return;
        }
        if (!/^\d{2}:\d{2}$/.test(eventoHora)) {
          toast({ title: "Error", description: "Hora de envío inválida (formato HH:MM)", variant: "destructive" });
          return;
        }
      }
    }

    if (selectedRoles.length === 0 && destinatarios.length === 0) {
      toast({ title: "Error", description: "Debes agregar al menos un rol o un destinatario manualmente", variant: "destructive" });
      return;
    }

    const templateId = parseInt(postmarkTemplateId, 10);
    if (isNaN(templateId) || templateId <= 0) {
      toast({ title: "Error", description: "El ID de template de Postmark debe ser un número válido", variant: "destructive" });
      return;
    }

    // Validate custom payload JSON
    let payloadPostmark: any = null;
    if (payloadEnabled) {
      if (!payloadJson.trim()) {
        toast({ title: "Error", description: "El payload personalizado está vacío", variant: "destructive" });
        return;
      }
      try {
        payloadPostmark = JSON.parse(payloadJson);
      } catch (e: any) {
        toast({ title: "JSON inválido en payload", description: e.message, variant: "destructive" });
        return;
      }
    }

    const payload = {
      nombre, asunto, mensaje_html: mensajeHtml, tipo_envio: tipoEnvio,
      cron_expression: (tipoEnvio === 'automatico' && modoTrigger === 'cron') ? cronExpression : null,
      activo, fecha_actualizacion: new Date().toISOString(),
      postmark_template_id: templateId,
      modo_trigger: tipoEnvio === 'automatico' ? modoTrigger : 'cron',
      payload_postmark: payloadPostmark,
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

    // Save roles with correos
    await supabase.from('avisos_roles_destinatarios').delete().eq('id_aviso', avisoId);
    const correosJson = JSON.parse(JSON.stringify({ destinatarios }));
    if (selectedRoles.length > 0) {
      await supabase.from('avisos_roles_destinatarios').insert(
        selectedRoles.map(id_rol => ({
          id_aviso: avisoId,
          id_rol,
          correos: correosJson,
        }))
      );
    } else if (destinatarios.length > 0) {
      const { data: firstRole } = await supabase.from('roles').select('id').eq('activo', true).limit(1).single();
      if (firstRole) {
        await supabase.from('avisos_roles_destinatarios').insert({
          id_aviso: avisoId,
          id_rol: firstRole.id,
          correos: correosJson,
        });
      }
    }

    // Persist event-trigger config: one row per aviso (delete + insert for simplicity)
    await supabase.from('avisos_triggers_evento').delete().eq('id_aviso', avisoId);
    if (tipoEnvio === 'automatico' && modoTrigger === 'evento' && eventoFuenteId) {
      const { error: trigErr } = await supabase.from('avisos_triggers_evento').insert({
        id_aviso: avisoId,
        id_fuente: parseInt(eventoFuenteId, 10),
        offsets_dias: parsedOffsets,
        hora_envio: `${eventoHora}:00`,
        canal: eventoCanal,
        activo: eventoActivo,
      });
      if (trigErr) {
        toast({ title: "Aviso guardado, pero error en trigger evento", description: trigErr.message, variant: "destructive" });
      }
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
  const { paginated: pagedAvisos, page, setPage, totalPages, total, from, to } = usePagination(filtered, 50);

  if (permLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  // Build preview HTML with recipient info
  const previewHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #f3f4f6; padding: 12px 16px; border-bottom: 2px solid #e5e7eb;">
        <div style="font-size: 11px; color: #6b7280; margin-bottom: 2px;">Asunto:</div>
        <div style="font-size: 14px; font-weight: 600; color: #111827;">${asunto || '(Sin asunto)'}</div>
      </div>
      <div style="background: #eef2ff; padding: 8px 16px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #4338ca;">
        <strong>Destinatarios:</strong> ${destinatarios.length} seleccionado${destinatarios.length !== 1 ? 's' : ''}
        ${selectedProyectos.length > 0 ? ` | <strong>Proyectos:</strong> ${selectedProyectos.join(', ')}` : ''}
        | <strong>Template ID:</strong> ${postmarkTemplateId}
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
              <TableHead>Template ID</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead>Fecha Creación</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No hay avisos</TableCell></TableRow>
            ) : pagedAvisos.map(aviso => (
              <TableRow key={aviso.id}>
                <TableCell className="font-medium">{aviso.nombre}</TableCell>
                <TableCell>
                  {aviso.tipo_envio === 'automatico' && aviso.modo_trigger === 'evento' ? (
                    <Badge variant="default" className="bg-accent text-accent-foreground">automático · evento</Badge>
                  ) : aviso.tipo_envio === 'automatico' && aviso.cron_expression ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" className="inline-flex">
                          <Badge variant="default" className="cursor-pointer hover:opacity-80">
                            automático
                          </Badge>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto max-w-xs text-sm">
                        <p className="font-medium mb-1">Programación</p>
                        <p className="text-muted-foreground">{describeCron(aviso.cron_expression)}</p>
                        <p className="text-xs text-muted-foreground mt-1 font-mono">{aviso.cron_expression}</p>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <Badge variant="secondary">{aviso.tipo_envio}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">
                    {(() => {
                      const tid = aviso.postmark_template_id || 36978552;
                      const tmpl = postmarkTemplates.find(t => t.id === tid);
                      return tmpl ? `${tmpl.name}` : tid;
                    })()}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Switch checked={aviso.activo} onCheckedChange={() => canUpdate && toggleActivo(aviso)} disabled={!canUpdate} />
                </TableCell>
                <TableCell>{new Date(aviso.fecha_creacion).toLocaleDateString('es-MX')}</TableCell>
                <TableCell className="text-right space-x-2">
                  <Button variant="ghost" size="icon" onClick={() => openDetail(aviso)} title="Ver detalle de envío">
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  {canUpdate && <Button variant="ghost" size="icon" onClick={() => openEdit(aviso)}><Pencil className="h-4 w-4" /></Button>}
                  {canDelete && <Button variant="ghost" size="icon" onClick={() => setDeleteId(aviso.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
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
              <div className="grid grid-cols-2 gap-4">
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
                <div>
                  <Label>Template Postmark</Label>
                  {loadingTemplates ? (
                    <div className="flex items-center gap-2 h-10 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Cargando templates...
                    </div>
                  ) : postmarkTemplates.length > 0 ? (
                    <Select value={postmarkTemplateId} onValueChange={setPostmarkTemplateId}>
                      <SelectTrigger className="font-mono">
                        <SelectValue placeholder="Seleccionar template" />
                      </SelectTrigger>
                      <SelectContent>
                        {postmarkTemplates.filter(t => t.active).map(t => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            <span className="font-mono text-xs mr-2">{t.id}</span> {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={postmarkTemplateId}
                      onChange={e => setPostmarkTemplateId(e.target.value.replace(/\D/g, ''))}
                      placeholder="36978552"
                      className="font-mono"
                    />
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">Default: 36978552</p>
                </div>
              </div>
              {tipoEnvio === 'automatico' && (
                <>
                  <div>
                    <Label>Modo de disparo</Label>
                    <Select value={modoTrigger} onValueChange={(v) => setModoTrigger(v as 'cron' | 'evento')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cron">Por fecha y hora (cron)</SelectItem>
                        <SelectItem value="evento">Por evento (relativo a una fecha)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {modoTrigger === 'cron' && (
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

                  {modoTrigger === 'evento' && (
                    <div className="space-y-3 border rounded-md p-3 bg-muted/30">
                      <div>
                        <Label>Fecha base</Label>
                        <div className="rounded-md border bg-background px-3 py-2 text-sm">
                          <code className="text-primary">acuerdos_pago.fecha_pago</code>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Se evalúa sobre acuerdos activos no pagados. Usa offsets <strong>negativos</strong> para enviar antes del vencimiento (recordatorios) y <strong>positivos</strong> para enviar después (cobranza vencida).
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Offsets en días</Label>
                          <Input value={eventoOffsets} onChange={e => setEventoOffsets(e.target.value)}
                            placeholder="-5,-3,-1" className="font-mono" />
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Negativos = antes de la fecha, positivos = después. Ej. <code>-5,-3,-1</code> o <code>1,3,7</code>.
                          </p>
                        </div>
                        <div>
                          <Label>Hora de envío (México UTC-6)</Label>
                          <Input type="time" value={eventoHora} onChange={e => setEventoHora(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <Label>Canal</Label>
                        <Select value={eventoCanal} onValueChange={(v) => setEventoCanal(v as any)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="whatsapp">WhatsApp</SelectItem>
                            <SelectItem value="ambos">Ambos</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={eventoActivo} onCheckedChange={setEventoActivo} />
                        <Label>Trigger evento activo</Label>
                      </div>
                      {eventoFuenteId && eventoOffsets && (
                        <p className="text-xs font-medium text-primary">
                          Se enviará por {eventoCanal} a las {eventoHora}, en los offsets ({eventoOffsets.split(',').map(s => s.trim()).filter(Boolean).join(', ')}) días respecto a <code>acuerdos_pago.fecha_pago</code>.
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        Variables disponibles en asunto y mensaje: <code>{'{{nombre}}'}</code>, <code>{'{{monto}}'}</code>, <code>{'{{fecha_pago}}'}</code>, <code>{'{{orden}}'}</code>, <code>{'{{cuenta_id}}'}</code>, <code>{'{{offset}}'}</code>.
                      </p>
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center gap-2">
                <Switch checked={activo} onCheckedChange={setActivo} />
                <Label>Activo</Label>
              </div>

              <AvisoPayloadSection
                enabled={payloadEnabled}
                onEnabledChange={setPayloadEnabled}
                payloadJson={payloadJson}
                onPayloadJsonChange={setPayloadJson}
                modo={tipoEnvio === 'automatico' ? (modoTrigger === 'evento' ? 'evento' : 'cron') : 'manual'}
              />

              <AvisoDestinatariosSection
                roles={roles}
                selectedRoles={selectedRoles}
                onToggleRole={toggleRole}
                destinatarios={destinatarios}
                onDestinatariosChange={setDestinatarios}
                selectedProyectos={selectedProyectos}
                onSelectedProyectosChange={setSelectedProyectos}
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

      {/* Detalle de envío del aviso */}
      <Dialog open={!!detailAviso} onOpenChange={(o) => !o && setDetailAviso(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              {detailAviso?.nombre}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : detailAviso && (
            <div className="space-y-4 text-sm">
              {/* Estado */}
              <div className="flex items-center gap-2">
                <Badge variant={detailAviso.activo ? 'default' : 'secondary'}>
                  {detailAviso.activo ? 'Activo' : 'Inactivo'}
                </Badge>
                <Badge variant="outline">{detailAviso.tipo_envio}</Badge>
                {detailAviso.modo_trigger === 'evento' && (
                  <Badge variant="outline">por evento</Badge>
                )}
              </div>

              {/* Cuándo se envía */}
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  {detailAviso.modo_trigger === 'evento' ? <CalendarClock className="h-4 w-4 text-primary" /> : <Clock className="h-4 w-4 text-primary" />}
                  ¿Cuándo se envía?
                </div>
                {detailAviso.tipo_envio === 'manual' && (
                  <p className="text-muted-foreground">
                    Este aviso es <strong>manual</strong>. Solo se envía cuando alguien lo dispara desde la pantalla "Enviar Avisos".
                  </p>
                )}
                {detailAviso.tipo_envio === 'automatico' && detailAviso.modo_trigger !== 'evento' && detailAviso.cron_expression && (
                  <>
                    <p className="text-foreground">{describeCron(detailAviso.cron_expression)}</p>
                    <p className="text-xs font-mono text-muted-foreground">{detailAviso.cron_expression} (hora México UTC-6)</p>
                  </>
                )}
                {detailAviso.tipo_envio === 'automatico' && detailAviso.modo_trigger === 'evento' && (
                  detailTriggers.length === 0 ? (
                    <p className="text-muted-foreground italic">No hay triggers de evento configurados.</p>
                  ) : (
                    <div className="space-y-3">
                      {detailTriggers.map((trig, idx) => {
                        const fuente = fuentesTrigger.find(f => f.id === trig.id_fuente);
                        return (
                          <div key={idx} className="rounded-md bg-background border p-3 space-y-1">
                            <p className="text-foreground">{describeEventTrigger(trig, fuente)}</p>
                            {fuente?.descripcion && (
                              <p className="text-xs text-muted-foreground">{fuente.descripcion}</p>
                            )}
                            {!trig.activo && (
                              <Badge variant="secondary" className="text-[10px]">Trigger desactivado</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
                {detailAviso.tipo_envio === 'automatico' && detailAviso.modo_trigger !== 'evento' && !detailAviso.cron_expression && (
                  <p className="text-muted-foreground italic">Este aviso es automático pero no tiene programación cron configurada.</p>
                )}
              </div>

              {/* Destinatarios */}
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                <div className="flex items-center gap-2 font-medium">
                  <Users className="h-4 w-4 text-primary" />
                  ¿A quién se envía?
                </div>
                {detailRoles.length === 0 ? (
                  <p className="text-muted-foreground italic">Sin roles configurados (los destinatarios se calculan dinámicamente según la fuente del evento).</p>
                ) : (
                  (() => {
                    // correos puede venir como { destinatarios: [{email,nombre}] } o como array directo
                    const extraerCorreos = (c: any): { email: string; nombre?: string }[] => {
                      if (!c) return [];
                      if (Array.isArray(c)) {
                        return c.map((x: any) => typeof x === 'string' ? { email: x } : x).filter((x: any) => x?.email);
                      }
                      if (Array.isArray(c?.destinatarios)) {
                        return c.destinatarios.filter((x: any) => x?.email);
                      }
                      return [];
                    };
                    const rolesConCorreos = detailRoles.map(r => ({
                      rolNombre: roles.find(x => x.id === r.id_rol)?.nombre || `Rol ${r.id_rol}`,
                      correos: extraerCorreos(r.correos),
                    }));
                    const totalCorreos = rolesConCorreos.reduce((acc, r) => acc + r.correos.length, 0);
                    const esEvento = detailAviso.modo_trigger === 'evento';
                    const todosCorreos = rolesConCorreos.flatMap(r => r.correos);

                    // CASO 1: Aviso por evento con correos específicos
                    // → Solo se envía a esos correos manuales (modo prueba/auditoría)
                    if (esEvento && totalCorreos > 0) {
                      const mostrar = todosCorreos.slice(0, 5);
                      return (
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start gap-2">
                            <Mail className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                            <span>
                              Solo a <strong>{totalCorreos}</strong> correo{totalCorreos === 1 ? '' : 's'} específico{totalCorreos === 1 ? '' : 's'} (modo prueba)
                            </span>
                          </div>
                          <ul className="text-xs text-muted-foreground space-y-0.5 pl-5">
                            {mostrar.map((c, i) => (
                              <li key={i}>
                                {c.nombre ? <><strong className="text-foreground/80">{c.nombre}</strong> — </> : null}
                                {c.email}
                              </li>
                            ))}
                            {todosCorreos.length > mostrar.length && (
                              <li className="italic">y {todosCorreos.length - mostrar.length} más…</li>
                            )}
                          </ul>
                        </div>
                      );
                    }

                    // CASO 2: Aviso por evento SIN correos específicos
                    // → Se envía dinámicamente a las personas que cumplan la condición del evento
                    if (esEvento) {
                      return (
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start gap-2">
                            <Mail className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                            <span>
                              A las personas que cumplan la condición del evento en cada ejecución
                              {detailRoles.length > 0 && (
                                <> (filtrado por: <strong>{rolesConCorreos.map(r => r.rolNombre).join(', ')}</strong>)</>
                              )}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground pl-5 italic">
                            Ejemplo: si solo 3 de 100 clientes tienen pago próximo, solo se envía a esos 3.
                          </p>
                        </div>
                      );
                    }

                    // CASO 3: Aviso manual o automático cron
                    // → Se envía a todos los usuarios del rol + correos adicionales
                    return (
                      <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2">
                          <Mail className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                          <span>
                            A todos los usuarios con {detailRoles.length === 1 ? 'el rol' : 'los roles'}:{' '}
                            <strong>{rolesConCorreos.map(r => r.rolNombre).join(', ')}</strong>
                            {totalCorreos > 0 && (
                              <> + <strong>{totalCorreos}</strong> correo{totalCorreos === 1 ? '' : 's'} adicional{totalCorreos === 1 ? '' : 'es'}</>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailAviso(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
