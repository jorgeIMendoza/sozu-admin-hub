import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserCheck, Loader2 } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface AsignarPropiedadDialogProps {
  propertyId: number;
  propertyNumber: string;
}

export const AsignarPropiedadDialog = ({ propertyId, propertyNumber }: AsignarPropiedadDialogProps) => {
  const [open, setOpen] = useState(false);
  const [selectedPersona, setSelectedPersona] = useState<string>("");
  const [isAssigning, setIsAssigning] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarAsignacion } = useActivityLogger();

  // Obtener lista de compradores - consultando desde entidades_relacionadas para evitar límite de 1000
  const { data: compradores, isLoading: loadingCompradores } = useQuery({
    queryKey: ['compradores-asignar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id_persona,
          personas!entidades_relacionadas_id_persona_fkey(
            id,
            nombre_legal,
            rfc,
            curp,
            activo
          )
        `)
        .eq('id_tipo_entidad', 2) // Solo compradores
        .eq('activo', true);

      if (error) throw error;

      // Filtrar personas activas, mapear y eliminar duplicados
      const uniqueCompradores = (data || [])
        .filter((er: any) => er.personas?.activo === true)
        .map((er: any) => ({
          id: er.personas.id,
          nombre_legal: er.personas.nombre_legal,
          rfc: er.personas.rfc,
          curp: er.personas.curp
        }))
        .filter((v: any, i: number, a: any[]) => a.findIndex(t => t.id === v.id) === i)
        .sort((a: any, b: any) => a.nombre_legal.localeCompare(b.nombre_legal));

      return uniqueCompradores;
    },
    enabled: open,
  });

  const handleAsignar = async () => {
    if (!selectedPersona) {
      toast({
        title: "Error",
        description: "Por favor selecciona una persona para asignar",
        variant: "destructive",
      });
      return;
    }

    setIsAssigning(true);

    try {
      // Llamar al edge function
      const { data, error } = await supabase.functions.invoke('asignar-propiedad', {
        body: {
          id_propiedad: propertyId,
          id_persona: parseInt(selectedPersona),
        },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.message || "Error al asignar la propiedad");
      }

      toast({
        title: "Propiedad asignada",
        description: `La propiedad ${propertyNumber} ha sido asignada exitosamente`,
      });

      // Registrar actividad
      const compradorSeleccionado = compradores?.find((c: any) => c.id.toString() === selectedPersona);
      await registrarAsignacion('propiedad', {
        id_propiedad: propertyId,
        numero_propiedad: propertyNumber,
        id_persona: parseInt(selectedPersona),
        nombre_comprador: compradorSeleccionado?.nombre_legal
      }, 'asignar_propiedad_a_comprador');

      // Refrescar la lista de propiedades
      queryClient.invalidateQueries({ queryKey: ['properties-detailed-with-payment-dates'] });

      // Cerrar el dialog
      setOpen(false);
      setSelectedPersona("");

    } catch (error: any) {
      console.error('Error al asignar propiedad:', error);
      toast({
        title: "Error al asignar",
        description: error.message || "Hubo un problema al asignar la propiedad",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const compradoresOptions = (compradores || []).map((comprador: any) => ({
    value: comprador.id.toString(),
    label: `${comprador.nombre_legal} ${comprador.rfc ? `(RFC: ${comprador.rfc})` : comprador.curp ? `(CURP: ${comprador.curp})` : ''}`,
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title="Asignar propiedad"
        >
          <UserCheck className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Asignar Propiedad</DialogTitle>
          <DialogDescription>
            Asigna la propiedad <span className="font-semibold">{propertyNumber}</span> a un comprador.
            Esta acción creará una cuenta de cobranza con precio $0 y cambiará el estatus a "Asignado".
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Comprador *</label>
            {loadingCompradores ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Combobox
                value={selectedPersona}
                onValueChange={setSelectedPersona}
                options={compradoresOptions}
                placeholder="Buscar comprador..."
                emptyText="No se encontraron compradores"
                searchPlaceholder="Buscar por nombre o RFC/CURP..."
              />
            )}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/50 p-4">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-400 mb-2">
              ⚠️ Esta acción creará:
            </h4>
            <ul className="text-sm text-amber-800 dark:text-amber-300 space-y-1 list-disc list-inside">
              <li>Un esquema de pago manual con monto $0</li>
              <li>Una oferta con el comprador seleccionado</li>
              <li>Una cuenta de cobranza con precio final $0</li>
              <li>Un acuerdo de pago tipo "Asignación" completado</li>
              <li>Cambio de estatus a "Asignado"</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              setSelectedPersona("");
            }}
            disabled={isAssigning}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleAsignar}
            disabled={!selectedPersona || isAssigning}
          >
            {isAssigning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Asignando...
              </>
            ) : (
              "Asignar Propiedad"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
