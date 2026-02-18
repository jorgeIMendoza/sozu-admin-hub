import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Camera, Upload, CalendarIcon, Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BeneficiariosForm } from "./BeneficiariosForm";
import { BankAccountsSection } from "./BankAccountsSection";
import { TempBankAccountsSection } from "./TempBankAccountsSection";
import { TempBeneficiariosSection } from "./TempBeneficiariosSection";
import { ImageUploadField } from "./ImageUploadField";
import { DocumentsTab } from "./DocumentsTab";
import { isFiscalDataComplete, validateRFC } from '@/utils/fiscalDataValidation';
import { RepresentanteLegalSelector } from "./RepresentanteLegalSelector";
import { RepresentanteComercialSelector } from "./RepresentanteComercialSelector";

interface PersonFormProps {
  onSubmit: (data: any) => void;
  initialData?: any;
  isLoading?: boolean;
  onCancel: () => void;
  entityType?: 'legal' | 'client' | 'representative' | 'user' | 'desarrollador' | 'inmobiliaria' | 'administradora' | 'banco' | 'buyer' | 'seller' | 'owner' | 'resident' | 'agent' | 'administrator' | 'vendedor' | 'comprador' | 'dueno' | 'residente' | 'agente' | 'administrador' | 'representante_legal';
  fixedEntityType?: boolean;
  restrictToBasicTab?: boolean;
  hideEmailField?: boolean;
  documentsReadOnly?: boolean;
  hideComision?: boolean;
}

