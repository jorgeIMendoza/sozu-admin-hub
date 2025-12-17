import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ExternalLink, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PropertyYouTubeVideosSectionProps {
  propertyId: number;
}

export function PropertyYouTubeVideosSection({ propertyId }: PropertyYouTubeVideosSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newVideo, setNewVideo] = useState({
    nombre: "",
    link: ""
  });

  const { data: videos = [] } = useQuery({
    queryKey: ['propertyYoutubeVideos', propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data, error } = await supabase
        .from('videos_youtube')
        .select('*')
        .eq('id_propiedad', propertyId)
        .eq('activo', true)
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
          id_propiedad: propertyId,
          id_proyecto: null,
          activo: true
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propertyYoutubeVideos', propertyId] });
      setNewVideo({ nombre: "", link: "" });
      setIsAdding(false);
      toast({ title: "Video de YouTube agregado exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al agregar video de YouTube", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (videoId: number) => {
      const { error } = await supabase
        .from('videos_youtube')
        .update({ activo: false })
        .eq('id', videoId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propertyYoutubeVideos', propertyId] });
      toast({ title: "Video eliminado exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al eliminar video", variant: "destructive" });
    }
  });

  const handleAdd = () => {
    if (!newVideo.nombre.trim() || !newVideo.link.trim()) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos",
        variant: "destructive"
      });
      return;
    }
    addMutation.mutate(newVideo);
  };

  if (videos.length === 0 && !isAdding) {
    return (
      <div className="text-center py-6">
        <p className="text-muted-foreground mb-4">No hay videos de YouTube agregados</p>
        <Button onClick={() => setIsAdding(true)} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Agregar Video
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {videos.map((video) => (
        <div key={video.id} className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <div>
              <p className="font-medium">{video.nombre}</p>
              <p className="text-sm text-muted-foreground">{video.link}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(video.link, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => deleteMutation.mutate(video.id)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      {isAdding && (
        <div className="p-4 border rounded-lg bg-muted/50">
          <div className="space-y-4">
            <div>
              <Label htmlFor="video-name">Nombre del Video</Label>
              <Input
                id="video-name"
                value={newVideo.nombre}
                onChange={(e) => setNewVideo(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="Nombre descriptivo del video"
              />
            </div>
            <div>
              <Label htmlFor="video-link">Link de YouTube</Label>
              <Input
                id="video-link"
                value={newVideo.link}
                onChange={(e) => setNewVideo(prev => ({ ...prev, link: e.target.value }))}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={addMutation.isPending}>
                {addMutation.isPending ? "Agregando..." : "Agregar"}
              </Button>
              <Button variant="outline" onClick={() => setIsAdding(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {!isAdding && (
        <Button onClick={() => setIsAdding(true)} variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Agregar Video
        </Button>
      )}
    </div>
  );
}