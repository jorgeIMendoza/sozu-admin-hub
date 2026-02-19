import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";

interface AgendarCitaShowroomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HOURS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00",
];

export function AgendarCitaShowroomDialog({ open, onOpenChange }: AgendarCitaShowroomDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [selectedProspecto, setSelectedProspecto] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedHour, setSelectedHour] = useState("");
  const [notas, setNotas] = useState("");

  // Fetch prospects assigned to this agent
  const { data: prospectos = [] } = useQuery({
    queryKey: ["mis-prospectos-showroom", profile?.id_persona],
    queryFn: async () => {
      if (!profile?.id_persona) return [];

      const { data, error } = await supabase
        .from("entidades_relacionadas")
        .select(`
          id_persona,
          id_proyecto,
          personas!entidades_relacionadas_id_persona_fkey (
            id,
            nombre_legal,
            email
          ),
          proyectos!entidades_relacionadas_id_proyecto_fkey (
            id,
            nombre
          )
        `)
        .eq("id_tipo_entidad", 7)
        .eq("activo", true)
        .eq("id_persona_duena_lead", profile.id_persona);

      if (error) throw error;
      return (data || [])
        .filter((er: any) => er.personas && er.id_proyecto)
        .map((er: any) => ({
          id: er.personas.id,
          nombre: er.personas.nombre_legal,
          email: er.personas.email,
          proyecto_id: er.id_proyecto,
          proyecto_nombre: er.proyectos?.nombre || "Sin proyecto",
        }));
    },
    enabled: open && !!profile?.id_persona,
  });

  const selectedProspectoData = useMemo(() => {
    return prospectos.find((p) => p.id.toString() === selectedProspecto);
  }, [prospectos, selectedProspecto]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProspecto || !selectedDate || !selectedHour || !selectedProspectoData) {
        throw new Error("Completa todos los campos obligatorios");
      }

      const [h, m] = selectedHour.split(":").map(Number);
      const horaFin = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

      const { error } = await supabase
        .from("citas_showroom")
        .insert([{
          id_prospecto: parseInt(selectedProspecto),
          id_proyecto: selectedProspectoData.proyecto_id,
          id_agente: profile?.id_persona,
          fecha: format(selectedDate, "yyyy-MM-dd"),
          hora_inicio: selectedHour,
          hora_fin: horaFin,
          notas: notas || null,
          estatus: "programada",
        }]);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cita al showroom agendada exitosamente");
      handleClose();
    },
    onError: (error: any) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const handleClose = () => {
    setSelectedProspecto("");
    setSelectedDate(undefined);
    setSelectedHour("");
    setNotas("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Agendar Cita al Showroom
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Prospecto */}
          <div className="space-y-2">
            <Label>Prospecto <span className="text-destructive">*</span></Label>
            {prospectos.length > 10 ? (
              <Combobox
                value={selectedProspecto}
                onValueChange={setSelectedProspecto}
                options={prospectos.map((p) => ({
                  value: p.id.toString(),
                  label: `${p.nombre} — ${p.proyecto_nombre}`,
                }))}
                placeholder="Seleccionar prospecto..."
                searchPlaceholder="Buscar prospecto..."
                emptyText="No tienes prospectos asignados"
              />
            ) : (
              <Select value={selectedProspecto} onValueChange={setSelectedProspecto}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar prospecto..." />
                </SelectTrigger>
                <SelectContent>
                  {prospectos.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No tienes prospectos asignados</div>
                  ) : prospectos.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.nombre} — {p.proyecto_nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Show project info */}
          {selectedProspectoData && (
            <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
              <span className="text-muted-foreground">Proyecto de interés: </span>
              <span className="font-medium">{selectedProspectoData.proyecto_nombre}</span>
            </div>
          )}

          {/* Calendar */}
          <div className="space-y-2">
            <Label>Fecha <span className="text-destructive">*</span></Label>
            <div className="border rounded-lg flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </div>
            {selectedDate && (
              <p className="text-xs text-muted-foreground text-center">
                {format(selectedDate, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
              </p>
            )}
          </div>

          {/* Hour */}
          <div className="space-y-2">
            <Label>Hora <span className="text-destructive">*</span></Label>
            <Select value={selectedHour} onValueChange={setSelectedHour}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar hora..." />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem key={h} value={h}>{h} hrs</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea
              placeholder="Agregar notas..."
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !selectedProspecto || !selectedDate || !selectedHour}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {createMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Agendando...</> : "Agendar Cita"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
