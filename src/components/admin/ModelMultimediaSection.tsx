import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Power, PowerOff, Plus, Upload, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

interface ModelMultimediaSectionProps {
  modelId: number;
}

export function ModelMultimediaSection({ modelId }: ModelMultimediaSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newMultimedia, setNewMultimedia] = useState({
    es_imagen: true,
    url: "",
    descripcion: "",
    ver_como_ubicacion_en_oferta: false
  });
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const { data: multimedia = [] } = useQuery({
    queryKey: ['modelMultimedia', modelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('multimedias_modelo')
        .select('*')
        .eq('id_modelo', modelId)
        .order('fecha_creacion', { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  const addMutation = useMutation({
    mutationFn: async (multimediaData: typeof newMultimedia) => {
      const { data, error } = await supabase
        .from('multimedias_modelo')
        .insert([{
          ...multimediaData,
          id_modelo: modelId
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelMultimedia', modelId] });
      setNewMultimedia({ es_imagen: true, url: "", descripcion: "", ver_como_ubicacion_en_oferta: false });
      setIsAdding(false);
      toast({ title: "Multimedia agregado exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al agregar multimedia", variant: "destructive" });
    }
  });

  const updateUbicacionMutation = useMutation({
    mutationFn: async ({ multimediaId, newValue }: { multimediaId: number; newValue: boolean }) => {
      console.log('Updating ubicacion:', { multimediaId, newValue });
      const { data, error } = await supabase
        .from('multimedias_modelo')
        .update({ ver_como_ubicacion_en_oferta: newValue })
        .eq('id', multimediaId)
        .select();
      
      if (error) {
        console.error('Error updating ubicacion:', error);
        throw error;
      }
      
      console.log('Successfully updated:', data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modelMultimedia', modelId] });
      toast({ title: "Ubicación en oferta actualizada exitosamente" });
    },
    onError: (error) => {
      console.error('Mutation error:', error);
      toast({ title: "Error al actualizar ubicación en oferta", variant: "destructive" });
    }
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ multimediaId, newStatus }: { multimediaId: number; newStatus: boolean }) => {
      const { error } = await supabase
        .from('multimedias_modelo')
        .update({ activo: newStatus })
        .eq('id', multimediaId);
      
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['modelMultimedia', modelId] });
      toast({ 
        title: newStatus ? "Multimedia reactivado exitosamente" : "Multimedia inactivado exitosamente" 
      });
    },
    onError: () => {
      toast({ title: "Error al cambiar estado del multimedia", variant: "destructive" });
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
          const filePath = `models/${modelId}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('documentos')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data } = supabase.storage
            .from('documentos')
            .getPublicUrl(filePath);

          const { error: insertError } = await supabase
            .from('multimedias_modelo')
            .insert([{
              es_imagen: file.type.startsWith('image/'),
              url: data.publicUrl,
              descripcion: newMultimedia.descripcion || file.name,
              ver_como_ubicacion_en_oferta: false,
              id_modelo: modelId
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

      queryClient.invalidateQueries({ queryKey: ['modelMultimedia', modelId] });
      setSelectedFiles([]);
      setNewMultimedia({ es_imagen: true, url: "", descripcion: "", ver_como_ubicacion_en_oferta: false });
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

  const isImageUrl = (url: string) => {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
  };

  const isVideoUrl = (url: string) => {
    return /\.(mp4|webm|ogg|mov|avi)$/i.test(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Multimedia del Modelo</h3>
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
            <div className="space-y-4">
              <div>
                <Label htmlFor="tipo">Tipo de Multimedia</Label>
                <Select
                  value={newMultimedia.es_imagen ? "imagen" : "video"}
                  onValueChange={(value) => {
                    const esImagen = value === "imagen";
                    setNewMultimedia(prev => ({ 
                      ...prev, 
                      es_imagen: esImagen,
                      // Reset ubicacion en oferta if switching to video
                      ver_como_ubicacion_en_oferta: esImagen ? prev.ver_como_ubicacion_en_oferta : false
                    }));
                  }}
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

              <div>
                <Label htmlFor="descripcion">Descripción (opcional) {selectedFiles.length > 1 && '- se aplicará a todos'}</Label>
                <Input
                  id="descripcion"
                  type="text"
                  value={newMultimedia.descripcion}
                  onChange={(e) => setNewMultimedia(prev => ({ ...prev, descripcion: e.target.value }))}
                  placeholder="Descripción del multimedia..."
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

              {newMultimedia.es_imagen && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="ver_como_ubicacion_en_oferta"
                    checked={newMultimedia.ver_como_ubicacion_en_oferta}
                    onCheckedChange={(checked) => 
                      setNewMultimedia(prev => ({ ...prev, ver_como_ubicacion_en_oferta: !!checked }))
                    }
                  />
                  <Label htmlFor="ver_como_ubicacion_en_oferta" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Ver como ubicacion en oferta
                  </Label>
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
                    setNewMultimedia({ es_imagen: true, url: "", descripcion: "", ver_como_ubicacion_en_oferta: false });
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
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline">
                    {item.es_imagen ? "Imagen" : "Video"}
                  </Badge>
                  <Badge variant={item.activo ? "default" : "secondary"}>
                    {item.activo ? "Activo" : "Inactivo"}
                  </Badge>
                  {item.es_imagen && item.ver_como_ubicacion_en_oferta && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      <MapPin className="w-3 h-3 mr-1" />
                      Ubicación en oferta
                    </Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleStatusMutation.mutate({ 
                    multimediaId: item.id, 
                    newStatus: !item.activo 
                  })}
                  disabled={toggleStatusMutation.isPending || (item.activo && item.ver_como_ubicacion_en_oferta)}
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
              
              {item.es_imagen && item.activo && (
                <div className="flex items-center space-x-2 mb-2">
                  <Checkbox
                    id={`ubicacion_${item.id}`}
                    checked={item.ver_como_ubicacion_en_oferta}
                    onCheckedChange={(checked) => 
                      updateUbicacionMutation.mutate({ 
                        multimediaId: item.id, 
                        newValue: !!checked 
                      })
                    }
                    disabled={updateUbicacionMutation.isPending}
                  />
                  <Label htmlFor={`ubicacion_${item.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Ver como ubicación en oferta
                  </Label>
                </div>
              )}
              
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
                      {!item.activo ? "Multimedia inactivo" : "Vista previa no disponible"}
                    </p>
                  </div>
                )}
              </div>
              
              {item.descripcion && (
                <p className="text-sm text-muted-foreground mt-2 p-2 bg-muted rounded-sm">
                  {item.descripcion}
                </p>
              )}
              
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