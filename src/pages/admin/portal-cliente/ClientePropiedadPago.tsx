import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Info, ShieldCheck, Loader2 } from "lucide-react";
import { useClientePropiedadDetalle } from "@/hooks/useClientePropiedadDetalle";
import { fmtMXN as fmt } from "@/lib/clienteMockData";
import { toast } from "sonner";

const ClientePropiedadPago = () => {
  const { cuentaId } = useParams<{ cuentaId: string }>();
  const navigate = useNavigate();
  const { data: prop, isLoading } = useClientePropiedadDetalle(cuentaId ? Number(cuentaId) : null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!prop || !prop.propiedadClabeStp) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Regresar
        </button>
        <p className="text-muted-foreground">No se encontró información de pago para esta propiedad.</p>
      </div>
    );
  }

  const clabe = prop.propiedadClabeStp;
  const today = new Date().toISOString().slice(0, 10);
  const overdueParcialidades = prop.parcialidades.filter(p => !p.pagado && p.fechaPago && p.fechaPago < today);
  const montoSugerido = overdueParcialidades.reduce((s, p) => s + p.saldoPendiente, 0);
  const concepto = `${prop.proyecto}-${prop.unidad}`;

  return (
    <div className="max-w-lg mx-auto lg:max-w-2xl pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background border-b border-border px-5 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div>
          <p className="font-semibold text-sm text-foreground">Instrucciones de pago</p>
          <p className="text-xs text-muted-foreground">Transferencia interbancaria</p>
        </div>
      </div>

      <div className="px-5 pt-5 space-y-4">
        {/* Info banner */}
        <div className="rounded-xl bg-[hsl(var(--inmob-green))]/8 border border-[hsl(var(--inmob-green))]/20 p-4 flex gap-3">
          <Info className="w-5 h-5 text-[hsl(var(--inmob-green))] shrink-0 mt-0.5" />
          <p className="text-xs text-foreground leading-relaxed">
            Realiza la transferencia desde tu banca en línea utilizando esta CLABE única vinculada a tu propiedad. 
            El pago se reflejará automáticamente una vez confirmado por el banco.
          </p>
        </div>

        {/* CLABE */}
        <DataRow
          label="CLABE INTERBANCARIA"
          value={clabe}
          onCopy={() => copyToClipboard(clabe, "CLABE")}
          bold
        />

        {/* Banco */}
        <DataRow
          label="BANCO RECEPTOR"
          value="STP (Sistema de Transferencias y Pagos)"
        />

        {/* Beneficiario */}
        <DataRow
          label="BENEFICIARIO"
          value={prop.propiedadBeneficiarioNombre || "—"}
        />

        {/* Monto sugerido */}
        {montoSugerido > 0 && (
          <DataRow
            label="SALDO A PAGAR"
            value={fmt(montoSugerido)}
            onCopy={() => copyToClipboard(montoSugerido.toFixed(2), "Monto")}
            bold
          />
        )}

        {/* Concepto */}
        <DataRow
          label="CONCEPTO / REFERENCIA"
          value={concepto}
          onCopy={() => copyToClipboard(concepto, "Concepto")}
          bold
        />

        {/* CTA Button */}
        <button
          onClick={() => copyToClipboard(clabe, "CLABE")}
          className="w-full py-3.5 rounded-xl bg-[hsl(var(--inmob-green))] text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform mt-2"
        >
          <Copy className="w-4 h-4" />
          Copiar CLABE
        </button>

        {/* Security note */}
        <div className="flex items-start gap-3 bg-muted/50 rounded-xl p-4 mt-2">
          <ShieldCheck className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-foreground">Conexión segura</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Esta CLABE está vinculada exclusivamente a tu propiedad.
            </p>
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground uppercase tracking-wider pt-2">
          Procesado por STP
        </p>
      </div>
    </div>
  );
};

function DataRow({ label, value, onCopy, bold }: { label: string; value: string; onCopy?: () => void; bold?: boolean }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1.5">{label}</p>
      <div className="flex items-center justify-between">
        <p className={`text-sm ${bold ? "font-bold" : "font-medium"} text-foreground`}>{value}</p>
        {onCopy && (
          <button onClick={onCopy} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <Copy className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}

export default ClientePropiedadPago;
