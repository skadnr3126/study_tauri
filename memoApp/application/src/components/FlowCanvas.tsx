import { CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BlockId, Branch, BranchId, Flow, getDisplayTitle, WorkspaceState } from "../domain/flow";

type FlowLane = { branch: Branch; depth: number; startColumn: number };
export type NodePosition = { x: number; y: number };
type PointerDrag = NodePosition & { blockId: BlockId; startX: number; startY: number; moved: boolean };
type Connection = { from: BlockId; to: BlockId };
type ConnectionPath = Connection & { d: string };

type FlowCanvasProps = {
  workspace: WorkspaceState;
  flow: Flow;
  onOpenBlock: (blockId: BlockId) => void;
  onRenameBlock: (blockId: BlockId, title: string) => void;
  nodePositions: Record<BlockId, NodePosition | undefined>;
  onNodePositionChange: (blockId: BlockId, position: NodePosition) => void;
  onAddAfter: (blockId?: BlockId) => void;
  onCreateBranch: (blockId: BlockId) => void;
};

const getFlowLanes = (flow: Flow): FlowLane[] => {
  const lanes: FlowLane[] = [];
  const visit = (branchId: BranchId, depth: number, startColumn: number) => {
    const branch = flow.branches.get(branchId);
    if (!branch) return;
    lanes.push({ branch, depth, startColumn });
    branch.itemIds.forEach((blockId, index) => {
      const nextColumn = startColumn + index;
      (branch.childBranchIdsByBlockId.get(blockId) ?? []).forEach((childBranchId) =>
        visit(childBranchId, depth + 1, nextColumn),
      );
    });
  };
  visit(flow.rootBranchId, 0, 1);
  return lanes;
};

