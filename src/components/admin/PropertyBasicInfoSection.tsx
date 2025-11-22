import { useQuery } from "@tanstack/react-query";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

interface PropertyBasicInfoSectionProps {
  form: any;
  selectedProjectId: string;
  selectedBuildingId: string;
  selectedOwnerId: string;
  setSelectedProjectId: (value: string) => void;
  setSelectedBuildingId: (value: string) => void;
  setSelectedOwnerId: (value: string) => void;
  ownerClabe?: string;
  isLoadingClabe?: boolean;
  clabeError?: any;
}

export const PropertyBasicInfoSection = ({
  form,
  selectedProjectId,
  selectedBuildingId,
  selectedOwnerId,
  setSelectedProjectId,
  setSelectedBuildingId,
  setSelectedOwnerId,
  ownerClabe,
  isLoadingClabe,
  clabeError
}: PropertyBasicInfoSectionProps) => {
  // Queries para obtener los datos necesarios
  const { data: proyectos } = useQuery({
    queryKey: ["proyectos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: edificios } = useQuery({
    queryKey: ["edificios", selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      
      const { data, error } = await supabase
        .from("edificios")
        .select("id, nombre")
        .eq("id_proyecto", parseInt(selectedProjectId))
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedProjectId,
  });

  const { data: modelos } = useQuery({
    queryKey: ["modelos", selectedBuildingId],
    queryFn: async () => {
      if (!selectedBuildingId) return [];
      
      const { data, error } = await supabase
        .from("edificios_modelos")
        .select(`
          id,
          modelos!fk_edificios_modelos_modelo (
            id,
            nombre
          )
        `)
        .eq("id_edificio", parseInt(selectedBuildingId))
        .eq("activo", true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedBuildingId,
  });

  const { data: tiposTransaccion } = useQuery({
    queryKey: ["tipos-transaccion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_transaccion")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: tiposPropiedad } = useQuery({
    queryKey: ["tipos-propiedad"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_propiedad")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: estatusDisponibilidad } = useQuery({
    queryKey: ["estatus-disponibilidad"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estatus_disponibilidad")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: vistas } = useQuery({
    queryKey: ["vistas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vistas")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: propietarios } = useQuery({
    queryKey: ["propietarios", selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      
      const { data, error } = await supabase
        .from("entidades_relacionadas")
        .select(`
          id,
          personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal)
        `)
        .eq("id_proyecto", parseInt(selectedProjectId))
        .in("id_tipo_entidad", [4, 15]) // Dueño vendedor or Aportante
        .eq("activo", true)
        .order("personas(nombre_legal)");
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedProjectId,
  });

  return (
    <div className="space-y-6">
      {/* Selección de Proyecto, Edificio y Modelo */}
      <Card>
        <CardHeader>
          <CardTitle>Selección de Proyecto y Modelo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="id_proyecto"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Proyecto *</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    field.onChange(value);
                    setSelectedProjectId(value);
                    // Reset all subsequent fields when project changes
                    setSelectedBuildingId("");
                    setSelectedOwnerId("");
                    form.setValue("id_edificio", "");
                    form.setValue("id_modelo", "");
                    form.setValue("id_entidad_relacionada_dueno", "");
                  }}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un proyecto" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {proyectos?.map((proyecto) => (
                      <SelectItem key={proyecto.id} value={proyecto.id.toString()}>
                        {proyecto.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="id_edificio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Edificio *</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    field.onChange(value);
                    setSelectedBuildingId(value);
                    // Reset subsequent fields when building changes
                    setSelectedOwnerId("");
                    form.setValue("id_modelo", "");
                    form.setValue("id_entidad_relacionada_dueno", "");
                  }}
                  value={field.value}
                  disabled={!selectedProjectId}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={!selectedProjectId ? "Selecciona un proyecto primero" : "Selecciona un edificio"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {edificios?.map((edificio) => (
                      <SelectItem key={edificio.id} value={edificio.id.toString()}>
                        {edificio.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="id_modelo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Modelo *</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    field.onChange(value);
                    // Reset subsequent fields when model changes
                    setSelectedOwnerId("");
                    form.setValue("id_entidad_relacionada_dueno", "");
                  }} 
                  value={field.value}
                  disabled={!selectedBuildingId}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={!selectedBuildingId ? "Selecciona un edificio primero" : "Selecciona un modelo"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {modelos?.map((em) => (
                      <SelectItem key={em.modelos?.id} value={em.modelos?.id.toString()}>
                        {em.modelos?.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Propietario y CLABE STP */}
      <Card>
        <CardHeader>
          <CardTitle>Propietario</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            control={form.control}
            name="id_entidad_relacionada_dueno"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Propietario *</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    field.onChange(value);
                    setSelectedOwnerId(value);
                  }}
                  value={field.value}
                  disabled={!selectedProjectId}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={!selectedProjectId ? "Selecciona un proyecto primero" : propietarios?.length === 0 ? "No hay propietarios disponibles" : "Selecciona el propietario"} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {propietarios?.length === 0 ? (
                      <SelectItem value="no-owners" disabled>
                        No hay propietarios disponibles
                      </SelectItem>
                    ) : (
                      propietarios?.map((propietario) => (
                        <SelectItem key={propietario.id} value={propietario.id.toString()}>
                          {propietario.personas?.nombre_legal}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* CLABE STP Display */}
          {selectedOwnerId && selectedOwnerId !== "no-owners" && (
            <div className="space-y-2">
              <FormLabel>CLABE STP</FormLabel>
              <div className="p-3 border rounded-md bg-muted/50">
                {isLoadingClabe ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    <span className="text-sm text-muted-foreground">Generando CLABE...</span>
                  </div>
                ) : clabeError ? (
                  <Badge variant="destructive">Error al generar CLABE</Badge>
                ) : ownerClabe ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{ownerClabe}</Badge>
                    <span className="text-sm text-muted-foreground">(Solo lectura)</span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Sin CLABE asignada</span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Datos Básicos de la Propiedad */}
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
                <FormLabel>Número de Piso *</FormLabel>
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
                <FormLabel>M² Interiores *</FormLabel>
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
                <FormLabel>M² Exteriores *</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" placeholder="Ej: 80.00" {...field} />
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

      {/* Clasificaciones */}
      <Card>
        <CardHeader>
          <CardTitle>Clasificaciones</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="id_tipo_transaccion"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Transacción *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {tiposTransaccion?.map((tipo) => (
                      <SelectItem key={tipo.id} value={tipo.id.toString()}>
                        {tipo.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="id_tipo_propiedad"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Propiedad *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {tiposPropiedad?.map((tipo) => (
                      <SelectItem key={tipo.id} value={tipo.id.toString()}>
                        {tipo.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="id_estatus_disponibilidad"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Disponibilidad *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el estatus" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {estatusDisponibilidad?.map((estatus) => (
                      <SelectItem key={estatus.id} value={estatus.id.toString()}>
                        {estatus.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
           />
        </CardContent>
      </Card>
    </div>
  );
};