import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PersonForm } from "@/components/admin/PersonForm";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { InmobiliariaHeader } from "@/components/admin/InmobiliariaHeader";
import { useInmobiliariaDataStatus } from "@/hooks/useInmobiliariaDataStatus";

export default function MiInformacion() {
  const { canUpdate, isSuperAdmin, isLoading: isLoadingPermissions } = usePagePermissions('/admin/inmobiliarias/mi-informacion');
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedInmobiliariaId, setSelectedInmobiliariaId] = useState<number | null>(null);

  // Resolve the inmobiliaria ID: could be profile.id_persona (primary) or via proyectos_acceso (secondary)
  const { data: resolvedInmobiliariaId, isLoading: isLoadingResolution } = useQuery({
    queryKey: ['resolve-inmobiliaria-id', profile?.id_persona, profile?.email],
    queryFn: async () => {
      // Primary user: check if user's persona IS the inmobiliaria (tipo_entidad = 5)
      if (profile?.id_persona) {
        const { data: entidadData } = await supabase
          .from('entidades_relacionadas')
          .select('id')
          .eq('id_persona', profile.id_persona)
          .eq('id_tipo_entidad', 5)
          .eq('activo', true)
          .maybeSingle();

        if (entidadData) {
          // User IS the inmobiliaria
          return profile.id_persona;
        }
      }

      // Secondary user (may have no id_persona): look up inmobiliaria via proyectos_acceso -> entidades_relacionadas
      if (profile?.email) {
        const { data: proyectoAcceso } = await supabase
          .from('proyectos_acceso')
          .select('id_entidad_relacionada_dueno')
          .eq('usuario_id', profile.email)
          .eq('activo', true)
          .not('id_entidad_relacionada_dueno', 'is', null)
          .limit(1)
          .maybeSingle();

        if (proyectoAcceso?.id_entidad_relacionada_dueno) {
          const { data: entidadDuena } = await supabase
            .from('entidades_relacionadas')
            .select('id_persona')
            .eq('id', proyectoAcceso.id_entidad_relacionada_dueno)
            .eq('activo', true)
            .maybeSingle();

          if (entidadDuena?.id_persona) {
            return entidadDuena.id_persona;
          }
        }
      }

      return null;
    },
    // Enable for non-SuperAdmin users with either id_persona OR email
    enabled: !isSuperAdmin && !!(profile?.id_persona || profile?.email),
  });

  // Get the inmobiliaria ID based on user type
  const inmobiliariaId = selectedInmobiliariaId || resolvedInmobiliariaId;

  // Check data completion status
  const { isDataComplete, missingFields, isLoading: isLoadingStatus } = useInmobiliariaDataStatus(inmobiliariaId);

  // Fetch inmobiliaria data
  const { data: inmobiliariaData, isLoading: loadingData } = useQuery({
    queryKey: ['mi-informacion-inmobiliaria', inmobiliariaId],
    queryFn: async () => {
      if (!inmobiliariaId) return null;

      const { data, error } = await supabase
        .from('personas')
        .select(`
          id,
          nombre_legal,
          nombre_comercial,
          email,
          telefono,
          clave_pais_telefono,
          rfc,
          curp,
          tipo_persona,
          sexo,
          fecha_nacimiento,
          id_estado_civil,
          ocupacion,
          id_pais_nacimiento,
          id_estado_nacimiento,
          id_municipio_nacimiento,
          direccion_calle,
          direccion_num_ext,
          direccion_num_int,
          direccion_colonia,
          direccion_codigo_postal,
          direccion_id_pais,
          direccion_id_estado,
          direccion_id_municipio,
          direccion_fiscal_calle,
          direccion_fiscal_num_ext,
          direccion_fiscal_num_int,
          direccion_fiscal_colonia,
          direccion_fiscal_codigo_postal,
          direccion_fiscal_id_pais,
          direccion_fiscal_id_estado,
          direccion_fiscal_id_municipio,
          uso_cfdi,
          regimen,
          numero_escritura,
          numero_libro,
          folio_mercantil,
          fecha_escritura,
          fecha_registro,
          id_notario,
          url_logo,
          activo,
          id_entidad_relacionada_rep_leg,
          id_entidad_relacionada_rep_com
        `)
        .eq('id', inmobiliariaId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!inmobiliariaId,
  });

  // Update inmobiliaria mutation
  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId: _inmobId, tempBankAccounts, tempBeneficiaries, pendingDocuments, ...cleanPersonData } = personData;

      // Update persona data
      const { error: updateError } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', inmobiliariaId);

      if (updateError) throw updateError;

      // Sincronizar teléfono con usuarios si la inmobiliaria tiene usuario asociado
      if (cleanPersonData.telefono !== undefined || cleanPersonData.clave_pais_telefono !== undefined) {
        const { data: usuarioData } = await supabase
          .from('usuarios')
          .select('email')
          .eq('id_persona', inmobiliariaId)
          .maybeSingle();
          
        if (usuarioData?.email) {
          const phoneUpdateData: Record<string, any> = {
            fecha_actualizacion: new Date().toISOString()
          };
          if (cleanPersonData.telefono !== undefined) {
            phoneUpdateData.telefono = cleanPersonData.telefono;
          }
          if (cleanPersonData.clave_pais_telefono !== undefined) {
            phoneUpdateData.clave_pais_telefono = cleanPersonData.clave_pais_telefono;
          }
          await supabase
            .from('usuarios')
            .update(phoneUpdateData)
            .eq('email', usuarioData.email);
        }
      }

      // Update representatives if provided
      const repUpdateData: any = {};
      if (representativeId !== undefined) {
        repUpdateData.id_entidad_relacionada_rep_leg = representativeId || null;
      }
      if (commercialRepresentativeId !== undefined) {
        repUpdateData.id_entidad_relacionada_rep_com = commercialRepresentativeId || null;
      }

      if (Object.keys(repUpdateData).length > 0) {
        const { error: repError } = await supabase
          .from('personas')
          .update(repUpdateData)
          .eq('id', inmobiliariaId);

        if (repError) throw repError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mi-informacion-inmobiliaria', inmobiliariaId] });
      queryClient.invalidateQueries({ queryKey: ['sidebar-inmobiliaria-data'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-inmobiliaria-data'] });
      queryClient.invalidateQueries({ queryKey: ['inmobiliaria-data-status', inmobiliariaId] });
      
      // Refetch to check updated status
      setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['inmobiliaria-data-status', inmobiliariaId] });
      }, 500);
      
      toast({
        title: "Éxito",
        description: "Información actualizada correctamente.",
      });
    },
    onError: (error: any) => {
      console.error('Error updating inmobiliaria:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la información.",
        variant: "destructive",
      });
    },
  });

  if (isLoadingPermissions || loadingData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <InmobiliariaHeader 
        selectedInmobiliariaId={selectedInmobiliariaId}
        onInmobiliariaChange={setSelectedInmobiliariaId}
      />

      <Card className="border-0 shadow-md">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <Building className="h-5 w-5 text-primary" />
            Mi información
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Alert for missing data */}
          {!isLoadingStatus && !isDataComplete && missingFields.length > 0 && (
            <Alert variant="warning">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium mb-2">
                  Para habilitar "Mi Inventario", "Mis Ventas" y "Mis Agentes", completa la siguiente información:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {missingFields.map((section, idx) => (
                    <li key={idx}>
                      <strong>{section.section}:</strong> {section.fields.join(', ')}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          {inmobiliariaData ? (
            canUpdate ? (
              <PersonForm
                initialData={{
                  ...inmobiliariaData,
                  id_tipo_entidad: 5, // Inmobiliaria
                }}
                onSubmit={(data) => updateMutation.mutate(data)}
                isLoading={updateMutation.isPending}
                onCancel={() => {}}
                entityType="inmobiliaria"
                fixedEntityType={true}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No tienes permiso para editar esta información.
              </div>
            )
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No se encontró información de la inmobiliaria.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
