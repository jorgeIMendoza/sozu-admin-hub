import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, MapPin, Loader2, ChevronLeft, ChevronRight, BedDouble, Bath, ShowerHead, Star, ArrowLeft, Maximize2, Home, CheckCircle, Package } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import useEmblaCarousel from "embla-carousel-react";

const MiProyectoDetalle = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = parseInt(id || "0", 10);

  const { data: project, isLoading } = useQuery({
    queryKey: ["mi-proyecto-detalle", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select(`
          id, nombre, descripcion, direccion, publicar, latitud, longitud,
          fecha_entrega, fecha_lanzamiento,
          direccion_id_estado, direccion_id_municipio,
          id_estatus_proyecto,
          estatus_proyecto:id_estatus_proyecto (nombre),
          estados_mx:direccion_id_estado (nombre),
          municipios_mx:direccion_id_municipio (nombre),
          multimedias_proyecto (id, url, es_imagen, activo),
          edificios!fk_edificios_proyecto (
            id, nombre, fecha_lanzamiento,
            edificios_modelos!fk_edificios_modelos_edificio (
              id,
              modelos!fk_edificios_modelos_modelo (
                id, nombre, numero_recamaras, numero_completo_banos, numero_medio_bano
              ),
              propiedades!fk_propiedades_edificio_modelo (id, id_estatus_disponibilidad, precio_lista, m2_interiores, m2_exteriores)
            )
          )
        `)
        .eq("id", projectId)
        .eq("activo", true)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: projectId > 0,
  });

  // Fetch amenities
  const { data: amenidades = [] } = useQuery({
    queryKey: ["proyecto-detalle-amenidades", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amenidades_proyectos")
        .select("id, amenidades!amenidades_proyectos_id_amenidad_fkey (id, nombre, url)")
        .eq("id_proyecto", projectId)
        .eq("activo", true);
      if (error) return [];
      return data || [];
    },
    enabled: projectId > 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Proyecto no encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver
        </Button>
      </div>
    );
  }

  const images = project.multimedias_proyecto?.filter((m: any) => m.es_imagen && m.activo) || [];
  const location = [project.municipios_mx?.nombre, project.estados_mx?.nombre].filter(Boolean).join(", ") || project.direccion || "Sin ubicación";

  // Aggregate all properties
  const allProps: any[] = [];
  project.edificios?.forEach((e: any) => {
    e.edificios_modelos?.forEach((em: any) => {
      em.propiedades?.forEach((p: any) => allProps.push(p));
    });
  });
  const totalProps = allProps.length;
  const availableProps = allProps.filter((p: any) => p.id_estatus_disponibilidad === 2).length;

  // Price range
  const prices = allProps.map((p: any) => p.precio_lista).filter((v: number) => v > 0);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;

  // M2 range
  const m2Values = allProps.map((p: any) => (p.m2_interiores || 0) + (p.m2_exteriores || 0)).filter((v: number) => v > 0);
  const m2Min = m2Values.length > 0 ? Math.min(...m2Values) : null;
  const m2Max = m2Values.length > 0 ? Math.max(...m2Values) : null;

  // Beds/baths aggregated
  const modelsMap = new Map();
  project.edificios?.forEach((edificio: any) => {
    edificio.edificios_modelos?.forEach((em: any) => {
      const modelo = em.modelos;
      if (modelo && !modelsMap.has(modelo.id)) {
        const props: any[] = [];
        project.edificios?.forEach((ed: any) => {
          ed.edificios_modelos?.forEach((em2: any) => {
            if (em2.modelos?.id === modelo.id) {
              em2.propiedades?.forEach((p: any) => props.push(p));
            }
          });
        });
        const mPrices = props.map((p: any) => p.precio_lista).filter((v: number) => v > 0);
        const mM2 = props.map((p: any) => (p.m2_interiores || 0) + (p.m2_exteriores || 0)).filter((v: number) => v > 0);
        const avail = props.filter((p: any) => p.id_estatus_disponibilidad === 2).length;
        modelsMap.set(modelo.id, {
          ...modelo,
          priceMin: mPrices.length > 0 ? Math.min(...mPrices) : null,
          m2Min: mM2.length > 0 ? Math.min(...mM2) : null,
          m2Max: mM2.length > 0 ? Math.max(...mM2) : null,
          totalProps: props.length,
          availableCount: avail,
        });
      }
    });
  });
  const models = Array.from(modelsMap.values());

  const allBeds = models.map(m => m.numero_recamaras).filter(Boolean);
  const allBaths = models.map(m => m.numero_completo_banos).filter(Boolean);
  const bedsRange = allBeds.length > 0 ? (Math.min(...allBeds) === Math.max(...allBeds) ? `${Math.min(...allBeds)}` : `${Math.min(...allBeds)}-${Math.max(...allBeds)}`) : null;
  const bathsRange = allBaths.length > 0 ? (Math.min(...allBaths) === Math.max(...allBaths) ? `${Math.min(...allBaths)}` : `${Math.min(...allBaths)}-${Math.max(...allBaths)}`) : null;

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(price);

  const formatPriceShort = (price: number) => {
    if (price >= 1000000) return `${(price / 1000000).toFixed(3)}M MXN`;
    if (price >= 1000) return `${(price / 1000).toFixed(0)}K MXN`;
    return `${price.toLocaleString()} MXN`;
  };

  // Badge logic (same as MisProyectos)
  const getProjectBadge = () => {
    const today = new Date();
    const fechaEntrega = project.fecha_entrega ? new Date(project.fecha_entrega) : null;
    const fechaLanzamiento = project.fecha_lanzamiento ? new Date(project.fecha_lanzamiento) : null;
    if (fechaEntrega && today >= fechaEntrega) return { label: "Entrega Inmediata", className: "bg-green-600 text-white" };
    if (totalProps > 0 && availableProps > 0 && availableProps <= totalProps * 0.1) return { label: "Últimas Unidades", className: "bg-destructive text-destructive-foreground" };
    if (fechaLanzamiento) {
      const six = new Date(fechaLanzamiento); six.setMonth(six.getMonth() + 6);
      if (today >= fechaLanzamiento && today <= six) return { label: "Nuevo Lanzamiento", className: "bg-blue-600 text-white" };
      if (today > six && (!fechaEntrega || today < fechaEntrega)) return { label: "Preventa Exclusiva", className: "bg-amber-500 text-white" };
    }
    return { label: "Exclusiva", className: "bg-purple-600 text-white" };
  };

  const badge = getProjectBadge();

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/inmobiliarias/mis-proyectos")} className="gap-2 text-primary">
        <ArrowLeft className="h-4 w-4" /> Volver a proyectos
      </Button>

      {/* Hero Carousel */}
      <HeroCarousel images={images} projectName={project.nombre} />

      {/* Title + Badge + Price */}
      <div className="space-y-2 px-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-foreground">{project.nombre}</h1>
          <Badge className={badge.className}>{badge.label}</Badge>
        </div>
        {minPrice && (
          <p className="text-lg font-semibold text-foreground">Desde {formatPrice(minPrice)}</p>
        )}
        <button
          onClick={() => {
            if (project.latitud && project.longitud) window.open(`https://www.google.com/maps?q=${project.latitud},${project.longitud}`, "_blank");
            else if (project.direccion) window.open(`https://www.google.com/maps/search/${encodeURIComponent(project.direccion)}`, "_blank");
          }}
          className="flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <MapPin className="h-4 w-4" />
          <span>{project.direccion || location}</span>
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-1">
        {m2Min && (
          <Card>
            <CardContent className="p-4 text-center space-y-1">
              <Maximize2 className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Área</p>
              <p className="font-semibold text-sm">{m2Min === m2Max ? `${m2Min.toFixed(1)} m²` : `${m2Min.toFixed(1)}-${m2Max!.toFixed(1)} m²`}</p>
            </CardContent>
          </Card>
        )}
        {bedsRange && (
          <Card>
            <CardContent className="p-4 text-center space-y-1">
              <BedDouble className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Recámaras</p>
              <p className="font-semibold text-sm">{bedsRange}</p>
            </CardContent>
          </Card>
        )}
        {bathsRange && (
          <Card>
            <CardContent className="p-4 text-center space-y-1">
              <Bath className="h-5 w-5 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Baños</p>
              <p className="font-semibold text-sm">{bathsRange}</p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-4 text-center space-y-1">
            <Building2 className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Propiedades</p>
            <p className="font-semibold text-sm">{totalProps} total</p>
            <p className={`text-xs font-medium ${availableProps > 0 ? 'text-green-600' : 'text-destructive'}`}>{availableProps > 0 ? `${availableProps} disponibles` : 'Agotado'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {project.descripcion && (
        <div className="space-y-2 px-1">
          <h2 className="text-lg font-semibold text-foreground">Descripción</h2>
          <hr className="border-border" />
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{project.descripcion}</p>
        </div>
      )}

      {/* Amenidades */}
      {amenidades.length > 0 && (
        <div className="space-y-3 px-1">
          <h2 className="text-lg font-semibold text-foreground">Amenidades</h2>
          <hr className="border-border" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {amenidades.map((ap: any) => (
              <div key={ap.id} className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                {ap.amenidades?.url ? (
                  <img src={ap.amenidades.url} alt={ap.amenidades.nombre} className="h-7 w-7 object-contain" />
                ) : (
                  <Star className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-xs font-medium text-foreground">{ap.amenidades?.nombre}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modelos */}
      {models.length > 0 && (
        <div className="space-y-3 px-1">
          <h2 className="text-lg font-semibold text-foreground">Modelos</h2>
          <hr className="border-border" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {models.map((m: any) => (
              <Card key={m.id} className="overflow-hidden">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <h4 className="font-bold text-base text-foreground">{m.nombre}</h4>
                    {m.priceMin && (
                      <span className="text-sm font-semibold text-foreground">Desde {formatPriceShort(m.priceMin)}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    {m.m2Min != null && (
                      <span>{m.m2Min === m.m2Max ? `${m.m2Min.toFixed(1)} m²` : `${m.m2Min.toFixed(1)}-${m.m2Max.toFixed(1)} m²`}</span>
                    )}
                    {m.numero_recamaras > 0 && (
                      <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" />{m.numero_recamaras} recámara{m.numero_recamaras > 1 ? "s" : ""}</span>
                    )}
                    {m.numero_completo_banos > 0 && (
                      <span className="flex items-center gap-1"><Bath className="h-3.5 w-3.5" />{m.numero_completo_banos} baño{m.numero_completo_banos > 1 ? "s" : ""}</span>
                    )}
                  </div>
                  <div className="border-t pt-2">
                    <span className={`text-sm font-medium ${m.availableCount > 0 ? "text-green-600" : "text-amber-500"}`}>
                      {m.availableCount > 0 ? `${m.availableCount} disponibles` : "Vendido"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Inventory Button */}
      <div className="px-1">
        <Button
          className="w-full gap-2"
          size="lg"
          disabled={availableProps === 0}
          onClick={() => navigate(`/admin/inmobiliarias/mis-proyectos/${projectId}/inventario`)}
        >
          <Package className="h-5 w-5" />
          {availableProps === 0 ? "Agotado" : `Ver Inventario Disponible (${availableProps} unidades)`}
        </Button>
      </div>

      {/* Map Section */}
      {(project.latitud && project.longitud) && (
        <div className="space-y-2 px-1">
          <h2 className="text-lg font-semibold text-foreground">Ubicación</h2>
          <hr className="border-border" />
          <div className="rounded-lg overflow-hidden border h-64">
            <iframe
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${project.latitud},${project.longitud}&zoom=15`}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Hero Carousel Component
const HeroCarousel = ({ images, projectName }: { images: any[]; projectName: string }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });
  const [currentIndex, setCurrentIndex] = useState(0);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrentIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi, onSelect]);

  if (images.length === 0) {
    return (
      <div className="h-56 sm:h-72 md:h-96 bg-muted rounded-xl flex items-center justify-center">
        <Building2 className="h-16 w-16 text-muted-foreground/30" />
      </div>
    );
  }

  return (
    <div className="h-56 sm:h-72 md:h-96 bg-muted rounded-xl relative overflow-hidden group">
      <div ref={emblaRef} className="h-full overflow-hidden rounded-xl">
        <div className="flex h-full">
          {images.map((img: any) => (
            <div key={img.id} className="flex-[0_0_100%] min-w-0 h-full">
              <img src={img.url} alt={projectName} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>
      {images.length > 1 && (
        <>
          <button onClick={scrollPrev} className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={scrollNext} className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.slice(0, 8).map((_: any, i: number) => (
              <span key={i} className={`h-2 w-2 rounded-full transition-colors ${i === currentIndex ? "bg-white" : "bg-white/50"}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default MiProyectoDetalle;
