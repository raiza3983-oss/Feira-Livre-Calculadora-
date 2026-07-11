import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface CameraViewHandle {
  start: () => Promise<void>;
  stop: () => void;
  getVideo: () => HTMLVideoElement | null;
}

interface CameraViewProps {
  className?: string;
  facingMode?: "user" | "environment";
  onReady?: () => void;
  onError?: (error: Error) => void;
}

const CameraView = forwardRef<CameraViewHandle, CameraViewProps>(
  (
    {
      className = "",
      facingMode = "environment",
      onReady,
      onError,
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    const streamRef = useRef<MediaStream | null>(null);

    const [running, setRunning] = useState(false);

    async function start() {
      try {
        const stream =
          await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode,
            },
          });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          await videoRef.current.play();
        }

        setRunning(true);

        onReady?.();
      } catch (err: any) {
        onError?.(err);
      }
    }

    function stop() {
      streamRef.current?.getTracks().forEach((track) => track.stop());

      streamRef.current = null;

      setRunning(false);
    }

    useImperativeHandle(ref, () => ({
      start,
      stop,
      getVideo() {
        return videoRef.current;
      },
    }));

    useEffect(() => {
      return () => stop();
    }, []);

    return (
      <div className={`relative overflow-hidden rounded-2xl bg-black ${className}`}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
        />

        {!running && (
          <div className="absolute inset-0 flex items-center justify-center text-white bg-black/60">
            Câmera desligada
          </div>
        )}
      </div>
    );
  }
);

CameraView.displayName = "CameraView";

export default CameraView;
