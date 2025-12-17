import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PropertyBasicDataSectionProps {
  form: any;
}

const formatCurrency = (value: string | number | undefined): string => {
  if (!value && value !== 0) return "";
  const numValue = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
  if (isNaN(numValue)) return "";
  return numValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrency = (value: string): number => {
  const cleanValue = value.replace(/,/g, "");
  const parsed = parseFloat(cleanValue);
  return isNaN(parsed) ? 0 : parsed;
};

export const PropertyBasicDataSection = ({ form }: PropertyBasicDataSectionProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos Básicos</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="numero_propiedad"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Número de la Propiedad *</FormLabel>
              <FormControl>
                <Input placeholder="Ej: A-101" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="numero_piso"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nivel *</FormLabel>
              <FormControl>
                <Input type="number" placeholder="Ej: 1" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="m2_interiores"
          render={({ field }) => (
            <FormItem>
              <FormLabel>M2 interiores *</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="Ej: 85.50" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="m2_exteriores"
          render={({ field }) => (
            <FormItem>
              <FormLabel>M2 exteriores *</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="Ej: 80.00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="m2_loft"
          render={({ field }) => (
            <FormItem>
              <FormLabel>M2 Loft</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="Ej: 20.00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="precio_lista"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Precio de Lista *</FormLabel>
              <FormControl>
                <Input
                  placeholder="Ej: 2,500,000.00"
                  value={formatCurrency(field.value)}
                  onChange={(e) => {
                    const parsed = parseCurrency(e.target.value);
                    field.onChange(parsed);
                  }}
                  onBlur={field.onBlur}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="monto_apartado"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Monto Apartado (Opcional)</FormLabel>
              <FormControl>
                <Input
                  placeholder="Ej: 50,000.00"
                  value={formatCurrency(field.value)}
                  onChange={(e) => {
                    const parsed = parseCurrency(e.target.value);
                    field.onChange(parsed);
                  }}
                  onBlur={field.onBlur}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
};