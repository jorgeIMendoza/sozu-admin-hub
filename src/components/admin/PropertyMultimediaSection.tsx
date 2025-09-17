import { useState } from "react";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Upload, Trash2, Play, Eye, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PropertyMultimediaSectionProps {
  form: any;
  propertyId?: number;
  onMultimediaChange?: (multimedia: MultimediaItem[], youtubeVideos: YoutubeVideoItem[]) => void;
}

interface MultimediaItem {
  id?: string;
  url: string;
  descripcion: string;
  es_imagen: boolean;
  file?: File;
}

interface YoutubeVideoItem {
  id?: string;
  nombre: string;
  link: string;
}

export const PropertyMultimediaSection = ({ form, propertyId, onMultimediaChange }: PropertyMultimediaSectionProps) => {
  const { toast } = useToast();
  const [multimediaItems, setMultimediaItems] = useState<MultimediaItem[]>([]);
  const [youtubeVideos, setYoutubeVideos] = useState<YoutubeVideoItem[]>([]);
  const [isAddingMultimedia, setIsAddingMultimedia] = useState(false);
  const [isAddingYoutube, setIsAddingYoutube] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const [multimediaForm, setMultimediaForm] = useState({
    descripcion: '',
    url: '',
    es_imagen: true,
    file: null as File | null
  });
  
  const [youtubeForm, setYoutubeForm] = useState({
    nombre: '',
    link: ''
  });

  // Query para obtener las vistas disponibles
  const { data: vistas, isLoading: loadingVistas } = useQuery({
    queryKey: ["vistas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vistas")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");

      if (error) throw error;
      return data;
    },
  });

  // Notificar cambios al componente padre
  const notifyChange = (multimedia: MultimediaItem[], youtube: YoutubeVideoItem[]) => {
    onMultimediaChange?.(multimedia, youtube);
  };

  // Funciones para manejar multimedia
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `temp_${Date.now()}.${fileExt}`;
      
      // En modo creación, guardamos el archivo temporalmente
      setMultimediaForm(prev => ({
        ...prev,
        file: file,
        url: URL.createObjectURL(file),
        es_imagen: file.type.startsWith('image/')
      }));
      
      toast({ title: "Archivo cargado" });
    } catch (error) {
      console.error('Error loading file:', error);
      toast({ title: "Error al cargar archivo", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleAddMultimedia = () => {
    if (!multimediaForm.descripcion.trim() || (!multimediaForm.url.trim() && !multimediaForm.file)) {
      toast({ title: "Debes completar la descripción y agregar un archivo o URL", variant: "destructive" });
      return;
    }

    const newItem: MultimediaItem = {
      id: `temp_${Date.now()}`,
      descripcion: multimediaForm.descripcion,
      url: multimediaForm.url,
      es_imagen: multimediaForm.es_imagen,
      file: multimediaForm.file || undefined
    };

    const updatedMultimedia = [...multimediaItems, newItem];
    setMultimediaItems(updatedMultimedia);
    notifyChange(updatedMultimedia, youtubeVideos);
    
    // Reset form
    setMultimediaForm({
      descripcion: '',
      url: '',
      es_imagen: true,
      file: null
    });
    setIsAddingMultimedia(false);
    toast({ title: "Multimedia agregado" });
  };

  const handleAddYoutube = () => {
    if (!youtubeForm.nombre.trim() || !youtubeForm.link.trim()) {
      toast({ title: "Debes completar todos los campos", variant: "destructive" });
      return;
    }

    const newVideo: YoutubeVideoItem = {
      id: `temp_${Date.now()}`,
      nombre: youtubeForm.nombre,
      link: youtubeForm.link
    };

    const updatedYoutube = [...youtubeVideos, newVideo];
    setYoutubeVideos(updatedYoutube);
    notifyChange(multimediaItems, updatedYoutube);
    
    // Reset form
    setYoutubeForm({
      nombre: '',
      link: ''
    });
    setIsAddingYoutube(false);
    toast({ title: "Video de YouTube agregado" });
  };

  const handleRemoveMultimedia = (id: string) => {
    const updatedMultimedia = multimediaItems.filter(item => item.id !== id);
    setMultimediaItems(updatedMultimedia);
    notifyChange(updatedMultimedia, youtubeVideos);
  };

  const handleRemoveYoutube = (id: string) => {
    const updatedYoutube = youtubeVideos.filter(video => video.id !== id);
    setYoutubeVideos(updatedYoutube);
    notifyChange(multimediaItems, updatedYoutube);
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
    return /\.(mp4|webm|ogg|mov)$/i.test(url);
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
        <CardContent>
          <FormField
            control={form.control}
            name="url_imagen_portada"
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL de Imagen de Portada</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="https://ejemplo.com/imagen.jpg"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
                <p className="text-sm text-muted-foreground">
                  La imagen de portada principal de la propiedad
                </p>
                {field.value && (
                  <div className="border rounded-md p-2 mt-2">
                    <img 
                      src={field.value} 
                      alt="Vista previa de portada" 
                      className="max-w-full h-32 object-contain"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder.svg';
                      }}
                    />
                  </div>
                )}
              </FormItem>
            )}
          />
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
            <Button
              type="button"
              onClick={() => setIsAddingYoutube(true)}
              disabled={isAddingYoutube}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Video
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAddingYoutube && (
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-4">
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
                    <Button type="button" onClick={handleAddYoutube}>
                      Agregar
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

          {youtubeVideos.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {youtubeVideos.map((video) => (
                <Card key={video.id}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium">{video.nombre}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveYoutube(video.id!)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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

          {youtubeVideos.length === 0 && !isAddingYoutube && (
            <p className="text-center text-muted-foreground py-4">
              No hay videos de YouTube agregados
            </p>
          )}
        </CardContent>
      </Card>

      {/* Vista de la Propiedad */}
      <Card>
        <CardHeader>
          <CardTitle>Vista de la Propiedad</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField
            control={form.control}
            name="id_vista"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vista *</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                  disabled={loadingVistas}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una vista" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {vistas?.map((vista) => (
                      <SelectItem key={vista.id} value={vista.id.toString()}>
                        {vista.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Imágenes y Videos */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Imágenes y Videos
            </CardTitle>
            <Button
              type="button"
              onClick={() => setIsAddingMultimedia(true)}
              disabled={isAddingMultimedia}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Multimedia
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isAddingMultimedia && (
            <Card>
              <CardContent className="pt-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="multimedia-desc">Descripción</Label>
                    <Input
                      id="multimedia-desc"
                      value={multimediaForm.descripcion}
                      onChange={(e) => setMultimediaForm(prev => ({ ...prev, descripcion: e.target.value }))}
                      placeholder="Ej: Vista desde el balcón"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="multimedia-url">URL (opcional)</Label>
                    <Input
                      id="multimedia-url"
                      value={multimediaForm.url}
                      onChange={(e) => setMultimediaForm(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="https://ejemplo.com/imagen.jpg"
                    />
                  </div>

                  <div>
                    <Label htmlFor="multimedia-file">O sube un archivo</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="multimedia-file"
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleFileUpload}
                        disabled={uploading}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={uploading}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploading ? "Cargando..." : "Cargar"}
                      </Button>
                    </div>
                  </div>

                  {multimediaForm.url && (
                    <div className="border rounded-md p-2">
                      {isImageUrl(multimediaForm.url) || multimediaForm.es_imagen ? (
                        <img 
                          src={multimediaForm.url} 
                          alt="Vista previa" 
                          className="max-w-full h-32 object-contain"
                          onError={(e) => {
                            e.currentTarget.src = '/placeholder.svg';
                          }}
                        />
                      ) : isVideoUrl(multimediaForm.url) ? (
                        <video 
                          src={multimediaForm.url} 
                          className="max-w-full h-32 object-contain"
                          controls
                        />
                      ) : (
                        <p className="text-sm text-muted-foreground">Vista previa no disponible</p>
                      )}
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button type="button" onClick={handleAddMultimedia}>
                      Agregar
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsAddingMultimedia(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {multimediaItems.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {multimediaItems.map((item) => (
                <Card key={item.id}>
                  <CardContent className="pt-4">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-sm">{item.descripcion}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMultimedia(item.id!)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {item.es_imagen || isImageUrl(item.url) ? (
                      <img 
                        src={item.url} 
                        alt={item.descripcion}
                        className="w-full h-32 object-cover rounded-md"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder.svg';
                        }}
                      />
                    ) : (
                      <video 
                        src={item.url} 
                        className="w-full h-32 object-cover rounded-md"
                        controls
                      />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {multimediaItems.length === 0 && !isAddingMultimedia && (
            <p className="text-center text-muted-foreground py-4">
              No hay multimedia agregado
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};