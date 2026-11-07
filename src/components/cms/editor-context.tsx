"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { SelectOption } from "@/components/shared/types";
import type { PickerAsset, PickerAssetMap } from "@/app/admin/media/_lib/picker-types";

import type { FieldErrors } from "./field-utils";

/** Options and lookups the field inputs need (all loaded by the server page and passed in as plain JSON). */
export type EditorOptions = {
  locale: string;
  /** Entry options per referenced collection (published first). */
  referenceOptions: Record<string, SelectOption[]>;
  /** Taxonomy options: industries, job_categories, languages. */
  taxonomyOptions: Record<string, SelectOption[]>;
  countryOptions: SelectOption[];
  /** Media assets already referenced (thumbnails in asset fields). */
  assets: PickerAssetMap;
  /** Staff may upload into the media library (media.manage). */
  canUpload: boolean;
};

type EditorContextValue = EditorOptions & {
  errors: FieldErrors;
  disabled: boolean;
  rememberAssets(list: PickerAsset[]): void;
};

const EditorContext = createContext<EditorContextValue | null>(null);

export function CmsEditorProvider({ options, errors, disabled = false, children }: { options: EditorOptions; errors: FieldErrors; disabled?: boolean; children: ReactNode }) {
  const [extraAssets, setExtraAssets] = useState<PickerAssetMap>({});
  const rememberAssets = useCallback((list: PickerAsset[]) => {
    setExtraAssets((prev) => {
      const next = { ...prev };
      for (const a of list) next[a.id] = a;
      return next;
    });
  }, []);
  const value = useMemo<EditorContextValue>(
    () => ({ ...options, assets: { ...options.assets, ...extraAssets }, errors, disabled, rememberAssets }),
    [options, extraAssets, errors, disabled, rememberAssets],
  );
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useCmsEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useCmsEditor must be used inside <CmsEditorProvider>");
  return ctx;
}

/** Optional variant for components that can also be used outside the entry editor (media pickers on other forms). */
export function useOptionalCmsEditor(): EditorContextValue | null {
  return useContext(EditorContext);
}
