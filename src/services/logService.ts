import * as vscode from 'vscode';

/**
 * Log levels for agent execution
 */
export enum LogLevel {
  INTERNAL = 'internal', // Console only
  THINKING = 'thinking', // Displayed on screen with less contrast
  PUBLIC = 'public',     // Normal response formatting
  DIFF = 'diff',         // Rendered in a separate frame with diff highlighting
  TOOL = 'tool',         // Tool usage, displayed in a thin frame with small borders
  ERROR = 'error'        // Error messages, displayed in red
}

/**
 * Service for handling logs during agent execution with different visibility levels
 */
export class LogService {
  private _onLogMessage = new vscode.EventEmitter<{level: LogLevel, message: string, isNewType?: boolean}>();
  public readonly onLogMessage = this._onLogMessage.event;
  private _previousLogLevel?: LogLevel;

  /**
   * Log a message with the specified level
   * 
   * @param level The log level (internal, thinking, public, diff, tool)
   * @param message The message to log
   */
  log(level: LogLevel, message: string): void {
    // Always log to console
    if (level === LogLevel.INTERNAL) {
      console.log(`[INTERNAL] ${message}`);
    } else if (level === LogLevel.THINKING) {
      console.log(`[THINKING] ${message}`);
    } else if (level === LogLevel.DIFF) {
      console.log(`[DIFF] ${message}`);
    } else if (level === LogLevel.TOOL) {
      console.log(`[TOOL] ${message}`);
    } else if (level === LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`);
    } else {
      console.log(`[PUBLIC] ${message}`);
    }

    // Check if this is a new log type
    const isNewType = this._previousLogLevel !== undefined && this._previousLogLevel !== level;
    
    // Update previous log level
    this._previousLogLevel = level;

    // Emit event for UI updates (except internal logs)
    if (level !== LogLevel.INTERNAL) {
      this._onLogMessage.fire({ level, message, isNewType });
    }
  }

  /**
   * Log an internal message (console only)
   * 
   * @param message The message to log
   */
  internal(message: string): void {
    this.log(LogLevel.INTERNAL, message);
  }

  /**
   * Log a thinking message (displayed with less contrast)
   * 
   * @param message The message to log
   */
  thinking(message: string): void {
    this.log(LogLevel.THINKING, message);
  }

  /**
   * Log a public message (normal response formatting)
   * 
   * @param message The message to log
   */
  public(message: string): void {
    this.log(LogLevel.PUBLIC, message);
  }

  /**
   * Log a diff message (rendered with diff syntax highlighting)
   * 
   * @param message The diff content to log
   */
  diff(message: string): void {
    this.log(LogLevel.DIFF, message);
  }

  /**
   * Log a tool usage message (displayed in a thin frame with small borders)
   * 
   * @param toolName The name of the tool being used
   * @param message The message to log
   */
  tool(toolName: string, message: string): void {
    this.log(LogLevel.TOOL, `${toolName}: ${message}`);
  }

  /**
   * Log an error message (displayed in red)
   * 
   * @param source The source of the error
   * @param message The error message to log
   */
  error(source: string, message: string): void {
    this.log(LogLevel.ERROR, `${source}: ${message}`);
  }
} 