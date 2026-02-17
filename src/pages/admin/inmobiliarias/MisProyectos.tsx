import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, MapPin, Loader2, Download, ChevronDown, ChevronUp, BedDouble, Bath, ShowerHead, Share2, Star, ChevronLeft, ChevronRight, Copy, Mail, X, Maximize2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import useEmblaCarousel from "embla-carousel-react";

const MisProyectos = () => {
  const { accessibleProjectIds, hasUnrestrictedAccess, isLoading: isLoadingAccess, hasNoAccess } = useProjectAccess();
  const [search, setSearch] = useState("");
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});
  const [modelosDialog, setModelosDialog] = useState<{ open: boolean; project: any }>({ open: false, project: null });
  const [amenidadesDialog, setAmenidadesDialog] = useState<{ open: boolean; projectId: number | null }>({ open: false, projectId: null });
  const [shareDialog, setShareDialog] = useState<{ open: boolean; project: any }>({ open: false, project: null });

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["mis-proyectos", accessibleProjectIds],
    queryFn: async () => {
      if (hasNoAccess) return [];

      let query = supabase
        .from("proyectos")
        .select(`
          id,
          nombre,
          descripcion,
          direccion,
          publicar,
          latitud,
          longitud,
          fecha_entrega,
          fecha_lanzamiento,
          direccion_id_estado,
          direccion_id_municipio,
          id_estatus_proyecto,
          estatus_proyecto:id_estatus_proyecto (nombre),
          estados_mx:direccion_id_estado (nombre),
          municipios_mx:direccion_id_municipio (nombre),
          multimedias_proyecto (id, url, es_imagen, activo),
          edificios!fk_edificios_proyecto (
            id,
            nombre,
            fecha_lanzamiento,
            edificios_modelos!fk_edificios_modelos_edificio (
              id,
              modelos!fk_edificios_modelos_modelo (
                id,
                nombre,
                numero_recamaras,
                numero_completo_banos,
                numero_medio_bano
              ),
              propiedades!fk_propiedades_edificio_modelo (id, id_estatus_disponibilidad, precio_lista, m2_interiores, m2_exteriores)
            )
          )
        `)
        .eq("activo", true)
        .eq("publicar", true);

      if (!hasUnrestrictedAccess && accessibleProjectIds.length > 0) {
        query = query.in("id", accessibleProjectIds);
      }

      const { data, error } = await query.order("nombre");
      if (error) {
        console.error("Error fetching projects:", error);
        return [];
      }
      return data || [];
    },
    enabled: !isLoadingAccess,
  });

  // Fetch brochures for all projects
  const projectIds = projects.map((p: any) => p.id);
  const { data: brochures = [] } = useQuery({
    queryKey: ["mis-proyectos-brochures", projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return [];
      const { data, error } = await supabase
        .from("documentos")
        .select("id, url, id_proyecto")
        .eq("id_tipo_documento", 30)
        .eq("activo", true)
        .in("id_proyecto", projectIds);
      if (error) {
        console.error("Error fetching brochures:", error);
        return [];
      }
      return data || [];
    },
    enabled: projectIds.length > 0,
  });

  // Fetch amenities for the dialog
  const { data: amenidades = [] } = useQuery({
    queryKey: ["mis-proyectos-amenidades", amenidadesDialog.projectId],
    queryFn: async () => {
      if (!amenidadesDialog.projectId) return [];
      const { data, error } = await supabase
        .from("amenidades_proyectos")
        .select("id, amenidades!amenidades_proyectos_id_amenidad_fkey (id, nombre, url)")
        .eq("id_proyecto", amenidadesDialog.projectId)
        .eq("activo", true);
      if (error) {
        console.error("Error fetching amenidades:", error);
        return [];
      }
      return data || [];
    },
    enabled: !!amenidadesDialog.projectId,
  });

  const filtered = projects.filter((p: any) =>
    p.nombre?.toLowerCase().includes(search.toLowerCase())
  );

  const getAllProperties = (project: any) => {
    const props: any[] = [];
    project.edificios?.forEach((e: any) => {
      e.edificios_modelos?.forEach((m: any) => {
        m.propiedades?.forEach((p: any) => props.push(p));
      });
    });
    return props;
  };

  const getPropertyCount = (project: any) => getAllProperties(project).length;

  const getAvailableCount = (project: any) =>
    getAllProperties(project).filter((p: any) => p.id_estatus_disponibilidad === 2).length;

  const getEarliestLaunchDate = (project: any): Date | null => {
    if (project.fecha_lanzamiento) return new Date(project.fecha_lanzamiento);
    const dates = project.edificios
      ?.map((e: any) => e.fecha_lanzamiento)
      .filter(Boolean)
      .map((d: string) => new Date(d));
    if (!dates || dates.length === 0) return null;
    return new Date(Math.min(...dates.map((d: Date) => d.getTime())));
  };

  const getProjectBadge = (project: any): { label: string; className: string } => {
    const today = new Date();
    const totalProps = getPropertyCount(project);
    const availableProps = getAvailableCount(project);
    const fechaEntrega = project.fecha_entrega ? new Date(project.fecha_entrega) : null;
    const fechaLanzamiento = project.fecha_lanzamiento ? new Date(project.fecha_lanzamiento) : null;

    if (fechaEntrega && today >= fechaEntrega) {
      return { label: "Entrega Inmediata", className: "bg-green-600 text-white border-green-600" };
    }
    if (totalProps > 0 && availableProps > 0 && availableProps <= totalProps * 0.1) {
      return { label: "Últimas Unidades", className: "bg-destructive text-destructive-foreground border-destructive" };
    }
    if (fechaLanzamiento) {
      const sixMonthsAfterLaunch = new Date(fechaLanzamiento);
      sixMonthsAfterLaunch.setMonth(sixMonthsAfterLaunch.getMonth() + 6);
      if (today >= fechaLanzamiento && today <= sixMonthsAfterLaunch) {
        return { label: "Nuevo Lanzamiento", className: "bg-blue-600 text-white border-blue-600" };
      }
      if (today > sixMonthsAfterLaunch && (!fechaEntrega || today < fechaEntrega)) {
        return { label: "Preventa Exclusiva", className: "bg-amber-500 text-white border-amber-500" };
      }
    }
    return { label: "Exclusiva", className: "bg-purple-600 text-white border-purple-600" };
  };

  const getImages = (project: any) =>
    project.multimedias_proyecto?.filter((m: any) => m.es_imagen && m.activo) || [];

  const getLocation = (project: any) => {
    if (project.municipios_mx?.nombre && project.estados_mx?.nombre)
      return `${project.municipios_mx.nombre}, ${project.estados_mx.nombre}`;
    return project.estados_mx?.nombre || "Sin ubicación";
  };

  const getUniqueModels = (project: any) => {
    const modelsMap = new Map();
    project.edificios?.forEach((edificio: any) => {
      edificio.edificios_modelos?.forEach((em: any) => {
        const modelo = em.modelos;
        if (modelo && !modelsMap.has(modelo.id)) {
          // Collect all properties for this model to compute m2 range and price
          const props: any[] = [];
          project.edificios?.forEach((ed: any) => {
            ed.edificios_modelos?.forEach((em2: any) => {
              if (em2.modelos?.id === modelo.id) {
                em2.propiedades?.forEach((p: any) => props.push(p));
              }
            });
          });

          const m2Values = props.map((p: any) => (p.m2_interiores || 0) + (p.m2_exteriores || 0)).filter((v: number) => v > 0);
          const prices = props.map((p: any) => p.precio_lista).filter((v: number) => v > 0);
          const availableProps = props.filter((p: any) => p.id_estatus_disponibilidad === 2);

          modelsMap.set(modelo.id, {
            ...modelo,
            m2Min: m2Values.length > 0 ? Math.min(...m2Values) : null,
            m2Max: m2Values.length > 0 ? Math.max(...m2Values) : null,
            priceMin: prices.length > 0 ? Math.min(...prices) : null,
            totalProps: props.length,
            availableCount: availableProps.length,
          });
        }
      });
    });
    return Array.from(modelsMap.values());
  };

  const getBrochure = (projectId: number) =>
    brochures.find((b: any) => b.id_proyecto === projectId);

  const handleOpenMaps = (project: any) => {
    if (project.latitud && project.longitud) {
      window.open(`https://www.google.com/maps?q=${project.latitud},${project.longitud}`, "_blank");
    } else if (project.direccion) {
      window.open(`https://www.google.com/maps/search/${encodeURIComponent(project.direccion)}`, "_blank");
    } else {
      toast.info("No hay ubicación disponible para este proyecto");
    }
  };

  const handleDownloadBrochure = (brochure: any) => {
    if (brochure?.url) {
      window.open(brochure.url, "_blank");
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatPrice = (price: number) => {
    if (price >= 1000000) return `${(price / 1000000).toFixed(3)}M MXN`;
    if (price >= 1000) return `${(price / 1000).toFixed(0)}K MXN`;
    return `${price.toLocaleString()} MXN`;
  };

  const getShareUrl = (projectId: number) => `https://www.sozu.com/desarrollos/${projectId}`;

  const handleShare = (platform: string, project: any) => {
    const url = getShareUrl(project.id);
    const text = `¡Conoce ${project.nombre}! ${project.descripcion?.substring(0, 100) || ""}`;

    switch (platform) {
      case "whatsapp":
        window.open(`https://wa.me/?text=${encodeURIComponent(text + " " + url)}`, "_blank");
        break;
      case "facebook":
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank");
        break;
      case "email":
        window.open(`mailto:?subject=${encodeURIComponent(`Proyecto: ${project.nombre}`)}&body=${encodeURIComponent(text + "\n\n" + url)}`, "_blank");
        break;
      case "copy":
        navigator.clipboard.writeText(url).then(() => toast.success("Link copiado al portapapeles"));
        break;
    }
    setShareDialog({ open: false, project: null });
  };

  if (isLoading || isLoadingAccess) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { profile } = useAuth();
  const isSimplifiedRole = ["Agente Inmobiliario", "Inmobiliaria"].includes(profile?.rol_nombre ?? "");

  return (
    <div className="space-y-6">
      {!isSimplifiedRole && (
        <>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Mis Proyectos</h1>
            <p className="text-muted-foreground text-sm">Proyectos disponibles para comercialización</p>
          </div>

          <Input
            placeholder="Buscar proyecto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No hay proyectos disponibles</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project: any) => {
            const images = getImages(project);
            const propCount = getPropertyCount(project);
            const location = getLocation(project);
            const models = getUniqueModels(project);
            const brochure = getBrochure(project.id);
            const isExpanded = expandedCards[project.id] || false;

            return (
              <Card key={project.id} className="overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
                {/* Image Carousel */}
                <ImageCarousel images={images} projectName={project.nombre} badge={getProjectBadge(project)} brochure={brochure} onDownloadBrochure={handleDownloadBrochure} />

                <CardContent className="p-4 space-y-3">
                  <h3 className="font-bold text-lg text-foreground line-clamp-1">{project.nombre}</h3>

                  {/* Location */}
                  <button
                    onClick={() => handleOpenMaps(project)}
                    className="flex items-center gap-1.5 text-sm text-primary hover:underline cursor-pointer"
                    title="Ver en Google Maps"
                  >
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="line-clamp-1">{location}</span>
                  </button>

                  {/* Description */}
                  {project.descripcion && (
                    <div>
                      <p className={`text-sm text-muted-foreground ${isExpanded ? '' : 'line-clamp-2'}`}>
                        {project.descripcion}
                      </p>
                      {project.descripcion.length > 100 && (
                        <button
                          onClick={() => toggleExpand(project.id)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                        >
                          {isExpanded ? (
                            <>Ver menos <ChevronUp className="h-3 w-3" /></>
                          ) : (
                            <>Ver más <ChevronDown className="h-3 w-3" /></>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Models badges */}
                  {models.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-foreground">Modelos</p>
                      <div className="flex flex-wrap gap-1.5">
                        {models.map((m: any) => (
                          <Badge key={m.id} variant="outline" className="text-[11px] gap-1 px-1.5 py-0.5">
                            <span className="font-medium">{m.nombre}</span>
                            <span className="text-muted-foreground flex items-center gap-0.5">
                              {m.numero_recamaras > 0 && (
                                <span className="flex items-center gap-0.5" title="Recámaras">
                                  <BedDouble className="h-2.5 w-2.5" />{m.numero_recamaras}
                                </span>
                              )}
                              {m.numero_completo_banos > 0 && (
                                <span className="flex items-center gap-0.5 ml-0.5" title="Baños">
                                  <Bath className="h-2.5 w-2.5" />{m.numero_completo_banos}
                                </span>
                              )}
                              {m.numero_medio_bano > 0 && (
                                <span className="flex items-center gap-0.5 ml-0.5" title="Medios baños">
                                  <ShowerHead className="h-2.5 w-2.5" />{m.numero_medio_bano}
                                </span>
                              )}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Footer: propiedades count */}
                  <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      <span>{propCount} propiedades</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => setModelosDialog({ open: true, project })}
                    >
                      <Maximize2 className="h-3 w-3" />
                      Modelos
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => setAmenidadesDialog({ open: true, projectId: project.id })}
                    >
                      <Star className="h-3 w-3" />
                      Amenidades
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs gap-1"
                      onClick={() => setShareDialog({ open: true, project })}
                    >
                      <Share2 className="h-3 w-3" />
                      Compartir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modelos Dialog */}
      <Dialog open={modelosDialog.open} onOpenChange={(open) => setModelosDialog({ open, project: open ? modelosDialog.project : null })}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modelos — {modelosDialog.project?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {modelosDialog.project && getUniqueModels(modelosDialog.project).map((m: any) => (
              <div key={m.id} className="rounded-xl bg-slate-900 text-white p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <h4 className="font-bold text-lg">{m.nombre}</h4>
                  {m.priceMin && (
                    <span className="text-sm font-semibold text-right">Desde {formatPrice(m.priceMin)}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-slate-300">
                  {m.m2Min != null && (
                    <span>{m.m2Min === m.m2Max ? `${m.m2Min.toFixed(2)} m²` : `${m.m2Min.toFixed(2)}-${m.m2Max.toFixed(2)} m²`}</span>
                  )}
                  {m.numero_recamaras > 0 && (
                    <span className="flex items-center gap-1">
                      <BedDouble className="h-3.5 w-3.5" />{m.numero_recamaras} recámara{m.numero_recamaras > 1 ? 's' : ''}
                    </span>
                  )}
                  {m.numero_completo_banos > 0 && (
                    <span className="flex items-center gap-1">
                      <Bath className="h-3.5 w-3.5" />{m.numero_completo_banos} baño{m.numero_completo_banos > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="border-t border-slate-700 pt-2">
                  <span className={`text-sm ${m.availableCount > 0 ? 'text-green-400' : 'text-amber-400'}`}>
                    {m.availableCount > 0 ? `${m.availableCount} disponibles` : 'Vendido'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Amenidades Dialog */}
      <Dialog open={amenidadesDialog.open} onOpenChange={(open) => setAmenidadesDialog({ open, projectId: open ? amenidadesDialog.projectId : null })}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Amenidades</DialogTitle>
          </DialogHeader>
          {amenidades.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">No hay amenidades registradas para este proyecto</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
              {amenidades.map((ap: any) => (
                <div key={ap.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
                  {ap.amenidades?.url ? (
                    <img src={ap.amenidades.url} alt={ap.amenidades.nombre} className="h-8 w-8 object-contain" />
                  ) : (
                    <Star className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium text-foreground">{ap.amenidades?.nombre}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={shareDialog.open} onOpenChange={(open) => setShareDialog({ open, project: open ? shareDialog.project : null })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Compartir — {shareDialog.project?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline" className="gap-2 justify-start" onClick={() => shareDialog.project && handleShare("whatsapp", shareDialog.project)}>
              <svg className="h-5 w-5 text-green-500" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </Button>
            <Button variant="outline" className="gap-2 justify-start" onClick={() => shareDialog.project && handleShare("facebook", shareDialog.project)}>
              <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Facebook
            </Button>
            <Button variant="outline" className="gap-2 justify-start" onClick={() => shareDialog.project && handleShare("email", shareDialog.project)}>
              <Mail className="h-5 w-5 text-muted-foreground" />
              Correo
            </Button>
            <Button variant="outline" className="gap-2 justify-start" onClick={() => shareDialog.project && handleShare("copy", shareDialog.project)}>
              <Copy className="h-5 w-5 text-muted-foreground" />
              Copiar link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Carousel sub-component
const ImageCarousel = ({ images, projectName, badge, brochure, onDownloadBrochure }: {
  images: any[];
  projectName: string;
  badge: { label: string; className: string };
  brochure: any;
  onDownloadBrochure: (b: any) => void;
}) => {
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
      <div className="h-40 sm:h-48 bg-muted relative overflow-hidden flex items-center justify-center">
        <Building2 className="h-12 w-12 text-muted-foreground/30" />
        <Badge className={`absolute top-3 left-3 ${badge.className}`}>{badge.label}</Badge>
        {brochure && (
          <Button size="icon" variant="secondary" className="absolute top-3 right-3 h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background" onClick={() => onDownloadBrochure(brochure)} title="Descargar brochure">
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="h-40 sm:h-48 bg-muted relative overflow-hidden group">
      <div ref={emblaRef} className="h-full overflow-hidden">
        <div className="flex h-full">
          {images.map((img: any) => (
            <div key={img.id} className="flex-[0_0_100%] min-w-0 h-full">
              <img src={img.url} alt={projectName} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      </div>

      {/* Navigation arrows */}
      {images.length > 1 && (
        <>
          <button onClick={scrollPrev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={scrollNext} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight className="h-4 w-4" />
          </button>
          {/* Dots */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {images.slice(0, 5).map((_: any, i: number) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === currentIndex ? 'bg-white' : 'bg-white/50'}`} />
            ))}
          </div>
        </>
      )}

      <Badge className={`absolute top-3 left-3 ${badge.className}`}>{badge.label}</Badge>
      {brochure && (
        <Button size="icon" variant="secondary" className="absolute top-3 right-3 h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background" onClick={() => onDownloadBrochure(brochure)} title="Descargar brochure">
          <Download className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default MisProyectos;
