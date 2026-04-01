import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentImpersonation } from "@/contexts/AgentImpersonationContext";
import { useAgentPortalPermissions } from "@/hooks/useAgentPortalPermissions";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Building2, MapPin, ChevronRight, Eye, Share2, Mail, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { AgentPortalHeader } from "@/components/admin/agent-portal/AgentPortalHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ProyectoCard {
  id: number;
  nombre: string;
  ubicacion: string;
  imagen_url: string | null;
  precio_desde: number | null;
  unidades_disponibles: number;
  total_unidades: number;
  avance: number;
  id_estatus_proyecto: number | null;
}

const AgentInventario = () => {
  const { profile } = useAuth();
  const { accessibleProjectIds, hasUnrestrictedAccess, isLoading: loadingAccess } = useProjectAccess();
  const { permissions } = useAgentPortalPermissions();
  const inventarioPerms = permissions['/admin/agent/inventario'];
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  // Log page view
  useEffect(() => {
    registrarVista('/admin/agent/inventario');
    track({ page: 'agent_inventario', elementId: 'page_view', elementType: 'page' });
  }, []);

  // Fetch estatus_proyecto for avance calculation
  const { data: estatusData } = useQuery({
    queryKey: ["estatus-proyecto-all"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("estatus_proyecto")
        .select("id, nombre")
        .eq("activo", true)
        .order("id");
      return data || [];
    },
  });

  const { data: proyectos = [], isLoading: loadingData } = useQuery({
    queryKey: ['agent-inventario-proyectos', hasUnrestrictedAccess ? 'all' : accessibleProjectIds],
    queryFn: async (): Promise<ProyectoCard[]> => {
      let query = (supabase as any)
        .from('proyectos')
        .select('id, nombre, direccion, url_imagen_portada, id_estatus_proyecto')
        .eq('activo', true)
        .eq('publicar', true);

      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        query = query.in('id', accessibleProjectIds);
      }

      const { data: projs, error } = await query;
      if (error || !projs) return [];

      const projIds = projs.map((p: any) => p.id);
      if (projIds.length === 0) return [];

      const { data: edificios } = await (supabase as any)
        .from('edificios')
        .select('id, id_proyecto')
        .in('id_proyecto', projIds)
        .eq('activo', true);

      if (!edificios || edificios.length === 0) return [];

      const edificioIds = edificios.map((e: any) => e.id);
      const edToProj = new Map<number, number>();
      edificios.forEach((e: any) => edToProj.set(e.id, e.id_proyecto));

      const { data: edModelos } = await (supabase as any)
        .from('edificios_modelos')
        .select('id, id_edificio')
        .in('id_edificio', edificioIds);

      if (!edModelos || edModelos.length === 0) return [];

      const edModeloIds = edModelos.map((em: any) => em.id);
      const edModeloToProj = new Map<number, number>();
      edModelos.forEach((em: any) => {
        const projId = edToProj.get(em.id_edificio);
        if (projId) edModeloToProj.set(em.id, projId);
      });

      const { data: propiedades } = await (supabase as any)
        .from('propiedades')
        .select('id, id_estatus_disponibilidad, precio_lista, id_edificio_modelo')
        .eq('activo', true)
        .eq('es_aprobado', true)
        .in('id_edificio_modelo', edModeloIds);

      const projStats = new Map<number, { available: number; total: number; minPrice: number }>();
      (propiedades || []).forEach((p: any) => {
        const projId = edModeloToProj.get(p.id_edificio_modelo);
        if (!projId || !projIds.includes(projId)) return;
        const stats = projStats.get(projId) || { available: 0, total: 0, minPrice: Infinity };
        stats.total++;
        if (p.id_estatus_disponibilidad === 2) {
          stats.available++;
          if (p.precio_lista && p.precio_lista > 0 && p.precio_lista < stats.minPrice) {
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
          avance: 0, // will be calculated with estatus_proyecto
          id_estatus_proyecto: p.id_estatus_proyecto || null,
        };
      }).filter((p: ProyectoCard) => p.total_unidades > 0);
    },
    enabled: !loadingAccess,
    staleTime: 60_000,
  });

  // Calculate avance for each project using estatus_proyecto
  const proyectosConAvance = useMemo(() => {
    const totalEstatus = estatusData?.length || 13;
    return proyectos.map(p => ({
      ...p,
      avance: p.id_estatus_proyecto && totalEstatus > 0
        ? Math.round((p.id_estatus_proyecto / totalEstatus) * 100)
        : 0,
    }));
  }, [proyectos, estatusData]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return proyectosConAvance;
    return proyectosConAvance.filter(p =>
      p.nombre.toLowerCase().includes(s)
    );
  }, [proyectosConAvance, search]);

  const isLoading = loadingAccess || loadingData;

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v);

  return (
    <div className="pb-24">
      <AgentPortalHeader showAgentName>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--agent-muted))]" />
          <Input
            placeholder="Buscar desarrollo..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              if (e.target.value.length > 0) {
                track({ page: 'agent_inventario', elementId: 'input_buscar_desarrollo', elementLabel: 'Buscar desarrollo', elementType: 'input' });
              }
            }}
            className="pl-9 h-10 rounded-xl border-[hsl(214.3_31.8%_91.4%)] bg-[hsl(0_0%_100%)] text-[hsl(222.2_84%_4.9%)] placeholder:text-[hsl(215.4_16.3%_46.9%)] placeholder:opacity-100 caret-[hsl(222.2_84%_4.9%)] shadow-sm"
            style={{ WebkitTextFillColor: "hsl(222.2 84% 4.9%)", colorScheme: "light" }}
          />
        </div>
      </AgentPortalHeader>

      <div className="px-4 space-y-3 lg:flex lg:flex-col lg:items-center">
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
            <ProjectCard
              key={proyecto.id}
              proyecto={proyecto}
              formatCurrency={formatCurrency}
              canRead={inventarioPerms.canRead}
              onViewProject={() => {
                track({ page: 'agent_inventario', elementId: 'btn_ver_desarrollo', elementLabel: 'Ver Desarrollo', metadata: { proyecto_id: proyecto.id } });
                navigate(`/admin/agent/inventario/proyecto/${proyecto.id}`);
              }}
              onViewUnits={(e) => {
                e.stopPropagation();
                track({ page: 'agent_inventario', elementId: 'btn_ver_unidades', elementLabel: 'Ver unidades', metadata: { proyecto_id: proyecto.id } });
                navigate(`/admin/agent/inventario/unidades?proyecto=${proyecto.id}`);
              }}
              track={track}
            />
          ))
        )}
      </div>
    </div>
  );
};

