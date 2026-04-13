import type { Account, KPIData, WeeklyFlowData, PLDStatus, LegalStatus, LegalEntity, ChargeType } from '@/types/cobranza';

export const projects = [
  { id: 'p1', name: 'Margot', location: 'Zapopan, Jalisco', totalUnits: 64 },
  { id: 'p2', name: 'Bottura', location: 'Zapopan, Jalisco', totalUnits: 85 },
  { id: 'p3', name: 'Daiku', location: 'Guadalajara, Jalisco', totalUnits: 120 },
  { id: 'p4', name: 'Monócolo', location: 'Guadalajara, Jalisco', totalUnits: 48 },
];

export const executives = ['Luz Ochoa', 'Tomás Peterson'];

export const mockLegalEntities: LegalEntity[] = [
  { id: 'le-1', name: 'Tallwood', rfc: 'TWD201015AB1' },
  { id: 'le-2', name: 'Real Estate Ventures', rfc: 'REV190820CD3' },
  { id: 'le-3', name: 'Komakai', rfc: 'KOM210312EF5' },
  { id: 'le-4', name: 'Corporativo Jmdq', rfc: 'CJM180605GH7' },
  { id: 'le-5', name: 'Hevi Holding', rfc: 'HHO190420MN4' },
  { id: 'le-6', name: 'DZOG CAPITAL', rfc: 'DZC220115KL2' },
];

const projectLegalEntities: Record<string, string[]> = {
  p1: ['le-1', 'le-6'], p2: ['le-3', 'le-4', 'le-5'],
  p3: ['le-1', 'le-2'], p4: ['le-2', 'le-3', 'le-6'],
};

const clientNames = [
  'Roberto García López', 'María Fernanda Herrera Solís', 'Juan Pablo Martínez Ríos',
  'Andrea Sánchez Vega', 'Luis Alberto Domínguez Torres', 'Gabriela Torres Ruiz',
  'Fernando Castillo Núñez', 'Patricia Morales Díaz', 'Alejandro Reyes Soto',
  'Carolina Jiménez Flores', 'Miguel Ángel Vargas Leal', 'Daniela Rojas Medina',
  'Ricardo Peña Aguilar', 'Valeria Ortiz Campos', 'Héctor Navarro Gil',
  'Mariana Espinoza León', 'Jorge Eduardo Ríos Bravo', 'Claudia Delgado Paz',
  'Sergio Ibarra Coronado', 'Ana Lucía Montoya Reyes', 'Pablo Guerrero Silva',
  'Natalia Cruz Estrada', 'Raúl Figueroa Bravo', 'Isabela Paredes Ramos',
  'Óscar Villalobos Cano', 'Renata Salazar Duarte', 'Ernesto Leal Ochoa',
  'Camila Contreras Vera', 'Tomás Acosta Galindo', 'Lucía Medrano Solís',
  'Diego Armando Fuentes', 'Sofía Rangel Montes', 'Eduardo Cervantes Parra',
  'Regina Mendoza Ávila', 'Arturo Bernal Castro', 'Ximena Rosas Valdez',
  'Guillermo Tapia Serrano', 'Lorena Estrada Quintero', 'Iván Sandoval Peña',
  'Paulina Aguirre Trejo', 'Rafael Cisneros Luna', 'Martha Guzmán Orozco',
  'Emilio Zavala Rincón', 'Adriana Camacho Solano', 'Francisco Javier Mora',
  'Paola Noriega Beltrán', 'Alberto Mejía Sepúlveda', 'Verónica Padilla Lara',
  'Enrique Cárdenas Huerta', 'Mónica Villegas Romero',
];

const models = ['Studio', 'Loft', 'Suite', 'Penthouse', 'Garden', 'Sky', 'Flat', 'Junior'];
const buildings = ['Torre A', 'Torre B', 'Torre C', 'Torre Norte', 'Torre Sur', 'Torre Poniente'];
const chargeTypes: ChargeType[] = ['propiedad', 'propiedad', 'propiedad', 'propiedad', 'estacionamiento', 'bodega', 'propiedad', 'paquete_muebles', 'propiedad', 'condensadora', 'propiedad', 'servicios', 'propiedad', 'estacionamiento', 'propiedad', 'servicios', 'propiedad', 'bodega', 'propiedad', 'paquete_muebles'];

