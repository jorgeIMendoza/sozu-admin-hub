import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Copy, Eye } from "lucide-react";

const DEFAULT_PAYLOAD = JSON.stringify(
  { mensaje: { nombre: "{{nombre}}", texto: "{{texto}}", asunto: "{{asunto}}" } },
  null,
  2
);

const SAMPLE_VALUES: Record<string, string> = {
  nombre: "Margot Pérez",
  tratamiento: "Sra.",
  email: "margot@ejemplo.com",
  telefono: "525512345678",
  asunto: "Recordatorio de pago",
  texto: "<p>Tienes un pago próximo</p>",
  monto: "$5,000.00",
  fecha_pago: "25 de abril de 2026",
  mes: "abril",
  orden: "12",
  departamento: "A-1204",
  producto: "Bodega 18",
  proyecto: "Bosque Alto",
  cuenta_id: "874",
  offset: "-3",
};

function renderJsonTemplate(node: any, vars: Record<string, string>): any {
  if (node === null || node === undefined) return node;
  if (typeof node === "string")
    return node.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
  if (Array.isArray(node)) return node.map((it) => renderJsonTemplate(it, vars));
  if (typeof node === "object") {
    const out: Record<string, any> = {};
    for (const k of Object.keys(node)) out[k] = renderJsonTemplate(node[k], vars);
    return out;
  }
  return node;
}

interface AvisoPayloadSectionProps {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  payloadJson: string;
  onPayloadJsonChange: (v: string) => void;
  modo: "manual" | "cron" | "evento";
}

export function AvisoPayloadSection({
  enabled,
  onEnabledChange,
  payloadJson,
  onPayloadJsonChange,
  modo,
}: AvisoPayloadSectionProps) {
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);

  const variables = useMemo(() => {
    const base = ["nombre", "email", "asunto", "texto"];
    if (modo === "evento") return [...base, "tratamiento", "telefono", "monto", "fecha_pago", "mes", "orden", "departamento", "producto", "proyecto", "cuenta_id", "offset"];
    return base;
  }, [modo]);

  const copyVar = async (v: string) => {
    const tag = `{{${v}}}`;
    try {
      await navigator.clipboard.writeText(tag);
      toast({ title: "Copiado", description: `${tag} copiado al portapapeles` });
    } catch {
      toast({ title: "Error", description: "No se pudo copiar", variant: "destructive" });
    }
  };

  const handleEnable = (v: boolean) => {
    onEnabledChange(v);
    if (v && !payloadJson.trim()) onPayloadJsonChange(DEFAULT_PAYLOAD);
  };

  const renderedPreview = useMemo(() => {
    if (!payloadJson.trim()) return "";
    try {
      const parsed = JSON.parse(payloadJson);
      const sample: Record<string, string> = {};
      for (const v of variables) sample[v] = SAMPLE_VALUES[v] ?? "";
      return JSON.stringify(renderJsonTemplate(parsed, sample), null, 2);
    } catch (e: any) {
      return `// JSON inválido: ${e.message}`;
    }
  }, [payloadJson, variables]);

  return (
    <div className="space-y-3 border rounded-md p-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onCheckedChange={handleEnable} />
          <Label className="font-medium">Usar payload personalizado de Postmark</Label>
        </div>
        {enabled && (
          <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-3.5 w-3.5 mr-1" /> Probar render
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Si está apagado, se envía el payload clásico <code>{`{ mensaje: { nombre, texto, asunto } }`}</code>.
        Activa esta opción para mapear cualquier estructura JSON que tu template de Postmark espere.
      </p>

      {enabled && (
        <>
          <div>
            <Label className="text-xs text-muted-foreground">Variables disponibles (click para copiar)</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {variables.map((v) => (
                <Badge
                  key={v}
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground font-mono text-[11px]"
                  onClick={() => copyVar(v)}
                >
                  <Copy className="h-2.5 w-2.5 mr-1" />
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Payload (JSON)</Label>
            <Textarea
              value={payloadJson}
              onChange={(e) => onPayloadJsonChange(e.target.value)}
              className="font-mono text-xs mt-1"
              rows={10}
              placeholder={DEFAULT_PAYLOAD}
            />
          </div>
        </>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vista previa del payload renderizado</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            JSON que se enviará a Postmark usando valores de ejemplo.
          </p>
          <pre className="bg-muted rounded-md p-3 text-xs font-mono overflow-auto max-h-[500px] whitespace-pre-wrap">
            {renderedPreview}
          </pre>
          <DialogFooter>
            <Button onClick={() => setPreviewOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}