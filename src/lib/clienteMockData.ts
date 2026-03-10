export interface ClienteProperty {
  id: string;
  projectName: string;
  unitNumber: string;
  location: string;
  type: string;
  area: string;
  floor: string;
  bedrooms: number;
  bathrooms: number;
  deliveryDate: string;
  imageGradient: string;
}

export interface ClienteFinancials {
  initialPrice: number;
  totalPaid: number;
  pendingBalance: number;
  estimatedAppreciation: number;
  currentEstimatedValue: number;
}

export interface ClienteStage {
  id: string;
  label: string;
  description: string;
  status: "completed" | "active" | "pending";
  contextMessage?: string;
}

export interface ClienteInvestment {
  property: ClienteProperty;
  financials: ClienteFinancials;
  stages: ClienteStage[];
}

export const mockPortfolio: ClienteInvestment[] = [
  {
    property: {
      id: "margot-707",
      projectName: "Margot",
      unitNumber: "707",
      location: "Guadalajara, Jal.",
      type: "Departamento",
      area: "78.0 m²",
      floor: "7",
      bedrooms: 2,
      bathrooms: 2,
      deliveryDate: "Entregada",
      imageGradient: "from-emerald-500/20 via-emerald-400/10 to-accent",
    },
    financials: {
      initialPrice: 3200000,
      totalPaid: 3200000,
      pendingBalance: 0,
      estimatedAppreciation: 22.5,
      currentEstimatedValue: 3920000,
    },
    stages: [
      { id: "preventa", label: "Preventa", description: "Completado", status: "completed" },
      { id: "pago_final", label: "Pago Final", description: "Completado", status: "completed" },
      { id: "escrituracion", label: "Escrituración", description: "Completado", status: "completed" },
      { id: "entrega", label: "Entrega", description: "Entregado", status: "completed" },
      { id: "post_entrega", label: "Post-Entrega", description: "Propiedad entregada", status: "active", contextMessage: "Lista para reventa" },
    ],
  },
  {
    property: {
      id: "bottura-709",
      projectName: "Bottura",
      unitNumber: "709",
      location: "Guadalajara, Jal.",
      type: "Departamento",
      area: "62.0 m²",
      floor: "7",
      bedrooms: 1,
      bathrooms: 1,
      deliveryDate: "Mayo 2026",
      imageGradient: "from-amber-500/20 via-amber-400/10 to-accent",
    },
    financials: {
      initialPrice: 2500000,
      totalPaid: 1800000,
      pendingBalance: 700000,
      estimatedAppreciation: 17.3,
      currentEstimatedValue: 2932500,
    },
    stages: [
      { id: "preventa", label: "Preventa", description: "Completado", status: "completed" },
      { id: "pago_final", label: "Pago Final", description: "Liquidación pendiente", status: "active", contextMessage: "Estás a 12 días de tu escrituración." },
      { id: "escrituracion", label: "Escrituración", description: "Pendiente", status: "pending" },
      { id: "entrega", label: "Entrega", description: "Pendiente", status: "pending" },
      { id: "post_entrega", label: "Post-Entrega", description: "Pendiente", status: "pending" },
    ],
  },
  {
    property: {
      id: "daiku-712",
      projectName: "Daiku",
      unitNumber: "712",
      location: "Guadalajara, Jal.",
      type: "Departamento",
      area: "72.74 m²",
      floor: "7",
      bedrooms: 2,
      bathrooms: 2,
      deliveryDate: "Diciembre 2027",
      imageGradient: "from-primary/20 via-primary/10 to-accent",
    },
    financials: {
      initialPrice: 5800000,
      totalPaid: 1800000,
      pendingBalance: 4000000,
      estimatedAppreciation: 9.7,
      currentEstimatedValue: 6362600,
    },
    stages: [
      { id: "preventa", label: "Preventa", description: "Plan de pagos activo", status: "active", contextMessage: "Tu próximo pago es en 9 días." },
      { id: "pago_final", label: "Pago Final", description: "Pendiente", status: "pending" },
      { id: "escrituracion", label: "Escrituración", description: "Pendiente", status: "pending" },
      { id: "entrega", label: "Entrega", description: "Pendiente", status: "pending" },
      { id: "post_entrega", label: "Post-Entrega", description: "Pendiente", status: "pending" },
    ],
  },
];

export function getPortfolioTotals(portfolio: ClienteInvestment[]) {
  const totalInvested = portfolio.reduce((s, p) => s + p.financials.initialPrice, 0);
  const totalPaid = portfolio.reduce((s, p) => s + p.financials.totalPaid, 0);
  const totalPending = portfolio.reduce((s, p) => s + p.financials.pendingBalance, 0);
  const totalCurrentValue = portfolio.reduce((s, p) => s + p.financials.currentEstimatedValue, 0);
  const appreciationPercent = totalInvested > 0 ? ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0;
  return { totalInvested, totalPaid, totalPending, totalCurrentValue, appreciationPercent, count: portfolio.length };
}

export function fmtMXN(value: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}
