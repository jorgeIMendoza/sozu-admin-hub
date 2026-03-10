import {
  User, Mail, Phone, FileText, LogOut, HelpCircle, Shield, ChevronRight,
  CheckCircle2, AlertTriangle, Upload, Building2, CreditCard,
  Lock, Smartphone, Eye, BadgeCheck, AlertCircle, Clock,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Progress } from "@/components/ui/progress";
import { useState } from "react";

type VerificationStatus = "verified" | "review" | "incomplete";

const ClientePerfil = () => {
  const { signOut } = useAuth();
  const [verificationStatus] = useState<VerificationStatus>("verified");
  const profileCompletion = 80;

  const statusConfig: Record<VerificationStatus, { label: string; icon: React.ElementType; className: string }> = {
    verified: { label: "Perfil verificado", icon: BadgeCheck, className: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
    review: { label: "En revisión", icon: Clock, className: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
    incomplete: { label: "Información incompleta", icon: AlertCircle, className: "text-red-500 bg-red-50 dark:bg-red-950/30" },
  };

  const status = statusConfig[verificationStatus];
  const StatusIcon = status.icon;

  const documents = [
    { name: "INE", status: "ok" as const, date: "15 Ene 2025" },
    { name: "Comprobante de domicilio", status: "ok" as const, date: "10 Ene 2025" },
    { name: "Acta de matrimonio", status: "pending" as const, date: null },
    { name: "Constancia de situación fiscal", status: "ok" as const, date: "8 Ene 2025" },
  ];

  const docStatusIcon = (s: "ok" | "pending") =>
    s === "ok"
      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;

  return (
    <div className="max-w-lg mx-auto lg:max-w-none px-4 py-6 pb-28 space-y-6 lg:px-0">

      {/* Identity Hero */}
      <section className="flex flex-col items-center text-center">
        <div className="w-[72px] h-[72px] rounded-full bg-[hsl(var(--inmob-green))]/10 flex items-center justify-center mb-3">
          <User className="w-8 h-8 text-[hsl(var(--inmob-green))]" />
        </div>
        <h2 className="font-bold text-lg text-foreground">Alejandro García</h2>
        <p className="text-xs text-muted-foreground mb-2">Inversionista</p>

        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full ${status.className}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {status.label}
        </span>

        <div className="w-full max-w-[220px] mt-4">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span>Perfil completado</span>
            <span className="font-semibold text-foreground">{profileCompletion}%</span>
          </div>
          <Progress value={profileCompletion} className="h-1.5 bg-muted" />
        </div>
      </section>

      {/* Personal Info */}
      <Section title="Información personal" icon={User}>
        <InfoRow label="Tipo de persona" value="Física" />
        <InfoRow label="RFC" value="GAXX••••••XX0" />
        <InfoRow label="CURP" value="GAXX••••••••••XX00" />
        <InfoRow label="Email" value="a.garcia@email.com" icon={Mail} />
        <InfoRow label="Teléfono" value="+52 998 123 4567" icon={Phone} />
        <ActionButton label="Editar información" />
      </Section>

      {/* Docs */}
      <Section title="Documentación" icon={FileText}>
        <div className="space-y-0">
          {documents.map((doc, i) => (
            <div key={doc.name} className={`flex items-center gap-3 py-3 ${i < documents.length - 1 ? "border-b border-border/60" : ""}`}>
              {docStatusIcon(doc.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                {doc.date ? (
                  <p className="text-[11px] text-muted-foreground">{doc.date}</p>
                ) : (
                  <p className="text-[11px] text-amber-500">Pendiente de carga</p>
                )}
              </div>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                {doc.status === "ok" ? <Eye className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
        <button className="mt-3 w-full flex items-center justify-center gap-2 text-sm font-medium text-[hsl(var(--inmob-green))] py-2.5 rounded-lg border border-[hsl(var(--inmob-green))]/20 hover:bg-[hsl(var(--inmob-green))]/5 transition-colors">
          <Upload className="w-4 h-4" />
          Subir documento
        </button>
      </Section>

      {/* Fiscal */}
      <Section title="Información fiscal" icon={Building2}>
        <InfoRow label="Régimen fiscal" value="Sueldos y salarios" />
        <InfoRow label="Uso CFDI" value="Gastos en general" />
        <InfoRow label="Dirección fiscal" value="Cancún, Q. Roo" />
        <ActionButton label="Editar información fiscal" />
      </Section>

      {/* Bank */}
      <Section title="Cuentas bancarias" icon={CreditCard}>
        <div className="flex items-center gap-3 py-1">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">BBVA</p>
            <p className="text-[11px] text-muted-foreground">Terminación ****2345</p>
          </div>
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        </div>
        <ActionButton label="Administrar cuentas" />
      </Section>

      {/* Security */}
      <Section title="Seguridad" icon={Shield}>
        <MenuItem icon={Lock} label="Cambiar contraseña" />
        <MenuItem icon={Smartphone} label="Cerrar sesión en otros dispositivos" />
        <MenuItem icon={Shield} label="Activar verificación adicional" />
      </Section>

      {/* Bottom actions */}
      <div className="space-y-0">
        <button className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-accent/50 transition-colors rounded-lg px-1">
          <HelpCircle className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Centro de ayuda</span>
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-accent/50 transition-colors rounded-lg px-1"
        >
          <LogOut className="w-4 h-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
};

/* Helpers */
const Section = ({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) => (
  <section>
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
    </div>
    <div className="bg-card rounded-xl border border-border/60 p-4 space-y-2">
      {children}
    </div>
  </section>
);

const InfoRow = ({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ElementType }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
    </span>
    <span className="text-sm font-medium text-foreground">{value}</span>
  </div>
);

const ActionButton = ({ label }: { label: string }) => (
  <button className="mt-1 flex items-center gap-1 text-xs font-medium text-[hsl(var(--inmob-green))] hover:text-[hsl(var(--inmob-green))]/80 transition-colors">
    {label}
    <ChevronRight className="w-3.5 h-3.5" />
  </button>
);

const MenuItem = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
  <button className="w-full flex items-center justify-between py-2.5 hover:bg-accent/30 -mx-1 px-1 rounded-lg transition-colors">
    <span className="flex items-center gap-2.5 text-sm text-foreground">
      <Icon className="w-4 h-4 text-muted-foreground" />
      {label}
    </span>
    <ChevronRight className="w-4 h-4 text-muted-foreground" />
  </button>
);

export default ClientePerfil;
