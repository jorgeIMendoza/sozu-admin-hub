import { useState, useMemo, DragEvent } from "react";
import { format, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { replacePlaceholders } from "@/utils/templatePlaceholders";
import { GripVertical } from "lucide-react";

interface PlaceholderConfig {
  key: string;
  label: string;
  defaultValue?: string;
  editable?: boolean;
}

interface FirmanteConfig {
  name: string;
  email: string;
  cargo: string;
}

interface TemplateEditorWithPreviewProps {
  value: string;
  onChange: (html: string) => void;
  placeholders: PlaceholderConfig[];
  firmantes?: FirmanteConfig[];
}

export function TemplateEditorWithPreview({
  value,
  onChange,
  placeholders,
  firmantes = [],
}: TemplateEditorWithPreviewProps) {
  const today = new Date();

  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const p of placeholders) {
      if (p.defaultValue) {
        defaults[p.key] = p.defaultValue;
      } else if (p.key === "fecha_actual") {
        defaults[p.key] = format(today, "d 'de' MMMM 'de' yyyy", { locale: es });
      } else if (p.key === "fecha_fin") {
        defaults[p.key] = format(addMonths(today, 3), "d 'de' MMMM 'de' yyyy", { locale: es });
      } else {
        defaults[p.key] = "";
      }
    }
    return defaults;
  });

  const updateValue = (key: string, val: string) => {
    setPlaceholderValues((prev) => ({ ...prev, [key]: val }));
  };

  const previewHtml = useMemo(
    () => replacePlaceholders(value, placeholderValues),
    [value, placeholderValues]
  );

  const firmasHtml = useMemo(() => {
    const fechaActual = placeholderValues["fecha_actual"] || "";
    const nombreAgente = placeholderValues["nombre_agente"] || "{{nombre_agente}}";
    const rfcAgente = placeholderValues["rfc_agente"] || "{{rfc_agente}}";

    let html = '<hr style="margin-top:24px"><h3><strong>Firmas</strong></h3>';
    for (const f of firmantes) {
      html += `<p><strong>${f.name}</strong><br>Cargo: ${f.cargo}<br>Firma: ___________________________<br>Fecha: ${fechaActual}</p>`;
    }
    html += `<p><strong>EL AGENTE</strong><br>Nombre/Razón Social: ${nombreAgente}<br>RFC: ${rfcAgente}<br>Firma: ___________________________<br>Fecha: ${fechaActual}</p>`;
    return html;
  }, [firmantes, placeholderValues]);

  const iframeSrcDoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: system-ui, sans-serif; padding: 24px; font-size: 14px; line-height: 1.6; color: #1a1a1a; }
  h1 { font-size: 1.5em; } h2 { font-size: 1.25em; } h3 { font-size: 1.1em; }
  ul, ol { padding-left: 1.5em; }
  a { color: #2563eb; }
  img { max-width: 100%; border-radius: 4px; }
</style></head><body>${previewHtml}${firmasHtml}</body></html>`;

  const handleDragStart = (e: DragEvent<HTMLDivElement>, key: string) => {
    e.dataTransfer.setData("application/placeholder-key", key);
    e.dataTransfer.effectAllowed = "copy";
  };

  const editablePlaceholders = placeholders.filter((p) => p.editable !== false);
  const autoPlaceholders = placeholders.filter((p) => p.editable === false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Editor */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Editor de Template</Label>

        {/* Draggable placeholder chips */}
        <div className="flex flex-wrap gap-2 rounded-md border border-dashed p-3 bg-muted/20">
          <span className="text-xs text-muted-foreground w-full mb-1">Arrastra un placeholder al editor:</span>
          {placeholders.map((p) => (
            <div
              key={p.key}
              draggable
              onDragStart={(e) => handleDragStart(e, p.key)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border bg-background text-xs font-mono cursor-grab active:cursor-grabbing hover:border-primary hover:bg-primary/5 transition-colors select-none"
            >
              <GripVertical className="h-3 w-3 text-muted-foreground" />
              <span className="text-primary">{`{{${p.key}}}`}</span>
              <span className="text-muted-foreground ml-1 font-sans">{p.label}</span>
            </div>
          ))}
        </div>

        <RichTextEditor
          value={value}
          onChange={onChange}
          placeholders={placeholders.map((p) => ({ key: p.key, label: p.label }))}
        />
      </div>

      {/* Right: Preview */}
      <div className="space-y-4">
        <Label className="text-sm font-semibold">Vista Previa</Label>

        {/* Editable placeholder inputs (only nombre) */}
        <div className="space-y-3 rounded-md border p-4 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground">Valores para placeholders:</p>
          {editablePlaceholders.map((p) => (
            <div key={p.key} className="space-y-1">
              <Label htmlFor={`ph-${p.key}`} className="text-xs">
                {p.label}
              </Label>
              <Input
                id={`ph-${p.key}`}
                value={placeholderValues[p.key] ?? ""}
                onChange={(e) => updateValue(p.key, e.target.value)}
                className="h-8 text-sm"
                placeholder={`Ej: valor de ${p.key}`}
              />
            </div>
          ))}
          {autoPlaceholders.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t">
              <p className="text-xs text-muted-foreground">Auto-calculados:</p>
              {autoPlaceholders.map((p) => (
                <div key={p.key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{p.label}</span>
                  <Badge variant="secondary" className="font-normal">{placeholderValues[p.key]}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live preview iframe */}
        <div className="border rounded-md overflow-hidden bg-white">
          <iframe
            title="Vista previa del template"
            srcDoc={iframeSrcDoc}
            className="w-full min-h-[350px] border-0"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}
