import { cn } from '@/lib/utils';
import type { PriorityLevel, AccountStatus, DocumentStatus, PromiseStatus, IncidentStatus, CommunicationChannel } from '@/types/cobranza';
import { Mail, Phone, MessageSquare, StickyNote } from 'lucide-react';

const priorityConfig: Record<PriorityLevel, { label: string; bg: string; text: string; dot: string }> = {
  green: { label: 'Al corriente', bg: 'bg-success-bg', text: 'text-success', dot: 'bg-success' },
  yellow: { label: '1 parc. vencida', bg: 'bg-warning-bg', text: 'text-warning', dot: 'bg-warning' },
  red: { label: '2 parc. vencidas', bg: 'bg-danger-bg', text: 'text-danger', dot: 'bg-danger' },
  purple: { label: '3+ / Prelegal', bg: 'bg-priority-purple/10', text: 'text-priority-purple', dot: 'bg-priority-purple' },
  blue: { label: 'Conciliación', bg: 'bg-info-bg', text: 'text-info', dot: 'bg-info' },
  gray: { label: 'Doc. incompleta', bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
};

export function PriorityBadge({ priority, compact }: { priority: PriorityLevel; compact?: boolean }) {
  const config = priorityConfig[priority];
  return (
    <span className={cn('sozu-chip', config.bg, config.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dot)} />
      {!compact && config.label}
    </span>
  );
}

const statusLabels: Record<AccountStatus, string> = {
  al_corriente: 'Al corriente',
  vencida_1: '1 parc. vencida',
  vencida_2: '2 parc. vencidas',
  vencida_3_plus: '3+ parc. vencidas',
  prelegal: 'Prelegal',
  legal: 'Legal',
  conciliacion: 'Conciliación',
  doc_incompleta: 'Doc. incompleta',
};

export function StatusChip({ status }: { status: AccountStatus }) {
  return <span className="sozu-chip bg-muted text-muted-foreground">{statusLabels[status]}</span>;
}

const docStatusConfig: Record<DocumentStatus, { label: string; bg: string; text: string }> = {
  pendiente: { label: 'Pendiente', bg: 'bg-warning-bg', text: 'text-warning' },
  recibido: { label: 'Recibido', bg: 'bg-info-bg', text: 'text-info' },
  validado: { label: 'Validado', bg: 'bg-success-bg', text: 'text-success' },
  rechazado: { label: 'Rechazado', bg: 'bg-danger-bg', text: 'text-danger' },
};

export function DocStatusBadge({ status }: { status: DocumentStatus }) {
  const config = docStatusConfig[status];
  return <span className={cn('sozu-chip', config.bg, config.text)}>{config.label}</span>;
}

const promiseStatusConfig: Record<PromiseStatus, { label: string; bg: string; text: string }> = {
  activa: { label: 'Activa', bg: 'bg-info-bg', text: 'text-info' },
  cumplida: { label: 'Cumplida', bg: 'bg-success-bg', text: 'text-success' },
  vencida: { label: 'Vencida', bg: 'bg-danger-bg', text: 'text-danger' },
  cancelada: { label: 'Cancelada', bg: 'bg-muted', text: 'text-muted-foreground' },
  propuesta: { label: 'Propuesta', bg: 'bg-info-bg', text: 'text-info' },
  pendiente_confirmacion: { label: 'Pend. confirmación', bg: 'bg-warning-bg', text: 'text-warning' },
  enviada_revision: { label: 'En revisión', bg: 'bg-warning-bg', text: 'text-warning' },
  rechazada: { label: 'Rechazada', bg: 'bg-danger-bg', text: 'text-danger' },
};

export function PromiseStatusBadge({ status }: { status: PromiseStatus }) {
  const config = promiseStatusConfig[status];
  return <span className={cn('sozu-chip', config.bg, config.text)}>{config.label}</span>;
}

const channelConfig: Record<CommunicationChannel, { label: string; icon: typeof Mail }> = {
  email: { label: 'Email', icon: Mail },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare },
  llamada: { label: 'Llamada', icon: Phone },
  nota_interna: { label: 'Nota interna', icon: StickyNote },
};

export function ChannelBadge({ channel }: { channel: CommunicationChannel }) {
  const config = channelConfig[channel];
  const Icon = config.icon;
  return (
    <span className="sozu-chip bg-muted text-muted-foreground">
      <Icon className="w-3 h-3" strokeWidth={1.75} />
      {config.label}
    </span>
  );
}

const incidentStatusConfig: Record<IncidentStatus, { label: string; bg: string; text: string }> = {
  abierta: { label: 'Abierta', bg: 'bg-danger-bg', text: 'text-danger' },
  en_revision: { label: 'En revisión', bg: 'bg-warning-bg', text: 'text-warning' },
  resuelta: { label: 'Resuelta', bg: 'bg-success-bg', text: 'text-success' },
  rechazada: { label: 'Rechazada', bg: 'bg-muted', text: 'text-muted-foreground' },
};

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const config = incidentStatusConfig[status];
  return <span className={cn('sozu-chip', config.bg, config.text)}>{config.label}</span>;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  try {
    const d = new Date(date.length === 10 ? date + 'T12:00:00' : date);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  } catch {
    return '—';
  }
}
