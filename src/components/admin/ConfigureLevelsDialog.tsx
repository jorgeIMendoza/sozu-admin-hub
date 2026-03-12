import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Loader2, Check, X, GripVertical, Image as ImageIcon, Building2, ZoomIn, PencilRuler } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FloorMeshEditorDialog } from "@/components/admin/FloorMeshEditorDialog";

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

interface MeshEditorSession {
  mode: "new" | "existing";
  image: UploadedImage;
  storagePath?: string;
}

// Image preview dialog
const ImagePreviewDialog = ({ url, open, onClose }: { url: string | null; open: boolean; onClose: () => void }) => {
  if (!url) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] p-2 bg-black/95 border-none">
        <img src={url} alt="Vista previa" className="w-full h-full max-h-[85vh] object-contain rounded" />
      </DialogContent>
    </Dialog>
  );
};

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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [meshSession, setMeshSession] = useState<MeshEditorSession | null>(null);
  const [meshEditorOpen, setMeshEditorOpen] = useState(false);
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

  const handleDeleteImage = (imgId: string) => {
    const img = uploadedImages.find((i) => i.id === imgId);
    if (!img) return;
    setUploadedImages((prev) => prev.filter((i) => i.id !== imgId));
    setFloors((prev) =>
      prev.map((f) => (f.imagen_url === img.url ? { ...f, imagen_url: null, regiones: [] } : f))
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
    <>
      <ImagePreviewDialog url={previewUrl} open={!!previewUrl} onClose={() => setPreviewUrl(null)} />
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
                <div className="flex flex-col items-center pb-4">
                  {/* Roof */}
                  <div className="relative w-[300px] mb-0">
                    {/* Antenna */}
                    <div className="absolute left-1/2 -translate-x-1/2 -top-6 w-[2px] h-6 bg-muted-foreground/30" />
                    <div className="absolute left-1/2 -translate-x-1/2 -top-7 w-3 h-3 rounded-full bg-muted-foreground/20 border border-muted-foreground/30" />
                    {/* Main roof */}
                    <div className="h-4 bg-gradient-to-b from-muted-foreground/40 to-muted-foreground/20 rounded-t-xl border-x border-t border-muted-foreground/25 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-muted-foreground/10 to-transparent" />
                    </div>
                    {/* Roof ledge */}
                    <div className="h-1.5 bg-muted-foreground/15 border-x border-muted-foreground/20 -mx-1 rounded-sm" style={{ width: "calc(100% + 8px)", marginLeft: "-4px" }} />
                  </div>

                  {floors.slice().reverse().map((floor, idx) => {
                    const isLast = idx === floors.length - 1;
                    const hasImage = !!floor.imagen_url;
                    const floorHeight = numPisos > 12 ? 40 : numPisos > 8 ? 48 : 56;

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
                          w-[300px] flex items-stretch group relative transition-all duration-200
                          border-x border-b
                          ${hasImage
                            ? "bg-gradient-to-r from-primary/8 via-primary/4 to-primary/8 border-primary/25"
                            : "bg-card border-muted-foreground/15"
                          }
                          ${hoveredFloor === floor.nivel ? "ring-2 ring-primary ring-inset bg-primary/15 scale-[1.02] z-10 shadow-lg" : ""}
                          ${isLast ? "rounded-b-lg" : ""}
                        `}
                        style={{ height: `${floorHeight}px` }}
                      >
                        {/* Level badge */}
                        <div className={`
                          w-12 flex items-center justify-center text-[11px] font-bold tracking-wide
                          border-r
                          ${hasImage
                            ? "bg-primary/15 text-primary border-primary/20"
                            : "bg-muted/50 text-muted-foreground/50 border-muted-foreground/10"
                          }
                        `}>
                          N{floor.nivel}
                        </div>

                        {/* Floor content */}
                        <div className="flex-1 flex items-center px-3 gap-2 min-w-0 relative">
                          {hasImage ? (
                            <>
                              <div
                                className="relative flex-shrink-0 cursor-pointer group/thumb"
                                onClick={() => setPreviewUrl(floor.imagen_url)}
                              >
                                <img
                                  src={floor.imagen_url!}
                                  alt={`N${floor.nivel}`}
                                  className="w-10 h-8 object-contain rounded border border-primary/20 bg-white shadow-sm transition-transform group-hover/thumb:scale-105"
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 bg-black/30 rounded transition-opacity">
                                  <ZoomIn className="h-3 w-3 text-white" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-sm border border-white">
                                  <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                                </div>
                              </div>
                              <span className="text-[10px] text-primary/80 font-medium">Plano asignado</span>
                            </>
                          ) : (
                            <>
                              {/* Window pattern */}
                              <div className="flex gap-3 mx-auto">
                                {[...Array(Math.min(5, Math.max(3, Math.floor(240 / 60))))].map((_, i) => (
                                  <div key={i} className="flex flex-col gap-0.5">
                                    <div
                                      className="rounded-[2px] bg-gradient-to-b from-sky-200/20 to-sky-300/10 border border-muted-foreground/10"
                                      style={{ width: "12px", height: `${floorHeight * 0.35}px` }}
                                    />
                                    <div
                                      className="rounded-[2px] bg-gradient-to-b from-sky-200/15 to-sky-300/8 border border-muted-foreground/8"
                                      style={{ width: "12px", height: `${floorHeight * 0.2}px` }}
                                    />
                                  </div>
                                ))}
                              </div>
                              {hoveredFloor === floor.nivel && (
                                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-primary bg-primary/10 rounded backdrop-blur-[1px]">
                                  Soltar aquí
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        {/* Remove button */}
                        {hasImage && (
                          <button
                            onClick={() => handleRemoveFloorPlan(floor.nivel)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 mr-1 my-auto hover:bg-destructive/10 rounded-md"
                          >
                            <X className="h-3 w-3 text-destructive" />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Foundation */}
                  <div className="w-[312px] h-2 bg-gradient-to-b from-muted-foreground/30 to-muted-foreground/20 rounded-b-md border-x border-b border-muted-foreground/20" />
                  <div className="w-[324px] h-3 bg-gradient-to-b from-muted-foreground/15 to-muted-foreground/5 rounded-b-lg" />
                  {/* Ground line */}
                  <div className="w-[360px] h-[1px] bg-muted-foreground/15 mt-1" />
                  <div className="w-[340px] h-[1px] bg-muted-foreground/8 mt-px" />
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
                      className="border border-border rounded-lg bg-card hover:border-primary/40 hover:shadow-sm transition-all overflow-hidden"
                    >
                      <div className="flex items-center gap-2 p-2 cursor-grab active:cursor-grabbing">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                        <div
                          className="relative flex-shrink-0 cursor-pointer group/img"
                          onClick={() => setPreviewUrl(img.url)}
                        >
                          <img
                            src={img.url}
                            alt={img.fileName}
                            className="w-14 h-10 object-contain rounded border border-border bg-white"
                          />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 bg-black/30 rounded transition-opacity">
                            <ZoomIn className="h-3.5 w-3.5 text-white" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium truncate">{img.fileName}</p>
                          <p className="text-[9px] text-muted-foreground">
                            {img.regiones?.length || 0} deptos detectados
                          </p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.id); }}
                          className="p-1 hover:bg-destructive/10 rounded flex-shrink-0"
                          title="Eliminar imagen"
                        >
                          <X className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                      {img.regiones && img.regiones.length > 0 && (
                        <div className="px-2 pb-2 flex flex-wrap gap-1">
                          {img.regiones.map((r: any, idx: number) => (
                            <span
                              key={idx}
                              className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium"
                            >
                              {r.unit_number || `U${idx + 1}`}
                            </span>
                          ))}
                        </div>
                      )}
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
    </>
  );
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(buffer);
      const chunkSize = 8192;
      let binary = "";
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        for (let j = 0; j < chunk.length; j++) {
          binary += String.fromCharCode(chunk[j]);
        }
      }
      resolve(btoa(binary));
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
