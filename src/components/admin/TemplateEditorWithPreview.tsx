import { useState, useMemo } from "react";
import { format, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { replacePlaceholders } from "@/utils/templatePlaceholders";

interface PlaceholderConfig {
  key: string;
  label: string;
  defaultValue?: string;
}

interface TemplateEditorWithPreviewProps {
  value: string;
  onChange: (html: string) => void;
  placeholders: PlaceholderConfig[];
}

export function TemplateEditorWithPreview({
  value,
  onChange,
  placeholders,
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

  const iframeSrcDoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: system-ui, sans-serif; padding: 24px; font-size: 14px; line-height: 1.6; color: #1a1a1a; }
  h1 { font-size: 1.5em; } h2 { font-size: 1.25em; } h3 { font-size: 1.1em; }
  ul, ol { padding-left: 1.5em; }
  a { color: #2563eb; }
  img { max-width: 100%; border-radius: 4px; }
</style></head><body>${previewHtml}</body></html>`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Editor */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Editor de Template</Label>
        <RichTextEditor
          value={value}
          onChange={onChange}
          placeholders={placeholders.map((p) => ({ key: p.key, label: p.label }))}
        />
      </div>

      {/* Right: Preview */}
      <div className="space-y-4">
        <Label className="text-sm font-semibold">Vista Previa</Label>

        {/* Placeholder value inputs */}
        <div className="space-y-3 rounded-md border p-4 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground">Valores de prueba para placeholders:</p>
          {placeholders.map((p) => (
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
