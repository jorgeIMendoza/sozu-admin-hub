import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, CalendarClock, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
const DIAS_SEMANA = [
  { id: 1, nombre: "Lunes", short: "Lun" },
  { id: 2, nombre: "Martes", short: "Mar" },
  { id: 3, nombre: "Miércoles", short: "Mié" },
  { id: 4, nombre: "Jueves", short: "Jue" },
  { id: 5, nombre: "Viernes", short: "Vie" },
  { id: 6, nombre: "Sábado", short: "Sáb" },
];

const HORAS = Array.from({ length: 12 }, (_, i) => i + 9); // 9 to 20

function formatHora(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export default function ConfiguracionCitas() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = profile?.rol_nombre === "Super Administrador";

  const [selectedUserEmail, setSelectedUserEmail] = useState<string>("");
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [selectedSlots, setSelectedSlots] = useState<Map<number, Set<number>>>(new Map()); // dia -> Set<hora>
  const [userSelectorOpen, setUserSelectorOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Auto-select logged in user if not super admin
  useEffect(() => {
    if (!isSuperAdmin && profile?.email) {
      setSelectedUserEmail(profile.email);
    }
  }, [isSuperAdmin, profile?.email]);

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

  // Fetch existing config for selected user
  const { data: existingConfig = [], isLoading: loadingConfig } = useQuery({
    queryKey: ["config-citas-horarios", selectedUserEmail],
    queryFn: async () => {
      if (!selectedUserEmail) return [];
      const { data, error } = await supabase
        .from("configuracion_citas_horarios")
        .select("*")
        .eq("id_usuario_email", selectedUserEmail)
        .eq("activo", true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedUserEmail,
  });

  // Initialize from existing config
  useEffect(() => {
    const days = new Set<number>();
    const slots = new Map<number, Set<number>>();

    existingConfig.forEach((c: any) => {
      days.add(c.dia_semana);
      if (!slots.has(c.dia_semana)) slots.set(c.dia_semana, new Set());
      slots.get(c.dia_semana)!.add(c.hora);
    });

    setSelectedDays(days);
    setSelectedSlots(slots);
    setHasChanges(false);
  }, [existingConfig]);

  const toggleDay = (dayId: number) => {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) {
        next.delete(dayId);
        // Also clear slots for this day
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

  const toggleSlot = (dayId: number, hora: number) => {
    setSelectedSlots((prev) => {
      const next = new Map(prev);
      if (!next.has(dayId)) next.set(dayId, new Set());
      const daySlots = new Set(next.get(dayId)!);
      if (daySlots.has(hora)) {
        daySlots.delete(hora);
      } else {
        daySlots.add(hora);
      }
      next.set(dayId, daySlots);
      return next;
    });
    setHasChanges(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserEmail) throw new Error("No user selected");

      // Delete all existing
      await supabase
        .from("configuracion_citas_horarios")
        .delete()
        .eq("id_usuario_email", selectedUserEmail);

      // Build new records
      const records: { id_usuario_email: string; dia_semana: number; hora: number; activo: boolean }[] = [];
      for (const [dia, horas] of selectedSlots) {
        if (!selectedDays.has(dia)) continue;
        for (const hora of horas) {
          records.push({ id_usuario_email: selectedUserEmail, dia_semana: dia, hora, activo: true });
        }
      }

      if (records.length > 0) {
        const { error } = await supabase.from("configuracion_citas_horarios").insert(records);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-citas-horarios", selectedUserEmail] });
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
            Configura los días y horarios disponibles para agendar citas
          </p>
        </div>
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

      {selectedUserEmail && (
        <>
          {loadingConfig ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
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
                          {HORAS.map((hora) => (
                            <button
                              key={hora}
                              onClick={() => toggleSlot(dayId, hora)}
                              className={cn(
                                "px-3 py-2 rounded-md border text-sm font-medium transition-all",
                                daySlots.has(hora)
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {formatHora(hora)}
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
            </>
          )}
        </>
      )}
    </div>
  );
}
