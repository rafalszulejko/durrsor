import * as vscode from 'vscode';

/**
 * Log levels for agent execution
 */
export enum LogLevel {
  INTERNAL = 'internal', // Console only
  THINKING = 'thinking', // Displayed on screen with less contrast
  PUBLIC = 'public'      // Normal response formatting
}

/**
 * Service for handling logs during agent execution with different visibility levels
 */
export class LogService {
  private _onLogMessage = new vscode.EventEmitter<{level: LogLevel, message: string}>();
  public readonly onLogMessage = this._onLogMessage.event;

  /**
   * Log a message with the specified level
   * 
   * @param level The log level (internal, thinking, public)
   * @param message The message to log
   */
  log(level: LogLevel, message: string): void {
    // Always log to console
    if (level === LogLevel.INTERNAL) {
      console.log(`[INTERNAL] ${message}`);
    } else if (level === LogLevel.THINKING) {
      console.log(`[THINKING] ${message}`);
    } else {
      console.log(`[PUBLIC] ${message}`);
    }

    // Emit event for UI updates (except internal logs)
    if (level !== LogLevel.INTERNAL) {
      this._onLogMessage.fire({ level, message });
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
} 