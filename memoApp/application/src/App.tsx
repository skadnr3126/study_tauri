import { CSSProperties, FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BlockId,
  Branch,
  BranchId,
  CommandResult,
  Flow,
  WorkspaceState,
  buildLocationIndex,
  createBlockAfter,
  createBranchWithBlock,
  createFlow,
  createWorkspace,
  deleteBlockSubtree,
  getDisplayTitle,
  moveBlock,
  moveBlockByOffset,
  renameFlow,
  updateBlock,
  validateWorkspace,
} from "./domain/flow";
import "./App.css";

type FlowLane = {
  branch: Branch;
  depth: number;
  startColumn: number;
};

type NodePosition = { x: number; y: number };
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

const getBranchLabel = (flow: Flow, branch: Branch) => {
  if (branch.id === flow.rootBranchId) return "주 흐름";
  return branch.title?.trim() || "이름 없는 갈래";
};

const getFlowLanes = (flow: Flow): FlowLane[] => {
  const lanes: FlowLane[] = [];

  const visit = (branchId: BranchId, depth: number, startColumn: number) => {
    const branch = flow.branches.get(branchId);
    if (!branch) return;

    lanes.push({ branch, depth, startColumn });
    branch.itemIds.forEach((blockId, index) => {
      // A branch starts directly beneath the node that split from it. Its own
      // sequence still grows to the right from there.
      const nextColumn = startColumn + index;
      (branch.childBranchIdsByBlockId.get(blockId) ?? []).forEach((childBranchId) =>
        visit(childBranchId, depth + 1, nextColumn),
      );
    });
  };

  visit(flow.rootBranchId, 0, 1);
  return lanes;
};

