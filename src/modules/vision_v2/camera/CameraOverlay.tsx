import React from "react";

export interface DetectionBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence?: number;
}

interface CameraOverlayProps {
  detections?: DetectionBox[];

  showCrosshair?: boolean;

  showBarcodeArea?: boolean;

  showMeasureArea?: boolean;

  className?: string;
}

export default function CameraOverlay({

  detections = [],

  showCrosshair = true,

  showBarcodeArea = false,

  showMeasureArea = false,

  className = ""

}: CameraOverlayProps) {

  return (

    <div
      className={`absolute inset-0 pointer-events-none ${className}`}
    >

      {showCrosshair && (

        <>
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-green-400/70 -translate-x-1/2" />

          <div className="absolute top-1/2 left-0 right-0 h-px bg-green-400/70 -translate-y-1/2" />
        </>

      )}

      {showBarcodeArea && (

        <div className="absolute left-[15%] right-[15%] bottom-12 h-24 border-2 border-yellow-400 rounded-xl">
          <span className="absolute -top-6 left-0 text-xs text-yellow-300">
            Área de leitura GS1 / Código de Barras
          </span>
        </div>

      )}

      {showMeasureArea && (

        <div className="absolute left-[20%] top-[20%] w-[60%] h-[60%] border-2 border-cyan-400 rounded-lg">
          <span className="absolute -top-6 left-0 text-xs text-cyan-300">
            Área de medição
          </span>
        </div>

      )}

      {detections.map(item => (

        <div
          key={item.id}
          className="absolute border-2 border-lime-400 rounded-md"
          style={{
            left: `${item.x}%`,
            top: `${item.y}%`,
            width: `${item.width}%`,
            height: `${item.height}%`
          }}
        >

          <div className="bg-lime-500 text-black text-xs px-2 py-1 rounded-br-md">

            {item.label}

            {item.confidence !== undefined &&
              ` (${Math.round(item.confidence)}%)`}

          </div>

        </div>

      ))}

    </div>

  );

}
