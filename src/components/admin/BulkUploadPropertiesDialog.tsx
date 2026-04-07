import { useState } from "react";
import { Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { N8N_WEBHOOK_BASE_URL, ENVIRONMENT } from "@/lib/config";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { supabase } from "@/integrations/supabase/client";

interface BulkUploadPropertiesDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkUploadPropertiesDialog = ({ 
  open, 
  onClose, 
  onSuccess 
}: BulkUploadPropertiesDialogProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();
  const { registrarCreacion } = useActivityLogger();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    
    if (!selectedFile) {
      setFile(null);
      return;
    }

    // Validate CSV file type
    if (selectedFile.type !== 'text/csv' && !selectedFile.name.endsWith('.csv')) {
      toast({
        title: "Archivo inválido",
        description: "Solo se permiten archivos CSV.",
        variant: "destructive",
      });
      event.target.value = '';
      return;
    }

    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "Error",
        description: "Por favor selecciona un archivo CSV.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('environment', ENVIRONMENT);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) return prev;
          return prev + 10;
        });
      }, 500);

      const response = await fetch(
        `${N8N_WEBHOOK_BASE_URL}/cargar-archivo-propiedades`,
        {
          method: 'POST',
          body: formData,
        }
      );

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        throw new Error(`Error en el servidor: ${response.status}`);
      }

      const result = await response.json();

      if (result.success === false) {
        await registrarCreacion(
          'propiedades',
          {
            nombre_archivo: file.name,
            tamano_kb: (file.size / 1024).toFixed(1),
            mensaje_servidor: result.mensaje,
          },
          'carga_masiva_propiedades',
          'error',
          result.mensaje
        );
        toast({
          title: "Error en el archivo",
          description: result.mensaje || "El archivo contiene errores. Revisa tu correo para más detalles.",
          variant: "destructive",
        });
        return;
      }

      await registrarCreacion(
        'propiedades',
        {
          nombre_archivo: file.name,
          tamano_kb: (file.size / 1024).toFixed(1),
          mensaje_servidor: result.mensaje,
        },
        'carga_masiva_propiedades'
      );

      toast({
        title: "Carga exitosa",
        description: result.mensaje || "El archivo se ha procesado correctamente.",
      });

      // Trigger notification to agents
      if (result.id_proyecto) {
        supabase.functions.invoke('notificar-agentes', {
          body: {
            tipo_evento: 'precio_actualizado',
            id_proyecto: result.id_proyecto,
            datos: { nombre_desarrollo: result.nombre_desarrollo || '' },
          },
        }).catch(err => console.error('Error sending notification:', err));
      }

      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Error en la carga",
        description: error instanceof Error ? error.message : "Ocurrió un error al procesar el archivo.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setFile(null);
      setUploadProgress(0);
      onClose();
    }
  };

  const resetFile = () => {
    setFile(null);
    const fileInput = document.getElementById('csv-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Carga Masiva de Propiedades
          </DialogTitle>
          <DialogDescription>
            Sube un archivo CSV para cargar múltiples propiedades de forma masiva.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isUploading ? (
            <>
              <div className="flex items-center justify-center w-full">
                <label
                  htmlFor="csv-file-input"
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted/80 border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors"
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <FileText className="w-8 h-8 mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold">Haz clic para subir</span> o arrastra tu archivo CSV aquí
                    </p>
                    <p className="text-xs text-muted-foreground">Solo archivos CSV</p>
                  </div>
                  <input
                    id="csv-file-input"
                    type="file"
                    className="hidden"
                    accept=".csv"
                    onChange={handleFileChange}
                    disabled={isUploading}
                  />
                </label>
              </div>

              {file && (
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFile}
                    className="h-6 px-2 text-xs"
                  >
                    Cambiar
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm font-medium">Procesando archivo...</p>
                <p className="text-xs text-muted-foreground">Por favor espera mientras se carga el archivo</p>
              </div>
              
              <div className="space-y-2">
                <Progress value={uploadProgress} className="w-full" />
                <p className="text-xs text-center text-muted-foreground">
                  {uploadProgress}% completado
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isUploading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className="gap-2"
            >
              {isUploading ? (
                <>Procesando...</>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Subir Archivo
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};