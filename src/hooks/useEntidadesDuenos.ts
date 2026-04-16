import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useProyectosCobranza } from './useCobranzaDashboard';

export interface EntidadDueno {
  nombre_legal: string;
  er_ids: number[];
}

// Tipos de entidad considerados "dueños" del proyecto:
// 4 = Dueño Vendedor, 15 = Aportante
const TIPOS_DUENO = [4, 15];

/**
 * Devuelve las entidades legales (Dueño Vendedor / Aportante) asociadas
 * a los proyectos a los que el usuario logueado (o impersonado) tiene acceso.
 */
export function useEntidadesDuenos() {
  const { data: proyectos } = useProyectosCobranza();
  const proyectoIds = (proyectos ?? []).map((p: any) => p.id as number);

  return useQuery({
    queryKey: ['entidades-duenos-proyectos', proyectoIds.sort().join(',')],
    enabled: proyectoIds.length > 0,
    queryFn: async (): Promise<EntidadDueno[]> => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('id, id_persona, id_tipo_entidad, id_proyecto, personas!fk_entrel_persona(nombre_legal)')
        .eq('activo', true)
        .in('id_tipo_entidad', TIPOS_DUENO)
        .in('id_proyecto', proyectoIds) as any;

      if (error) throw error;

      const map = new Map<string, Set<number>>();
      for (const row of (data || [])) {
        const name = row?.personas?.nombre_legal;
        if (!name) continue;
        if (!map.has(name)) map.set(name, new Set());
        map.get(name)!.add(row.id);
      }

      return Array.from(map.entries())
        .map(([nombre_legal, ids]) => ({ nombre_legal, er_ids: Array.from(ids) }))
        .sort((a, b) => a.nombre_legal.localeCompare(b.nombre_legal));
    },
    staleTime: 30 * 60 * 1000,
  });
}
