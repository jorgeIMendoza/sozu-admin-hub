import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EntidadDueno {
  nombre_legal: string;
  er_ids: number[];
}

export function useEntidadesDuenos() {
  return useQuery({
    queryKey: ['entidades-duenos'],
    queryFn: async (): Promise<EntidadDueno[]> => {
      const { data, error } = await supabase.rpc('get_entidades_duenos' as any);
      if (error) {
        // Fallback: query directly
        const { data: raw, error: rawError } = await supabase
          .from('propiedades')
          .select('id_entidad_relacionada_dueno, entidades_relacionadas!fk_propiedades_entidad_rel(id, personas!fk_entrel_persona(nombre_legal))')
          .eq('activo', true)
          .not('id_entidad_relacionada_dueno', 'is', null) as any;

        if (rawError) throw rawError;

        const map = new Map<string, Set<number>>();
        for (const row of (raw || [])) {
          const er = row.entidades_relacionadas;
          if (!er?.personas?.nombre_legal) continue;
          const name = er.personas.nombre_legal;
          if (!map.has(name)) map.set(name, new Set());
          map.get(name)!.add(er.id);
        }

        return Array.from(map.entries())
          .map(([nombre_legal, ids]) => ({ nombre_legal, er_ids: Array.from(ids) }))
          .sort((a, b) => a.nombre_legal.localeCompare(b.nombre_legal));
      }
      return data as unknown as EntidadDueno[];
    },
    staleTime: 30 * 60 * 1000,
  });
}
