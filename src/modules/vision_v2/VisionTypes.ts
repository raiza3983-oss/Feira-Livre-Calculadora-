/* ==========================================================
   Vision AI v2
   VisionTypes.ts
========================================================== */

export type VisionMode =
  | "idle"
  | "storage"
  | "conference"
  | "inventory"
  | "barcode"
  | "detector"
  | "counter"
  | "measure";

export type VisionStatus =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "stopped"
  | "error";

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

  timestamp: number;
}

export interface VisionConfiguration {

  mode: VisionMode;

  detector: boolean;

  barcode: boolean;

  counter: boolean;

  measure: boolean;

  ocr: boolean;

  scale: boolean;

  evidence: boolean;

  autoCapture: boolean;

  captureInterval: number;

}

export interface VisionModule {

  id: string;

  name: string;

  enabled: boolean;

}
