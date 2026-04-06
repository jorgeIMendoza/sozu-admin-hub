import { useEffect, useState, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, CreditCard, User, Save, Plus, Edit, AlertCircle, Copy, FolderOpen, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { PersonForm } from "@/components/admin/PersonForm";

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
  const [copiarDireccion, setCopiarDireccion] = useState(false);
  const [isNewRepLegalDialogOpen, setIsNewRepLegalDialogOpen] = useState(false);
  const [isNewRepComDialogOpen, setIsNewRepComDialogOpen] = useState(false);



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

  // Fetch paises
  const { data: paises = [] } = useQuery({
    queryKey: ["paises"],
    queryFn: async () => {
      const { data } = await supabase.from("paises").select("id, nombre").eq("activo", true).order("nombre");
      return data || [];
    },
  });

  // Fetch estados
  const { data: estados = [] } = useQuery({
    queryKey: ["estados"],
    queryFn: async () => {
      const { data } = await supabase.from("estados_mx").select("id, nombre, id_pais").eq("activo", true).order("nombre");
      return data || [];
    },
  });

  // Fetch municipios (only when a state is selected)
  const activeEstadoIds = useMemo(() => {
    const ids = new Set<number>();
    if (fiscalForm.direccion_id_estado) ids.add(Number(fiscalForm.direccion_id_estado));
    if (fiscalForm.direccion_fiscal_id_estado) ids.add(Number(fiscalForm.direccion_fiscal_id_estado));
    return [...ids].filter(Boolean);
  }, [fiscalForm.direccion_id_estado, fiscalForm.direccion_fiscal_id_estado]);

  const { data: municipios = [] } = useQuery({
    queryKey: ["municipios", activeEstadoIds],
    queryFn: async () => {
      if (!activeEstadoIds.length) return [];
      const { data } = await supabase.from("municipios_mx").select("id, nombre, id_estado").eq("activo", true).in("id_estado", activeEstadoIds).order("nombre");
      return data || [];
    },
    enabled: activeEstadoIds.length > 0,
  });

  // Fetch regimenes fiscales
  const tipoPersona = persona?.tipo_persona || "pm";
  const { data: regimenes = [] } = useQuery({
    queryKey: ["regimen", tipoPersona],
    queryFn: async () => {
      const filterTypes = tipoPersona === "pm" ? ["pm"] : ["pf"];
      const { data } = await supabase.from("regimen").select("id, nombre").eq("activo", true).in("tipo", filterTypes).order("nombre");
      return data || [];
    },
  });

  // Fetch usos CFDI
  const { data: usosCfdi = [] } = useQuery({
    queryKey: ["uso_cfdi", tipoPersona],
    queryFn: async () => {
      const filterTypes = tipoPersona === "pm" ? ["pm", "a"] : ["pf", "a"];
      const { data } = await supabase.from("uso_cfdi").select("codigo, nombre").eq("activo", true).in("tipo", filterTypes).order("codigo");
      return data || [];
    },
  });

  // Fetch representante legal name
  const { data: repLegalNombre } = useQuery({
    queryKey: ["inmob-config-rep-legal", persona?.id_entidad_relacionada_rep_leg],
    queryFn: async () => {
      const repLegId = persona?.id_entidad_relacionada_rep_leg;
      if (!repLegId) return null;
      const { data } = await supabase
        .from("entidades_relacionadas")
        .select("personas!entidades_relacionadas_id_persona_fkey(nombre_legal)")
        .eq("id", repLegId)
        .single() as any;
      return data?.personas?.nombre_legal || null;
    },
    enabled: !!persona?.id_entidad_relacionada_rep_leg,
  });

  // Fetch representante comercial name
  const { data: repComNombre } = useQuery({
    queryKey: ["inmob-config-rep-com", persona?.id_entidad_relacionada_rep_com],
    queryFn: async () => {
      const repComId = persona?.id_entidad_relacionada_rep_com;
      if (!repComId) return null;
      const { data } = await supabase
        .from("entidades_relacionadas")
        .select("personas!entidades_relacionadas_id_persona_fkey(nombre_legal)")
        .eq("id", repComId)
        .single() as any;
      return data?.personas?.nombre_legal || null;
    },
    enabled: !!persona?.id_entidad_relacionada_rep_com,
  });

  // Create representante legal mutation
  const createRepLegalMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, tempBankAccounts, tempBeneficiaries, pendingDocuments, inmobiliariaId, ...cleanPersonData } = personData;
      const { data: personResult, error: personError } = await supabase
        .from("personas")
        .insert([{ ...cleanPersonData, tipo_persona: "pf" }])
        .select()
        .single();
      if (personError) throw personError;
      const { data: entidadResult, error: entidadError } = await supabase
        .from("entidades_relacionadas")
        .insert([{ id_persona: personResult.id, id_tipo_entidad: 1, id_proyecto: null, activo: true }])
        .select()
        .single();
      if (entidadError) throw entidadError;
      // Link to inmobiliaria persona
      const { error: linkError } = await supabase
        .from("personas")
        .update({ id_entidad_relacionada_rep_leg: entidadResult.id })
        .eq("id", personaId);
      if (linkError) throw linkError;
      return entidadResult.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inmob-config-persona"] });
      queryClient.invalidateQueries({ queryKey: ["inmob-config-rep-legal"] });
      setIsNewRepLegalDialogOpen(false);
      toast.success("Representante legal creado correctamente.");
    },
    onError: (error: any) => {
      toast.error(`Error al crear representante legal: ${error.message}`);
    },
  });

  // Create representante comercial mutation
  const createRepComMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, tempBankAccounts, tempBeneficiaries, pendingDocuments, inmobiliariaId, ...cleanPersonData } = personData;
      const { data: personResult, error: personError } = await supabase
        .from("personas")
        .insert([{ ...cleanPersonData, tipo_persona: "pf" }])
        .select()
        .single();
      if (personError) throw personError;
      const { data: entidadResult, error: entidadError } = await supabase
        .from("entidades_relacionadas")
        .insert([{ id_persona: personResult.id, id_tipo_entidad: 21, id_proyecto: null, activo: true }])
        .select()
        .single();
      if (entidadError) throw entidadError;
      const { error: linkError } = await supabase
        .from("personas")
        .update({ id_entidad_relacionada_rep_com: entidadResult.id })
        .eq("id", personaId);
      if (linkError) throw linkError;
      return entidadResult.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inmob-config-persona"] });
      queryClient.invalidateQueries({ queryKey: ["inmob-config-rep-com"] });
      setIsNewRepComDialogOpen(false);
      toast.success("Representante comercial creado correctamente.");
    },
    onError: (error: any) => {
      toast.error(`Error al crear representante comercial: ${error.message}`);
    },
  });


  useEffect(() => {
    if (persona && !isEditingFiscal) {
      setFiscalForm({ ...persona });
    }
  }, [persona]);

  // Copy address to fiscal address
  useEffect(() => {
    if (copiarDireccion && isEditingFiscal) {
      setFiscalForm((prev: any) => ({
        ...prev,
        direccion_fiscal_calle: prev.direccion_calle || "",
        direccion_fiscal_num_ext: prev.direccion_num_ext || "",
        direccion_fiscal_num_int: prev.direccion_num_int || "",
        direccion_fiscal_colonia: prev.direccion_colonia || "",
        direccion_fiscal_codigo_postal: prev.direccion_codigo_postal || "",
        direccion_fiscal_id_pais: prev.direccion_id_pais || "",
        direccion_fiscal_id_estado: prev.direccion_id_estado || "",
        direccion_fiscal_id_municipio: prev.direccion_id_municipio || "",
      }));
    }
  }, [copiarDireccion, isEditingFiscal]);

  // Save fiscal data
  const saveFiscalMutation = useMutation({
    mutationFn: async () => {
      const allowedFields = [
        "nombre_legal", "nombre_comercial", "telefono", "curp",
        "rfc", "regimen", "uso_cfdi",
        "direccion_calle", "direccion_num_ext", "direccion_num_int", "direccion_colonia", "direccion_codigo_postal",
        "direccion_id_pais", "direccion_id_estado", "direccion_id_municipio",
        "direccion_fiscal_calle", "direccion_fiscal_num_ext", "direccion_fiscal_num_int", "direccion_fiscal_colonia", "direccion_fiscal_codigo_postal",
        "direccion_fiscal_id_pais", "direccion_fiscal_id_estado", "direccion_fiscal_id_municipio",
      ];
      const updateData: any = {};
      allowedFields.forEach(f => {
        if (fiscalForm[f] !== undefined) {
          // Convert numeric FK fields
          if (["direccion_id_estado", "direccion_id_municipio", "direccion_fiscal_id_estado", "direccion_fiscal_id_municipio", "regimen"].includes(f)) {
            updateData[f] = fiscalForm[f] ? parseInt(fiscalForm[f]) : null;
          } else {
            updateData[f] = fiscalForm[f] || null;
          }
        }
      });
      const { error } = await supabase
        .from("personas")
        .update(updateData)
        .eq("id", personaId) as any;
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Datos actualizados correctamente");
      setIsEditingFiscal(false);
      setCopiarDireccion(false);
      queryClient.invalidateQueries({ queryKey: ["inmob-config-persona"] });
    },
    onError: () => toast.error("Error al guardar los datos"),
  });

  // Save bank account
  const saveBankMutation = useMutation({
    mutationFn: async () => {
      if (bankForm.id) {
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

  const updateFiscal = (field: string, value: any) => {
    setFiscalForm((prev: any) => ({ ...prev, [field]: value }));
  };

  // Filtered states/municipalities for address
  const estadosDireccion = useMemo(() => {
    if (!fiscalForm.direccion_id_pais) return estados;
    return estados.filter((e: any) => e.id_pais === fiscalForm.direccion_id_pais);
  }, [estados, fiscalForm.direccion_id_pais]);

  const municipiosDireccion = useMemo(() => {
    if (!fiscalForm.direccion_id_estado) return [];
    return municipios.filter((m: any) => m.id_estado === Number(fiscalForm.direccion_id_estado));
  }, [municipios, fiscalForm.direccion_id_estado]);

  const estadosFiscal = useMemo(() => {
    if (!fiscalForm.direccion_fiscal_id_pais) return estados;
    return estados.filter((e: any) => e.id_pais === fiscalForm.direccion_fiscal_id_pais);
  }, [estados, fiscalForm.direccion_fiscal_id_pais]);

  const municipiosFiscal = useMemo(() => {
    if (!fiscalForm.direccion_fiscal_id_estado) return [];
    return municipios.filter((m: any) => m.id_estado === Number(fiscalForm.direccion_fiscal_id_estado));
  }, [municipios, fiscalForm.direccion_fiscal_id_estado]);

  // Helper to get display name for IDs
  const getPaisNombre = (id: any) => paises.find((p: any) => p.id === id)?.nombre || "";
  const getEstadoNombre = (id: any) => estados.find((e: any) => e.id === Number(id))?.nombre || "";
  const getMunicipioNombre = (id: any) => municipios.find((m: any) => m.id === Number(id))?.nombre || "";
  const getRegimenNombre = (id: any) => regimenes.find((r: any) => r.id === Number(id))?.nombre || "";
  const getUsoCfdiNombre = (codigo: any) => usosCfdi.find((u: any) => u.codigo === codigo)?.nombre || "";

  const renderAddressForm = (prefix: "direccion" | "direccion_fiscal", label: string) => {
    const keys = {
      calle: `${prefix}_calle`,
      numExt: `${prefix}_num_ext`,
      numInt: `${prefix}_num_int`,
      colonia: `${prefix}_colonia`,
      cp: `${prefix}_codigo_postal`,
      pais: `${prefix}_id_pais`,
      estado: `${prefix}_id_estado`,
      municipio: `${prefix}_id_municipio`,
    };
    const filteredEstados = prefix === "direccion" ? estadosDireccion : estadosFiscal;
    const filteredMunicipios = prefix === "direccion" ? municipiosDireccion : municipiosFiscal;

    if (!isEditingFiscal) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: "Calle", value: persona?.[keys.calle] },
            { label: "Número Exterior", value: persona?.[keys.numExt] },
            { label: "Número Interior", value: persona?.[keys.numInt] },
            { label: "Colonia", value: persona?.[keys.colonia] },
            { label: "Código Postal", value: persona?.[keys.cp] },
            { label: "País", value: getPaisNombre(persona?.[keys.pais]) },
            { label: "Estado", value: getEstadoNombre(persona?.[keys.estado]) },
            { label: "Municipio", value: getMunicipioNombre(persona?.[keys.municipio]) },
          ].map(f => (
            <div key={f.label} className="space-y-1">
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className="font-medium text-foreground text-sm">{f.value || "—"}</p>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Calle</Label>
          <Input value={fiscalForm[keys.calle] || ""} onChange={e => updateFiscal(keys.calle, e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Número Exterior</Label>
          <Input value={fiscalForm[keys.numExt] || ""} onChange={e => updateFiscal(keys.numExt, e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Número Interior</Label>
          <Input value={fiscalForm[keys.numInt] || ""} onChange={e => updateFiscal(keys.numInt, e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Colonia</Label>
          <Input value={fiscalForm[keys.colonia] || ""} onChange={e => updateFiscal(keys.colonia, e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Código Postal</Label>
          <Input value={fiscalForm[keys.cp] || ""} onChange={e => updateFiscal(keys.cp, e.target.value)} maxLength={5} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">País</Label>
          <Select value={fiscalForm[keys.pais] || ""} onValueChange={v => {
            updateFiscal(keys.pais, v);
            updateFiscal(keys.estado, "");
            updateFiscal(keys.municipio, "");
          }}>
            <SelectTrigger><SelectValue placeholder="Seleccionar país" /></SelectTrigger>
            <SelectContent>
              {paises.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Estado</Label>
          <Select value={fiscalForm[keys.estado]?.toString() || ""} onValueChange={v => {
            updateFiscal(keys.estado, v);
            updateFiscal(keys.municipio, "");
          }}>
            <SelectTrigger><SelectValue placeholder="Seleccionar estado" /></SelectTrigger>
            <SelectContent>
              {filteredEstados.map((e: any) => <SelectItem key={e.id} value={e.id.toString()}>{e.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Municipio</Label>
          <Select value={fiscalForm[keys.municipio]?.toString() || ""} onValueChange={v => updateFiscal(keys.municipio, v)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar municipio" /></SelectTrigger>
            <SelectContent>
              {filteredMunicipios.map((m: any) => <SelectItem key={m.id} value={m.id.toString()}>{m.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  const existingAccount = cuentas[0] || null;

  return (
    <>
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Configuración</h1>

      {/* Fiscal data card */}
      <Card className="sozu-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Datos de la Inmobiliaria</CardTitle>
          </div>
          {!isEditingFiscal ? (
            <Button variant="outline" size="sm" onClick={() => setIsEditingFiscal(true)}>
              <Edit className="h-4 w-4 mr-1" /> Editar
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setIsEditingFiscal(false); setCopiarDireccion(false); setFiscalForm({ ...persona }); }}>
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
                <TabsTrigger value="datos_fiscales">Datos Fiscales</TabsTrigger>
                <TabsTrigger value="proyectos">Proyectos</TabsTrigger>
              </TabsList>

              {/* Tab 1: Datos Generales */}
              <TabsContent value="datos">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { label: "Razón Social", key: "nombre_legal" },
                    { label: "Nombre Comercial", key: "nombre_comercial" },
                    { label: "Teléfono", key: "telefono" },
                    { label: "CURP", key: "curp" },
                  ].map(f => (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{f.label}</Label>
                      {isEditingFiscal ? (
                        <Input
                          value={fiscalForm[f.key] || ""}
                          onChange={e => updateFiscal(f.key, e.target.value)}
                          placeholder={f.label}
                        />
                      ) : (
                        <p className="font-medium text-foreground text-sm">{persona[f.key] || "—"}</p>
                      )}
                    </div>
                  ))}
                </div>
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

                {/* Representantes */}
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Representante Legal</Label>
                    {persona.id_entidad_relacionada_rep_leg ? (
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-emerald-500" />
                        <p className="font-medium text-foreground text-sm">{repLegalNombre || "Cargando..."}</p>
                      </div>
                    ) : (
                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsNewRepLegalDialogOpen(true)}
                          className="gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          Crear representante legal
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Representante Comercial</Label>
                    {persona.id_entidad_relacionada_rep_com ? (
                      <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-emerald-500" />
                        <p className="font-medium text-foreground text-sm">{repComNombre || "Cargando..."}</p>
                      </div>
                    ) : (
                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsNewRepComDialogOpen(true)}
                          className="gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          Crear representante comercial
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2: Dirección */}
              <TabsContent value="direccion">
                {renderAddressForm("direccion", "Dirección")}
              </TabsContent>

              {/* Tab 3: Datos Fiscales (RFC, Régimen, Uso CFDI + Dirección Fiscal) */}
              <TabsContent value="datos_fiscales">
                <div className="space-y-6">
                  {/* RFC, Régimen, Uso CFDI */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">RFC</Label>
                      {isEditingFiscal ? (
                        <Input
                          value={fiscalForm.rfc || ""}
                          onChange={e => updateFiscal("rfc", e.target.value.toUpperCase())}
                          placeholder="RFC"
                          maxLength={13}
                        />
                      ) : (
                        <p className="font-medium text-foreground text-sm">{persona.rfc || "—"}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Régimen Fiscal</Label>
                      {isEditingFiscal ? (
                        <Select value={fiscalForm.regimen?.toString() || ""} onValueChange={v => updateFiscal("regimen", v)}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar régimen" /></SelectTrigger>
                          <SelectContent>
                            {regimenes.map((r: any) => (
                              <SelectItem key={r.id} value={r.id.toString()}>{r.nombre}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="font-medium text-foreground text-sm">{getRegimenNombre(persona.regimen) || "—"}</p>
                      )}
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">Uso del CFDI</Label>
                      {isEditingFiscal ? (
                        <Select value={fiscalForm.uso_cfdi || ""} onValueChange={v => updateFiscal("uso_cfdi", v)}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar uso CFDI" /></SelectTrigger>
                          <SelectContent>
                            {usosCfdi.map((u: any) => (
                              <SelectItem key={u.codigo} value={u.codigo}>{u.codigo} - {u.nombre}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="font-medium text-foreground text-sm">
                          {persona.uso_cfdi ? `${persona.uso_cfdi} - ${getUsoCfdiNombre(persona.uso_cfdi)}` : "—"}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Dirección Fiscal */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-foreground">Dirección Fiscal</h3>
                      {isEditingFiscal && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="copiar-direccion"
                            checked={copiarDireccion}
                            onCheckedChange={(checked) => setCopiarDireccion(!!checked)}
                          />
                          <label htmlFor="copiar-direccion" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                            <Copy className="h-3 w-3" /> Copiar de dirección física
                          </label>
                        </div>
                      )}
                    </div>
                    {renderAddressForm("direccion_fiscal", "Dirección Fiscal")}
                  </div>
                </div>
              </TabsContent>

              {/* Tab 4: Proyectos */}
              <TabsContent value="proyectos">
                <InmobProyectosAcceso personaId={personaId} userEmail={profile?.email} />
              </TabsContent>
            </Tabs>
          ) : (
            <p className="text-muted-foreground">Cargando datos...</p>
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

/* ───── Proyectos Acceso sub-component ───── */
function InmobProyectosAcceso({ personaId, userEmail }: { personaId: number | null; userEmail?: string }) {
  const queryClient = useQueryClient();
  const [loadingProject, setLoadingProject] = useState<number | null>(null);

  const { data: primaryInmobEmail } = useQuery({
    queryKey: ["inmob-primary-email", personaId],
    queryFn: async () => {
      if (!personaId) return null;

      const { data: persona } = await supabase
        .from("personas")
        .select("email")
        .eq("id", personaId)
        .maybeSingle() as any;

      const { data: inmobUsers } = await supabase
        .from("usuarios")
        .select("email")
        .eq("id_persona", personaId)
        .eq("rol_id", 4) as any;

      if (!inmobUsers?.length) return null;

      const personaEmail = (persona?.email || "").toLowerCase();
      const principalUser = inmobUsers.find((u: any) => (u.email || "").toLowerCase() === personaEmail);
      return principalUser?.email || inmobUsers[0].email;
    },
    enabled: !!personaId,
  });

  // Fetch all projects the inmobiliaria currently has access to
  const { data: proyectos = [], isLoading } = useQuery({
    queryKey: ["inmob-config-proyectos", primaryInmobEmail],
    queryFn: async () => {
      if (!primaryInmobEmail) return [];
      const { data } = await supabase
        .from("proyectos_acceso")
        .select("proyecto_id, activo, proyectos(id, nombre)")
        .eq("usuario_id", primaryInmobEmail) as any;
      return (data || []).map((d: any) => ({
        id: d.proyectos?.id,
        nombre: d.proyectos?.nombre || `Proyecto ${d.proyecto_id}`,
        activo: d.activo ?? true,
      })).filter((p: any) => p.id);
    },
    enabled: !!primaryInmobEmail,
  });

  const handleToggle = async (projectId: number, enabled: boolean) => {
    if (!primaryInmobEmail) return;
    setLoadingProject(projectId);

    // Optimistic update
    const previousData = queryClient.getQueryData(["inmob-config-proyectos", primaryInmobEmail]);
    queryClient.setQueryData(["inmob-config-proyectos", primaryInmobEmail], (old: any[]) =>
      old?.map((p: any) => p.id === projectId ? { ...p, activo: enabled } : p) ?? []
    );

    try {
      if (enabled) {
        // Re-insert or update to active
        const { data: existing } = await supabase
          .from("proyectos_acceso")
          .select("proyecto_id")
          .eq("usuario_id", primaryInmobEmail)
          .eq("proyecto_id", projectId)
          .maybeSingle() as any;

        if (existing) {
          const { error } = await supabase
            .from("proyectos_acceso")
            .update({ activo: true } as any)
            .eq("usuario_id", primaryInmobEmail)
            .eq("proyecto_id", projectId) as any;
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("proyectos_acceso")
            .insert({ usuario_id: primaryInmobEmail, proyecto_id: projectId } as any) as any;
          if (error && !error.message?.includes("duplicate")) throw error;
        }
        toast.success("Proyecto habilitado para agentes");
      } else {
        // Deactivate - set activo = false so the trigger cascades to agents
        const { error } = await supabase
          .from("proyectos_acceso")
          .update({ activo: false } as any)
          .eq("usuario_id", primaryInmobEmail)
          .eq("proyecto_id", projectId) as any;
        if (error) throw error;
        toast.success("Proyecto deshabilitado para agentes");
      }
      queryClient.invalidateQueries({ queryKey: ["inmob-config-proyectos", primaryInmobEmail] });
    } catch (err: any) {
      // Rollback
      queryClient.setQueryData(["inmob-config-proyectos", primaryInmobEmail], previousData);
      toast.error("Error: " + (err.message || "Intenta de nuevo"));
    } finally {
      setLoadingProject(null);
    }
  };

  if (isLoading) return <p className="text-muted-foreground text-sm py-4">Cargando proyectos...</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Selecciona los proyectos a los que tus agentes tendrán acceso heredado. Desactiva un proyecto para que tus agentes no lo vean.
      </p>
      {proyectos.length === 0 ? (
        <p className="text-muted-foreground text-center py-6">No tienes proyectos asignados</p>
      ) : (
        <div className="space-y-2">
          {proyectos.map((p: any) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{p.nombre}</span>
              </div>
              <Switch
                checked={p.activo}
                disabled={loadingProject === p.id}
                onCheckedChange={(checked) => handleToggle(p.id, checked)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
