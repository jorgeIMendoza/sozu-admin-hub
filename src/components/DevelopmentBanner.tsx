import { ENVIRONMENT } from "@/lib/config";

export function DevelopmentBanner() {
  if (ENVIRONMENT !== "development") return null;

  return (
    <div className="w-full bg-yellow-400 text-black py-2 px-4 text-center font-bold text-sm">
      🚧 AMBIENTE DE DESARROLLO 🚧
    </div>
  );
}
