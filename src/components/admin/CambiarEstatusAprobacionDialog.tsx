import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface CambiarEstatusAprobacionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offerId: number;
  onSuccess: () => void;
}

const ESTATUS_OPTIONS = [
  { id: 2, label: "Aprobada", color: "text-green-700" },
  { id: 3, label: "Rechazada", color: "text-red-700" },
  { id: 4, label: "Revisar", color: "text-blue-700" },
];

export function CambiarEstatusAprobacionDialog({
  open,
  onOpenChange,
  offerId,
  onSuccess,
}: CambiarEstatusAprobacionDialogProps) {
  const [nuevoEstatus, setNuevoEstatus] = useState<string>("");
  const [comentario, setComentario] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const estatusId = nuevoEstatus ? parseInt(nuevoEstatus) : null;
  const requiresComment = estatusId === 3 || estatusId === 4;

  const handleSave = async () => {
    if (!estatusId) return;
    if (requiresComment && !comentario.trim()) {
      toast({
        title: "Comentario requerido",
        description: "Debes agregar un comentario para este estatus.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("ofertas")
        .update({
          id_estatus_aprobacion: estatusId,
          comentario_justificacion: comentario.trim() || null,
          url: null,
        })
        .eq("id", offerId);

      if (error) throw error;

      toast({
        title: "Estatus actualizado",
        description: `La oferta ha sido marcada como "${ESTATUS_OPTIONS.find(o => o.id === estatusId)?.label}".`,
      });
      onSuccess();
      onOpenChange(false);
      setNuevoEstatus("");
      setComentario("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el estatus.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setNuevoEstatus("");
      setComentario("");
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar estatus de aprobación</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nuevo estatus</Label>
            <RadioGroup value={nuevoEstatus} onValueChange={setNuevoEstatus}>
              {ESTATUS_OPTIONS.map((option) => (
                <div key={option.id} className="flex items-center space-x-2">
                  <RadioGroupItem value={option.id.toString()} id={`estatus-${option.id}`} />
                  <Label htmlFor={`estatus-${option.id}`} className={`cursor-pointer ${option.color}`}>
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {requiresComment && (
            <div className="space-y-2">
              <Label>Comentario / Justificación {requiresComment && <span className="text-destructive">*</span>}</Label>
              <Textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Escribe el motivo..."
                rows={3}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !estatusId}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
