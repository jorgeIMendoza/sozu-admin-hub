import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Info } from "lucide-react";

interface NuevaCartaAcuerdoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NuevaCartaAcuerdoDialog({ open, onOpenChange }: NuevaCartaAcuerdoDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [biometrica, setBiometrica] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("cartas_acuerdo")
        .insert({
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          requiere_validacion_biometrica: biometrica,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "✅ Carta creada", description: "La nueva carta de acuerdo se creó correctamente." });
      queryClient.invalidateQueries({ queryKey: ["cartas-acuerdo"] });
      setNombre("");
      setDescripcion("");
      setBiometrica(false);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "❌ Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva Carta de Acuerdo</DialogTitle>
          <DialogDescription>Crea una nueva carta configurable con su propio template y firmantes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="carta-nombre">Nombre *</Label>
            <Input
              id="carta-nombre"
              placeholder="Ej: Carta de Colaboración Comercial"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="carta-desc">Descripción</Label>
            <Textarea
              id="carta-desc"
              placeholder="Descripción opcional de esta carta..."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="carta-biometrica" className="cursor-pointer">Validación biométrica</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Si se activa, los firmantes deberán verificar su identidad con reconocimiento facial (FESCV) antes de firmar.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Switch id="carta-biometrica" checked={biometrica} onCheckedChange={setBiometrica} />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!nombre.trim() || createMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Crear Carta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
