import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, Plus, Upload, Play, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

interface PropertyMultimediaTabProps {
  form?: any;
  propertyId?: number;
}

export const PropertyMultimediaTab = ({ form, propertyId }: PropertyMultimediaTabProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddingYoutube, setIsAddingYoutube] = useState(false);
  const [isAddingVista, setIsAddingVista] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [youtubeForm, setYoutubeForm] = useState({
    nombre: '',
    link: ''
  });
  
  const [vistaForm, setVistaForm] = useState({
    nombre: '',
    url: ''
  });

  const [coverImageUrl, setCoverImageUrl] = useState(
    form?.getValues("url_imagen_portada") || ''
  );

  // Fetch existing YouTube videos
  const { data: youtubeVideos = [] } = useQuery({
    queryKey: ['propertyYoutubeVideos', propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data, error } = await supabase
        .from('videos_youtube')
        .select('*')
        .eq('id_propiedad', propertyId)
        .order('fecha_creacion', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId
  });

  // Since vistas_propiedad table doesn't exist, we'll use multimedias_propiedad for now
  const { data: vistasPropiedad = [] } = useQuery({
    queryKey: ['propertyVistas', propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data, error } = await supabase
        .from('multimedias_propiedad')
        .select('*')
        .eq('id_propiedad', propertyId)
        .eq('es_imagen', true)
        .order('fecha_creacion', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId
  });

  // Mutation to add YouTube video
  const addYoutubeMutation = useMutation({
    mutationFn: async (videoData: typeof youtubeForm) => {
      if (!propertyId) throw new Error('Property ID is required');
      
      const { data, error } = await supabase
        .from('videos_youtube')
        .insert([{
          nombre: videoData.nombre,
          link: videoData.link,
          id_proyecto: null,
          id_propiedad: propertyId,
          activo: true
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propertyYoutubeVideos', propertyId] });
      setYoutubeForm({ nombre: '', link: '' });
      setIsAddingYoutube(false);
      toast({ title: "Video de YouTube agregado exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al agregar video de YouTube", variant: "destructive" });
    }
  });

  // Mutation to add vista using multimedias_propiedad
  const addVistaMutation = useMutation({
    mutationFn: async (vistaData: typeof vistaForm) => {
      if (!propertyId) throw new Error('Property ID is required');
      
      const { data, error } = await supabase
        .from('multimedias_propiedad')
        .insert([{
          descripcion: vistaData.nombre,
          url: vistaData.url,
          id_propiedad: propertyId,
          es_imagen: true,
          activo: true
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['propertyVistas', propertyId] });
      setVistaForm({ nombre: '', url: '' });
      setIsAddingVista(false);
      toast({ title: "Vista agregada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al agregar vista", variant: "destructive" });
    }
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !propertyId) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `properties/${propertyId}/cover/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('documentos')
        .getPublicUrl(filePath);

      setCoverImageUrl(data.publicUrl);
      if (form) {
        form.setValue("url_imagen_portada", data.publicUrl);
      }
      toast({ title: "Imagen subida exitosamente" });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({ title: "Error al subir archivo", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleYoutubeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeForm.nombre.trim() || !youtubeForm.link.trim()) {
      toast({ title: "Debes completar todos los campos", variant: "destructive" });
      return;
    }
    addYoutubeMutation.mutate(youtubeForm);
  };

  const handleVistaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vistaForm.nombre.trim() || !vistaForm.url.trim()) {
      toast({ title: "Debes completar todos los campos", variant: "destructive" });
      return;
    }
    addVistaMutation.mutate(vistaForm);
  };

  const getYouTubeEmbedUrl = (url: string) => {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? `https://www.youtube.com/embed/${match[1]}` : url;
  };

  return (
    <div className="space-y-6">
      {/* Imagen de Portada */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            Imagen de Portada
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {form ? (
            <FormField
              control={form.control}
              name="url_imagen_portada"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL de Imagen de Portada</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="https://ejemplo.com/imagen-portada.jpg"
                      onChange={(e) => {
                        field.onChange(e);
                        setCoverImageUrl(e.target.value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <div className="space-y-2">
              <Label htmlFor="cover-image">URL de Imagen de Portada</Label>
              <Input
                id="cover-image"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                placeholder="https://ejemplo.com/imagen-portada.jpg"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="cover-file">O sube una imagen</Label>
            <div className="flex items-center gap-2">
              <Input
                id="cover-file"
                type="file"
                accept="image/*"
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

          {coverImageUrl && (
            <div className="border rounded-md p-2">
              <img 
                src={coverImageUrl} 
                alt="Vista previa de portada" 
                className="max-w-full h-32 object-contain"
                onError={(e) => {
                  e.currentTarget.src = '/placeholder.svg';
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Videos de YouTube */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Videos de YouTube
            </CardTitle>
            {propertyId && (
              <Button
                onClick={() => setIsAddingYoutube(true)}
                disabled={isAddingYoutube}
                size="sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Agregar Video
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!propertyId && (
            <p className="text-muted-foreground">
              Los videos se podrán agregar después de crear la propiedad.
            </p>
          )}

          {isAddingYoutube && (
            <Card>
              <CardContent className="pt-4">
                <form onSubmit={handleYoutubeSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="youtube-name">Nombre del Video</Label>
                    <Input
                      id="youtube-name"
                      value={youtubeForm.nombre}
                      onChange={(e) => setYoutubeForm(prev => ({ ...prev, nombre: e.target.value }))}
                      placeholder="Ej: Tour virtual de la propiedad"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="youtube-link">Link de YouTube</Label>
                    <Input
                      id="youtube-link"
                      value={youtubeForm.link}
                      onChange={(e) => setYoutubeForm(prev => ({ ...prev, link: e.target.value }))}
                      placeholder="https://www.youtube.com/watch?v=..."
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button type="submit" disabled={addYoutubeMutation.isPending}>
                      {addYoutubeMutation.isPending ? "Guardando..." : "Guardar"}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsAddingYoutube(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {youtubeVideos.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {youtubeVideos.map((video) => (
                <Card key={video.id}>
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">{video.nombre}</h4>
                    <div className="aspect-video">
                      <iframe
                        src={getYouTubeEmbedUrl(video.link)}
                        title={video.nombre}
                        className="w-full h-full rounded-md"
                        allowFullScreen
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vistas */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Imagenes y videos
            </CardTitle>
            {propertyId && (
              <Button
                onClick={() => setIsAddingVista(true)}
                disabled={isAddingVista}
                size="sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Agregar Vista
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!propertyId && (
            <p className="text-muted-foreground">
              Las vistas se podrán agregar después de crear la propiedad.
            </p>
          )}

          {isAddingVista && (
            <Card>
              <CardContent className="pt-4">
                <form onSubmit={handleVistaSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="vista-name">Nombre de la Vista</Label>
                    <Input
                      id="vista-name"
                      value={vistaForm.nombre}
                      onChange={(e) => setVistaForm(prev => ({ ...prev, nombre: e.target.value }))}
                      placeholder="Ej: Vista desde balcón"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="vista-url">URL de la Imagen</Label>
                    <Input
                      id="vista-url"
                      value={vistaForm.url}
                      onChange={(e) => setVistaForm(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="https://ejemplo.com/vista.jpg"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button type="submit" disabled={addVistaMutation.isPending}>
                      {addVistaMutation.isPending ? "Guardando..." : "Guardar"}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsAddingVista(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {vistasPropiedad.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {vistasPropiedad.map((vista) => (
                <Card key={vista.id}>
                  <CardContent className="pt-4">
                    <h4 className="font-medium mb-2">{vista.descripcion || 'Vista'}</h4>
                    <img 
                      src={vista.url} 
                      alt={vista.descripcion || 'Vista'}
                      className="w-full h-32 object-cover rounded-md"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder.svg';
                      }}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};