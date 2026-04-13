export interface ObraProject {
  id: string; project: string; presupuesto: number; erogado: number; porErogar: number;
  avanceFisico: number; avanceFinanciero: number; provisionSemanal: number;
  fechaCorte: string; observaciones: string; cobradoAcumulado: number;
  porCobrar: number; vencido: number; flujoRequeridoProximo: number;
}

export type ObraStatus = 'alineado' | 'atencion' | 'desfasado' | 'critico';

export function getObraStatus(fisico: number, financiero: number): ObraStatus {
  const gap = Math.abs(fisico - financiero);
  if (gap <= 3) return 'alineado'; if (gap <= 8) return 'atencion';
  if (gap <= 15) return 'desfasado'; return 'critico';
}

export const obraStatusConfig: Record<ObraStatus, { label: string; bg: string; text: string }> = {
  alineado: { label: 'Alineado', bg: 'bg-success-bg', text: 'text-success' },
  atencion: { label: 'Atención', bg: 'bg-warning-bg', text: 'text-warning' },
  desfasado: { label: 'Desfasado', bg: 'bg-danger-bg', text: 'text-danger' },
  critico: { label: 'Crítico', bg: 'bg-priority-purple/10', text: 'text-priority-purple' },
};

export const mockObraProjects: ObraProject[] = [
  { id: 'obra-1', project: 'Margot', presupuesto: 78500000, erogado: 42300000, porErogar: 36200000, avanceFisico: 58, avanceFinanciero: 54, provisionSemanal: 1450000, fechaCorte: '2026-03-28', observaciones: 'Avance según programa. Estructura completada pisos 1-4.', cobradoAcumulado: 28400000, porCobrar: 9800000, vencido: 3200000, flujoRequeridoProximo: 2900000 },
  { id: 'obra-2', project: 'Bottura', presupuesto: 112000000, erogado: 71800000, porErogar: 40200000, avanceFisico: 68, avanceFinanciero: 64, provisionSemanal: 1850000, fechaCorte: '2026-03-28', observaciones: 'Fase acabados iniciando.', cobradoAcumulado: 38500000, porCobrar: 11350000, vencido: 3800000, flujoRequeridoProximo: 3700000 },
  { id: 'obra-3', project: 'Daiku', presupuesto: 145000000, erogado: 58000000, porErogar: 87000000, avanceFisico: 42, avanceFinanciero: 40, provisionSemanal: 2200000, fechaCorte: '2026-03-28', observaciones: 'Cimentación concluida. Estructura en curso.', cobradoAcumulado: 42000000, porCobrar: 12050000, vencido: 3550000, flujoRequeridoProximo: 4400000 },
  { id: 'obra-4', project: 'Monócolo', presupuesto: 52000000, erogado: 14300000, porErogar: 37700000, avanceFisico: 24, avanceFinanciero: 27.5, provisionSemanal: 950000, fechaCorte: '2026-03-28', observaciones: 'Sobre-ejecución financiera menor.', cobradoAcumulado: 15200000, porCobrar: 5000000, vencido: 2200000, flujoRequeridoProximo: 1900000 },
];

export interface ObraWeeklyRow {
  week: number; range: string; cobranzaProyectada: number; cobranzaReal: number;
  diferencia: number; provisionObra: number; montoRequerido: number;
  deficit: number; deficitAcumulado: number; status: 'ok' | 'atencion' | 'alto' | 'critico';
}

export const mockObraWeekly: ObraWeeklyRow[] = (() => {
  const rows: ObraWeeklyRow[] = [];
  const base = [
    { w: 9, r: '24 Feb – 28 Feb', proy: 1200000, real: 1350000, prov: 980000, req: 1050000 },
    { w: 10, r: '03 Mar – 07 Mar', proy: 1100000, real: 980000, prov: 1050000, req: 1120000 },
    { w: 11, r: '10 Mar – 14 Mar', proy: 1350000, real: 1100000, prov: 1200000, req: 1300000 },
    { w: 12, r: '17 Mar – 21 Mar', proy: 1250000, real: 850000, prov: 1150000, req: 1250000 },
    { w: 13, r: '24 Mar – 28 Mar', proy: 1400000, real: 1250000, prov: 1100000, req: 1200000 },
    { w: 14, r: '31 Mar – 04 Abr', proy: 1300000, real: 0, prov: 1050000, req: 1150000 },
  ];
  let defAcc = 0;
  base.forEach(b => {
    const cobro = b.real > 0 ? b.real : b.proy;
    const dif = cobro - b.req;
    const def = dif < 0 ? Math.abs(dif) : 0;
    defAcc += dif < 0 ? Math.abs(dif) : -Math.min(defAcc, dif);
    if (defAcc < 0) defAcc = 0;
    const st = def === 0 ? 'ok' : def < 100000 ? 'atencion' : def < 300000 ? 'alto' : 'critico';
    rows.push({ week: b.w, range: b.r, cobranzaProyectada: b.proy, cobranzaReal: b.real, diferencia: dif, provisionObra: b.prov, montoRequerido: b.req, deficit: def, deficitAcumulado: Math.max(0, defAcc), status: st });
  });
  return rows;
})();

export interface CashFlowPoint { period: string; entradas: number; salidas: number; saldoNeto: number; }

export const mockCashFlowProjection: CashFlowPoint[] = [
  { period: 'Ene 26', entradas: 6500000, salidas: 5800000, saldoNeto: 700000 },
  { period: 'Feb 26', entradas: 6100000, salidas: 6200000, saldoNeto: -100000 },
  { period: 'Mar 26', entradas: 6480000, salidas: 6450000, saldoNeto: 30000 },
  { period: 'Abr 26', entradas: 5800000, salidas: 6300000, saldoNeto: -500000 },
  { period: 'May 26', entradas: 6200000, salidas: 6100000, saldoNeto: 100000 },
  { period: 'Jun 26', entradas: 7000000, salidas: 6800000, saldoNeto: 200000 },
];
