import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentImpersonation } from "@/contexts/AgentImpersonationContext";
import { AgentPortalHeader } from "@/components/admin/agent-portal/AgentPortalHeader";
import { AddProspectoFloatingDialog } from "@/components/admin/AddProspectoFloatingDialog";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { useAgentPortalPermissions } from "@/hooks/useAgentPortalPermissions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Search, UserPlus, Mail, Phone, Pencil } from "lucide-react";

interface ProspectoAgrupado {
  id_persona: number;
  nombre_legal: string;
  email: string;
  telefono: string;
  clave_pais_telefono: string;
  tipo_persona: string;
  proyectos: { id: number; nombre: string; entidad_relacionada_id: number }[];
}

const AgentProspectos = () => {
  const { profile } = useAuth();
  const { impersonatedAgentPersonaId, isImpersonating } = useAgentImpersonation();
  const effectivePersonaId = isImpersonating ? impersonatedAgentPersonaId : profile?.id_persona;
  const queryClient = useQueryClient();
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { permissions } = useAgentPortalPermissions();
  const perms = permissions['/admin/agent/prospectos'] || permissions['/admin/agent/inicio'] || { canRead: true, canCreate: true };
  const [addProspectoOpen, setAddProspectoOpen] = useState(false);
  const [editPersonaId, setEditPersonaId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    registrarVista('/admin/agent/prospectos');
    track({ page: 'agent_prospectos', elementId: 'page_view', elementType: 'page' });
  }, []);

  const { data: prospectos = [], isLoading } = useQuery({
    queryKey: ["agent-prospectos", effectivePersonaId],
    queryFn: async (): Promise<ProspectoAgrupado[]> => {
      if (!effectivePersonaId) return [];

      const { data, error } = await supabase
        .from("entidades_relacionadas")
        .select(`
          id,
          id_persona,
          id_proyecto,
          personas!entidades_relacionadas_id_persona_fkey (
            id, nombre_legal, email, telefono, clave_pais_telefono, tipo_persona
          ),
          proyectos!entidades_relacionadas_id_proyecto_fkey (
            id, nombre
          )
        `)
        .eq("id_tipo_entidad", 7)
        .eq("activo", true)
        .eq("id_persona_duena_lead", effectivePersonaId);

      if (error) throw error;

      // Group by persona
      const map = new Map<number, ProspectoAgrupado>();
      (data || []).forEach((er: any) => {
        if (!er.personas) return;
        const pid = er.personas.id;
        if (!map.has(pid)) {
          map.set(pid, {
            id_persona: pid,
            nombre_legal: er.personas.nombre_legal || "",
            email: er.personas.email || "",
            telefono: er.personas.telefono || "",
            clave_pais_telefono: er.personas.clave_pais_telefono || "MX",
            tipo_persona: er.personas.tipo_persona || "pf",
            proyectos: [],
          });
        }
        if (er.id_proyecto && er.proyectos) {
          const existing = map.get(pid)!;
          if (!existing.proyectos.some(p => p.id === er.id_proyecto)) {
            existing.proyectos.push({
              id: er.id_proyecto,
              nombre: er.proyectos.nombre,
              entidad_relacionada_id: er.id,
            });
          }
        }
      });

      return Array.from(map.values()).sort((a, b) => a.nombre_legal.localeCompare(b.nombre_legal));
    },
    enabled: !!effectivePersonaId,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return prospectos;
    const s = search.toLowerCase();
    return prospectos.filter(p =>
      p.nombre_legal.toLowerCase().includes(s) ||
      p.email.toLowerCase().includes(s) ||
      p.proyectos.some(pr => pr.nombre.toLowerCase().includes(s))
    );
  }, [prospectos, search]);

  return (
    <div className="pb-24">
      <AgentPortalHeader>
        <div className="flex items-center justify-between w-full">
          <h1 className="text-xl font-bold text-[hsl(var(--agent-text))]">Mis Prospectos</h1>
          {perms.canCreate && (
            <button
              onClick={() => {
                track({ page: 'agent_prospectos', elementId: 'btn_nuevo_prospecto' });
                setAddProspectoOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[hsl(var(--agent-primary))] text-white text-sm font-medium active:scale-95 transition-transform"
            >
              <Plus className="h-4 w-4" />
              Nuevo
            </button>
          )}
        </div>
      </AgentPortalHeader>

      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar prospecto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <UserPlus className="h-10 w-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {search ? "No se encontraron prospectos" : "Aún no tienes prospectos"}
            </p>
            {!search && perms.canCreate && (
              <button
                onClick={() => setAddProspectoOpen(true)}
                className="text-sm font-medium text-[hsl(var(--agent-primary))] hover:underline"
              >
                + Crear tu primer prospecto
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => (
              <div
                key={p.id_persona}
                className="rounded-xl bg-white border border-gray-100 shadow-sm p-3.5 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[hsl(var(--agent-text))] truncate">
                      {p.nombre_legal || p.email}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {p.email && (
                        <span className="text-xs text-[hsl(var(--agent-text-secondary))] flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          {p.email}
                        </span>
                      )}
                      {p.telefono && (
                        <span className="text-xs text-[hsl(var(--agent-text-secondary))] flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" />
                          {p.telefono}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setEditPersonaId(p.id_persona);
                      setAddProspectoOpen(true);
                    }}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Editar prospecto"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                {/* Project badges */}
                <div className="flex flex-wrap gap-1.5">
                  {p.proyectos.map(pr => (
                    <Badge key={pr.id} variant="secondary" className="text-[10px] px-2 py-0.5">
                      {pr.nombre}
                    </Badge>
                  ))}
                  {p.proyectos.length === 0 && (
                    <span className="text-[10px] text-muted-foreground">Sin proyectos asignados</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddProspectoFloatingDialog
        open={addProspectoOpen}
        onOpenChange={(v) => {
          setAddProspectoOpen(v);
          if (!v) {
            setEditPersonaId(null);
            queryClient.invalidateQueries({ queryKey: ["agent-prospectos"] });
          }
        }}
        preSelectedPersonaId={editPersonaId}
      />
    </div>
  );
};

export default AgentProspectos;
