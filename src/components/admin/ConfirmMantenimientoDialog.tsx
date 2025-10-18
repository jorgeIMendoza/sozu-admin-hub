import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { N8N_WEBHOOK_BASE_URL, ENVIRONMENT } from '@/lib/config';

interface ConfirmMantenimientoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cuentaCobranzaId: number;
  onSuccess?: () => void;
}

interface AdminInfo {
  id: number;
  nombre: string;
  cuentaMadreSTP: string | null;
  idEntidadRelacionada: number;
}

export function ConfirmMantenimientoDialog({
  isOpen,
  onClose,
  cuentaCobranzaId,
  onSuccess
}: ConfirmMantenimientoDialogProps) {
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [clabeSTP, setClabeSTP] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [nuevaClabe, setNuevaClabe] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && cuentaCobranzaId) {
      loadData();
    }
  }, [isOpen, cuentaCobranzaId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Get cuenta_cobranza data
      const { data: cuentaData, error: cuentaError } = await supabase
        .from('cuentas_cobranza')
        .select('clabe_stp, id_oferta')
        .eq('id', cuentaCobranzaId)
        .single();

      if (cuentaError) throw cuentaError;

      setClabeSTP(cuentaData.clabe_stp || 'No configurada');

      // Get property and project info
      const { data: ofertaData, error: ofertaError } = await supabase
        .from('ofertas')
        .select(`
          id_propiedad,
          propiedades!ofertas_id_propiedad_fkey (
            id_entidad_relacionada_dueno
          )
        `)
        .eq('id', cuentaData.id_oferta)
        .single();

      if (ofertaError) throw ofertaError;

      const idEntidadDueno = (ofertaData.propiedades as any)?.id_entidad_relacionada_dueno;

      if (!idEntidadDueno) {
        setAdminInfo(null);
        return;
      }

      // Get project from entidad_relacionada
      const { data: entidadDuenoData, error: entidadDuenoError } = await supabase
        .from('entidades_relacionadas')
        .select('id_proyecto, cuenta_madre_stp')
        .eq('id', idEntidadDueno)
        .single();

      if (entidadDuenoError) throw entidadDuenoError;

      // Get administrador from entidades_relacionadas where id_tipo_entidad = 1 (Administrador)
      const { data: adminData, error: adminError } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          cuenta_madre_stp,
          personas!entidades_relacionadas_id_persona_fkey (
            id,
            nombre_legal
          )
        `)
        .eq('id_proyecto', entidadDuenoData.id_proyecto)
        .eq('id_tipo_entidad', 1)
        .eq('activo', true)
        .maybeSingle();

      if (adminError) throw adminError;

      if (adminData && adminData.personas) {
        const persona = adminData.personas as any;
        setAdminInfo({
          id: persona.id,
          nombre: persona.nombre_legal,
          cuentaMadreSTP: adminData.cuenta_madre_stp,
          idEntidadRelacionada: adminData.id
        });
      } else {
        setAdminInfo(null);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cargar la información"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!adminInfo || !adminInfo.cuentaMadreSTP) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se puede continuar sin un administrador con cuenta madre STP configurada"
      });
      return;
    }

    setIsProcessing(true);
    try {
      // Call stored procedure to create CLABE reference
      const { data: clabeData, error: clabeError } = await supabase
        .rpc('crear_referencia_bancaria', {
          id_er_dueno: adminInfo.idEntidadRelacionada
        });

      if (clabeError) throw clabeError;

      setNuevaClabe(clabeData);

      // Call N8N endpoint
      const response = await fetch(`${N8N_WEBHOOK_BASE_URL}/generaCuentaMantenimiento`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id_cuenta_cobranza: cuentaCobranzaId,
          clabe_stp_mantenimiento: clabeData,
          environment: ENVIRONMENT
        })
      });

      if (!response.ok) {
        throw new Error('Error al generar cuenta de mantenimiento');
      }

      toast({
        title: "Éxito",
        description: "Cuenta de mantenimiento generada correctamente"
      });

      onSuccess?.();
      onClose();

    } catch (error) {
      console.error('Error processing:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo procesar la solicitud"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const canConfirm = adminInfo && adminInfo.cuentaMadreSTP;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Confirmar Generación de Cuenta de Mantenimiento</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Administrador Info */}
            <div className="space-y-2">
              <Label>Administrador del Proyecto</Label>
              {adminInfo ? (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-medium">{adminInfo.nombre}</span>
                </div>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No hay administrador configurado para este proyecto
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Cuenta Madre STP Info */}
            {adminInfo && (
              <div className="space-y-2">
                <Label>Cuenta Madre STP del Administrador</Label>
                {adminInfo.cuentaMadreSTP ? (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="font-mono">{adminInfo.cuentaMadreSTP}</span>
                  </div>
                ) : (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      El administrador no tiene cuenta madre STP configurada. 
                      Debe configurarse antes de continuar.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* CLABE STP de la cuenta */}
            <div className="space-y-2">
              <Label>CLABE STP de la Cuenta</Label>
              <Input value={clabeSTP} readOnly className="bg-muted" />
            </div>

            {/* Nueva CLABE generada */}
            {nuevaClabe && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <strong>Nueva CLABE generada:</strong> {nuevaClabe}
                </AlertDescription>
              </Alert>
            )}

            {/* Warning message */}
            {!canConfirm && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No se puede generar la cuenta de mantenimiento hasta que se configure 
                  un administrador con cuenta madre STP.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!canConfirm || isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              'Confirmar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
