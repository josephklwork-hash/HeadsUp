"use client";

import { useEffect, useRef, useState } from 'react';
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
  const [dimensions, setDimensions] = useState({ width: 320, height: 240 });
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

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

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: dimensions.width,
      height: dimensions.height
    };
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;

      const newWidth = Math.max(200, resizeStartRef.current.width + deltaX);
      const newHeight = Math.max(150, resizeStartRef.current.height + deltaY);

      setDimensions({ width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return (
    <div
      className="relative"
      style={{ width: dimensions.width, height: dimensions.height }}
    >
      <div
        ref={callContainerRef}
        className="w-full h-full rounded-xl border-2 border-white/20 overflow-hidden shadow-lg bg-black"
      />
      <div
        onMouseDown={handleResizeStart}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize bg-white/30 hover:bg-white/50 rounded-tl"
        style={{ borderBottomRightRadius: '12px' }}
      />
    </div>
  );
}
