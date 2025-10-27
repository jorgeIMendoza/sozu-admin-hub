import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ActualizarTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notarioId: number;
  notarioNombre: string;
  currentTemplateUrl?: string;
}

export default function ActualizarTemplateDialog({
  open,
  onOpenChange,
  notarioId,
  notarioNombre,
  currentTemplateUrl,
}: ActualizarTemplateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validar tipo de archivo
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    
    if (!validTypes.includes(selectedFile.type) && 
        !selectedFile.name.match(/\.(docx|doc)$/i)) {
      toast({
        variant: "destructive",
        title: "Archivo inválido",
        description: "Solo se permiten archivos .docx y .doc",
      });
      return;
    }

    // Validar tamaño (máximo 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "Archivo muy grande",
        description: "El archivo no debe superar los 10MB",
      });
      return;
    }

    setFile(selectedFile);
  };

  const handleSubmit = async () => {
    if (!file) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Selecciona un archivo",
      });
      return;
    }

    setUploading(true);

    try {
      // 1. Eliminar archivo anterior si existe
      if (currentTemplateUrl) {
        const { error: deleteError } = await supabase.storage
          .from('templates_proyecto_escritura')
          .remove([currentTemplateUrl]);
        
        if (deleteError) {
          console.error('Error eliminando template anterior:', deleteError);
        }
      }

      // 2. Subir nuevo archivo
      const fileExtension = file.name.split('.').pop();
      const fileName = `notario_${notarioId}_${Date.now()}.${fileExtension}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('templates_proyecto_escritura')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // 3. Actualizar registro del notario
      const { error: updateError } = await supabase
        .from('notarios')
        .update({
          url_template_proyecto_contrato: uploadData.path,
          fecha_actualizacion: new Date().toISOString(),
        })
        .eq('id', notarioId);

      if (updateError) throw updateError;

      // Invalidar queries
      queryClient.invalidateQueries({ queryKey: ['notarios-activos'] });

      toast({
        title: "Template actualizado",
        description: "El template se actualizó correctamente",
      });

      setFile(null);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error actualizando template:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo actualizar el template",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setFile(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Actualizar Template de Proyecto de Escritura</DialogTitle>
          <DialogDescription>
            Actualizar template para: <strong>{notarioNombre}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="file">Seleccionar archivo</Label>
            <Input
              id="file"
              type="file"
              accept=".docx,.doc"
              onChange={handleFileChange}
              disabled={uploading}
            />
            {file && (
              <p className="text-sm text-muted-foreground">
                Archivo seleccionado: {file.name}
              </p>
            )}
          </div>

          <div className="bg-muted/50 border rounded-lg p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>Requisitos del template:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Formato: .docx y .doc</li>
                  <li>Tamaño máximo: 10MB</li>
                  <li>Los placeholders deben estar en formato: <code className="bg-background px-1 rounded">{'{nombre_campo}'}</code></li>
                  <li>Escribir placeholders sin formato (sin negrita, cursiva, etc.)</li>
                </ul>
              </div>
            </div>
          </div>

          {currentTemplateUrl && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                <strong>Nota:</strong> El template anterior será reemplazado permanentemente.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={uploading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={uploading || !file}
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Actualizar Template
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
