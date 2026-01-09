import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, X, ExternalLink, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ImageUploadFieldProps {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  accept?: string;
}

export function ImageUploadField({ label, value, onChange, accept = "image/*" }: ImageUploadFieldProps) {
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('🔧 handleFileUpload llamado');
    const file = event.target.files?.[0];
    console.log('🔧 Archivo seleccionado:', file);
    if (!file) return;

    setUploading(true);
    try {
      console.log('🔧 Iniciando upload del archivo:', file.name);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `projects/images/${fileName}`;

      console.log('🔧 Subiendo a:', filePath);
      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('documentos')
        .getPublicUrl(filePath);

      console.log('🔧 URL pública generada:', data.publicUrl);
      onChange(data.publicUrl);
      toast({ title: "Imagen subida exitosamente" });
    } catch (error) {
      console.error('🔧 Error uploading file:', error);
      toast({ title: "Error al subir imagen", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const clearImage = () => {
    setImageError(false);
    onChange("");
  };

  const handleUploadClick = () => {
    console.log('🔧 handleUploadClick llamado');
    console.log('🔧 fileInputRef.current:', fileInputRef.current);
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      
      {value ? (
        <div className="space-y-2">
          <div className="relative inline-block">
            {imageError ? (
              <div className="flex flex-col items-center justify-center max-w-32 max-h-32 min-w-24 min-h-24 border rounded-md bg-muted p-2">
                <ImageOff className="h-8 w-8 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground text-center">Vista previa no disponible</span>
                <a 
                  href={value} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-primary flex items-center gap-1 mt-1 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Ver archivo
                </a>
              </div>
            ) : (
              <img 
                src={value} 
                alt={label} 
                className="max-w-32 max-h-32 object-contain border rounded-md"
                onError={() => setImageError(true)}
                onLoad={() => setImageError(false)}
              />
            )}
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6"
              onClick={clearImage}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Imagen actual cargada</p>
        </div>
      ) : (
        <div 
          className="border-2 border-dashed border-muted-foreground/25 rounded-md p-6 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
          onClick={handleUploadClick}
        >
          <Upload className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground mb-2">
            Haz clic para subir {label.toLowerCase()}
          </p>
        </div>
      )}
      
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={(event) => {
            console.log('🔧 onChange del input file disparado');
            console.log('🔧 event.target.files:', event.target.files);
            handleFileUpload(event);
          }}
          disabled={uploading}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={async (e) => {
            console.log('🔧 Click en botón Subir detectado');
            e.preventDefault();
            e.stopPropagation();
            console.log('🔧 Creando input temporal...');
            
            // Crear un input temporal para evitar problemas con el modal
            const tempInput = document.createElement('input');
            tempInput.type = 'file';
            tempInput.accept = accept;
            
            // Crear una promesa para manejar la selección de archivo
            const fileSelected = new Promise((resolve) => {
              tempInput.onchange = async (event: Event) => {
                console.log('🔧 onChange del input temporal disparado');
                const target = event.target as HTMLInputElement;
                console.log('🔧 target.files:', target.files);
                
                if (target.files && target.files[0]) {
                  const file = target.files[0];
                  console.log('🔧 Archivo seleccionado:', file.name);
                  
                  // Llamar directamente a la lógica de upload
                  setUploading(true);
                  try {
                    console.log('🔧 Iniciando upload del archivo:', file.name);
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${Date.now()}.${fileExt}`;
                    const filePath = `projects/images/${fileName}`;

                    console.log('🔧 Subiendo a:', filePath);
                    const { error: uploadError } = await supabase.storage
                      .from('documentos')
                      .upload(filePath, file);

                    if (uploadError) throw uploadError;

                    const { data } = supabase.storage
                      .from('documentos')
                      .getPublicUrl(filePath);

                    console.log('🔧 URL pública generada:', data.publicUrl);
                    console.log('🔍 [DEBUG ImageUploadField] Llamando onChange con URL:', data.publicUrl);
                    onChange(data.publicUrl);
                    console.log('🔍 [DEBUG ImageUploadField] onChange ejecutado correctamente');
                    toast({ title: "Imagen subida exitosamente" });
                  } catch (error) {
                    console.error('🔧 Error uploading file:', error);
                    toast({ title: "Error al subir imagen", variant: "destructive" });
                  } finally {
                    setUploading(false);
                  }
                }
                resolve(true);
              };
            });
            
            console.log('🔧 Haciendo click en input temporal...');
            tempInput.click();
          }}
        >
          <Upload className="w-4 h-4 mr-2" />
          {uploading ? "Subiendo..." : "Subir"}
        </Button>
      </div>
      
      {uploading && (
        <p className="text-xs text-muted-foreground">Subiendo imagen...</p>
      )}
    </div>
  );
}