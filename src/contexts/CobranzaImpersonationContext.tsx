import { createContext, useContext, useState, ReactNode } from "react";

interface CobranzaImpersonationContextType {
  impersonatedEmail: string | null;
  impersonatedName: string | null;
  impersonatedPersonaId: number | null;
  impersonatedRoleId: number | null;
  setImpersonated: (email: string, name: string, personaId: number | null, roleId: number | null) => void;
  clearImpersonation: () => void;
  isImpersonating: boolean;
}

const CobranzaImpersonationContext = createContext<CobranzaImpersonationContextType>({
  impersonatedEmail: null,
  impersonatedName: null,
  impersonatedPersonaId: null,
  impersonatedRoleId: null,
  setImpersonated: (_email: string, _name: string, _personaId: number | null, _roleId: number | null) => {},
  clearImpersonation: () => {},
  isImpersonating: false,
});

export function CobranzaImpersonationProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<number | null>(null);
  const [roleId, setRoleId] = useState<number | null>(null);

  const setImpersonated = (e: string, n: string, pid: number | null, rid: number | null) => {
    setEmail(e);
    setName(n);
    setPersonaId(pid);
    setRoleId(rid);
  };

  const clearImpersonation = () => {
    setEmail(null);
    setName(null);
    setPersonaId(null);
    setRoleId(null);
  };

  return (
    <CobranzaImpersonationContext.Provider
      value={{
        impersonatedEmail: email,
        impersonatedName: name,
        impersonatedPersonaId: personaId,
        impersonatedRoleId: roleId,
        setImpersonated,
        clearImpersonation,
        isImpersonating: !!email,
      }}
    >
      {children}
    </CobranzaImpersonationContext.Provider>
  );
}

export const useCobranzaImpersonation = () => useContext(CobranzaImpersonationContext);
