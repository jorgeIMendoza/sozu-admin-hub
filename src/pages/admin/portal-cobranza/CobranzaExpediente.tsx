import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExpedienteCobranza } from '@/hooks/useExpedienteCobranza';
import { formatCurrency } from '@/components/admin/portal-cobranza/StatusBadges';
import { format, parseISO, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft, User, Building2, CreditCard, Calendar, FileCheck,
  AlertTriangle, Clock, CheckCircle2, Mail, Phone, Hash,
  Loader2, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'resumen', label: 'Resumen', icon: User },
  { id: 'estado', label: 'Estado de Cuenta', icon: CreditCard },
  { id: 'calendario', label: 'Calendario', icon: Calendar },
  { id: 'pagos', label: 'Pagos', icon: FileCheck },
] as const;

type TabId = typeof tabs[number]['id'];

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return format(parseISO(d), 'dd MMM yyyy', { locale: es });
  } catch {
    return d;
  }
}

function priorityFromVencidas(n: number): { label: string; bg: string; text: string; dot: string } {
  if (n >= 3) return { label: '3+ / Prelegal', bg: 'bg-priority-purple/10', text: 'text-priority-purple', dot: 'bg-priority-purple' };
  if (n === 2) return { label: '2 parc. vencidas', bg: 'bg-danger-bg', text: 'text-danger', dot: 'bg-danger' };
  if (n === 1) return { label: '1 parc. vencida', bg: 'bg-warning-bg', text: 'text-warning', dot: 'bg-warning' };
  return { label: 'Al corriente', bg: 'bg-success-bg', text: 'text-success', dot: 'bg-success' };
}