function FlowCanvas({
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
  const widestColumn = Math.max(
    2,
    ...lanes.map((lane) => lane.startColumn + Math.max(lane.branch.itemIds.length, 1)),
  );
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
          const childBranch = flow.branches.get(childBranchId);
          const childBlockId = childBranch?.itemIds[0];
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
      // One column includes a node and its following gap. Below 72%, text is
      // no longer comfortably readable, so the remaining width may scroll.
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
      setConnectionPaths(
        connections.flatMap(({ from, to }) => {
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

          return [{
            from,
            to,
            d: `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`,
          }];
        }),
      );
    };

    measureConnections();
    const observer = new ResizeObserver(measureConnections);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [connections, nodePositions, scale]);

  return (
    <div className="flow-canvas-scroll" ref={viewportRef}>
      <div
        className="flow-canvas"
        ref={canvasRef}
        style={canvasStyle}
      >
        <div className="canvas-direction" aria-hidden="true">
          흐름은 오른쪽으로 이어집니다 →
        </div>
        <svg
          className="connection-layer"
          viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {connectionPaths.map((path) => <path d={path.d} key={`${path.from}-${path.to}`} />)}
        </svg>

        {lanes.map(({ branch, depth, startColumn }) => {
          const isRoot = branch.id === flow.rootBranchId;
          const laneStyle = {
            "--lane-start": startColumn,
            "--lane-depth": depth,
          } as CSSProperties;

          return (
            <section className={`flow-lane ${isRoot ? "is-root" : ""}`} style={laneStyle} key={branch.id}>
              {isRoot && <header className="lane-header"><span className="lane-label">주 흐름</span></header>}

              <div className="lane-nodes">
                {branch.itemIds.map((blockId, index) => {
                  const block = workspace.blocks.get(blockId);
                  if (!block) return null;
                  const nodePosition = nodePositions[blockId] ?? { x: 0, y: 0 };
                  const nodeWrapStyle = {
                    "--node-offset-x": `${nodePosition.x}px`,
                    "--node-offset-y": `${nodePosition.y}px`,
                  } as CSSProperties;
                  return (
                    <div className="node-wrap" style={nodeWrapStyle} key={blockId}>
                      <article
                        ref={(element) => {
                          if (element) nodeElementsRef.current.set(blockId, element);
                          else nodeElementsRef.current.delete(blockId);
                        }}
                        className={`flow-node ${workspace.selectedBlockId === blockId ? "is-selected" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (!suppressClickRef.current) onOpenBlock(blockId);
                        }}
                        onPointerDown={(event) => {
                          if (event.target instanceof HTMLInputElement) {
                            return;
                          }
                          if (event.button !== 0) return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          pointerDragRef.current = {
                            blockId,
                            startX: event.clientX,
                            startY: event.clientY,
                            x: nodePosition.x,
                            y: nodePosition.y,
                            moved: false,
                          };
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
                          if (drag?.blockId === blockId && drag.moved) {
                            suppressClickRef.current = true;
                            window.setTimeout(() => { suppressClickRef.current = false; }, 0);
                          }
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                          pointerDragRef.current = undefined;
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onOpenBlock(blockId);
                          }
                        }}
                        aria-label={`${getDisplayTitle(block)} 편집`}
                      >
                        <input
                          className="node-title-input"
                          value={block.title ?? ""}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          onChange={(event) => onRenameBlock(blockId, event.currentTarget.value)}
                          placeholder={getDisplayTitle(block)}
                          aria-label="노드 제목 바로 편집"
                        />
                      </article>
                      <div className="node-quick-actions">
                        {index === branch.itemIds.length - 1 && (
                          <button
                            className="node-action"
                            type="button"
                            onClick={() => onAddAfter(blockId)}
                            aria-label="다음 노드 추가"
                            title="다음 노드 추가"
                          >
                            +
                          </button>
                        )}
                        <button
                          className="node-action"
                          type="button"
                          onClick={() => onCreateBranch(blockId)}
                          aria-label="갈래 만들기"
                          title="갈래 만들기"
                        >
                          ⑂
                        </button>
                      </div>
                    </div>
                  );
                })}
                {branch.itemIds.length === 0 && (
                  <button className="empty-lane-add" type="button" onClick={() => onAddAfter()}>
                    첫 노드 만들기
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => createWorkspace());
  const [newFlowTitle, setNewFlowTitle] = useState("");
  const [message, setMessage] = useState("새 Flow를 만들어 구조를 시작하세요.");
  const [editingBlockId, setEditingBlockId] = useState<BlockId>();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [blockMoveTarget, setBlockMoveTarget] = useState<BranchId>("");
  const [nodePositionsByFlow, setNodePositionsByFlow] = useState<
    Record<string, Record<BlockId, NodePosition | undefined>>
  >({});

  const activeFlow = workspace.activeFlowId ? workspace.flows.get(workspace.activeFlowId) : undefined;
  const editingBlock = editingBlockId ? workspace.blocks.get(editingBlockId) : undefined;
  const validationErrors = useMemo(() => validateWorkspace(workspace), [workspace]);
  const runCommand = <T extends CommandResult>(label: string, operation: (current: WorkspaceState) => T): T | undefined => {
    try {
      const result = operation(workspace);
      setWorkspace(result.workspace);
      setMessage(`${label} 완료`);
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "작업을 완료하지 못했습니다.");
      return undefined;
    }
  };

  const openBlockEditor = (blockId: BlockId, source = workspace) => {
    const block = source.blocks.get(blockId);
    if (!block) return;
    setWorkspace((current) => ({ ...current, selectedBlockId: blockId }));
    setIsEditorOpen(true);
    setEditingBlockId(blockId);
    setDraftTitle(block.title ?? "");
    setDraftMarkdown(block.markdown);
    setBlockMoveTarget("");
  };

  const addAfter = (blockId?: BlockId) => {
    if (!activeFlow) return;
    const result = runCommand("다음 노드 추가", (current) => createBlockAfter(current, activeFlow.id, blockId));
    if (result && "blockId" in result && blockId) {
      const sourcePosition = nodePositionsByFlow[activeFlow.id]?.[blockId];
      if (sourcePosition) {
        setNodePositionsByFlow((current) => ({
          ...current,
          [activeFlow.id]: { ...current[activeFlow.id], [result.blockId]: sourcePosition },
        }));
      }
    }
  };

  const createBranch = (blockId: BlockId) => {
    if (!activeFlow) return;
    const result = runCommand("갈래 생성", (current) => createBranchWithBlock(current, activeFlow.id, blockId));
    if (result && "blockId" in result) {
      const sourcePosition = nodePositionsByFlow[activeFlow.id]?.[blockId];
      if (sourcePosition) {
        setNodePositionsByFlow((current) => ({
          ...current,
          [activeFlow.id]: { ...current[activeFlow.id], [result.blockId]: sourcePosition },
        }));
      }
    }
  };

  const renameBlockTitle = (blockId: BlockId, title: string) => {
    runCommand("노드 제목 변경", (current) => {
      const block = current.blocks.get(blockId);
      return updateBlock(current, blockId, { title, markdown: block?.markdown ?? "" });
    });
    if (editingBlockId === blockId) setDraftTitle(title);
  };

  const handleCreateFlow = (event: FormEvent) => {
    event.preventDefault();
    runCommand("Flow 생성", (current) => createFlow(current, newFlowTitle));
    setNewFlowTitle("");
  };

  const saveBlock = (event: FormEvent) => {
    event.preventDefault();
    if (!editingBlock) return;
    runCommand("노드 내용 저장", (current) =>
      updateBlock(current, editingBlock.id, { title: draftTitle, markdown: draftMarkdown }),
    );
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <div>
            <p className="eyebrow">FLOW MEMO · CANVAS</p>
            <h1>생각의 흐름</h1>
          </div>
        </div>

        <form className="new-flow-form" onSubmit={handleCreateFlow}>
          <label htmlFor="new-flow-title">새 Flow</label>
          <div className="new-flow-row">
            <input
              id="new-flow-title"
              value={newFlowTitle}
              onChange={(event) => setNewFlowTitle(event.target.value)}
              placeholder="예: 저장 구조 고민"
            />
            <button className="button button-primary" type="submit">만들기</button>
          </div>
        </form>

        <nav className="flow-list" aria-label="Flow 목록">
          <p className="section-label">FLOWS · {workspace.flows.size}</p>
          {[...workspace.flows.values()].map((flow) => (
            <button
              className={`flow-list-item ${flow.id === activeFlow?.id ? "is-active" : ""}`}
              type="button"
              key={flow.id}
              onClick={() => {
                setWorkspace({ ...workspace, activeFlowId: flow.id, selectedBlockId: undefined });
                setEditingBlockId(undefined);
                setMessage(`${flow.title} 열기`);
              }}
            >
              <span>{flow.title}</span>
              <small>{buildLocationIndex({ ...workspace, flows: new Map([[flow.id, flow]]) }).size} nodes</small>
            </button>
          ))}
        </nav>

        <div className={`validation-panel ${validationErrors.length ? "has-errors" : ""}`}>
          <p className="section-label">TREE CHECK</p>
          {validationErrors.length === 0 ? <p>✓ 구조가 올바릅니다</p> : <ul>{validationErrors.map((error) => <li key={error}>{error}</li>)}</ul>}
        </div>
      </aside>

      <section className="workspace">
        {activeFlow ? (
          <>
            <header className="workspace-header">
              <div>
                <p className="eyebrow">HORIZONTAL FLOW MAP</p>
                <input
                  className="flow-title-input"
                  value={activeFlow.title}
                  onChange={(event) => runCommand("Flow 이름 변경", (current) => renameFlow(current, activeFlow.id, event.currentTarget.value))}
                  aria-label="Flow 이름"
                />
              </div>
              <div className="workspace-header-actions">
                <button className="button button-quiet editor-toggle" type="button" onClick={() => setIsEditorOpen((current) => !current)}>
                  {isEditorOpen ? "편집 창 닫기" : "편집 창 열기"}
                </button>
                <div className="runtime-badge">IN MEMORY · 저장되지 않음</div>
              </div>
            </header>
            <div className="command-status" role="status">{message}</div>
            <div className={`flow-work-area ${isEditorOpen ? "has-editor" : ""}`}>
              <FlowCanvas
                workspace={workspace}
                flow={activeFlow}
                onOpenBlock={openBlockEditor}
                onRenameBlock={renameBlockTitle}
                nodePositions={nodePositionsByFlow[activeFlow.id] ?? {}}
                onNodePositionChange={(blockId, position) =>
                  setNodePositionsByFlow((current) => ({
                    ...current,
                    [activeFlow.id]: { ...current[activeFlow.id], [blockId]: position },
                  }))
                }
                onAddAfter={addAfter}
                onCreateBranch={createBranch}
              />

              {isEditorOpen && editingBlock && (
                <form className="node-editor" aria-labelledby="node-editor-title" onSubmit={saveBlock}>
                  <header className="node-editor-header">
                    <div>
                      <p className="eyebrow">NODE EDITOR</p>
                      <h2 id="node-editor-title">노드 내용 편집</h2>
                    </div>
                    <button className="editor-close" type="button" onClick={() => setIsEditorOpen(false)} aria-label="편집 창 닫기">×</button>
                  </header>
                  <label className="editor-field">
                    <span>제목</span>
                    <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="노드 제목" />
                  </label>
                  <label className="editor-field">
                    <span>내용</span>
                    <textarea value={draftMarkdown} onChange={(event) => setDraftMarkdown(event.target.value)} placeholder="생각을 자세히 적어보세요…" rows={12} />
                  </label>
                  <div className="editor-structure-actions">
                    <button className="button button-quiet" type="button" onClick={() => addAfter(editingBlock.id)}>다음 노드</button>
                    <button className="button button-quiet" type="button" onClick={() => createBranch(editingBlock.id)}>갈래 만들기</button>
                    <button className="button button-quiet" type="button" onClick={() => activeFlow && runCommand("노드 앞으로 이동", (current) => moveBlockByOffset(current, activeFlow.id, editingBlock.id, -1))}>← 순서</button>
                    <button className="button button-quiet" type="button" onClick={() => activeFlow && runCommand("노드 뒤로 이동", (current) => moveBlockByOffset(current, activeFlow.id, editingBlock.id, 1))}>순서 →</button>
                  </div>
                  <div className="editor-move-row">
                    <select value={blockMoveTarget} onChange={(event) => setBlockMoveTarget(event.target.value)} aria-label="노드 이동 대상 갈래">
                      <option value="">다른 갈래로 이동…</option>
                      {[...activeFlow.branches.values()].map((branch) => <option key={branch.id} value={branch.id}>{getBranchLabel(activeFlow, branch)}</option>)}
                    </select>
                    <button
                      className="button button-quiet"
                      type="button"
                      disabled={!blockMoveTarget}
                      onClick={() => blockMoveTarget && runCommand("노드 이동", (current) => {
                        const targetBranch = current.flows.get(activeFlow.id)?.branches.get(blockMoveTarget);
                        return moveBlock(current, activeFlow.id, editingBlock.id, blockMoveTarget, targetBranch?.itemIds.length ?? 0);
                      })}
                    >이동</button>
                  </div>
                  <footer className="node-editor-footer">
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => {
                        if (window.confirm("이 노드부터 이어지는 흐름을 삭제할까요?")) {
                          runCommand("노드 흐름 삭제", (current) => deleteBlockSubtree(current, activeFlow.id, editingBlock.id));
                          setEditingBlockId(undefined);
                        }
                      }}
                    >삭제</button>
                    <div><button className="button button-quiet" type="button" onClick={() => setIsEditorOpen(false)}>닫기</button><button className="button button-primary" type="submit">저장</button></div>
                  </footer>
                </form>
              )}
              {isEditorOpen && !editingBlock && (
                <aside className="node-editor node-editor-empty" aria-label="빈 노드 편집 창">
                  <header className="node-editor-header">
                    <div>
                      <p className="eyebrow">NODE EDITOR</p>
                      <h2>노드 내용 편집</h2>
                    </div>
                    <button className="editor-close" type="button" onClick={() => setIsEditorOpen(false)} aria-label="편집 창 닫기">×</button>
                  </header>
                  <div className="editor-empty-state">
                    <span aria-hidden="true">○</span>
                    <p>선택된 노드가 없습니다.</p>
                    <small>왼쪽 플로우에서 노드를 선택하면 이곳에서 내용을 편집할 수 있습니다.</small>
                  </div>
                </aside>
              )}
            </div>
          </>
        ) : (
          <section className="empty-workspace">
            <p className="eyebrow">FLOW MEMO</p>
            <h2>생각이 시작되는 흐름을 만드세요.</h2>
            <p>Flow 하나를 만든 뒤, 노드를 오른쪽으로 이어 쓰고 필요한 곳에서 갈래를 만들어 보세요.</p>
          </section>
        )}
      </section>

    </main>
  );
}

export default App;
