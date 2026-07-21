import { useMemo, useState } from "react";
import {
  BlockId,
  BranchId,
  CommandResult,
  WorkspaceState,
  createBlockAfter,
  createBranchWithBlock,
  createFlow,
  createWorkspace,
  deleteBlockSubtree,
  moveBlock,
  moveBlockByOffset,
  renameFlow,
  updateBlock,
  validateWorkspace,
} from "./domain/flow";
import { FlowCanvas, NodePosition } from "./components/FlowCanvas";
import { NodeEditor } from "./components/NodeEditor";
import { Sidebar } from "./components/Sidebar";
import "./App.css";

function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => createWorkspace());
  const [message, setMessage] = useState("새 Flow를 만들어 구조를 시작하세요.");
  const [editingBlockId, setEditingBlockId] = useState<BlockId>();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [nodePositionsByFlow, setNodePositionsByFlow] = useState<Record<string, Record<BlockId, NodePosition | undefined>>>({});

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

  const saveBlock = (blockId: BlockId, title: string, markdown: string) => {
    runCommand("노드 내용 저장", (current) => updateBlock(current, blockId, { title, markdown }));
  };

  const moveBlockToBranch = (blockId: BlockId, targetBranchId: BranchId) => {
    if (!activeFlow) return;
    runCommand("노드 이동", (current) => {
      const targetBranch = current.flows.get(activeFlow.id)?.branches.get(targetBranchId);
      return moveBlock(current, activeFlow.id, blockId, targetBranchId, targetBranch?.itemIds.length ?? 0);
    });
  };

  const deleteBlock = (blockId: BlockId) => {
    if (!activeFlow) return;
    runCommand("노드 흐름 삭제", (current) => deleteBlockSubtree(current, activeFlow.id, blockId));
    setEditingBlockId(undefined);
  };

  return (
    <main className="app-shell">
      <Sidebar
        flows={[...workspace.flows.values()]}
        activeFlowId={activeFlow?.id}
        validationErrors={validationErrors}
        onCreateFlow={(title) => runCommand("Flow 생성", (current) => createFlow(current, title))}
        onSelectFlow={(flowId) => {
          const flow = workspace.flows.get(flowId);
          setWorkspace({ ...workspace, activeFlowId: flowId, selectedBlockId: undefined });
          setEditingBlockId(undefined);
          setMessage(`${flow?.title ?? "Flow"} 열기`);
        }}
      />
      <section className="workspace">
        {activeFlow ? (
          <>
            <header className="workspace-header">
              <div>
                <p className="eyebrow">HORIZONTAL FLOW MAP</p>
                <input className="flow-title-input" value={activeFlow.title} onChange={(event) => runCommand("Flow 이름 변경", (current) => renameFlow(current, activeFlow.id, event.currentTarget.value))} aria-label="Flow 이름" />
              </div>
              <div className="workspace-header-actions">
                <button className="button button-quiet editor-toggle" type="button" onClick={() => setIsEditorOpen((current) => !current)}>{isEditorOpen ? "편집 창 닫기" : "편집 창 열기"}</button>
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
                onNodePositionChange={(blockId, position) => setNodePositionsByFlow((current) => ({ ...current, [activeFlow.id]: { ...current[activeFlow.id], [blockId]: position } }))}
                onAddAfter={addAfter}
                onCreateBranch={createBranch}
              />
              {isEditorOpen && (
                <NodeEditor
                  key={editingBlockId ?? "empty"}
                  flow={activeFlow}
                  block={editingBlock}
                  draftTitle={draftTitle}
                  draftMarkdown={draftMarkdown}
                  onClose={() => setIsEditorOpen(false)}
                  onDraftTitleChange={setDraftTitle}
                  onDraftMarkdownChange={setDraftMarkdown}
                  onSave={saveBlock}
                  onAddAfter={addAfter}
                  onCreateBranch={createBranch}
                  onMoveByOffset={(blockId, offset) => runCommand(offset < 0 ? "노드 앞으로 이동" : "노드 뒤로 이동", (current) => moveBlockByOffset(current, activeFlow.id, blockId, offset))}
                  onMove={moveBlockToBranch}
                  onDelete={deleteBlock}
                />
              )}
            </div>
          </>
        ) : (
          <section className="empty-workspace"><p className="eyebrow">FLOW MEMO</p><h2>생각이 시작되는 흐름을 만드세요.</h2><p>Flow 하나를 만든 뒤, 노드를 오른쪽으로 이어 쓰고 필요한 곳에서 갈래를 만들어 보세요.</p></section>
        )}
      </section>
    </main>
  );
}

export default App;
