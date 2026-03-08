use serde::{Deserialize, Serialize};

/// Describes the type of operation that was performed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OperationType {
    Update,
    Delete,
    StatusChange,
}

/// Entity type for undo/redo.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UndoEntityType {
    Note,
    Task,
}

/// An undoable operation that captures the previous state.
#[derive(Debug, Clone)]
pub struct UndoableOperation {
    pub operation_type: OperationType,
    pub entity_type: UndoEntityType,
    pub entity_id: String,
    pub previous_state: serde_json::Value,
    pub after_state: serde_json::Value,
    pub description: String,
    pub timestamp: String,
}

/// Current state of the undo/redo stack, exposed to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct UndoRedoState {
    pub can_undo: bool,
    pub can_redo: bool,
    pub undo_description: Option<String>,
    pub redo_description: Option<String>,
}

/// Description of an undoable operation for display.
#[derive(Debug, Clone, Serialize)]
pub struct UndoDescription {
    pub description: String,
    pub entity_type: String,
    pub entity_id: String,
}

/// In-memory undo/redo history with a fixed max size.
pub struct OperationHistory {
    undo_stack: Vec<UndoableOperation>,
    redo_stack: Vec<UndoableOperation>,
    max_size: usize,
}

impl OperationHistory {
    /// Creates a new empty history with the given maximum size.
    pub fn new(max_size: usize) -> Self {
        Self {
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            max_size,
        }
    }

    /// Pushes a new operation onto the undo stack, clearing the redo stack.
    pub fn push(&mut self, op: UndoableOperation) {
        self.redo_stack.clear();
        self.undo_stack.push(op);
        if self.undo_stack.len() > self.max_size {
            self.undo_stack.remove(0);
        }
    }

    /// Pops the most recent operation from the undo stack for undoing.
    pub fn undo(&mut self) -> Option<UndoableOperation> {
        if let Some(op) = self.undo_stack.pop() {
            self.redo_stack.push(op.clone());
            Some(op)
        } else {
            None
        }
    }

    /// Pops the most recent operation from the redo stack for redoing.
    pub fn redo(&mut self) -> Option<UndoableOperation> {
        if let Some(op) = self.redo_stack.pop() {
            self.undo_stack.push(op.clone());
            Some(op)
        } else {
            None
        }
    }

    /// Returns whether an undo operation is available.
    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    /// Returns whether a redo operation is available.
    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    /// Returns the current undo/redo state for the frontend.
    pub fn state(&self) -> UndoRedoState {
        UndoRedoState {
            can_undo: self.can_undo(),
            can_redo: self.can_redo(),
            undo_description: self.undo_stack.last().map(|op| op.description.clone()),
            redo_description: self.redo_stack.last().map(|op| op.description.clone()),
        }
    }
}
