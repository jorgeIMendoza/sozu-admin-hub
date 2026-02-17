import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjectAccess } from "@/hooks/useProjectAccess";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, MapPin, Image as ImageIcon, FileText, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const MisProyectos = () => {
  const { accessibleProjectIds, hasUnrestrictedAccess, isLoading: isLoadingAccess, hasNoAccess } = useProjectAccess();
  const [search, setSearch] = useState("");

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
          direccion_id_estado,
          direccion_id_municipio,
          id_estatus_proyecto,
          estatus_proyecto:id_estatus_proyecto (nombre),
          estados_mx:direccion_id_estado (nombre),
          municipios_mx:direccion_id_municipio (nombre),
          multimedias_proyecto (id, url, es_imagen, activo),
          edificios!fk_edificios_proyecto (
            id,
            edificios_modelos!fk_edificios_modelos_edificio (
              id,
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
                </div>

                <CardContent className="p-4 space-y-3">
                  <h3 className="font-bold text-lg text-foreground line-clamp-1">{project.nombre}</h3>
                  
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="line-clamp-1">{location}</span>
                  </div>

                  {project.descripcion && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{project.descripcion}</p>
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
