import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { isFiscalDataComplete, type FiscalData } from '@/utils/fiscalDataValidation';

interface ConfirmEscrituraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  compradoresData?: FiscalData[];
  escrituraData: {
    clave_catastral?: string;
    libro?: string;
    hoja?: string;
    fecha_escritura?: Date | null;
    numero_unidad_privativa?: string;
    numero_escritura?: string;
  };
  shouldGenerateInvoice: boolean;
  isCuentaFullyPaid: boolean;
  onGoToCompradores?: () => void;
}

export function ConfirmEscrituraDialog({
  open,
  onOpenChange,
  onConfirm,
  compradoresData = [],
  escrituraData,
  shouldGenerateInvoice,
  isCuentaFullyPaid,
  onGoToCompradores,
}: ConfirmEscrituraDialogProps) {
  const [datosFiscalesCompradoresCompletos, setDatosFiscalesCompradoresCompletos] = useState(false);
  const [compradoresIncompletos, setCompradoresIncompletos] = useState(0);
  const [datosEscrituracionCompletos, setDatosEscrituracionCompletos] = useState(false);

  // Validar datos fiscales de TODOS los compradores
  useEffect(() => {
    if (!compradoresData || compradoresData.length === 0) {
      setDatosFiscalesCompradoresCompletos(false);
      setCompradoresIncompletos(0);
      return;
    }

    const incompletos = compradoresData.filter((data) => !isFiscalDataComplete(data)).length;
    setCompradoresIncompletos(incompletos);
    setDatosFiscalesCompradoresCompletos(incompletos === 0);
  }, [compradoresData]);

  // Validar datos de escrituración
  useEffect(() => {
    const isComplete = !!(
      escrituraData.clave_catastral &&
      escrituraData.libro &&
      escrituraData.hoja &&
      escrituraData.fecha_escritura &&
      escrituraData.numero_unidad_privativa
    );

    setDatosEscrituracionCompletos(isComplete);
  }, [escrituraData]);

  const canSave = isCuentaFullyPaid && datosFiscalesCompradoresCompletos && datosEscrituracionCompletos;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Confirmación de Número de Escritura
          </DialogTitle>
          <DialogDescription className="text-base pt-2 space-y-2">
            {escrituraData.numero_escritura && (
              <div className="bg-primary/10 px-4 py-2 rounded-md">
                <span className="text-sm text-muted-foreground">Número de Escritura:</span>
                <p className="text-lg font-bold text-foreground">{escrituraData.numero_escritura}</p>
              </div>
            )}
            {shouldGenerateInvoice ? (
              <span className="block text-foreground font-medium">
                Una vez confirmado, se guardará el número de escritura y se generará la factura automáticamente.
              </span>
            ) : (
              <span className="block text-foreground font-medium">
                Una vez confirmado, se guardará el número de escritura.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <h4 className="font-semibold text-sm text-foreground">
              Requisitos para guardar:
            </h4>

            {/* Cuenta 100% Pagada Check */}
            <div className="flex items-start space-x-3">
              <Checkbox
                checked={isCuentaFullyPaid}
                disabled
                className="mt-1"
              />
              <div className="flex-1">
                <Label className={`${isCuentaFullyPaid ? 'text-foreground' : 'text-destructive'} font-medium`}>
                  Cuenta de cobranza 100% pagada
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  El acuerdo de pago debe estar completamente pagado
                </p>
                {!isCuentaFullyPaid && (
                  <p className="text-xs text-destructive mt-1">
                    ⚠ La cuenta de cobranza no está completamente pagada. Complete los pagos pendientes.
                  </p>
                )}
              </div>
            </div>

            {/* Datos Fiscales Compradores Check */}
            <div className="flex items-start space-x-3">
              <Checkbox
                checked={datosFiscalesCompradoresCompletos}
                disabled
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <Label className={`${datosFiscalesCompradoresCompletos ? 'text-foreground' : 'text-destructive'} font-medium`}>
                    Datos fiscales de todos los compradores completos
                  </Label>
                  {onGoToCompradores && !datosFiscalesCompradoresCompletos && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => {
                        onGoToCompradores();
                        onOpenChange(false);
                      }}
                    >
                      Ir a Datos del Comprador <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  RFC, régimen, uso del CFDI y dirección fiscal completa de todos los compradores
                </p>
                {!datosFiscalesCompradoresCompletos && (
                  <p className="text-xs text-destructive mt-1">
                    ⚠ {compradoresIncompletos} de {compradoresData.length} comprador{compradoresData.length > 1 ? 'es' : ''} {compradoresIncompletos > 1 ? 'tienen' : 'tiene'} información fiscal incompleta.
                  </p>
                )}
              </div>
            </div>

            {/* Datos de Escrituración Check */}
            <div className="flex items-start space-x-3">
              <Checkbox
                checked={datosEscrituracionCompletos}
                disabled
                className="mt-1"
              />
              <div className="flex-1">
                <Label className={`${datosEscrituracionCompletos ? 'text-foreground' : 'text-destructive'} font-medium`}>
                  Datos de escrituración completos
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Clave catastral, libro, hoja, fecha de escritura y número de unidad privativa
                </p>
                {!datosEscrituracionCompletos && (
                  <p className="text-xs text-destructive mt-1">
                    ⚠ Falta información de escrituración. Complete todos los campos.
                  </p>
                )}
              </div>
            </div>
          </div>

          {!canSave && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Nota:</strong> El botón de guardar se habilitará cuando todos los requisitos estén completos.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            disabled={!canSave}
          >
            Confirmar y Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
