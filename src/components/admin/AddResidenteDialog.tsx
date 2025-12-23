import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UserPlus, Users } from "lucide-react";
import { PersonForm } from "./PersonForm";

interface AddResidenteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuentaMantenimientoId: number;
  compradores: Array<{
    id_persona: number;
    nombre_legal: string;
    porcentaje_copropiedad: number;
  }>;
}

export const AddResidenteDialog = ({
  open,
  onOpenChange,
  cuentaMantenimientoId,
  compradores,
}: AddResidenteDialogProps) => {
  const [showNewResidenteForm, setShowNewResidenteForm] = useState(false);
  const queryClient = useQueryClient();

  // Fetch residentes activos actuales para esta cuenta
  const { data: residentesActivos = [] } = useQuery({
    queryKey: ["residentes_activos_cuenta", cuentaMantenimientoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("residentes")
        .select(`
          id,
          id_persona,
          activo,
          personas!residentes_id_persona_fkey(
            id,
            nombre_legal
          )
        `)
        .eq("id_cuenta_cobranza", cuentaMantenimientoId)
        .eq("activo", true);

      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Obtener los id_persona de los residentes activos para deshabilitar esos propietarios
  const residentesActivosIds = residentesActivos.map(r => r.id_persona);

  // Mutation para asignar propietario como residente
  const asignarPropietarioMutation = useMutation({
    mutationFn: async (idPersona: number) => {
      // 1. Desactivar todos los residentes actuales de esta cuenta
      if (residentesActivos.length > 0) {
        const residenteIds = residentesActivos.map(r => r.id);
        const { error: deactivateError } = await (supabase as any)
          .from("residentes")
          .update({ activo: false })
          .in("id", residenteIds);

        if (deactivateError) throw deactivateError;
      }

      // 2. Verificar si ya existe un residente inactivo para esta persona y cuenta
      const { data: residenteExistente, error: checkError } = await (supabase as any)
        .from("residentes")
        .select("id")
        .eq("id_persona", idPersona)
        .eq("id_cuenta_cobranza", cuentaMantenimientoId)
        .eq("activo", false)
        .maybeSingle();

      if (checkError) throw checkError;

      if (residenteExistente) {
        // Si existe, solo reactivarlo
        const { error: updateError } = await (supabase as any)
          .from("residentes")
          .update({ activo: true })
          .eq("id", residenteExistente.id);

        if (updateError) throw updateError;
      } else {
        // 3. Crear nueva entrada en residentes
        const { error: residenteError } = await (supabase as any)
          .from("residentes")
          .insert({
            id_persona: idPersona,
            id_cuenta_cobranza: cuentaMantenimientoId,
            activo: true,
          });

        if (residenteError) throw residenteError;
      }

      // 4. Verificar si ya existe entidad_relacionada de tipo Residente para esta persona
      const { data: entidadExistente, error: entidadCheckError } = await (supabase as any)
        .from("entidades_relacionadas")
        .select("id")
        .eq("id_persona", idPersona)
        .eq("id_tipo_entidad", 18) // 18 = Residente
        .is("id_proyecto", null)
        .maybeSingle();

      if (entidadCheckError) throw entidadCheckError;

      // Si no existe, crear la entidad relacionada
      if (!entidadExistente) {
        const { error: entidadError } = await (supabase as any)
          .from("entidades_relacionadas")
          .insert({
            id_persona: idPersona,
            id_tipo_entidad: 18, // Residente
            activo: true,
          });

        if (entidadError) throw entidadError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuentas_mantenimiento"] });
      queryClient.invalidateQueries({ queryKey: ["residentes"] });
      queryClient.invalidateQueries({ queryKey: ["residentes_activos_cuenta", cuentaMantenimientoId] });
      toast.success("Residente asignado exitosamente");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(`Error al asignar residente: ${error.message}`);
    },
  });

  // Mutation para crear nuevo residente
  const crearResidenteMutation = useMutation({
    mutationFn: async (personData: any) => {
      // 1. Desactivar todos los residentes actuales de esta cuenta
      if (residentesActivos.length > 0) {
        const residenteIds = residentesActivos.map(r => r.id);
        const { error: deactivateError } = await (supabase as any)
          .from("residentes")
          .update({ activo: false })
          .in("id", residenteIds);

        if (deactivateError) throw deactivateError;
      }

      // 2. Crear la persona - Eliminar campos que no existen en la tabla personas
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, pendingDocuments, tempBankAccounts, tempBeneficiaries, ...cleanPersonData } = personData;
      
      const { data: persona, error: personaError } = await supabase
        .from("personas")
        .insert(cleanPersonData)
        .select()
        .single();

      if (personaError) throw personaError;

      // 3. Crear entidad_relacionada de tipo Residente
      const { error: entidadError } = await (supabase as any)
        .from("entidades_relacionadas")
        .insert({
          id_persona: persona.id,
          id_tipo_entidad: 18, // Residente
          activo: true,
        });

      if (entidadError) throw entidadError;

      // 4. Crear entrada en residentes
      const { error: residenteError } = await (supabase as any)
        .from("residentes")
        .insert({
          id_persona: persona.id,
          id_cuenta_cobranza: cuentaMantenimientoId,
          activo: true,
        });

      if (residenteError) throw residenteError;

      return persona;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuentas_mantenimiento"] });
      queryClient.invalidateQueries({ queryKey: ["residentes"] });
      queryClient.invalidateQueries({ queryKey: ["residentes_activos_cuenta", cuentaMantenimientoId] });
      toast.success("Residente creado exitosamente");
      setShowNewResidenteForm(false);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(`Error al crear residente: ${error.message}`);
    },
  });

  const handleAsignarPropietario = (idPersona: number) => {
    asignarPropietarioMutation.mutate(idPersona);
  };

  const handleCrearResidente = (data: any) => {
    crearResidenteMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {showNewResidenteForm ? "Crear Nuevo Residente" : "Asignar Residente"}
          </DialogTitle>
        </DialogHeader>

        {showNewResidenteForm ? (
          <div className="space-y-4">
            <PersonForm
              entityType="residente"
              onSubmit={handleCrearResidente}
              onCancel={() => setShowNewResidenteForm(false)}
              isLoading={crearResidenteMutation.isPending}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Seleccionar Propietario Existente
              </h3>
              <div className="grid gap-2">
                {compradores.map((comprador) => {
                  const yaEsResidente = residentesActivosIds.includes(comprador.id_persona);
                  
                  return (
                    <div
                      key={comprador.id_persona}
                      className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                        yaEsResidente 
                          ? 'opacity-50 bg-muted cursor-not-allowed' 
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{comprador.nombre_legal}</p>
                          {yaEsResidente && (
                            <Badge variant="secondary" className="text-xs">
                              Ya es residente
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {comprador.porcentaje_copropiedad.toFixed(2)}% propiedad
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleAsignarPropietario(comprador.id_persona)}
                        disabled={asignarPropietarioMutation.isPending || yaEsResidente}
                      >
                        Asignar
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">O</span>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => setShowNewResidenteForm(true)}
            >
              <UserPlus className="h-4 w-4" />
              Crear Nuevo Residente
            </Button>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
