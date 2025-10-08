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
import { AlertTriangle } from 'lucide-react';

interface ConfirmEscrituraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  vendedorData: {
    rfc?: string;
    regimen?: string;
    uso_cfdi?: string;
    direccion_fiscal_calle_numero?: string;
    direccion_fiscal_colonia?: string;
    direccion_fiscal_codigo_postal?: string;
    direccion_fiscal_id_pais?: string;
    direccion_fiscal_id_estado?: number;
    direccion_fiscal_id_municipio?: number;
  } | null;
  escrituraData: {
    clave_catastral?: string;
    libro?: string;
    hoja?: string;
    fecha_escritura?: Date | null;
    numero_unidad_privativa?: string;
  };
  shouldGenerateInvoice: boolean;
}

export function ConfirmEscrituraDialog({
  open,
  onOpenChange,
  onConfirm,
  vendedorData,
  escrituraData,
  shouldGenerateInvoice,
}: ConfirmEscrituraDialogProps) {
  const [datosFiscalesCompletos, setDatosFiscalesCompletos] = useState(false);
  const [datosEscrituracionCompletos, setDatosEscrituracionCompletos] = useState(false);

  // Validar datos fiscales
  useEffect(() => {
    if (!vendedorData) {
      setDatosFiscalesCompletos(false);
      return;
    }

    const isComplete = !!(
      vendedorData.rfc &&
      vendedorData.regimen &&
      vendedorData.uso_cfdi &&
      vendedorData.direccion_fiscal_calle_numero &&
      vendedorData.direccion_fiscal_colonia &&
      vendedorData.direccion_fiscal_codigo_postal &&
      vendedorData.direccion_fiscal_id_pais &&
      vendedorData.direccion_fiscal_id_estado &&
      vendedorData.direccion_fiscal_id_municipio
    );

    setDatosFiscalesCompletos(isComplete);
  }, [vendedorData]);

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

  const canSave = datosFiscalesCompletos && datosEscrituracionCompletos;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Confirmación de Número de Escritura
          </DialogTitle>
          <DialogDescription className="text-base pt-2">
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

            {/* Datos Fiscales Check */}
            <div className="flex items-start space-x-3">
              <Checkbox
                checked={datosFiscalesCompletos}
                disabled
                className="mt-1"
              />
              <div className="flex-1">
                <Label className={`${datosFiscalesCompletos ? 'text-foreground' : 'text-destructive'} font-medium`}>
                  Datos fiscales completos
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  RFC, régimen, uso del CFDI y dirección fiscal completa del vendedor
                </p>
                {!datosFiscalesCompletos && (
                  <p className="text-xs text-destructive mt-1">
                    ⚠ Falta información fiscal. Revise la pestaña "Datos del Vendedor".
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