export function PersonForm({ onSubmit, initialData, isLoading, onCancel, entityType = 'user', fixedEntityType = false, restrictToBasicTab = false, hideEmailField = false, documentsReadOnly = false, hideComision = false }: PersonFormProps) {
  // Basic info
  const [nombre, setNombre] = useState(initialData?.nombre || initialData?.nombre_legal || '');
  const [nombreComercial, setNombreComercial] = useState(initialData?.nombre_comercial || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [telefono, setTelefono] = useState(initialData?.telefono || '');
  const [clavePaisTelefono, setClavePaisTelefono] = useState(initialData?.clave_pais_telefono || 'MX');
  const [tipoPersona, setTipoPersona] = useState(
    initialData?.tipo_persona || 
    (entityType === 'legal' || entityType === 'desarrollador' || entityType === 'inmobiliaria' || entityType === 'administradora' || entityType === 'banco' ? 'pm' : 
     entityType === 'representative' || entityType === 'representante_legal' ? 'pf' : 
     'pf')
  );
  const [idTipoEntidad, setIdTipoEntidad] = useState(initialData?.id_tipo_entidad || getDefaultTipoEntidad(entityType));
  const [idRepresentanteLegal, setIdRepresentanteLegal] = useState(initialData?.id_entidad_relacionada_rep_leg || '');
  const [idRepresentanteComercial, setIdRepresentanteComercial] = useState(initialData?.id_entidad_relacionada_rep_com || '');
  const [idInmobiliaria, setIdInmobiliaria] = useState(initialData?.id_inmobiliaria?.toString() || '');
  const [porcentajeComision, setPorcentajeComision] = useState(initialData?.porcentaje_comision ?? (entityType === 'inmobiliaria' ? 2.00 : 0));
  
  // Project selection for prospects (clients with tipo_entidad = 7)
  const [idProyecto, setIdProyecto] = useState(
    initialData?.id_proyecto ? initialData.id_proyecto.toString() : "null"
  );
  
  // Identification
  const [curp, setCurp] = useState(initialData?.curp || '');
  const [rfc, setRfc] = useState(initialData?.rfc || '');
  const [rfcError, setRfcError] = useState<string | null>(null);
  const [usoCfdi, setUsoCfdi] = useState(initialData?.uso_cfdi || '');
  const [regimen, setRegimen] = useState(initialData?.regimen?.toString() || '');
  
  // RFC validation handler
  const handleRfcChange = (value: string) => {
    const upperValue = value.toUpperCase();
    setRfc(upperValue);
    
    if (upperValue.trim()) {
      const validation = validateRFC(upperValue);
      setRfcError(validation.error || null);
    } else {
      setRfcError(null);
    }
  };
  const [idTipoIdentificacion, setIdTipoIdentificacion] = useState(initialData?.id_tipo_identificacion || '');
  
  // Personal info
  const [sexo, setSexo] = useState(initialData?.sexo || '');
  const [fechaNacimiento, setFechaNacimiento] = useState(initialData?.fecha_nacimiento ? new Date(initialData.fecha_nacimiento) : undefined);
  const [idEstadoCivil, setIdEstadoCivil] = useState(initialData?.id_estado_civil ? initialData.id_estado_civil.toString() : '');
  const [idConyuge, setIdConyuge] = useState(initialData?.id_conyuge ? initialData.id_conyuge.toString() : '');
  const [searchConyuge, setSearchConyuge] = useState('');
  const [ocupacion, setOcupacion] = useState(initialData?.ocupacion || '');
  
  // Birth place
  const [idPaisNacimiento, setIdPaisNacimiento] = useState(initialData?.id_pais_nacimiento || '');
  const [idEstadoNacimiento, setIdEstadoNacimiento] = useState(initialData?.id_estado_nacimiento ? initialData.id_estado_nacimiento.toString() : '');
  const [idMunicipioNacimiento, setIdMunicipioNacimiento] = useState(initialData?.id_municipio_nacimiento ? initialData.id_municipio_nacimiento.toString() : '');
  
  // Address
  const [direccionCalle, setDireccionCalle] = useState(initialData?.direccion_calle || '');
  const [direccionNumExt, setDireccionNumExt] = useState(initialData?.direccion_num_ext || '');
  const [direccionNumInt, setDireccionNumInt] = useState(initialData?.direccion_num_int || '');
  const [direccionColonia, setDireccionColonia] = useState(initialData?.direccion_colonia || '');
  const [direccionCp, setDireccionCp] = useState(initialData?.direccion_codigo_postal || '');
  const [idPaisDireccion, setIdPaisDireccion] = useState(initialData?.direccion_id_pais || '');
  const [idEstadoDireccion, setIdEstadoDireccion] = useState(initialData?.direccion_id_estado ? initialData.direccion_id_estado.toString() : '');
  const [idMunicipioDireccion, setIdMunicipioDireccion] = useState(initialData?.direccion_id_municipio ? initialData.direccion_id_municipio.toString() : '');
  
  // Fiscal address
  const [direccionFiscalCalle, setDireccionFiscalCalle] = useState(initialData?.direccion_fiscal_calle || '');
  const [direccionFiscalNumExt, setDireccionFiscalNumExt] = useState(initialData?.direccion_fiscal_num_ext || '');
  const [direccionFiscalNumInt, setDireccionFiscalNumInt] = useState(initialData?.direccion_fiscal_num_int || '');
  const [direccionFiscalColonia, setDireccionFiscalColonia] = useState(initialData?.direccion_fiscal_colonia || '');
  const [direccionFiscalCp, setDireccionFiscalCp] = useState(initialData?.direccion_fiscal_codigo_postal || '');
  const [idPaisFiscal, setIdPaisFiscal] = useState(initialData?.direccion_fiscal_id_pais || '');
  const [idEstadoFiscal, setIdEstadoFiscal] = useState(initialData?.direccion_fiscal_id_estado ? initialData.direccion_fiscal_id_estado.toString() : '');
  const [idMunicipioFiscal, setIdMunicipioFiscal] = useState(initialData?.direccion_fiscal_id_municipio ? initialData.direccion_fiscal_id_municipio.toString() : '');
  
  // Copy address checkbox
  const [copiarDireccionFiscal, setCopiarDireccionFiscal] = useState(false);

  // Legal info (for legal entities)
  const [numeroEscritura, setNumeroEscritura] = useState(initialData?.numero_escritura || '');
  const [numeroLibro, setNumeroLibro] = useState(initialData?.numero_libro || '');
  const [folioMercantil, setFolioMercantil] = useState(initialData?.folio_mercantil || '');
  const [fechaEscritura, setFechaEscritura] = useState(initialData?.fecha_escritura ? new Date(initialData.fecha_escritura) : undefined);
  const [fechaRegistro, setFechaRegistro] = useState(initialData?.fecha_registro ? new Date(initialData.fecha_registro) : undefined);
  const [idNotario, setIdNotario] = useState(initialData?.id_notario || '');
  

  // Document processing
  const [documentImageUrl, setDocumentImageUrl] = useState(initialData?.url_documento_identificacion || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApiProcessing, setIsApiProcessing] = useState(false);
  
  // Logo
  const [urlLogo, setUrlLogo] = useState(initialData?.url_logo || '');
  
  // Pending documents for new persons
  const [pendingDocuments, setPendingDocuments] = useState<Array<{
    file: File;
    tipoDocumento: string;
    tempId: string;
  }>>([]);

  // Temporary bank accounts and beneficiaries for new persons
  const [tempBankAccounts, setTempBankAccounts] = useState<Array<{
    tempId: string;
    id_banco: string;
    numero_cuenta: string;
    cuenta_clabe: string;
    cuenta_swift: string;
    url_evidencia: string;
    es_cuenta_fisica_para_stp: boolean;
  }>>([]);

  const [tempBeneficiaries, setTempBeneficiaries] = useState<Array<{
    tempId: string;
    nombre_beneficiario: string;
    email: string;
    telefono: string;
    id_parentesco: string;
    porcentaje_participacion: string;
  }>>([]);

  // State to track if bank accounts section is in editing mode
  const [isBankAccountsEditing, setIsBankAccountsEditing] = useState(false);
  
  // Using sonner toast imported at line 11

  const handleCreatePerson = async () => {
    try {
      const formData: any = {
        nombre_legal: nombre.trim(),
        nombre_comercial: nombreComercial.trim() || null,
        email: email.trim(),
        telefono: telefono.trim() || null,
        clave_pais_telefono: clavePaisTelefono || null,
        tipo_persona: tipoPersona,
        curp: curp.trim() || null,
        rfc: rfc.trim() || null,
        uso_cfdi: usoCfdi.trim() || null,
        regimen: regimen ? parseInt(regimen) : null,
        activo: true,
      };

      const { data: person, error } = await supabase
        .from('personas')
        .insert(formData)
        .select()
        .single();

      if (error) throw error;

      // Return the created person to the parent component
      onSubmit({
        id: person.id,
        nombre_legal: person.nombre_legal,
        nombre: person.nombre_legal, // For backwards compatibility
        rfc: person.rfc,
        curp: person.curp,
        email: person.email,
        telefono: person.telefono,
        tipo_persona: person.tipo_persona
      });

      toast.success("Persona creada exitosamente");
    } catch (error) {
      console.error('Error creating person:', error);
      toast.error("Error al crear la persona: " + (error as Error).message);
    }
  };

  // Copy address functionality
  useEffect(() => {
    if (copiarDireccionFiscal) {
      setDireccionFiscalCalle(direccionCalle);
      setDireccionFiscalNumExt(direccionNumExt);
      setDireccionFiscalNumInt(direccionNumInt);
      setDireccionFiscalColonia(direccionColonia);
      setDireccionFiscalCp(direccionCp);
      setIdPaisFiscal(idPaisDireccion);
      setIdEstadoFiscal(idEstadoDireccion);
      setIdMunicipioFiscal(idMunicipioDireccion);
    }
  }, [copiarDireccionFiscal, direccionCalle, direccionNumExt, direccionNumInt, direccionColonia, direccionCp, idPaisDireccion, idEstadoDireccion, idMunicipioDireccion]);

  // Fetch lookup data
  const { data: paises = [] } = useQuery({
    queryKey: ['paises'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('paises')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: estados = [] } = useQuery({
    queryKey: ['estados'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estados_mx')
        .select('id, nombre, id_pais')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: municipios = [] } = useQuery({
    queryKey: ['municipios', idEstadoDireccion, idEstadoNacimiento, idEstadoFiscal],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('municipios_mx')
        .select('id, nombre, id_estado')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!(idEstadoDireccion || idEstadoNacimiento || idEstadoFiscal)
  });

  // Clear estado/municipio when país changes for direccion
  useEffect(() => {
    if (idPaisDireccion && idEstadoDireccion && estados.length > 0) {
      const estadoValido = estados.find(e => e.id.toString() === idEstadoDireccion.toString() && e.id_pais === idPaisDireccion);
      if (!estadoValido) {
        setIdEstadoDireccion('');
        setIdMunicipioDireccion('');
      }
    }
  }, [idPaisDireccion, estados, idEstadoDireccion]);

  // Clear municipio when estado changes for direccion
  useEffect(() => {
    if (idEstadoDireccion && idMunicipioDireccion && municipios.length > 0) {
      const municipioValido = municipios.find(m => m.id.toString() === idMunicipioDireccion.toString() && m.id_estado === parseInt(idEstadoDireccion));
      if (!municipioValido) {
        setIdMunicipioDireccion('');
      }
    }
  }, [idEstadoDireccion, municipios, idMunicipioDireccion]);

  // Clear estado/municipio when país changes for nacimiento
  useEffect(() => {
    if (idPaisNacimiento && idEstadoNacimiento && estados.length > 0) {
      const estadoValido = estados.find(e => e.id.toString() === idEstadoNacimiento.toString() && e.id_pais === idPaisNacimiento);
      if (!estadoValido) {
        setIdEstadoNacimiento('');
        setIdMunicipioNacimiento('');
      }
    }
  }, [idPaisNacimiento, estados, idEstadoNacimiento]);

  // Clear municipio when estado changes for nacimiento
  useEffect(() => {
    if (idEstadoNacimiento && idMunicipioNacimiento && municipios.length > 0) {
      const municipioValido = municipios.find(m => m.id.toString() === idMunicipioNacimiento.toString() && m.id_estado === parseInt(idEstadoNacimiento));
      if (!municipioValido) {
        setIdMunicipioNacimiento('');
      }
    }
  }, [idEstadoNacimiento, municipios, idMunicipioNacimiento]);

  // Clear estado/municipio when país changes for fiscal
  useEffect(() => {
    if (idPaisFiscal && idEstadoFiscal && estados.length > 0) {
      const estadoValido = estados.find(e => e.id.toString() === idEstadoFiscal.toString() && e.id_pais === idPaisFiscal);
      if (!estadoValido) {
        setIdEstadoFiscal('');
        setIdMunicipioFiscal('');
      }
    }
  }, [idPaisFiscal, estados, idEstadoFiscal]);

  // Clear municipio when estado changes for fiscal
  useEffect(() => {
    if (idEstadoFiscal && idMunicipioFiscal && municipios.length > 0 && !copiarDireccionFiscal) {
      const municipioValido = municipios.find(m => m.id.toString() === idMunicipioFiscal.toString() && m.id_estado === parseInt(idEstadoFiscal));
      if (!municipioValido) {
        setIdMunicipioFiscal('');
      }
    }
  }, [idEstadoFiscal, municipios, idMunicipioFiscal, copiarDireccionFiscal]);

  const { data: estadosCivil = [] } = useQuery({
    queryKey: ['estados_civil'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estados_civil')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch potential spouses (only personas físicas que sean compradores)
  const { data: personasDisponibles = [] } = useQuery({
    queryKey: ['personas_disponibles_conyuge', initialData?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select(`
          id,
          nombre_legal,
          email,
          rfc,
          curp,
          id_estado_civil,
          entidades_relacionadas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            id_tipo_entidad
          )
        `)
        .eq('activo', true)
        .eq('tipo_persona', 'pf')
        .eq('entidades_relacionadas.activo', true)
        .eq('entidades_relacionadas.id_tipo_entidad', 2)
        .is('entidades_relacionadas.id_proyecto', null)
        .neq('id', initialData?.id || 0)
        .order('nombre_legal');
      
      if (error) throw error;
      return data || [];
    },
    enabled: idEstadoCivil === '2' || idEstadoCivil === 2,
  });

  // Fetch spouse name if already assigned
  const { data: conyugeData } = useQuery({
    queryKey: ['conyuge_info', initialData?.id_conyuge],
    queryFn: async () => {
      if (!initialData?.id_conyuge) return null;
      
      const { data, error } = await supabase
        .from('personas')
        .select('id, nombre_legal, rfc, curp, email')
        .eq('id', initialData.id_conyuge)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!initialData?.id_conyuge,
  });

  const { data: notarios = [] } = useQuery({
    queryKey: ['notarios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notarios')
        .select('id, nombre, notaria')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return data || [];
    },
  });

  const { data: regimenes = [] } = useQuery({
    queryKey: ['regimen', tipoPersona, entityType],
    queryFn: async () => {
      console.log('Fetching regimenes for tipoPersona:', tipoPersona, 'entityType:', entityType);
      
      if (!tipoPersona || (tipoPersona !== 'pm' && tipoPersona !== 'pf')) {
        console.log('Invalid tipoPersona:', tipoPersona);
        return [];
      }
      
      // Use the exact query structure provided by user
      const query = supabase
        .from('regimen')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      
      // Apply tipo filter based on person type
      if (tipoPersona === 'pm') {
        query.in('tipo', ['pm']);
      } else if (tipoPersona === 'pf') {
        query.in('tipo', ['pf']);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching regimenes:', error);
        throw error;
      }
      console.log('Regimenes fetched for tipo:', tipoPersona, 'data:', data);
      return data || [];
    },
    enabled: !!tipoPersona && shouldShowTaxFields() && (tipoPersona === 'pm' || tipoPersona === 'pf'),
  });

  const { data: usosCfdi = [] } = useQuery({
    queryKey: ['uso_cfdi', tipoPersona, entityType],
    queryFn: async () => {
      if (!tipoPersona || (tipoPersona !== 'pm' && tipoPersona !== 'pf')) {
        console.log('Invalid tipoPersona for uso_cfdi:', tipoPersona);
        return [];
      }
      
      // Use the exact query structure provided by user
      const filterTypes = tipoPersona === 'pm' ? ['pm', 'a'] : ['pf', 'a'];
      console.log('Fetching uso_cfdi for tipoPersona:', tipoPersona, 'filterTypes:', filterTypes, 'entityType:', entityType);
      
      const { data, error } = await supabase
        .from('uso_cfdi')
        .select('codigo, nombre')
        .eq('activo', true)
        .in('tipo', filterTypes)
        .order('codigo');
      
      if (error) {
        console.error('Error fetching uso_cfdi:', error);
        throw error;
      }
      console.log('Uso CFDI fetched for tipos:', filterTypes, 'data:', data);
      return data || [];
    },
    enabled: !!tipoPersona && shouldShowTaxFields() && (tipoPersona === 'pm' || tipoPersona === 'pf'),
  });

  const { data: tiposEntidad = [] } = useQuery({
    queryKey: ['tipos_entidad', entityType],
    queryFn: async () => {
      let query = supabase
        .from('tipos_entidad')
        .select('id, nombre')
        .eq('padre', 'p')
        .eq('activo', true);
      
      // Filter based on entity type
      if (entityType === 'legal') {
        // Exclude Desarrollador, Inmobiliaria and Administradora from legal entities form
        query = query.not('nombre', 'in', '(Desarrollador,Inmobiliaria,Administradora)');
      } else if (entityType === 'desarrollador') {
        query = query.eq('nombre', 'Desarrollador');
      } else if (entityType === 'inmobiliaria') {
        query = query.eq('nombre', 'Inmobiliaria');
      }
      
      const { data, error } = await query.order('nombre');
      
      if (error) {
        console.error('Error fetching tipos_entidad:', error);
        throw error;
      }
      return data || [];
    },
    enabled: entityType === 'legal' || entityType === 'desarrollador' || entityType === 'inmobiliaria' || (entityType === 'client' && tipoPersona === 'pm')
  });

  // Set default entity type for desarrollador/inmobiliaria
  useEffect(() => {
    if ((entityType === 'desarrollador' || entityType === 'inmobiliaria') && tiposEntidad.length > 0 && !idTipoEntidad) {
      const defaultTipo = tiposEntidad.find(tipo => 
        tipo.nombre === (entityType === 'desarrollador' ? 'Desarrollador' : 'Inmobiliaria')
      );
      if (defaultTipo) {
        setIdTipoEntidad(defaultTipo.id);
      }
    }
  }, [entityType, tiposEntidad, idTipoEntidad]);

  // Note: representantesLegales is now fetched inside RepresentanteLegalSelector component
  // This query is kept for backward compatibility but may be removed in future
  const { data: representantesLegales = [] } = useQuery({
    queryKey: ['representantes_legales_select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          personas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            nombre_legal,
            activo
          )
        `)
        .eq('personas.activo', true)
        .eq('activo', true)
        .eq('id_tipo_entidad', 1) // Only Representante Legal
        .is('id_proyecto', null)
        .order('personas(nombre_legal)');
      
      if (error) throw error;
      return (data || []).map((item: any) => ({
        id: item.id,
        nombre_legal: item.personas.nombre_legal
      }));
    },
    enabled: entityType === 'legal' || entityType === 'desarrollador' || entityType === 'inmobiliaria' || entityType === 'administradora' || entityType === 'banco' || entityType === 'comprador' || (entityType === 'client' && tipoPersona === 'pm')
  });

  // Fetch inmobiliarias for agent selector
  const { data: inmobiliarias = [] } = useQuery({
    queryKey: ['inmobiliarias_select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          id_persona,
          personas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            nombre_legal,
            activo
          )
        `)
        .eq('personas.activo', true)
        .eq('activo', true)
        .eq('id_tipo_entidad', 5) // Inmobiliaria
        .is('id_proyecto', null)
        .order('personas(nombre_legal)');
      
      if (error) throw error;
      return (data || []).map((item: any) => ({
        id: item.id_persona, // Use persona id for id_persona_duena_lead FK
        entidad_id: item.id,
        nombre_legal: item.personas.nombre_legal
      }));
    },
    enabled: entityType === 'agente'
  });

  // Query for available projects (for prospects) with pagination to get ALL projects
  const { data: proyectos = [] } = useQuery({
    queryKey: ['proyectos'],
    queryFn: async () => {
      const allProyectos: any[] = [];
      const pageSize = 1000;
      let from = 0;
      let more = true;
      
      while (more) {
        const { data, error } = await supabase
          .from('proyectos')
          .select('id, nombre')
          .eq('activo', true)
          .order('nombre', { ascending: true })
          .range(from, from + pageSize - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allProyectos.push(...data);
          from += pageSize;
          more = data.length === pageSize;
        } else {
          more = false;
        }
      }
      
      return allProyectos;
    },
    enabled: entityType === 'client' && getDefaultTipoEntidad(entityType) === 7 // Only for prospects
  });

  // Check if this entity type should show STP checkbox
  const shouldShowStpCheckbox = () => {
    // Get the current tipo_entidad value (from state or initial data)
    const currentTipoEntidad = idTipoEntidad || initialData?.id_tipo_entidad;
    
    // Show for: Dueño Vendedor (4), Aportantes (15), Administradora (6)
    return currentTipoEntidad === 4 || currentTipoEntidad === 15 || currentTipoEntidad === 6;
  };

  function getDefaultTipoEntidad(type: string) {
    switch (type) {
      case 'legal': return undefined; // Will be selected by user
      case 'client': return 7; // Prospecto by default
      case 'representative': return 1; // Representante Legal
      case 'representante_legal': return 1; // Representante Legal
      case 'desarrollador': return undefined; // Will be set by the parent component
      case 'inmobiliaria': return undefined; // Will be set by the parent component
      case 'administradora': return undefined; // Will be set by the parent component
      case 'banco': return undefined; // Will be set by the parent component
      case 'comprador': return 2; // Comprador
      case 'vendedor': return 4; // Vendedor
      case 'dueno': return 17; // Dueño
      case 'residente': return 18; // Residente
      case 'agente': return 19; // Agente
      case 'administrador': return 6; // Administrador personas
      default: return undefined;
    }
  }

  function shouldShowTaxFields() {
    // Show tax fields for all entities except representatives and prospects
    const shouldShow = entityType !== 'representative' && entityType !== 'representante_legal' && !isProspectForm();
    console.log('shouldShowTaxFields for entityType:', entityType, 'tipoPersona:', tipoPersona, 'result:', shouldShow);
    return shouldShow;
  }

  function shouldShowLegalTab() {
    // Show legal tab for legal entities AND for PM clients
    return entityType === 'legal' || (entityType === 'client' && tipoPersona === 'pm');
  }

  function shouldShowBeneficiariosTab() {
    // Show beneficiarios tab only for existing clients (not new clients)
    return entityType === 'client' && initialData?.id;
  }

  function shouldShowDocumentsTab() {
    // Show documents tab for all person types except user form
    return entityType !== 'user';
  }

  // Helper function to determine if this is a prospect form
  function isProspectForm() {
    return entityType === 'client' && getDefaultTipoEntidad(entityType) === 7;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Evitar que el evento burbujee al formulario padre
    
    // Basic validation
    if (!nombre.trim() || !email.trim() || !telefono.trim()) {
      toast.error("Por favor completa todos los campos requeridos (nombre, email y teléfono).");
      return;
    }

    // RFC validation - required for comprador when restrictToBasicTab is true
    if (restrictToBasicTab && entityType === 'comprador' && !rfc.trim()) {
      toast.error("El RFC es obligatorio para compradores.");
      return;
    }

    // Strict RFC validation using centralized function
    if (rfc.trim()) {
      const rfcValidation = validateRFC(rfc);
      if (!rfcValidation.isValid) {
        toast.error(rfcValidation.error || "El RFC no tiene un formato válido.");
        return;
      }
    }

    // Validate entity type for legal entities
    if (entityType === 'legal' && !idTipoEntidad) {
      toast.error("Por favor selecciona un tipo de entidad legal.");
      return;
    }

    if (telefono.length !== 10) {
      toast.error("El teléfono debe tener exactamente 10 dígitos.");
      return;
    }

    // CURP validation (only if CURP is provided)
    const curpRegex = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9]{2}$/;
    if (curp.trim() && !curpRegex.test(curp.trim().toUpperCase())) {
      toast.error("La CURP no tiene un formato válido.");
      return;
    }

    // Validation for spouse selection (solo para personas físicas)
    if (tipoPersona === 'pf' && (idEstadoCivil === '2' || idEstadoCivil === 2)) {
      if (!idConyuge) {
        toast.error("Debes seleccionar un cónyuge cuando el estado civil es 'Casado(a) bienes mancomunados'.");
        return;
      }
    }

    // Validation for legal representative (mandatory for Inmobiliarias)
    if (entityType === 'inmobiliaria') {
      if (!idRepresentanteLegal || idRepresentanteLegal === 'none') {
        toast.error("Debes seleccionar un Representante Legal para la Inmobiliaria.");
        return;
      }
    }

    const formData: any = {
      nombre_legal: nombre.trim(),
      nombre_comercial: nombreComercial.trim() || null,
      email: email.trim(),
      telefono: telefono.trim() || null,
      clave_pais_telefono: clavePaisTelefono || 'MX',
      tipo_persona: tipoPersona,
      curp: curp.trim() || null,
      rfc: rfc.trim() || null,
      uso_cfdi: usoCfdi.trim() || null,
      regimen: regimen ? parseInt(regimen) : null,
      id_tipo_identificacion: tipoPersona === 'pf' && idTipoIdentificacion ? parseInt(idTipoIdentificacion) : null,
      sexo: sexo || null,
      fecha_nacimiento: tipoPersona === 'pf' && fechaNacimiento ? fechaNacimiento.toISOString() : null,
      id_estado_civil: tipoPersona === 'pf' && idEstadoCivil ? parseInt(idEstadoCivil) : null,
      id_conyuge: tipoPersona === 'pf' && idConyuge ? parseInt(idConyuge) : null,
      ocupacion: ocupacion.trim() || null,
      id_pais_nacimiento: idPaisNacimiento || null,
      id_estado_nacimiento: idEstadoNacimiento ? parseInt(idEstadoNacimiento) : null,
      id_municipio_nacimiento: idMunicipioNacimiento ? parseInt(idMunicipioNacimiento) : null,
      direccion_calle: direccionCalle.trim() || null,
      direccion_num_ext: direccionNumExt.trim() || null,
      direccion_num_int: direccionNumInt.trim() || null,
      direccion_colonia: direccionColonia.trim() || null,
      direccion_codigo_postal: direccionCp.trim() || null,
      direccion_id_pais: idPaisDireccion || null,
      direccion_id_estado: idEstadoDireccion ? parseInt(idEstadoDireccion) : null,
      direccion_id_municipio: idMunicipioDireccion ? parseInt(idMunicipioDireccion) : null,
      direccion_fiscal_calle: direccionFiscalCalle.trim() || null,
      direccion_fiscal_num_ext: direccionFiscalNumExt.trim() || null,
      direccion_fiscal_num_int: direccionFiscalNumInt.trim() || null,
      direccion_fiscal_colonia: direccionFiscalColonia.trim() || null,
      direccion_fiscal_codigo_postal: direccionFiscalCp.trim() || null,
      direccion_fiscal_id_pais: idPaisFiscal || null,
      direccion_fiscal_id_estado: idEstadoFiscal ? parseInt(idEstadoFiscal) : null,
      direccion_fiscal_id_municipio: idMunicipioFiscal ? parseInt(idMunicipioFiscal) : null,
      numero_escritura: numeroEscritura.trim() || null,
      numero_libro: numeroLibro.trim() || null,
      folio_mercantil: folioMercantil.trim() || null,
      fecha_escritura: fechaEscritura?.toISOString() || null,
      fecha_registro: fechaRegistro?.toISOString() || null,
      id_notario: idNotario ? parseInt(idNotario) : null,
      url_logo: urlLogo.trim() || null,
      activo: true,
    };

    // For prospects (client type with tipo_entidad 7), include project information
    if (isProspectForm()) {
      formData.id_proyecto = idProyecto !== "null" ? parseInt(idProyecto) : null;
    }

    // Store documents info if provided
    if (pendingDocuments.length > 0) {
      formData.pendingDocuments = pendingDocuments;
    }

    // Store temporary bank accounts and beneficiaries if provided
    if (tempBankAccounts.length > 0) {
      formData.tempBankAccounts = tempBankAccounts;
    }

    if (tempBeneficiaries.length > 0) {
      formData.tempBeneficiaries = tempBeneficiaries;
    }

    // Update spouse reciprocally if spouse is selected and this is an update
    if (idConyuge && initialData?.id) {
      try {
        // Update the spouse's id_conyuge and id_estado_civil
        const { error: spouseError } = await supabase
          .from('personas')
          .update({
            id_conyuge: initialData.id,
            id_estado_civil: 2, // Set to "Casado(a) bienes mancomunados"
          })
          .eq('id', parseInt(idConyuge));
        
        if (spouseError) {
          toast.error("Error al actualizar el cónyuge: " + spouseError.message);
          return;
        }
      } catch (error) {
        console.error('Error updating spouse:', error);
        toast.error("Error al actualizar el cónyuge.");
        return;
      }
    }

    // For backwards compatibility with user form
    if (entityType === 'user') {
      onSubmit({
        nombre_legal: nombre.trim(),
        email: email.trim(),
        telefono: telefono.trim() || null,
        clave_pais_telefono: clavePaisTelefono || 'MX',
        curp: curp.trim() || null,
        url_documento_identificacion: documentImageUrl || undefined,
      });
    } else if (entityType === 'comprador' && restrictToBasicTab) {
      // For buyer creation in restricted mode, save to database first
      handleCreatePerson();
    } else {
      // Add entity-specific data (only representativeId, parent components handle entityType)
      const extendedFormData = {
        ...formData,
        entityType: idTipoEntidad,
        representativeId: idRepresentanteLegal === 'none' || !idRepresentanteLegal ? null : parseInt(idRepresentanteLegal),
        commercialRepresentativeId: idRepresentanteComercial === 'none' || !idRepresentanteComercial ? null : parseInt(idRepresentanteComercial),
        inmobiliariaId: entityType === 'agente' && idInmobiliaria && idInmobiliaria !== 'none' ? parseInt(idInmobiliaria) : null,
        porcentaje_comision: entityType === 'inmobiliaria' ? parseFloat(porcentajeComision) || 2.00 : 
          entityType === 'agente' ? parseFloat(porcentajeComision) || 0 : undefined,
      };
      onSubmit(extendedFormData);
    }
  };

  const getTitle = () => {
    switch (entityType) {
      case 'legal': return 'Entidad Legal';
      case 'client': return 'Cliente';
      case 'representative': return 'Representante Legal';
      default: return 'Usuario';
    }
  };

  const isUser = entityType === 'user';

  // Check if this is one of the specific entity types that need new tab structure
  const isSpecialEntityType = ['vendedor', 'comprador', 'dueno', 'residente', 'agente', 'administrador', 'representante_legal', 'administradora', 'legal', 'inmobiliaria'].includes(entityType);
  
  // For administradora, legal and inmobiliaria entities, only show all tabs when editing (has id)
  const isCreatingLegalOrAdmin = (entityType === 'administradora' || entityType === 'legal' || entityType === 'inmobiliaria') && !initialData?.id;
  const shouldShowAllTabs = isSpecialEntityType && !isCreatingLegalOrAdmin;

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {!isUser ? (
          <Tabs defaultValue="basic" className="w-full">
            {restrictToBasicTab ? (
              <TabsList className="grid w-full mb-4 bg-muted grid-cols-1">
                <TabsTrigger value="basic" className="text-foreground">Información Básica</TabsTrigger>
              </TabsList>
            ) : shouldShowAllTabs ? (
              <TabsList className="grid w-full mb-4 bg-muted grid-cols-5">
                <TabsTrigger value="basic" className="text-foreground">Información Básica</TabsTrigger>
                <TabsTrigger value="address" className="text-foreground">Dirección</TabsTrigger>
                <TabsTrigger value="fiscal" className="text-foreground">Información Fiscal</TabsTrigger>
                <TabsTrigger value="documents" className="text-foreground">Documentos</TabsTrigger>
                <TabsTrigger value="bank-accounts" className="text-foreground">Cuentas Bancarias</TabsTrigger>
              </TabsList>
            ) : (
              <TabsList className="grid w-full mb-4 bg-muted grid-cols-1">
                <TabsTrigger value="basic" className="text-foreground">Información Básica</TabsTrigger>
              </TabsList>
            )}

            <TabsContent value="basic" className="space-y-4 mt-6">
              {shouldShowAllTabs ? (
                // New structured form for specific entity types
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="tipoPersona">Tipo de Persona *</Label>
                    {entityType === 'representante_legal' || entityType === 'agente' ? (
                      <Input
                        id="tipoPersona"
                        type="text"
                        value="Persona Física"
                        disabled
                        className="bg-muted"
                      />
                    ) : (entityType === 'legal' || entityType === 'desarrollador' || entityType === 'inmobiliaria' || entityType === 'administradora') ? (
                      <Input
                        id="tipoPersona"
                        type="text"
                        value="Persona Moral"
                        disabled
                        className="bg-muted"
                      />
                    ) : (
                      <Select value={tipoPersona} onValueChange={setTipoPersona}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona tipo de persona" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pf">Persona Física</SelectItem>
                          <SelectItem value="pm">Persona Moral</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="nombre">
                      {tipoPersona === 'pm' ? 'Razón Social *' : 'Nombre Completo *'}
                    </Label>
                    <Input
                      id="nombre"
                      type="text"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder={tipoPersona === 'pm' ? "Ingresa la razón social" : "Ingresa el nombre completo"}
                    />
                  </div>

                  {tipoPersona === 'pm' && (
                    <div>
                      <Label htmlFor="nombreComercial">Nombre Comercial</Label>
                      <Input
                        id="nombreComercial"
                        type="text"
                        value={nombreComercial}
                        onChange={(e) => setNombreComercial(e.target.value)}
                        placeholder="Ingresa el nombre comercial"
                      />
                    </div>
                  )}

                  {!hideEmailField && (
                    <div>
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Ingresa el email"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Label htmlFor="telefono">Teléfono *</Label>
                    <div className="flex gap-2 flex-1">
                      <Select value={clavePaisTelefono} onValueChange={setClavePaisTelefono}>
                        <SelectTrigger className={cn("w-20", !clavePaisTelefono && "text-muted-foreground")}>
                          <SelectValue placeholder="--" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MX">MX</SelectItem>
                          <SelectItem value="US">US</SelectItem>
                          <SelectItem value="CA">CA</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        id="telefono"
                        type="tel"
                        value={telefono}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '');
                          if (value.length <= 10) {
                            setTelefono(value);
                          }
                        }}
                        placeholder="Ingresa el teléfono (10 dígitos obligatorios)"
                        className="flex-1"
                        maxLength={10}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="rfc">RFC</Label>
                    <Input
                      id="rfc"
                      type="text"
                      value={rfc}
                      onChange={(e) => handleRfcChange(e.target.value)}
                      placeholder="Ingresa el RFC (Ej: ABC123456DEF)"
                      required={restrictToBasicTab && entityType === 'comprador'}
                      maxLength={13}
                      className={rfcError ? "border-destructive" : ""}
                    />
                    {rfcError && (
                      <p className="text-sm text-destructive mt-1">{rfcError}</p>
                    )}
                  </div>

                  {tipoPersona === 'pf' && (
                    <div>
                      <Label htmlFor="curp">CURP</Label>
                      <Input
                        id="curp"
                        type="text"
                        value={curp}
                        onChange={(e) => setCurp(e.target.value.toUpperCase())}
                        placeholder="Ingresa la CURP (Ej: ABCD123456HMNEFD01)"
                        maxLength={18}
                      />
                    </div>
                  )}

                  {/* Tipo de Entidad Legal - solo para entidades legales */}
                  {(entityType === 'legal' || entityType === 'desarrollador' || entityType === 'inmobiliaria') && (
                    <div>
                      <Label htmlFor="idTipoEntidad">
                        Tipo de Entidad Legal *
                      </Label>
                      <Select 
                        value={idTipoEntidad?.toString() || ''} 
                        onValueChange={(value) => setIdTipoEntidad(parseInt(value))}
                        disabled={fixedEntityType}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona el tipo de entidad legal" />
                        </SelectTrigger>
                        <SelectContent>
                          {tiposEntidad.map((tipo) => (
                            <SelectItem key={tipo.id} value={tipo.id.toString()}>
                              {tipo.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Representante Legal - para entidades legales, administradoras, compradores y PM clients */}
                  {(entityType === 'legal' || entityType === 'desarrollador' || entityType === 'inmobiliaria' || entityType === 'administradora' || entityType === 'comprador' || (entityType === 'client' && tipoPersona === 'pm')) && (
                    <div>
                      <Label htmlFor="idRepresentanteLegal">
                        Representante Legal {entityType === 'inmobiliaria' && '*'}
                      </Label>
                      <RepresentanteLegalSelector
                        value={idRepresentanteLegal?.toString() || ''}
                        onValueChange={setIdRepresentanteLegal}
                      />
                    </div>
                  )}

                  {/* Porcentaje de Comisión - solo para inmobiliarias, ocultable */}
                  {entityType === 'inmobiliaria' && !hideComision && (
                    <div>
                      <Label htmlFor="porcentajeComision">Porcentaje de Comisión (%)</Label>
                      <Input
                        id="porcentajeComision"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={porcentajeComision}
                        onChange={(e) => setPorcentajeComision(e.target.value)}
                        placeholder="2.00"
                      />
                    </div>
                  )}

                  {/* Representante Comercial - para inmobiliarias, entidades legales y desarrolladores */}
                  {(entityType === 'inmobiliaria' || entityType === 'legal' || entityType === 'desarrollador') && (
                    <div>
                      <Label htmlFor="idRepresentanteComercial">
                        Representante Comercial
                      </Label>
                      <RepresentanteComercialSelector
                        value={idRepresentanteComercial?.toString() || ''}
                        onValueChange={setIdRepresentanteComercial}
                      />
                    </div>
                  )}

                  {/* Inmobiliaria - para agentes */}
                  {entityType === 'agente' && (
                    <div>
                      <Label htmlFor="idInmobiliaria">Inmobiliaria</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between font-normal"
                          >
                            {idInmobiliaria && idInmobiliaria !== 'none'
                              ? inmobiliarias.find((inmob) => inmob.id.toString() === idInmobiliaria)?.nombre_legal
                              : idInmobiliaria === 'none' ? "Sin inmobiliaria" : "Selecciona una inmobiliaria"}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0 bg-popover" align="start">
                          <Command>
                            <CommandInput placeholder="Buscar inmobiliaria..." />
                            <CommandList>
                              <CommandEmpty>No se encontró ninguna inmobiliaria.</CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  value="none"
                                  onSelect={() => setIdInmobiliaria('none')}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      idInmobiliaria === 'none' ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  Sin inmobiliaria
                                </CommandItem>
                                {inmobiliarias.map((inmob) => (
                                  <CommandItem
                                    key={inmob.id}
                                    value={inmob.nombre_legal}
                                    onSelect={() => setIdInmobiliaria(inmob.id.toString())}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        idInmobiliaria === inmob.id.toString() ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {inmob.nombre_legal}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}

                  {/* Porcentaje de comisión - para agentes internos */}
                  {entityType === 'agente' && (
                    <div>
                      <Label htmlFor="porcentajeComisionAgente">Porcentaje de Comisión (%)</Label>
                      <Input
                        id="porcentajeComisionAgente"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={porcentajeComision}
                        onChange={(e) => setPorcentajeComision(e.target.value)}
                        placeholder="2.00"
                      />
                    </div>
                  )}


                </div>
              ) : (
                // Original form structure for other entity types
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                <div>
                  <Label htmlFor="tipoPersona">Tipo de Persona *</Label>
                  {(entityType === 'legal' || entityType === 'desarrollador' || entityType === 'inmobiliaria' || entityType === 'administradora') ? (
                    <Input
                      id="tipoPersona"
                      type="text"
                      value="Persona Moral"
                      disabled
                      className="bg-muted"
                    />
                  ) : entityType === 'representative' || entityType === 'representante_legal' || entityType === 'agente' ? (
                    <Input
                      id="tipoPersona"
                      type="text"
                      value="Persona Física"
                      disabled
                      className="bg-muted"
                    />
                  ) : (
                    <Select value={tipoPersona} onValueChange={setTipoPersona}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona tipo de persona" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pf">Persona Física</SelectItem>
                        <SelectItem value="pm">Persona Moral</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div>
                  <Label htmlFor="nombre">
                    {tipoPersona === 'pm' ? 'Razón Social *' : 'Nombre Completo *'}
                  </Label>
                  <Input
                    id="nombre"
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder={tipoPersona === 'pm' ? "Ingresa la razón social" : "Ingresa el nombre completo"}
                  />
                </div>

                {tipoPersona === 'pm' && (
                  <div>
                    <Label htmlFor="nombreComercial">Nombre Comercial</Label>
                    <Input
                      id="nombreComercial"
                      type="text"
                      value={nombreComercial}
                      onChange={(e) => setNombreComercial(e.target.value)}
                      placeholder="Ingresa el nombre comercial"
                    />
                  </div>
                )}

                {!hideEmailField && (
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Ingresa el email"
                    />
                  </div>
                )}

                {(entityType === 'desarrollador' || entityType === 'inmobiliaria') && (
                  <div className="col-span-1 md:col-span-2">
                    <ImageUploadField
                      label="Logo de la empresa"
                      value={urlLogo}
                      onChange={setUrlLogo}
                      accept="image/*"
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="telefono">Teléfono *</Label>
                  <div className="flex gap-2">
                    <Select value={clavePaisTelefono} onValueChange={setClavePaisTelefono}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {paises.map((pais) => (
                          <SelectItem key={pais.id} value={pais.id}>
                            {pais.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      id="telefono"
                      type="tel"
                      value={telefono}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setTelefono(value);
                      }}
                      placeholder="Ingresa el teléfono (10 dígitos obligatorios)"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="rfc">RFC</Label>
                  <Input
                    id="rfc"
                    type="text"
                    value={rfc}
                    onChange={(e) => handleRfcChange(e.target.value)}
                    placeholder="Ingresa el RFC (Ej: ABC123456DEF)"
                    required={restrictToBasicTab && entityType === 'comprador'}
                    maxLength={13}
                    className={rfcError ? "border-destructive" : ""}
                  />
                  {rfcError && (
                    <p className="text-sm text-destructive mt-1">{rfcError}</p>
                  )}
                </div>

                {tipoPersona === 'pf' && (
                  <div>
                    <Label htmlFor="curp">CURP</Label>
                    <Input
                      id="curp"
                      type="text"
                      value={curp}
                      onChange={(e) => setCurp(e.target.value.toUpperCase())}
                      placeholder="Ingresa la CURP (Ej: ABCD123456HMNEFD01)"
                      maxLength={18}
                    />
                  </div>
                )}

                {(entityType === 'legal' || entityType === 'desarrollador' || entityType === 'inmobiliaria') && (
                  <div>
                    <Label htmlFor="idTipoEntidad">
                      Tipo de Entidad Legal *
                    </Label>
                    <Select 
                      value={idTipoEntidad?.toString() || ''} 
                      onValueChange={(value) => setIdTipoEntidad(parseInt(value))}
                      disabled={fixedEntityType}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el tipo de entidad legal" />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposEntidad.map((tipo) => (
                          <SelectItem key={tipo.id} value={tipo.id.toString()}>
                            {tipo.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(entityType === 'legal' || entityType === 'desarrollador' || entityType === 'inmobiliaria' || entityType === 'administradora' || entityType === 'comprador' || (entityType === 'client' && tipoPersona === 'pm')) && (
                  <div>
                    <Label htmlFor="idRepresentanteLegal">
                      Representante Legal {entityType === 'inmobiliaria' && '*'}
                    </Label>
                    <RepresentanteLegalSelector
                      value={idRepresentanteLegal?.toString() || ''}
                      onValueChange={setIdRepresentanteLegal}
                    />
                  </div>
                )}

                {(entityType === 'inmobiliaria' || entityType === 'legal' || entityType === 'desarrollador') && (
                  <div>
                    <Label htmlFor="idRepresentanteComercial">
                      Representante Comercial
                    </Label>
                    <RepresentanteComercialSelector
                      value={idRepresentanteComercial?.toString() || ''}
                      onValueChange={setIdRepresentanteComercial}
                    />
                  </div>
                )}


                </div>
              )}
            </TabsContent>

            {/* New tabs only for special entity types */}
            {shouldShowAllTabs && (
              <>
                {/* Address Tab */}
                {!restrictToBasicTab && (
                  <TabsContent value="address" className="space-y-4 mt-6">
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium">Dirección</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="calle">Calle</Label>
                        <Input
                          id="calle"
                          type="text"
                          value={direccionCalle}
                          onChange={(e) => setDireccionCalle(e.target.value)}
                          placeholder="Ingresa la calle"
                        />
                      </div>

                      <div>
                        <Label htmlFor="numeroExterno">Número Exterior</Label>
                        <Input
                          id="numeroExterno"
                          type="text"
                          value={direccionNumExt}
                          onChange={(e) => setDireccionNumExt(e.target.value)}
                          placeholder="Número exterior"
                        />
                      </div>

                      <div>
                        <Label htmlFor="numeroInterno">Número Interior</Label>
                        <Input
                          id="numeroInterno"
                          type="text"
                          value={direccionNumInt}
                          onChange={(e) => setDireccionNumInt(e.target.value)}
                          placeholder="Número interior (opcional)"
                        />
                      </div>

                      <div>
                        <Label htmlFor="codigoPostal">Código Postal</Label>
                        <Input
                          id="codigoPostal"
                          type="text"
                          value={direccionCp}
                          onChange={(e) => setDireccionCp(e.target.value)}
                          placeholder="Ingresa el código postal"
                        />
                      </div>

                      <div>
                        <Label htmlFor="pais">País</Label>
                        <Select value={idPaisDireccion} onValueChange={setIdPaisDireccion}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un país" />
                          </SelectTrigger>
                          <SelectContent>
                            {paises.map((pais) => (
                              <SelectItem key={pais.id} value={pais.id}>
                                {pais.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="estado">Estado</Label>
                        <Select 
                          value={idEstadoDireccion} 
                          onValueChange={setIdEstadoDireccion}
                          disabled={!idPaisDireccion}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={!idPaisDireccion ? "Primero selecciona un país" : "Selecciona un estado"} />
                          </SelectTrigger>
                          <SelectContent>
                            {estados
                              .filter(e => !idPaisDireccion || e.id_pais === idPaisDireccion)
                              .map((estado) => (
                                <SelectItem key={estado.id} value={estado.id.toString()}>
                                  {estado.nombre}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="municipio">Municipio</Label>
                        <Select 
                          value={idMunicipioDireccion} 
                          onValueChange={setIdMunicipioDireccion}
                          disabled={!idEstadoDireccion}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={!idEstadoDireccion ? "Primero selecciona un estado" : "Selecciona un municipio"} />
                          </SelectTrigger>
                          <SelectContent>
                            {municipios
                              .filter(m => m.id_estado === parseInt(idEstadoDireccion))
                              .map((municipio) => (
                                <SelectItem key={municipio.id} value={municipio.id.toString()}>
                                  {municipio.nombre}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="colonia">Colonia/Barrio</Label>
                        <Input
                          id="colonia"
                          type="text"
                          value={direccionColonia}
                          onChange={(e) => setDireccionColonia(e.target.value)}
                          placeholder="Ingresa la colonia o barrio"
                        />
                      </div>
                     </div>
                   </div>
                  </TabsContent>
                )}

                 {/* Fiscal Information Tab */}
                {!restrictToBasicTab && (
                  <TabsContent value="fiscal" className="space-y-4 mt-6">
                  <div className="space-y-6">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-medium">Información Fiscal</h3>
                      <Badge variant={isFiscalDataComplete({
                        rfc,
                        regimen,
                        uso_cfdi: usoCfdi,
                        direccion_fiscal_calle: direccionFiscalCalle,
                        direccion_fiscal_num_ext: direccionFiscalNumExt,
                        direccion_fiscal_num_int: direccionFiscalNumInt,
                        direccion_fiscal_colonia: direccionFiscalColonia,
                        direccion_fiscal_codigo_postal: direccionFiscalCp,
                        direccion_fiscal_id_pais: idPaisFiscal,
                        direccion_fiscal_id_estado: idEstadoFiscal ? parseInt(idEstadoFiscal) : null,
                        direccion_fiscal_id_municipio: idMunicipioFiscal ? parseInt(idMunicipioFiscal) : null,
                      }) ? "default" : "destructive"}>
                        {isFiscalDataComplete({
                          rfc,
                          regimen,
                          uso_cfdi: usoCfdi,
                          direccion_fiscal_calle: direccionFiscalCalle,
                          direccion_fiscal_num_ext: direccionFiscalNumExt,
                          direccion_fiscal_num_int: direccionFiscalNumInt,
                          direccion_fiscal_colonia: direccionFiscalColonia,
                          direccion_fiscal_codigo_postal: direccionFiscalCp,
                          direccion_fiscal_id_pais: idPaisFiscal,
                          direccion_fiscal_id_estado: idEstadoFiscal ? parseInt(idEstadoFiscal) : null,
                          direccion_fiscal_id_municipio: idMunicipioFiscal ? parseInt(idMunicipioFiscal) : null,
                        }) ? "Completa" : "Incompleta"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="nacionalidad">Nacionalidad</Label>
                        <Select value={idPaisNacimiento} onValueChange={setIdPaisNacimiento}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona nacionalidad" />
                          </SelectTrigger>
                          <SelectContent>
                            {paises.map((pais) => (
                              <SelectItem key={pais.id} value={pais.id}>
                                {pais.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {tipoPersona === 'pf' && (
                        <div>
                          <Label htmlFor="sexo">Sexo</Label>
                          <Select value={sexo} onValueChange={setSexo}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona sexo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="M">Masculino</SelectItem>
                              <SelectItem value="F">Femenino</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                       <div>
                         <Label htmlFor="regimen">Régimen</Label>
                         <Select value={regimen} onValueChange={setRegimen}>
                           <SelectTrigger>
                             <SelectValue placeholder="Ingresa el régimen fiscal" />
                           </SelectTrigger>
                           <SelectContent>
                             {regimenes.map((regimen_item) => (
                               <SelectItem key={regimen_item.id} value={regimen_item.id.toString()}>
                                 {regimen_item.nombre}
                               </SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       </div>

                       <div>
                         <Label htmlFor="usoCfdi">Uso del CFDI</Label>
                         <Select value={usoCfdi} onValueChange={setUsoCfdi}>
                           <SelectTrigger>
                             <SelectValue placeholder="Ingresa el uso del CFDI" />
                           </SelectTrigger>
                           <SelectContent>
                             {usosCfdi.map((uso) => (
                               <SelectItem key={uso.codigo} value={uso.codigo}>
                                 {uso.codigo} - {uso.nombre}
                               </SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       </div>

                      {/* Estado Civil - solo para personas físicas */}
                      {tipoPersona === 'pf' && (
                        <>
                          <div>
                            <Label htmlFor="estadoCivil">Estado Civil</Label>
                            <Select 
                              value={idEstadoCivil} 
                              onValueChange={(value) => {
                                setIdEstadoCivil(value);
                                // Si no es casado por bienes mancomunados, limpiar cónyuge
                                if (value !== '2') {
                                  setIdConyuge('');
                                  setSearchConyuge('');
                                }
                              }}
                              disabled={!!initialData?.id_conyuge}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona estado civil" />
                              </SelectTrigger>
                              <SelectContent>
                                {estadosCivil.map((estado) => (
                                  <SelectItem key={estado.id} value={estado.id.toString()}>
                                    {estado.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {initialData?.id_conyuge && (
                              <p className="text-sm font-medium text-amber-600 mt-1">
                                ⚠️ El estado civil no puede modificarse cuando ya hay un cónyuge asignado.
                              </p>
                            )}
                          </div>

                          {/* Selector de cónyuge - solo visible cuando estado civil es "Casado(a) bienes mancomunados" */}
                          {(idEstadoCivil === '2' || idEstadoCivil === 2) && (
                            <div className="col-span-1 md:col-span-2">
                              <Label htmlFor="conyuge">Cónyuge *</Label>
                              {initialData?.id_conyuge && conyugeData ? (
                                <div className="space-y-2">
                                  <div className="p-3 border rounded-md bg-muted/50">
                                    <p className="font-medium">{conyugeData.nombre_legal}</p>
                                    <div className="text-sm text-muted-foreground space-y-1 mt-1">
                                      {conyugeData.rfc && <p>RFC: {conyugeData.rfc}</p>}
                                      {conyugeData.curp && <p>CURP: {conyugeData.curp}</p>}
                                      {conyugeData.email && <p>Email: {conyugeData.email}</p>}
                                    </div>
                                  </div>
                                  <p className="text-sm font-medium text-amber-600">
                                    ⚠️ El cónyuge ya está asignado y no puede ser modificado.
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <Input
                                    placeholder="Buscar cónyuge por nombre, RFC o CURP..."
                                    value={searchConyuge}
                                    onChange={(e) => setSearchConyuge(e.target.value)}
                                  />
                                  <Select value={idConyuge} onValueChange={setIdConyuge}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Selecciona el cónyuge" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {personasDisponibles
                                        .filter(persona => 
                                          !searchConyuge || 
                                          persona.nombre_legal.toLowerCase().includes(searchConyuge.toLowerCase()) ||
                                          (persona.rfc && persona.rfc.toLowerCase().includes(searchConyuge.toLowerCase())) ||
                                          (persona.curp && persona.curp.toLowerCase().includes(searchConyuge.toLowerCase()))
                                        )
                                        .map((persona) => (
                                          <SelectItem key={persona.id} value={persona.id.toString()}>
                                            {persona.nombre_legal} {persona.rfc ? `(RFC: ${persona.rfc})` : persona.curp ? `(CURP: ${persona.curp})` : ''}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                  <p className="text-sm text-muted-foreground">
                                    Al seleccionar un cónyuge, automáticamente se actualizará su estado civil a "Casado(a) bienes mancomunados" y se establecerá la relación recíproca.
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* Tipo de identificación - solo para personas físicas */}
                      {tipoPersona === 'pf' && (
                        <>
                          <div>
                            <Label htmlFor="tipoIdentificacion">Tipo de identificación</Label>
                            <Select value={idTipoIdentificacion} onValueChange={setIdTipoIdentificacion}>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona tipo de identificación" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">INE</SelectItem>
                                <SelectItem value="2">Pasaporte</SelectItem>
                                <SelectItem value="3">Licencia de Conducir</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="col-span-1 md:col-span-2">
                            <ImageUploadField
                              label="Documento de identificación"
                              value={documentImageUrl}
                              onChange={setDocumentImageUrl}
                              accept="image/*,.pdf"
                            />
                          </div>

                          <div>
                            <Label>Fecha de Nacimiento</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full justify-start text-left font-normal"
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {fechaNacimiento ? format(fechaNacimiento, "dd/MM/yyyy") : "Selecciona fecha"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={fechaNacimiento}
                                  onSelect={setFechaNacimiento}
                                  initialFocus
                                  className="pointer-events-auto"
                                />
                              </PopoverContent>
                            </Popover>
                          </div>

                          <div>
                            <Label htmlFor="estadoNacimiento">Estado de Nacimiento</Label>
                            <Select 
                              value={idEstadoNacimiento} 
                              onValueChange={setIdEstadoNacimiento}
                              disabled={!idPaisNacimiento}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={!idPaisNacimiento ? "Primero selecciona un país" : "Selecciona estado"} />
                              </SelectTrigger>
                              <SelectContent>
                                {estados
                                  .filter(e => !idPaisNacimiento || e.id_pais === idPaisNacimiento)
                                  .map((estado) => (
                                    <SelectItem key={estado.id} value={estado.id.toString()}>
                                      {estado.nombre}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label htmlFor="municipioNacimiento">Ciudad de Nacimiento</Label>
                            <Select 
                              value={idMunicipioNacimiento} 
                              onValueChange={setIdMunicipioNacimiento}
                              disabled={!idEstadoNacimiento}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={!idEstadoNacimiento ? "Primero selecciona un estado" : "Selecciona ciudad"} />
                              </SelectTrigger>
                              <SelectContent>
                                {municipios
                                  .filter(m => m.id_estado === parseInt(idEstadoNacimiento))
                                  .map((municipio) => (
                                    <SelectItem key={municipio.id} value={municipio.id.toString()}>
                                      {municipio.nombre}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Fiscal Address Section */}
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="copiarDireccion"
                          checked={copiarDireccionFiscal}
                          onChange={(e) => setCopiarDireccionFiscal(e.target.checked)}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="copiarDireccion">Copiar dirección física a dirección fiscal</Label>
                      </div>

                      <h4 className="text-md font-medium">Dirección Fiscal</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="calleFiscal">Calle</Label>
                          <Input
                            id="calleFiscal"
                            type="text"
                            value={direccionFiscalCalle}
                            onChange={(e) => setDireccionFiscalCalle(e.target.value)}
                            placeholder="Ingresa la calle fiscal"
                            disabled={copiarDireccionFiscal}
                          />
                        </div>

                        <div>
                          <Label htmlFor="numExtFiscal">Número Exterior</Label>
                          <Input
                            id="numExtFiscal"
                            type="text"
                            value={direccionFiscalNumExt}
                            onChange={(e) => setDireccionFiscalNumExt(e.target.value)}
                            placeholder="Ingresa el número exterior fiscal"
                            disabled={copiarDireccionFiscal}
                          />
                        </div>

                        <div>
                          <Label htmlFor="numIntFiscal">Número Interior</Label>
                          <Input
                            id="numIntFiscal"
                            type="text"
                            value={direccionFiscalNumInt}
                            onChange={(e) => setDireccionFiscalNumInt(e.target.value)}
                            placeholder="Ingresa el número interior fiscal (opcional)"
                            disabled={copiarDireccionFiscal}
                          />
                        </div>

                        <div>
                          <Label htmlFor="codigoPostalFiscal">Código Postal</Label>
                          <Input
                            id="codigoPostalFiscal"
                            type="text"
                            value={direccionFiscalCp}
                            onChange={(e) => setDireccionFiscalCp(e.target.value)}
                            placeholder="Ingresa el código postal fiscal"
                            disabled={copiarDireccionFiscal}
                          />
                        </div>

                        <div>
                          <Label htmlFor="paisFiscal">País</Label>
                          <Select value={idPaisFiscal} onValueChange={setIdPaisFiscal} disabled={copiarDireccionFiscal}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un país" />
                            </SelectTrigger>
                            <SelectContent>
                              {paises.map((pais) => (
                                <SelectItem key={pais.id} value={pais.id}>
                                  {pais.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                          <div>
                            <Label htmlFor="estadoFiscal">Estado</Label>
                            <Select 
                              value={idEstadoFiscal} 
                              onValueChange={setIdEstadoFiscal} 
                              disabled={copiarDireccionFiscal || !idPaisFiscal}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={!idPaisFiscal ? "Primero selecciona un país" : "Selecciona un estado"} />
                              </SelectTrigger>
                              <SelectContent>
                                {estados
                                  .filter(e => !idPaisFiscal || e.id_pais === idPaisFiscal)
                                  .map((estado) => (
                                    <SelectItem key={estado.id} value={estado.id.toString()}>
                                      {estado.nombre}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label htmlFor="municipioFiscal">Municipio</Label>
                            <Select 
                              value={idMunicipioFiscal} 
                              onValueChange={setIdMunicipioFiscal} 
                              disabled={copiarDireccionFiscal || !idEstadoFiscal}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={!idEstadoFiscal ? "Primero selecciona un estado" : "Selecciona un municipio"} />
                              </SelectTrigger>
                              <SelectContent>
                                {municipios
                                  .filter(m => m.id_estado === parseInt(idEstadoFiscal))
                                  .map((municipio) => (
                                    <SelectItem key={municipio.id} value={municipio.id.toString()}>
                                      {municipio.nombre}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>

                        <div>
                          <Label htmlFor="coloniaFiscal">Colonia/Barrio</Label>
                          <Input
                            id="coloniaFiscal"
                            type="text"
                            value={direccionFiscalColonia}
                            onChange={(e) => setDireccionFiscalColonia(e.target.value)}
                            placeholder="Ingresa la colonia o barrio fiscal"
                            disabled={copiarDireccionFiscal}
                          />
                        </div>
                      </div>
                    </div>
                   </div>
                 </TabsContent>
                )}

                 {/* Documents Tab */}
                 {!restrictToBasicTab && shouldShowDocumentsTab() && (
                   <TabsContent value="documents" className="space-y-4 mt-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Documentos</h3>
                <DocumentsTab 
                  entityId={initialData?.id || undefined} 
                  entityType="persona"
                  tipoPersona={tipoPersona}
                  pendingDocuments={pendingDocuments}
                  onPendingDocumentsChange={setPendingDocuments}
                  onDocumentAdded={() => {
                    toast.success("El documento se ha agregado correctamente.");
                  }}
                  hideStatusChange={documentsReadOnly}
                />
                   </div>
                 </TabsContent>
                 )}

                 {/* Bank Accounts Tab */}
                 {!restrictToBasicTab && (
                   <TabsContent value="bank-accounts" className="space-y-4 mt-6">
                  <div className="space-y-4">
                    {initialData?.id ? (
                      <BankAccountsSection 
                        personId={initialData.id}
                        showStpCheckbox={shouldShowStpCheckbox()}
                        onEditingStateChange={setIsBankAccountsEditing}
                      />
                    ) : (
                      <TempBankAccountsSection
                        bankAccounts={tempBankAccounts}
                        onBankAccountsChange={setTempBankAccounts}
                        showStpCheckbox={shouldShowStpCheckbox()}
                        entityTypeId={getDefaultTipoEntidad(entityType || '')}
                      />
                    )}
                   </div>
                 </TabsContent>
                 )}
               </>
             )}
           </Tabs>
        ) : (
          // User form (simplified)
          <div className="space-y-4">
            <div>
              <Label htmlFor="nombre">Nombre Completo</Label>
              <Input
                id="nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ingresa el nombre completo"
              />
            </div>

            {!hideEmailField && (
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ingresa el email"
                />
              </div>
            )}

            <div>
              <Label htmlFor="telefono">Teléfono</Label>
              <div className="flex gap-2">
                <Select value={clavePaisTelefono} onValueChange={setClavePaisTelefono}>
                  <SelectTrigger className="w-24">
                    <SelectValue placeholder="País" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MX">+52 MX</SelectItem>
                    <SelectItem value="US">+1 US</SelectItem>
                    <SelectItem value="CA">+1 CA</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  id="telefono"
                  type="tel"
                  value={telefono}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 10) {
                      setTelefono(value);
                    }
                  }}
                  placeholder="10 dígitos"
                  className="flex-1"
                  maxLength={10}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="curp">CURP</Label>
              <Input
                id="curp"
                type="text"
                value={curp}
                onChange={(e) => setCurp(e.target.value.toUpperCase())}
                placeholder="Ingresa la CURP"
                maxLength={18}
              />
            </div>
          </div>
        )}

        {!isBankAccountsEditing && (
          <div className="flex gap-4 pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
