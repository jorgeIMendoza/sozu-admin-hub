import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInmobiliariaPersonaId } from "@/hooks/useInmobiliariaPersonaId";

export interface InmobAgent {
  email: string;
  personaId: number;
  nombre: string;
  telefono: string;
  clavePaisTelefono: string;
  activo: boolean;
}

/**
 * Fetches agents linked to the current user's inmobiliaria via entidades_relacionadas (tipo 19).
 * Reusable across all Portal Inmobiliaria pages.
 */
export function useInmobAgents() {
  const { personaId } = useInmobiliariaPersonaId();

  return useQuery({
    queryKey: ["inmob-agents-full", personaId],
    queryFn: async (): Promise<InmobAgent[]> => {
      if (!personaId) return [];

      // Get agent persona IDs linked to this inmobiliaria
      const { data: rels } = await supabase
        .from("entidades_relacionadas")
        .select("id_persona")
        .eq("id_persona_duena_lead", personaId)
        .eq("id_tipo_entidad", 19)
        .eq("activo", true) as any;

      if (!rels || rels.length === 0) return [];

      const pIds = rels.map((r: any) => r.id_persona).filter(Boolean) as number[];

      // Get user emails
      const { data: usuarios } = await supabase
        .from("usuarios")
        .select("email, id_persona, activo")
        .in("id_persona", pIds) as any;

      if (!usuarios || usuarios.length === 0) return [];

      // Get persona details
      const { data: personas } = await supabase
        .from("personas")
        .select("id, nombre_legal, nombre_comercial, telefono, clave_pais_telefono")
        .in("id", pIds) as any;

      const personaMap = new Map<number, any>();
      (personas || []).forEach((p: any) => personaMap.set(p.id, p));

      return usuarios.map((u: any) => {
        const p = personaMap.get(u.id_persona);
        return {
          email: u.email,
          personaId: u.id_persona,
          nombre: p?.nombre_legal || p?.nombre_comercial || u.email,
          telefono: p?.telefono || "",
          clavePaisTelefono: p?.clave_pais_telefono || "",
          activo: u.activo ?? true,
        };
      });
    },
    enabled: !!personaId,
    staleTime: 5 * 60_000,
  });
}
