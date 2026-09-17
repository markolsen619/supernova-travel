import { create } from 'zustand';

/**
 * users/{uid}.aiConsentVersion for the signed-in user: which version of the AI
 * data-sharing disclosure they agreed to, or null. Hydrated by hydrateSession.
 */
interface AiConsentState {
  version: number | null;
  setVersion: (version: number | null) => void;
}

export const useAiConsentStore = create<AiConsentState>((set) => ({
  version: null,
  setVersion: (version) => set({ version }),
}));
