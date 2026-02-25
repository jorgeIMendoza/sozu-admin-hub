import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AgentPortalHeader } from "@/components/admin/agent-portal/AgentPortalHeader";
import { Building2, MapPin, ArrowLeft, Calendar, Loader2, Download, Share2, ChevronRight, HardHat, Image as ImageIcon, Maximize2, BedDouble, Bath, Mail, Copy, Dumbbell, Car, TreePine, Shield, Coffee, Waves, Warehouse, ShoppingBag, PersonStanding, Clapperboard, Sofa, Dog, Bike, Baby, Utensils, Gamepad2, BookOpen, Wind, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { GoogleMapComponent } from "@/components/admin/GoogleMapComponent";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Map amenity names to minimalist Lucide icons
const amenityIconMap: Record<string, any> = {
  'alberca': Waves, 'piscina': Waves, 'pool': Waves, 'infinity': Waves,
  'gimnasio': Dumbbell, 'gym': Dumbbell,
  'estacionamiento': Car, 'parking': Car, 'cajón': Car,
  'jardín': TreePine, 'jardines': TreePine, 'áreas verdes': TreePine,
  'seguridad': Shield, 'vigilancia': Shield,
  'lounge': Coffee, 'bar': Coffee, 'café': Coffee,
  'bodega': Warehouse, 'almacén': Warehouse,
  'comercial': ShoppingBag, 'área comercial': ShoppingBag,
  'yoga': PersonStanding, 'meditación': PersonStanding,
  'cine': Clapperboard, 'sala de cine': Clapperboard,
  'coworking': Sofa, 'centro de negocios': Sofa,
  'pet': Dog, 'mascotas': Dog, 'dog park': Dog,
  'bicicleta': Bike, 'ciclopista': Bike,
  'kids': Baby, 'infantil': Baby, 'juegos': Baby,
  'asador': Utensils, 'grill': Utensils, 'terraza': Utensils,
  'ludoteca': Gamepad2, 'game': Gamepad2,
  'biblioteca': BookOpen, 'reading': BookOpen,
  'lobby': Building2, 'roof': Wind, 'rooftop': Wind,
  'spa': Sparkles, 'sauna': Sparkles, 'vapor': Sparkles,
};

function getAmenityIcon(name: string) {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(amenityIconMap)) {
    if (lower.includes(key)) return icon;
  }
  return Star;
}

