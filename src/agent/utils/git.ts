import * as vscode from 'vscode';

// Define the Change interface based on the git.d.ts file
interface Change {
  readonly uri: vscode.Uri;
  readonly originalUri: vscode.Uri;
  readonly renameUri: vscode.Uri | undefined;
  readonly status: number;
}

/**
 * GitService class for handling git operations using VSCode's Git API
 */
export class GitService {
  /**
   * Get the Git extension and repository
   * 
   * @returns Object containing git API and repository, or null if not available
   */
  private static getGitRepo() {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
      if (!gitExtension) {
        return null;
      }
      
      const git = gitExtension.getAPI(1);
      
      // Get the first repository (most VSCode workspaces have only one)
      // If there are multiple repositories, this will use the first one
      if (git.repositories.length === 0) {
        return null;
      }
      
      return { git, repo: git.repositories[0] };
    } catch (error) {
      console.error('Error accessing Git extension:', error);
      return null;
    }
  }

  /**
   * Run git diff command and return its output.
   * 
   * @returns The output of the git diff command as a string
   */
  public static async diff(): Promise<string> {
    try {
      const gitData = this.getGitRepo();
      if (!gitData) {
        return "Error: Git extension not available";
      }
      
      // Get changes from the repository
      const changes = await gitData.repo.diff();
      return changes || "No changes detected";
    } catch (error: any) {
      console.error('Error running git diff:', error);
      return `Error running git diff: ${error.message}`;
    }
  }

  /**
   * Add all files and commit them with the provided message.
   * 
   * @param commitMessage The message to use for the commit
   * @returns The commit hash of the new commit if successful, or an error message if failed
   */
  public static async addAllAndCommit(commitMessage: string): Promise<string> {
    try {
      console.log(`GitService: Starting addAllAndCommit with message: "${commitMessage}"`);
      
      const gitData = this.getGitRepo();
      if (!gitData) {
        console.log(`GitService: Git extension not available`);
        return "Error: Git extension not available";
      }
      
      console.log(`GitService: Got repository: ${gitData.repo.rootUri.fsPath}`);
      
      // Log repository state
      console.log(`GitService: Repository state:`, {
        headSHA: gitData.repo.state.HEAD?.commit || 'unknown',
        branch: gitData.repo.state.HEAD?.name || 'unknown',
        workingTreeChanges: (gitData.repo.state.workingTreeChanges || []).length,
        indexChanges: (gitData.repo.state.indexChanges || []).length,
        untrackedChanges: (gitData.repo.state.untrackedChanges || []).length
      });
      
      try {
        // Get all changes from the working tree
        const workingTreeChanges = gitData.repo.state.workingTreeChanges;
        
        // Log detailed information about working tree changes
        console.log(`GitService: Found ${workingTreeChanges.length} working tree changes`);
        
        if (workingTreeChanges.length > 0) {
          // Log the first few changes with their status for debugging
          console.log(`GitService: Working tree changes details (first 5):`);
          workingTreeChanges.slice(0, 5).forEach((change: Change, index: number) => {
            console.log(`  Change ${index + 1}:`, {
              path: change.uri.fsPath,
              status: change.status,
              isUntracked: change.status === 7 // Status.UNTRACKED is 7
            });
          });
        }
        
        if (workingTreeChanges.length === 0) {
          console.log(`GitService: No changes to commit`);
          return "No changes to commit";
        }
        
        // Extract file paths from working tree changes
        const pathsToAdd = workingTreeChanges.map((change: Change) => change.uri.fsPath);
        
        // Log the paths we're going to add
        console.log(`GitService: Paths to add (first 5):`, pathsToAdd.slice(0, 5));
        
        // Add all changes
        console.log(`GitService: Adding ${pathsToAdd.length} files`);
        await gitData.repo.add(pathsToAdd);
        
        // Verify that changes were staged
        await gitData.repo.status();
        console.log(`GitService: After staging, index changes:`, gitData.repo.state.indexChanges.length);
        
        // Commit with the provided message
        console.log(`GitService: Attempting to commit with message: "${commitMessage}"`);
        await gitData.repo.commit(commitMessage);
        console.log(`GitService: Successfully committed changes`);
        
        // Get the commit hash
        console.log(`GitService: Attempting to get commit hash`);
        const head = await gitData.repo.getCommit('HEAD');
        console.log(`GitService: Successfully got commit hash: ${head.hash}`);
        
        // Verify that the working tree is clean after commit
        console.log(`GitService: Verifying working tree is clean after commit`);
        const isClean = await this.isWorkingTreeClean();
        if (!isClean) {
          console.error(`GitService: Working tree is not clean after commit`);
          throw new Error("Working tree is not clean after commit. Some changes were not committed.");
        }
        console.log(`GitService: Working tree is clean after commit`);
        
        return head.hash;
      } catch (error: any) {
        console.error(`GitService: Error in git operation: ${error.message}`, error);
        console.error(`GitService: Error stack: ${error.stack}`);
        
        // Try to get more information about the repository state after failure
        try {
          await gitData.repo.status();
          console.log(`GitService: Repository status after failure:`, {
            workingTreeChanges: gitData.repo.state.workingTreeChanges.length,
            indexChanges: gitData.repo.state.indexChanges.length,
            untrackedChanges: gitData.repo.state.untrackedChanges.length
          });
        } catch (statusError) {
          console.error(`GitService: Could not get repository status:`, statusError);
        }
        
        throw error;
      }
    } catch (error: any) {
      console.error('GitService: Error in git operation:', error);
      console.error(`GitService: Error stack: ${error.stack}`);
      return `Error in git operation: ${error.message}`;
    }
  }

  /**
   * Check if the git working tree is clean (no uncommitted changes, untracked files, or staged changes).
   * 
   * @returns True if working tree is clean, False otherwise
   */
  public static async isWorkingTreeClean(): Promise<boolean> {
    try {
      const gitData = this.getGitRepo();
      if (!gitData) {
        return false;
      }
      
      // Check for any changes using the repository state
      // The working tree is clean if there are no changes in any of these arrays
      const hasChanges = 
        gitData.repo.state.workingTreeChanges.length > 0 || 
        gitData.repo.state.indexChanges.length > 0 || 
        gitData.repo.state.mergeChanges.length > 0;
      
      return !hasChanges;
    } catch (error) {
      // If git command fails, assume working tree is not clean
      console.error('Error checking git status:', error);
      return false;
    }
  }

  /**
   * Create and checkout a new git branch.
   * 
   * @param branchName Name of the new branch to create and checkout
   * @returns Success or error message from the git command
   */
  public static async createAndCheckoutBranch(branchName: string): Promise<string> {
    try {
      const gitData = this.getGitRepo();
      if (!gitData) {
        return "Error: Git extension not available";
      }
      
      // Create and checkout the branch
      const fullBranchName = `durrsor-${branchName}`;
      await gitData.repo.createBranch(fullBranchName, true);
      await gitData.repo.checkout(fullBranchName);
      
      return `Successfully created and checked out branch: ${fullBranchName}`;
    } catch (error: any) {
      console.error('Error creating branch:', error);
      return `Error creating branch: ${error.message}`;
    }
  }

  /**
   * Get the name of the current git branch.
   * 
   * @returns The name of the current branch as a string, or error message if failed
   */
  public static async getCurrentBranch(): Promise<string> {
    try {
      const gitData = this.getGitRepo();
      if (!gitData) {
        return "Error: Git extension not available";
      }
      
      // Get the current branch
      const head = gitData.repo.state.HEAD;
      if (head && head.name) {
        return head.name;
      } else {
        return "Error: Could not determine current branch";
      }
    } catch (error: any) {
      console.error('Error getting current branch:', error);
      return `Error getting current branch: ${error.message}`;
    }
  }

  /**
   * Squash and merge all commits from the current branch and merge them into the target branch.
   * 
   * @param targetBranch The branch to merge into
   * @param commitMessage Optional custom commit message for the squashed commit
   * @returns Success or error message from the git operation
   */
  public static async squashAndMergeToBranch(
    targetBranch: string, 
    commitMessage?: string
  ): Promise<string> {
    try {
      const gitData = this.getGitRepo();
      if (!gitData) {
        return "Error: Git extension not available";
      }
      
      // First ensure working tree is clean
      const isClean = await this.isWorkingTreeClean();
      if (!isClean) {
        return "Error: Working tree is not clean. Please commit or stash changes first.";
      }
      
      // Get current branch name
      const currentBranch = await this.getCurrentBranch();
      if (currentBranch.startsWith("Error")) {
        return currentBranch;
      }
      
      // If no commit message provided, create a default one
      if (!commitMessage) {
        commitMessage = `Squashed commits from ${currentBranch} into ${targetBranch}`;
      }
      
      // Note: VSCode Git API doesn't directly support squash merge
      // We'll need to use a combination of operations to achieve this
      
      // Store current changes
      const changes = await gitData.repo.diff();
      
      // Checkout target branch
      await gitData.repo.checkout(targetBranch);
      
      // Merge with squash (this is a limitation - VSCode API doesn't have direct squash merge)
      // We'll need to apply the changes manually
      try {
        // This is a simplified approach - in a real implementation, you might need
        // to handle conflicts and other edge cases
        if (changes) {
          // Apply changes to the target branch
          // This is a simplified approach and may not work for all cases
          await gitData.repo.apply(changes);
          
          // Commit the changes
          await gitData.repo.commit(commitMessage);
        }
        
        // Get the commit hash
        const head = await gitData.repo.getCommit('HEAD');
        
        return `Successfully applied changes from ${currentBranch} to ${targetBranch}\nCommit: ${head.hash}`;
      } catch (error: any) {
        console.error('Error during squash merge:', error);
        return `Error during squash merge: ${error.message}`;
      }
    } catch (error: any) {
      console.error('Error during squash merge:', error);
      return `Error during squash merge: ${error.message}`;
    }
  }

  /**
   * Reset to a specific commit with a hard reset (discards all changes)
   * 
   * @param commitHash The commit hash to reset to
   * @returns Success or error message from the git operation
   */
  public static async resetToCommit(commitHash: string): Promise<string> {
    try {
      console.log(`GitService: Starting resetToCommit with hash: "${commitHash}"`);
      
      const gitData = this.getGitRepo();
      if (!gitData) {
        console.log(`GitService: Git extension not available`);
        return "Error: Git extension not available";
      }
      
      console.log(`GitService: Got repository: ${gitData.repo.rootUri.fsPath}`);
      
      // Log repository state
      console.log(`GitService: Repository state before reset:`, {
        headSHA: gitData.repo.state.HEAD?.commit || 'unknown',
        branch: gitData.repo.state.HEAD?.name || 'unknown',
        workingTreeChanges: (gitData.repo.state.workingTreeChanges || []).length
      });
      
      // The VSCode Git API doesn't have a direct reset method that can keep us on the branch
      // Use runTerminalCommand to execute the git reset --hard directly
      // This command keeps the branch pointer and just moves it to the specified commit
      const workspacePath = gitData.repo.rootUri.fsPath;
      
      // Create and execute the git reset command via terminal
      const command = `cd "${workspacePath}" && git reset --hard ${commitHash}`;
      console.log(`GitService: Executing command: ${command}`);
      
      // Use executeCommand to run the git reset command
      await vscode.commands.executeCommand('workbench.action.terminal.sendSequence', { text: `${command}\n` });
      
      // Manually refresh the git state since we're using external commands
      await gitData.repo.status();
      
      console.log(`GitService: Successfully reset to commit: ${commitHash}`);
      
      // Log repository state after reset
      console.log(`GitService: Repository state after reset:`, {
        headSHA: gitData.repo.state.HEAD?.commit || 'unknown',
        branch: gitData.repo.state.HEAD?.name || 'unknown',
        workingTreeChanges: (gitData.repo.state.workingTreeChanges || []).length
      });
      
      return `Reset to commit ${commitHash} successful`;
    } catch (error: any) {
      console.error('GitService: Error resetting to commit:', error);
      console.error(`GitService: Error stack: ${error.stack}`);
      return `Error resetting to commit: ${error.message}`;
    }
  }
} 