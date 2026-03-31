import { useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Vista {
  id: number;
  nombre: string;
  url: string | null;
}

export const VistasCarousel = ({ vistas }: { vistas: Vista[] }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "center" });
  const [current, setCurrent] = useState(0);

  const scrollPrev = () => emblaApi?.scrollPrev();
  const scrollNext = () => emblaApi?.scrollNext();

  emblaApi?.on("select", () => {
    setCurrent(emblaApi.selectedScrollSnap());
  });

  if (vistas.length === 0) return null;

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-lg" ref={emblaRef}>
        <div className="flex">
          {vistas.map((vista) => (
            <div key={vista.id} className="min-w-0 shrink-0 grow-0 basis-full">
              <div className="relative">
                <img
                  src={vista.url || ""}
                  alt={vista.nombre}
                  className="w-full h-52 lg:h-72 object-cover rounded-lg"
                  loading="lazy"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm px-3 py-2 rounded-b-lg">
                  <p className="text-white text-sm font-semibold">{vista.nombre}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {vistas.length > 1 && (
        <>
          <button
            onClick={scrollPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 border border-border flex items-center justify-center hover:bg-background transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={scrollNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 border border-border flex items-center justify-center hover:bg-background transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="flex justify-center gap-1.5 mt-2">
            {vistas.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === current ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