function randomDate(start: string, end: string): string {
  const s = new Date(start).getTime(); const e = new Date(end).getTime();
  return new Date(s + Math.random() * (e - s)).toISOString().split('T')[0];
}

function generateAccounts(): Account[] {
  const count = 50;
  const overduePattern = [0,0,0,0,0,1,0,0,0,0, 1,2,0,0,0,0,0,1,3,0, 0,0,2,0,0,0,1,0,0,0, 0,0,0,0,1,0,0,2,0,0, 0,0,0,3,0,0,0,0,1,0];
  const paymentDays = [5, 10, 15, 20, 25, 28];

  return Array.from({ length: count }, (_, i) => {
    const proj = projects[i % 4];
    const ct = chargeTypes[i % chargeTypes.length];
    const overdueInstallments = overduePattern[i] || 0;
    const prices: Record<ChargeType, number[]> = {
      propiedad: [2850000, 3200000, 3750000, 4100000],
      estacionamiento: [280000, 350000], bodega: [180000, 220000],
      paquete_muebles: [150000, 195000], condensadora: [85000, 110000],
      servicios: [35000, 48000],
    };
    const totalPrice = prices[ct][i % prices[ct].length];
    const totalInstallments = ct === 'propiedad' ? [36, 48, 60][i % 3] : [12, 18][i % 2];
    const currentInstallment = Math.min(Math.floor(totalInstallments * 0.4) + (i % 8), totalInstallments);
    const paidAmount = Math.round(totalPrice * (currentInstallment - overdueInstallments) / totalInstallments);
    const overdueAmount = overdueInstallments * Math.round(totalPrice / totalInstallments);
    const conciliationPending = i === 4 || i === 23;
    const docIncomplete = i === 7 || i === 31;

    let status: Account['status']; let priority: Account['priority'];
    if (overdueInstallments >= 3) { status = 'vencida_3_plus'; priority = 'purple'; }
    else if (overdueInstallments === 2) { status = 'vencida_2'; priority = 'red'; }
    else if (overdueInstallments === 1) { status = 'vencida_1'; priority = 'yellow'; }
    else if (conciliationPending) { status = 'conciliacion'; priority = 'blue'; }
    else if (docIncomplete) { status = 'doc_incompleta'; priority = 'gray'; }
    else { status = 'al_corriente'; priority = 'green'; }

    const actions: Record<string, string> = { green: 'Sin acción requerida', yellow: 'Enviar recordatorio', red: 'Llamada urgente', purple: 'Escalar a prelegal', blue: 'Revisar conciliación', gray: 'Solicitar documentación' };
    const exec = executives[i % 2];
    let pldStatus: PLDStatus = 'validado';
    if (i === 18) pldStatus = 'pendiente_revision'; if (i === 43) pldStatus = 'alerta_terceros';
    let legalStatus: LegalStatus = 'sin_accion';
    if (i === 18) legalStatus = 'prelegal'; if (i === 43) legalStatus = 'notificacion_preparacion';

    const projLEs = projectLegalEntities[proj.id];
    const legalEntity = mockLegalEntities.find(le => le.id === projLEs[i % projLEs.length])!;
    const name = clientNames[i % clientNames.length];

    return {
      id: `ACC-${String(i + 1).padStart(4, '0')}`,
      accountId: `CC-${String(1700 + i).padStart(6, '0')}`,
      accountNumber: `SOZU-${proj.name.substring(0, 3).toUpperCase()}-${String(i + 1).padStart(4, '0')}`,
      clabe: `6461802874001${String(10000 + i * 37).padStart(5, '0')}`,
      clientId: `cli-${i + 1}`, client: { id: `cli-${i + 1}`, name, email: `${name.split(' ')[0].toLowerCase()}.${(name.split(' ')[1] || '').toLowerCase()}@gmail.com`, phone: `+52 33 ${1000 + (i * 73) % 9000} ${1000 + (i * 41) % 9000}` },
      projectId: proj.id, project: proj, building: buildings[i % buildings.length],
      unitNumber: ct === 'propiedad' ? `${Math.floor(i / 6) + 1}${String.fromCharCode(65 + (i % 6))}${String(101 + i).substring(0, 2)}` : `P-${String(i + 1).padStart(3, '0')}`,
      model: ct === 'propiedad' ? models[i % models.length] : '', totalPrice, paidAmount,
      balance: totalPrice - paidAmount, overdueAmount, paymentDay: paymentDays[i % paymentDays.length],
      currentInstallment, totalInstallments, overdueInstallments,
      lastPaymentDate: overdueInstallments > 0 ? randomDate('2025-10-01', '2026-01-15') : randomDate('2026-02-15', '2026-03-28'),
      nextDueDate: randomDate('2026-03-28', '2026-04-30'), status, priority,
      assignedExecutive: exec, legalEntity, chargeType: ct,
      documentationComplete: !docIncomplete, conciliationPending,
      fullyReconciled: !conciliationPending && overdueInstallments === 0 && i % 5 !== 3,
      activePromise: (overdueInstallments >= 1 && i % 3 === 0) ? {
        id: `prom-${i}`, accountId: `ACC-${String(i + 1).padStart(4, '0')}`,
        promiseDate: randomDate('2026-03-28', '2026-04-15'),
        amount: Math.round(totalPrice / totalInstallments),
        channel: (['llamada', 'whatsapp', 'email'] as const)[i % 3],
        notes: 'Cliente se compromete a pagar antes de la fecha indicada',
        registeredBy: exec, status: 'activa', createdAt: randomDate('2026-03-15', '2026-03-28'),
      } : null,
      suggestedAction: actions[priority],
      separationDate: randomDate('2024-01-01', '2024-12-31'),
      contractDate: randomDate('2024-02-01', '2025-01-31'),
      estimatedDelivery: randomDate('2026-06-01', '2027-12-31'),
      pldStatus, legalStatus,
    };
  });
}

