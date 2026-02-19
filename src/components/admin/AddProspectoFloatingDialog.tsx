import { useState, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { useCtaTracker } from "@/hooks/useCtaTracker";

interface AddProspectoFloatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddProspectoFloatingDialog({ open, onOpenChange }: AddProspectoFloatingDialogProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { accessibleProjectIds, hasUnrestrictedAccess, isLoading: isLoadingAccess } = useProjectAccess();
  const { track } = useCtaTracker();
  const hasTrackedFieldFill = useRef(false);

  const [selectedProspectoId, setSelectedProspectoId] = useState<number | null>(null);
  const [proyectoId, setProyectoId] = useState("");
  const [tipoPersona, setTipoPersona] = useState("pf");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [clavePais, setClavePais] = useState("MX");
  const [telefono, setTelefono] = useState("");
  const [rfc, setRfc] = useState("");
  const [curp, setCurp] = useState("");

  // Fetch agent's existing prospects
  const { data: misProspectos = [] } = useQuery({
    queryKey: ["mis-prospectos-floating", profile?.id_persona],
    queryFn: async () => {
      if (!profile?.id_persona) return [];
      const { data, error } = await supabase
        .from("entidades_relacionadas")
        .select(`
          id_persona,
          id_proyecto,
          personas!entidades_relacionadas_id_persona_fkey (
            id, nombre_legal, email, telefono, clave_pais_telefono, tipo_persona, rfc, curp
          )
        `)
        .eq("id_tipo_entidad", 7)
        .eq("activo", true)
        .eq("id_persona_duena_lead", profile.id_persona);

      if (error) throw error;
      return (data || [])
        .filter((er: any) => er.personas)
        .map((er: any) => ({
          id_persona: er.personas.id,
          nombre_legal: er.personas.nombre_legal || "",
          email: er.personas.email || "",
          telefono: er.personas.telefono || "",
          clave_pais_telefono: er.personas.clave_pais_telefono || "MX",
          tipo_persona: er.personas.tipo_persona || "pf",
          rfc: er.personas.rfc || "",
          curp: er.personas.curp || "",
          id_proyecto: er.id_proyecto,
        }));
    },
    enabled: open && !!profile?.id_persona,
  });

  const prospectoOptions = useMemo(() => {
    // Deduplicate by id_persona
    const seen = new Set<number>();
    return misProspectos
      .filter((p) => { if (seen.has(p.id_persona)) return false; seen.add(p.id_persona); return true; })
      .map((p) => ({ value: p.id_persona.toString(), label: p.nombre_legal || p.email }));
  }, [misProspectos]);

  const handleSelectProspecto = (value: string) => {
    if (!value) {
      setSelectedProspectoId(null);
      return;
    }
    const id = parseInt(value);
    const prospecto = misProspectos.find((p) => p.id_persona === id);
    if (prospecto) {
      setSelectedProspectoId(id);
      setNombre(prospecto.nombre_legal);
      setEmail(prospecto.email);
      setTelefono(prospecto.telefono);
      setClavePais(prospecto.clave_pais_telefono);
      setTipoPersona(prospecto.tipo_persona);
      setRfc(prospecto.rfc);
      setCurp(prospecto.curp);
      if (prospecto.id_proyecto) {
        setProyectoId(prospecto.id_proyecto.toString());
      }
    }
  };

  const isEditMode = selectedProspectoId !== null;

  // Fetch developments the agent has access to (with available inventory)
  const { data: proyectos = [] } = useQuery({
    queryKey: ["desarrollos-activos-floating", accessibleProjectIds, hasUnrestrictedAccess],
    queryFn: async () => {
      // Step 1: Get user's accessible projects
      let candidateQuery = supabase
        .from("proyectos")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");

      if (!hasUnrestrictedAccess) {
        if (accessibleProjectIds.length === 0) return [];
        candidateQuery = candidateQuery.in("id", accessibleProjectIds);
      }

      const { data: candidates, error } = await candidateQuery;
      if (error) throw error;
      if (!candidates || candidates.length === 0) return [];

      // Step 2: For each candidate project, check if it has available properties via SQL count
      const candidateIds = candidates.map(c => c.id);
      
      // Use a simple RPC-like approach: query edificios scoped to these projects
      const { data: edificios } = await supabase
        .from('edificios')
        .select('id, id_proyecto')
        .eq('activo', true)
        .in('id_proyecto', candidateIds);

      if (!edificios || edificios.length === 0) return [];

      const edificioIds = edificios.map(e => e.id);

      const { data: ems } = await supabase
        .from('edificios_modelos')
        .select('id, id_edificio')
        .eq('activo', true)
        .in('id_edificio', edificioIds);

      if (!ems || ems.length === 0) return [];

      const emIds = ems.map(em => em.id);

      // Query available propiedades scoped to these edificio_modelos only (small set)
      const { data: availProps } = await supabase
        .from('propiedades')
        .select('id_edificio_modelo')
        .eq('id_estatus_disponibilidad', 2)
        .eq('activo', true)
        .in('id_edificio_modelo', emIds)
        .limit(1000);

      if (!availProps || availProps.length === 0) return [];

      // Map back to project IDs
      const availEmSet = new Set(availProps.map(p => p.id_edificio_modelo));
      const availEdSet = new Set(ems.filter(em => availEmSet.has(em.id)).map(em => em.id_edificio));
      const availProjSet = new Set(edificios.filter(e => availEdSet.has(e.id)).map(e => e.id_proyecto));

      return candidates.filter(c => availProjSet.has(c.id));
    },
    enabled: open && !isLoadingAccess,
  });

  const showSearch = proyectos.length > 10;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!proyectoId || !nombre || !email || !telefono) {
        throw new Error("Completa los campos obligatorios");
      }
      if (!/^\d{10}$/.test(telefono)) {
        throw new Error("El teléfono debe tener exactamente 10 dígitos numéricos");
      }

      if (isEditMode && selectedProspectoId) {
        // Update existing persona
        const { error: updateError } = await supabase
          .from("personas")
          .update({
            tipo_persona: tipoPersona,
            nombre_legal: nombre,
            email,
            telefono,
            clave_pais_telefono: clavePais,
            rfc: rfc || null,
            curp: curp || null,
          })
          .eq("id", selectedProspectoId);

        if (updateError) throw updateError;

        // Update entidad_relacionada project if changed
        const { error: entidadError } = await supabase
          .from("entidades_relacionadas")
          .update({ id_proyecto: parseInt(proyectoId) })
          .eq("id_persona", selectedProspectoId)
          .eq("id_tipo_entidad", 7)
          .eq("activo", true)
          .eq("id_persona_duena_lead", profile?.id_persona || 0);

        if (entidadError) throw entidadError;
      } else {
        // Create new persona
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
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospectos"] });
      queryClient.invalidateQueries({ queryKey: ["mis-prospectos-floating"] });
      toast.success(isEditMode ? "Prospecto actualizado exitosamente" : "Prospecto creado exitosamente");
      handleClose();
    },
    onError: (error: any) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const trackFieldFill = () => {
    if (!hasTrackedFieldFill.current) {
      hasTrackedFieldFill.current = true;
      track({ page: "modal_prospecto", elementId: "modal_prospecto_campo_llenado" });
    }
  };

  const handleClose = () => {
    setSelectedProspectoId(null);
    setProyectoId("");
    setTipoPersona("pf");
    setNombre("");
    setEmail("");
    setClavePais("MX");
    setTelefono("");
    setRfc("");
    setCurp("");
    hasTrackedFieldFill.current = false;
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Prospecto</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search existing prospects */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">Buscar prospecto existente</Label>
            <Combobox
              value={selectedProspectoId?.toString() || ""}
              onValueChange={handleSelectProspecto}
              options={prospectoOptions}
              placeholder="Buscar por nombre..."
              searchPlaceholder="Escribir nombre del prospecto..."
              emptyText="No se encontró el prospecto"
            />
          </div>

          {/* Desarrollo de Interés */}
          <div className="space-y-2">
            <Label>Desarrollo de Interés <span className="text-destructive">*</span></Label>
            {showSearch ? (
              <Combobox
                value={proyectoId}
                onValueChange={setProyectoId}
                options={proyectos.map((p) => ({ value: p.id.toString(), label: p.nombre }))}
                placeholder="Seleccionar desarrollo..."
                searchPlaceholder="Buscar desarrollo..."
                emptyText="No se encontró el desarrollo"
              />
            ) : (
              <Select value={proyectoId} onValueChange={setProyectoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar desarrollo..." />
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
                <Input placeholder="Ingresa el nombre completo" value={nombre} onChange={(e) => { setNombre(e.target.value); trackFieldFill(); }} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" placeholder="Ingresa el email" value={email} onChange={(e) => { setEmail(e.target.value); trackFieldFill(); }} />
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
                  <Input placeholder="10 dígitos" value={telefono} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setTelefono(v); trackFieldFill(); }} maxLength={10} />
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
              onClick={() => { track({ page: "modal_prospecto", elementId: "modal_prospecto_guardar" }); createMutation.mutate(); }}
              disabled={createMutation.isPending || !proyectoId || !nombre || !email || !telefono}
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {createMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando...</> : isEditMode ? "Actualizar" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