export function FlowCanvas({
  workspace,
  flow,
  onOpenBlock,
  onRenameBlock,
  nodePositions,
  onNodePositionChange,
  onAddAfter,
  onCreateBranch,
}: FlowCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeElementsRef = useRef(new Map<BlockId, HTMLElement>());
  const lanes = useMemo(() => getFlowLanes(flow), [flow]);
  const widestColumn = Math.max(2, ...lanes.map((lane) => lane.startColumn + Math.max(lane.branch.itemIds.length, 1)));
  const [scale, setScale] = useState(1);
  const [connectionPaths, setConnectionPaths] = useState<ConnectionPath[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const pointerDragRef = useRef<PointerDrag | undefined>(undefined);
  const suppressClickRef = useRef(false);
  const connections = useMemo(() => {
    const result: Connection[] = [];
    for (const branch of flow.branches.values()) {
      branch.itemIds.slice(1).forEach((blockId, index) => result.push({ from: branch.itemIds[index], to: blockId }));
      branch.itemIds.forEach((blockId) => {
        (branch.childBranchIdsByBlockId.get(blockId) ?? []).forEach((childBranchId) => {
          const childBlockId = flow.branches.get(childBranchId)?.itemIds[0];
          if (childBlockId) result.push({ from: blockId, to: childBlockId });
        });
      });
    }
    return result;
  }, [flow]);
  const canvasStyle = {
    "--canvas-columns": widestColumn,
    "--node-width": `${214 * scale}px`,
    "--node-gap": `${48 * scale}px`,
    "--node-height": `${94 * scale}px`,
    "--node-padding": `${14 * scale}px`,
    "--node-title-size": `${0.92 * scale}rem`,
    "--node-body-size": `${0.74 * scale}rem`,
    "--node-meta-size": `${0.63 * scale}rem`,
    "--node-order-size": `${19 * scale}px`,
    "--node-order-font-size": `${0.64 * scale}rem`,
    "--node-action-size": `${26 * scale}px`,
    "--node-action-font-size": `${1 * scale}rem`,
  } as CSSProperties;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const fitToViewport = () => {
      const naturalWidth = widestColumn * (214 + 48) + 36;
      const nextScale = Math.max(0.72, Math.min(1, viewport.clientWidth / naturalWidth));
      setScale((current) => (Math.abs(current - nextScale) < 0.01 ? current : nextScale));
    };
    fitToViewport();
    const observer = new ResizeObserver(fitToViewport);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [widestColumn]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measureConnections = () => {
      const canvasBounds = canvas.getBoundingClientRect();
      setCanvasSize({ width: canvasBounds.width || 1, height: canvasBounds.height || 1 });
      setConnectionPaths(connections.flatMap(({ from, to }) => {
        const fromElement = nodeElementsRef.current.get(from);
        const toElement = nodeElementsRef.current.get(to);
        if (!fromElement || !toElement) return [];
        const fromBounds = fromElement.getBoundingClientRect();
        const toBounds = toElement.getBoundingClientRect();
        const startX = fromBounds.right - canvasBounds.left;
        const startY = fromBounds.top + fromBounds.height / 2 - canvasBounds.top;
        const endX = toBounds.left - canvasBounds.left;
        const endY = toBounds.top + toBounds.height / 2 - canvasBounds.top;
        const curve = Math.max(36, Math.abs(endX - startX) * 0.45);
        return [{ from, to, d: `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}` }];
      }));
    };
    measureConnections();
    const observer = new ResizeObserver(measureConnections);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [connections, nodePositions, scale]);

  return (
    <div className="flow-canvas-scroll" ref={viewportRef}>
      <div className="flow-canvas" ref={canvasRef} style={canvasStyle}>
        <div className="canvas-direction" aria-hidden="true">흐름은 오른쪽으로 이어집니다 →</div>
        <svg className="connection-layer" viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} preserveAspectRatio="none" aria-hidden="true">
          {connectionPaths.map((path) => <path d={path.d} key={`${path.from}-${path.to}`} />)}
        </svg>
        {lanes.map(({ branch, startColumn }) => {
          const isRoot = branch.id === flow.rootBranchId;
          const laneStyle = { "--lane-start": startColumn } as CSSProperties;
          return (
            <section className={`flow-lane ${isRoot ? "is-root" : ""}`} style={laneStyle} key={branch.id}>
              {isRoot && <header className="lane-header"><span className="lane-label">주 흐름</span></header>}
              <div className="lane-nodes">
                {branch.itemIds.map((blockId, index) => {
                  const block = workspace.blocks.get(blockId);
                  if (!block) return null;
                  const nodePosition = nodePositions[blockId] ?? { x: 0, y: 0 };
                  const nodeWrapStyle = { "--node-offset-x": `${nodePosition.x}px`, "--node-offset-y": `${nodePosition.y}px` } as CSSProperties;
                  return (
                    <div className="node-wrap" style={nodeWrapStyle} key={blockId}>
                      <article
                        ref={(element) => { if (element) nodeElementsRef.current.set(blockId, element); else nodeElementsRef.current.delete(blockId); }}
                        className={`flow-node ${workspace.selectedBlockId === blockId ? "is-selected" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => { if (!suppressClickRef.current) onOpenBlock(blockId); }}
                        onPointerDown={(event) => {
                          if (event.target instanceof HTMLInputElement || event.button !== 0) return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          pointerDragRef.current = { blockId, startX: event.clientX, startY: event.clientY, x: nodePosition.x, y: nodePosition.y, moved: false };
                        }}
                        onPointerMove={(event) => {
                          const drag = pointerDragRef.current;
                          if (!drag || drag.blockId !== blockId) return;
                          const x = drag.x + event.clientX - drag.startX;
                          const y = drag.y + event.clientY - drag.startY;
                          if (Math.abs(x - drag.x) > 3 || Math.abs(y - drag.y) > 3) drag.moved = true;
                          onNodePositionChange(blockId, { x, y });
                        }}
                        onPointerUp={(event) => {
                          const drag = pointerDragRef.current;
                          if (drag?.blockId === blockId && drag.moved) { suppressClickRef.current = true; window.setTimeout(() => { suppressClickRef.current = false; }, 0); }
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                          pointerDragRef.current = undefined;
                        }}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenBlock(blockId); } }}
                        aria-label={`${getDisplayTitle(block)} 편집`}
                      >
                        <input className="node-title-input" value={block.title ?? ""} onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onChange={(event) => onRenameBlock(blockId, event.currentTarget.value)} placeholder={getDisplayTitle(block)} aria-label="노드 제목 바로 편집" />
                      </article>
                      <div className="node-quick-actions">
                        {index === branch.itemIds.length - 1 && <button className="node-action" type="button" onClick={() => onAddAfter(blockId)} aria-label="다음 노드 추가" title="다음 노드 추가">+</button>}
                        <button className="node-action" type="button" onClick={() => onCreateBranch(blockId)} aria-label="갈래 만들기" title="갈래 만들기">⑂</button>
                      </div>
                    </div>
                  );
                })}
                {branch.itemIds.length === 0 && <button className="empty-lane-add" type="button" onClick={() => onAddAfter()}>첫 노드 만들기</button>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
