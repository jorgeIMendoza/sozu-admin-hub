import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, FileCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface SubirContratoFirmadoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cuentaCobranzaId: number;
  onSuccess?: () => void;
}

export function SubirContratoFirmadoDialog({
  open,
  onOpenChange,
  cuentaCobranzaId,
  onSuccess
}: SubirContratoFirmadoDialogProps) {
  const { toast } = useToast();
  const { registrarSubidaDocumento } = useActivityLogger();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [numeroContrato, setNumeroContrato] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Validar tipo de archivo
      if (selectedFile.type !== 'application/pdf') {
        toast({
          title: "❌ Formato no válido",
          description: "Solo se permiten archivos PDF",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
      
      // Validar tamaño (máximo 10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast({
          title: "❌ Archivo muy grande",
          description: "El archivo no debe exceder 10MB",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "❌ Error",
        description: "Debes seleccionar un archivo",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    setUploading(true);

    try {
      // Subir archivo a Supabase Storage
      const fileName = `contrato_firmado_${cuentaCobranzaId}_${Date.now()}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Obtener URL pública del archivo
      const { data: { publicUrl } } = supabase.storage
        .from('documentos')
        .getPublicUrl(fileName);

      // Insertar documento en la tabla
      const { error: insertError } = await supabase
        .from('documentos')
        .insert({
          id_cuenta_cobranza: cuentaCobranzaId,
          id_tipo_documento: 18, // Tipo "Contrato"
          url: publicUrl,
          numero: numeroContrato || null,
          id_estatus_verificacion: 2, // 2 = Validado
          es_draft: false,
          activo: true,
        });

      if (insertError) throw insertError;

      // Registrar subida de contrato firmado
      await registrarSubidaDocumento({
        id_cuenta_cobranza: cuentaCobranzaId,
        tipo_documento: 'Contrato firmado',
        numero_contrato: numeroContrato || null,
        url: publicUrl
      });

      toast({
        title: "✅ Contrato subido exitosamente",
        description: "El contrato firmado ha sido registrado correctamente.",
        duration: 3000,
      });

      setFile(null);
      setNumeroContrato("");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error al subir contrato:', error);
      toast({
        title: "❌ Error",
        description: error.message || "No se pudo subir el contrato.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-primary" />
            Subir Contrato Firmado
          </DialogTitle>
          <DialogDescription>
            Sube el contrato firmado en formato PDF para la cuenta de cobranza.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="numero-contrato">
              Número de Contrato <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="numero-contrato"
              placeholder="Ej: CONT-2024-001"
              value={numeroContrato}
              onChange={(e) => setNumeroContrato(e.target.value)}
              disabled={uploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="file-upload">Archivo PDF *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file-upload"
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                disabled={uploading}
                className="cursor-pointer"
              />
            </div>
            {file && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <FileCheck className="w-4 h-4 text-green-500" />
                {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md p-3">
            <p className="text-sm text-green-700 dark:text-green-300">
              ✅ El contrato será marcado como "Verificado" automáticamente al subirse.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Subir Contrato
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
