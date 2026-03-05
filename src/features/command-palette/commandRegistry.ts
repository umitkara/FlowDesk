import type { Command } from "../../lib/types";

/** Singleton registry for command palette commands. */
class CommandRegistry {
  private commands = new Map<string, Command>();
  private listeners: Array<() => void> = [];

  /** Registers a command. */
  register(command: Command) {
    this.commands.set(command.id, command);
    this.notify();
  }

  /** Registers multiple commands at once. */
  registerMany(commands: Command[]) {
    for (const cmd of commands) {
      this.commands.set(cmd.id, cmd);
    }
    this.notify();
  }

  /** Unregisters a command by ID. */
  unregister(id: string) {
    this.commands.delete(id);
    this.notify();
  }

  /** Gets all registered commands. */
  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  /** Gets a command by ID. */
  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  /** Subscribes to changes. Returns unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/** Global command registry instance. */
export const commandRegistry = new CommandRegistry();
