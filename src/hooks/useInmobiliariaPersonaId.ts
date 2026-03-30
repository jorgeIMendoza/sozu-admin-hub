import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInmobiliariaImpersonation } from "@/contexts/InmobiliariaImpersonationContext";

/**
 * Resolves inmobiliaria persona ID for the current user.
 * If a Super Admin is impersonating an inmobiliaria, returns that personaId directly.
 */
// Sozu (Real Estate Ventures) persona ID — used as default for Super Admin
const SOZU_PERSONA_ID = 186;

export function useInmobiliariaPersonaId() {
  const { profile } = useAuth();
  const { impersonatedInmobiliariaPersonaId, isImpersonating } = useInmobiliariaImpersonation();

  // If impersonating, return immediately
  if (isImpersonating && impersonatedInmobiliariaPersonaId) {
    return {
      personaId: impersonatedInmobiliariaPersonaId,
      isLoading: false,
    };
  }

  const directId = profile?.id_persona;
  const email = profile?.email;
  const isInmobRole = profile?.rol_nombre === "Inmobiliaria";
  const isSuperAdmin = profile?.rol_id === 1;

  const { data: resolvedId, isLoading } = useQuery({
    queryKey: ["inmob-persona-id-resolve", email],
    queryFn: async (): Promise<number | null> => {
      if (!email) return null;

      // Super Admin → behave as Sozu inmobiliaria
      if (isSuperAdmin) return SOZU_PERSONA_ID;

      // Step 0: If user's own persona IS an inmobiliaria, use it directly
      if (directId) {
        const { data: directInmob } = await (supabase as any)
          .from('entidades_relacionadas')
          .select('id_persona')
          .eq('id_persona', directId)
          .eq('id_tipo_entidad', 5)
          .eq('activo', true)
          .maybeSingle();

        if (directInmob?.id_persona) {
          return directInmob.id_persona;
        }
      }

      // 1) Resolve from active project ownership links (preferred source of truth)
      const { data: accesos } = await (supabase as any)
        .from("proyectos_acceso")
        .select("id_entidad_relacionada_dueno")
        .eq("usuario_id", email)
        .eq("activo", true)
        .not("id_entidad_relacionada_dueno", "is", null);

      const ownerEntidadIds = [...new Set((accesos || []).map((a: any) => a.id_entidad_relacionada_dueno).filter(Boolean))];
      if (ownerEntidadIds.length > 0) {
        const { data: ownerEntidades } = await (supabase as any)
          .from("entidades_relacionadas")
          .select("id, id_persona")
          .in("id", ownerEntidadIds)
          .eq("id_tipo_entidad", 5)
          .eq("activo", true);

        const ownerPersonaIds = [...new Set((ownerEntidades || []).map((e: any) => e.id_persona).filter(Boolean))];
        if (ownerPersonaIds.length > 0) {
          const entidadToPersona = new Map<number, number>();
          (ownerEntidades || []).forEach((e: any) => entidadToPersona.set(e.id, e.id_persona));
          const freq = new Map<number, number>();
          (accesos || []).forEach((a: any) => {
            const pId = entidadToPersona.get(a.id_entidad_relacionada_dueno);
            if (pId) freq.set(pId, (freq.get(pId) || 0) + 1);
          });
          const ordered = [...freq.entries()].sort((a, b) => b[1] - a[1]);
          if (ordered.length > 0) return Number(ordered[0][0]);
          return Number(ownerPersonaIds[0]);
        }
      }

      // 2) Fallback: find a primary inmob user sharing project access
      const { data: myProjects } = await (supabase as any)
        .from("proyectos_acceso")
        .select("proyecto_id")
        .eq("usuario_id", email)
        .eq("activo", true);

      if (myProjects && myProjects.length > 0) {
        const projIds = myProjects.map((p: any) => p.proyecto_id);
        const { data: sharedAccess } = await (supabase as any)
          .from("proyectos_acceso")
          .select("usuario_id")
          .in("proyecto_id", projIds)
          .eq("activo", true)
          .neq("usuario_id", email);

        if (sharedAccess && sharedAccess.length > 0) {
          const otherEmails = [...new Set(sharedAccess.map((s: any) => s.usuario_id))] as string[];
          const { data: primaryUsers } = await (supabase as any)
            .from("usuarios")
            .select("id_persona")
            .in("email", otherEmails)
            .eq("rol_id", 4)
            .not("id_persona", "is", null)
            .limit(1);

          if (primaryUsers && primaryUsers.length > 0) {
            return primaryUsers[0].id_persona;
          }
        }
      }

      return null;
    },
    enabled: (isInmobRole || isSuperAdmin) && !!email,
    staleTime: 10 * 60_000,
  });

  return {
    personaId: resolvedId ?? directId ?? null,
    isLoading: (isInmobRole || isSuperAdmin) ? isLoading : false,
  };
}

