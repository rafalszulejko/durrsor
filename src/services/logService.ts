import * as vscode from 'vscode';
import { FileService } from './fileService';

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
 * Implemented as a singleton to allow access from anywhere in the application
 */
export class LogService {
  private static instance: LogService;
  private _onLogMessage = new vscode.EventEmitter<{level: LogLevel, message: string, isNewType?: boolean}>();
  public readonly onLogMessage = this._onLogMessage.event;
  private _previousLogLevel?: LogLevel;
  private _logs: string[] = [];
  private _threadId?: string;
  private _fileService: FileService;
  private _saveLogsToFile: boolean = true;

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this._fileService = new FileService();
    this.loadConfig();
  }

  /**
   * Get the singleton instance of LogService
   * 
   * @returns The LogService instance
   */
  public static getInstance(): LogService {
    if (!LogService.instance) {
      LogService.instance = new LogService();
    }
    return LogService.instance;
  }

  /**
   * Load configuration from VSCode settings
   */
  private loadConfig(): void {
    const config = vscode.workspace.getConfiguration('durrsor');
    this._saveLogsToFile = config.get<boolean>('saveLogsToFile') ?? true;
    this.internal(`Save logs to file setting: ${this._saveLogsToFile}`);
  }

  /**
   * Refresh configuration from VSCode settings
   * Call this method when settings might have changed
   */
  public refreshConfiguration(): void {
    this.loadConfig();
  }

  /**
   * Set the thread ID for the current session
   * 
   * @param threadId The thread ID to set
   */
  public setThreadId(threadId: string): void {
    this._threadId = threadId;
    this.internal(`Thread ID set to: ${threadId}`);
  }

  /**
   * Log a message with the specified level
   * 
   * @param level The log level (internal, thinking, public, diff, tool)
   * @param message The message to log
   */
  log(level: LogLevel, message: string): void {
    // Format log entry with timestamp
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    // Store log in memory
    this._logs.push(logEntry);
    
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

  /**
   * Save all logs to a file named with the thread ID
   * 
   * @returns Promise that resolves to true if successful, false otherwise
   */
  async saveLogs(): Promise<boolean> {
    // Check if logs should be saved to file
    if (!this._saveLogsToFile) {
      this.internal('Logs not saved to file: saveLogsToFile setting is disabled');
      return false;
    }

    if (!this._threadId) {
      this.error('LogService', 'Cannot save logs: No thread ID set');
      return false;
    }

    const logFileName = `${this._threadId}.log`;
    const logContent = this._logs.join('\n');
    
    try {
      // Use FileService to write the log file
      const result = await this._fileService.writeFileContent(logFileName, logContent);
      
      if (result) {
        this.internal(`Logs saved to ${logFileName}`);
      } else {
        this.error('LogService', `Failed to save logs to ${logFileName}`);
      }
      
      return result;
    } catch (error) {
      this.error('LogService', `Error saving logs: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Clear the logs stored in memory
   */
  clearLogs(): void {
    this._logs = [];
    this.internal('Logs cleared from memory');
  }
} 