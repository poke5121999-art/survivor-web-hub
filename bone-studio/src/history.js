// Undo/redo over the command reducer. A group is one user gesture or one agent turn.
import { apply } from "./commands.js?v=20261125h";

export class History {
  constructor(doc, { limit = 300, onChange } = {}) {
    this.doc = doc; this.undoStack = []; this.redoStack = []; this.limit = limit; this.open = null; this.onChange = onChange;
  }
  // Starts a group; commands applied until end() undo together. Nested begins join the outer group.
  begin(label) {
    if (this.open) { this.open.depth++; return this.open; }
    this.open = { label, cmds: [], inverses: [], depth: 1 };
    return this.open;
  }
  end() {
    const g = this.open;
    if (!g || --g.depth > 0) return;
    this.open = null;
    if (!g.cmds.length) return;
    this.undoStack.push({ label: g.label, cmds: g.cmds, inverses: g.inverses });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }
  // Applies one command (throws CommandError, doc unchanged). Outside a group it is its own group.
  run(cmd, label) {
    const solo = !this.open;
    if (solo) this.begin(label ?? cmd.type);
    try {
      const r = apply(this.doc, cmd);
      this.doc = r.doc;
      this.open.cmds.push(cmd);
      this.open.inverses.unshift(r.inverse);
    } finally {
      if (solo) this.end();
    }
    this.onChange?.(this.doc, cmd);
    return this.doc;
  }
  // Replaces the last command of the open group when it targets the same thing (drags emit many sets).
  runCoalesced(cmd, key) {
    const g = this.open;
    if (g && g.lastKey === key && g.cmds.length) {
      this.doc = apply(this.doc, g.inverses[0]).doc;
      g.cmds.pop(); g.inverses.shift();
    }
    this.run(cmd);
    if (this.open) this.open.lastKey = key;
  }
  // Throws away everything the open group did.
  cancel() {
    const g = this.open;
    if (!g) return;
    for (const inv of g.inverses) this.doc = apply(this.doc, inv).doc;
    this.open = null;
    this.onChange?.(this.doc, { type: "$cancel" });
  }
  undo() {
    if (this.open) this.end();
    const g = this.undoStack.pop();
    if (!g) return false;
    for (const inv of g.inverses) this.doc = apply(this.doc, inv).doc;
    this.redoStack.push(g);
    this.onChange?.(this.doc, { type: "$undo", label: g.label });
    return true;
  }
  redo() {
    const g = this.redoStack.pop();
    if (!g) return false;
    const inverses = [];
    for (const c of g.cmds) { const r = apply(this.doc, c); this.doc = r.doc; inverses.unshift(r.inverse); }
    this.undoStack.push({ ...g, inverses });
    this.onChange?.(this.doc, { type: "$redo", label: g.label });
    return true;
  }
  reset(doc) { this.doc = doc; this.undoStack = []; this.redoStack = []; this.open = null; this.onChange?.(doc, { type: "$reset" }); }
}
