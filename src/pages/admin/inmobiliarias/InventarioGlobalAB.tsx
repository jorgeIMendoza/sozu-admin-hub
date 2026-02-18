import { useAbTest } from "@/hooks/useAbTest";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const InventarioGlobalA = lazy(() => import("./InventarioGlobal"));
const InventarioGlobalB = lazy(() => import("./InventarioGlobalB"));

const InventarioGlobalAB = () => {
  const { variant } = useAbTest("/admin/inmobiliarias/inventario");

  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      {variant === "B" ? <InventarioGlobalB /> : <InventarioGlobalA />}
    </Suspense>
  );
};

export default InventarioGlobalAB;
