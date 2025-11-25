import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface PaymentScheme {
  id: string;
  nombre: string;
  porcentaje_enganche: string;
  porcentaje_mensualidades: string;
  porcentaje_entrega: string;
  numero_mensualidades: string;
  porcentaje_descuento_aumento: string;
}

interface PaymentSchemeFormSectionProps {
  paymentSchemes: PaymentScheme[];
  onPaymentSchemesChange: (schemes: PaymentScheme[]) => void;
}

export const PaymentSchemeFormSection = ({ 
  paymentSchemes, 
  onPaymentSchemesChange 
}: PaymentSchemeFormSectionProps) => {
  
  const addPaymentScheme = () => {
    const newScheme: PaymentScheme = {
      id: Date.now().toString(),
      nombre: "",
      porcentaje_enganche: "",
      porcentaje_mensualidades: "",
      porcentaje_entrega: "",
      numero_mensualidades: "",
      porcentaje_descuento_aumento: "0",
    };
    onPaymentSchemesChange([...paymentSchemes, newScheme]);
  };

  const removePaymentScheme = (id: string) => {
    onPaymentSchemesChange(paymentSchemes.filter(s => s.id !== id));
  };

  const updatePaymentScheme = (id: string, field: keyof PaymentScheme, value: string) => {
    onPaymentSchemesChange(
      paymentSchemes.map(s => 
        s.id === id ? { ...s, [field]: value } : s
      )
    );
  };

  // Calculate remaining percentage for entrega field
  const getRemainingPercentage = (scheme: PaymentScheme) => {
    const enganche = parseFloat(scheme.porcentaje_enganche || "0");
    const mensualidades = parseFloat(scheme.porcentaje_mensualidades || "0");
    return 100 - (enganche + mensualidades);
  };

  // Check if scheme percentages are valid (sum to 100)
  const isValidScheme = (scheme: PaymentScheme) => {
    const enganche = parseFloat(scheme.porcentaje_enganche || "0");
    const mensualidades = parseFloat(scheme.porcentaje_mensualidades || "0");
    const entrega = parseFloat(scheme.porcentaje_entrega || "0");
    const total = enganche + mensualidades + entrega;
    return Math.abs(total - 100) < 0.01;
  };

  // Ensure paymentSchemes is always an array with proper typing
  const safeSchemesArray = Array.isArray(paymentSchemes) ? paymentSchemes : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">Esquemas de Pago</Label>
        <Button type="button" variant="outline" size="sm" onClick={addPaymentScheme}>
          <Plus className="h-4 w-4 mr-2" />
          Agregar Esquema
        </Button>
      </div>

      {safeSchemesArray.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <CreditCard className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No hay esquemas de pago agregados</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {safeSchemesArray.map((scheme) => {
            const remainingPercentage = getRemainingPercentage(scheme);
            const isValid = isValidScheme(scheme);
            const totalPercentage = parseFloat(scheme.porcentaje_enganche || "0") + 
                                  parseFloat(scheme.porcentaje_mensualidades || "0") + 
                                  parseFloat(scheme.porcentaje_entrega || "0");

            return (
              <Card key={scheme.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <CreditCard className="h-4 w-4" />
                      <span>Esquema de Pago</span>
                      <Badge variant={isValid ? "default" : "destructive"} className="text-xs">
                        {totalPercentage.toFixed(1)}%
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePaymentScheme(scheme.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Nombre del Esquema</Label>
                    <Input
                      placeholder="Ej. Esquema 50-30-20"
                      value={scheme.nombre || ""}
                      onChange={(e) => updatePaymentScheme(scheme.id, 'nombre', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Porcentaje Enganche (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0.00"
                        value={scheme.porcentaje_enganche || ""}
                        onChange={(e) => updatePaymentScheme(scheme.id, 'porcentaje_enganche', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Porcentaje Mensualidades (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0.00"
                        value={scheme.porcentaje_mensualidades || ""}
                        onChange={(e) => updatePaymentScheme(scheme.id, 'porcentaje_mensualidades', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">
                        Porcentaje Entrega (%)
                        {remainingPercentage !== 100 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (Restante: {remainingPercentage.toFixed(2)}%)
                          </span>
                        )}
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        placeholder="0.00"
                        value={scheme.porcentaje_entrega || ""}
                        onChange={(e) => updatePaymentScheme(scheme.id, 'porcentaje_entrega', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Número de Mensualidades</Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="12"
                        value={scheme.numero_mensualidades || ""}
                        onChange={(e) => updatePaymentScheme(scheme.id, 'numero_mensualidades', e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs flex items-center gap-2">
                      Porcentaje Descuento/Aumento (%)
                      {parseFloat(scheme.porcentaje_descuento_aumento || "0") < 0 && (
                        <Badge variant="destructive" className="text-xs">
                          Descuento
                        </Badge>
                      )}
                      {parseFloat(scheme.porcentaje_descuento_aumento || "0") > 0 && (
                        <Badge variant="default" className="text-xs">
                          Aumento
                        </Badge>
                      )}
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={scheme.porcentaje_descuento_aumento || ""}
                      onChange={(e) => updatePaymentScheme(scheme.id, 'porcentaje_descuento_aumento', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Usa valores negativos para descuentos (ej: -5 = 5% descuento) y valores positivos para aumentos (ej: 3 = 3% aumento)
                    </p>
                  </div>

                  {!isValid && totalPercentage > 0 && (
                    <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                      Los porcentajes deben sumar exactamente 100%
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};