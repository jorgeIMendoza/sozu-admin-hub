import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Loader2, Check, X, GripVertical, Image as ImageIcon, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface ConfigureLevelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  building: { id: number; nombre: string; numero_pisos: string | number | null };
}

interface FloorPlanData {
  id?: number;
  nivel: number;
  imagen_url: string | null;
  regiones: any[];
}

interface UploadedImage {
  id: string;
  url: string;
  fileName: string;
  regiones: any[];
}

export const ConfigureLevelsDialog = ({ open, onOpenChange, building }: ConfigureLevelsDialogProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [floors, setFloors] = useState<FloorPlanData[]>([]);
  const [draggedImage, setDraggedImage] = useState<UploadedImage | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const numPisos = typeof building.numero_pisos === "string"
    ? parseInt(building.numero_pisos, 10)
    : building.numero_pisos || 0;

  // Fetch existing floor plans
  const { data: existingPlanos, isLoading } = useQuery({
    queryKey: ["edificio-niveles-planos", building.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edificios_niveles_planos" as any)
        .select("*")
        .eq("id_edificio", building.id)
        .eq("activo", true)
        .order("nivel", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    enabled: open && !!building.id,
  });

  // Initialize floors from existing data
  useEffect(() => {
    if (!open) return;
    const floorData: FloorPlanData[] = [];
    for (let i = 1; i <= numPisos; i++) {
      const existing = existingPlanos?.find((p: any) => p.nivel === i);
      floorData.push({
        id: existing?.id,
        nivel: i,
        imagen_url: existing?.imagen_url || null,
        regiones: existing?.regiones || [],
      });
    }
    setFloors(floorData);

    // Extract unique images from existing plans
    const uniqueUrls = new Set<string>();
    const imgs: UploadedImage[] = [];
    existingPlanos?.forEach((p: any) => {
      if (p.imagen_url && !uniqueUrls.has(p.imagen_url)) {
        uniqueUrls.add(p.imagen_url);
        imgs.push({
          id: `existing-${p.id}`,
          url: p.imagen_url,
          fileName: p.imagen_url.split("/").pop() || "plano.png",
          regiones: p.regiones || [],
        });
      }
    });
    setUploadedImages(imgs);
  }, [open, existingPlanos, numPisos]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate PNG
    if (file.type !== "image/png") {
      toast({ title: "Error", description: "Solo se permiten imágenes PNG.", variant: "destructive" });
      return;
    }

    // Convert to base64 for AI validation
    setUploading(true);
    setValidating(true);

    try {
      const base64 = await fileToBase64(file);

      // AI Validation
      const { data: validationResult, error: fnError } = await supabase.functions.invoke("validate-floor-plan", {
        body: { imageBase64: base64 },
      });

      if (fnError) throw fnError;

      if (!validationResult?.is_valid) {
        toast({
          title: "Imagen no válida",
          description: validationResult?.rejection_reason || "La imagen no parece ser un plano de ubicación con departamentos numerados.",
          variant: "destructive",
        });
        setUploading(false);
        setValidating(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setValidating(false);

      // Upload to storage
      const fileName = `plano_ubicacion_${Date.now()}.png`;
      const filePath = `planos-ubicacion/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("modelos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("modelos")
        .getPublicUrl(filePath);

      const newImage: UploadedImage = {
        id: `img-${Date.now()}`,
        url: publicUrl,
        fileName,
        regiones: validationResult?.units || [],
      };

      setUploadedImages((prev) => [...prev, newImage]);

      toast({
        title: "Plano validado y cargado",
        description: `Se detectaron ${validationResult?.units?.length || 0} departamentos.`,
      });
    } catch (error: any) {
      console.error("Error uploading floor plan:", error);
      toast({
        title: "Error",
        description: error.message || "Error al procesar la imagen.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setValidating(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDragStart = (image: UploadedImage) => {
    setDraggedImage(image);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add("ring-2", "ring-primary");
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove("ring-2", "ring-primary");
  };

  const handleDrop = (e: React.DragEvent, nivel: number) => {
    e.preventDefault();
    e.currentTarget.classList.remove("ring-2", "ring-primary");
    if (!draggedImage) return;

    setFloors((prev) =>
      prev.map((f) =>
        f.nivel === nivel
          ? { ...f, imagen_url: draggedImage.url, regiones: draggedImage.regiones }
          : f
      )
    );
    setDraggedImage(null);
  };

  const handleRemoveFloorPlan = (nivel: number) => {
    setFloors((prev) =>
      prev.map((f) => (f.nivel === nivel ? { ...f, imagen_url: null, regiones: [] } : f))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const floor of floors) {
        if (!floor.imagen_url) {
          // If existing record, deactivate
          if (floor.id) {
            await supabase
              .from("edificios_niveles_planos" as any)
              .update({ activo: false, fecha_actualizacion: new Date().toISOString() })
              .eq("id", floor.id);
          }
          continue;
        }

        if (floor.id) {
          await supabase
            .from("edificios_niveles_planos" as any)
            .update({
              imagen_url: floor.imagen_url,
              regiones: floor.regiones,
              fecha_actualizacion: new Date().toISOString(),
              activo: true,
            })
            .eq("id", floor.id);
        } else {
          await supabase
            .from("edificios_niveles_planos" as any)
            .upsert({
              id_edificio: building.id,
              nivel: floor.nivel,
              imagen_url: floor.imagen_url,
              regiones: floor.regiones,
              activo: true,
            }, { onConflict: "id_edificio,nivel" });
        }
      }

      toast({ title: "Niveles actualizados", description: "Los planos de ubicación se guardaron correctamente." });
      queryClient.invalidateQueries({ queryKey: ["edificio-niveles-planos", building.id] });
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving floor plans:", error);
      toast({ title: "Error", description: "Error al guardar los planos.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Configurar Niveles — {building.nombre}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
          {/* Left: Upload panel */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Planos de ubicación</h4>
            <p className="text-xs text-muted-foreground">
              Sube imágenes PNG de planos de piso. Arrastra y suelta sobre los niveles para asignarlos.
            </p>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full"
              >
                {validating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validando con IA...
                  </>
                ) : uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Subir plano PNG
                  </>
                )}
              </Button>
            </div>

            {/* Uploaded images list */}
            <ScrollArea className="h-[300px]">
              <div className="space-y-2 pr-2">
                {uploadedImages.map((img) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={() => handleDragStart(img)}
                    className="flex items-center gap-2 p-2 border border-border rounded-lg bg-card cursor-grab active:cursor-grabbing hover:bg-muted/50 transition-colors"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <img
                      src={img.url}
                      alt={img.fileName}
                      className="w-16 h-12 object-contain rounded border border-border bg-white"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{img.fileName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {img.regiones?.length || 0} departamentos detectados
                      </p>
                    </div>
                  </div>
                ))}
                {uploadedImages.length === 0 && !uploading && (
                  <div className="text-center py-8 text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">No hay planos subidos</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Building levels */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Edificio — {numPisos} niveles</h4>
            <p className="text-xs text-muted-foreground">
              Arrastra un plano sobre cada nivel para asignarlo.
            </p>

            <ScrollArea className="h-[350px]">
              <div className="space-y-1 pr-2">
                {floors.slice().reverse().map((floor) => (
                  <div
                    key={floor.nivel}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, floor.nivel)}
                    className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                      floor.imagen_url
                        ? "border-primary/30 bg-primary/5"
                        : "border-dashed border-border bg-muted/10"
                    }`}
                  >
                    <div className="w-10 h-10 flex items-center justify-center rounded-md bg-muted text-xs font-bold text-foreground flex-shrink-0">
                      N{floor.nivel}
                    </div>

                    {floor.imagen_url ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <img
                          src={floor.imagen_url}
                          alt={`Nivel ${floor.nivel}`}
                          className="w-12 h-8 object-contain rounded border border-border bg-white"
                        />
                        <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <button
                          onClick={() => handleRemoveFloorPlan(floor.nivel)}
                          className="ml-auto p-1 hover:bg-destructive/10 rounded"
                        >
                          <X className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground flex-1">
                        Arrastra un plano aquí
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Guardar niveles
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data:image/png;base64, prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
