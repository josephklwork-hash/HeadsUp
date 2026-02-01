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
  const isJoiningRef = useRef(false);

  useEffect(() => {
    if (!roomUrl || !callContainerRef.current || isJoiningRef.current) return;

    const setupCall = async () => {
      // Destroy any existing instance first and wait for cleanup
      if (callObjectRef.current) {
        try {
          await callObjectRef.current.destroy();
        } catch (e) {
          console.error('Error destroying previous call instance:', e);
        }
        callObjectRef.current = null;
      }

      isJoiningRef.current = true;

      try {
        const callObject = DailyIframe.createFrame(callContainerRef.current!, {
          iframeStyle: {
            width: '100%',
            height: '100%',
            border: '0',
            borderRadius: '12px',
          },
          showLeaveButton: true,
          showFullscreenButton: false,
        });

        callObject.on('left-meeting', () => {
          onLeftCall?.();
          isJoiningRef.current = false;
        });

        callObjectRef.current = callObject;

        await callObject.join({ url: roomUrl });
        onJoinedCall?.();
        isJoiningRef.current = false;
      } catch (err: any) {
        console.error('Error setting up call:', err);
        onError?.(err);
        isJoiningRef.current = false;
      }
    };

    setupCall();

    return () => {
      const cleanup = async () => {
        if (callObjectRef.current) {
          try {
            await callObjectRef.current.destroy();
          } catch (e) {
            console.error('Error during cleanup:', e);
          }
          callObjectRef.current = null;
        }
        isJoiningRef.current = false;
      };
      cleanup();
    };
  }, [roomUrl]);

  return (
    <div
      ref={callContainerRef}
      className="w-[320px] h-[240px] rounded-xl border-2 border-white/20 overflow-hidden shadow-lg bg-black"
    />
  );
}
