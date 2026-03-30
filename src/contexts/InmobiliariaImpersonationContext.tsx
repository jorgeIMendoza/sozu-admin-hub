import { createContext, useContext, useState, ReactNode } from "react";

interface InmobiliariaImpersonationContextType {
  impersonatedInmobiliariaEmail: string | null;
  impersonatedInmobiliariaPersonaId: number | null;
  impersonatedInmobiliariaName: string | null;
  setImpersonatedInmobiliaria: (email: string | null, personaId: number | null, name: string | null) => void;
  clearImpersonation: () => void;
  isImpersonating: boolean;
}

const InmobiliariaImpersonationContext = createContext<InmobiliariaImpersonationContextType>({
  impersonatedInmobiliariaEmail: null,
  impersonatedInmobiliariaPersonaId: null,
  impersonatedInmobiliariaName: null,
  setImpersonatedInmobiliaria: () => {},
  clearImpersonation: () => {},
  isImpersonating: false,
});

export function InmobiliariaImpersonationProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<number | null>(null);
  const [name, setName] = useState<string | null>(null);

  const setImpersonatedInmobiliaria = (e: string | null, p: number | null, n: string | null) => {
    setEmail(e);
    setPersonaId(p);
    setName(n);
  };

  const clearImpersonation = () => {
    setEmail(null);
    setPersonaId(null);
    setName(null);
  };

  return (
    <InmobiliariaImpersonationContext.Provider
      value={{
        impersonatedInmobiliariaEmail: email,
        impersonatedInmobiliariaPersonaId: personaId,
        impersonatedInmobiliariaName: name,
        setImpersonatedInmobiliaria,
        clearImpersonation,
        isImpersonating: !!email,
      }}
    >
      {children}
    </InmobiliariaImpersonationContext.Provider>
  );
}

export function useInmobiliariaImpersonation() {
  return useContext(InmobiliariaImpersonationContext);
}
