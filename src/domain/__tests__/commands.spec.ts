import { describe, expect, it } from 'vitest'
import { CommandHistory, type Command } from '../commands'

/** Test double: commands that append/remove values on a shared log. */
function makeAppend(log: number[], value: number, label = `append ${value}`): Command {
  return {
    label,
    do: () => log.push(value),
    undo: () => log.pop(),
  }
}

describe('CommandHistory', () => {
  it('executes commands and tracks undo/redo availability', () => {
    const history = new CommandHistory()
    const log: number[] = []
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)

    history.execute(makeAppend(log, 1))
    expect(log).toEqual([1])
    expect(history.canUndo).toBe(true)
    expect(history.undoLabel).toBe('append 1')
  })

  it('undoes and redoes in order', () => {
    const history = new CommandHistory()
    const log: number[] = []
    history.execute(makeAppend(log, 1))
    history.execute(makeAppend(log, 2))

    expect(history.undo()).toBe('append 2')
    expect(log).toEqual([1])
    expect(history.canRedo).toBe(true)
    expect(history.redoLabel).toBe('append 2')

    expect(history.redo()).toBe('append 2')
    expect(log).toEqual([1, 2])

    history.undo()
    history.undo()
    expect(log).toEqual([])
    expect(history.undo()).toBeNull()
  })

  it('redo returns null with nothing to redo', () => {
    const history = new CommandHistory()
    expect(history.redo()).toBeNull()
  })

  it('clears the redo stack on a new command', () => {
    const history = new CommandHistory()
    const log: number[] = []
    history.execute(makeAppend(log, 1))
    history.undo()
    history.execute(makeAppend(log, 2))
    expect(history.canRedo).toBe(false)
    expect(log).toEqual([2])
  })

  describe('batches (drag-stroke coalescing)', () => {
    it('coalesces batched commands into one undo entry', () => {
      const history = new CommandHistory()
      const log: number[] = []
      history.beginBatch('Draw stroke')
      history.execute(makeAppend(log, 1))
      history.execute(makeAppend(log, 2))
      history.execute(makeAppend(log, 3))
      history.endBatch()

      expect(log).toEqual([1, 2, 3])
      expect(history.undoLabel).toBe('Draw stroke')
      expect(history.undo()).toBe('Draw stroke')
      expect(log).toEqual([]) // all three undone as one entry
      expect(history.redo()).toBe('Draw stroke')
      expect(log).toEqual([1, 2, 3])
    })

    it('discards empty batches', () => {
      const history = new CommandHistory()
      history.beginBatch('Nothing')
      history.endBatch()
      expect(history.canUndo).toBe(false)
    })

    it('only the outermost endBatch commits when nested', () => {
      const history = new CommandHistory()
      const log: number[] = []
      history.beginBatch('Outer')
      history.execute(makeAppend(log, 1))
      history.beginBatch('Inner')
      history.execute(makeAppend(log, 2))
      history.endBatch()
      expect(history.undoLabel).toBe('Outer') // not yet committed as separate entries
      history.execute(makeAppend(log, 3))
      history.endBatch()

      history.undo()
      expect(log).toEqual([])
    })

    it('undo during an open batch commits it first', () => {
      const history = new CommandHistory()
      const log: number[] = []
      history.beginBatch('Draw stroke')
      history.execute(makeAppend(log, 1))
      history.execute(makeAppend(log, 2))

      expect(history.undo()).toBe('Draw stroke')
      expect(log).toEqual([])
      // Batch is closed; new commands are standalone entries.
      history.execute(makeAppend(log, 9))
      expect(history.undoLabel).toBe('append 9')
    })
  })

  it('drops the oldest entries beyond the history limit', () => {
    const history = new CommandHistory(2)
    const log: number[] = []
    history.execute(makeAppend(log, 1))
    history.execute(makeAppend(log, 2))
    history.execute(makeAppend(log, 3))

    expect(history.undo()).toBe('append 3')
    expect(history.undo()).toBe('append 2')
    expect(history.undo()).toBeNull() // entry 1 was dropped
    expect(log).toEqual([1])
  })

  it('clear empties everything', () => {
    const history = new CommandHistory()
    const log: number[] = []
    history.execute(makeAppend(log, 1))
    history.undo()
    history.clear()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(false)
  })
})