function ProjectCard({
  proyecto,
  formatCurrency,
  canRead,
  onViewProject,
  onViewUnits,
  track,
}: {
  proyecto: ProyectoCard;
  formatCurrency: (v: number) => string;
  canRead: boolean;
  onViewProject: () => void;
  onViewUnits: (e: React.MouseEvent) => void;
  track: (opts: any) => void;
}) {
  const isAgotado = proyecto.unidades_disponibles === 0;
  const { toast } = useToast();
  const [shareOpen, setShareOpen] = useState(false);

  const publicUrl = `https://www.sozu.com/desarrollos/${proyecto.id}`;

  const handleShare = (method: string) => {
    track({ page: 'agent_inventario', elementId: 'btn_compartir_plataforma', elementLabel: `Compartir ${method}`, metadata: { plataforma: method, proyecto_id: proyecto.id } });
    switch (method) {
      case "whatsapp":
        window.open(`https://wa.me/?text=${encodeURIComponent(`${proyecto.nombre}\n${publicUrl}`)}`, "_blank");
        break;
      case "facebook":
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`, "_blank");
        break;
      case "email":
        window.open(`mailto:?subject=${encodeURIComponent(proyecto.nombre)}&body=${encodeURIComponent(`${proyecto.nombre}\n${proyecto.ubicacion}\n${publicUrl}`)}`, "_blank");
        break;
      case "copy":
        navigator.clipboard.writeText(publicUrl);
        toast({ title: "Copiado", description: "Link copiado al portapapeles." });
        break;
    }
    setShareOpen(false);
  };

  return (
    <>
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden lg:w-[60%] lg:mx-auto">
        {/* Image with overlay */}
        <div className="relative h-44 lg:h-96 w-full overflow-hidden">
          {proyecto.imagen_url ? (
            <img
              src={proyecto.imagen_url}
              alt={proyecto.nombre}
              className="h-full w-full object-cover object-bottom"
              loading="lazy"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
              <Building2 className="h-10 w-10 text-gray-400" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

          {/* Info on image */}
          <div className="absolute bottom-0 left-0 right-0 p-3.5 flex items-end justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-sm text-white truncate">{proyecto.nombre}</h3>
              {proyecto.ubicacion && (
                <p className="text-[11px] text-white/80 flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{proyecto.ubicacion}</span>
                </p>
              )}
            </div>
            {!isAgotado && proyecto.precio_desde && (
              <div className="ml-2 flex-shrink-0 bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1">
                <p className="text-[10px] text-gray-500 leading-none">Desde</p>
                <p className="text-xs font-bold text-gray-900 leading-tight">{formatCurrency(proyecto.precio_desde)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Content side */}
        <div>

        {/* Stats row */}
        <div className="px-3.5 py-2.5 flex items-center justify-between border-b border-gray-50">
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[11px] text-muted-foreground">Disponibles</p>
              <p className={cn(
                "text-sm font-bold",
                isAgotado ? "text-muted-foreground" : "text-foreground"
              )}>
                {isAgotado ? "Agotado" : proyecto.unidades_disponibles}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Avance</p>
              <p className="text-sm font-bold text-foreground">{proyecto.avance}%</p>
            </div>
          </div>

          {!isAgotado && canRead && (
            <button
              onClick={onViewUnits}
              className="flex items-center gap-1 text-xs font-semibold text-[hsl(var(--agent-primary))] hover:underline"
            >
              Ver unidades
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-3.5 py-2.5 flex items-center gap-2">
          {canRead && (
            <button
              onClick={onViewProject}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2 text-xs font-medium text-foreground hover:bg-gray-50 transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              Ver Desarrollo
            </button>
          )}
          {canRead && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                track({ page: 'agent_inventario', elementId: 'btn_compartir', elementLabel: 'Compartir', metadata: { proyecto_id: proyecto.id } });
                setShareOpen(true);
              }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[hsl(var(--agent-primary))] py-2 text-xs font-medium text-white hover:opacity-90 transition-opacity"
            >
              <Share2 className="h-3.5 w-3.5" />
              Compartir
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Compartir — {proyecto.nombre}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline" className="gap-2 justify-start" onClick={() => handleShare("whatsapp")}>
              <svg className="h-5 w-5 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </Button>
            <Button variant="outline" className="gap-2 justify-start" onClick={() => handleShare("facebook")}>
              <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Facebook
            </Button>
            <Button variant="outline" className="gap-2 justify-start" onClick={() => handleShare("email")}>
              <Mail className="h-5 w-5 text-muted-foreground" />
              Correo
            </Button>
            <Button variant="outline" className="gap-2 justify-start" onClick={() => handleShare("copy")}>
              <Copy className="h-5 w-5 text-muted-foreground" />
              Copiar link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AgentInventario;
