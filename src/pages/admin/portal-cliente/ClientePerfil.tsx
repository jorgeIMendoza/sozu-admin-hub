import {
  User, Mail, Phone, FileText, LogOut, Shield, ChevronRight,
  CheckCircle2, AlertTriangle, Building2, CreditCard,
  Lock, Eye, BadgeCheck, AlertCircle, Clock, Loader2,
  Check, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Progress } from "@/components/ui/progress";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClienteImpersonation } from "@/contexts/ClienteImpersonationContext";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type VerificationStatus = "verified" | "review" | "incomplete";

const ClientePerfil = () => {
  const { profile, signOut, signIn, updatePassword } = useAuth();
  const { impersonatedClientePersonaId, isImpersonating } = useClienteImpersonation();
  const effectivePersonaId = isImpersonating ? impersonatedClientePersonaId : profile?.id_persona;

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Fetch persona data
  const { data: persona, isLoading: loadingPersona } = useQuery({
    queryKey: ["cliente-perfil-persona", effectivePersonaId],
    queryFn: async () => {
      if (!effectivePersonaId) return null;
      const { data } = await supabase
        .from("personas")
        .select(`
          id, nombre_legal, tipo_persona, rfc, curp, email, telefono,
          clave_pais_telefono, regimen, uso_cfdi,
          direccion_fiscal_calle, direccion_fiscal_colonia, direccion_fiscal_codigo_postal,
          direccion_fiscal_num_ext, direccion_fiscal_num_int,
          direccion_fiscal_id_estado, direccion_fiscal_id_municipio
        `)
        .eq("id", effectivePersonaId)
        .maybeSingle();
      return data;
    },
    enabled: !!effectivePersonaId,
  });

  // Fetch regimen name
  const { data: regimenData } = useQuery({
    queryKey: ["cliente-perfil-regimen", persona?.regimen],
    queryFn: async () => {
      if (!persona?.regimen) return null;
      const { data } = await supabase
        .from("regimen")
        .select("id, nombre")
        .eq("id", persona.regimen)
        .maybeSingle();
      return data;
    },
    enabled: !!persona?.regimen,
  });

  // Fetch uso_cfdi name
  const { data: usoCfdiData } = useQuery({
    queryKey: ["cliente-perfil-usocfdi", persona?.uso_cfdi],
    queryFn: async () => {
      if (!persona?.uso_cfdi) return null;
      const { data } = await supabase
        .from("uso_cfdi")
        .select("codigo, nombre")
        .eq("codigo", persona.uso_cfdi)
        .maybeSingle();
      return data;
    },
    enabled: !!persona?.uso_cfdi,
  });

  // Fetch documents for persona
  const { data: documentos = [] } = useQuery({
    queryKey: ["cliente-perfil-docs", effectivePersonaId],
    queryFn: async () => {
      if (!effectivePersonaId) return [];
      const { data } = await supabase
        .from("documentos")
        .select("id, url, id_tipo_documento, id_estatus_verificacion, fecha_creacion, tipos_documento:documentos_id_tipo_documento_fkey!inner(nombre)")
        .eq("id_persona", effectivePersonaId)
        .eq("activo", true)
        .eq("es_draft", false);
      return (data || []).map((d: any) => ({
        id: d.id,
        name: d.tipos_documento?.nombre || "Documento",
        status: d.id_estatus_verificacion === 2 ? "ok" as const : "pending" as const,
        date: d.fecha_creacion ? new Date(d.fecha_creacion).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" }) : null,
        url: d.url,
      }));
    },
    enabled: !!effectivePersonaId,
  });

  // Fetch bank accounts
  const { data: cuentasBancarias = [] } = useQuery({
    queryKey: ["cliente-perfil-bancos", effectivePersonaId],
    queryFn: async () => {
      if (!effectivePersonaId) return [];
      const { data } = await supabase
        .from("cuentas_bancarias")
        .select("id, numero_cuenta, cuenta_clabe, id_banco, titular, bancos:fk_cuentas_bancarias_banco(nombre)")
        .eq("id_persona", effectivePersonaId)
        .eq("activo", true);
      return (data || []).map((c: any) => ({
        id: c.id,
        banco: (c.bancos as any)?.nombre || "Banco",
        numeroCuenta: c.numero_cuenta,
        clabe: c.cuenta_clabe,
        titular: c.titular,
      }));
    },
    enabled: !!effectivePersonaId,
  });

  // Password validation
  const passwordChecks = useMemo(() => ({
    minLength: newPassword.length >= 8,
    hasUpper: /[A-Z]/.test(newPassword),
    hasLower: /[a-z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword),
    hasSpecial: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword),
    matches: newPassword.length > 0 && newPassword === confirmPassword,
  }), [newPassword, confirmPassword]);

  const allPasswordChecksPass = passwordChecks.minLength && passwordChecks.hasUpper && passwordChecks.hasLower && passwordChecks.hasNumber && passwordChecks.hasSpecial && passwordChecks.matches;

  const handleChangePassword = async () => {
    if (!allPasswordChecksPass) {
      toast.error("La contraseña no cumple con todos los requisitos");
      return;
    }
    if (!currentPassword) {
      toast.error("Ingresa tu contraseña actual");
      return;
    }
    setChangingPassword(true);
    // Verify current password first
    const email = profile?.email;
    if (!email) {
      toast.error("No se pudo obtener el email del usuario");
      setChangingPassword(false);
      return;
    }
    const { error: signInError } = await signIn(email, currentPassword);
    if (signInError) {
      toast.error("La contraseña actual es incorrecta");
      setChangingPassword(false);
      return;
    }
    const { error } = await updatePassword(newPassword);
    setChangingPassword(false);
    if (error) {
      toast.error("Error al cambiar contraseña");
    } else {
      toast.success("Contraseña actualizada correctamente");
      setShowChangePassword(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  // Profile completion
  const completionFields = persona ? [
    persona.nombre_legal,
    persona.rfc,
    persona.curp,
    persona.email,
    persona.telefono,
    persona.regimen,
    persona.uso_cfdi,
    persona.direccion_fiscal_calle,
    documentos.length > 0,
    cuentasBancarias.length > 0,
  ] : [];
  const profileCompletion = completionFields.length > 0
    ? Math.round((completionFields.filter(Boolean).length / completionFields.length) * 100)
    : 0;

  const verificationStatus: VerificationStatus = profileCompletion >= 90 ? "verified" : profileCompletion >= 50 ? "review" : "incomplete";

  const statusConfig: Record<VerificationStatus, { label: string; icon: React.ElementType; className: string }> = {
    verified: { label: "Perfil verificado", icon: BadgeCheck, className: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
    review: { label: "En revisión", icon: Clock, className: "text-amber-600 bg-amber-50 dark:bg-amber-950/30" },
    incomplete: { label: "Información incompleta", icon: AlertCircle, className: "text-red-500 bg-red-50 dark:bg-red-950/30" },
  };

  const status = statusConfig[verificationStatus];
  const StatusIcon = status.icon;

  const maskValue = (val: string | null, showFirst = 4, showLast = 3) => {
    if (!val) return "—";
    if (val.length <= showFirst + showLast) return val;
    return val.substring(0, showFirst) + "••••" + val.substring(val.length - showLast);
  };

  const displayName = persona?.nombre_legal || profile?.nombre || "Cliente";
  const tipoPersona = persona?.tipo_persona === "Moral" ? "Moral" : "Física";

  // Fiscal display values with name
  const regimenDisplay = persona?.regimen
    ? regimenData?.nombre
      ? `${persona.regimen} — ${regimenData.nombre}`
      : persona.regimen
    : "—";

  const usoCfdiDisplay = persona?.uso_cfdi
    ? usoCfdiData?.nombre
      ? `${persona.uso_cfdi} — ${usoCfdiData.nombre}`
      : persona.uso_cfdi
    : "—";

  // Fiscal address
  const fiscalParts = [
    persona?.direccion_fiscal_calle,
    persona?.direccion_fiscal_num_ext ? `#${persona.direccion_fiscal_num_ext}` : null,
    persona?.direccion_fiscal_colonia,
    persona?.direccion_fiscal_codigo_postal,
  ].filter(Boolean);
  const fiscalAddress = fiscalParts.length > 0 ? fiscalParts.join(", ") : "—";

  if (loadingPersona) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto lg:max-w-none px-4 py-6 pb-28 space-y-6 lg:px-0">
      {/* Identity Hero */}
      <section className="flex flex-col items-center text-center">
        <div className="w-[72px] h-[72px] rounded-full bg-[hsl(var(--inmob-green))]/10 flex items-center justify-center mb-3">
          <User className="w-8 h-8 text-[hsl(var(--inmob-green))]" />
        </div>
        <h2 className="font-bold text-lg text-foreground">{displayName}</h2>
        <p className="text-xs text-muted-foreground mb-2">{tipoPersona === "Moral" ? "Persona Moral" : "Inversionista"}</p>

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
        <InfoRow label="Tipo de persona" value={tipoPersona} />
        <InfoRow label="RFC" value={maskValue(persona?.rfc)} />
        <InfoRow label="CURP" value={maskValue(persona?.curp, 4, 4)} />
        <InfoRow label="Email" value={persona?.email || profile?.email || "—"} icon={Mail} />
        <InfoRow label="Teléfono" value={persona?.telefono ? `${persona.clave_pais_telefono || "+52"} ${persona.telefono}` : "—"} icon={Phone} />
      </Section>

      {/* Docs */}
      <Section title="Documentación" icon={FileText}>
        {documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Sin documentos registrados</p>
        ) : (
          <div className="space-y-0">
            {documentos.map((doc, i) => (
              <div key={doc.id} className={`flex items-center gap-3 py-3 ${i < documentos.length - 1 ? "border-b border-border/60" : ""}`}>
                {doc.status === "ok"
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                  {doc.date ? (
                    <p className="text-[11px] text-muted-foreground">{doc.date}</p>
                  ) : (
                    <p className="text-[11px] text-amber-500">Pendiente de verificación</p>
                  )}
                </div>
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
                    <Eye className="w-4 h-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Fiscal */}
      <Section title="Información fiscal" icon={Building2}>
        <InfoRow label="Régimen fiscal" value={regimenDisplay} />
        <InfoRow label="Uso CFDI" value={usoCfdiDisplay} />
        <InfoRow label="Dirección fiscal" value={fiscalAddress} />
      </Section>

      {/* Bank */}
      <Section title="Cuentas bancarias" icon={CreditCard}>
        {cuentasBancarias.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Sin cuentas bancarias registradas</p>
        ) : (
          <div className="space-y-2">
            {cuentasBancarias.map((cuenta) => (
              <div key={cuenta.id} className="flex items-center gap-3 py-1">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{cuenta.banco}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Terminación ****{cuenta.numeroCuenta?.slice(-4) || "****"}
                  </p>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Security */}
      <Section title="Seguridad" icon={Shield}>
        <button
          onClick={() => setShowChangePassword(true)}
          className="w-full flex items-center justify-between py-2.5 hover:bg-accent/30 -mx-1 px-1 rounded-lg transition-colors"
        >
          <span className="flex items-center gap-2.5 text-sm text-foreground">
            <Lock className="w-4 h-4 text-muted-foreground" />
            Cambiar contraseña
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      </Section>

      {/* Bottom actions */}
      <div className="space-y-0">
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 py-3.5 text-left hover:bg-accent/50 transition-colors rounded-lg px-1"
        >
          <LogOut className="w-4 h-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">Cerrar sesión</span>
        </button>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={showChangePassword} onOpenChange={(open) => {
        setShowChangePassword(open);
        if (!open) {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Contraseña actual</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Ingresa tu contraseña actual"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Nueva contraseña</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Ingresa la nueva contraseña"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Confirmar contraseña</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la nueva contraseña"
              />
            </div>

            {/* Password requirements */}
            {newPassword.length > 0 && (
              <div className="space-y-1.5 text-xs">
                <p className="text-muted-foreground font-medium mb-1">La contraseña debe cumplir:</p>
                <PasswordCheck label="Mínimo 8 caracteres" ok={passwordChecks.minLength} />
                <PasswordCheck label="Al menos una letra mayúscula" ok={passwordChecks.hasUpper} />
                <PasswordCheck label="Al menos una letra minúscula" ok={passwordChecks.hasLower} />
                <PasswordCheck label="Al menos un número" ok={passwordChecks.hasNumber} />
                <PasswordCheck label="Al menos un carácter especial (!@#$%...)" ok={passwordChecks.hasSpecial} />
                {confirmPassword.length > 0 && (
                  <PasswordCheck label="Las contraseñas coinciden" ok={passwordChecks.matches} />
                )}
              </div>
            )}

            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !allPasswordChecksPass || !currentPassword}
              className="w-full bg-[hsl(var(--inmob-green))] hover:bg-[hsl(var(--inmob-green))]/90"
            >
              {changingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirmar cambio de contraseña
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* Helpers */
const PasswordCheck = ({ label, ok }: { label: string; ok: boolean }) => (
  <div className="flex items-center gap-2">
    {ok
      ? <Check className="w-3.5 h-3.5 text-emerald-500" />
      : <X className="w-3.5 h-3.5 text-muted-foreground/50" />
    }
    <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
  </div>
);

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
    <span className="text-sm font-medium text-foreground max-w-[60%] text-right truncate">{value}</span>
  </div>
);

export default ClientePerfil;
