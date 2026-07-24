"use client";

import { useEffect, useRef } from "react";

interface CameraSelfViewProps {
  stream: MediaStream;
}

export default function CameraSelfView({ stream }: CameraSelfViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const micLive = stream.getAudioTracks()[0]?.readyState === "live";

  return (
    <div className="fixed bottom-4 right-4 z-40 w-32 overflow-hidden rounded-lg border-2 border-gray-700 bg-black shadow-lg sm:w-40">
      <video ref={videoRef} autoPlay muted playsInline className="block h-full w-full object-cover" />
      <div className="absolute bottom-1 right-1 flex items-center rounded-full bg-black/60 px-1.5 py-1">
        <span
          className={`h-1.5 w-1.5 rounded-full ${micLive ? "bg-emerald-400" : "bg-red-500"}`}
          title={micLive ? "Microphone active" : "Microphone unavailable"}
        />
      </div>
    </div>
  );
}
