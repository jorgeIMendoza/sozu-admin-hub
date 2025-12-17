import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Image, Video, X, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MultimediaItem {
  id: number;
  url: string;
  es_imagen: boolean;
  activo?: boolean;
}

interface YouTubeVideo {
  id: number;
  nombre: string;
  link: string;
  activo?: boolean;
}

interface ProjectMultimediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  multimedia: MultimediaItem[];
  youtubeVideos?: YouTubeVideo[];
  projectName: string;
}

export const ProjectMultimediaModal = ({ 
  isOpen, 
  onClose, 
  multimedia, 
  youtubeVideos = [],
  projectName 
}: ProjectMultimediaModalProps) => {
  const images = multimedia.filter(item => item.es_imagen && item.activo !== false);
  const videos = multimedia.filter(item => !item.es_imagen && item.activo !== false);
  const activeYoutubeVideos = youtubeVideos.filter(v => v.activo !== false);

  const getYouTubeEmbedUrl = (link: string) => {
    // Handle different YouTube URL formats
    const videoIdMatch = link.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
    if (videoIdMatch) {
      return `https://www.youtube.com/embed/${videoIdMatch[1]}`;
    }
    return link;
  };

  const renderImage = (item: MultimediaItem) => (
    <div key={item.id} className="group relative overflow-hidden rounded-lg border bg-card">
      <img
        src={item.url}
        alt={`Imagen del proyecto ${projectName}`}
        className="w-full h-48 object-cover transition-transform group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
        <Button
          variant="secondary"
          size="sm"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => window.open(item.url, '_blank')}
        >
          Ver completa
        </Button>
      </div>
    </div>
  );

  const renderVideo = (item: MultimediaItem) => (
    <div key={item.id} className="group relative overflow-hidden rounded-lg border bg-card">
      <video
        src={item.url}
        controls
        className="w-full h-48 object-cover"
        preload="metadata"
      >
        Tu navegador no soporta el elemento de video.
      </video>
      <div className="p-4">
        <p className="text-sm text-muted-foreground mb-2">Video del proyecto</p>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => window.open(item.url, '_blank')}
        >
          <Video className="h-4 w-4 mr-2" />
          Abrir en nueva pestaña
        </Button>
      </div>
    </div>
  );

  const renderYouTubeVideo = (video: YouTubeVideo) => (
    <div key={video.id} className="overflow-hidden rounded-lg border bg-card">
      <div className="aspect-video">
        <iframe
          src={getYouTubeEmbedUrl(video.link)}
          title={video.nombre}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="p-3">
        <p className="text-sm font-medium truncate">{video.nombre}</p>
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={() => window.open(video.link, '_blank')}
        >
          <Youtube className="h-4 w-4 mr-2" />
          Ver en YouTube
        </Button>
      </div>
    </div>
  );

  const totalTabs = [images.length > 0, videos.length > 0, activeYoutubeVideos.length > 0].filter(Boolean).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-semibold">
              Multimedia - {projectName}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <Tabs defaultValue="images" className="w-full">
          <TabsList className={`grid w-full ${totalTabs === 3 ? 'grid-cols-3' : totalTabs === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <TabsTrigger value="images" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Imágenes
              <Badge variant="secondary">{images.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="videos" className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              Videos
              <Badge variant="secondary">{videos.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="youtube" className="flex items-center gap-2">
              <Youtube className="h-4 w-4" />
              YouTube
              <Badge variant="secondary">{activeYoutubeVideos.length}</Badge>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="images" className="mt-6">
            <div className="max-h-[400px] overflow-y-auto">
              {images.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {images.map(renderImage)}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Image className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No hay imágenes disponibles</p>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="videos" className="mt-6">
            <div className="max-h-[400px] overflow-y-auto">
              {videos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {videos.map(renderVideo)}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No hay videos disponibles</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="youtube" className="mt-6">
            <div className="max-h-[400px] overflow-y-auto">
              {activeYoutubeVideos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeYoutubeVideos.map(renderYouTubeVideo)}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Youtube className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No hay videos de YouTube disponibles</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
