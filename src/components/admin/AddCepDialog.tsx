import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, FileText } from "lucide-react";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface AddCepDialogProps {
  open: boolean;
  onClose: () => void;
  paymentId: number;
  cuentaCobranzaId: number;
}

export const AddCepDialog = ({ open, onClose, paymentId, cuentaCobranzaId }: AddCepDialogProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarSubidaDocumento } = useActivityLogger();

  const updateCepMutation = useMutation({
    mutationFn: async (cepUrl: string) => {
      const { error } = await supabase
        .from('pagos')
        .update({ url_cep: cepUrl })
        .eq('id', paymentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaCobranzaId] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaCobranzaId] });
      queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaCobranzaId] });
      toast({
        title: "CEP actualizado",
        description: "El comprobante electrónico de pago ha sido agregado exitosamente.",
      });
      onClose();
      setSelectedFile(null);
    },
    onError: (error) => {
      console.error('Error updating CEP:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el CEP. Por favor intenta de nuevo.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (file.type !== 'application/pdf') {
        toast({
          title: "Tipo de archivo inválido",
          description: "Por favor selecciona un archivo PDF.",
          variant: "destructive",
        });
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Archivo muy grande",
          description: "El archivo no debe exceder 10MB.",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    try {
      const timestamp = Date.now();
      const fileName = `cep_${timestamp}_${selectedFile.name}`;
      
      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(fileName, selectedFile);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error('Error al subir el archivo');
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('documentos')
        .getPublicUrl(fileName);

      // Update payment record
      await updateCepMutation.mutateAsync(publicUrl);

      // Log success
      await registrarSubidaDocumento({
        tipo: 'cep_pago',
        id_pago: paymentId,
        id_cuenta_cobranza: cuentaCobranzaId,
        nombre_archivo: selectedFile.name,
        url: publicUrl
      });
    } catch (error) {
      console.error('Error in handleUpload:', error);
      
      // Log error
      await registrarSubidaDocumento(
        { tipo: 'cep_pago', id_pago: paymentId, id_cuenta_cobranza: cuentaCobranzaId, nombre_archivo: selectedFile?.name },
        'error',
        error instanceof Error ? error.message : 'Error desconocido'
      );

      toast({
        title: "Error",
        description: "No se pudo subir el archivo. Por favor intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Agregar CEP
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="cep-file">Comprobante Electrónico de Pago (PDF)</Label>
            <Input
              id="cep-file"
              type="file"
              accept=".pdf"
              onChange={handleFileSelect}
              disabled={uploading}
            />
            <p className="text-sm text-muted-foreground mt-1">
              Selecciona un archivo PDF (máximo 10MB)
            </p>
          </div>

          {selectedFile && (
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">{selectedFile.name}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={uploading}>
              Cancelar
            </Button>
            <Button 
              onClick={handleUpload} 
              disabled={!selectedFile || uploading}
            >
              {uploading ? (
                <Upload className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {uploading ? 'Subiendo...' : 'Subir CEP'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};