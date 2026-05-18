import { readFile, writeFile } from "node:fs/promises";

interface Macro {
  name: string;
  commands: string[];
  createdAt: string;
}

export class MacroRecorder {
  private macros: Map<string, Macro> = new Map();
  private currentName: string | null = null;
  private currentCommands: string[] = [];

  startRecording(name: string): void {
    this.currentName = name;
    this.currentCommands = [];
  }

  stopRecording(): void {
    if (this.currentName) {
      this.macros.set(this.currentName, {
        name: this.currentName,
        commands: [...this.currentCommands],
        createdAt: new Date().toISOString(),
      });
    }
    this.currentName = null;
    this.currentCommands = [];
  }

  addCommand(cmd: string): void {
    if (this.currentName) {
      this.currentCommands.push(cmd);
    }
  }

  getCommands(name: string): string[] | null {
    const macro = this.macros.get(name);
    return macro ? macro.commands : null;
  }

  list(): Array<{ name: string; commandCount: number; createdAt: string }> {
    return Array.from(this.macros.values()).map(m => ({
      name: m.name,
      commandCount: m.commands.length,
      createdAt: m.createdAt,
    }));
  }

  async save(filePath: string): Promise<void> {
    const data = {
      macros: Array.from(this.macros.values()),
    };
    await writeFile(filePath, JSON.stringify(data, null, 2));
  }

  async load(filePath: string): Promise<void> {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (!data.macros || !Array.isArray(data.macros)) {
      throw new Error("Invalid macro file format");
    }
    for (const m of data.macros) {
      if (m.name && Array.isArray(m.commands)) {
        this.macros.set(m.name, {
          name: m.name,
          commands: m.commands,
          createdAt: m.createdAt || new Date().toISOString(),
        });
      }
    }
  }
}
