import { useState } from "react";
import { FileCheck, Upload, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";

interface JuicioTerminadoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cuentaCobranzaId: number;
  propiedadId?: number;
}

export function JuicioTerminadoDialog({ isOpen, onClose, cuentaCobranzaId, propiedadId }: JuicioTerminadoDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; url: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get the document type ID for "Documentos de Juicio"
  const { data: tipoDocumentoJuicio } = useQuery({
    queryKey: ["tipo_documento_juicio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_documento')
        .select('id')
        .eq('nombre', 'Documentos de Juicio')
        .eq('activo', true)
        .single();

      if (error) throw error;
      return data;
    }
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const newFiles: { name: string; url: string }[] = [];

      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `juicio_${cuentaCobranzaId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `documentos_juicio/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('documentos')
          .getPublicUrl(filePath);

        newFiles.push({ name: file.name, url: publicUrl });
      }

      setUploadedFiles(prev => [...prev, ...newFiles]);
      toast({
        title: "Archivos subidos",
        description: `${newFiles.length} archivo(s) subido(s) exitosamente`,
      });
    } catch (error) {
      console.error('Error uploading files:', error);
      toast({
        title: "Error",
        description: "No se pudieron subir los archivos",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleConfirm = async () => {
    if (!propiedadId) {
      toast({
        title: "Error",
        description: "No se encontró la propiedad asociada a esta cuenta",
        variant: "destructive",
      });
      return;
    }

    if (uploadedFiles.length === 0) {
      toast({
        title: "Documentos requeridos",
        description: "Debe subir al menos un documento del juicio",
        variant: "destructive",
      });
      return;
    }

    if (!descripcion.trim()) {
      toast({
        title: "Descripción requerida",
        description: "Debe ingresar una descripción de la resolución del juicio",
        variant: "destructive",
      });
      return;
    }

    if (!tipoDocumentoJuicio?.id) {
      toast({
        title: "Error",
        description: "No se encontró el tipo de documento 'Documentos de Juicio'",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      // 1. Create document records for each uploaded file
      for (const file of uploadedFiles) {
        const { error: docError } = await supabase
          .from('documentos')
          .insert({
            id_propiedad: propiedadId,
            id_cuenta_cobranza: cuentaCobranzaId,
            id_tipo_documento: tipoDocumentoJuicio.id,
            url: file.url,
            id_estatus_verificacion: 2, // 2 = Validado
            activo: true
          });

        if (docError) throw docError;
      }

      // 2. Update property status to "Disponible" (id=2)
      const { error: propError } = await supabase
        .from('propiedades')
        .update({ 
          id_estatus_disponibilidad: 2,
          fecha_actualizacion: new Date().toISOString()
        })
        .eq('id', propiedadId);

      if (propError) throw propError;

      // 3. Cancel the cuenta de cobranza with the resolution description
      const { error: cuentaError } = await supabase
        .from('cuentas_cobranza')
        .update({ 
          activo: false,
          url_evidencia_cancelacion: descripcion,
          fecha_actualizacion: new Date().toISOString()
        })
        .eq('id', cuentaCobranzaId);

      if (cuentaError) throw cuentaError;

      toast({
        title: "Juicio terminado",
        description: "La cuenta ha sido cancelada y la propiedad liberada exitosamente",
      });

      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaCobranzaId] });
      queryClient.invalidateQueries({ queryKey: ["propiedades"] });
      queryClient.invalidateQueries({ queryKey: ["cuentas_cobranza"] });
      
      // Reset state
      setDescripcion("");
      setUploadedFiles([]);
      onClose();
    } catch (error) {
      console.error('Error finishing lawsuit:', error);
      toast({
        title: "Error",
        description: "No se pudo completar el proceso de juicio terminado",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const canSubmit = uploadedFiles.length > 0 && descripcion.trim().length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-green-600">
            <FileCheck className="h-5 w-5" />
            Juicio Terminado
          </DialogTitle>
          <DialogDescription className="text-left pt-2">
            Ingrese la documentación y resolución del juicio. Al confirmar, la cuenta será cancelada y la propiedad quedará disponible nuevamente.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="documentos">Documentos del Juicio *</Label>
            <div className="flex items-center gap-2">
              <input
                id="documentos"
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('documentos')?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Subir Documentos
                  </>
                )}
              </Button>
            </div>
            
            {/* Uploaded files list */}
            {uploadedFiles.length > 0 && (
              <div className="mt-2 space-y-1">
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between bg-muted p-2 rounded text-sm">
                    <span className="truncate flex-1">{file.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      className="h-6 w-6 p-0 text-destructive"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción de la Resolución *</Label>
            <Textarea
              id="descripcion"
              placeholder="Describa la resolución del juicio..."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={isLoading || !canSubmit}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? "Procesando..." : "Confirmar y Liberar Propiedad"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
