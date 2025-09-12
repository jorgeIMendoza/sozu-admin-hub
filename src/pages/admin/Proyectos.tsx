import { NewProjectDialog } from "@/components/admin/NewProjectDialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Edit, Trash2, Eye, Image, Video } from "lucide-react";
import { useState } from "react";
import { EditProjectDialog } from "@/components/admin/EditProjectDialog";

const Proyectos = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: activeProjects = [], refetch: refetchActive } = useQuery({
    queryKey: ["projects", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select(`
          id,
          nombre,
          descripcion,
          direccion,
          activo,
          precio_m2,
          fecha_inicio_construccion,
          id_tipo_uso,
          id_estatus_proyecto,
          direccion_id_pais,
          direccion_id_estado,
          direccion_id_municipio,
          tipos_uso:id_tipo_uso (
            nombre
          ),
          estatus_proyecto:id_estatus_proyecto (
            nombre
          ),
          paises:direccion_id_pais (
            nombre
          ),
          estados_mx:direccion_id_estado (
            nombre
          ),
          municipios_mx:direccion_id_municipio (
            nombre
          ),
          edificios (
            id,
            nombre
          ),
          multimedias_proyecto (
            id,
            url,
            es_imagen
          ),
          amenidades_proyectos (
            amenidades (
              id,
              nombre
            )
          )
        `)
        .eq("activo", true)
        .order("fecha_creacion", { ascending: false });
      
      if (error) {
        console.error("Error fetching active projects:", error);
        return [];
      }
      return data || [];
    },
  });

  const { data: deletedProjects = [], refetch: refetchDeleted } = useQuery({
    queryKey: ["projects", "deleted"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select(`
          id,
          nombre,
          descripcion,
          direccion,
          activo,
          precio_m2,
          fecha_inicio_construccion,
          id_tipo_uso,
          id_estatus_proyecto,
          direccion_id_pais,
          direccion_id_estado,
          direccion_id_municipio,
          tipos_uso:id_tipo_uso (
            nombre
          ),
          estatus_proyecto:id_estatus_proyecto (
            nombre
          ),
          paises:direccion_id_pais (
            nombre
          ),
          estados_mx:direccion_id_estado (
            nombre
          ),
          municipios_mx:direccion_id_municipio (
            nombre
          ),
          edificios (
            id,
            nombre
          ),
          multimedias_proyecto (
            id,
            url,
            es_imagen
          ),
          amenidades_proyectos (
            amenidades (
              id,
              nombre
            )
          )
        `)
        .eq("activo", false)
        .order("fecha_creacion", { ascending: false });
      
      if (error) {
        console.error("Error fetching deleted projects:", error);
        return [];
      }
      return data || [];
    },
  });


  const handleProjectAdded = () => {
    refetchActive();
  };

  const handleProjectUpdated = () => {
    refetchActive();
    refetchDeleted();
  };

  const handleProjectDeleted = () => {
    refetchActive();
    refetchDeleted();
  };

  // Filter active projects based on search term
  const filteredActiveProjects = activeProjects.filter(project =>
    project.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.direccion?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Filter deleted projects based on search term
  const filteredDeletedProjects = deletedProjects.filter(project =>
    project.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.descripcion?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.direccion?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getMultimediaCount = (project: any) => {
    const images = project.multimedias_proyecto?.filter((m: any) => m.es_imagen) || [];
    const videos = project.multimedias_proyecto?.filter((m: any) => !m.es_imagen) || [];
    return { images: images.length, videos: videos.length };
  };

  const getCityName = (project: any) => {
    if (project.municipios_mx?.nombre && project.estados_mx?.nombre) {
      return `${project.municipios_mx.nombre}, ${project.estados_mx.nombre}`;
    }
    if (project.estados_mx?.nombre) {
      return project.estados_mx.nombre;
    }
    if (project.paises?.nombre) {
      return project.paises.nombre;
    }
    return "No especificada";
  };

  const renderProjectsTable = (projects: any[], emptyMessage: string) => (
    <>
      {projects.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre del Proyecto</TableHead>
                <TableHead>Desarrollador</TableHead>
                <TableHead>Número de Departamentos</TableHead>
                <TableHead>Ciudad</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>Multimedia</TableHead>
                <TableHead>Estatus</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const multimedia = getMultimediaCount(project);
                const city = getCityName(project);
                const developer = "Por definir"; // Simplificamos por ahora
                const departmentCount = project.edificios?.length || 0;
                
                return (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">{project.nombre}</TableCell>
                    <TableCell>{developer}</TableCell>
                    <TableCell>{departmentCount}</TableCell>
                    <TableCell>{city}</TableCell>
                    <TableCell>{project.direccion || "No especificada"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {multimedia.images > 0 && (
                          <div className="flex items-center gap-1">
                            <Image className="h-4 w-4" />
                            <span className="text-sm">{multimedia.images}</span>
                          </div>
                        )}
                        {multimedia.videos > 0 && (
                          <div className="flex items-center gap-1">
                            <Video className="h-4 w-4" />
                            <span className="text-sm">{multimedia.videos}</span>
                          </div>
                        )}
                        {multimedia.images === 0 && multimedia.videos === 0 && (
                          <span className="text-muted-foreground text-sm">Sin multimedia</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={project.activo ? "default" : "secondary"}>
                        {project.estatus_proyecto?.nombre || "Sin estatus"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <EditProjectDialog
                          projectId={project.id}
                          onProjectUpdated={handleProjectUpdated}
                        />
                        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                          <Eye className="h-4 w-4 mr-1" />
                          Ver
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            {emptyMessage}
          </p>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Proyectos</h1>
          <p className="text-muted-foreground">Gestiona todos los proyectos inmobiliarios</p>
        </div>
        <NewProjectDialog onProjectAdded={handleProjectAdded} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Buscar proyectos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active">
            Proyectos Activos ({activeProjects.length})
          </TabsTrigger>
          <TabsTrigger value="deleted">
            Proyectos Eliminados ({deletedProjects.length})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="active" className="mt-6">
          {filteredActiveProjects.length === 0 && activeProjects.length > 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No se encontraron proyectos activos que coincidan con la búsqueda.
              </p>
            </div>
          ) : (
            renderProjectsTable(
              filteredActiveProjects, 
              "No hay proyectos activos disponibles."
            )
          )}
        </TabsContent>
        
        <TabsContent value="deleted" className="mt-6">
          {filteredDeletedProjects.length === 0 && deletedProjects.length > 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No se encontraron proyectos eliminados que coincidan con la búsqueda.
              </p>
            </div>
          ) : (
            renderProjectsTable(
              filteredDeletedProjects, 
              "No hay proyectos eliminados."
            )
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Proyectos;