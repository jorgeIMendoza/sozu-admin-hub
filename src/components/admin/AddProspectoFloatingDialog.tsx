import { useState, useMemo, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { useCtaTracker } from "@/hooks/useCtaTracker";

interface AddProspectoFloatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preSelectedPersonaId?: number | null;
}

interface ProspectoRelacion {
  entidad_relacionada_id: number;
  id_proyecto: number;
  proyecto_nombre: string;
}

export function AddProspectoFloatingDialog({ open, onOpenChange, preSelectedPersonaId }: AddProspectoFloatingDialogProps) {
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
  // Projects assigned to the selected prospect in edit mode
  const [editProyectos, setEditProyectos] = useState<ProspectoRelacion[]>([]);
  const hasAppliedPreselect = useRef(false);

  // Fetch agent's existing prospects (grouped by persona)
  const { data: misProspectos = [] } = useQuery({
    queryKey: ["mis-prospectos-floating", profile?.id_persona],
    queryFn: async () => {
      if (!profile?.id_persona) return [];
      const { data, error } = await supabase
        .from("entidades_relacionadas")
        .select(`
          id,
          id_persona,
          id_proyecto,
          personas!entidades_relacionadas_id_persona_fkey (
            id, nombre_legal, email, telefono, clave_pais_telefono, tipo_persona, rfc, curp
          ),
          proyectos!entidades_relacionadas_id_proyecto_fkey (
            id, nombre
          )
        `)
        .eq("id_tipo_entidad", 7)
        .eq("activo", true)
        .eq("id_persona_duena_lead", profile.id_persona);

      if (error) throw error;
      return (data || [])
        .filter((er: any) => er.personas)
        .map((er: any) => ({
          entidad_relacionada_id: er.id,
          id_persona: er.personas.id,
          nombre_legal: er.personas.nombre_legal || "",
          email: er.personas.email || "",
          telefono: er.personas.telefono || "",
          clave_pais_telefono: er.personas.clave_pais_telefono || "MX",
          tipo_persona: er.personas.tipo_persona || "pf",
          rfc: er.personas.rfc || "",
          curp: er.personas.curp || "",
          id_proyecto: er.id_proyecto,
          proyecto_nombre: er.proyectos?.nombre || "",
        }));
    },
    enabled: open && !!profile?.id_persona,
  });

  // Fetch project names for assigned projects
  const assignedProjectIds = useMemo(() => {
    return [...new Set(misProspectos.map((p) => p.id_proyecto).filter(Boolean))] as number[];
  }, [misProspectos]);

  const { data: projectNamesMap = new Map<number, string>() } = useQuery({
    queryKey: ["project-names-floating", assignedProjectIds],
    queryFn: async () => {
      if (assignedProjectIds.length === 0) return new Map<number, string>();
      const { data } = await supabase
        .from("proyectos")
        .select("id, nombre")
        .in("id", assignedProjectIds);
      const m = new Map<number, string>();
      (data || []).forEach((p: any) => m.set(p.id, p.nombre));
      return m;
    },
    enabled: assignedProjectIds.length > 0,
  });

  const prospectoOptions = useMemo(() => {
    const seen = new Set<number>();
    return misProspectos
      .filter((p) => { if (seen.has(p.id_persona)) return false; seen.add(p.id_persona); return true; })
      .map((p) => ({ value: p.id_persona.toString(), label: p.nombre_legal || p.email }));
  }, [misProspectos]);

  const prospectPersonaIds = useMemo(() => {
    return [...new Set(misProspectos.map((p) => p.id_persona))] as number[];
  }, [misProspectos]);

  const { data: activeProjectIdsByPersona = new Map<number, Set<number>>() } = useQuery({
    queryKey: ["prospecto-active-projects-floating", prospectPersonaIds],
    queryFn: async () => {
      if (prospectPersonaIds.length === 0) return new Map<number, Set<number>>();

      const { data, error } = await supabase
        .from("entidades_relacionadas")
        .select("id_persona, id_proyecto")
        .eq("id_tipo_entidad", 7)
        .eq("activo", true)
        .in("id_persona", prospectPersonaIds);

      if (error) throw error;

      const map = new Map<number, Set<number>>();
      (data || []).forEach((relation: any) => {
        if (!relation.id_persona || !relation.id_proyecto) return;
        if (!map.has(relation.id_persona)) {
          map.set(relation.id_persona, new Set<number>());
        }
        map.get(relation.id_persona)?.add(relation.id_proyecto);
      });

      return map;
    },
    enabled: open && prospectPersonaIds.length > 0,
  });

  const handleSelectProspecto = (value: string) => {
    if (!value) {
      setSelectedProspectoId(null);
      setEditProyectos([]);
      return;
    }
    const id = parseInt(value);
    // Get all relations for this persona
    const relations = misProspectos.filter((p) => p.id_persona === id);
    const firstRelation = relations[0];
    if (firstRelation) {
      setSelectedProspectoId(id);
      setNombre(firstRelation.nombre_legal);
      setEmail(firstRelation.email);
      setTelefono(firstRelation.telefono);
      setClavePais(firstRelation.clave_pais_telefono);
      setTipoPersona(firstRelation.tipo_persona);
      setRfc(firstRelation.rfc);
      setCurp(firstRelation.curp);

      // Collect all assigned projects
      const proyectos: ProspectoRelacion[] = relations
        .filter((r) => r.id_proyecto)
        .map((r: any) => ({
          entidad_relacionada_id: r.entidad_relacionada_id,
          id_proyecto: r.id_proyecto,
          proyecto_nombre: r.proyecto_nombre || projectNamesMap.get(r.id_proyecto) || `Proyecto ${r.id_proyecto}`,
        }))
        // Deduplicate
        .filter((p, idx, arr) => arr.findIndex((x) => x.id_proyecto === p.id_proyecto) === idx);

      setEditProyectos(proyectos);
      setProyectoId(""); // Clear the add-project selector
    }
  };

  const isEditMode = selectedProspectoId !== null;

  // Auto-select prospect when preSelectedPersonaId is provided
  useEffect(() => {
    if (open && preSelectedPersonaId && misProspectos.length > 0 && !hasAppliedPreselect.current) {
      hasAppliedPreselect.current = true;
      handleSelectProspecto(preSelectedPersonaId.toString());
    }
    if (!open) {
      hasAppliedPreselect.current = false;
    }
  }, [open, preSelectedPersonaId, misProspectos]);

  // Fetch developments the agent has access to (with available inventory)
  const { data: proyectos = [] } = useQuery({
    queryKey: ["desarrollos-activos-floating", accessibleProjectIds, hasUnrestrictedAccess],
    queryFn: async () => {
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

      const candidateIds = candidates.map(c => c.id);
      
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

      const { data: availProps } = await supabase
        .from('propiedades')
        .select('id_edificio_modelo')
        .eq('id_estatus_disponibilidad', 2)
        .eq('activo', true)
        .in('id_edificio_modelo', emIds)
        .limit(1000);

      if (!availProps || availProps.length === 0) return [];

      const availEmSet = new Set(availProps.map(p => p.id_edificio_modelo));
      const availEdSet = new Set(ems.filter(em => availEmSet.has(em.id)).map(em => em.id_edificio));
      const availProjSet = new Set(edificios.filter(e => availEdSet.has(e.id)).map(e => e.id_proyecto));

      return candidates.filter(c => availProjSet.has(c.id));
    },
    enabled: open && !isLoadingAccess,
  });

  const showSearch = proyectos.length > 10;

  // Add project to existing prospect
  const addProjectToProspectMutation = useMutation({
    mutationFn: async ({ personaId, proyectoId: projId }: { personaId: number; proyectoId: number }) => {
      // Check if any relation already exists (active or inactive)
      const { data: existing } = await supabase
        .from("entidades_relacionadas")
        .select("id, activo")
        .eq("id_persona", personaId)
        .eq("id_tipo_entidad", 7)
        .eq("id_proyecto", projId)
        .maybeSingle();

      if (existing) {
        if (existing.activo) {
          // Already active — update owner if needed
          const { error } = await supabase
            .from("entidades_relacionadas")
            .update({ id_persona_duena_lead: profile?.id_persona || null })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          // Reactivate existing inactive relation
          const { error } = await supabase
            .from("entidades_relacionadas")
            .update({ activo: true, id_persona_duena_lead: profile?.id_persona || null })
            .eq("id", existing.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from("entidades_relacionadas")
          .insert([{
            id_persona: personaId,
            id_tipo_entidad: 7,
            id_proyecto: projId,
            id_persona_duena_lead: profile?.id_persona || null,
            activo: true,
          }]);
        if (error) throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["mis-prospectos-floating"] });
      queryClient.invalidateQueries({ queryKey: ["prospecto-active-projects-floating"] });
      queryClient.invalidateQueries({ queryKey: ["prospectos"] });
      queryClient.invalidateQueries({ queryKey: ["inmob-prospectos"] });
      queryClient.invalidateQueries({ queryKey: ["mis-prospectos-showroom"] });
      queryClient.invalidateQueries({ queryKey: ["agent-prospectos"] });
      toast.success("Proyecto agregado al prospecto");
      // Optimistically add to local state
      const proj = proyectos.find(p => p.id === variables.proyectoId);
      if (proj) {
        setEditProyectos(prev => prev.some((p) => p.id_proyecto === proj.id) ? prev : [...prev, {
          entidad_relacionada_id: Date.now(), // temporary ID until refetch
          id_proyecto: proj.id,
          proyecto_nombre: proj.nombre,
        }]);
      }
    },
    onError: (error: any) => {
      if (error.message?.includes("uq_entrel_persona_tipo_proy")) {
        toast.error("Este proyecto ya está asignado al prospecto.");
      } else {
        toast.error("Error al agregar proyecto: " + error.message);
      }
    },
  });

  // Remove project from prospect
  const removeProjectFromProspectMutation = useMutation({
    mutationFn: async (entidadRelacionadaId: number) => {
      const { error } = await supabase
        .from("entidades_relacionadas")
        .update({ activo: false })
        .eq("id", entidadRelacionadaId);
      if (error) throw error;
    },
    onSuccess: (_data, removedId) => {
      queryClient.invalidateQueries({ queryKey: ["mis-prospectos-floating"] });
      queryClient.invalidateQueries({ queryKey: ["prospecto-active-projects-floating"] });
      queryClient.invalidateQueries({ queryKey: ["prospectos"] });
      queryClient.invalidateQueries({ queryKey: ["inmob-prospectos"] });
      queryClient.invalidateQueries({ queryKey: ["mis-prospectos-showroom"] });
      queryClient.invalidateQueries({ queryKey: ["agent-prospectos"] });
      toast.success("Proyecto removido del prospecto");
    },
    onError: (error: any) => {
      toast.error("Error al remover proyecto: " + error.message);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!nombre || !email || !telefono) {
        throw new Error("Completa los campos obligatorios");
      }
      if (!/^\d{10}$/.test(telefono)) {
        throw new Error("El teléfono debe tener exactamente 10 dígitos numéricos");
      }

      if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) {
        throw new Error("El RFC no tiene un formato válido. Debe ser de 12 caracteres para persona moral o 13 para persona física (Ej: ABC123456DEF o ABCD123456EF1)");
      }

      if (curp && !/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(curp)) {
        throw new Error("La CURP no tiene un formato válido. Debe tener 18 caracteres alfanuméricos (Ej: ABCD123456HMNEFD01)");
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
      } else {
        // Validate project for new prospect
        if (!proyectoId) {
          throw new Error("Completa los campos obligatorios");
        }

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
      queryClient.invalidateQueries({ queryKey: ["inmob-prospectos"] });
      queryClient.invalidateQueries({ queryKey: ["agent-prospectos"] });
      toast.success(isEditMode ? "Prospecto actualizado exitosamente" : "Prospecto creado exitosamente");
      handleClose();
    },
    onError: (error: any) => {
      const msg = error.message || "Ocurrió un error inesperado";
      if (msg.includes("personas_rfc_key") || msg.includes("duplicate") && msg.includes("rfc")) {
        toast.error("El RFC ingresado ya está registrado en el sistema. Por favor, verifica e ingresa un RFC diferente.");
      } else if (msg.includes("personas_curp_key") || msg.includes("duplicate") && msg.includes("curp")) {
        toast.error("La CURP ingresada ya está registrada en el sistema. Por favor, verifica e ingresa una CURP diferente.");
      } else if (msg.includes("personas_email_key") || msg.includes("duplicate") && msg.includes("email")) {
        toast.error("El email ingresado ya está registrado en el sistema. Por favor, verifica e ingresa un email diferente.");
      } else if (msg.includes("RFC") || msg.includes("CURP") || msg.includes("teléfono") || msg.includes("obligatorios")) {
        toast.error(msg);
      } else {
        toast.error("No se pudo guardar el prospecto. Verifica los datos e intenta de nuevo.");
      }
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
    setEditProyectos([]);
    hasTrackedFieldFill.current = false;
    onOpenChange(false);
  };

  // Available projects to add (not already assigned)
  const availableProjectsForAdd = useMemo(() => {
    const assignedIds = activeProjectIdsByPersona.get(selectedProspectoId || -1) || new Set<number>();
    return proyectos.filter((p) => !assignedIds.has(p.id));
  }, [proyectos, activeProjectIdsByPersona, selectedProspectoId]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Editar Prospecto" : "Nuevo Prospecto"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search existing prospects */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">Buscar prospecto existente para editar</Label>
            {prospectoOptions.length >= 10 ? (
              <Combobox
                value={selectedProspectoId?.toString() || ""}
                onValueChange={handleSelectProspecto}
                options={prospectoOptions}
                placeholder="Buscar por nombre..."
                searchPlaceholder="Escribir nombre del prospecto..."
                emptyText="No se encontró el prospecto"
              />
            ) : (
              <Select value={selectedProspectoId?.toString() || ""} onValueChange={handleSelectProspecto}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar prospecto..." />
                </SelectTrigger>
                <SelectContent>
                  {prospectoOptions.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Projects section */}
          {isEditMode ? (
            <div className="space-y-2">
              <Label>Proyectos de Interés</Label>
              <div className="flex flex-wrap gap-1.5 min-h-[36px] items-center p-2 border border-border rounded-md bg-background">
                {editProyectos.map((p) => (
                  <Badge key={p.entidad_relacionada_id} variant="secondary" className="text-xs flex items-center gap-1 pr-1">
                    {p.proyecto_nombre}
                    {editProyectos.length > 1 && (
                      <button
                        onClick={() => {
                          setEditProyectos((prev) => prev.filter((x) => x.entidad_relacionada_id !== p.entidad_relacionada_id));
                          removeProjectFromProspectMutation.mutate(p.entidad_relacionada_id);
                        }}
                        className="ml-0.5 rounded-full hover:bg-destructive/20 hover:text-destructive p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </Badge>
                ))}
                {editProyectos.length === 0 && (
                  <span className="text-sm text-muted-foreground">Sin proyectos asignados</span>
                )}
              </div>
              {availableProjectsForAdd.length > 0 && (
                showSearch ? (
                  <Combobox
                    value=""
                    onValueChange={(value) => {
                      if (value && selectedProspectoId) {
                        addProjectToProspectMutation.mutate({
                          personaId: selectedProspectoId,
                          proyectoId: parseInt(value),
                        });
                      }
                    }}
                    options={availableProjectsForAdd.map((p) => ({ value: p.id.toString(), label: p.nombre }))}
                    placeholder="Agregar otro proyecto..."
                    searchPlaceholder="Buscar desarrollo..."
                    emptyText="No se encontró el desarrollo"
                  />
                ) : (
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (value && selectedProspectoId) {
                        addProjectToProspectMutation.mutate({
                          personaId: selectedProspectoId,
                          proyectoId: parseInt(value),
                        });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Agregar otro proyecto..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProjectsForAdd.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              )}
            </div>
          ) : (
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
          )}

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
              <div className="space-y-1">
                <Label>RFC</Label>
                <Input 
                  placeholder="Ej: ABC123456DEF" 
                  value={rfc} 
                  onChange={(e) => setRfc(e.target.value.toUpperCase())} 
                  maxLength={13}
                  className={rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc) ? "border-destructive" : ""}
                />
                {rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc) && (
                  <p className="text-[10px] text-destructive">Formato inválido (12-13 caracteres)</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>CURP</Label>
                <Input 
                  placeholder="Ej: ABCD123456HMNEFD01" 
                  value={curp} 
                  onChange={(e) => setCurp(e.target.value.toUpperCase())} 
                  maxLength={18}
                  className={curp && !/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(curp) ? "border-destructive" : ""}
                />
                {curp && !/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(curp) && (
                  <p className="text-[10px] text-destructive">Formato inválido (18 caracteres)</p>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button
              onClick={() => { track({ page: "modal_prospecto", elementId: "modal_prospecto_guardar" }); createMutation.mutate(); }}
              disabled={createMutation.isPending || (!isEditMode && !proyectoId) || !nombre || !email || !telefono}
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
