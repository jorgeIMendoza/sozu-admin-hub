import { useRef, useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Eraser, Check } from "lucide-react";

interface SignaturePadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (dataUrl: string) => void;
  initialImage?: string;
}

export function SignaturePadDialog({ open, onOpenChange, onSave, initialImage }: SignaturePadDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#1a1a1a";

    if (initialImage) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        setHasContent(true);
      };
      img.src = initialImage;
    } else {
      setHasContent(false);
    }
  }, [initialImage]);

  useEffect(() => {
    if (open) {
      // Wait for dialog to render
      setTimeout(initCanvas, 100);
    }
  }, [open, initCanvas]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = getCtx();
    if (!ctx) return;
    setIsDrawing(true);
    setHasContent(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = getCtx();
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, rect.width * dpr, rect.height * dpr);
    setHasContent(false);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(dataUrl);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Firma Autógrafa</DialogTitle>
          <DialogDescription>Dibuja tu firma en el recuadro. Esta será incluida en el documento.</DialogDescription>
          <div className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-2.5 mt-2">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              ⚠️ Esta firma es únicamente ilustrativa y de vista. La firma legalmente válida es la <strong>firma digital</strong> que se realiza al finalizar el proceso de firmado.
            </p>
          </div>
        </DialogHeader>
        <div className="space-y-3">
          <div className="border-2 border-dashed rounded-lg bg-white overflow-hidden touch-none">
            <canvas
              ref={canvasRef}
              className="w-full cursor-crosshair"
              style={{ height: 180 }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={clearCanvas} className="gap-1">
              <Eraser className="h-4 w-4" />
              Limpiar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!hasContent} className="gap-1">
              <Check className="h-4 w-4" />
              Guardar firma
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
