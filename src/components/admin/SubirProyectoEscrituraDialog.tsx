import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { N8N_WEBHOOK_BASE_URL } from "@/lib/config";

interface SubirProyectoEscrituraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuentaCobranzaId: number;
  onSuccess?: () => void;
}

export default function SubirProyectoEscrituraDialog({
  open,
  onOpenChange,
  cuentaCobranzaId,
  onSuccess,
}: SubirProyectoEscrituraDialogProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    
    if (!selectedFile) {
      setFile(null);
      return;
    }

    // Validar extensión - solo PDF por seguridad
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      toast({
        title: "Error",
        description: "Solo se permiten archivos PDF por razones de seguridad",
        variant: "destructive",
      });
      setFile(null);
      e.target.value = '';
      return;
    }

    // Validar tamaño (10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (selectedFile.size > maxSize) {
      toast({
        title: "Error",
        description: "El archivo debe ser menor a 10MB",
        variant: "destructive",
      });
      setFile(null);
      e.target.value = '';
      return;
    }

    setFile(selectedFile);
  };

  const handleSubmit = async () => {
    if (!file) {
      toast({
        title: "Error",
        description: "Debe seleccionar un archivo",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      // 1. Verificar si ya existe un proyecto de escritura para esta cuenta
      const { data: existingDoc, error: checkError } = await supabase
        .from('documentos')
        .select('id, url')
        .eq('id_cuenta_cobranza', cuentaCobranzaId)
        .eq('id_tipo_documento', 29)
        .eq('activo', true)
        .maybeSingle();

      if (checkError) {
        console.error('Error al verificar documento existente:', checkError);
      }

      // 2. Generar nombre del archivo con formato único
      const timestamp = new Date().getTime();
      const cuentaFormateada = formatCuentaCobranzaId(cuentaCobranzaId);
      const fileName = `${cuentaFormateada}_proyecto_escritura_${timestamp}.pdf`;
      const filePath = `${cuentaCobranzaId}/${fileName}`;
      const urlPath = `/proyectos_escritura/${filePath}`;

      // 3. Subir archivo a Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('proyectos_escritura')
        .upload(filePath, file, {
          contentType: 'application/pdf',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Error al subir archivo: ${uploadError.message}`);
      }

      // 3.5. Llamar al webhook de n8n cargaProyectoEscritura con el archivo PDF
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('id_cuenta_cobranza', cuentaCobranzaId.toString());

        const response = await fetch(`${N8N_WEBHOOK_BASE_URL}/cargaProyectoEscritura`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error al llamar webhook cargaProyectoEscritura:', errorText);
          throw new Error(`Error al procesar el proyecto de escritura: ${response.status} ${response.statusText}`);
        }
      } catch (endpointError: any) {
        console.error('Error en webhook cargaProyectoEscritura:', endpointError);
        // Si falla el webhook, eliminar el archivo subido
        await supabase.storage
          .from('proyectos_escritura')
          .remove([filePath]);
        throw new Error(`Error al procesar el documento: ${endpointError.message}`);
      }

      // 4. Si existe un documento anterior, eliminarlo del storage y actualizar el registro
      if (existingDoc) {
        // Eliminar archivo anterior del storage si existe
        const oldFilePath = existingDoc.url.replace('/proyectos_escritura/', '');
        const { error: deleteError } = await supabase.storage
          .from('proyectos_escritura')
          .remove([oldFilePath]);
        
        if (deleteError) {
          console.error('Error al eliminar archivo anterior:', deleteError);
        }

        // Actualizar el registro existente con la nueva URL
        const { data: updatedDoc, error: updateError } = await supabase
          .from('documentos')
          .update({
            url: urlPath,
            id_estatus_verificacion: 1, // 1 = Pendiente
            fecha_actualizacion: new Date().toISOString(),
          })
          .eq('id', existingDoc.id)
          .select()
          .single();

        if (updateError) {
          console.error('Error al actualizar documento:', updateError);
          // Si falla la actualización, intentar eliminar el archivo nuevo
          await supabase.storage
            .from('proyectos_escritura')
            .remove([filePath]);
          
          throw new Error(`Error al actualizar documento: ${updateError.message}`);
        }

        console.log('Documento actualizado exitosamente:', updatedDoc);
      } else {
        // 5. Si no existe, crear un nuevo registro
        const { data: insertedDoc, error: dbError } = await supabase
          .from('documentos')
          .insert({
            id_cuenta_cobranza: cuentaCobranzaId,
            id_tipo_documento: 29, // Proyecto de escritura
            url: urlPath,
            activo: true,
            id_estatus_verificacion: 1, // 1 = Pendiente
            es_draft: false,
          })
          .select()
          .single();

        if (dbError) {
          console.error('Error al insertar en documentos:', dbError);
          // Si falla el guardado en DB, intentar eliminar el archivo subido
          await supabase.storage
            .from('proyectos_escritura')
            .remove([filePath]);
          
          throw new Error(`Error al guardar documento: ${dbError.message}`);
        }

        console.log('Documento guardado exitosamente:', insertedDoc);
      }

      toast({
        title: "✅ Proyecto de escritura guardado",
        description: existingDoc 
          ? "El documento ha sido actualizado exitosamente" 
          : "El documento ha sido subido exitosamente",
      });

      setFile(null);
      onOpenChange(false);
      onSuccess?.();

    } catch (error: any) {
      console.error('Error completo:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar el documento",
        variant: "destructive",
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Subir Proyecto de Escritura
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="file">Documento PDF</Label>
            <div className="flex flex-col gap-2">
              <Input
                id="file"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                disabled={uploading}
                className="cursor-pointer"
              />
              {file && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span className="truncate">{file.name}</span>
                  <span>({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                </div>
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Solo archivos PDF</p>
            <p>• Tamaño máximo: 10 MB</p>
            <p>• Por seguridad, solo se aceptan PDF para evitar ediciones del documento</p>
            <p>• Cuenta de cobranza: {cuentaCobranzaId}</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={uploading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Subir
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
