import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocumentsTab } from "./DocumentsTab";
import { BankAccountsSection } from "./BankAccountsSection";
import { validateRFC } from "@/utils/fiscalDataValidation";
import type { OnboardingStep } from "@/hooks/useAgentOnboardingStatus";

interface AgentOnboardingStepDialogProps {
  step: OnboardingStep['id'];
  personaId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEP_TITLES: Record<string, string> = {
  basic: 'Información Básica',
  address: 'Dirección',
  fiscal: 'Información Fiscal',
  documents: 'Documentos',
  'bank-accounts': 'Cuentas Bancarias',
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  basic: 'Tu nombre, correo y teléfono',
  address: 'Tu dirección física completa',
  fiscal: 'RFC, régimen fiscal y dirección fiscal',
  documents: 'INE, Constancia y Contrato de comercialización',
  'bank-accounts': 'Agrega al menos una cuenta bancaria',
};

export function AgentOnboardingStepDialog({ step, personaId, open, onOpenChange }: AgentOnboardingStepDialogProps) {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  // Full fetch persona data
  const { data: persona, isLoading } = useQuery({
    queryKey: ['agent-onboarding-step-persona', personaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .eq('id', personaId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!personaId,
  });

  const title = STEP_TITLES[step];
  const description = STEP_DESCRIPTIONS[step];

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['agent-onboarding-persona'] });
    queryClient.invalidateQueries({ queryKey: ['agent-onboarding-docs'] });
    queryClient.invalidateQueries({ queryKey: ['agent-onboarding-bank'] });
    queryClient.invalidateQueries({ queryKey: ['agent-onboarding-step-persona'] });
    onOpenChange(false);
  };

