import { useRef, useState } from "react";

/** The mini player's position and width, and the pointer handlers that drag and resize it. */
export function useMiniPlayerFrame(
  mini: boolean,
  revealPlayerControls: () => void,
) {
  const [miniPosition, setMiniPosition] = useState(() => {
    const width = 384;
    return {
      left: Math.max(20, window.innerWidth - width - 20),
      top: Math.max(20, window.innerHeight - width * (9 / 16) - 20),
    };
  });
  const [miniWidth, setMiniWidth] = useState(384);
  const dragStart = useRef<{
    pointerX: number;
    pointerY: number;
    left: number;
    top: number;
  } | null>(null);
  const resizeStart = useRef<{
    pointerX: number;
    width: number;
    left: number;
  } | null>(null);

  function startMiniDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!mini) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      left: miniPosition.left,
      top: miniPosition.top,
    };
  }

  function moveMini(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start) return;
    const panelHeight = miniWidth * (9 / 16);
    const maxLeft = Math.max(20, window.innerWidth - miniWidth - 20);
    const maxTop = Math.max(20, window.innerHeight - panelHeight - 20);
    setMiniPosition({
      left: Math.min(
        maxLeft,
        Math.max(20, start.left + (event.clientX - start.pointerX)),
      ),
      top: Math.min(
        maxTop,
        Math.max(20, start.top + (event.clientY - start.pointerY)),
      ),
    });
  }

  function stopMiniDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStart.current)
      event.currentTarget.releasePointerCapture(event.pointerId);
    dragStart.current = null;
  }

  function startMiniResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!mini) return;
    event.preventDefault();
    event.stopPropagation();
    revealPlayerControls();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStart.current = {
      pointerX: event.clientX,
      width: miniWidth,
      left: miniPosition.left,
    };
  }

  function moveMiniResize(event: React.PointerEvent<HTMLDivElement>) {
    const start = resizeStart.current;
    if (!start) return;
    const nextWidth = Math.min(
      640,
      Math.max(240, start.width + (event.clientX - start.pointerX)),
    );
    setMiniWidth(nextWidth);
    setMiniPosition((current) => ({ ...current, left: start.left }));
  }

  function stopMiniResize(event: React.PointerEvent<HTMLDivElement>) {
    if (resizeStart.current)
      event.currentTarget.releasePointerCapture(event.pointerId);
    resizeStart.current = null;
  }

  return {
    miniPosition,
    miniWidth,
    dragHandlers: {
      onPointerDown: startMiniDrag,
      onPointerMove: moveMini,
      onPointerUp: stopMiniDrag,
      onPointerCancel: stopMiniDrag,
    },
    resizeHandlers: {
      onPointerDown: startMiniResize,
      onPointerMove: moveMiniResize,
      onPointerUp: stopMiniResize,
      onPointerCancel: stopMiniResize,
    },
  };
}

export type MiniPointerHandlers = ReturnType<
  typeof useMiniPlayerFrame
>["dragHandlers"];
