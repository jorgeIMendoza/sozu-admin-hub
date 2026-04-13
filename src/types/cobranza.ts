export type PriorityLevel = 'green' | 'yellow' | 'red' | 'purple' | 'blue' | 'gray';

export interface LegalEntity {
  id: string;
  name: string;
  rfc?: string;
}

export type ChargeType = 'propiedad' | 'bodega' | 'paquete_muebles' | 'condensadora' | 'estacionamiento' | 'servicios';

export const chargeTypeLabels: Record<ChargeType, string> = {
  propiedad: 'Propiedad', bodega: 'Bodega', paquete_muebles: 'Paq. muebles',
  condensadora: 'Condensadora', estacionamiento: 'Estacionamiento', servicios: 'Servicios',
};

export const chargeTypeColors: Record<ChargeType, { bg: string; text: string }> = {
  propiedad: { bg: 'bg-primary/10', text: 'text-primary' },
  bodega: { bg: 'bg-info/10', text: 'text-info' },
  paquete_muebles: { bg: 'bg-warning/10', text: 'text-warning' },
  condensadora: { bg: 'bg-priority-purple/10', text: 'text-priority-purple' },
  estacionamiento: { bg: 'bg-success/10', text: 'text-success' },
  servicios: { bg: 'bg-muted', text: 'text-muted-foreground' },
};

export type AccountStatus = 'al_corriente' | 'vencida_1' | 'vencida_2' | 'vencida_3_plus' | 'prelegal' | 'legal' | 'conciliacion' | 'doc_incompleta';
export type PaymentStatus = 'pagado' | 'pendiente' | 'vencido' | 'parcial';
export type DocumentStatus = 'pendiente' | 'recibido' | 'validado' | 'rechazado';
export type PromiseStatus = 'activa' | 'cumplida' | 'vencida' | 'cancelada' | 'propuesta' | 'pendiente_confirmacion' | 'enviada_revision' | 'rechazada';
export type IncidentStatus = 'abierta' | 'en_revision' | 'resuelta' | 'rechazada';
export type CommunicationChannel = 'email' | 'whatsapp' | 'llamada' | 'nota_interna';
export type PLDStatus = 'validado' | 'pendiente_revision' | 'alerta_terceros' | 'evidencia_inconsistente' | 'bloqueado_pld' | 'liberado_pld';
export type LegalStatus = 'sin_accion' | 'prelegal' | 'notificacion_preparacion' | 'vobo_juridico_pendiente' | 'enviada_notario' | 'programada_entrega' | 'entregada' | 'no_entregada' | 'reprogramada' | 'en_negociacion' | 'convenio_terminacion' | 'demanda_preparada' | 'demanda_presentada' | 'en_juicio' | 'sentencia' | 'rescindida' | 'liberada_comercialmente';

export interface Project { id: string; name: string; location: string; totalUnits: number; }
export interface Client { id: string; name: string; email: string; phone: string; rfc?: string; }

export interface Account {
  id: string; accountId: string; accountNumber: string; clabe: string;
  clientId: string; client: Client; projectId: string; project: Project;
  building: string; unitNumber: string; model: string;
  totalPrice: number; paidAmount: number; balance: number; overdueAmount: number;
  paymentDay: number; currentInstallment: number; totalInstallments: number; overdueInstallments: number;
  lastPaymentDate: string | null; nextDueDate: string;
  status: AccountStatus; priority: PriorityLevel;
  assignedExecutive: string; legalEntity: LegalEntity; chargeType: ChargeType;
  documentationComplete: boolean; conciliationPending: boolean; fullyReconciled: boolean;
  activePromise: PaymentPromise | null;
  suggestedAction: string;
  separationDate: string; contractDate: string; estimatedDelivery: string;
  pldStatus: PLDStatus; legalStatus: LegalStatus;
}

export interface PaymentPromise {
  id: string; accountId: string; promiseDate: string; amount: number;
  channel: CommunicationChannel; notes: string; registeredBy: string;
  status: PromiseStatus; createdAt: string;
}

export interface WeeklyFlowData {
  week: number; range: string; projected: number; collected: number;
  obraProvision: number; difference: number; deficit: number;
  status: 'ok' | 'atencion' | 'alto' | 'critico';
}

export interface KPIData {
  totalPortfolio: number; currentPortfolio: number; overduePortfolio: number;
  overdueByProject: { project: string; amount: number }[];
  accounts1Overdue: number; accounts2Overdue: number; accounts3PlusOverdue: number;
  activePromises: number; brokenPromises: number;
  paymentsToday: number; pendingConciliation: number;
  incompleteDocumentation: number; legalCases: number; monthlyRecovery: number;
  agingData: { range: string; amount: number; count: number }[];
  upcomingDue7: number; upcomingDue15: number; upcomingDue30: number;
}
