import { create } from 'zustand';
import { ParseTravelConfirmationResult } from '@/types/ai';

interface ImportDraftState {
  draft: ParseTravelConfirmationResult | null;
  setDraft: (draft: ParseTravelConfirmationResult) => void;
  clearDraft: () => void;
}

export const useImportDraftStore = create<ImportDraftState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: null }),
}));
