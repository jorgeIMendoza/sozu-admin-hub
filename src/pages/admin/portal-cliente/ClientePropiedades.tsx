import { ChevronRight, TrendingUp } from "lucide-react";
import { mockPortfolio, fmtMXN as fmt, type ClienteInvestment } from "@/lib/clienteMockData";

const ClientePropiedades = () => {
  return (
    <div className="max-w-lg mx-auto lg:max-w-none">
      <section className="px-5 pt-6 pb-4 lg:px-0">
        <h2 className="font-bold text-lg text-foreground mb-4">Mis propiedades</h2>
        <div className="space-y-3">
          {mockPortfolio.map((inv) => (
            <PropertyCard key={inv.property.id} investment={inv} />
          ))}
        </div>
      </section>
    </div>
  );
};

function PropertyCard({ investment }: { investment: ClienteInvestment }) {
  const { property, financials } = investment;
  const progress = financials.initialPrice > 0 ? (financials.totalPaid / financials.initialPrice) * 100 : 0;
  const isDelivered = property.deliveryDate === "Entregada";

  return (
    <div className="w-full text-left rounded-[20px] overflow-hidden bg-card shadow-[0_2px_16px_-4px_hsl(var(--foreground)/0.08)]">
      <div className={`relative w-full aspect-[16/9] bg-gradient-to-br ${property.imageGradient}`}>
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />
        <div className="absolute top-3 right-3">
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm ${isDelivered ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"}`}>
            {isDelivered ? "Entregada" : `Entrega: ${property.deliveryDate}`}
          </span>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="font-bold text-base text-white leading-tight">{property.projectName}</h3>
          <p className="text-white/70 text-xs mt-0.5">Unidad {property.unitNumber} · {property.location}</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">Valor del activo</p>
            <p className="font-bold text-lg text-foreground tabular-nums">{fmt(financials.initialPrice)}</p>
          </div>
          {financials.estimatedAppreciation > 0 && (
            <div className="flex items-center gap-1 text-[hsl(var(--inmob-green))]">
              <TrendingUp className="w-3 h-3" />
              <span className="text-xs font-semibold tabular-nums">+{financials.estimatedAppreciation}%</span>
            </div>
          )}
        </div>
        <div>
          <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-[hsl(var(--inmob-green))]" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between mt-2 text-[11px]">
            <span className="text-muted-foreground">Pagado <span className="font-semibold text-foreground tabular-nums">{fmt(financials.totalPaid)}</span></span>
            <span className="text-muted-foreground">Pendiente <span className="font-semibold text-foreground tabular-nums">{fmt(financials.pendingBalance)}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs font-medium text-[hsl(var(--inmob-green))] flex items-center gap-1">
            Ver detalle
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

export default ClientePropiedades;