const AgentProyectoDetalle = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id || "0");
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  const publicUrl = `https://www.sozu.com/desarrollos/${projectId}`;

  const handleShareMethod = (method: string) => {
    const name = project?.nombre || "";
    switch (method) {
      case "whatsapp":
        window.open(`https://wa.me/?text=${encodeURIComponent(`${name}\n${publicUrl}`)}`, "_blank");
        break;
      case "facebook":
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`, "_blank");
        break;
      case "email":
        window.open(`mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(`${name}\n${project?.direccion || ''}\n${publicUrl}`)}`, "_blank");
        break;
      case "copy":
        navigator.clipboard.writeText(publicUrl);
        toast({ title: "Copiado", description: "Link copiado al portapapeles." });
        break;
    }
    setShareOpen(false);
  };

  // Fetch project data
  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ["agent-proyecto-detalle", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("proyectos")
        .select("id, nombre, descripcion, direccion, url_imagen_portada, fecha_entrega, fecha_entrega_proyecto, fecha_inicio_construccion, id_estatus_proyecto, latitud, longitud")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: projectId > 0,
  });

  // Fetch estatus_proyecto for avance calculation
  const { data: estatusData } = useQuery({
    queryKey: ["estatus-proyecto-all"],
    queryFn: async () => {
      const { data: allEstatus } = await (supabase as any)
        .from("estatus_proyecto")
        .select("id, nombre")
        .eq("activo", true)
        .order("id");
      return allEstatus || [];
    },
  });

  // Calculate avance from estatus
  const totalEstatus = estatusData?.length || 13;
  const idEstatus = project?.id_estatus_proyecto || 0;
  const avanceObra = totalEstatus > 0 ? Math.round((idEstatus / totalEstatus) * 100) : 0;
  const nombreEstatus = estatusData?.find((e: any) => e.id === idEstatus)?.nombre || "";

  // Fetch amenidades
  const { data: amenidades = [] } = useQuery({
    queryKey: ["agent-proyecto-amenidades", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("amenidades_proyectos")
        .select("amenidades(id, nombre, url)")
        .eq("id_proyecto", projectId)
        .eq("activo", true);
      if (error) throw error;
      return (data || []).map((a: any) => a.amenidades).filter(Boolean);
    },
    enabled: projectId > 0,
  });

  // Fetch stats (available/total)
  const { data: stats } = useQuery({
    queryKey: ["agent-proyecto-stats", projectId],
    queryFn: async () => {
      const { data: edificios } = await (supabase as any)
        .from("edificios").select("id").eq("id_proyecto", projectId).eq("activo", true);
      if (!edificios?.length) return { available: 0, total: 0 };

      const edIds = edificios.map((e: any) => e.id);
      const { data: edModelos } = await (supabase as any)
        .from("edificios_modelos").select("id").in("id_edificio", edIds);
      if (!edModelos?.length) return { available: 0, total: 0 };

      const emIds = edModelos.map((em: any) => em.id);
      const { data: props } = await (supabase as any)
        .from("propiedades")
        .select("id, id_estatus_disponibilidad")
        .eq("activo", true).eq("es_aprobado", true)
        .in("id_edificio_modelo", emIds);

      let available = 0, total = 0;
      (props || []).forEach((p: any) => {
        total++;
        if (p.id_estatus_disponibilidad === 2) available++;
      });
      return { available, total };
    },
    enabled: projectId > 0,
  });

  // Fetch puntos de interés
  const { data: puntosInteres = [] } = useQuery({
    queryKey: ["agent-puntos-interes", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("puntos_interes_proyecto")
        .select("*")
        .eq("id_proyecto", projectId)
        .eq("activo", true)
        .order("fecha_creacion");
      if (error) throw error;
      return data || [];
    },
    enabled: projectId > 0,
  });

  // Fetch brochure & ficha técnica
  const { data: documentos = [] } = useQuery({
    queryKey: ["agent-proyecto-docs", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("documentos")
        .select("id, url, id_tipo_documento")
        .eq("id_proyecto", projectId)
        .in("id_tipo_documento", [30, 49])
        .eq("activo", true);
      if (error) throw error;
      return data || [];
    },
    enabled: projectId > 0,
  });

  // Fetch galería multimedia (images)
  const { data: multimedia = [] } = useQuery({
    queryKey: ["agent-proyecto-multimedia", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("multimedias_proyecto")
        .select("id, url")
        .eq("id_proyecto", projectId)
        .eq("activo", true)
        .eq("es_imagen", true);
      if (error) throw error;
      return data || [];
    },
    enabled: projectId > 0,
  });

  // Fetch most recent YouTube video
  const { data: latestVideo } = useQuery({
    queryKey: ["agent-proyecto-latest-video", projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("videos_youtube")
        .select("id, link, nombre")
        .eq("id_proyecto", projectId)
        .eq("activo", true)
        .order("fecha_creacion", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: projectId > 0,
  });

  // Fetch modelos del proyecto with m2 and price
  const { data: modelos = [] } = useQuery({
    queryKey: ["agent-proyecto-modelos", projectId],
    queryFn: async () => {
      // Get edificios for this project
      const { data: edificios } = await (supabase as any)
        .from("edificios").select("id").eq("id_proyecto", projectId).eq("activo", true);
      if (!edificios?.length) return [];

      const edIds = edificios.map((e: any) => e.id);

      // Get edificios_modelos with modelo info
      const { data: edModelos, error: emError } = await (supabase as any)
        .from("edificios_modelos")
        .select("id, id_modelo, id_edificio, modelos!fk_edificios_modelos_modelo(id, nombre, numero_recamaras, numero_completo_banos, numero_medio_bano)")
        .in("id_edificio", edIds);

      if (emError) { console.error("edModelos error:", emError); return []; }
      if (!edModelos?.length) return [];

      // Get min price and m2 per modelo from propiedades
      const emIds = edModelos.map((em: any) => em.id);
      const { data: props } = await (supabase as any)
        .from("propiedades")
        .select("id, precio_lista, m2_construccion, id_edificio_modelo, id_estatus_disponibilidad")
        .eq("activo", true)
        .eq("es_aprobado", true)
        .in("id_edificio_modelo", emIds);

      // Group by modelo
      const modeloMap = new Map<number, { modelo: any; minPrice: number; m2: number; emIds: number[] }>();
      edModelos.forEach((em: any) => {
        if (!em.modelos) return;
        const mid = em.modelos.id;
        if (!modeloMap.has(mid)) {
          modeloMap.set(mid, { modelo: em.modelos, minPrice: Infinity, m2: 0, emIds: [] });
        }
        modeloMap.get(mid)!.emIds.push(em.id);
      });

      (props || []).forEach((p: any) => {
        const em = edModelos.find((e: any) => e.id === p.id_edificio_modelo);
        if (!em?.modelos) return;
        const entry = modeloMap.get(em.modelos.id);
        if (!entry) return;
        if (p.id_estatus_disponibilidad === 2 && p.precio_lista > 0 && p.precio_lista < entry.minPrice) {
          entry.minPrice = p.precio_lista;
        }
        if (p.m2_construccion > 0 && (entry.m2 === 0 || p.m2_construccion < entry.m2)) {
          entry.m2 = p.m2_construccion;
        }
      });

      return Array.from(modeloMap.values()).map(v => ({
        ...v.modelo,
        minPrice: v.minPrice === Infinity ? null : v.minPrice,
        m2: v.m2 || null,
      }));
    },
    enabled: projectId > 0,
  });

  const brochure = documentos.find((d: any) => d.id_tipo_documento === 30);
  const fichaTecnica = documentos.find((d: any) => d.id_tipo_documento === 49);

  const getYoutubeEmbedUrl = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v);

  if (loadingProject) {
    return (
      <div className="pb-24">
        <AgentPortalHeader />
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="pb-24">
        <AgentPortalHeader />
        <div className="text-center py-12 text-sm text-muted-foreground">Proyecto no encontrado</div>
      </div>
    );
  }

  return (
    <div className="pb-24 bg-[hsl(var(--agent-bg))]">
      {/* Hero image */}
      <div className="relative h-56 w-full overflow-hidden">
        {project.url_imagen_portada ? (
          <img src={project.url_imagen_portada} alt={project.nombre} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
            <Building2 className="h-12 w-12 text-gray-400" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Back button */}
        <button onClick={() => navigate(-1)} className="absolute top-4 left-4 h-9 w-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm">
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>

        {/* Avance badge — positioned above project name with spacing */}
        {avanceObra > 0 && (
          <div className="absolute bottom-20 left-4 bg-[hsl(var(--agent-primary))] rounded-lg px-3 py-1.5 flex items-center gap-1.5 shadow-sm">
            <HardHat className="h-3.5 w-3.5 text-white" />
            <span className="text-xs font-semibold text-white">{avanceObra}% avance de obra</span>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h1 className="font-bold text-xl text-white leading-tight">{project.nombre}</h1>
          {project.direccion && (
            <p className="text-xs text-white/80 flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3 flex-shrink-0" /> <span className="line-clamp-2">{project.direccion}</span>
            </p>
          )}
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="px-4 -mt-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 grid grid-cols-2 divide-x divide-gray-100">
            <div className="text-center py-3">
              <p className="text-lg font-bold text-foreground">{stats.available}</p>
              <p className="text-[11px] text-muted-foreground">Disponibles</p>
            </div>
            <div className="text-center py-3">
              <p className="text-lg font-bold text-foreground">{stats.total}</p>
              <p className="text-[11px] text-muted-foreground">Total unidades</p>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 mt-5 space-y-6">
        {/* Concepto */}
        {project.descripcion && (
          <section>
            <h2 className="text-xs font-semibold text-[hsl(var(--agent-primary))] tracking-widest uppercase mb-2">Concepto</h2>
            <p className="text-sm text-foreground leading-relaxed">{project.descripcion}</p>
          </section>
        )}

        {/* Fecha de entrega */}
        {(project.fecha_entrega || project.fecha_entrega_proyecto) && (
          <section>
            <div className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-4">
              <div className="h-10 w-10 rounded-full bg-[hsl(var(--agent-primary))]/10 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-5 w-5 text-[hsl(var(--agent-primary))]" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Fecha de entrega</p>
                <p className="text-sm font-semibold text-foreground">
                  {new Date(project.fecha_entrega || project.fecha_entrega_proyecto).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Amenidades */}
        {amenidades.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-[hsl(var(--agent-primary))] tracking-widest uppercase mb-3">Amenidades</h2>
            <div className="grid grid-cols-3 gap-2">
              {amenidades.map((a: any) => {
                const AmenityIcon = getAmenityIcon(a.nombre);
                return (
                  <div key={a.id} className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
                    <div className="h-10 w-10 mx-auto mb-1.5 rounded-full bg-[hsl(var(--agent-primary))]/10 flex items-center justify-center">
                      <AmenityIcon className="h-5 w-5 text-[hsl(var(--agent-primary))]" />
                    </div>
                    <p className="text-[11px] text-foreground font-medium leading-tight">{a.nombre}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Avance de obra */}
        {avanceObra > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-[hsl(var(--agent-primary))] tracking-widest uppercase mb-3">Avance de obra</h2>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-2xl font-bold text-foreground">{avanceObra}%</span>
                <span className="text-[11px] text-muted-foreground">{nombreEstatus}</span>
              </div>
              <Progress value={avanceObra} className="h-2 mt-2" />
            </div>
          </section>
        )}

        {/* Video de avance de obra (most recent) */}
        {latestVideo && (() => {
          const embedUrl = getYoutubeEmbedUrl(latestVideo.link);
          if (!embedUrl) return null;
          return (
            <section>
              <h2 className="text-xs font-semibold text-[hsl(var(--agent-primary))] tracking-widest uppercase mb-3">Video de avance</h2>
              {latestVideo.nombre && <p className="text-sm font-medium text-foreground mb-2">{latestVideo.nombre}</p>}
              <div className="rounded-xl overflow-hidden border border-gray-100">
                <iframe src={embedUrl} className="w-full aspect-video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            </section>
          );
        })()}

        {/* Galería */}
        {multimedia.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-[hsl(var(--agent-primary))] tracking-widest uppercase mb-3">Galería</h2>
            <div className="relative rounded-xl overflow-hidden border border-gray-100 mb-2">
              <img
                src={multimedia[selectedImageIdx]?.url}
                alt=""
                className="w-full aspect-[16/10] object-cover"
                loading="lazy"
              />
              <div className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1 flex items-center gap-1 text-xs font-medium text-gray-700">
                <ImageIcon className="h-3.5 w-3.5" />
                {selectedImageIdx + 1}/{multimedia.length}
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {multimedia.map((m: any, idx: number) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedImageIdx(idx)}
                  className={`h-16 w-20 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${
                    idx === selectedImageIdx ? 'border-[hsl(var(--agent-primary))]' : 'border-transparent opacity-70'
                  }`}
                >
                  <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Ubicación */}
        {(project.direccion || (project.latitud && project.longitud)) && (
          <section>
            <h2 className="text-xs font-semibold text-[hsl(var(--agent-primary))] tracking-widest uppercase mb-3">Ubicación</h2>
            {project.latitud && project.longitud && (
              <div className="rounded-xl overflow-hidden border border-gray-100 mb-3">
                <GoogleMapComponent
                  onLocationSelect={() => {}}
                  initialLocation={{ lat: project.latitud, lng: project.longitud }}
                  readOnly
                />
              </div>
            )}
            {project.direccion && (
              <p className="text-sm text-foreground flex items-start gap-1.5">
                <MapPin className="h-4 w-4 text-[hsl(var(--agent-primary))] flex-shrink-0 mt-0.5" />
                {project.direccion}
              </p>
            )}
          </section>
        )}

        {/* Puntos de interés */}
        {puntosInteres.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-[hsl(var(--agent-primary))] tracking-widest uppercase mb-3">Puntos de interés</h2>
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-100">
              {puntosInteres.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-foreground">{p.nombre}</span>
                  <span className="text-xs text-muted-foreground font-medium">
                    {p.distancia_km < 1 ? `${(p.distancia_km * 1000).toFixed(0)} m` : `${p.distancia_km} km`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Modelos */}
        {modelos.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-[hsl(var(--agent-primary))] tracking-widest uppercase mb-3">Modelos</h2>
            <div className="space-y-3">
              {modelos.map((m: any) => (
                <div key={m.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-base font-bold text-foreground">{m.nombre}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {m.m2 && (
                          <span className="flex items-center gap-1">
                            <Maximize2 className="h-3 w-3" />
                            {m.m2} m²
                          </span>
                        )}
                        {m.numero_recamaras > 0 && (
                          <span className="flex items-center gap-1">
                            <BedDouble className="h-3 w-3" />
                            {m.numero_recamaras} rec
                          </span>
                        )}
                        {m.numero_completo_banos > 0 && (
                          <span className="flex items-center gap-1">
                            <Bath className="h-3 w-3" />
                            {m.numero_completo_banos} baños
                          </span>
                        )}
                      </div>
                    </div>
                    {m.minPrice && (
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-[10px] text-muted-foreground">Desde</p>
                        <p className="text-base font-bold text-foreground italic">{formatCurrency(m.minPrice)}</p>
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <button
                      onClick={() => navigate(`/admin/agent/inventario/proyecto/${projectId}/unidades?modelo=${m.id}`)}
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-foreground hover:bg-gray-50 transition-colors"
                    >
                      Ver unidades
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Material comercial */}
        {(brochure || fichaTecnica) && (
          <section>
            <h2 className="text-xs font-semibold text-[hsl(var(--agent-primary))] tracking-widest uppercase mb-3">Material comercial</h2>
            <div className="space-y-2">
              {brochure && (
                <div
                  className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between cursor-pointer active:bg-gray-50"
                  onClick={() => window.open(brochure.url, '_blank')}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-[hsl(var(--agent-primary))]/10 flex items-center justify-center">
                      <Download className="h-5 w-5 text-[hsl(var(--agent-primary))]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Brochure</p>
                      <p className="text-[11px] text-muted-foreground">PDF · Presentación del proyecto</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              {fichaTecnica && (
                <div
                  className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between cursor-pointer active:bg-gray-50"
                  onClick={() => window.open(fichaTecnica.url, '_blank')}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-[hsl(var(--agent-primary))]/10 flex items-center justify-center">
                      <Download className="h-5 w-5 text-[hsl(var(--agent-primary))]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Ficha técnica</p>
                      <p className="text-[11px] text-muted-foreground">PDF · Especificaciones</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          </section>
        )}

        {/* CTA: Generar oferta comercial */}
        <section className="bg-[hsl(var(--agent-primary))]/10 rounded-2xl p-5 text-center">
          <p className="text-sm font-semibold text-foreground mb-3">¿Tu cliente está interesado en este proyecto?</p>
          <Button
            onClick={() => navigate(`/admin/agent/inventario/proyecto/${projectId}/unidades`)}
            className="w-full bg-[hsl(var(--agent-primary))] hover:bg-[hsl(var(--agent-primary))]/90 text-white rounded-xl h-12 text-sm font-semibold"
          >
            <Share2 className="h-4 w-4 mr-2" />
            Generar oferta comercial
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Las ofertas permiten dar seguimiento formal al interés del cliente.
          </p>
        </section>

        {/* Compartir proyecto — same modal as inventory card */}
        <div className="flex justify-center pb-4">
          <Button variant="outline" onClick={() => setShareOpen(true)} className="rounded-xl">
            <Share2 className="h-4 w-4 mr-2" />
            Compartir proyecto
          </Button>
        </div>
      </div>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Compartir — {project.nombre}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline" className="gap-2 justify-start" onClick={() => handleShareMethod("whatsapp")}>
              <svg className="h-5 w-5 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </Button>
            <Button variant="outline" className="gap-2 justify-start" onClick={() => handleShareMethod("facebook")}>
              <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Facebook
            </Button>
            <Button variant="outline" className="gap-2 justify-start" onClick={() => handleShareMethod("email")}>
              <Mail className="h-5 w-5 text-muted-foreground" />
              Correo
            </Button>
            <Button variant="outline" className="gap-2 justify-start" onClick={() => handleShareMethod("copy")}>
              <Copy className="h-5 w-5 text-muted-foreground" />
              Copiar link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AgentProyectoDetalle;
