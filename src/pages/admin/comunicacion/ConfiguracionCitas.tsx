import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, CalendarClock, Check, ChevronsUpDown, Pencil, Plus, Settings2, Copy, AlertTriangle, CalendarIcon, Video, X, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { format, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const DIAS_SEMANA = [
  { id: 1, nombre: "Lunes", short: "Lun" },
  { id: 2, nombre: "Martes", short: "Mar" },
  { id: 3, nombre: "Miércoles", short: "Mié" },
  { id: 4, nombre: "Jueves", short: "Jue" },
  { id: 5, nombre: "Viernes", short: "Vie" },
  { id: 6, nombre: "Sábado", short: "Sáb" },
];

const SERVICE_ACCOUNT_EMAIL = "cuenta-conexiones-drive@sozu-38755.iam.gserviceaccount.com";

function generateSlots(duracionMinutos: number) {
  const slots: { hour: number; minute: number; label: string }[] = [];
  const stepMinutes = duracionMinutos;
  for (let totalMin = 9 * 60; totalMin <= 20 * 60; totalMin += stepMinutes) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    slots.push({ hour: h, minute: m, label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` });
  }
  return slots;
}

const DURACIONES = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1 hr 30 min" },
  { value: 120, label: "2 horas" },
];

export default function ConfiguracionCitas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = profile?.rol_nombre === "Super Administrador";

  const [selectedUserEmail, setSelectedUserEmail] = useState<string>("");
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [selectedSlots, setSelectedSlots] = useState<Map<number, Set<string>>>(new Map());
  const [duracionMinutos, setDuracionMinutos] = useState<number>(60);
  const [calendarioEmail, setCalendarioEmail] = useState<string>("");
  const [maxInvitados, setMaxInvitados] = useState<number>(1);
  const [selectedProyectoIds, setSelectedProyectoIds] = useState<number[]>([]);
  const [correosEnterado, setCorreosEnterado] = useState<string[]>([]);
  const [descripcionInvitacion, setDescripcionInvitacion] = useState<string>("");
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [userSelectorOpen, setUserSelectorOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [tiposCrudOpen, setTiposCrudOpen] = useState(false);
  const [nuevoTipoNombre, setNuevoTipoNombre] = useState("");
  const [editingTipoId, setEditingTipoId] = useState<number | null>(null);
  const [editingTipoNombre, setEditingTipoNombre] = useState("");
  const [fechaFinRecurrencia, setFechaFinRecurrencia] = useState<Date>(addMonths(new Date(), 3));
  const [meetCalendarOpen, setMeetCalendarOpen] = useState(false);
  const [nuevaCitaDialogOpen, setNuevaCitaDialogOpen] = useState(false);
  const [nuevaCitaTipoId, setNuevaCitaTipoId] = useState<string>("");
  const [nuevaCitaNombre, setNuevaCitaNombre] = useState("");

  useEffect(() => {
    if (!isSuperAdmin && profile?.email) {
      setSelectedUserEmail(profile.email);
    }
  }, [isSuperAdmin, profile?.email]);

  // Fetch active tipos de cita
  const { data: tiposCita = [] } = useQuery({
    queryKey: ["tipos-cita"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tipos_cita").select("*").eq("activo", true).order("id");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch ALL tipos de cita (for CRUD)
  const { data: allTiposCita = [] } = useQuery({
    queryKey: ["tipos-cita-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tipos_cita").select("*").order("id");
      if (error) throw error;
      return data || [];
    },
    enabled: isSuperAdmin,
  });

  // Fetch published projects
  const { data: proyectosPublicados = [] } = useQuery({
    queryKey: ["proyectos-publicados"],
    queryFn: async () => {
      const query = supabase.from("proyectos").select("id, nombre").eq("activo", true);
      const { data, error } = await (query as any).eq("publicar", true).order("nombre");
      if (error) throw error;
      return (data || []) as { id: number; nombre: string }[];
    },
  });

  const addTipoCitaMutation = useMutation({
    mutationFn: async ({ nombre }: { nombre: string }) => {
      const { error } = await supabase.from("tipos_cita").insert({ nombre, activo: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos-cita"] });
      queryClient.invalidateQueries({ queryKey: ["tipos-cita-all"] });
      setNuevoTipoNombre("");
      toast.success("Tipo de cita agregado");
    },
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  const updateTipoCitaMutation = useMutation({
    mutationFn: async ({ id, nombre }: { id: number; nombre: string }) => {
      const { error } = await supabase.from("tipos_cita").update({ nombre }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos-cita"] });
      queryClient.invalidateQueries({ queryKey: ["tipos-cita-all"] });
      setEditingTipoId(null);
      toast.success("Tipo de cita actualizado");
    },
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  const toggleTipoCitaMutation = useMutation({
    mutationFn: async ({ id, activo }: { id: number; activo: boolean }) => {
      // If deactivating, check if there are active configs using this tipo
      if (!activo) {
        const { count, error: countError } = await supabase
          .from("configuracion_citas_usuarios")
          .select("id", { count: "exact", head: true })
          .eq("id_tipo_cita", id)
          .eq("activo", true);
        if (countError) throw countError;
        if (count && count > 0) {
          throw new Error(`No se puede desactivar: tiene ${count} cita(s) configurada(s) activa(s)`);
        }
      }
      const { error } = await supabase.from("tipos_cita").update({ activo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipos-cita"] });
      queryClient.invalidateQueries({ queryKey: ["tipos-cita-all"] });
      toast.success("Estado actualizado");
    },
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  // Fetch users with configurar_citas role
  const { data: usersWithCitas = [] } = useQuery({
    queryKey: ["users-configurar-citas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usuarios")
        .select("email, nombre, roles!inner(configurar_citas), personas:id_persona(nombre_legal)")
        .eq("activo", true)
        .eq("roles.configurar_citas", true)
        .order("nombre");
      if (error) throw error;
      return (data || []).map((u: any) => ({
        email: u.email,
        nombre: u.personas?.nombre_legal || u.nombre || u.email,
      }));
    },
  });

  // Fetch all cita configs for selected user (multiple per tipo)
  const { data: userCitaConfigs = [], isLoading: loadingConfigs } = useQuery({
    queryKey: ["config-citas-usuarios-all", selectedUserEmail],
    queryFn: async () => {
      if (!selectedUserEmail) return [];
      const { data, error } = await supabase
        .from("configuracion_citas_usuarios")
        .select("*")
        .eq("id_usuario_email", selectedUserEmail)
        .eq("activo", true)
        .order("id");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedUserEmail,
  });

  // Auto-select first config when loaded
  useEffect(() => {
    if (userCitaConfigs.length > 0 && !selectedConfigId) {
      setSelectedConfigId(userCitaConfigs[0].id.toString());
    } else if (userCitaConfigs.length === 0) {
      setSelectedConfigId("");
    }
  }, [userCitaConfigs]);

  const selectedConfig = userCitaConfigs.find((c: any) => c.id.toString() === selectedConfigId);

  // Fetch horarios for selected config
  const { data: existingConfig = [], isLoading: loadingHorarios } = useQuery({
    queryKey: ["config-citas-horarios-by-config", selectedConfigId],
    queryFn: async () => {
      if (!selectedConfigId) return [];
      const configId = parseInt(selectedConfigId);
      // Try fetching by id_configuracion_cita first
      const { data, error } = await supabase
        .from("configuracion_citas_horarios")
        .select("*")
        .eq("id_configuracion_cita", configId)
        .eq("activo", true);
      if (error) throw error;
      if (data && data.length > 0) return data;
      // Fallback: fetch by email + tipo_cita for legacy data
      if (selectedConfig) {
        const { data: fallback } = await supabase
          .from("configuracion_citas_horarios")
          .select("*")
          .eq("id_usuario_email", selectedConfig.id_usuario_email)
          .eq("id_tipo_cita", selectedConfig.id_tipo_cita)
          .eq("activo", true);
        return fallback || [];
      }
      return [];
    },
    enabled: !!selectedConfigId,
  });

  // Fetch linked projects for selected config
  const { data: configProyectos = [] } = useQuery({
    queryKey: ["config-citas-proyectos", selectedConfigId],
    queryFn: async () => {
      if (!selectedConfigId) return [];
      const { data, error } = await supabase
        .from("configuracion_citas_proyectos")
        .select("id_proyecto")
        .eq("id_configuracion_cita", parseInt(selectedConfigId));
      if (error) throw error;
      return (data || []).map((d: any) => d.id_proyecto);
    },
    enabled: !!selectedConfigId,
  });

  // Initialize from existing config
  useEffect(() => {
    const days = new Set<number>();
    const slots = new Map<number, Set<string>>();
    existingConfig.forEach((c: any) => {
      days.add(c.dia_semana);
      if (!slots.has(c.dia_semana)) slots.set(c.dia_semana, new Set());
      slots.get(c.dia_semana)!.add(`${String(c.hora).padStart(2, "0")}:${String(c.minuto || 0).padStart(2, "0")}`);
    });
    setSelectedDays(days);
    setSelectedSlots(slots);
    setHasChanges(false);
  }, [existingConfig]);

  // Initialize config fields
  useEffect(() => {
    if (selectedConfig) {
      setDuracionMinutos(selectedConfig.duracion_minutos || 60);
      setCalendarioEmail(selectedConfig.calendario_email || "");
      setMaxInvitados(selectedConfig.max_invitados || 1);
      setCorreosEnterado(selectedConfig.correos_enterado || []);
      setDescripcionInvitacion(selectedConfig.descripcion_invitacion || "");
    } else {
      setDuracionMinutos(60);
      setCalendarioEmail("");
      setMaxInvitados(1);
      setCorreosEnterado([]);
      setDescripcionInvitacion("");
    }
  }, [selectedConfig]);

  // Initialize project selection
  useEffect(() => {
    setSelectedProyectoIds(configProyectos);
  }, [configProyectos]);

  // When duration changes, remove invalid slots
  useEffect(() => {
    const validLabels = new Set(generateSlots(duracionMinutos).map((s) => s.label));
    setSelectedSlots((prev) => {
      const next = new Map<number, Set<string>>();
      let changed = false;
      for (const [day, slots] of prev) {
        const filtered = new Set<string>();
        for (const s of slots) {
          if (validLabels.has(s)) filtered.add(s);
          else changed = true;
        }
        if (filtered.size > 0) next.set(day, filtered);
        else if (slots.size > 0) changed = true;
      }
      if (changed) setHasChanges(true);
      return changed ? next : prev;
    });
  }, [duracionMinutos]);

  const toggleDay = (dayId: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) {
        next.delete(dayId);
        setSelectedSlots((prevSlots) => { const n = new Map(prevSlots); n.delete(dayId); return n; });
      } else {
        next.add(dayId);
      }
      return next;
    });
    setHasChanges(true);
  };

  const toggleSlot = (dayId: number, slotLabel: string) => {
    setSelectedSlots((prev) => {
      const next = new Map(prev);
      if (!next.has(dayId)) next.set(dayId, new Set());
      const daySlots = new Set(next.get(dayId)!);
      if (daySlots.has(slotLabel)) daySlots.delete(slotLabel);
      else daySlots.add(slotLabel);
      next.set(dayId, daySlots);
      return next;
    });
    setHasChanges(true);
  };

  const addCorreo = () => {
    const email = nuevoCorreo.trim().toLowerCase();
    if (!email || !email.includes("@")) { toast.error("Ingresa un correo válido"); return; }
    if (correosEnterado.includes(email)) { toast.error("Este correo ya fue agregado"); return; }
    setCorreosEnterado((prev) => [...prev, email]);
    setNuevoCorreo("");
    setHasChanges(true);
  };

  const removeCorreo = (email: string) => {
    setCorreosEnterado((prev) => prev.filter((c) => c !== email));
    setHasChanges(true);
  };

  const toggleProyecto = (proyectoId: number) => {
    setSelectedProyectoIds((prev) => {
      if (prev.includes(proyectoId)) return prev.filter((id) => id !== proyectoId);
      return [...prev, proyectoId];
    });
    setHasChanges(true);
  };

  // Create new cita config
  const createCitaMutation = useMutation({
    mutationFn: async ({ tipoId, nombre }: { tipoId: number; nombre: string }) => {
      const { data, error } = await supabase
        .from("configuracion_citas_usuarios")
        .insert({
          id_usuario_email: selectedUserEmail,
          id_tipo_cita: tipoId,
          nombre,
          duracion_minutos: 60,
          max_invitados: 1,
          correos_enterado: [],
          activo: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["config-citas-usuarios-all", selectedUserEmail] });
      setNuevaCitaDialogOpen(false);
      setNuevaCitaNombre("");
      setNuevaCitaTipoId("");
      setSelectedConfigId(data.id.toString());
      toast.success("Cita creada");
    },
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  // Delete cita config
  const deleteCitaMutation = useMutation({
    mutationFn: async (configId: number) => {
      await supabase.from("configuracion_citas_proyectos").delete().eq("id_configuracion_cita", configId);
      await supabase.from("configuracion_citas_horarios").delete().eq("id_configuracion_cita", configId);
      const { error } = await supabase.from("configuracion_citas_usuarios").delete().eq("id", configId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-citas-usuarios-all", selectedUserEmail] });
      setSelectedConfigId("");
      toast.success("Cita eliminada");
    },
    onError: (e) => toast.error(`Error: ${e.message}`),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConfigId || !selectedConfig) throw new Error("No config selected");
      if (selectedProyectoIds.length === 0) throw new Error("Selecciona al menos un proyecto");
      const configId = parseInt(selectedConfigId);

      // 1. Update configuracion_citas_usuarios
      const { error: updateError } = await supabase
        .from("configuracion_citas_usuarios")
        .update({
          nombre: selectedConfig.nombre,
          duracion_minutos: duracionMinutos,
          calendario_email: calendarioEmail || null,
          max_invitados: maxInvitados,
          correos_enterado: correosEnterado,
          descripcion_invitacion: descripcionInvitacion || null,
          fecha_actualizacion: new Date().toISOString(),
        })
        .eq("id", configId);
      if (updateError) throw updateError;

      // 2. Sync projects
      await supabase.from("configuracion_citas_proyectos").delete().eq("id_configuracion_cita", configId);
      if (selectedProyectoIds.length > 0) {
        const { error: projError } = await supabase.from("configuracion_citas_proyectos").insert(
          selectedProyectoIds.map((pid) => ({ id_configuracion_cita: configId, id_proyecto: pid }))
        );
        if (projError) throw projError;
      }

      // 3. Delete existing horarios for this config
      await supabase.from("configuracion_citas_horarios").delete().eq("id_configuracion_cita", configId);
      // Also delete legacy horarios
      await supabase.from("configuracion_citas_horarios").delete()
        .eq("id_usuario_email", selectedConfig.id_usuario_email)
        .eq("id_tipo_cita", selectedConfig.id_tipo_cita)
        .is("id_configuracion_cita", null);

      // 4. Insert new horarios
      const records: any[] = [];
      for (const [dia, slotsSet] of selectedSlots) {
        if (!selectedDays.has(dia)) continue;
        for (const slotLabel of slotsSet) {
          const [h] = slotLabel.split(":").map(Number);
          records.push({
            id_usuario_email: selectedConfig.id_usuario_email,
            dia_semana: dia,
            hora: h,
            id_tipo_cita: selectedConfig.id_tipo_cita,
            id_configuracion_cita: configId,
            activo: true,
          });
        }
      }
      if (records.length > 0) {
        const { error } = await supabase.from("configuracion_citas_horarios").insert(records);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-citas-horarios-by-config", selectedConfigId] });
      queryClient.invalidateQueries({ queryKey: ["config-citas-usuarios-all", selectedUserEmail] });
      queryClient.invalidateQueries({ queryKey: ["config-citas-proyectos", selectedConfigId] });
      toast.success("Configuración guardada");
      setHasChanges(false);
      if (calendarioEmail) createRecurringMeetsMutation.mutate();
    },
    onError: (error) => toast.error(`Error al guardar: ${error.message}`),
  });

  const createRecurringMeetsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConfig) throw new Error("No config selected");
      if (selectedDays.size === 0) throw new Error("No hay días configurados");

      const slotsConfig: { dia_semana: number; horas: string[] }[] = [];
      for (const dayId of Array.from(selectedDays).sort()) {
        const daySlots = selectedSlots.get(dayId);
        if (daySlots && daySlots.size > 0) {
          slotsConfig.push({ dia_semana: dayId, horas: Array.from(daySlots).sort() });
        }
      }
      if (slotsConfig.length === 0) throw new Error("No hay horarios seleccionados");

      const fechaFinStr = `${fechaFinRecurrencia.getFullYear()}-${String(fechaFinRecurrencia.getMonth() + 1).padStart(2, "0")}-${String(fechaFinRecurrencia.getDate()).padStart(2, "0")}`;

      const { data, error } = await supabase.functions.invoke("agendar-capacitacion", {
        body: {
          action: "create-recurring-meets",
          calendar_owner_email: calendarioEmail || selectedConfig.id_usuario_email,
          tipo_cita_id: selectedConfig.id_tipo_cita,
          config_id: selectedConfig.id,
          duracion_minutos: duracionMinutos,
          slots_config: slotsConfig,
          fecha_fin: fechaFinStr,
          correos_enterado: correosEnterado,
          descripcion_invitacion: descripcionInvitacion,
          nombre_cita: selectedConfig.nombre,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      const created = data?.created_events?.filter((e: any) => e.action === "created")?.length || 0;
      const updated = data?.created_events?.filter((e: any) => e.action === "updated")?.length || 0;
      const parts = [];
      if (updated > 0) parts.push(`${updated} actualizados`);
      if (created > 0) parts.push(`${created} creados`);
      toast.success(`Eventos sincronizados en Google Calendar: ${parts.join(", ") || "sin cambios"}`);
      if (data?.errors?.length > 0) toast.warning(`${data.errors.length} errores: ${data.errors[0]}`);
    },
    onError: (error) => toast.error(`Error al crear Meet: ${error.message}`),
  });

  const loadingConfig = loadingConfigs || loadingHorarios;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" />
            Configuración de Citas
          </h1>
          <p className="text-muted-foreground">
            Configura los días, horarios, duración y calendario por tipo de cita
          </p>
      </div>

      {/* CRUD Tipos de Cita - Solo Super Admin */}
      {isSuperAdmin && (
        <Collapsible open={tiposCrudOpen} onOpenChange={setTiposCrudOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Administrar Tipos de Cita
                  <Badge variant="secondary" className="ml-auto">{allTiposCita.length}</Badge>
                </CardTitle>
                <CardDescription>Agregar, editar o desactivar tipos de cita</CardDescription>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                {/* Add new - simplified: only name */}
                <div className="flex gap-2 max-w-lg">
                  <Input
                    placeholder="Nombre del nuevo tipo de cita..."
                    value={nuevoTipoNombre}
                    onChange={(e) => setNuevoTipoNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && nuevoTipoNombre.trim()) addTipoCitaMutation.mutate({ nombre: nuevoTipoNombre.trim() });
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => nuevoTipoNombre.trim() && addTipoCitaMutation.mutate({ nombre: nuevoTipoNombre.trim() })}
                    disabled={!nuevoTipoNombre.trim() || addTipoCitaMutation.isPending}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Agregar
                  </Button>
                </div>

                {/* List - simplified: name + switch only */}
                <div className="border rounded-md divide-y">
                  {allTiposCita.map((tc: any) => (
                    <div key={tc.id} className="flex items-center gap-3 px-4 py-3">
                      {editingTipoId === tc.id ? (
                        <div className="flex gap-2 flex-1">
                          <Input
                            value={editingTipoNombre}
                            onChange={(e) => setEditingTipoNombre(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingTipoNombre.trim()) updateTipoCitaMutation.mutate({ id: tc.id, nombre: editingTipoNombre.trim() });
                              if (e.key === "Escape") setEditingTipoId(null);
                            }}
                            className="max-w-xs h-8"
                            autoFocus
                          />
                          <Button size="sm" variant="ghost" onClick={() => editingTipoNombre.trim() && updateTipoCitaMutation.mutate({ id: tc.id, nombre: editingTipoNombre.trim() })}>
                            <Save className="h-3 w-3 mr-1" /> Guardar
                          </Button>
                        </div>
                      ) : (
                        <span className={cn("text-sm font-medium flex-1", !tc.activo && "text-muted-foreground line-through")}>{tc.nombre}</span>
                      )}
                      <Switch
                        checked={tc.activo}
                        onCheckedChange={(checked) => toggleTipoCitaMutation.mutate({ id: tc.id, activo: checked })}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => { setEditingTipoId(tc.id); setEditingTipoNombre(tc.nombre); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {allTiposCita.length === 0 && (
                    <div className="px-4 py-6 text-center text-muted-foreground text-sm">No hay tipos de cita registrados</div>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
        {hasChanges && (
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Guardar
          </Button>
        )}
      </div>

      {/* User selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuario</CardTitle>
          <CardDescription>
            {isSuperAdmin ? "Selecciona el usuario para configurar sus horarios" : "Tu configuración personal de horarios"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSuperAdmin ? (
            usersWithCitas.length <= 10 ? (
              <Select value={selectedUserEmail} onValueChange={(v) => { setSelectedUserEmail(v); setSelectedConfigId(""); }}>
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="Seleccionar usuario..." />
                </SelectTrigger>
                <SelectContent>
                  {usersWithCitas.map((u) => (
                    <SelectItem key={u.email} value={u.email}>
                      {u.nombre} <span className="text-muted-foreground ml-1">({u.email})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Popover open={userSelectorOpen} onOpenChange={setUserSelectorOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className={cn("w-full justify-between max-w-md", !selectedUserEmail && "text-muted-foreground")}>
                    {selectedUserEmail
                      ? usersWithCitas.find((u) => u.email === selectedUserEmail)?.nombre || selectedUserEmail
                      : "Seleccionar usuario..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0 max-w-md" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar usuario..." />
                    <CommandList>
                      <CommandEmpty>No se encontró usuario.</CommandEmpty>
                      <CommandGroup>
                        {usersWithCitas.map((u) => (
                          <CommandItem
                            key={u.email}
                            value={`${u.nombre} ${u.email}`}
                            onSelect={() => { setSelectedUserEmail(u.email); setSelectedConfigId(""); setUserSelectorOpen(false); }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", selectedUserEmail === u.email ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col">
                              <span>{u.nombre}</span>
                              <span className="text-xs text-muted-foreground">{u.email}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )
          ) : (
            <div className="text-sm">
              <span className="font-medium">{profile?.nombre}</span>
              <span className="text-muted-foreground ml-2">({profile?.email})</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs per named cita config */}
      {selectedUserEmail && (
        <>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setNuevaCitaDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nueva Cita
            </Button>
            {userCitaConfigs.length > 0 && (
              <span className="text-xs text-muted-foreground">{userCitaConfigs.length} cita(s) configurada(s)</span>
            )}
          </div>

          {userCitaConfigs.length > 0 ? (
            <Tabs value={selectedConfigId} onValueChange={(v) => { setSelectedConfigId(v); setHasChanges(false); }}>
              <TabsList className="flex-wrap h-auto gap-1">
                {userCitaConfigs.map((cfg: any) => {
                  const tipoCita = tiposCita.find((t: any) => t.id === cfg.id_tipo_cita);
                  return (
                    <TabsTrigger key={cfg.id} value={cfg.id.toString()} className="text-xs gap-1.5">
                      {cfg.nombre}
                      {tipoCita && <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal">{tipoCita.nombre}</Badge>}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {userCitaConfigs.map((cfg: any) => (
                <TabsContent key={cfg.id} value={cfg.id.toString()}>
                  {loadingConfig ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                  ) : (
                    <div className="space-y-6">
                      {/* General config */}
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-base">Configuración general</CardTitle>
                              <CardDescription>Duración, calendario y configuración de {cfg.nombre}</CardDescription>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm(`¿Eliminar la cita "${cfg.nombre}"?`)) deleteCitaMutation.mutate(cfg.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2">
                            <Label>Nombre de la cita</Label>
                            <Input
                              value={cfg.nombre || ""}
                              onChange={(e) => {
                                const newName = e.target.value;
                                queryClient.setQueryData(["config-citas-usuarios-all", selectedUserEmail], (old: any[]) =>
                                  old?.map((c: any) => c.id === cfg.id ? { ...c, nombre: newName } : c)
                                );
                                setHasChanges(true);
                              }}
                              placeholder="Ej: Capacitación Bottura"
                              className="max-w-md"
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Duración de la cita</Label>
                              <Select value={duracionMinutos.toString()} onValueChange={(v) => { setDuracionMinutos(parseInt(v)); setHasChanges(true); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {DURACIONES.map((d) => <SelectItem key={d.value} value={d.value.toString()}>{d.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Número máximo de invitados</Label>
                              <Input
                                type="number"
                                min={1}
                                value={maxInvitados}
                                onChange={(e) => { setMaxInvitados(Math.max(1, parseInt(e.target.value) || 1)); setHasChanges(true); }}
                              />
                              <p className="text-xs text-muted-foreground">No incluye correos de enterado</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Email del calendario Google</Label>
                            <Input
                              type="email"
                              placeholder="ejemplo@dominio.com"
                              value={calendarioEmail}
                              onChange={(e) => { setCalendarioEmail(e.target.value); setHasChanges(true); }}
                            />
                            <p className="text-xs text-muted-foreground">Calendario donde se agendan las citas</p>
                            <div className="mt-2 p-3 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                <div className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                                  <p className="font-medium">Configuración previa requerida</p>
                                  <p>Otorgue permisos a la cuenta de servicio para <strong>"Realizar cambios en eventos"</strong>.</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <code className="bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded text-[11px] select-all break-all">{SERVICE_ACCOUNT_EMAIL}</code>
                                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { navigator.clipboard.writeText(SERVICE_ACCOUNT_EMAIL); toast.success("Email copiado"); }}>
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Proyectos multi-selector */}
                          <div className="space-y-2">
                            <Label>Proyectos vinculados</Label>
                            <div className="flex flex-wrap gap-1.5">
                              {proyectosPublicados.map((p: any) => {
                                const isLinked = selectedProyectoIds.includes(p.id);
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => toggleProyecto(p.id)}
                                    className={cn(
                                      "text-xs px-2.5 py-1 rounded-full border transition-all",
                                      isLinked
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border text-muted-foreground hover:border-primary/50"
                                    )}
                                  >
                                    {p.nombre}
                                  </button>
                                );
                              })}
                            </div>
                            {selectedProyectoIds.length === 0 && (
                              <p className="text-xs text-destructive">Selecciona al menos un proyecto</p>
                            )}
                          </div>

                          {/* Correos de enterado */}
                          <div className="space-y-2">
                            <Label>Enterar a los siguientes correos</Label>
                            <p className="text-xs text-muted-foreground">Se agregarán como attendees adicionales (no cuentan para el máximo de invitados)</p>
                            <div className="flex gap-2">
                              <Input
                                type="email"
                                placeholder="correo@ejemplo.com"
                                value={nuevoCorreo}
                                onChange={(e) => setNuevoCorreo(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCorreo(); } }}
                                className="max-w-sm"
                              />
                              <Button size="sm" variant="outline" onClick={addCorreo}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            {correosEnterado.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {correosEnterado.map((email) => (
                                  <Badge key={email} variant="secondary" className="text-xs gap-1.5 px-2.5 py-1">
                                    {email}
                                    <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => removeCorreo(email)} />
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Descripción de la invitación */}
                          <div className="space-y-2">
                            <Label>Descripción de la invitación</Label>
                            <Textarea
                              placeholder="Texto que se agregará como descripción en la invitación de Google Calendar..."
                              value={descripcionInvitacion}
                              onChange={(e) => { setDescripcionInvitacion(e.target.value); setHasChanges(true); }}
                              rows={3}
                              className="resize-none"
                            />
                            <p className="text-xs text-muted-foreground">Este texto aparecerá en la descripción del evento del calendario</p>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Day selector */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Días disponibles</CardTitle>
                          <CardDescription>Selecciona los días en los que se pueden agendar citas</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-3">
                            {DIAS_SEMANA.map((dia) => (
                              <button
                                key={dia.id}
                                onClick={() => toggleDay(dia.id)}
                                className={cn(
                                  "flex flex-col items-center justify-center w-16 h-16 rounded-full border-2 transition-all text-sm font-medium",
                                  selectedDays.has(dia.id)
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                                )}
                              >
                                <span className="text-xs">{dia.short}</span>
                              </button>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Time slots per day */}
                      {Array.from(selectedDays).sort().map((dayId) => {
                        const dia = DIAS_SEMANA.find((d) => d.id === dayId);
                        const daySlots = selectedSlots.get(dayId) || new Set();
                        return (
                          <Card key={dayId}>
                            <CardHeader className="pb-3">
                              <CardTitle className="text-base flex items-center gap-2">
                                {dia?.nombre}
                                <Badge variant="secondary" className="text-xs">{daySlots.size} {daySlots.size === 1 ? "horario" : "horarios"}</Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="flex flex-wrap gap-2">
                                {generateSlots(duracionMinutos).map((slot) => (
                                  <button
                                    key={slot.label}
                                    onClick={() => toggleSlot(dayId, slot.label)}
                                    className={cn(
                                      "px-3 py-2 rounded-md border text-sm font-medium transition-all",
                                      daySlots.has(slot.label)
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                                    )}
                                  >
                                    {slot.label}
                                  </button>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}

                      {selectedDays.size === 0 && (
                        <Card>
                          <CardContent className="py-8 text-center text-muted-foreground">
                            Selecciona al menos un día para configurar los horarios disponibles
                          </CardContent>
                        </Card>
                      )}

                      {/* Recurrence sync */}
                      {selectedDays.size > 0 && calendarioEmail && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                              <Video className="h-4 w-4" />
                              Sincronización con Google Calendar
                            </CardTitle>
                            <CardDescription>Al guardar, los eventos recurrentes con Meet se sincronizarán</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="space-y-2">
                              <Label>Repetir hasta</Label>
                              <Popover open={meetCalendarOpen} onOpenChange={setMeetCalendarOpen}>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" className={cn("w-[240px] justify-start text-left font-normal", !fechaFinRecurrencia && "text-muted-foreground")}>
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {fechaFinRecurrencia ? format(fechaFinRecurrencia, "PPP", { locale: es }) : "Seleccionar fecha"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={fechaFinRecurrencia}
                                    onSelect={(d) => { if (d) { setFechaFinRecurrencia(d); setMeetCalendarOpen(false); } }}
                                    disabled={(date) => date < new Date()}
                                    initialFocus
                                    className="p-3 pointer-events-auto"
                                  />
                                </PopoverContent>
                              </Popover>
                              <p className="text-xs text-muted-foreground">Los eventos se sincronizarán semanalmente hasta esta fecha</p>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No hay citas configuradas. Haz clic en "Nueva Cita" para crear una.
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Dialog: Nueva Cita */}
      <Dialog open={nuevaCitaDialogOpen} onOpenChange={setNuevaCitaDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva Cita</DialogTitle>
            <DialogDescription>Selecciona el tipo y escribe un nombre personalizado</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de cita</Label>
              <Select value={nuevaCitaTipoId} onValueChange={setNuevaCitaTipoId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo..." /></SelectTrigger>
                <SelectContent>
                  {tiposCita.map((tc: any) => (
                    <SelectItem key={tc.id} value={tc.id.toString()}>{tc.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nombre personalizado</Label>
              <Input
                placeholder="Ej: Capacitación Bottura"
                value={nuevaCitaNombre}
                onChange={(e) => setNuevaCitaNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nuevaCitaNombre.trim() && nuevaCitaTipoId) {
                    createCitaMutation.mutate({ tipoId: parseInt(nuevaCitaTipoId), nombre: nuevaCitaNombre.trim() });
                  }
                }}
              />
            </div>
            <Button
              className="w-full"
              disabled={!nuevaCitaNombre.trim() || !nuevaCitaTipoId || createCitaMutation.isPending}
              onClick={() => createCitaMutation.mutate({ tipoId: parseInt(nuevaCitaTipoId), nombre: nuevaCitaNombre.trim() })}
            >
              {createCitaMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Crear Cita
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
