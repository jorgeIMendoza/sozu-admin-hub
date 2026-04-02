import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, DollarSign } from "lucide-react";

export interface Tramo {
  orden: number;
  numero_mensualidades: number;
  monto_mensualidad?: number;
}

interface TramosEscalonadosSectionProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  tramos: Tramo[];
  onTramosChange: (tramos: Tramo[]) => void;
  totalMensualidades: number;
  visible: boolean;
  /** When true, shows a fixed-amount input per tramo */
  allowFixedAmount?: boolean;
}

export const TramosEscalonadosSection = ({
  enabled,
  onEnabledChange,
  tramos,
  onTramosChange,
  totalMensualidades,
  visible,
  allowFixedAmount = true,
}: TramosEscalonadosSectionProps) => {
  if (!visible) return null;

  const sumTramos = tramos.reduce((sum, t) => sum + (t.numero_mensualidades || 0), 0);
  const isValid = sumTramos === totalMensualidades;
  const remaining = totalMensualidades - sumTramos;

  const hasAnyMonto = tramos.some(t => t.monto_mensualidad && t.monto_mensualidad > 0);

  const addTramo = () => {
    if (tramos.length >= 3) return;
    const newTramo: Tramo = {
      orden: tramos.length + 1,
      numero_mensualidades: remaining > 0 ? remaining : 0,
    };
    onTramosChange([...tramos, newTramo]);
  };

  const removeTramo = (index: number) => {
    const updated = tramos
      .filter((_, i) => i !== index)
      .map((t, i) => ({ ...t, orden: i + 1 }));
    onTramosChange(updated);
  };

  const updateTramo = (index: number, field: keyof Tramo, value: number) => {
    const updated = tramos.map((t, i) =>
      i === index ? { ...t, [field]: value } : t
    );
    onTramosChange(updated);
  };

  const handleToggle = (checked: boolean) => {
    onEnabledChange(checked);
    if (checked && tramos.length === 0) {
      const half = Math.floor(totalMensualidades / 2);
      onTramosChange([
        { orden: 1, numero_mensualidades: half },
        { orden: 2, numero_mensualidades: totalMensualidades - half },
      ]);
    }
    if (!checked) {
      onTramosChange([]);
    }
  };

  const formatMonto = (centavos: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 0,
    }).format(centavos / 100);
  };

  return (
    <div className="space-y-3 border rounded-md p-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium flex items-center gap-2">
          Mensualidades escalonadas
          {enabled && (
            <Badge variant="outline" className="text-xs">
              {tramos.length} tramo{tramos.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </Label>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {enabled && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Divide las {totalMensualidades} mensualidades en bloques. La suma debe ser igual al total.
            {allowFixedAmount && (
              <> Opcionalmente define un monto fijo por mensualidad en cada tramo.</>
            )}
          </p>

          {tramos.map((tramo, index) => (
            <div key={index} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-16 shrink-0">
                  Tramo {tramo.orden}:
                </span>
                <Input
                  type="number"
                  min="1"
                  max={totalMensualidades}
                  value={tramo.numero_mensualidades || ""}
                  onChange={(e) => updateTramo(index, "numero_mensualidades", parseInt(e.target.value) || 0)}
                  className="h-8"
                  placeholder="Meses"
                />
                <span className="text-xs text-muted-foreground shrink-0">meses</span>
                {tramos.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive"
                    onClick={() => removeTramo(index)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {allowFixedAmount && (
                <div className="flex items-center gap-2 ml-16">
                  <DollarSign className="h-3 w-3 text-muted-foreground shrink-0" />
                  <Input
                    type="number"
                    min="0"
                    step="100"
                    value={tramo.monto_mensualidad ? tramo.monto_mensualidad / 100 : ""}
                    onChange={(e) => {
                      const pesos = parseFloat(e.target.value) || 0;
                      updateTramo(index, "monto_mensualidad", Math.round(pesos * 100));
                    }}
                    className="h-7 text-xs"
                    placeholder="Monto por mes (MXN, opcional)"
                  />
                  {tramo.monto_mensualidad && tramo.monto_mensualidad > 0 && (
                    <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                      = {formatMonto(tramo.monto_mensualidad * tramo.numero_mensualidades)} total
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between">
            {tramos.length < 3 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={addTramo}
              >
                <Plus className="h-3 w-3 mr-1" />
                Agregar tramo
              </Button>
            )}
            <div className="ml-auto">
              <Badge variant={isValid ? "default" : "destructive"} className="text-xs">
                {sumTramos}/{totalMensualidades} meses
              </Badge>
            </div>
          </div>

          {!isValid && sumTramos > 0 && (
            <p className="text-xs text-destructive">
              {remaining > 0
                ? `Faltan ${remaining} mensualidades por asignar.`
                : `Excede por ${Math.abs(remaining)} mensualidades.`}
            </p>
          )}

          {allowFixedAmount && hasAnyMonto && (
            <p className="text-xs text-muted-foreground border-t pt-2">
              💡 Al definir montos fijos, el porcentaje de mensualidades se ignorará y el restante irá a contra-entrega automáticamente al generar la oferta.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
