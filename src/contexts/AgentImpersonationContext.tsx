import { createContext, useContext, useState, ReactNode } from "react";

interface AgentImpersonationContextType {
  /** The email of the agent being impersonated (used for proyectos_acceso lookups) */
  impersonatedAgentEmail: string | null;
  /** The persona ID of the agent being impersonated */
  impersonatedAgentPersonaId: number | null;
  /** The display name of the agent being impersonated */
  impersonatedAgentName: string | null;
  /** Set the impersonated agent */
  setImpersonatedAgent: (email: string | null, personaId: number | null, name: string | null) => void;
  /** Clear impersonation */
  clearImpersonation: () => void;
  /** Whether an agent is being impersonated */
  isImpersonating: boolean;
}

const AgentImpersonationContext = createContext<AgentImpersonationContextType>({
  impersonatedAgentEmail: null,
  impersonatedAgentPersonaId: null,
  impersonatedAgentName: null,
  setImpersonatedAgent: () => {},
  clearImpersonation: () => {},
  isImpersonating: false,
});

export function AgentImpersonationProvider({ children }: { children: ReactNode }) {
  const [agentEmail, setAgentEmail] = useState<string | null>(null);
  const [agentPersonaId, setAgentPersonaId] = useState<number | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);

  const setImpersonatedAgent = (email: string | null, personaId: number | null, name: string | null) => {
    setAgentEmail(email);
    setAgentPersonaId(personaId);
    setAgentName(name);
  };

  const clearImpersonation = () => {
    setAgentEmail(null);
    setAgentPersonaId(null);
    setAgentName(null);
  };

  return (
    <AgentImpersonationContext.Provider
      value={{
        impersonatedAgentEmail: agentEmail,
        impersonatedAgentPersonaId: agentPersonaId,
        impersonatedAgentName: agentName,
        setImpersonatedAgent,
        clearImpersonation,
        isImpersonating: !!agentEmail,
      }}
    >
      {children}
    </AgentImpersonationContext.Provider>
  );
}

export function useAgentImpersonation() {
  return useContext(AgentImpersonationContext);
}
