import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInmobiliariaPersonaId } from "@/hooks/useInmobiliariaPersonaId";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CreditCard, User, Save, Plus, Edit, AlertCircle, Mail } from "lucide-react";
import { toast } from "sonner";

export default function InmobConfiguracion() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { profile } = useAuth();
  const { personaId } = useInmobiliariaPersonaId();
  const queryClient = useQueryClient();

  const [isEditingFiscal, setIsEditingFiscal] = useState(false);
  const [fiscalForm, setFiscalForm] = useState<any>({});
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [bankForm, setBankForm] = useState<any>({});

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/configuracion");
    track({ page: "inmob_configuracion", elementId: "page_view", elementType: "page" });
  }, []);

  // Fetch persona (fiscal) data
  const { data: persona } = useQuery({
    queryKey: ["inmob-config-persona", personaId],
    queryFn: async () => {
      if (!personaId) return null;
      const { data } = await supabase
        .from("personas")
        .select("*")
        .eq("id", personaId)
        .single() as any;
      return data;
    },
    enabled: !!personaId,
  });

  // Fetch bank accounts
  const { data: cuentas = [] } = useQuery({
    queryKey: ["inmob-config-cuentas", personaId],
    queryFn: async () => {
      if (!personaId) return [];
      const { data } = await supabase
        .from("cuentas_bancarias")
        .select("*, bancos(nombre)")
        .eq("id_persona", personaId)
        .eq("activo", true) as any;
      return data || [];
    },
    enabled: !!personaId,
  });

  // Fetch banks
  const { data: banks = [] } = useQuery({
    queryKey: ["banks"],
    queryFn: async () => {
      const { data } = await supabase.from("bancos").select("id, nombre").eq("activo", true).order("nombre");
      return data || [];
    },
  });

  // Pre-fill fiscal form when persona loads
  useEffect(() => {
    if (persona && !isEditingFiscal) {
      setFiscalForm({ ...persona });
    }
  }, [persona]);

  // Save fiscal data
  const saveFiscalMutation = useMutation({
    mutationFn: async () => {
      const { id, fecha_creacion, fecha_actualizacion, ...updateData } = fiscalForm;
      const { error } = await supabase
        .from("personas")
        .update(updateData)
        .eq("id", personaId) as any;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Datos fiscales actualizados");
      setIsEditingFiscal(false);
      queryClient.invalidateQueries({ queryKey: ["inmob-config-persona"] });
    },
    onError: () => toast.error("Error al guardar datos fiscales"),
  });

  // Save bank account
  const saveBankMutation = useMutation({
    mutationFn: async () => {
      if (bankForm.id) {
        // Update existing
        const { error } = await supabase
          .from("cuentas_bancarias")
          .update({
            id_banco: parseInt(bankForm.id_banco),
            cuenta_clabe: bankForm.cuenta_clabe || null,
            numero_cuenta: bankForm.numero_cuenta || null,
            titular: bankForm.titular || null,
          })
          .eq("id", bankForm.id) as any;
        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from("cuentas_bancarias")
          .insert({
            id_persona: personaId,
            id_banco: parseInt(bankForm.id_banco),
            cuenta_clabe: bankForm.cuenta_clabe || null,
            numero_cuenta: bankForm.numero_cuenta || null,
            titular: bankForm.titular || null,
            activo: true,
          }) as any;
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Cuenta bancaria guardada");
      setIsEditingBank(false);
      queryClient.invalidateQueries({ queryKey: ["inmob-config-cuentas"] });
    },
    onError: () => toast.error("Error al guardar cuenta bancaria"),
  });

  const startEditBank = (account?: any) => {
    if (account) {
      setBankForm({
        id: account.id,
        id_banco: String(account.id_banco),
        cuenta_clabe: account.cuenta_clabe || "",
        numero_cuenta: account.numero_cuenta || "",
        titular: account.titular || "",
      });
    } else {
      setBankForm({ id_banco: "", cuenta_clabe: "", numero_cuenta: "", titular: "" });
    }
    setIsEditingBank(true);
  };

  const updateFiscal = (field: string, value: string) => {
    setFiscalForm((prev: any) => ({ ...prev, [field]: value }));
  };

  const fiscalFields = [
    { label: "Razón Social", key: "nombre_legal" },
    { label: "Nombre Comercial", key: "nombre_comercial" },
    { label: "RFC", key: "rfc" },
    { label: "Régimen Fiscal", key: "regimen_fiscal" },
    { label: "Código Postal", key: "codigo_postal" },
    { label: "Teléfono", key: "telefono" },
    { label: "CURP", key: "curp" },
  ];

  const addressFields = [
    { label: "Calle", key: "calle" },
    { label: "Número Exterior", key: "numero_exterior" },
    { label: "Número Interior", key: "numero_interior" },
    { label: "Colonia", key: "colonia" },
    { label: "Ciudad", key: "ciudad" },
    { label: "Estado", key: "estado" },
    { label: "País", key: "pais" },
    { label: "Código Postal", key: "codigo_postal" },
  ];

  const fiscalAddressFields = [
    { label: "Calle Fiscal", key: "calle_fiscal" },
    { label: "Número Exterior Fiscal", key: "numero_exterior_fiscal" },
    { label: "Número Interior Fiscal", key: "numero_interior_fiscal" },
    { label: "Colonia Fiscal", key: "colonia_fiscal" },
    { label: "Ciudad Fiscal", key: "ciudad_fiscal" },
    { label: "Estado Fiscal", key: "estado_fiscal" },
    { label: "País Fiscal", key: "pais_fiscal" },
    { label: "Código Postal Fiscal", key: "codigo_postal_fiscal" },
  ];

  const renderFieldGrid = (fields: { label: string; key: string }[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fields.map(f => (
        <div key={f.key} className="space-y-1">
          <Label className="text-xs text-muted-foreground">{f.label}</Label>
          {isEditingFiscal ? (
            <Input
              value={fiscalForm[f.key] || ""}
              onChange={e => updateFiscal(f.key, e.target.value)}
              placeholder={f.label}
            />
          ) : (
            <p className="font-medium text-foreground text-sm">{persona?.[f.key] || "—"}</p>
          )}
        </div>
      ))}
    </div>
  );

  const existingAccount = cuentas[0] || null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Configuración</h1>

      {/* Fiscal data */}
      <Card className="sozu-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Datos Fiscales</CardTitle>
          </div>
          {!isEditingFiscal ? (
            <Button variant="outline" size="sm" onClick={() => setIsEditingFiscal(true)}>
              <Edit className="h-4 w-4 mr-1" /> Editar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setIsEditingFiscal(false); setFiscalForm({ ...persona }); }}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => saveFiscalMutation.mutate()} disabled={saveFiscalMutation.isPending}>
                <Save className="h-4 w-4 mr-1" /> Guardar
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {persona ? (
            <Tabs defaultValue="datos" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="datos">Datos Generales</TabsTrigger>
                <TabsTrigger value="direccion">Dirección</TabsTrigger>
                <TabsTrigger value="direccion_fiscal">Dirección Fiscal</TabsTrigger>
              </TabsList>
              <TabsContent value="datos">
                {renderFieldGrid(fiscalFields)}
                {/* Email - non-editable */}
                <div className="mt-4 space-y-1">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <p className="font-medium text-foreground text-sm">{persona.email || "—"}</p>
                  <div className="flex items-start gap-1.5 mt-1">
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      El email no puede ser modificado. En caso de requerirlo, contacte al administrador de la plataforma.
                    </p>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="direccion">
                {renderFieldGrid(addressFields)}
              </TabsContent>
              <TabsContent value="direccion_fiscal">
                {renderFieldGrid(fiscalAddressFields)}
              </TabsContent>
            </Tabs>
          ) : (
            <p className="text-muted-foreground">Cargando datos fiscales...</p>
          )}
        </CardContent>
      </Card>

      {/* Bank account */}
      <Card className="sozu-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Cuenta Bancaria</CardTitle>
          </div>
          {!isEditingBank && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => startEditBank(existingAccount || undefined)}
            >
              {existingAccount ? (
                <><Edit className="h-4 w-4 mr-1" /> Editar</>
              ) : (
                <><Plus className="h-4 w-4 mr-1" /> Agregar</>
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isEditingBank ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Banco *</Label>
                  <Select value={bankForm.id_banco} onValueChange={v => setBankForm((p: any) => ({ ...p, id_banco: v }))}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar banco" /></SelectTrigger>
                    <SelectContent>
                      {banks.map((b: any) => (
                        <SelectItem key={b.id} value={String(b.id)}>{b.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CLABE</Label>
                  <Input
                    value={bankForm.cuenta_clabe || ""}
                    onChange={e => setBankForm((p: any) => ({ ...p, cuenta_clabe: e.target.value }))}
                    placeholder="18 dígitos"
                    maxLength={18}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Número de Cuenta</Label>
                  <Input
                    value={bankForm.numero_cuenta || ""}
                    onChange={e => setBankForm((p: any) => ({ ...p, numero_cuenta: e.target.value }))}
                    placeholder="Número de cuenta"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Titular</Label>
                  <Input
                    value={bankForm.titular || ""}
                    onChange={e => setBankForm((p: any) => ({ ...p, titular: e.target.value }))}
                    placeholder="Nombre del titular"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setIsEditingBank(false)}>Cancelar</Button>
                <Button
                  size="sm"
                  onClick={() => saveBankMutation.mutate()}
                  disabled={!bankForm.id_banco || saveBankMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-1" /> Guardar
                </Button>
              </div>
            </div>
          ) : existingAccount ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Banco</p>
                <p className="font-medium text-foreground">{existingAccount.bancos?.nombre || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">CLABE</p>
                <p className="font-medium text-foreground font-mono text-xs">{existingAccount.cuenta_clabe || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Número de Cuenta</p>
                <p className="font-medium text-foreground">{existingAccount.numero_cuenta || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Titular</p>
                <p className="font-medium text-foreground">{existingAccount.titular || "—"}</p>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">No hay cuenta bancaria registrada.</p>
          )}
        </CardContent>
      </Card>

      {/* User info */}
      <Card className="sozu-card">
        <CardHeader className="flex flex-row items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Cuenta de Usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Email</p>
              <p className="font-medium text-foreground">{profile?.email || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Rol</p>
              <p className="font-medium text-foreground">{profile?.rol_nombre || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
