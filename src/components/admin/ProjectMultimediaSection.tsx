import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Power, PowerOff, Plus, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProjectMultimediaSectionProps {
  projectId: number;
}

export function ProjectMultimediaSection({ projectId }: ProjectMultimediaSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newMultimedia, setNewMultimedia] = useState({
    es_imagen: true,
    url: ""
  });
  const [uploading, setUploading] = useState(false);

  const { data: multimedia = [] } = useQuery({
    queryKey: ['projectMultimedia', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('multimedias_proyecto')
        .select('*')
        .eq('id_proyecto', projectId)
        .order('fecha_creacion', { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  const addMutation = useMutation({
    mutationFn: async (multimediaData: typeof newMultimedia) => {
      const { data, error } = await supabase
        .from('multimedias_proyecto')
        .insert([{
          ...multimediaData,
          id_proyecto: projectId
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectMultimedia', projectId] });
      setNewMultimedia({ es_imagen: true, url: "" });
      setIsAdding(false);
      toast({ title: "Multimedia agregado exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al agregar multimedia", variant: "destructive" });
    }
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ multimediaId, newStatus }: { multimediaId: number; newStatus: boolean }) => {
      const { error } = await supabase
        .from('multimedias_proyecto')
        .update({ activo: newStatus })
        .eq('id', multimediaId);
      
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['projectMultimedia', projectId] });
      toast({ 
        title: newStatus ? "Multimedia reactivado exitosamente" : "Multimedia inactivado exitosamente" 
      });
    },
    onError: () => {
      toast({ title: "Error al cambiar estado del multimedia", variant: "destructive" });
    }
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `projects/${projectId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('documentos')
        .getPublicUrl(filePath);

      setNewMultimedia(prev => ({ ...prev, url: data.publicUrl }));
      toast({ title: "Archivo subido exitosamente" });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({ title: "Error al subir archivo", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMultimedia.url) {
      toast({ title: "Por favor proporciona una URL o sube un archivo", variant: "destructive" });
      return;
    }
    addMutation.mutate(newMultimedia);
  };

  const isImageUrl = (url: string) => {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
  };

  const isVideoUrl = (url: string) => {
    return /\.(mp4|webm|ogg|mov|avi)$/i.test(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Multimedia del Proyecto</h3>
        <Button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Multimedia
        </Button>
      </div>

      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo Multimedia</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="tipo">Tipo de Multimedia</Label>
                <Select
                  value={newMultimedia.es_imagen ? "imagen" : "video"}
                  onValueChange={(value) => 
                    setNewMultimedia(prev => ({ ...prev, es_imagen: value === "imagen" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="imagen">Imagen</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="file">Subir Archivo</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="file"
                    type="file"
                    accept={newMultimedia.es_imagen ? "image/*" : "video/*"}
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploading}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {uploading ? "Subiendo..." : "Subir"}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="url">O ingresa URL directamente</Label>
                <Input
                  id="url"
                  type="url"
                  value={newMultimedia.url}
                  onChange={(e) => setNewMultimedia(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>

              {newMultimedia.url && (
                <div className="mt-4">
                  <Label>Vista previa:</Label>
                  <div className="mt-2 border rounded-md p-2">
                    {isImageUrl(newMultimedia.url) ? (
                      <img 
                        src={newMultimedia.url} 
                        alt="Preview" 
                        className="max-w-full h-48 object-contain"
                      />
                    ) : isVideoUrl(newMultimedia.url) ? (
                      <video 
                        src={newMultimedia.url} 
                        controls 
                        className="max-w-full h-48"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Vista previa no disponible para este tipo de archivo
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={addMutation.isPending || uploading}>
                  {addMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAdding(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {multimedia.map((item) => (
          <Card key={item.id}>
             <CardContent className="p-4">
               <div className="flex justify-between items-start mb-2">
                 <div className="flex gap-2">
                   <Badge variant="outline">
                     {item.es_imagen ? "Imagen" : "Video"}
                   </Badge>
                   <Badge variant={item.activo ? "default" : "secondary"}>
                     {item.activo ? "Activo" : "Inactivo"}
                   </Badge>
                 </div>
                 <Button
                   variant="outline"
                   size="sm"
                   onClick={() => toggleStatusMutation.mutate({ 
                     multimediaId: item.id, 
                     newStatus: !item.activo 
                   })}
                   disabled={toggleStatusMutation.isPending}
                 >
                   {item.activo ? (
                     <>
                       <PowerOff className="w-4 h-4 mr-1" />
                       Inactivar
                     </>
                   ) : (
                     <>
                       <Power className="w-4 h-4 mr-1" />
                       Reactivar
                     </>
                   )}
                 </Button>
               </div>
              
               <div className="aspect-video bg-muted rounded-md overflow-hidden">
                 {item.activo ? (
                   <>
                     {item.es_imagen && isImageUrl(item.url) ? (
                       <img 
                         src={item.url} 
                         alt="Multimedia" 
                         className="w-full h-full object-cover"
                       />
                     ) : !item.es_imagen && isVideoUrl(item.url) ? (
                       <video 
                         src={item.url} 
                         controls 
                         className="w-full h-full object-cover"
                       />
                     ) : (
                       <div className="w-full h-full flex items-center justify-center">
                         <p className="text-xs text-muted-foreground text-center p-2">
                           Vista previa no disponible
                         </p>
                       </div>
                     )}
                   </>
                 ) : (
                   <div className="w-full h-full flex items-center justify-center">
                     <p className="text-xs text-muted-foreground text-center p-2">
                       Multimedia inactivo
                     </p>
                   </div>
                 )}
               </div>
              
              <a 
                href={item.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline mt-2 block truncate"
              >
                Ver archivo original
              </a>
            </CardContent>
          </Card>
        ))}

        {multimedia.length === 0 && !isAdding && (
          <Card className="col-span-full">
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">No hay multimedia registrado</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}