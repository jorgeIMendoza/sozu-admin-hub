import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const [claveRastreo, setClaveRastreo] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarSubidaDocumento } = useActivityLogger();

  // Fetch existing clave_rastreo for this payment
  const { data: pagoData } = useQuery({
    queryKey: ["pago-cep-info", paymentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos")
        .select("clave_rastreo")
        .eq("id", paymentId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!paymentId,
  });

  const existingClaveRastreo = pagoData?.clave_rastreo?.trim() || "";
  const claveRastreoIsEditable = !existingClaveRastreo;

  useEffect(() => {
    if (open) {
      setClaveRastreo(existingClaveRastreo);
    }
  }, [open, existingClaveRastreo]);

  const updateCepMutation = useMutation({
    mutationFn: async ({ cepUrl, newClaveRastreo }: { cepUrl: string; newClaveRastreo?: string }) => {
      const updatePayload: { url_cep: string; clave_rastreo?: string } = { url_cep: cepUrl };
      if (newClaveRastreo) updatePayload.clave_rastreo = newClaveRastreo;

      const { error } = await supabase
        .from('pagos')
        .update(updatePayload)
        .eq('id', paymentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaCobranzaId] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaCobranzaId] });
      queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaCobranzaId] });
      queryClient.invalidateQueries({ queryKey: ["relacion-pagos"] });
      queryClient.invalidateQueries({ queryKey: ["pago-cep-info", paymentId] });
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
      if (file.type !== 'application/pdf') {
        toast({
          title: "Tipo de archivo inválido",
          description: "Por favor selecciona un archivo PDF.",
          variant: "destructive",
        });
        return;
      }
      
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

    // If editable and user provided a value, validate basic format
    const trimmedClave = claveRastreo.trim();
    if (claveRastreoIsEditable && !trimmedClave) {
      toast({
        title: "Clave de rastreo requerida",
        description: "Captura la clave de rastreo antes de subir el CEP.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const timestamp = Date.now();
      const fileName = `cep_${timestamp}_${selectedFile.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(fileName, selectedFile);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error('Error al subir el archivo');
      }

      const { data: { publicUrl } } = supabase.storage
        .from('documentos')
        .getPublicUrl(fileName);

      await updateCepMutation.mutateAsync({
        cepUrl: publicUrl,
        newClaveRastreo: claveRastreoIsEditable ? trimmedClave : undefined,
      });

      await registrarSubidaDocumento({
        tipo: 'cep_pago',
        id_pago: paymentId,
        id_cuenta_cobranza: cuentaCobranzaId,
        nombre_archivo: selectedFile.name,
        url: publicUrl
      });
    } catch (error) {
      console.error('Error in handleUpload:', error);
      
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
            <Label htmlFor="clave-rastreo">
              Clave de rastreo {claveRastreoIsEditable && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="clave-rastreo"
              type="text"
              value={claveRastreo}
              onChange={(e) => setClaveRastreo(e.target.value)}
              disabled={!claveRastreoIsEditable || uploading}
              placeholder={claveRastreoIsEditable ? "Captura la clave de rastreo" : ""}
              className="font-mono"
            />
            {!claveRastreoIsEditable && (
              <p className="text-xs text-muted-foreground mt-1">
                Esta clave ya está registrada y no puede modificarse.
              </p>
            )}
          </div>

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
