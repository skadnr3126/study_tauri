import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

const emptyDraft = { title: "", content: "", tags: "" };

function App() {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading notes...");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadNotes();
  }, []);

  const filteredNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return notes;
    }

    return notes.filter((note) =>
      [note.title, note.content, ...note.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [notes, query]);

  async function loadNotes() {
    try {
      const loadedNotes = await invoke("load_notes");
      setNotes(loadedNotes);
      setStatus(`Loaded ${loadedNotes.length} note(s) from Rust.`);
    } catch (error) {
      setStatus(`Could not load notes: ${error}`);
    }
  }

  async function saveNotes(nextNotes) {
    setIsSaving(true);
    try {
      const savedPath = await invoke("save_notes", { notes: nextNotes });
      setStatus(`Saved locally: ${savedPath}`);
    } catch (error) {
      setStatus(`Could not save notes: ${error}`);
    } finally {
      setIsSaving(false);
    }
  }

  function updateDraft(event) {
    const { name, value } = event.currentTarget;
    setDraft((currentDraft) => ({ ...currentDraft, [name]: value }));
  }

  async function addNote(event) {
    event.preventDefault();

    const title = draft.title.trim();
    const content = draft.content.trim();
    if (!title || !content) {
      setStatus("Write both a title and a memo before adding a note.");
      return;
    }

    const note = {
      id: crypto.randomUUID(),
      title,
      content,
      tags: draft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      createdAt: new Date().toISOString(),
    };
    const nextNotes = [note, ...notes];

    setNotes(nextNotes);
    setDraft(emptyDraft);
    await saveNotes(nextNotes);
  }

  async function removeNote(id) {
    const nextNotes = notes.filter((note) => note.id !== id);
    setNotes(nextNotes);
    await saveNotes(nextNotes);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Tauri learning project</p>
          <h1>Idea Garden</h1>
          <p className="subtitle">
            Capture rough thoughts. React owns the screen; Rust saves the file.
          </p>
        </div>
        <div className="header-badge">
          <strong>{notes.length}</strong>
          <span>saved ideas</span>
        </div>
      </header>

      <section className="workspace">
        <form className="composer panel" onSubmit={addNote}>
          <div>
            <p className="eyebrow">New thought</p>
            <h2>Capture an idea</h2>
          </div>

          <label>
            Title
            <input
              name="title"
              value={draft.title}
              onChange={updateDraft}
              placeholder="Offline-first brainstorming app"
            />
          </label>

          <label>
            Memo
            <textarea
              name="content"
              value={draft.content}
              onChange={updateDraft}
              placeholder="What problem does this idea solve?"
              rows="7"
            />
          </label>

          <label>
            Tags
            <input
              name="tags"
              value={draft.tags}
              onChange={updateDraft}
              placeholder="product, ux, later"
            />
          </label>

          <button className="primary-button" type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Add note"}
          </button>
        </form>

        <section className="notes-area">
          <div className="notes-toolbar">
            <div>
              <p className="eyebrow">Local notes</p>
              <h2>Brainstorm board</h2>
            </div>
            <input
              className="search-input"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search ideas"
              aria-label="Search ideas"
            />
          </div>

          <p className="status-line">{status}</p>

          <div className="notes-grid">
            {filteredNotes.length === 0 ? (
              <article className="empty-state panel">
                <h3>No matching ideas yet</h3>
                <p>Add a note or change the search text.</p>
              </article>
            ) : (
              filteredNotes.map((note) => (
                <article className="note-card panel" key={note.id}>
                  <div className="note-card-header">
                    <h3>{note.title}</h3>
                    <button
                      className="delete-button"
                      type="button"
                      onClick={() => removeNote(note.id)}
                      aria-label={`Delete ${note.title}`}
                    >
                      Delete
                    </button>
                  </div>
                  <p className="note-content">{note.content}</p>
                  <div className="note-footer">
                    <div className="tag-list">
                      {note.tags.map((tag) => (
                        <span className="tag" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <time dateTime={note.createdAt}>
                      {new Date(note.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

export default App;