export const mockAccounts = generateAccounts();

export const mockWeeklyFlow: WeeklyFlowData[] = [
  { week: 9, range: '24 Feb – 28 Feb', projected: 1200000, collected: 1350000, obraProvision: 980000, difference: 150000, deficit: 0, status: 'ok' },
  { week: 10, range: '03 Mar – 07 Mar', projected: 1100000, collected: 980000, obraProvision: 1050000, difference: -120000, deficit: 70000, status: 'atencion' },
  { week: 11, range: '10 Mar – 14 Mar', projected: 1350000, collected: 1100000, obraProvision: 1200000, difference: -250000, deficit: 100000, status: 'alto' },
  { week: 12, range: '17 Mar – 21 Mar', projected: 1250000, collected: 850000, obraProvision: 1150000, difference: -400000, deficit: 300000, status: 'critico' },
  { week: 13, range: '24 Mar – 28 Mar', projected: 1400000, collected: 1250000, obraProvision: 1100000, difference: -150000, deficit: 0, status: 'atencion' },
  { week: 14, range: '31 Mar – 04 Abr', projected: 1300000, collected: 0, obraProvision: 1050000, difference: -1300000, deficit: 1050000, status: 'critico' },
];

export const mockFinancialMetrics = {
  collectedMonth: 6480000, collectedYTD: 22650000, toCollectMonth: 4850000,
  overdueBalance: 12750000, recoveryRate: 81.2, collectedVsTarget: 89.5,
  scheduledMonth: 7200000,
  collectedByProject: [
    { project: 'Margot', collected: 6200000, toCollect: 9800000, overdue: 3200000 },
    { project: 'Bottura', collected: 7850000, toCollect: 11350000, overdue: 3800000 },
    { project: 'Daiku', collected: 8500000, toCollect: 12050000, overdue: 3550000 },
    { project: 'Monócolo', collected: 4100000, toCollect: 5000000, overdue: 2200000 },
  ],
  collectedByMonth: [
    { month: 'Oct 2025', collected: 5200000, target: 6000000, overdue: 3100000 },
    { month: 'Nov 2025', collected: 5800000, target: 6000000, overdue: 3400000 },
    { month: 'Dic 2025', collected: 4900000, target: 6000000, overdue: 3900000 },
    { month: 'Ene 2026', collected: 6500000, target: 6500000, overdue: 3500000 },
    { month: 'Feb 2026', collected: 6100000, target: 6500000, overdue: 3200000 },
    { month: 'Mar 2026', collected: 6480000, target: 7200000, overdue: 2800000 },
  ],
};

