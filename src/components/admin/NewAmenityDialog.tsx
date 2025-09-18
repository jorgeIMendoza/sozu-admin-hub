import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Plus, Wand2, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageUploadField } from "./ImageUploadField";

interface NewAmenityDialogProps {
  onAmenityCreated?: () => void;
}

export function NewAmenityDialog({ onAmenityCreated }: NewAmenityDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amenityName, setAmenityName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [iconDescription, setIconDescription] = useState("");
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);

  const createAmenityMutation = useMutation({
    mutationFn: async (amenityData: { name: string; iconUrl: string }) => {
      const { data, error } = await supabase
        .from('amenidades')
        .insert([{
          nombre: amenityData.name,
          url: amenityData.iconUrl,
          habilitar_asignar: true
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['amenidades'] });
      resetForm();
      setOpen(false);
      onAmenityCreated?.();
      toast({ title: "Amenidad creada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al crear amenidad", variant: "destructive" });
    }
  });

  const generateIconMutation = useMutation({
    mutationFn: async (description: string) => {
      const response = await supabase.functions.invoke('generate-amenity-icon', {
        body: {
          description: description,
          amenityName: amenityName
        }
      });
      
      if (response.error) throw response.error;
      if (!response.data.success) throw new Error(response.data.error);
      
      return response.data.imageUrl;
    },
    onSuccess: (imageUrl) => {
      setIconUrl(imageUrl);
      setShowAiGenerator(false);
      setIconDescription("");
      setIsGeneratingIcon(false);
      toast({ title: "¡Icono generado exitosamente!" });
    },
    onError: (error: any) => {
      console.error('Error generando icono:', error);
      setIsGeneratingIcon(false);
      toast({ 
        title: "Error al generar icono", 
        description: error.message || "Intentalo de nuevo",
        variant: "destructive" 
      });
    }
  });

  const resetForm = () => {
    setAmenityName("");
    setIconUrl("");
    setIconDescription("");
    setShowAiGenerator(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amenityName.trim()) {
      toast({ title: "Por favor ingresa un nombre para la amenidad", variant: "destructive" });
      return;
    }
    createAmenityMutation.mutate({ 
      name: amenityName.trim(), 
      iconUrl: iconUrl 
    });
  };

  const handleGenerateIcon = () => {
    if (!amenityName.trim()) {
      toast({ title: "Primero ingresa el nombre de la amenidad", variant: "destructive" });
      return;
    }
    if (!iconDescription.trim()) {
      toast({ title: "Por favor describe el icono que quieres generar", variant: "destructive" });
      return;
    }
    setIsGeneratingIcon(true);
    generateIconMutation.mutate(iconDescription.trim());
  };

  const handleClose = () => {
    resetForm();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Nueva Amenidad
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear Nueva Amenidad</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="amenity-name">Nombre de la Amenidad</Label>
            <Input
              id="amenity-name"
              type="text"
              value={amenityName}
              onChange={(e) => setAmenityName(e.target.value)}
              placeholder="Ej. Piscina, Gimnasio, etc."
            />
          </div>

          <div className="space-y-4">
            <Label>Icono de la Amenidad</Label>
            
            {/* Preview del icono actual */}
            {iconUrl && (
              <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                <img 
                  src={iconUrl} 
                  alt="Icono de amenidad" 
                  className="w-12 h-12 object-cover rounded"
                />
                <span className="text-sm text-muted-foreground">Icono cargado</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIconUrl("")}
                  className="ml-auto"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Botones de opciones */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAiGenerator(!showAiGenerator)}
                className="flex-1"
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Generar con IA
              </Button>
            </div>

            {/* Generador de IA */}
            {showAiGenerator && (
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <Label htmlFor="icon-description">Describe el icono que quieres</Label>
                <Textarea
                  id="icon-description"
                  value={iconDescription}
                  onChange={(e) => setIconDescription(e.target.value)}
                  placeholder="Ej. Un icono de piscina azul con ondas de agua, estilo minimalista"
                  rows={3}
                />
                <Button
                  type="button"
                  onClick={handleGenerateIcon}
                  disabled={generateIconMutation.isPending || isGeneratingIcon}
                  size="sm"
                  className="w-full"
                >
                  {generateIconMutation.isPending || isGeneratingIcon ? (
                    "Generando icono..."
                  ) : (
                    "Generar Icono"
                  )}
                </Button>
              </div>
            )}

            {/* Campo de subida manual */}
            {!showAiGenerator && (
              <ImageUploadField
                label="O sube tu propio icono"
                value={iconUrl}
                onChange={setIconUrl}
                accept="image/*"
              />
            )}
          </div>
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleClose}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={createAmenityMutation.isPending || generateIconMutation.isPending}
            >
              {createAmenityMutation.isPending ? "Creando..." : "Crear Amenidad"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}