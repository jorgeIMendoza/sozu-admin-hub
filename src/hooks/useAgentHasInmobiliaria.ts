import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns true if the logged-in agent has a linked inmobiliaria
 * (entidades_relacionadas with id_tipo_entidad = 19).
 */
export function useAgentHasInmobiliaria() {
  const { profile } = useAuth();
  const personaId = profile?.id_persona;

  const { data: hasInmobiliaria = false, isLoading } = useQuery({
    queryKey: ["agent-has-inmobiliaria", personaId],
    queryFn: async () => {
      if (!personaId) return false;
      const { data } = await (supabase as any)
        .from("entidades_relacionadas")
        .select("id")
        .eq("id_persona", personaId)
        .eq("id_tipo_entidad", 19)
        .eq("activo", true)
        .limit(1);
      return (data && data.length > 0) || false;
    },
    enabled: !!personaId,
    staleTime: 5 * 60_000,
  });

  return { hasInmobiliaria, isLoading };
}
