import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

interface Props {
  stream: MediaStream;
}

const ScreenSharePlayer = forwardRef<HTMLVideoElement, Props>(function ScreenSharePlayer({ stream }, forwardedRef) {
  const ref = useRef<HTMLVideoElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current as HTMLVideoElement, []);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  function toggleFullscreen() {
    if (!ref.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      ref.current.requestFullscreen();
    }
  }

  return (
    <video
      className="screen-share-video"
      ref={ref}
      autoPlay
      playsInline
      onClick={toggleFullscreen}
      title="Click to toggle fullscreen"
    />
  );
});

export default ScreenSharePlayer;
