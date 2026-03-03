import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PdfViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
}

function extractStoragePath(url: string): { bucket: string; path: string } | null {
  // If it's a full public Supabase storage URL, extract bucket+path for signed URL
  const publicMatch = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?.*)?$/);
  if (publicMatch) return { bucket: publicMatch[1], path: decodeURIComponent(publicMatch[2]) };

  // Mifiel API file endpoints are handled separately via edge function
  if (/\/?api\/v1\/documents\/[^/]+\/file(?:_signed)?(?:\?.*)?$/i.test(url)) {
    return null;
  }

  // If it's just a relative path like "cartas/xxx.pdf", assume firmas-digitales bucket
  if (!url.startsWith("http") && !url.startsWith("blob:")) {
    return { bucket: "firmas-digitales", path: url };
  }

  return null;
}

export function PdfViewerDialog({ open, onOpenChange, url, title = "Documento PDF" }: PdfViewerDialogProps) {
  const isMobile = useIsMobile();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !url) {
      setSignedUrl(null);
      setError(null);
      return;
    }

    const mifielMatch = url.match(/\/?api\/v1\/documents\/([^/]+)\/file(?:_signed)?(?:\?.*)?$/i);
    if (mifielMatch?.[1]) {
      setLoading(true);
      setError(null);
      supabase.functions
        .invoke("mifiel-consultar-documento", { body: { document_id: mifielMatch[1] } })
        .then(({ data, error: invokeError }) => {
          if (invokeError || !data?.success) {
            setError("No se pudo cargar el PDF firmado.");
            setSignedUrl(null);
            return;
          }
          const resolvedUrl = data?.signed_pdf_url || data?.pdf_storage_url || null;
          if (!resolvedUrl) {
            setError("No se encontró el PDF firmado.");
            setSignedUrl(null);
            return;
          }
          setSignedUrl(resolvedUrl);
        })
        .finally(() => setLoading(false));
      return;
    }

    const storageInfo = extractStoragePath(url);
    if (!storageInfo) {
      // It's a regular URL, use directly
      setSignedUrl(url);
      return;
    }

    setLoading(true);
    setError(null);

    console.log("[PdfViewerDialog] Generating signed URL for:", storageInfo.bucket, storageInfo.path);

    supabase.storage
      .from(storageInfo.bucket)
      .createSignedUrl(storageInfo.path, 3600) // 1 hour
      .then(({ data, error: err }) => {
        if (err || !data?.signedUrl) {
          console.error("[PdfViewerDialog] Error creating signed URL:", err, "bucket:", storageInfo.bucket, "path:", storageInfo.path);
          setError("No se pudo generar un enlace seguro para el PDF.");
          setSignedUrl(null);
        } else {
          console.log("[PdfViewerDialog] Signed URL generated successfully");
          setSignedUrl(data.signedUrl);
        }
      })
      .finally(() => setLoading(false));
  }, [open, url]);

  const effectiveUrl = signedUrl || "";

  const content = (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex justify-end mb-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!effectiveUrl}
          onClick={() => window.open(effectiveUrl, "_blank")}
          className="gap-1.5"
        >
          <Download className="h-4 w-4" />
          Descargar
        </Button>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {error}
        </div>
      ) : (
        <iframe src={effectiveUrl} className="flex-1 w-full rounded border" title={title} />
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[95vh] h-[95vh] rounded-t-3xl overflow-hidden flex flex-col">
          <DrawerHeader className="text-left pb-1 px-4 shrink-0">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>Documento firmado</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-hidden flex flex-col px-4 pb-4">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-full max-h-[90vh] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Documento firmado</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col">{content}</div>
      </DialogContent>
    </Dialog>
  );
}
