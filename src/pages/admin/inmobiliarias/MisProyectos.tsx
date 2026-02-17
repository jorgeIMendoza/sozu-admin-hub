import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, MapPin, Image as ImageIcon, FileText, Loader2, Download, ChevronDown, ChevronUp, BedDouble, Bath, ShowerHead } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

const MisProyectos = () => {
  const { accessibleProjectIds, hasUnrestrictedAccess, isLoading: isLoadingAccess, hasNoAccess } = useProjectAccess();
  const [search, setSearch] = useState("");
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});

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
            edificios_modelos!fk_edificios_modelos_edificio (
              id,
              modelos!fk_edificios_modelos_modelo (
                id,
                nombre,
                numero_recamaras,
                numero_completo_banos,
                numero_medio_bano
              ),
              propiedades!fk_propiedades_edificio_modelo (id)
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

  const filtered = projects.filter((p: any) =>
    p.nombre?.toLowerCase().includes(search.toLowerCase())
  );

  const getPropertyCount = (project: any) =>
    project.edificios?.reduce((t: number, e: any) =>
      t + (e.edificios_modelos?.reduce((et: number, m: any) =>
        et + (m.propiedades?.length || 0), 0) || 0), 0) || 0;

  const getImageCount = (project: any) =>
    project.multimedias_proyecto?.filter((m: any) => m.es_imagen && m.activo)?.length || 0;

  const getFirstImage = (project: any) => {
    const img = project.multimedias_proyecto?.find((m: any) => m.es_imagen && m.activo);
    return img?.url || null;
  };

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
          modelsMap.set(modelo.id, modelo);
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

  if (isLoading || isLoadingAccess) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No hay proyectos disponibles</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project: any) => {
            const image = getFirstImage(project);
            const propCount = getPropertyCount(project);
            const imgCount = getImageCount(project);
            const location = getLocation(project);
            const models = getUniqueModels(project);
            const brochure = getBrochure(project.id);
            const isExpanded = expandedCards[project.id] || false;

            return (
              <Card key={project.id} className="overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
                {/* Image */}
                <div className="h-40 sm:h-48 bg-muted relative overflow-hidden">
                  {image ? (
                    <img src={image} alt={project.nombre} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  <Badge className="absolute top-3 left-3" variant="default">
                    {project.estatus_proyecto?.nombre || "Sin estatus"}
                  </Badge>
                  {brochure && (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute top-3 right-3 h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background"
                      onClick={() => handleDownloadBrochure(brochure)}
                      title="Descargar brochure"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <CardContent className="p-4 space-y-3">
                  <h3 className="font-bold text-lg text-foreground line-clamp-1">{project.nombre}</h3>
                  
                  {/* Location - clickable */}
                  <button
                    onClick={() => handleOpenMaps(project)}
                    className="flex items-center gap-1.5 text-sm text-primary hover:underline cursor-pointer"
                    title="Ver en Google Maps"
                  >
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="line-clamp-1">{location}</span>
                  </button>

                  {/* Description - expandable */}
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

                  {/* Models */}
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

                  <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      <span>{propCount} propiedades</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ImageIcon className="h-3.5 w-3.5" />
                      <span>{imgCount} fotos</span>
                    </div>
                    {brochure && (
                      <div className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        <span>Brochure</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MisProyectos;
