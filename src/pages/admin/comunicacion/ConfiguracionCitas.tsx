import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, CalendarClock, Check, ChevronsUpDown, Pencil, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";

const DIAS_SEMANA = [
  { id: 1, nombre: "Lunes", short: "Lun" },
  { id: 2, nombre: "Martes", short: "Mar" },
  { id: 3, nombre: "Miércoles", short: "Mié" },
  { id: 4, nombre: "Jueves", short: "Jue" },
  { id: 5, nombre: "Viernes", short: "Vie" },
  { id: 6, nombre: "Sábado", short: "Sáb" },
];

// Slots every 30 min from 09:00 to 20:00
const HORAS_SLOTS = Array.from({ length: 23 }, (_, i) => {
  const h = Math.floor(i / 2) + 9;
  const m = (i % 2) * 30;
  return { hour: h, minute: m, label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
});

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
  const [selectedTipoCita, setSelectedTipoCita] = useState<string>("");
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [selectedSlots, setSelectedSlots] = useState<Map<number, Set<string>>>(new Map()); // dia -> Set<"HH:MM">
  const [duracionMinutos, setDuracionMinutos] = useState<number>(60);
  const [calendarioEmail, setCalendarioEmail] = useState<string>("");
  const [userSelectorOpen, setUserSelectorOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [tiposCrudOpen, setTiposCrudOpen] = useState(false);
  const [nuevoTipoNombre, setNuevoTipoNombre] = useState("");
  const [editingTipoId, setEditingTipoId] = useState<number | null>(null);
  const [editingTipoNombre, setEditingTipoNombre] = useState("");

  useEffect(() => {
    if (!isSuperAdmin && profile?.email) {
      setSelectedUserEmail(profile.email);
    }
  }, [isSuperAdmin, profile?.email]);

  // Fetch tipos de cita (active only, for tabs)
  const { data: tiposCita = [] } = useQuery({
    queryKey: ["tipos-cita"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_cita")
        .select("*")
        .eq("activo", true)
        .order("id");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch ALL tipos de cita (for CRUD, super admin only)
  const { data: allTiposCita = [] } = useQuery({
    queryKey: ["tipos-cita-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tipos_cita").select("*").order("id");
      if (error) throw error;
      return data || [];
    },
    enabled: isSuperAdmin,
  });

  const addTipoCitaMutation = useMutation({
    mutationFn: async (nombre: string) => {
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

  // Auto-select first tipo when loaded
  useEffect(() => {
    if (tiposCita.length > 0 && !selectedTipoCita) {
      setSelectedTipoCita(tiposCita[0].id.toString());
    }
  }, [tiposCita, selectedTipoCita]);

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

  // Fetch existing horarios config for selected user + tipo cita
  const { data: existingConfig = [], isLoading: loadingConfig } = useQuery({
    queryKey: ["config-citas-horarios", selectedUserEmail, selectedTipoCita],
    queryFn: async () => {
      if (!selectedUserEmail || !selectedTipoCita) return [];
      const { data, error } = await supabase
        .from("configuracion_citas_horarios")
        .select("*")
        .eq("id_usuario_email", selectedUserEmail)
        .eq("id_tipo_cita", parseInt(selectedTipoCita))
        .eq("activo", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedUserEmail && !!selectedTipoCita,
  });

  // Fetch user config (duracion, calendario) for selected user + tipo cita
  const { data: userConfig } = useQuery({
    queryKey: ["config-citas-usuarios", selectedUserEmail, selectedTipoCita],
    queryFn: async () => {
      if (!selectedUserEmail || !selectedTipoCita) return null;
      const { data, error } = await supabase
        .from("configuracion_citas_usuarios")
        .select("*")
        .eq("id_usuario_email", selectedUserEmail)
        .eq("id_tipo_cita", parseInt(selectedTipoCita))
        .eq("activo", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedUserEmail && !!selectedTipoCita,
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

  // Initialize duracion and calendario from userConfig
  useEffect(() => {
    if (userConfig) {
      setDuracionMinutos(userConfig.duracion_minutos || 60);
      setCalendarioEmail(userConfig.calendario_email || "");
    } else {
      setDuracionMinutos(60);
      setCalendarioEmail("");
    }
  }, [userConfig]);

  const toggleDay = (dayId: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) {
        next.delete(dayId);
        setSelectedSlots((prevSlots) => {
          const nextSlots = new Map(prevSlots);
          nextSlots.delete(dayId);
          return nextSlots;
        });
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
      if (daySlots.has(slotLabel)) {
        daySlots.delete(slotLabel);
      } else {
        daySlots.add(slotLabel);
      }
      next.set(dayId, daySlots);
      return next;
    });
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserEmail || !selectedTipoCita) throw new Error("No user or type selected");
      const tipoCitaId = parseInt(selectedTipoCita);

      // 1. Upsert configuracion_citas_usuarios
      const { error: upsertError } = await supabase
        .from("configuracion_citas_usuarios")
        .upsert({
          id_usuario_email: selectedUserEmail,
          id_tipo_cita: tipoCitaId,
          duracion_minutos: duracionMinutos,
          calendario_email: calendarioEmail || null,
          activo: true,
          fecha_actualizacion: new Date().toISOString(),
        }, { onConflict: "id_usuario_email,id_tipo_cita" });
      if (upsertError) throw upsertError;

      // 2. Delete existing horarios for this user + tipo
      await supabase
        .from("configuracion_citas_horarios")
        .delete()
        .eq("id_usuario_email", selectedUserEmail)
        .eq("id_tipo_cita", tipoCitaId);

      // 3. Insert new horarios
      const records: any[] = [];
      for (const [dia, slotsSet] of selectedSlots) {
        if (!selectedDays.has(dia)) continue;
        for (const slotLabel of slotsSet) {
          const [h, m] = slotLabel.split(":").map(Number);
          records.push({
            id_usuario_email: selectedUserEmail,
            dia_semana: dia,
            hora: h,
            id_tipo_cita: tipoCitaId,
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
      queryClient.invalidateQueries({ queryKey: ["config-citas-horarios", selectedUserEmail, selectedTipoCita] });
      queryClient.invalidateQueries({ queryKey: ["config-citas-usuarios", selectedUserEmail, selectedTipoCita] });
      toast.success("Configuración de citas guardada");
      setHasChanges(false);
    },
    onError: (error) => {
      toast.error(`Error al guardar: ${error.message}`);
    },
  });

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
                {/* Add new */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Nombre del nuevo tipo de cita..."
                    value={nuevoTipoNombre}
                    onChange={(e) => setNuevoTipoNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && nuevoTipoNombre.trim()) addTipoCitaMutation.mutate(nuevoTipoNombre.trim());
                    }}
                    className="max-w-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => nuevoTipoNombre.trim() && addTipoCitaMutation.mutate(nuevoTipoNombre.trim())}
                    disabled={!nuevoTipoNombre.trim() || addTipoCitaMutation.isPending}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Agregar
                  </Button>
                </div>

                {/* List */}
                <div className="border rounded-md divide-y">
                  {allTiposCita.map((tc: any) => (
                    <div key={tc.id} className="flex items-center gap-3 px-4 py-3">
                      {editingTipoId === tc.id ? (
                        <div className="flex items-center gap-2 flex-1">
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
                            <Save className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className={cn("flex-1 text-sm", !tc.activo && "text-muted-foreground line-through")}>{tc.nombre}</span>
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
              <Select value={selectedUserEmail} onValueChange={setSelectedUserEmail}>
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
                            onSelect={() => {
                              setSelectedUserEmail(u.email);
                              setUserSelectorOpen(false);
                            }}
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

      {selectedUserEmail && tiposCita.length > 0 && (
        <Tabs value={selectedTipoCita} onValueChange={(v) => { setSelectedTipoCita(v); setHasChanges(false); }}>
          <TabsList>
            {tiposCita.map((tc: any) => (
              <TabsTrigger key={tc.id} value={tc.id.toString()}>{tc.nombre}</TabsTrigger>
            ))}
          </TabsList>

          {tiposCita.map((tc: any) => (
            <TabsContent key={tc.id} value={tc.id.toString()}>
              {loadingConfig ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Duration & Calendar config */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Configuración general</CardTitle>
                      <CardDescription>Duración de la cita y calendario destino para {tc.nombre}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Duración de la cita</Label>
                          <Select
                            value={duracionMinutos.toString()}
                            onValueChange={(v) => { setDuracionMinutos(parseInt(v)); setHasChanges(true); }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DURACIONES.map((d) => (
                                <SelectItem key={d.value} value={d.value.toString()}>{d.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Email del calendario Google</Label>
                          <Input
                            type="email"
                            placeholder="ejemplo@dominio.com"
                            value={calendarioEmail}
                            onChange={(e) => { setCalendarioEmail(e.target.value); setHasChanges(true); }}
                          />
                          <p className="text-xs text-muted-foreground">
                            Calendario donde se agendan las citas de este tipo
                          </p>
                        </div>
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
                  {Array.from(selectedDays)
                    .sort()
                    .map((dayId) => {
                      const dia = DIAS_SEMANA.find((d) => d.id === dayId);
                      const daySlots = selectedSlots.get(dayId) || new Set();

                      return (
                        <Card key={dayId}>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              {dia?.nombre}
                              <Badge variant="secondary" className="text-xs">
                                {daySlots.size} {daySlots.size === 1 ? "horario" : "horarios"}
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="flex flex-wrap gap-2">
                              {HORAS_SLOTS.map((slot) => (
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
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
