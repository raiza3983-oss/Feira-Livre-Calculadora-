import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from "react";

export type VisionMode =
  | "idle"
  | "storage"
  | "conference"
  | "inventory"
  | "barcode"
  | "detector"
  | "counter"
  | "measure";

export interface VisionResult {
  barcode?: string;
  qrCode?: string;
  detectedObject?: string;
  confidence?: number;
  quantity?: number;
  weight?: number;
  width?: number;
  height?: number;
  lot?: string;
  expirationDate?: string;
  image?: string;
}

interface VisionContextData {
  mode: VisionMode;

  running: boolean;

  result?: VisionResult;

  start(mode: VisionMode): void;

  stop(): void;

  clear(): void;

  update(result: Partial<VisionResult>): void;
}

const VisionContext =
  createContext<VisionContextData | null>(null);

export function VisionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [mode, setMode] =
    useState<VisionMode>("idle");

  const [running, setRunning] =
    useState(false);

  const [result, setResult] =
    useState<VisionResult>();

  function start(newMode: VisionMode) {
    setMode(newMode);
    setRunning(true);
  }

  function stop() {
    setRunning(false);
    setMode("idle");
  }

  function clear() {
    setResult(undefined);
  }

  function update(
    values: Partial<VisionResult>
  ) {
    setResult((old) => ({
      ...old,
      ...values,
    }));
  }

  const value = useMemo(
    () => ({
      mode,
      running,
      result,
      start,
      stop,
      clear,
      update,
    }),
    [mode, running, result]
  );

  return (
    <VisionContext.Provider value={value}>
      {children}
    </VisionContext.Provider>
  );
}

export function useVision() {
  const context =
    useContext(VisionContext);

  if (!context) {
    throw new Error(
      "VisionProvider não encontrado."
    );
  }

  return context;
}