export const mockKPIs: KPIData = {
  totalPortfolio: 146700000, currentPortfolio: 108500000, overduePortfolio: 38200000,
  overdueByProject: [
    { project: 'Margot', amount: 9800000 }, { project: 'Bottura', amount: 11350000 },
    { project: 'Daiku', amount: 12050000 }, { project: 'Monócolo', amount: 5000000 },
  ],
  accounts1Overdue: mockAccounts.filter(a => a.overdueInstallments === 1).length,
  accounts2Overdue: mockAccounts.filter(a => a.overdueInstallments === 2).length,
  accounts3PlusOverdue: mockAccounts.filter(a => a.overdueInstallments >= 3).length,
  activePromises: mockAccounts.filter(a => a.activePromise).length,
  brokenPromises: 4, paymentsToday: 5, pendingConciliation: 3,
  incompleteDocumentation: 3, legalCases: 2, monthlyRecovery: 6480000,
  agingData: [
    { range: '1-30 días', amount: 12500000, count: 12 }, { range: '31-60 días', amount: 9200000, count: 7 },
    { range: '61-90 días', amount: 8100000, count: 5 }, { range: '90+ días', amount: 8400000, count: 4 },
  ],
  upcomingDue7: 12, upcomingDue15: 22, upcomingDue30: 38,
};

export interface AutomationRule {
  id: string; name: string; trigger: string; action: string; channel: string;
  active: boolean; lastRun: string | null; runsThisMonth: number;
}

export const mockAutomationRules: AutomationRule[] = [
  { id: 'auto-1', name: 'Recordatorio día 5', trigger: 'Día de pago = 5, 5 días antes', action: 'Enviar recordatorio', channel: 'WhatsApp + Email', active: true, lastRun: '2026-03-01', runsThisMonth: 14 },
  { id: 'auto-2', name: 'Recordatorio día 15', trigger: 'Día de pago = 15, 5 días antes', action: 'Enviar recordatorio', channel: 'WhatsApp + Email', active: true, lastRun: '2026-03-10', runsThisMonth: 11 },
  { id: 'auto-3', name: '1 parcialidad vencida', trigger: '1 parcialidad vencida detectada', action: 'Notificación automática', channel: 'Email + Sistema', active: true, lastRun: '2026-03-26', runsThisMonth: 8 },
  { id: 'auto-4', name: '2 parcialidades vencidas', trigger: '2 parcialidades vencidas', action: 'Prioridad alta + sugerir llamada', channel: 'Email + WhatsApp', active: true, lastRun: '2026-03-25', runsThisMonth: 4 },
  { id: 'auto-5', name: '3+ vencidas → Prelegal', trigger: '3+ parcialidades vencidas', action: 'Prelegal + notificación formal', channel: 'Email + Legal', active: true, lastRun: '2026-03-20', runsThisMonth: 3 },
  { id: 'auto-6', name: 'Promesa por vencer', trigger: 'Promesa a 2 días de vencer', action: 'Recordatorio', channel: 'WhatsApp', active: true, lastRun: '2026-03-26', runsThisMonth: 9 },
];
