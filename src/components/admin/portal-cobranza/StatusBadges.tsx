import { cn } from '@/lib/utils';
import type { PriorityLevel, DocumentStatus, PromiseStatus, CommunicationChannel } from '@/types/cobranza';
import { Mail, Phone, MessageSquare, StickyNote } from 'lucide-react';

const priorityConfig: Record<PriorityLevel, { label: string; bg: string; text: string; dot: string }> = {
  green: { label: 'Al corriente', bg: 'bg-success-bg', text: 'text-success', dot: 'bg-success' },
  yellow: { label: '1 parc. vencida', bg: 'bg-warning-bg', text: 'text-warning', dot: 'bg-warning' },
  red: { label: '2 parc. vencidas', bg: 'bg-danger-bg', text: 'text-danger', dot: 'bg-danger' },
  purple: { label: '3+ / Prelegal', bg: 'bg-priority-purple/10', text: 'text-priority-purple', dot: 'bg-priority-purple' },
  blue: { label: 'Conciliación', bg: 'bg-info-bg', text: 'text-info', dot: 'bg-info' },
  gray: { label: 'Doc. incompleta', bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
};

export function PriorityBadge({ priority }: { priority: PriorityLevel }) {
  const config = priorityConfig[priority];
  return (
    <span className={cn('sozu-chip', config.bg, config.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', config.dot)} />
      {config.label}
    </span>
  );
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

export function DocStatusBadge({ status }: { status: DocumentStatus }) {
  const config: Record<DocumentStatus, { label: string; bg: string; text: string }> = {
    pendiente: { label: 'Pendiente', bg: 'bg-warning-bg', text: 'text-warning' },
    recibido: { label: 'Recibido', bg: 'bg-info-bg', text: 'text-info' },
    validado: { label: 'Validado', bg: 'bg-success-bg', text: 'text-success' },
    rechazado: { label: 'Rechazado', bg: 'bg-danger-bg', text: 'text-danger' },
  };
  const c = config[status];
  return <span className={cn('sozu-chip', c.bg, c.text)}>{c.label}</span>;
}

export function ChannelBadge({ channel }: { channel: CommunicationChannel }) {
  const config: Record<CommunicationChannel, { label: string; icon: typeof Mail }> = {
    email: { label: 'Email', icon: Mail }, whatsapp: { label: 'WhatsApp', icon: MessageSquare },
    llamada: { label: 'Llamada', icon: Phone }, nota_interna: { label: 'Nota interna', icon: StickyNote },
  };
  const c = config[channel];
  const Icon = c.icon;
  return <span className="sozu-chip bg-muted text-muted-foreground"><Icon className="w-3 h-3" strokeWidth={1.75} />{c.label}</span>;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount).replace('$', '\\$');
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  try {
    const d = new Date(date.length === 10 ? date + 'T12:00:00' : date);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  } catch { return '—'; }
}
