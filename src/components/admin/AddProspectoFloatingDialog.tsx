import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProjectAccess } from "@/hooks/useProjectAccess";

interface AddProspectoFloatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddProspectoFloatingDialog({ open, onOpenChange }: AddProspectoFloatingDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { accessibleProjectIds, hasUnrestrictedAccess } = useProjectAccess();

  const [proyectoId, setProyectoId] = useState("");
  const [tipoPersona, setTipoPersona] = useState("pf");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [clavePais, setClavePais] = useState("MX");
  const [telefono, setTelefono] = useState("");
  const [rfc, setRfc] = useState("");
  const [curp, setCurp] = useState("");

  // Fetch projects the agent has access to
  const { data: proyectos = [] } = useQuery({
    queryKey: ["proyectos-activos-floating", accessibleProjectIds, hasUnrestrictedAccess],
    queryFn: async () => {
      let query = supabase
        .from("proyectos")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");

      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        query = query.in("id", accessibleProjectIds);
      } else if (!hasUnrestrictedAccess && accessibleProjectIds.length === 0) {
        return [];
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const showSearch = proyectos.length > 10;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!proyectoId || !nombre || !email || !telefono) {
        throw new Error("Completa los campos obligatorios");
      }

      // Validate phone: exactly 10 numeric digits
      if (!/^\d{10}$/.test(telefono)) {
        throw new Error("El teléfono debe tener exactamente 10 dígitos numéricos");
      }

      // Create persona
      const { data: persona, error: personaError } = await supabase
        .from("personas")
        .insert([{
          tipo_persona: tipoPersona,
          nombre_legal: nombre,
          email,
          telefono,
          clave_pais_telefono: clavePais,
          rfc: rfc || null,
          curp: curp || null,
          activo: true,
        }])
        .select()
        .single();

      if (personaError) throw personaError;

      // Create entidad_relacionada as prospect (tipo_entidad = 7), agent is the logged-in user
      const { error: entidadError } = await supabase
        .from("entidades_relacionadas")
        .insert([{
          id_persona: persona.id,
          id_tipo_entidad: 7,
          id_proyecto: parseInt(proyectoId),
          id_persona_duena_lead: profile?.id_persona || null,
          activo: true,
        }]);

      if (entidadError) throw entidadError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospectos"] });
      toast.success("Prospecto creado exitosamente");
      handleClose();
    },
    onError: (error: any) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const handleClose = () => {
    setProyectoId("");
    setTipoPersona("pf");
    setNombre("");
    setEmail("");
    setClavePais("MX");
    setTelefono("");
    setRfc("");
    setCurp("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Prospecto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Proyecto de Interés */}
          <div className="space-y-2">
            <Label>Proyecto de Interés <span className="text-destructive">*</span></Label>
            {showSearch ? (
              <Combobox
                value={proyectoId}
                onValueChange={setProyectoId}
                options={proyectos.map((p) => ({ value: p.id.toString(), label: p.nombre }))}
                placeholder="Seleccionar proyecto..."
                searchPlaceholder="Buscar proyecto..."
                emptyText="No se encontró el proyecto"
              />
            ) : (
              <Select value={proyectoId} onValueChange={setProyectoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proyecto..." />
                </SelectTrigger>
                <SelectContent>
                  {proyectos.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Información Básica section */}
          <div className="border rounded-lg p-4 space-y-4">
            <p className="text-center text-sm font-medium text-muted-foreground">Información Básica</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Persona <span className="text-destructive">*</span></Label>
                <Select value={tipoPersona} onValueChange={setTipoPersona}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pf">Persona Física</SelectItem>
                    <SelectItem value="pm">Persona Moral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nombre Completo <span className="text-destructive">*</span></Label>
                <Input placeholder="Ingresa el nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" placeholder="Ingresa el email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Teléfono <span className="text-destructive">*</span></Label>
                <div className="flex gap-2">
                  <Select value={clavePais} onValueChange={setClavePais}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MX">MX</SelectItem>
                      <SelectItem value="US">US</SelectItem>
                      <SelectItem value="CO">CO</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="10 dígitos" value={telefono} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setTelefono(v); }} maxLength={10} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>RFC</Label>
                <Input placeholder="Ingresa el RFC (Ej: ABC123456DEF)" value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} />
              </div>
              <div className="space-y-2">
                <Label>CURP</Label>
                <Input placeholder="Ingresa la CURP (Ej: ABCD123456HMNEFD01)" value={curp} onChange={(e) => setCurp(e.target.value.toUpperCase())} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !proyectoId || !nombre || !email || !telefono}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {createMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando...</> : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
