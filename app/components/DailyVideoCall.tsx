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
  const [dimensions, setDimensions] = useState({ width: 640, height: 480 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeCorner, setResizeCorner] = useState<'tl' | 'tr' | 'bl' | 'br' | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

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

        // Set gallery view as default
        await callObject.setShowNamesMode('always');
        await callObject.setActiveSpeakerMode(false);

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

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y
    };
  };

  const handleResizeStart = (e: React.MouseEvent, corner: 'tl' | 'tr' | 'bl' | 'br') => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeCorner(corner);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: dimensions.width,
      height: dimensions.height,
      posX: position.x,
      posY: position.y
    };
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;

      setPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (!isResizing || !resizeCorner) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;

      let newWidth = resizeStartRef.current.width;
      let newHeight = resizeStartRef.current.height;
      let newX = resizeStartRef.current.posX;
      let newY = resizeStartRef.current.posY;

      if (resizeCorner === 'br') {
        newWidth = Math.max(200, resizeStartRef.current.width + deltaX);
        newHeight = Math.max(150, resizeStartRef.current.height + deltaY);
      } else if (resizeCorner === 'bl') {
        newWidth = Math.max(200, resizeStartRef.current.width - deltaX);
        newHeight = Math.max(150, resizeStartRef.current.height + deltaY);
        newX = resizeStartRef.current.posX + (resizeStartRef.current.width - newWidth);
      } else if (resizeCorner === 'tr') {
        newWidth = Math.max(200, resizeStartRef.current.width + deltaX);
        newHeight = Math.max(150, resizeStartRef.current.height - deltaY);
        newY = resizeStartRef.current.posY + (resizeStartRef.current.height - newHeight);
      } else if (resizeCorner === 'tl') {
        newWidth = Math.max(200, resizeStartRef.current.width - deltaX);
        newHeight = Math.max(150, resizeStartRef.current.height - deltaY);
        newX = resizeStartRef.current.posX + (resizeStartRef.current.width - newWidth);
        newY = resizeStartRef.current.posY + (resizeStartRef.current.height - newHeight);
      }

      setDimensions({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeCorner(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeCorner]);

  return (
    <div
      className="absolute"
      style={{
        width: dimensions.width,
        height: dimensions.height,
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'auto'
      }}
    >
      {/* Drag handle bar */}
      <div
        onMouseDown={handleDragStart}
        className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-black/60 to-transparent rounded-t-xl cursor-grab active:cursor-grabbing z-10 flex items-center justify-center"
      >
        <div className="flex gap-1">
          <div className="w-1 h-1 rounded-full bg-white/40"></div>
          <div className="w-1 h-1 rounded-full bg-white/40"></div>
          <div className="w-1 h-1 rounded-full bg-white/40"></div>
        </div>
      </div>

      <div
        ref={callContainerRef}
        className="w-full h-full rounded-xl border-2 border-white/20 overflow-hidden shadow-lg bg-black"
      />

      {/* Resize handles - all 4 corners */}
      <div
        onMouseDown={(e) => handleResizeStart(e, 'tl')}
        className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize bg-white/30 hover:bg-white/50"
        style={{ borderTopLeftRadius: '12px' }}
      />
      <div
        onMouseDown={(e) => handleResizeStart(e, 'tr')}
        className="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize bg-white/30 hover:bg-white/50"
        style={{ borderTopRightRadius: '12px' }}
      />
      <div
        onMouseDown={(e) => handleResizeStart(e, 'bl')}
        className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize bg-white/30 hover:bg-white/50"
        style={{ borderBottomLeftRadius: '12px' }}
      />
      <div
        onMouseDown={(e) => handleResizeStart(e, 'br')}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize bg-white/30 hover:bg-white/50"
        style={{ borderBottomRightRadius: '12px' }}
      />
    </div>
  );
}
