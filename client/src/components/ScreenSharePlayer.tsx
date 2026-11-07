import { useEffect, useRef } from "react";

export default function ScreenSharePlayer({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  return <video className="screen-share-video" ref={ref} autoPlay playsInline />;
}
