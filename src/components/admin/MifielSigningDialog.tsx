import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2 } from "lucide-react";

interface MifielSigningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgetId: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function MifielSigningDialog({ open, onOpenChange, widgetId, onSuccess, onError }: MifielSigningDialogProps) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);
  const signedRef = useRef(false);

  useEffect(() => {
    if (!open || !widgetId) return;
    signedRef.current = false;

    const loadWidget = () => {
      if (!containerRef.current) return;
      containerRef.current.innerHTML = "";

      const widget = document.createElement("mifiel-widget") as any;
      widget.setAttribute("id", widgetId);
    const env = import.meta.env.VITE_ENVIRONMENT || "development";
      widget.setAttribute("environment", env === "production" ? "production" : "sandbox");
      containerRef.current.appendChild(widget);

      widget.addEventListener("signSuccess", () => {
        signedRef.current = true;
        if (containerRef.current) containerRef.current.innerHTML = "";
        onOpenChange(false);
        onSuccess?.();
      });
      widget.addEventListener("signError", (e: any) => {
        // Delay error handling to allow signSuccess to fire first (widget race condition)
        setTimeout(() => {
          if (signedRef.current) return;
          signedRef.current = true;
          if (containerRef.current) containerRef.current.innerHTML = "";
          onOpenChange(false);
          const msg = e?.detail?.message || "";
          if (msg && !msg.includes("already") && !msg.includes("Ya fue firmado")) {
            onError?.(msg);
          }
        }, 500);
      });
    };

    const mifielEnv = import.meta.env.VITE_ENVIRONMENT || "development";
    const mifielHost = mifielEnv === "production" ? "app.mifiel.com" : "app-sandbox.mifiel.com";
    const scriptSrc = `https://${mifielHost}/widget-component/index.js`;

    if (!scriptLoadedRef.current && !document.querySelector(`script[src="${scriptSrc}"]`)) {
      const script = document.createElement("script");
      script.src = scriptSrc;
      script.type = "module";
      script.onload = () => {
        scriptLoadedRef.current = true;
        setTimeout(loadWidget, 500);
      };
      script.onerror = () => {
        console.error("Failed to load Mifiel widget script from:", scriptSrc);
      };
      document.head.appendChild(script);
    } else {
      scriptLoadedRef.current = true;
      setTimeout(loadWidget, 300);
    }
  }, [open, widgetId, onSuccess, onError]);

  const content = (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="rounded-md border border-primary/20 bg-primary/5 p-3 mx-1 mb-3">
        <p className="text-xs text-primary font-medium">
          🔐 La firma digital robustecerá la veracidad legal del documento, complementando tu firma autógrafa.
        </p>
      </div>
      <div className="flex-1 overflow-auto">
        <div ref={containerRef} className="mifiel-fullwidth min-h-full flex items-start justify-center">
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Cargando firma digital...</p>
          </div>
        </div>
      </div>
      <style>{`
        .mifiel-fullwidth mifiel-widget {
          --mifiel-widget-max-width: 100% !important;
          width: 100% !important;
          zoom: 1 !important;
        }

        .mifiel-fullwidth mifiel-widget,
        .mifiel-fullwidth mifiel-widget > div,
        .mifiel-fullwidth mifiel-widget > div > div {
          max-width: 100% !important;
          width: 100% !important;
          transform: none !important;
        }
      `}</style>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[98vh] h-[98vh] rounded-t-3xl overflow-hidden flex flex-col">
          <DrawerHeader className="text-left pb-1 px-4 shrink-0">
            <DrawerTitle>Firma Digital</DrawerTitle>
            <DrawerDescription>Firma la Carta de Acuerdos de forma electrónica</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-hidden flex flex-col px-1 pb-1">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-[95vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Firma Digital</DialogTitle>
          <DialogDescription>Firma la Carta de Acuerdos de forma electrónica</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col">{content}</div>
      </DialogContent>
    </Dialog>
  );
}
