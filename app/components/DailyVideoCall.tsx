"use client";

import { useEffect, useRef } from 'react';
import DailyIframe from '@daily-co/daily-js';

interface DailyVideoCallProps {
  roomUrl: string | null;
  onJoinedCall?: () => void;
  onLeftCall?: () => void;
  onError?: (error: Error) => void;
}

export default function DailyVideoCall({
  roomUrl,
  onJoinedCall,
  onLeftCall,
  onError
}: DailyVideoCallProps) {
  const callContainerRef = useRef<HTMLDivElement>(null);
  const callObjectRef = useRef<any>(null);

  useEffect(() => {
    if (!roomUrl || !callContainerRef.current) return;

    const callObject = DailyIframe.createFrame(callContainerRef.current, {
      iframeStyle: {
        width: '100%',
        height: '100%',
        border: '0',
        borderRadius: '12px',
      },
      showLeaveButton: true,
      showFullscreenButton: false,
    });

    callObject
      .join({ url: roomUrl })
      .then(() => onJoinedCall?.())
      .catch((err) => onError?.(err));

    callObject.on('left-meeting', () => onLeftCall?.());

    callObjectRef.current = callObject;

    return () => {
      callObject?.destroy();
    };
  }, [roomUrl, onJoinedCall, onLeftCall, onError]);

  return (
    <div
      ref={callContainerRef}
      className="w-[320px] h-[240px] rounded-xl border-2 border-white/20 overflow-hidden shadow-lg bg-black"
    />
  );
}
