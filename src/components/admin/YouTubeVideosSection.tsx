import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Power, PowerOff, Plus, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface YouTubeVideosSectionProps {
  projectId: number;
}

export function YouTubeVideosSection({ projectId }: YouTubeVideosSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newVideo, setNewVideo] = useState({
    nombre: "",
    link: ""
  });

  const { data: videos = [] } = useQuery({
    queryKey: ['youtubeVideos', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('videos_youtube')
        .select('*')
        .eq('id_proyecto', projectId)
        .order('fecha_creacion', { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  const addMutation = useMutation({
    mutationFn: async (videoData: typeof newVideo) => {
      const { data, error } = await supabase
        .from('videos_youtube')
        .insert([{
          ...videoData,
          id_proyecto: projectId
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['youtubeVideos', projectId] });
      setNewVideo({ nombre: "", link: "" });
      setIsAdding(false);
      toast({ title: "Video de YouTube agregado exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al agregar video", variant: "destructive" });
    }
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ videoId, newStatus }: { videoId: number; newStatus: boolean }) => {
      const { error } = await supabase
        .from('videos_youtube')
        .update({ activo: newStatus })
        .eq('id', videoId);
      
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['youtubeVideos', projectId] });
      toast({ 
        title: newStatus ? "Video reactivado exitosamente" : "Video inactivado exitosamente" 
      });
    },
    onError: () => {
      toast({ title: "Error al cambiar estado del video", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideo.nombre || !newVideo.link) {
      toast({ title: "Por favor completa los campos requeridos", variant: "destructive" });
      return;
    }
    
    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!youtubeRegex.test(newVideo.link)) {
      toast({ title: "Por favor ingresa una URL válida de YouTube", variant: "destructive" });
      return;
    }
    
    addMutation.mutate(newVideo);
  };

  const getYouTubeEmbedUrl = (url: string) => {
    const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Videos de YouTube</h3>
        <Button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Video
        </Button>
      </div>

      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo Video de YouTube</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="nombre">Título *</Label>
                <Input
                  id="nombre"
                  value={newVideo.nombre}
                  onChange={(e) => setNewVideo(prev => ({ ...prev, nombre: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="link">URL de YouTube *</Label>
                <Input
                  id="link"
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={newVideo.link}
                  onChange={(e) => setNewVideo(prev => ({ ...prev, link: e.target.value }))}
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={addMutation.isPending}>
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

      <div className="grid gap-4">
        {videos.map((video) => {
          const embedUrl = getYouTubeEmbedUrl(video.link);
          return (
            <Card key={video.id}>
              <CardContent className="p-4">
                 <div className="flex justify-between items-start mb-4">
                   <div className="space-y-2 flex-1">
                     <div className="flex items-center gap-2">
                       <h4 className="font-semibold">{video.nombre}</h4>
                       <Badge variant={video.activo ? "default" : "secondary"}>
                         {video.activo ? "Activo" : "Inactivo"}
                       </Badge>
                     </div>
                     <div className="flex items-center gap-2">
                       <a 
                         href={video.link} 
                         target="_blank" 
                         rel="noopener noreferrer"
                         className="text-primary hover:underline flex items-center gap-1"
                       >
                         Ver en YouTube <ExternalLink className="w-3 h-3" />
                       </a>
                     </div>
                   </div>
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={() => toggleStatusMutation.mutate({ 
                       videoId: video.id, 
                       newStatus: !video.activo 
                     })}
                     disabled={toggleStatusMutation.isPending}
                   >
                     {video.activo ? (
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
                 
                 {embedUrl && video.activo && (
                   <div className="aspect-video">
                     <iframe
                       src={embedUrl}
                       title={video.nombre}
                       frameBorder="0"
                       allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                       allowFullScreen
                       className="w-full h-full rounded-md"
                     ></iframe>
                   </div>
                 )}
                 
                 {!video.activo && (
                   <div className="aspect-video bg-muted rounded-md flex items-center justify-center">
                     <p className="text-muted-foreground">Video inactivo</p>
                   </div>
                 )}
              </CardContent>
            </Card>
          );
        })}

        {videos.length === 0 && !isAdding && (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">No hay videos de YouTube registrados</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}