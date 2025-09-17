import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, CalendarIcon, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BeneficiariosForm } from "./BeneficiariosForm";
import { ImageUploadField } from "./ImageUploadField";
import { DocumentsTab } from "./DocumentsTab";
import { GoogleMapComponent } from "./GoogleMapComponent";

interface PersonFormProps {
  onSubmit: (data: any) => void;
  initialData?: any;
  isLoading?: boolean;
  onCancel: () => void;
  entityType?: 'legal' | 'client' | 'representative' | 'user' | 'desarrollador' | 'inmobiliaria' | 'administradora' | 'banco' | 'buyer' | 'seller' | 'owner' | 'resident' | 'agent' | 'administrator' | 'vendedor' | 'comprador' | 'dueno' | 'residente' | 'agente' | 'administrador' | 'representante_legal';
  fixedEntityType?: boolean;
}

export function PersonForm({ onSubmit, initialData, isLoading, onCancel, entityType = 'user', fixedEntityType = false }: PersonFormProps) {
  // Basic info
  const [nombre, setNombre] = useState(initialData?.nombre || initialData?.nombre_legal || '');
  const [nombreComercial, setNombreComercial] = useState(initialData?.nombre_comercial || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [telefono, setTelefono] = useState(initialData?.telefono || '');
  const [clavePaisTelefono, setClavePaisTelefono] = useState(initialData?.clave_pais_telefono || 'MX');
  const [tipoPersona, setTipoPersona] = useState(
    initialData?.tipo_persona || 
    (entityType === 'legal' || entityType === 'desarrollador' || entityType === 'inmobiliaria' || entityType === 'administradora' || entityType === 'banco' ? 'pm' : 
     entityType === 'representative' ? 'pf' : 
     'pf')
  );
  const [idTipoEntidad, setIdTipoEntidad] = useState(initialData?.id_tipo_entidad || getDefaultTipoEntidad(entityType));
  const [idRepresentanteLegal, setIdRepresentanteLegal] = useState(initialData?.id_entidad_relacionada_rep_leg || '');
  
  // Project selection for prospects (clients with tipo_entidad = 7)
  const [idProyecto, setIdProyecto] = useState(
    initialData?.id_proyecto ? initialData.id_proyecto.toString() : "null"
  );
  
  // Identification
  const [curp, setCurp] = useState(initialData?.curp || '');
  const [rfc, setRfc] = useState(initialData?.rfc || '');
  const [usoCfdi, setUsoCfdi] = useState(initialData?.uso_cfdi || '');
  const [regimen, setRegimen] = useState(initialData?.regimen || '');
  const [idTipoIdentificacion, setIdTipoIdentificacion] = useState(initialData?.id_tipo_identificacion || '');
  
  // Personal info
  const [sexo, setSexo] = useState(initialData?.sexo || '');
  const [fechaNacimiento, setFechaNacimiento] = useState(initialData?.fecha_nacimiento ? new Date(initialData.fecha_nacimiento) : undefined);
  const [idEstadoCivil, setIdEstadoCivil] = useState(initialData?.id_estado_civil || '');
  const [ocupacion, setOcupacion] = useState(initialData?.ocupacion || '');
  
  // Birth place
  const [idPaisNacimiento, setIdPaisNacimiento] = useState(initialData?.id_pais_nacimiento || '');
  const [idEstadoNacimiento, setIdEstadoNacimiento] = useState(initialData?.id_estado_nacimiento || '');
  const [idMunicipioNacimiento, setIdMunicipioNacimiento] = useState(initialData?.id_municipio_nacimiento || '');
  
  // Address
  const [direccionCalle, setDireccionCalle] = useState(initialData?.direccion_calle_numero || '');
  const [direccionColonia, setDireccionColonia] = useState(initialData?.direccion_colonia || '');
  const [direccionCp, setDireccionCp] = useState(initialData?.direccion_codigo_postal || '');
  const [idPaisDireccion, setIdPaisDireccion] = useState(initialData?.direccion_id_pais || '');
  const [idEstadoDireccion, setIdEstadoDireccion] = useState(initialData?.direccion_id_estado || '');
  const [idMunicipioDireccion, setIdMunicipioDireccion] = useState(initialData?.direccion_id_municipio || '');
  
  // Fiscal address
  const [direccionFiscalCalle, setDireccionFiscalCalle] = useState(initialData?.direccion_fiscal_calle_numero || '');
  const [direccionFiscalColonia, setDireccionFiscalColonia] = useState(initialData?.direccion_fiscal_colonia || '');
  const [direccionFiscalCp, setDireccionFiscalCp] = useState(initialData?.direccion_fiscal_codigo_postal || '');
  const [idPaisFiscal, setIdPaisFiscal] = useState(initialData?.direccion_fiscal_id_pais || '');
  const [idEstadoFiscal, setIdEstadoFiscal] = useState(initialData?.direccion_fiscal_id_estado || '');
  const [idMunicipioFiscal, setIdMunicipioFiscal] = useState(initialData?.direccion_fiscal_id_municipio || '');
  
  // Copy address checkbox
  const [copiarDireccionFiscal, setCopiarDireccionFiscal] = useState(false);
  
  // Google Maps coordinates and address
  const [coordenadas, setCoordenadas] = useState<{lat: number, lng: number} | null>(
    initialData?.coordenadas ? initialData.coordenadas : null
  );
  const [direccionMapa, setDireccionMapa] = useState(initialData?.direccion_mapa || '');

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
  
  const { toast } = useToast();

  // Copy address functionality
  useEffect(() => {
    if (copiarDireccionFiscal) {
      setDireccionFiscalCalle(direccionCalle);
      setDireccionFiscalColonia(direccionColonia);
      setDireccionFiscalCp(direccionCp);
      setIdPaisFiscal(idPaisDireccion);
      setIdEstadoFiscal(idEstadoDireccion);
      setIdMunicipioFiscal(idMunicipioDireccion);
    }
  }, [copiarDireccionFiscal, direccionCalle, direccionColonia, direccionCp, idPaisDireccion, idEstadoDireccion, idMunicipioDireccion]);

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
        .select('id, nombre')
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
        // Exclude Desarrollador and Inmobiliaria from legal entities form
        query = query.not('nombre', 'in', '(Desarrollador,Inmobiliaria)');
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
    enabled: entityType === 'legal' || entityType === 'desarrollador' || entityType === 'inmobiliaria' || entityType === 'administradora' || entityType === 'banco' || (entityType === 'client' && tipoPersona === 'pm')
  });

  // Query for available projects (for prospects)
  const { data: proyectos = [] } = useQuery({
    queryKey: ['proyectos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proyectos')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return data || [];
    },
    enabled: entityType === 'client' && getDefaultTipoEntidad(entityType) === 7 // Only for prospects
  });

  function getDefaultTipoEntidad(type: string) {
    switch (type) {
      case 'legal': return undefined; // Will be selected by user
      case 'client': return 7; // Prospecto by default
      case 'representative': return 1; // Representante Legal
      case 'desarrollador': return undefined; // Will be set by the parent component
      case 'inmobiliaria': return undefined; // Will be set by the parent component
      case 'administradora': return undefined; // Will be set by the parent component
      case 'banco': return undefined; // Will be set by the parent component
      default: return undefined;
    }
  }

  function shouldShowTaxFields() {
    // Show tax fields for all entities except representatives for users and prospects
    const shouldShow = entityType !== 'representative' && !isProspectForm();
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!nombre.trim() || !email.trim() || !telefono.trim() || !rfc.trim()) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos (nombre, email, teléfono y RFC).",
        variant: "destructive",
      });
      return;
    }

    if (telefono.length !== 10) {
      toast({
        title: "Error", 
        description: "El teléfono debe tener exactamente 10 dígitos.",
        variant: "destructive",
      });
      return;
    }

    // RFC validation
    const rfcRegex = /^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
    if (rfc.trim() && !rfcRegex.test(rfc.trim().toUpperCase())) {
      toast({
        title: "Error",
        description: "El RFC no tiene un formato válido.",
        variant: "destructive",
      });
      return;
    }

    // CURP validation (only if CURP is provided)
    const curpRegex = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9]{2}$/;
    if (curp.trim() && !curpRegex.test(curp.trim().toUpperCase())) {
      toast({
        title: "Error",
        description: "La CURP no tiene un formato válido.",
        variant: "destructive",
      });
      return;
    }

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
      id_tipo_identificacion: idTipoIdentificacion ? parseInt(idTipoIdentificacion) : null,
      sexo: sexo || null,
      fecha_nacimiento: fechaNacimiento?.toISOString() || null,
      id_estado_civil: idEstadoCivil ? parseInt(idEstadoCivil) : null,
      ocupacion: ocupacion.trim() || null,
      id_pais_nacimiento: idPaisNacimiento || null,
      id_estado_nacimiento: idEstadoNacimiento ? parseInt(idEstadoNacimiento) : null,
      id_municipio_nacimiento: idMunicipioNacimiento ? parseInt(idMunicipioNacimiento) : null,
      direccion_calle_numero: direccionCalle.trim() || null,
      direccion_colonia: direccionColonia.trim() || null,
      direccion_codigo_postal: direccionCp.trim() || null,
      direccion_id_pais: idPaisDireccion || null,
      direccion_id_estado: idEstadoDireccion ? parseInt(idEstadoDireccion) : null,
      direccion_id_municipio: idMunicipioDireccion ? parseInt(idMunicipioDireccion) : null,
      direccion_fiscal_calle_numero: direccionFiscalCalle.trim() || null,
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
      coordenadas: coordenadas,
      direccion_mapa: direccionMapa.trim() || null,
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

    // For backwards compatibility with user form
    if (entityType === 'user') {
      onSubmit({
        nombre: nombre.trim(),
        curp: curp.trim(),
        url_documento_identificacion: documentImageUrl || undefined,
      });
    } else {
      // Add entity-specific data (only representativeId, parent components handle entityType)
      const extendedFormData = {
        ...formData,
        representativeId: idRepresentanteLegal === 'none' || !idRepresentanteLegal ? null : parseInt(idRepresentanteLegal),
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
  const isSpecialEntityType = ['vendedor', 'comprador', 'dueno', 'residente', 'agente', 'administrador', 'representante_legal'].includes(entityType);

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {!isUser ? (
          <Tabs defaultValue="basic" className="w-full">
            {isSpecialEntityType ? (
              <TabsList className="grid w-full mb-4 bg-muted grid-cols-4">
                <TabsTrigger value="basic" className="text-foreground">Información Básica</TabsTrigger>
                <TabsTrigger value="address" className="text-foreground">Dirección</TabsTrigger>
                <TabsTrigger value="fiscal" className="text-foreground">Información Fiscal</TabsTrigger>
                <TabsTrigger value="documents" className="text-foreground">Documentos</TabsTrigger>
              </TabsList>
            ) : (
              <TabsList className="grid w-full mb-4 bg-muted grid-cols-1">
                <TabsTrigger value="basic" className="text-foreground">Información Básica</TabsTrigger>
              </TabsList>
            )}

            <TabsContent value="basic" className="space-y-4 mt-6">
              {isSpecialEntityType ? (
                // New structured form for specific entity types
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="nombres">Nombre(s) *</Label>
                    <Input
                      id="nombres"
                      type="text"
                      value={nombre.split(' ')[0] || ''}
                      onChange={(e) => {
                        const nombres = e.target.value;
                        const apellidos = nombre.split(' ').slice(1).join(' ');
                        setNombre(`${nombres} ${apellidos}`.trim());
                      }}
                      placeholder="Ingresa el nombre"
                    />
                  </div>

                  <div>
                    <Label htmlFor="primerApellido">Primer Apellido *</Label>
                    <Input
                      id="primerApellido"
                      type="text"
                      value={nombre.split(' ')[1] || ''}
                      onChange={(e) => {
                        const nombreArray = nombre.split(' ');
                        const nombres = nombreArray[0] || '';
                        const segundoApellido = nombreArray[2] || '';
                        setNombre(`${nombres} ${e.target.value} ${segundoApellido}`.trim());
                      }}
                      placeholder="Ingresa el primer apellido"
                    />
                  </div>

                  <div>
                    <Label htmlFor="segundoApellido">Segundo Apellido</Label>
                    <Input
                      id="segundoApellido"
                      type="text"
                      value={nombre.split(' ')[2] || ''}
                      onChange={(e) => {
                        const nombreArray = nombre.split(' ');
                        const nombres = nombreArray[0] || '';
                        const primerApellido = nombreArray[1] || '';
                        setNombre(`${nombres} ${primerApellido} ${e.target.value}`.trim());
                      }}
                      placeholder="Ingresa el segundo apellido"
                    />
                  </div>

                  <div>
                    <Label htmlFor="email">Correo Electrónico *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Ingresa el correo electrónico"
                    />
                  </div>

                  <div>
                    <Label htmlFor="telefono">Teléfono *</Label>
                    <Input
                      id="telefono"
                      type="tel"
                      value={telefono}
                      onChange={(e) => setTelefono(e.target.value)}
                      placeholder="Ingresa el teléfono"
                    />
                  </div>
                </div>
              ) : (
                // Original form structure for other entity types
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Project selection for prospects - shown as first field */}
                {isProspectForm() && (
                  <div className="md:col-span-2">
                    <Label htmlFor="idProyecto">Proyecto de Interés *</Label>
                <Select value={idProyecto} onValueChange={setIdProyecto}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="null">Sin proyecto</SelectItem>
                        {proyectos.map((proyecto) => (
                          <SelectItem key={proyecto.id} value={proyecto.id.toString()}>
                            {proyecto.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                <div>
                  <Label htmlFor="tipoPersona">Tipo de Persona *</Label>
                  {entityType === 'legal' ? (
                    <Input
                      id="tipoPersona"
                      type="text"
                      value="Persona Moral"
                      disabled
                      className="bg-muted"
                    />
                  ) : entityType === 'representative' ? (
                    <Input
                      id="tipoPersona"
                      type="text"
                      value="Persona Física"
                      disabled
                      className="bg-muted"
                    />
                  ) : entityType === 'buyer' || entityType === 'client' ? (
                    <Select value={tipoPersona} onValueChange={setTipoPersona}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona tipo de persona" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pf">Persona Física</SelectItem>
                        <SelectItem value="pm">Persona Moral</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="tipoPersona"
                      type="text"
                      value={tipoPersona === 'pf' ? 'Persona Física' : 'Persona Moral'}
                      disabled
                      className="bg-muted"
                    />
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
                  <Label htmlFor="rfc">RFC *</Label>
                  <Input
                    id="rfc"
                    type="text"
                    value={rfc}
                    onChange={(e) => setRfc(e.target.value.toUpperCase())}
                    placeholder="Ingresa el RFC (Ej: ABC123456DEF)"
                  />
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

                {(entityType === 'legal' || entityType === 'desarrollador' || entityType === 'inmobiliaria' || (entityType === 'client' && tipoPersona === 'pm')) && (
                  <div>
                    <Label htmlFor="idRepresentanteLegal">Representante Legal</Label>
                    <Select value={idRepresentanteLegal?.toString() || ''} onValueChange={setIdRepresentanteLegal}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un representante legal" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin representante legal</SelectItem>
                        {representantesLegales.map((rep) => (
                          <SelectItem key={rep.id} value={rep.id.toString()}>
                            {rep.nombre_legal}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {shouldShowTaxFields() && (
                  <div>
                    <Label htmlFor="usoCfdi">Uso CFDI</Label>
                    <Select value={usoCfdi} onValueChange={setUsoCfdi}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona el uso CFDI" />
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
                )}

                {shouldShowTaxFields() && (
                  <div>
                    <Label htmlFor="regimen">Régimen</Label>
                    <Select value={regimen} onValueChange={setRegimen}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un régimen" />
                      </SelectTrigger>
                      <SelectContent>
                        {regimenes.map((reg) => (
                          <SelectItem key={reg.id} value={reg.id.toString()}>
                            {reg.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                </div>
              )}
            </TabsContent>

            {/* New tabs only for special entity types */}
            {isSpecialEntityType && (
              <>
                {/* Address Tab */}
                <TabsContent value="address" className="space-y-4 mt-6">
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium">Dirección</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="calle">Calle *</Label>
                        <Input
                          id="calle"
                          type="text"
                          value={direccionCalle}
                          onChange={(e) => setDireccionCalle(e.target.value)}
                          placeholder="Ingresa la calle y número"
                        />
                      </div>

                      <div>
                        <Label htmlFor="numeroExterno">Número Externo</Label>
                        <Input
                          id="numeroExterno"
                          type="text"
                          placeholder="Número externo"
                        />
                      </div>

                      <div>
                        <Label htmlFor="numeroInterno">Número Interno</Label>
                        <Input
                          id="numeroInterno"
                          type="text"
                          placeholder="Número interno"
                        />
                      </div>

                      <div>
                        <Label htmlFor="codigoPostal">Código Postal *</Label>
                        <Input
                          id="codigoPostal"
                          type="text"
                          value={direccionCp}
                          onChange={(e) => setDireccionCp(e.target.value)}
                          placeholder="Ingresa el código postal"
                        />
                      </div>

                      <div>
                        <Label htmlFor="pais">País *</Label>
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
                        <Label htmlFor="estado">Estado *</Label>
                        <Select value={idEstadoDireccion} onValueChange={setIdEstadoDireccion}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un estado" />
                          </SelectTrigger>
                          <SelectContent>
                            {estados.map((estado) => (
                              <SelectItem key={estado.id} value={estado.id.toString()}>
                                {estado.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="municipio">Municipio *</Label>
                        <Select value={idMunicipioDireccion} onValueChange={setIdMunicipioDireccion}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un municipio" />
                          </SelectTrigger>
                          <SelectContent>
                            {municipios.map((municipio) => (
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

                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <MapPin className="w-4 h-4" />
                        <label className="text-sm font-medium">Ubicación en Google Maps</label>
                      </div>
                      <GoogleMapComponent
                        onLocationSelect={(location) => setCoordenadas(location)}
                        onAddressSelect={(address) => setDireccionMapa(address)}
                        initialLocation={coordenadas}
                      />
                      <p className="text-xs text-muted-foreground">
                        Haz clic en el mapa para seleccionar la ubicación
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="coordenadas">Coordenadas</Label>
                          <div className="flex space-x-2">
                            <Input
                              value={coordenadas ? `${coordenadas.lat}, ${coordenadas.lng}` : ''}
                              readOnly
                              placeholder="Selecciona ubicación en el mapa"
                              className="bg-muted"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (coordenadas) {
                                  navigator.clipboard.writeText(`${coordenadas.lat}, ${coordenadas.lng}`);
                                }
                              }}
                              disabled={!coordenadas}
                            >
                              Copiar
                            </Button>
                          </div>
                        </div>
                        
                        <div>
                          <Label htmlFor="direccionMapa">Dirección del Mapa</Label>
                          <Input
                            id="direccionMapa"
                            value={direccionMapa}
                            onChange={(e) => setDireccionMapa(e.target.value)}
                            placeholder="Dirección obtenida del mapa"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Fiscal Information Tab */}
                <TabsContent value="fiscal" className="space-y-4 mt-6">
                  <div className="space-y-6">
                    <h3 className="text-lg font-medium">Información Fiscal</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="nacionalidad">Nacionalidad *</Label>
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

                      <div>
                        <Label htmlFor="curp">CURP *</Label>
                        <Input
                          id="curp"
                          type="text"
                          value={curp}
                          onChange={(e) => setCurp(e.target.value)}
                          placeholder="Ingresa la CURP"
                        />
                      </div>

                      <div>
                        <Label htmlFor="rfc">RFC *</Label>
                        <Input
                          id="rfc"
                          type="text"
                          value={rfc}
                          onChange={(e) => setRfc(e.target.value)}
                          placeholder="Ingresa el RFC"
                        />
                      </div>

                      <div>
                        <Label htmlFor="sexo">Sexo *</Label>
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

                      <div>
                        <Label htmlFor="regimen">Régimen *</Label>
                        <Input
                          id="regimen"
                          type="text"
                          value={regimen}
                          onChange={(e) => setRegimen(e.target.value)}
                          placeholder="Ingresa el régimen fiscal"
                        />
                      </div>

                      <div>
                        <Label htmlFor="usoCfdi">Uso del CFDI *</Label>
                        <Input
                          id="usoCfdi"
                          type="text"
                          value={usoCfdi}
                          onChange={(e) => setUsoCfdi(e.target.value)}
                          placeholder="Ingresa el uso del CFDI"
                        />
                      </div>

                      <div>
                        <Label htmlFor="estadoCivil">Estado Civil *</Label>
                        <Select value={idEstadoCivil} onValueChange={setIdEstadoCivil}>
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
                      </div>

                      <div>
                        <Label htmlFor="tipoId">Tipo de ID *</Label>
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

                      <div>
                        <Label>Fecha de Nacimiento *</Label>
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
                        <Label htmlFor="estadoNacimiento">Estado de Nacimiento *</Label>
                        <Select value={idEstadoNacimiento} onValueChange={setIdEstadoNacimiento}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona estado" />
                          </SelectTrigger>
                          <SelectContent>
                            {estados.map((estado) => (
                              <SelectItem key={estado.id} value={estado.id.toString()}>
                                {estado.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="municipioNacimiento">Ciudad de Nacimiento *</Label>
                        <Select value={idMunicipioNacimiento} onValueChange={setIdMunicipioNacimiento}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona ciudad" />
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
                          <Label htmlFor="calleFiscal">Calle *</Label>
                          <Input
                            id="calleFiscal"
                            type="text"
                            value={direccionFiscalCalle}
                            onChange={(e) => setDireccionFiscalCalle(e.target.value)}
                            placeholder="Ingresa la calle y número fiscal"
                            disabled={copiarDireccionFiscal}
                          />
                        </div>

                        <div>
                          <Label htmlFor="codigoPostalFiscal">Código Postal *</Label>
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
                          <Label htmlFor="paisFiscal">País *</Label>
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
                          <Label htmlFor="estadoFiscal">Estado *</Label>
                          <Select value={idEstadoFiscal} onValueChange={setIdEstadoFiscal} disabled={copiarDireccionFiscal}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un estado" />
                            </SelectTrigger>
                            <SelectContent>
                              {estados.map((estado) => (
                                <SelectItem key={estado.id} value={estado.id.toString()}>
                                  {estado.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label htmlFor="municipioFiscal">Municipio *</Label>
                          <Select value={idMunicipioFiscal} onValueChange={setIdMunicipioFiscal} disabled={copiarDireccionFiscal}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un municipio" />
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

                      <div className="space-y-2">
                        <Label>Ubicación Fiscal en Google Maps</Label>
                        <div className="h-64 bg-muted rounded-md flex items-center justify-center">
                          <p className="text-muted-foreground">Mapa de Google Maps aquí</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Documents Tab */}
                <TabsContent value="documents" className="space-y-4 mt-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Documentos</h3>
                    <DocumentsTab 
                      entityId={initialData?.id || undefined} 
                      entityType="persona"
                      tipoPersona="pf"
                      pendingDocuments={pendingDocuments}
                      onPendingDocumentsChange={setPendingDocuments}
                      onDocumentAdded={() => {
                        toast({
                          title: "Documento agregado",
                          description: "El documento se ha agregado correctamente."
                        });
                      }}
                    />
                  </div>
                </TabsContent>
              </>
            )}
          </Tabs>
        ) : (
          // User form (simplified)
          <div className="space-y-4">
            <div>
              <Label htmlFor="nombre">Nombre Completo *</Label>
              <Input
                id="nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ingresa el nombre completo"
                readOnly
                className="bg-muted"
              />
            </div>

            <div>
              <Label htmlFor="curp">CURP *</Label>
              <Input
                id="curp"
                type="text"
                value={curp}
                onChange={(e) => setCurp(e.target.value)}
                placeholder="Ingresa la CURP"
                readOnly
                className="bg-muted"
              />
            </div>
          </div>
        )}

        <div className="flex gap-4 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
