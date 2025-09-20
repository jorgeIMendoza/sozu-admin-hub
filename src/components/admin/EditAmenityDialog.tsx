import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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
  DialogFooter
} from "@/components/ui/dialog";
import { Edit, Wand2, Upload, X, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageUploadField } from "./ImageUploadField";

interface EditAmenityDialogProps {
  amenityId: number;
  amenityName: string;
  onAmenityUpdated?: () => void;
  onAmenityDeleted?: () => void;
  trigger?: React.ReactNode;
}

export function EditAmenityDialog({ 
  amenityId, 
  amenityName: initialName, 
  onAmenityUpdated, 
  onAmenityDeleted,
  trigger 
}: EditAmenityDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amenityName, setAmenityName] = useState(initialName);
  const [iconUrl, setIconUrl] = useState("");
  const [iconDescription, setIconDescription] = useState("");
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const [isGeneratingIcon, setIsGeneratingIcon] = useState(false);

  // Fetch amenity details when dialog opens
  const { data: amenityDetails } = useQuery({
    queryKey: ['amenidad', amenityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('amenidades')
        .select('*')
        .eq('id', amenityId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: open && !!amenityId
  });

  useEffect(() => {
    if (amenityDetails) {
      setAmenityName(amenityDetails.nombre);
      setIconUrl(amenityDetails.url || "");
      // Auto-populate description with amenity name when opening AI generator
      if (showAiGenerator && !iconDescription) {
        setIconDescription(`Icono de ${amenityDetails.nombre.toLowerCase()}, estilo minimalista`);
      }
    }
  }, [amenityDetails, showAiGenerator]);

  const updateAmenityMutation = useMutation({
    mutationFn: async (amenityData: { name: string; iconUrl: string }) => {
      const { data, error } = await supabase
        .from('amenidades')
        .update({
          nombre: amenityData.name,
          url: amenityData.iconUrl,
        })
        .eq('id', amenityId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['amenidades'] });
      queryClient.invalidateQueries({ queryKey: ['amenidad', amenityId] });
      setOpen(false);
      resetForm();
      onAmenityUpdated?.();
      toast({ title: "Amenidad actualizada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al actualizar amenidad", variant: "destructive" });
    }
  });

  const deleteAmenityMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('amenidades')
        .update({ activo: false })
        .eq('id', amenityId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['amenidades'] });
      setOpen(false);
      resetForm();
      onAmenityDeleted?.();
      toast({ title: "Amenidad eliminada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al eliminar amenidad", variant: "destructive" });
    }
  });

  const generateIconMutation = useMutation({
    mutationFn: async (description: string) => {
      const { data, error } = await supabase.functions.invoke('generate-amenity-icon', {
        body: { description }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.iconUrl) {
        setIconUrl(data.iconUrl);
        setShowAiGenerator(false);
        setIconDescription("");
        toast({ title: "Icono generado exitosamente" });
      }
    },
    onError: () => {
      toast({ title: "Error al generar icono", variant: "destructive" });
    }
  });

  const handleUpdate = () => {
    if (!amenityName.trim()) {
      toast({ title: "Por favor ingresa un nombre para la amenidad", variant: "destructive" });
      return;
    }

    updateAmenityMutation.mutate({
      name: amenityName.trim(),
      iconUrl: iconUrl.trim()
    });
  };

  const handleDelete = () => {
    if (confirm("¿Estás seguro de que quieres eliminar esta amenidad? Esta acción no se puede deshacer.")) {
      deleteAmenityMutation.mutate();
    }
  };

  const handleGenerateIcon = () => {
    if (!iconDescription.trim()) {
      toast({ title: "Primero ingresa el nombre de la amenidad", variant: "destructive" });
      return;
    }

    setIsGeneratingIcon(true);
    generateIconMutation.mutate(iconDescription.trim());
  };

  useEffect(() => {
    if (!generateIconMutation.isPending) {
      setIsGeneratingIcon(false);
    }
  }, [generateIconMutation.isPending]);

  const resetForm = () => {
    setAmenityName(initialName);
    setIconUrl("");
    setIconDescription("");
    setShowAiGenerator(false);
    setIsGeneratingIcon(false);
  };

  const defaultTrigger = (
    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
      <Edit className="h-3 w-3" />
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      setOpen(newOpen);
      if (!newOpen) resetForm();
    }}>
      <div 
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ display: 'contents' }}
      >
        {trigger || defaultTrigger}
      </div>
      
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Editar Amenidad</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="amenity-name">Nombre de la Amenidad</Label>
            <Input
              id="amenity-name"
              value={amenityName}
              onChange={(e) => setAmenityName(e.target.value)}
              placeholder="Ej: Piscina, Gimnasio, Área de juegos..."
              className="mt-1"
            />
          </div>

          <div>
            <Label>Icono de la Amenidad</Label>
            
            <div className="mt-2 space-y-3">
              {iconUrl && (
                <div className="flex items-center space-x-3 p-3 border rounded-lg bg-muted/30">
                  <img 
                    src={iconUrl} 
                    alt="Icono de amenidad" 
                    className="w-12 h-12 object-contain rounded border bg-white p-1"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Icono actual</p>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setIconUrl("")}
                      className="mt-1"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Remover
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAiGenerator(!showAiGenerator)}
                  className="flex items-center gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  {showAiGenerator ? 'Ocultar' : 'Generar'} con IA
                </Button>
              </div>

               {showAiGenerator && (
                 <div className="space-y-3 p-4 border rounded-lg bg-muted/20">
                   <div>
                     <Label htmlFor="icon-description">Descripción para generar icono</Label>
                     <Textarea
                       id="icon-description"
                       value={iconDescription}
                       onChange={(e) => setIconDescription(e.target.value)}
                       placeholder={`Ej: Icono de ${amenityName.toLowerCase()}, estilo minimalista...`}
                       className="mt-1"
                       rows={2}
                       autoFocus
                     />
                   </div>
                   
                   <Button
                     type="button"
                     onClick={handleGenerateIcon}
                     disabled={isGeneratingIcon || !iconDescription.trim()}
                     className="w-full"
                   >
                     <Wand2 className="w-4 h-4 mr-2" />
                     {isGeneratingIcon ? "Generando..." : "Generar Icono"}
                   </Button>
                 </div>
               )}

              <ImageUploadField
                label="O sube tu propio icono"
                value={iconUrl}
                onChange={setIconUrl}
                accept=".png,.jpg,.jpeg,.gif,.svg,.webp"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteAmenityMutation.isPending}
            className="mr-auto"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {deleteAmenityMutation.isPending ? "Eliminando..." : "Eliminar"}
          </Button>
          
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateAmenityMutation.isPending}
            >
              {updateAmenityMutation.isPending ? "Actualizando..." : "Actualizar Amenidad"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}