import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Power, PowerOff, Plus, Upload, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProjectMultimediaSectionProps {
  projectId: number;
}

export function ProjectMultimediaSection({ projectId }: ProjectMultimediaSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingYoutube, setIsAddingYoutube] = useState(false);
  const [confirmYoutubeOpen, setConfirmYoutubeOpen] = useState(false);
  const [newMultimedia, setNewMultimedia] = useState({
    es_imagen: true,
    url: ""
  });
  const [youtubeForm, setYoutubeForm] = useState({
    nombre: '',
    link: ''
  });
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

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

  const { data: youtubeVideos = [] } = useQuery({
    queryKey: ['projectYoutubeVideos', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('videos_youtube')
        .select('*')
        .eq('id_proyecto', projectId)
        .is('id_propiedad', null)
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

  const addYoutubeMutation = useMutation({
    mutationFn: async (videoData: typeof youtubeForm) => {
      const { data, error } = await supabase
        .from('videos_youtube')
        .insert([{
          nombre: videoData.nombre,
          link: videoData.link,
          id_proyecto: projectId,
          id_propiedad: null,
          activo: true
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectYoutubeVideos', projectId] });
      setYoutubeForm({ nombre: '', link: '' });
      setIsAddingYoutube(false);
      toast({ title: "Video de YouTube agregado exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al agregar video de YouTube", variant: "destructive" });
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

  const toggleYoutubeStatusMutation = useMutation({
    mutationFn: async ({ videoId, newStatus }: { videoId: number; newStatus: boolean }) => {
      const { error } = await supabase
        .from('videos_youtube')
        .update({ activo: newStatus })
        .eq('id', videoId);
      
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['projectYoutubeVideos', projectId] });
      toast({ 
        title: newStatus ? "Video reactivado exitosamente" : "Video inactivado exitosamente" 
      });
    },
    onError: () => {
      toast({ title: "Error al cambiar estado del video", variant: "destructive" });
    }
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length > 10) {
      toast({ 
        title: "Límite excedido", 
        description: "Solo puedes subir hasta 10 archivos a la vez",
        variant: "destructive" 
      });
      return;
    }

    setSelectedFiles(files);
    toast({ title: `${files.length} archivo(s) seleccionado(s)` });
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    
    if (selectedFiles.length === 0 && !newMultimedia.url) {
      toast({ title: "Por favor selecciona archivos o proporciona una URL", variant: "destructive" });
      return;
    }

    if (selectedFiles.length > 0) {
      // Bulk upload
      setUploading(true);
      
      const uploadPromises = selectedFiles.map(async (file) => {
        try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `projects/${projectId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('documentos')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data } = supabase.storage
            .from('documentos')
            .getPublicUrl(filePath);

          const { error: insertError } = await supabase
            .from('multimedias_proyecto')
            .insert([{
              es_imagen: file.type.startsWith('image/'),
              url: data.publicUrl,
              id_proyecto: projectId
            }]);

          if (insertError) throw insertError;
          return { success: true, fileName: file.name };
        } catch (error) {
          console.error('Error uploading file:', file.name, error);
          return { success: false, fileName: file.name };
        }
      });

      const results = await Promise.allSettled(uploadPromises);
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

      queryClient.invalidateQueries({ queryKey: ['projectMultimedia', projectId] });
      setSelectedFiles([]);
      setNewMultimedia({ es_imagen: true, url: "" });
      setIsAdding(false);
      setUploading(false);

      toast({
        title: `Proceso completado`,
        description: `${successful} archivo(s) agregado(s) exitosamente${failed > 0 ? `. ${failed} fallaron` : ''}`
      });
    } else {
      // Single URL submission
      addMutation.mutate(newMultimedia);
    }
  };

  const handleYoutubeSubmit = () => {
    if (!youtubeForm.nombre.trim() || !youtubeForm.link.trim()) {
      toast({ title: "Debes completar todos los campos", variant: "destructive" });
      return;
    }
    addYoutubeMutation.mutate(youtubeForm);
  };

  const getYouTubeEmbedUrl = (url: string) => {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? `https://www.youtube.com/embed/${match[1]}` : url;
  };

  const isImageUrl = (url: string) => {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
  };

  const isVideoUrl = (url: string) => {
    return /\.(mp4|webm|ogg|mov|avi)$/i.test(url);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="multimedia" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="multimedia">Multimedia</TabsTrigger>
          <TabsTrigger value="youtube">Videos YouTube (avances de obra)</TabsTrigger>
        </TabsList>

        <TabsContent value="multimedia" className="space-y-4">
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
                <CardTitle>Multimedia del Proyecto</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
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
                    <Label htmlFor="file">Subir Archivos (máximo 10)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="file"
                        type="file"
                        accept={newMultimedia.es_imagen ? "image/*" : "video/*"}
                        onChange={handleFileUpload}
                        disabled={uploading}
                        multiple
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

                  {selectedFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>{selectedFiles.length} archivo(s) seleccionado(s) (máximo 10)</Label>
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setSelectedFiles([])}
                        >
                          Eliminar todos
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                        {selectedFiles.map((file, index) => (
                          <div key={index} className="relative border rounded-md p-2">
                            <div className="aspect-square bg-muted rounded overflow-hidden mb-1">
                              {file.type.startsWith('image/') ? (
                                <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
                              ) : (
                                <video src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                              )}
                            </div>
                            <p className="text-xs truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute top-1 right-1 h-6 w-6"
                              onClick={() => handleRemoveFile(index)}
                            >
                              ✕
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="url">O ingresa URL directamente</Label>
                    <Input
                      id="url"
                      type="url"
                      value={newMultimedia.url}
                      onChange={(e) => setNewMultimedia(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="https://..."
                      disabled={selectedFiles.length > 0}
                    />
                  </div>

                  {newMultimedia.url && selectedFiles.length === 0 && (
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
                    <Button 
                      type="button"
                      onClick={handleSubmit}
                      disabled={addMutation.isPending || uploading}
                    >
                      {addMutation.isPending || uploading ? "Guardando..." : "Guardar"}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setIsAdding(false);
                        setSelectedFiles([]);
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
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
                        type="button"
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
                      {item.es_imagen && isImageUrl(item.url) ? (
                        <img 
                          src={item.url} 
                          alt="Multimedia" 
                          className={`w-full h-full object-cover ${!item.activo ? 'grayscale opacity-50' : ''}`}
                        />
                      ) : !item.es_imagen && isVideoUrl(item.url) ? (
                        <video 
                          src={item.url} 
                          controls={item.activo}
                          className={`w-full h-full object-cover ${!item.activo ? 'grayscale opacity-50' : ''}`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <p className="text-xs text-muted-foreground text-center p-2">
                            Vista previa no disponible
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
        </TabsContent>

        <TabsContent value="youtube" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Videos de YouTube</h3>
            <Button
              onClick={() => setIsAddingYoutube(true)}
              disabled={isAddingYoutube}
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Video YouTube
            </Button>
          </div>

          {isAddingYoutube && (
            <Card>
              <CardHeader>
                <CardTitle>Agregar Video de YouTube</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="titulo">Título</Label>
                    <Input
                      id="titulo"
                      value={youtubeForm.nombre}
                      onChange={(e) => setYoutubeForm({...youtubeForm, nombre: e.target.value})}
                      placeholder="Título del video"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="youtube-url">URL de YouTube</Label>
                    <Input
                      id="youtube-url"
                      value={youtubeForm.link}
                      onChange={(e) => setYoutubeForm({...youtubeForm, link: e.target.value})}
                      placeholder="https://www.youtube.com/watch?v=..."
                      required
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      type="button"
                      onClick={handleYoutubeSubmit}
                      disabled={addYoutubeMutation.isPending}
                    >
                      {addYoutubeMutation.isPending ? 'Agregando...' : 'Agregar Video'}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsAddingYoutube(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {youtubeVideos.map((video) => (
              <Card key={video.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Play className="h-4 w-4" />
                    <h4 className="font-semibold truncate">{video.nombre}</h4>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant={video.activo ? "default" : "secondary"}>
                      {video.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => toggleYoutubeStatusMutation.mutate({ 
                        videoId: video.id, 
                        newStatus: !video.activo 
                      })}
                      disabled={toggleYoutubeStatusMutation.isPending}
                    >
                      {video.activo ? 'Desactivar' : 'Activar'}
                    </Button>
                  </div>
                  <a 
                    href={video.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Ver en YouTube
                  </a>
                  {video.activo && (
                    <div className="mt-2">
                      <iframe
                        src={getYouTubeEmbedUrl(video.link)}
                        className="w-full h-48 rounded-md"
                        allowFullScreen
                        title={video.nombre}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {youtubeVideos.length === 0 && !isAddingYoutube && (
              <Card className="col-span-full">
                <CardContent className="p-6 text-center">
                  <p className="text-muted-foreground">No hay videos de YouTube registrados</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}