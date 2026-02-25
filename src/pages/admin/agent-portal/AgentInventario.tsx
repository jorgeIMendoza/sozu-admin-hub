import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Building2, MapPin, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProyectoCard {
  id: number;
  nombre: string;
  ubicacion: string;
  imagen_url: string | null;
  precio_desde: number | null;
  unidades_disponibles: number;
  total_unidades: number;
  avance: number;
}

const AgentInventario = () => {
  const { profile } = useAuth();
  const { accessibleProjectIds, hasUnrestrictedAccess, isLoading: loadingAccess } = useProjectAccess();
  const [search, setSearch] = useState("");

  const { data: proyectos = [], isLoading: loadingData } = useQuery({
    queryKey: ['agent-inventario-proyectos', hasUnrestrictedAccess ? 'all' : accessibleProjectIds],
    queryFn: async (): Promise<ProyectoCard[]> => {
      // Fetch projects
      let query = (supabase as any)
        .from('proyectos')
        .select('id, nombre, direccion, url_imagen_portada')
        .eq('activo', true);

      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        query = query.in('id', accessibleProjectIds);
      }

      const { data: projs, error } = await query;
      if (error || !projs) return [];

      const projIds = projs.map((p: any) => p.id);
      if (projIds.length === 0) return [];

      // Fetch property counts per project (available + total)
      const { data: propiedades } = await (supabase as any)
        .from('propiedades')
        .select('id, id_estatus_disponibilidad, precio_lista, id_edificio_modelo')
        .eq('activo', true);

      // Map edificio_modelo -> proyecto
      const edModeloIds = [...new Set((propiedades || []).map((p: any) => p.id_edificio_modelo).filter(Boolean))];
      let edModeloToProj = new Map<number, number>();

      if (edModeloIds.length > 0) {
        const { data: edModelos } = await (supabase as any)
          .from('edificios_modelos')
          .select('id, id_edificio')
          .in('id', edModeloIds);
        const edificioIds = [...new Set((edModelos || []).map((em: any) => em.id_edificio).filter(Boolean))];
        if (edificioIds.length > 0) {
          const { data: edificios } = await (supabase as any)
            .from('edificios')
            .select('id, id_proyecto')
            .in('id', edificioIds);
          const edToProj = new Map<number, number>();
          (edificios || []).forEach((e: any) => edToProj.set(e.id, e.id_proyecto));
          (edModelos || []).forEach((em: any) => {
            const projId = edToProj.get(em.id_edificio);
            if (projId) edModeloToProj.set(em.id, projId);
          });
        }
      }

      // Count per project
      const projStats = new Map<number, { available: number; total: number; minPrice: number }>();
      (propiedades || []).forEach((p: any) => {
        const projId = edModeloToProj.get(p.id_edificio_modelo);
        if (!projId || !projIds.includes(projId)) return;
        const stats = projStats.get(projId) || { available: 0, total: 0, minPrice: Infinity };
        stats.total++;
        if (p.id_estatus_disponibilidad === 1) {
          stats.available++;
          if (p.precio_lista && p.precio_lista < stats.minPrice) {
            stats.minPrice = p.precio_lista;
          }
        }
        projStats.set(projId, stats);
      });

      return projs.map((p: any) => {
        const stats = projStats.get(p.id) || { available: 0, total: 0, minPrice: Infinity };
        return {
          id: p.id,
          nombre: p.nombre,
          ubicacion: p.direccion || "",
          imagen_url: p.url_imagen_portada || null,
          precio_desde: stats.minPrice === Infinity ? null : stats.minPrice,
          unidades_disponibles: stats.available,
          total_unidades: stats.total,
          avance: stats.total > 0 ? Math.round(((stats.total - stats.available) / stats.total) * 100) : 0,
        };
      }).filter((p: ProyectoCard) => p.total_unidades > 0);
    },
    enabled: !loadingAccess,
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!search) return proyectos;
    const s = search.toLowerCase();
    return proyectos.filter(p =>
      p.nombre.toLowerCase().includes(s) || p.ubicacion.toLowerCase().includes(s)
    );
  }, [proyectos, search]);

  const isLoading = loadingAccess || loadingData;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v);

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[hsl(var(--agent-bg))] px-4 pt-4 pb-3 space-y-3">
        <h1 className="text-xl font-bold text-[hsl(var(--agent-text))]">Inventario</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--agent-muted))]" />
          <Input
            placeholder="Buscar desarrollo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-white border-gray-200"
          />
        </div>
      </div>

      {/* Project List */}
      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--agent-muted))]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-[hsl(var(--agent-text-secondary))]">
            No se encontraron desarrollos
          </div>
        ) : (
          filtered.map(proyecto => (
            <ProjectCard key={proyecto.id} proyecto={proyecto} formatCurrency={formatCurrency} />
          ))
        )}
      </div>
    </div>
  );
};

function ProjectCard({ proyecto, formatCurrency }: { proyecto: ProyectoCard; formatCurrency: (v: number) => string }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      {/* Image */}
      {proyecto.imagen_url ? (
        <div className="h-36 w-full overflow-hidden">
          <img
            src={proyecto.imagen_url}
            alt={proyecto.nombre}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="h-28 w-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
          <Building2 className="h-8 w-8 text-gray-400" />
        </div>
      )}

      {/* Content */}
      <div className="p-3.5 space-y-2.5">
        <div>
          <h3 className="font-semibold text-sm text-[hsl(var(--agent-text))]">{proyecto.nombre}</h3>
          {proyecto.ubicacion && (
            <p className="text-xs text-[hsl(var(--agent-text-secondary))] flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{proyecto.ubicacion}</span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            {proyecto.precio_desde ? (
              <p className="text-xs text-[hsl(var(--agent-text-secondary))]">
                Desde <span className="font-semibold text-[hsl(var(--agent-primary))]">{formatCurrency(proyecto.precio_desde)}</span>
              </p>
            ) : (
              <p className="text-xs text-[hsl(var(--agent-text-secondary))]">Sin precio</p>
            )}
          </div>
          <Badge variant="outline" className="text-[10px] border-[hsl(var(--agent-primary))]/30 text-[hsl(var(--agent-primary))]">
            {proyecto.unidades_disponibles} disponibles
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-[hsl(var(--agent-text-secondary))]">
            <span>Avance de ventas</span>
            <span>{proyecto.avance}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[hsl(var(--agent-primary))] rounded-full transition-all"
              style={{ width: `${proyecto.avance}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentInventario;
