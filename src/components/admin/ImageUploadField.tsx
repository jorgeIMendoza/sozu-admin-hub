import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Upload, X, ExternalLink, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const clearImage = () => {
    setImageError(false);
    onChange("");
  };

  const handleUpload = async () => {
    const tempInput = document.createElement('input');
    tempInput.type = 'file';
    tempInput.accept = accept;
    
    tempInput.onchange = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files[0]) {
        const file = target.files[0];
        setUploading(true);
        try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}.${fileExt}`;
          const filePath = `projects/images/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('documentos')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data } = supabase.storage
            .from('documentos')
            .getPublicUrl(filePath);

          onChange(data.publicUrl);
          toast({ title: "Archivo subido exitosamente" });
        } catch (error) {
          console.error('Error uploading file:', error);
          toast({ title: "Error al subir archivo", variant: "destructive" });
        } finally {
          setUploading(false);
        }
      }
    };
    
    tempInput.click();
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
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleUpload();
          }}
        >
          <Upload className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            {uploading ? "Subiendo..." : `Haz clic para subir ${label.toLowerCase()}`}
          </p>
        </div>
      )}
      
      {uploading && (
        <p className="text-xs text-muted-foreground">Subiendo...</p>
      )}
    </div>
  );
}