/**
 * Command layer — every project mutation flows through a Command so the
 * project-wide undo stack (PLAN.md Decision 3) stays tractable.
 *
 * Drag strokes coalesce via batches: `beginBatch(label)` … `execute()` × n …
 * `endBatch()` collapses many granular commands into one undo entry.
 */

export interface Command {
  label: string
  do(): void
  undo(): void
}

interface HistoryEntry {
  label: string
  commands: Command[]
}

export const DEFAULT_HISTORY_LIMIT = 200

export class CommandHistory {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private openBatch: HistoryEntry | null = null
  private batchDepth = 0
  private readonly limit: number

  constructor(limit: number = DEFAULT_HISTORY_LIMIT) {
    this.limit = limit
  }

  /** Run a command and record it (into the open batch, if any). */
  execute(command: Command): void {
    command.do()
    this.redoStack = []
    if (this.openBatch) {
      this.openBatch.commands.push(command)
    } else {
      this.push({ label: command.label, commands: [command] })
    }
  }

  /**
   * Start coalescing subsequent commands into a single undo entry labeled
   * `label`. Batches may nest; only the outermost `endBatch` commits.
   */
  beginBatch(label: string): void {
    if (this.batchDepth === 0) {
      this.openBatch = { label, commands: [] }
    }
    this.batchDepth++
  }

  /** Commit the open batch. Empty batches are discarded. */
  endBatch(): void {
    if (this.batchDepth === 0) return
    this.batchDepth--
    if (this.batchDepth > 0) return
    const batch = this.openBatch
    this.openBatch = null
    if (batch && batch.commands.length > 0) {
      this.push(batch)
    }
  }

  /** Undo the most recent entry. Returns its label, or null if nothing to undo. */
  undo(): string | null {
    this.commitOpenBatch()
    const entry = this.undoStack.pop()
    if (!entry) return null
    for (let i = entry.commands.length - 1; i >= 0; i--) {
      entry.commands[i]?.undo()
    }
    this.redoStack.push(entry)
    return entry.label
  }

  /** Redo the most recently undone entry. Returns its label, or null. */
  redo(): string | null {
    this.commitOpenBatch()
    const entry = this.redoStack.pop()
    if (!entry) return null
    for (const command of entry.commands) {
      command.do()
    }
    this.undoStack.push(entry)
    return entry.label
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 || (this.openBatch?.commands.length ?? 0) > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoLabel(): string | null {
    return this.openBatch?.commands.length
      ? this.openBatch.label
      : (this.undoStack[this.undoStack.length - 1]?.label ?? null)
  }

  get redoLabel(): string | null {
    return this.redoStack[this.redoStack.length - 1]?.label ?? null
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.openBatch = null
    this.batchDepth = 0
  }

  private push(entry: HistoryEntry): void {
    this.undoStack.push(entry)
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift()
    }
  }

  /** Undo/redo during an open batch commits it first (e.g. Ctrl+Z mid-drag). */
  private commitOpenBatch(): void {
    if (this.batchDepth > 0) {
      this.batchDepth = 1
      this.endBatch()
    }
  }
}
