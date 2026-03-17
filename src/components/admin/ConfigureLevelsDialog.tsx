import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Loader2, Check, X, GripVertical, Image as ImageIcon, Building2, ZoomIn, PencilRuler } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FloorMeshEditorDialog } from "@/components/admin/FloorMeshEditorDialog";
import { cn } from "@/lib/utils";

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

const getRegionUnitLabel = (region: any, index: number) => {
  const raw = (region?.unit_number ?? "").toString().trim();
  return raw.length > 0 ? raw : `U${index + 1}`;
};

const resolveRegionConfirmed = (region: any) => {
  const value = region?.mesh_confirmed ?? region?.confirmed;

  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "si", "sí"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }

  return true;
};

const hasRegionMeshAssigned = (region: any) => {
  const unitLabel = (region?.unit_number ?? "").toString().trim();
  const polygon = Array.isArray(region?.polygon) ? region.polygon : [];
  const hasValidPolygon = polygon.length >= 3;

  return unitLabel.length > 0 && hasValidPolygon && resolveRegionConfirmed(region);
};

// Image preview dialog
const ImagePreviewDialog = ({ url, open, onClose }: { url: string | null; open: boolean; onClose: () => void }) => {
  if (!url) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh] p-2 bg-foreground/95 border-none">
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
  const [recalculating, setRecalculating] = useState(false);
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
        const rawSegment = p.imagen_url.split("/").pop() || "plano.png";
        const decoded = decodeURIComponent(rawSegment);
        // Strip leading timestamp prefix (e.g. "1773769630227_")
        const cleanName = decoded.replace(/^\d+_/, "");
        imgs.push({
          id: `existing-${p.id}`,
          url: p.imagen_url,
          fileName: cleanName,
          regiones: Array.isArray(p.regiones) ? p.regiones : (typeof p.regiones === 'string' ? JSON.parse(p.regiones) : []),
        });
      }
    });
    setUploadedImages(imgs);
  }, [open, existingPlanos, numPisos]);

  const handleMeshEditorClose = () => {
    if (meshSession?.mode === "new" && meshSession.storagePath) {
      void supabase.storage.from("modelos").remove([meshSession.storagePath]);
    }

    setMeshEditorOpen(false);
    setMeshSession(null);
  };

  const handleMeshSave = async (regiones: any[]) => {
    if (!meshSession) return;

    if (meshSession.mode === "new") {
      const imageToAdd: UploadedImage = {
        ...meshSession.image,
        regiones,
      };
      setUploadedImages((prev) => [...prev, imageToAdd]);
      toast({
        title: "Malla guardada",
        description: `Plano cargado con ${regiones.length} departamentos enmallados.`,
      });
    } else {
      setUploadedImages((prev) =>
        prev.map((img) => (img.id === meshSession.image.id ? { ...img, regiones } : img))
      );
      const updatedFloors = floors.map((floor) =>
        floor.imagen_url === meshSession.image.url ? { ...floor, regiones } : floor
      );
      setFloors(updatedFloors);

      // Auto-persist to DB for floors that already exist
      try {
        for (const floor of updatedFloors) {
          if (floor.imagen_url === meshSession.image.url && floor.id) {
            await supabase
              .from("edificios_niveles_planos" as any)
              .update({
                regiones,
                fecha_actualizacion: new Date().toISOString(),
              })
              .eq("id", floor.id);
          }
        }
        queryClient.invalidateQueries({ queryKey: ["edificio-niveles-planos", building.id] });
        toast({
          title: "Malla actualizada y guardada",
          description: "Los cambios se guardaron en la base de datos.",
        });
      } catch (err: any) {
        toast({
          title: "Malla actualizada localmente",
          description: "Se guardó en pantalla pero hubo un error al persistir. Guarda los niveles manualmente.",
          variant: "destructive",
        });
      }
    }

    setMeshEditorOpen(false);
    setMeshSession(null);
  };

  const handleRecalculateMesh = async () => {
    if (!meshSession?.image.url) return;
    setRecalculating(true);
    try {
      const resp = await fetch(meshSession.image.url);
      const blob = await resp.blob();
      const base64 = await fileToBase64(new File([blob], "recalc.png", { type: "image/png" }));

      const { data: result, error } = await supabase.functions.invoke("validate-floor-plan", {
        body: { imageBase64: base64 },
      });
      if (error) throw error;

      const newRegions = result?.units || [];
      const updatedImage = { ...meshSession.image, regiones: newRegions };
      setMeshSession((prev) => prev ? { ...prev, image: updatedImage } : prev);
      setMeshEditorOpen(false);
      setTimeout(() => {
        setMeshSession((prev) => prev ? { ...prev, image: updatedImage } : prev);
        setMeshEditorOpen(true);
      }, 50);

      toast({
        title: "Mallas recalculadas",
        description: `Se detectaron ${newRegions.length} regiones. Ajusta si es necesario.`,
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Error al recalcular.", variant: "destructive" });
    } finally {
      setRecalculating(false);
    }
  };

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

      const fileName = file.name;
      const filePath = `planos-ubicacion/${Date.now()}_${fileName}`;

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

      setMeshSession({ mode: "new", image: newImage, storagePath: filePath });
      setMeshEditorOpen(true);

      toast({
        title: "Plano cargado",
        description: `Revisa y ajusta la malla (${validationResult?.units?.length || 0} regiones) antes de asignarlo.`,
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

  const handleEditMesh = (img: UploadedImage) => {
    setMeshSession({ mode: "existing", image: img });
    setMeshEditorOpen(true);
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
      <FloorMeshEditorDialog
        open={meshEditorOpen}
        imageUrl={meshSession?.image.url || null}
        initialRegions={(meshSession?.image.regiones || []) as any[]}
        title={meshSession?.mode === "new" ? "Confirma y edita la malla detectada" : "Editar malla del plano"}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleMeshEditorClose();
        }}
        onSave={handleMeshSave}
        onRecalculate={handleRecalculateMesh}
        recalculating={recalculating}
      />
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-[980px] max-h-[90vh] p-0 gap-0 overflow-hidden"
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

          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr),320px] gap-0 min-h-[500px] max-h-[calc(90vh-120px)]">
            {/* Left: Building visualization */}
            <div className="p-5 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h4 className="text-sm font-semibold text-foreground">Vista del edificio</h4>
                <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {assignedCount}/{numPisos} niveles asignados
                </span>
              </div>

              <ScrollArea className="flex-1 min-h-0">
                <div className="flex flex-col items-center pb-6 pt-12">
                  {/* === SKY with clouds === */}
                  <div className="relative w-[380px] h-8 mb-0">
                    {/* Cloud 1 */}
                    <div className="absolute left-4 top-0 flex gap-0">
                      <div className="w-5 h-3 rounded-full bg-muted-foreground/8" />
                      <div className="w-8 h-4 rounded-full bg-muted-foreground/10 -ml-2 -mt-1" />
                      <div className="w-5 h-3 rounded-full bg-muted-foreground/8 -ml-2" />
                    </div>
                    {/* Cloud 2 */}
                    <div className="absolute right-8 top-2 flex gap-0">
                      <div className="w-4 h-2.5 rounded-full bg-muted-foreground/6" />
                      <div className="w-6 h-3 rounded-full bg-muted-foreground/8 -ml-1.5 -mt-0.5" />
                      <div className="w-4 h-2.5 rounded-full bg-muted-foreground/6 -ml-1.5" />
                    </div>
                  </div>

                  {/* === ROOF with penthouse style === */}
                  <div className="relative w-[300px] mb-0">
                    {/* Antenna / spire */}
                    <div className="absolute left-1/2 -translate-x-1/2 -top-10 flex flex-col items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-destructive/60 animate-pulse" />
                      <div className="w-[1.5px] h-4 bg-muted-foreground/40" />
                      <div className="w-3 h-[1px] bg-muted-foreground/30 -mt-1" />
                      <div className="w-[1.5px] h-5 bg-muted-foreground/30" />
                    </div>
                    {/* Penthouse box */}
                    <div className="absolute left-1/2 -translate-x-1/2 -top-3 w-16 h-3 bg-gradient-to-b from-muted-foreground/25 to-muted-foreground/15 rounded-t-md border-x border-t border-muted-foreground/20" />
                    {/* Main roof */}
                    <div className="h-5 bg-gradient-to-b from-muted-foreground/35 to-muted-foreground/18 rounded-t-xl border-x border-t border-muted-foreground/25 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-background/10 to-transparent" />
                      {/* Roof accent line */}
                      <div className="absolute bottom-0 left-4 right-4 h-[1px] bg-muted-foreground/15" />
                    </div>
                    {/* Roof ledge / cornice */}
                    <div
                      className="h-2 bg-gradient-to-b from-muted-foreground/20 to-muted-foreground/10 border-x border-muted-foreground/20 rounded-sm"
                      style={{ width: "calc(100% + 10px)", marginLeft: "-5px" }}
                    />
                  </div>

                  {/* === FLOORS === */}
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
                        className={cn(
                          "w-[300px] flex items-stretch group relative transition-all duration-200 border-x border-b",
                          hasImage
                            ? "bg-gradient-to-r from-primary/8 via-primary/4 to-primary/8 border-primary/25"
                            : "bg-card border-muted-foreground/15",
                          hoveredFloor === floor.nivel && "ring-2 ring-primary ring-inset bg-primary/15 scale-[1.02] z-10 shadow-lg",
                          isLast && "rounded-b-lg"
                        )}
                        style={{ height: `${floorHeight}px` }}
                      >
                        {/* Level badge */}
                        <div className={cn(
                          "w-12 flex items-center justify-center text-[11px] font-bold tracking-wide border-r",
                          hasImage
                            ? "bg-primary/15 text-primary border-primary/20"
                            : "bg-muted/50 text-muted-foreground/50 border-muted-foreground/10"
                        )}>
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
                                  className="w-10 h-8 object-contain rounded border border-primary/20 bg-background shadow-sm transition-transform group-hover/thumb:scale-105"
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 bg-foreground/30 rounded transition-opacity">
                                  <ZoomIn className="h-3 w-3 text-background" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center shadow-sm border border-background">
                                  <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                                </div>
                              </div>
                              <span className="text-[10px] text-primary/80 font-medium">Plano asignado</span>
                            </>
                          ) : (
                            <>
                              {/* Window pattern - glass effect */}
                              <div className="flex gap-2.5 mx-auto">
                                {[...Array(Math.min(5, Math.max(3, Math.floor(240 / 55))))].map((_, i) => (
                                  <div key={i} className="flex flex-col gap-[2px]">
                                    <div
                                      className="rounded-[1px] bg-gradient-to-br from-primary/15 via-primary/8 to-accent/10 border border-muted-foreground/10 shadow-inner"
                                      style={{ width: "14px", height: `${floorHeight * 0.55}px` }}
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

                  {/* === LOBBY / ENTRANCE === */}
                  <div className="relative w-[300px]">
                    {/* Foundation top */}
                    <div className="h-2 bg-gradient-to-b from-muted-foreground/25 to-muted-foreground/15 border-x border-muted-foreground/20" />
                    {/* Entrance area */}
                    <div className="h-10 bg-gradient-to-b from-muted/60 to-muted/30 border-x border-b border-muted-foreground/20 flex items-end justify-center gap-6 px-4 rounded-b-lg relative overflow-hidden">
                      {/* Glass door left */}
                      <div className="w-8 h-7 bg-gradient-to-b from-primary/15 to-primary/5 border border-muted-foreground/15 rounded-t-md mb-0" />
                      {/* Main door (revolving) */}
                      <div className="relative">
                        <div className="w-10 h-8 bg-gradient-to-b from-primary/20 to-primary/8 border border-muted-foreground/20 rounded-t-lg mb-0" />
                        {/* Door handle */}
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1 h-2 rounded-full bg-muted-foreground/30" />
                      </div>
                      {/* Glass door right */}
                      <div className="w-8 h-7 bg-gradient-to-b from-primary/15 to-primary/5 border border-muted-foreground/15 rounded-t-md mb-0" />
                    </div>
                  </div>

                  {/* === FOUNDATION / BASE === */}
                  <div className="w-[316px] h-2.5 bg-gradient-to-b from-muted-foreground/25 to-muted-foreground/12 rounded-b-md border-x border-b border-muted-foreground/15" />
                  <div className="w-[330px] h-1.5 bg-gradient-to-b from-muted-foreground/10 to-transparent rounded-b-lg" />

                  {/* === GROUND SCENE === */}
                  <div className="relative w-[420px] mt-1">
                    {/* Sidewalk */}
                    <div className="h-3 bg-gradient-to-b from-muted-foreground/12 to-muted-foreground/6 rounded-sm mx-8" />
                    {/* Road */}
                    <div className="h-5 bg-muted-foreground/8 mx-4 relative overflow-hidden rounded-sm">
                      {/* Road dashes */}
                      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 flex justify-center gap-4">
                        {[...Array(8)].map((_, i) => (
                          <div key={i} className="w-4 h-[1.5px] bg-muted-foreground/20 rounded-full" />
                        ))}
                      </div>
                    </div>
                    {/* Bottom sidewalk */}
                    <div className="h-2 bg-gradient-to-b from-muted-foreground/8 to-transparent mx-8 rounded-b-sm" />

                    {/* === DECORATIVE ELEMENTS === */}
                    {/* Tree left */}
                    <div className="absolute -left-2 bottom-6 flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-success/25 border border-success/15 relative">
                        <div className="absolute inset-1 rounded-full bg-success/15" />
                      </div>
                      <div className="w-1.5 h-4 bg-muted-foreground/25 rounded-b-sm -mt-1" />
                    </div>

                    {/* Tree right */}
                    <div className="absolute -right-1 bottom-6 flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full bg-success/20 border border-success/12 relative">
                        <div className="absolute inset-1 rounded-full bg-success/12" />
                      </div>
                      <div className="w-1.5 h-3.5 bg-muted-foreground/20 rounded-b-sm -mt-1" />
                    </div>

                    {/* Small bush left */}
                    <div className="absolute left-12 bottom-8 flex gap-0.5">
                      <div className="w-3 h-2.5 rounded-full bg-success/20" />
                      <div className="w-4 h-3 rounded-full bg-success/25 -ml-1" />
                      <div className="w-3 h-2.5 rounded-full bg-success/18 -ml-1" />
                    </div>

                    {/* Flowers left */}
                    <div className="absolute left-16 bottom-11 flex gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-destructive/40" />
                      <div className="w-1.5 h-1.5 rounded-full bg-warning/50" />
                      <div className="w-1.5 h-1.5 rounded-full bg-destructive/30" />
                    </div>

                    {/* Flowers right */}
                    <div className="absolute right-14 bottom-11 flex gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                      <div className="w-1.5 h-1.5 rounded-full bg-warning/40" />
                      <div className="w-1.5 h-1.5 rounded-full bg-destructive/35" />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/30" />
                    </div>

                    {/* Small bush right */}
                    <div className="absolute right-10 bottom-8 flex gap-0.5">
                      <div className="w-3 h-2 rounded-full bg-success/18" />
                      <div className="w-3.5 h-2.5 rounded-full bg-success/22 -ml-1" />
                    </div>

                    {/* Car 1 */}
                    <div className="absolute left-[30%] bottom-1.5">
                      <div className="relative">
                        <div className="w-10 h-2.5 bg-primary/25 rounded-sm border border-primary/15" />
                        <div className="absolute -top-1.5 left-1.5 w-6 h-2 bg-primary/20 rounded-t-md border-x border-t border-primary/12" />
                        {/* Wheels */}
                        <div className="absolute -bottom-1 left-0.5 w-2 h-2 rounded-full bg-muted-foreground/30 border border-muted-foreground/20" />
                        <div className="absolute -bottom-1 right-0.5 w-2 h-2 rounded-full bg-muted-foreground/30 border border-muted-foreground/20" />
                      </div>
                    </div>

                    {/* Car 2 */}
                    <div className="absolute right-[25%] bottom-1.5">
                      <div className="relative">
                        <div className="w-9 h-2.5 bg-destructive/20 rounded-sm border border-destructive/12" />
                        <div className="absolute -top-1.5 left-2 w-5 h-2 bg-destructive/15 rounded-t-md border-x border-t border-destructive/10" />
                        <div className="absolute -bottom-1 left-0.5 w-2 h-2 rounded-full bg-muted-foreground/30 border border-muted-foreground/20" />
                        <div className="absolute -bottom-1 right-0.5 w-2 h-2 rounded-full bg-muted-foreground/30 border border-muted-foreground/20" />
                      </div>
                    </div>

                    {/* Lamp post left */}
                    <div className="absolute left-[22%] bottom-5 flex flex-col items-center">
                      <div className="w-3 h-1.5 rounded-full bg-warning/30 shadow-[0_0_4px_1px] shadow-warning/15" />
                      <div className="w-[1px] h-5 bg-muted-foreground/25" />
                    </div>

                    {/* Lamp post right */}
                    <div className="absolute right-[20%] bottom-5 flex flex-col items-center">
                      <div className="w-3 h-1.5 rounded-full bg-warning/30 shadow-[0_0_4px_1px] shadow-warning/15" />
                      <div className="w-[1px] h-5 bg-muted-foreground/25" />
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>

            {/* Right: Upload panel */}
            <div className="border-l border-border bg-muted/10 p-4 flex flex-col">
              <h4 className="text-sm font-semibold text-foreground mb-1">Planos de piso</h4>
              <p className="text-[10px] text-muted-foreground mb-3">
                Sube PNG, confirma/edita la malla y luego arrastra la imagen al nivel.
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
                <div className="space-y-2 pr-3">
                  {uploadedImages.map((img) => (
                    <div
                      key={img.id}
                      draggable
                      onDragStart={() => handleDragStart(img)}
                      className="mr-1 border border-border rounded-lg bg-card hover:border-primary/40 hover:shadow-sm transition-all overflow-hidden"
                    >
                      <div className="flex items-center gap-2 p-2.5 cursor-grab active:cursor-grabbing">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                        <div
                          className="relative flex-shrink-0 cursor-pointer group/img"
                          onClick={() => setPreviewUrl(img.url)}
                        >
                          <img
                            src={img.url}
                            alt={img.fileName}
                            className="w-14 h-10 object-contain rounded border border-border bg-background"
                          />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 bg-foreground/30 rounded transition-opacity">
                            <ZoomIn className="h-3.5 w-3.5 text-background" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium truncate">{img.fileName}</p>
                          <p className="text-[9px] text-muted-foreground">
                            {img.regiones?.length || 0} deptos detectados
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 pl-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditMesh(img);
                            }}
                            className="p-1 hover:bg-muted rounded"
                            title="Editar malla"
                          >
                            <PencilRuler className="h-3 w-3 text-muted-foreground" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.id); }}
                            className="p-1 hover:bg-destructive/10 rounded"
                            title="Eliminar imagen"
                          >
                            <X className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                      </div>
                      {img.regiones && img.regiones.length > 0 && (
                        <div className="px-2 pb-2 flex flex-wrap gap-1">
                          {img.regiones.map((r: any, idx: number) => {
                            const hasMesh = hasRegionMeshAssigned(r);
                            return (
                              <span
                                key={idx}
                                className={cn(
                                  "text-[8px] px-1.5 py-0.5 rounded-full font-medium border",
                                  hasMesh
                                    ? "bg-success/15 text-success border-success/30"
                                    : "bg-muted text-muted-foreground border-border"
                                )}
                              >
                                {getRegionUnitLabel(r, idx)}
                              </span>
                            );
                          })}
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