  const content = isLoading ? (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  ) : step === 'documents' ? (
    <div className="px-1">
      <DocumentsTab entityId={personaId} entityType="persona" tipoPersona="pf" onDocumentAdded={() => {
        queryClient.invalidateQueries({ queryKey: ['agent-onboarding-docs'] });
      }} />
    </div>
  ) : step === 'bank-accounts' ? (
    <div className="px-1">
      <BankAccountsSection personId={personaId} />
    </div>
  ) : (
    <StepForm step={step} persona={persona} personaId={personaId} onSaved={handleSaved} />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left pb-2">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="px-4 pb-6 overflow-y-auto" style={{ maxHeight: 'calc(92vh - 100px)' }}>
            {content}
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}

// ---------- Step Form ----------

interface StepFormProps {
  step: 'basic' | 'address' | 'fiscal';
  persona: any;
  personaId: number;
  onSaved: () => void;
}

function StepForm({ step, persona, personaId, onSaved }: StepFormProps) {
  const [saving, setSaving] = useState(false);

  // Basic fields
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [curp, setCurp] = useState('');

  // Address fields
  const [calle, setCalle] = useState('');
  const [numExt, setNumExt] = useState('');
  const [numInt, setNumInt] = useState('');
  const [colonia, setColonia] = useState('');
  const [cp, setCp] = useState('');
  const [idPais, setIdPais] = useState('');
  const [idEstado, setIdEstado] = useState('');
  const [idMunicipio, setIdMunicipio] = useState('');

  // Fiscal fields
  const [rfc, setRfc] = useState('');
  const [regimen, setRegimen] = useState('');
  const [usoCfdi, setUsoCfdi] = useState('');
  const [fCalle, setFCalle] = useState('');
  const [fNumExt, setFNumExt] = useState('');
  const [fNumInt, setFNumInt] = useState('');
  const [fColonia, setFColonia] = useState('');
  const [fCp, setFCp] = useState('');
  const [fIdPais, setFIdPais] = useState('');
  const [fIdEstado, setFIdEstado] = useState('');
  const [fIdMunicipio, setFIdMunicipio] = useState('');
  const [copiarDireccion, setCopiarDireccion] = useState(false);

  // Initialize from persona
  useEffect(() => {
    if (!persona) return;
    setNombre(persona.nombre_legal || '');
    setEmail(persona.email || '');
    setTelefono(persona.telefono || '');
    setCurp(persona.curp || '');
    setCalle(persona.direccion_calle || '');
    setNumExt(persona.direccion_num_ext || '');
    setNumInt(persona.direccion_num_int || '');
    setColonia(persona.direccion_colonia || '');
    setCp(persona.direccion_codigo_postal || '');
    setIdPais(persona.direccion_id_pais || '');
    setIdEstado(persona.direccion_id_estado?.toString() || '');
    setIdMunicipio(persona.direccion_id_municipio?.toString() || '');
    setRfc(persona.rfc || '');
    setRegimen(persona.regimen?.toString() || '');
    setUsoCfdi(persona.uso_cfdi || '');
    setFCalle(persona.direccion_fiscal_calle || '');
    setFNumExt(persona.direccion_fiscal_num_ext || '');
    setFNumInt(persona.direccion_fiscal_num_int || '');
    setFColonia(persona.direccion_fiscal_colonia || '');
    setFCp(persona.direccion_fiscal_codigo_postal || '');
    setFIdPais(persona.direccion_fiscal_id_pais || '');
    setFIdEstado(persona.direccion_fiscal_id_estado?.toString() || '');
    setFIdMunicipio(persona.direccion_fiscal_id_municipio?.toString() || '');
  }, [persona]);

  // Lookups
  const { data: paises = [] } = useQuery({
    queryKey: ['paises'],
    queryFn: async () => {
      const { data } = await supabase.from('paises').select('id, nombre').eq('activo', true).order('nombre');
      return data || [];
    },
  });

  const { data: estados = [] } = useQuery({
    queryKey: ['estados'],
    queryFn: async () => {
      const { data } = await supabase.from('estados_mx').select('id, nombre, id_pais').eq('activo', true).order('nombre');
      return data || [];
    },
  });

  const { data: municipios = [] } = useQuery({
    queryKey: ['municipios-all'],
    queryFn: async () => {
      const { data } = await supabase.from('municipios_mx').select('id, nombre, id_estado').eq('activo', true).order('nombre');
      return data || [];
    },
    enabled: step === 'address' || step === 'fiscal',
  });

  const { data: regimenes = [] } = useQuery({
    queryKey: ['regimen', 'pf'],
    queryFn: async () => {
      const { data } = await supabase.from('regimen').select('id, nombre').eq('activo', true).in('tipo', ['pf']).order('nombre');
      return data || [];
    },
    enabled: step === 'fiscal',
  });

  const { data: usosCfdi = [] } = useQuery({
    queryKey: ['uso_cfdi', 'pf'],
    queryFn: async () => {
      const { data } = await supabase.from('uso_cfdi').select('codigo, nombre').eq('activo', true).in('tipo', ['pf', 'a']).order('codigo');
      return data || [];
    },
    enabled: step === 'fiscal',
  });

  // Copy address for fiscal
  useEffect(() => {
    if (copiarDireccion) {
      setFCalle(calle || persona?.direccion_calle || '');
      setFNumExt(numExt || persona?.direccion_num_ext || '');
      setFNumInt(numInt || persona?.direccion_num_int || '');
      setFColonia(colonia || persona?.direccion_colonia || '');
      setFCp(cp || persona?.direccion_codigo_postal || '');
      setFIdPais(idPais || persona?.direccion_id_pais || '');
      setFIdEstado(idEstado || persona?.direccion_id_estado?.toString() || '');
      setFIdMunicipio(idMunicipio || persona?.direccion_id_municipio?.toString() || '');
    }
  }, [copiarDireccion]);

  // Filtered lookups
  const filteredEstados = (paisId: string) => estados.filter((e: any) => e.id_pais === paisId);
  const filteredMunicipios = (estadoId: string) => municipios.filter((m: any) => m.id_estado === parseInt(estadoId));

  const handleSave = async () => {
    setSaving(true);
    try {
      let updateData: any = {};

      if (step === 'basic') {
        if (!nombre.trim() || !email.trim() || !telefono.trim()) {
          toast.error("Nombre, email y teléfono son obligatorios.");
          setSaving(false);
          return;
        }
        if (telefono.trim().length !== 10) {
          toast.error("El teléfono debe tener 10 dígitos.");
          setSaving(false);
          return;
        }
        if (curp.trim()) {
          const curpRegex = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;
          if (!curpRegex.test(curp.trim().toUpperCase())) {
            toast.error("El formato del CURP no es válido (18 caracteres alfanuméricos).");
            setSaving(false);
            return;
          }
        }
        updateData = {
          nombre_legal: nombre.trim(),
          email: email.trim(),
          telefono: telefono.trim(),
          curp: curp.trim().toUpperCase() || null,
        };
      } else if (step === 'address') {
        if (!calle.trim() || !numExt.trim() || !colonia.trim() || !cp.trim() || !idPais || !idEstado || !idMunicipio) {
          toast.error("Completa todos los campos de dirección obligatorios.");
          setSaving(false);
          return;
        }
        updateData = {
          direccion_calle: calle.trim(),
          direccion_num_ext: numExt.trim(),
          direccion_num_int: numInt.trim() || null,
          direccion_colonia: colonia.trim(),
          direccion_codigo_postal: cp.trim(),
          direccion_id_pais: idPais,
          direccion_id_estado: parseInt(idEstado),
          direccion_id_municipio: parseInt(idMunicipio),
        };
      } else if (step === 'fiscal') {
        if (!rfc.trim()) {
          toast.error("El RFC es obligatorio.");
          setSaving(false);
          return;
        }
        const rfcValidation = validateRFC(rfc);
        if (!rfcValidation.isValid) {
          toast.error(rfcValidation.error || "RFC inválido.");
          setSaving(false);
          return;
        }
        if (!regimen || !usoCfdi) {
          toast.error("Régimen y Uso CFDI son obligatorios.");
          setSaving(false);
          return;
        }
        updateData = {
          rfc: rfc.trim().toUpperCase(),
          regimen: parseInt(regimen),
          uso_cfdi: usoCfdi,
          direccion_fiscal_calle: fCalle.trim() || null,
          direccion_fiscal_num_ext: fNumExt.trim() || null,
          direccion_fiscal_num_int: fNumInt.trim() || null,
          direccion_fiscal_colonia: fColonia.trim() || null,
          direccion_fiscal_codigo_postal: fCp.trim() || null,
          direccion_fiscal_id_pais: fIdPais || null,
          direccion_fiscal_id_estado: fIdEstado ? parseInt(fIdEstado) : null,
          direccion_fiscal_id_municipio: fIdMunicipio ? parseInt(fIdMunicipio) : null,
        };
      }

      const { error } = await supabase
        .from('personas')
        .update(updateData)
        .eq('id', personaId);

      if (error) throw error;

      // Sync phone to usuarios if basic step
      if (step === 'basic') {
        await supabase
          .from('usuarios')
          .update({ telefono: telefono.trim() })
          .eq('id_persona', personaId);
      }

      toast.success("Información guardada correctamente.");
      onSaved();
    } catch (err: any) {
      toast.error("Error al guardar: " + (err.message || "Error desconocido"));
    } finally {
      setSaving(false);
    }
  };

  // Render address fields helper
  const renderAddressFields = (
    prefix: string,
    calleVal: string, setCalleVal: (v: string) => void,
    numExtVal: string, setNumExtVal: (v: string) => void,
    numIntVal: string, setNumIntVal: (v: string) => void,
    coloniaVal: string, setColoniaVal: (v: string) => void,
    cpVal: string, setCpVal: (v: string) => void,
    paisVal: string, setPaisVal: (v: string) => void,
    estadoVal: string, setEstadoVal: (v: string) => void,
    municipioVal: string, setMunicipioVal: (v: string) => void,
  ) => (
    <div className="space-y-4">
      <div>
        <Label>Calle *</Label>
        <Input value={calleVal} onChange={(e) => setCalleVal(e.target.value)} className="mt-1" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Num. Ext. *</Label>
          <Input value={numExtVal} onChange={(e) => setNumExtVal(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>Num. Int.</Label>
          <Input value={numIntVal} onChange={(e) => setNumIntVal(e.target.value)} className="mt-1" />
        </div>
      </div>
      <div>
        <Label>Colonia *</Label>
        <Input value={coloniaVal} onChange={(e) => setColoniaVal(e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label>Código Postal *</Label>
        <Input value={cpVal} onChange={(e) => setCpVal(e.target.value)} className="mt-1" maxLength={5} />
      </div>
      <div>
        <Label>País *</Label>
        <Select value={paisVal} onValueChange={(v) => { setPaisVal(v); setEstadoVal(''); setMunicipioVal(''); }}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona" /></SelectTrigger>
          <SelectContent>
            {paises.map((p: any) => (
              <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Estado *</Label>
        <Select value={estadoVal} onValueChange={(v) => { setEstadoVal(v); setMunicipioVal(''); }}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona" /></SelectTrigger>
          <SelectContent>
            {filteredEstados(paisVal).map((e: any) => (
              <SelectItem key={e.id} value={e.id.toString()}>{e.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Municipio *</Label>
        <Select value={municipioVal} onValueChange={setMunicipioVal}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona" /></SelectTrigger>
          <SelectContent>
            {filteredMunicipios(estadoVal).map((m: any) => (
              <SelectItem key={m.id} value={m.id.toString()}>{m.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 pb-4">
      {step === 'basic' && (
        <div className="space-y-4">
          <div>
            <Label>Nombre completo *</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Correo electrónico *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
          </div>
           <div>
            <Label>Teléfono (10 dígitos) *</Label>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ''))} maxLength={10} className="mt-1" />
          </div>
          <div>
            <Label>CURP <span className="text-muted-foreground text-xs">(opcional)</span></Label>
            <Input value={curp} onChange={(e) => setCurp(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={18} placeholder="Ej. GARC850101HDFRRL09" className="mt-1" />
          </div>
        </div>
      )}

      {step === 'address' && renderAddressFields(
        'dir', calle, setCalle, numExt, setNumExt, numInt, setNumInt,
        colonia, setColonia, cp, setCp, idPais, setIdPais, idEstado, setIdEstado, idMunicipio, setIdMunicipio
      )}

      {step === 'fiscal' && (
        <div className="space-y-4">
          <div>
            <Label>RFC *</Label>
            <Input value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())} maxLength={13} className="mt-1" />
          </div>
          <div>
            <Label>Régimen Fiscal *</Label>
            <Select value={regimen} onValueChange={setRegimen}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent>
                {regimenes.map((r: any) => (
                  <SelectItem key={r.id} value={r.id.toString()}>{r.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Uso CFDI *</Label>
            <Select value={usoCfdi} onValueChange={setUsoCfdi}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecciona" /></SelectTrigger>
              <SelectContent>
                {usosCfdi.map((u: any) => (
                  <SelectItem key={u.codigo} value={u.codigo}>{u.codigo} - {u.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Checkbox id="copiar" checked={copiarDireccion} onCheckedChange={(c) => setCopiarDireccion(!!c)} />
            <Label htmlFor="copiar" className="text-sm cursor-pointer">Copiar dirección física</Label>
          </div>

          <p className="text-xs font-medium text-muted-foreground pt-1">Dirección Fiscal</p>
          {renderAddressFields(
            'fiscal', fCalle, setFCalle, fNumExt, setFNumExt, fNumInt, setFNumInt,
            fColonia, setFColonia, fCp, setFCp, fIdPais, setFIdPais, fIdEstado, setFIdEstado, fIdMunicipio, setFIdMunicipio
          )}
        </div>
      )}

      <Button onClick={handleSave} disabled={saving} className="w-full h-12 text-base font-semibold">
        {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando...</> : "Guardar"}
      </Button>
    </div>
  );
}
