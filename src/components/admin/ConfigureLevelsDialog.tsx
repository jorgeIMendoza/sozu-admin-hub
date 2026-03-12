import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Loader2, Check, X, GripVertical, Image as ImageIcon, Layers, Building2 } from "lucide-react";
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
  const [hoveredFloor, setHoveredFloor] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const numPisos = typeof building.numero_pisos === "string"
    ? parseInt(building.numero_pisos, 10)
    : building.numero_pisos || 0;

  const { data: existingPlanos } = useQuery({
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

    if (file.type !== "image/png") {
      toast({ title: "Error", description: "Solo se permiten imágenes PNG.", variant: "destructive" });
      return;
    }

    setUploading(true);
    setValidating(true);

    try {
      const base64 = await fileToBase64(file);

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
  };

  const handleDrop = (e: React.DragEvent, nivel: number) => {
    e.preventDefault();
    setHoveredFloor(null);
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

  const assignedCount = floors.filter((f) => f.imagen_url).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[900px] max-h-[90vh] p-0 gap-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/30">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-base font-semibold">Configurar Niveles</p>
                <p className="text-xs text-muted-foreground font-normal">{building.nombre} — {numPisos} niveles</p>
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr,280px] gap-0 min-h-[500px]">
          {/* Left: Building visualization */}
          <div className="p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-foreground">Vista del edificio</h4>
              <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {assignedCount}/{numPisos} niveles asignados
              </span>
            </div>

            <ScrollArea className="flex-1">
              <div className="flex flex-col items-center gap-0 pb-2">
                {/* Roof */}
                <div className="w-[280px] h-3 bg-muted-foreground/20 rounded-t-xl" />

                {floors.slice().reverse().map((floor, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === floors.length - 1;
                  const hasImage = !!floor.imagen_url;

                  return (
                    <div
                      key={floor.nivel}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setHoveredFloor(floor.nivel);
                      }}
                      onDragLeave={() => setHoveredFloor(null)}
                      onDrop={(e) => handleDrop(e, floor.nivel)}
                      className={`
                        w-[280px] flex items-center border-x border-b transition-all duration-150 group relative
                        ${hasImage
                          ? "bg-primary/5 border-primary/20"
                          : "bg-card border-border"
                        }
                        ${hoveredFloor === floor.nivel ? "ring-2 ring-primary ring-inset bg-primary/10" : ""}
                        ${isLast ? "rounded-b-lg" : ""}
                      `}
                      style={{ minHeight: numPisos > 10 ? "36px" : "44px" }}
                    >
                      {/* Level indicator */}
                      <div className={`
                        w-12 flex items-center justify-center border-r h-full text-xs font-bold
                        ${hasImage ? "bg-primary/10 text-primary border-primary/20" : "bg-muted/50 text-muted-foreground border-border"}
                      `}>
                        {floor.nivel}
                      </div>

                      {/* Content */}
                      <div className="flex-1 flex items-center px-3 gap-2 min-w-0">
                        {hasImage ? (
                          <>
                            <img
                              src={floor.imagen_url!}
                              alt={`N${floor.nivel}`}
                              className="w-8 h-6 object-contain rounded border border-primary/20 bg-white flex-shrink-0"
                            />
                            <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                            <span className="text-[10px] text-muted-foreground truncate flex-1">Plano asignado</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/60 italic">
                            {hoveredFloor === floor.nivel ? "Soltar aquí" : "Sin plano"}
                          </span>
                        )}
                      </div>

                      {/* Remove button */}
                      {hasImage && (
                        <button
                          onClick={() => handleRemoveFloorPlan(floor.nivel)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 mr-2 hover:bg-destructive/10 rounded"
                        >
                          <X className="h-3 w-3 text-destructive" />
                        </button>
                      )}

                      {/* Floor windows decoration */}
                      {!hasImage && (
                        <div className="absolute right-3 flex gap-1.5 opacity-20">
                          {[...Array(3)].map((_, i) => (
                            <div key={i} className="w-2.5 h-3 rounded-sm border border-muted-foreground/40" />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Ground */}
                <div className="w-[320px] h-2 bg-muted-foreground/30 rounded-b-sm" />
                <div className="w-[340px] h-1 bg-muted-foreground/15 rounded-b-sm" />
              </div>
            </ScrollArea>
          </div>

          {/* Right: Upload panel */}
          <div className="border-l border-border bg-muted/10 p-4 flex flex-col">
            <h4 className="text-sm font-semibold text-foreground mb-1">Planos de piso</h4>
            <p className="text-[10px] text-muted-foreground mb-3">
              Sube imágenes PNG. Arrastra y suelta sobre los niveles del edificio.
            </p>

            <div className="mb-3">
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
                className="w-full text-xs"
              >
                {validating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Validando IA...
                  </>
                ) : uploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Subir plano PNG
                  </>
                )}
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-2 pr-1">
                {uploadedImages.map((img) => (
                  <div
                    key={img.id}
                    draggable
                    onDragStart={() => handleDragStart(img)}
                    className="flex items-center gap-2 p-2 border border-border rounded-lg bg-card cursor-grab active:cursor-grabbing hover:border-primary/40 hover:shadow-sm transition-all"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                    <img
                      src={img.url}
                      alt={img.fileName}
                      className="w-14 h-10 object-contain rounded border border-border bg-white"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium truncate">{img.fileName}</p>
                      <p className="text-[9px] text-muted-foreground">
                        {img.regiones?.length || 0} deptos
                      </p>
                    </div>
                  </div>
                ))}
                {uploadedImages.length === 0 && !uploading && (
                  <div className="text-center py-6 text-muted-foreground">
                    <ImageIcon className="h-7 w-7 mx-auto mb-1.5 opacity-30" />
                    <p className="text-[10px]">No hay planos</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-border bg-muted/20">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
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
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