export default function CobranzaExpediente() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const cuentaId = id ? parseInt(id) : null;
  const [activeTab, setActiveTab] = useState<TabId>('resumen');

  const { data, isLoading, error } = useExpedienteCobranza(cuentaId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground text-sm">Cargando expediente...</span>
      </div>
    );
  }

  if (error || !data?.cuenta) {
    return (
      <div className="flex items-center justify-center h-64">
        <AlertTriangle className="w-6 h-6 text-danger" />
        <span className="ml-2 text-danger text-sm">No se pudo cargar el expediente.</span>
      </div>
    );
  }

  const { cuenta, compradores, finanzas, parcialidades, pagos } = data;
  const priority = priorityFromVencidas(finanzas.parcialidades_vencidas);
  const progressPct = cuenta.precio_final > 0
    ? Math.min(100, Math.round((finanzas.total_pagado / cuenta.precio_final) * 100))
    : 0;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="sozu-page-title truncate">{cuenta.cliente_nombre || 'Sin cliente'}</h1>
            <span className={cn('sozu-chip', priority.bg, priority.text)}>
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', priority.dot)} />
              {priority.label}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground">
            <span className="font-mono">CC-{String(cuenta.id).padStart(6, '0')}</span>
            {cuenta.proyecto_nombre && <> · {cuenta.proyecto_nombre}</>}
            {cuenta.edificio && <> · {cuenta.edificio}</>}
            {cuenta.numero_propiedad && <> · {cuenta.numero_propiedad}</>}
            {cuenta.clabe_stp && <> · CLABE: <span className="font-mono">{cuenta.clabe_stp}</span></>}
          </p>
        </div>
      </div>

      {/* Risk banner */}
      {finanzas.parcialidades_vencidas > 0 && (
        <div className="sozu-kpi-card !p-4 border-l-4 border-l-danger flex items-center gap-4">
          <AlertTriangle className="w-5 h-5 text-danger shrink-0" strokeWidth={1.75} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Parc. vencidas</p>
              <p className="text-[20px] font-semibold text-danger">{finanzas.parcialidades_vencidas}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Monto vencido</p>
              <p className="text-[20px] font-semibold text-danger tabular-nums">{formatCurrency(finanzas.monto_vencido)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Saldo pendiente</p>
              <p className="text-[20px] font-semibold text-warning tabular-nums">{formatCurrency(finanzas.saldo_pendiente)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Próximo venc.</p>
              <p className="text-[14px] font-semibold text-foreground">{formatDate(finanzas.proximo_vencimiento)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium border-b-2 transition-colors duration-100 -mb-px whitespace-nowrap',
              activeTab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <t.icon className="w-3.5 h-3.5" strokeWidth={1.75} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="animate-fade-in">
        {activeTab === 'resumen' && (
          <ResumenTab
            cuenta={cuenta}
            compradores={compradores}
            finanzas={finanzas}
            progressPct={progressPct}
          />
        )}
        {activeTab === 'estado' && <EstadoCuentaTab parcialidades={parcialidades} pagos={pagos} />}
        {activeTab === 'calendario' && <CalendarioTab parcialidades={parcialidades} />}
        {activeTab === 'pagos' && <PagosTab pagos={pagos} />}
      </div>
    </div>
  );
}

// ─── Resumen ──────────────────────────────────────────────────────
function ResumenTab({
  cuenta, compradores, finanzas, progressPct,
}: {
  cuenta: NonNullable<ReturnType<typeof useExpedienteCobranza>['data']>['cuenta'];
  compradores: NonNullable<ReturnType<typeof useExpedienteCobranza>['data']>['compradores'];
  finanzas: NonNullable<ReturnType<typeof useExpedienteCobranza>['data']>['finanzas'];
  progressPct: number;
}) {
  if (!cuenta) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Cliente */}
      <div className="sozu-kpi-card space-y-3">
        <h3 className="sozu-section-title flex items-center gap-2">
          <User className="w-4 h-4 text-primary" strokeWidth={1.75} />Datos del Cliente
        </h3>
        <Field label="Nombre" value={cuenta.cliente_nombre || '—'} />
        <Field label="Tipo" value={cuenta.cliente_tipo || '—'} />
        <Field label="RFC" value={cuenta.cliente_rfc || '—'} mono />
        <Field label="Email" value={cuenta.cliente_email || '—'} icon={Mail} />
        <Field label="Teléfono" value={cuenta.cliente_telefono || '—'} icon={Phone} />
      </div>

      {/* Propiedad */}
      <div className="sozu-kpi-card space-y-3">
        <h3 className="sozu-section-title flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" strokeWidth={1.75} />Propiedad
        </h3>
        <Field label="Proyecto" value={cuenta.proyecto_nombre || '—'} />
        <Field label="Edificio" value={cuenta.edificio || '—'} />
        <Field label="Modelo" value={cuenta.modelo || '—'} />
        <Field label="No. Propiedad" value={cuenta.numero_propiedad || '—'} icon={Hash} />
        <Field label="Metraje" value={cuenta.metraje ? `${cuenta.metraje} m²` : '—'} />
        <Field label="Fecha compra" value={formatDate(cuenta.fecha_compra)} icon={Calendar} />
      </div>

      {/* Financiero */}
      <div className="sozu-kpi-card space-y-3">
        <h3 className="sozu-section-title flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary" strokeWidth={1.75} />Resumen Financiero
        </h3>
        <Field label="Precio final" value={formatCurrency(cuenta.precio_final)} />
        <Field label="Pagado" value={formatCurrency(finanzas.total_pagado)} highlight="success" />
        <Field label="Saldo pendiente" value={formatCurrency(finanzas.saldo_pendiente)} highlight="warning" />
        <Field
          label="Monto vencido"
          value={formatCurrency(finanzas.monto_vencido)}
          highlight={finanzas.monto_vencido > 0 ? 'danger' : undefined}
        />
        <Field
          label="Parcialidades"
          value={`${finanzas.parcialidades_pagadas} de ${finanzas.total_parcialidades}`}
        />
        <div className="pt-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span>Avance de pago</span>
            <span className="font-medium text-foreground">{progressPct}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Compradores */}
      {compradores.length > 0 && (
        <div className="sozu-kpi-card lg:col-span-3 space-y-3">
          <h3 className="sozu-section-title flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" strokeWidth={1.75} />
            Compradores ({compradores.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {compradores.map((c, i) => (
              <div key={i} className="p-3 rounded-lg border border-border-light bg-background">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-semibold text-foreground truncate">{c.nombre_legal}</span>
                  {c.porcentaje_copropiedad != null && (
                    <span className="sozu-chip bg-primary/10 text-primary text-[10px]">
                      {c.porcentaje_copropiedad}%
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  {c.rfc && <div className="font-mono">{c.rfc}</div>}
                  {c.email && <div className="truncate">{c.email}</div>}
                  {c.telefono && <div>{c.telefono}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, mono, icon: Icon, highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ElementType;
  highlight?: 'success' | 'danger' | 'warning';
}) {
  const colorClass =
    highlight === 'success' ? 'text-success' :
    highlight === 'danger' ? 'text-danger' :
    highlight === 'warning' ? 'text-warning' : 'text-foreground';
  return (
    <div className="flex items-start justify-between gap-3 text-[13px]">
      <span className="text-muted-foreground flex items-center gap-1.5 shrink-0">
        {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />}
        {label}
      </span>
      <span className={cn('text-right tabular-nums truncate', mono && 'font-mono', colorClass, highlight && 'font-semibold')}>
        {value}
      </span>
    </div>
  );
}

// ─── Estado de Cuenta ─────────────────────────────────────────────
function EstadoCuentaTab({
  parcialidades, pagos,
}: {
  parcialidades: NonNullable<ReturnType<typeof useExpedienteCobranza>['data']>['parcialidades'];
  pagos: NonNullable<ReturnType<typeof useExpedienteCobranza>['data']>['pagos'];
}) {
  // Build movement timeline: each acuerdo (cargo) and pago (abono) sorted by date
  type Mov = { date: string; type: 'cargo' | 'pago'; concept: string; amount: number; ref?: string | null };
  const movs: Mov[] = [];
  parcialidades.forEach(p => {
    if (p.fecha_pago) {
      movs.push({
        date: p.fecha_pago,
        type: 'cargo',
        concept: `Parc. ${p.orden} · ${p.concepto || 'Acuerdo'}`,
        amount: Number(p.monto),
      });
    }
  });
  pagos.forEach(p => {
    movs.push({
      date: p.fecha_pago,
      type: 'pago',
      concept: p.descripcion || p.metodo || 'Pago recibido',
      amount: Number(p.monto),
      ref: p.clave_rastreo,
    });
  });
  movs.sort((a, b) => a.date.localeCompare(b.date));

  let saldo = 0;
  const rows = movs.map(m => {
    saldo += m.type === 'cargo' ? m.amount : -m.amount;
    return { ...m, saldo };
  });

  return (
    <div className="sozu-kpi-card !p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="sozu-section-title">Movimientos Financieros</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sozu-thead">
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Concepto</th>
              <th>Referencia</th>
              <th className="text-left">Monto</th>
              <th className="text-left">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="h-[64px]">
                <td colSpan={6} className="text-center text-[13px] text-muted-foreground">
                  Sin movimientos registrados.
                </td>
              </tr>
            ) : rows.map((m, i) => (
              <tr key={i} className="border-b border-border-light hover:bg-primary-muted/50 h-[44px]">
                <td className="px-4 text-[13px] text-muted-foreground tabular-nums">{formatDate(m.date)}</td>
                <td className="px-4">
                  <span className={cn('sozu-chip', m.type === 'cargo' ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success')}>
                    {m.type}
                  </span>
                </td>
                <td className="px-4 text-[13px] text-foreground">{m.concept}</td>
                <td className="px-4 font-mono text-[11px] text-muted-foreground">{m.ref || '—'}</td>
                <td className={cn('px-4 text-left text-[13px] font-semibold tabular-nums', m.type === 'pago' ? 'text-success' : 'text-foreground')}>
                  {m.type === 'pago' ? '-' : ''}{formatCurrency(Math.abs(m.amount))}
                </td>
                <td className="px-4 text-left text-[13px] text-foreground tabular-nums">{formatCurrency(m.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Calendario ───────────────────────────────────────────────────
function CalendarioTab({
  parcialidades,
}: {
  parcialidades: NonNullable<ReturnType<typeof useExpedienteCobranza>['data']>['parcialidades'];
}) {
  const hoy = new Date();
  return (
    <div className="sozu-kpi-card !p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="sozu-section-title">Calendario de Parcialidades ({parcialidades.length})</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sozu-thead">
            <tr>
              <th className="text-center">#</th>
              <th>Concepto</th>
              <th>Vencimiento</th>
              <th className="text-left">Monto</th>
              <th className="text-left">Aplicado</th>
              <th className="text-left">Pendiente</th>
              <th className="text-center">Estatus</th>
              <th className="text-center">Días atraso</th>
            </tr>
          </thead>
          <tbody>
            {parcialidades.length === 0 ? (
              <tr className="h-[64px]">
                <td colSpan={8} className="text-center text-[13px] text-muted-foreground">
                  Sin parcialidades.
                </td>
              </tr>
            ) : parcialidades.map(p => {
              const pendiente = Math.max(Number(p.monto) - Number(p.aplicado), 0);
              const fecha = p.fecha_pago ? parseISO(p.fecha_pago) : null;
              const vencido = !p.pago_completado && fecha && fecha < hoy;
              const diasAtraso = vencido && fecha ? differenceInDays(hoy, fecha) : 0;
              return (
                <tr key={p.id} className={cn('border-b border-border-light h-[44px]', vencido && 'bg-danger-bg/30')}>
                  <td className="px-4 text-center text-[13px] text-muted-foreground">{p.orden}</td>
                  <td className="px-4 text-[13px] text-foreground truncate max-w-[200px]">{p.concepto || '—'}</td>
                  <td className="px-4 text-[13px] text-foreground tabular-nums">{formatDate(p.fecha_pago)}</td>
                  <td className="px-4 text-left text-[13px] font-medium text-foreground tabular-nums">{formatCurrency(Number(p.monto))}</td>
                  <td className="px-4 text-left text-[13px] text-success tabular-nums">{formatCurrency(Number(p.aplicado))}</td>
                  <td className={cn('px-4 text-left text-[13px] tabular-nums', pendiente > 0 ? 'text-warning font-medium' : 'text-muted-foreground')}>
                    {formatCurrency(pendiente)}
                  </td>
                  <td className="px-4 text-center">
                    {p.pago_completado ? (
                      <span className="sozu-chip bg-success-bg text-success">
                        <CheckCircle2 className="w-3 h-3" strokeWidth={1.75} />Pagado
                      </span>
                    ) : vencido ? (
                      <span className="sozu-chip bg-danger-bg text-danger">
                        <AlertTriangle className="w-3 h-3" strokeWidth={1.75} />Vencido
                      </span>
                    ) : (
                      <span className="sozu-chip bg-muted text-muted-foreground">
                        <Clock className="w-3 h-3" strokeWidth={1.75} />Pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-4 text-center">
                    {diasAtraso > 0 ? (
                      <span className="text-[13px] text-danger font-semibold">{diasAtraso}d</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Pagos ────────────────────────────────────────────────────────
function PagosTab({
  pagos,
}: {
  pagos: NonNullable<ReturnType<typeof useExpedienteCobranza>['data']>['pagos'];
}) {
  return (
    <div className="sozu-kpi-card !p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="sozu-section-title">Pagos Recibidos ({pagos.length})</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sozu-thead">
            <tr>
              <th>Fecha</th>
              <th className="text-left">Monto</th>
              <th>Método</th>
              <th>Referencia</th>
              <th>Descripción</th>
              <th className="text-center">CEP</th>
              <th className="text-center">Recibo</th>
            </tr>
          </thead>
          <tbody>
            {pagos.length === 0 ? (
              <tr className="h-[64px]">
                <td colSpan={7} className="text-center text-[13px] text-muted-foreground">
                  Sin pagos registrados.
                </td>
              </tr>
            ) : pagos.map(p => (
              <tr key={p.id} className="border-b border-border-light hover:bg-primary-muted/50 h-[44px]">
                <td className="px-4 text-[13px] text-muted-foreground tabular-nums">{formatDate(p.fecha_pago)}</td>
                <td className="px-4 text-left text-[13px] font-semibold text-success tabular-nums">{formatCurrency(Number(p.monto))}</td>
                <td className="px-4 text-[13px] text-foreground">{p.metodo || '—'}</td>
                <td className="px-4 font-mono text-[11px] text-muted-foreground">{p.clave_rastreo || '—'}</td>
                <td className="px-4 text-[13px] text-muted-foreground truncate max-w-[280px]">{p.descripcion || '—'}</td>
                <td className="px-4 text-center">
                  {p.url_cep ? (
                    <a href={p.url_cep} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-[12px]">Ver</a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 text-center">
                  {p.url_recibo ? (
                    <a href={p.url_recibo} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-[12px]">Ver</a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
