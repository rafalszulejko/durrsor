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
   * @returns The name of the current branch
   * @throws Error if Git extension is not available or current branch cannot be determined
   */
  public static async getCurrentBranch(): Promise<string> {
    const gitData = this.getGitRepo();
    if (!gitData) {
      console.error('Error getting current branch: Git extension not available');
      throw new Error("Git extension not available");
    }
    
    // Get the current branch
    const head = gitData.repo.state.HEAD;
    if (head && head.name) {
      return head.name;
    } else {
      console.error('Error getting current branch: Could not determine current branch');
      throw new Error("Could not determine current branch");
    }
  }

  /**
   * Get the hash of the latest commit (HEAD).
   * 
   * @returns The hash of the HEAD commit
   * @throws Error if Git extension is not available or HEAD commit cannot be determined
   */
  public static async getHeadCommitHash(): Promise<string> {
    const gitData = this.getGitRepo();
    if (!gitData) {
      console.error('Error getting HEAD commit hash: Git extension not available');
      throw new Error("Git extension not available");
    }
    
    // Get the HEAD commit hash directly from repository state
    const head = gitData.repo.state.HEAD;
    if (head && head.commit) {
      return head.commit;
    } else {
      console.error('Error getting HEAD commit hash: Could not determine HEAD commit');
      throw new Error("Could not determine HEAD commit");
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
    commitMessage: string
  ): Promise<void> {
    console.log(`GitService: Starting squashAndMergeToBranch to ${targetBranch}`);
    
    const gitData = this.getGitRepo();
    if (!gitData) {
      console.log(`GitService: Git extension not available`);
      throw new Error("Git extension not available");
    }
    
    // First ensure working tree is clean
    const isClean = await this.isWorkingTreeClean();
    if (!isClean) {
      console.log(`GitService: Working tree is not clean`);
      throw new Error("Working tree is not clean. Please commit or stash changes first.");
    }
    
    // Get current branch name
    let currentBranch = await this.getCurrentBranch();
    try {
      // 1. Check out the target branch - using Git API
      console.log(`GitService: Checking out target branch ${targetBranch}`);
      await gitData.repo.checkout(targetBranch);
      
      // 2. Merge with squash using command line (this adds the changes to the index but doesn't commit)
      console.log(`GitService: Executing git merge --squash ${currentBranch}`);
      const mergeCommand = `cd "${gitData.repo.rootUri.fsPath}" && git merge --squash ${currentBranch}`;
      await vscode.commands.executeCommand('workbench.action.terminal.sendSequence', { text: `${mergeCommand}\n` });
      
      // Wait a bit for the command to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Refresh git state to reflect the changes from the command line operation
      await gitData.repo.status();
      
      await gitData.repo.commit(commitMessage);
    } catch (error: any) {
      console.error(`GitService: Error during squash merge: ${error.message}`);
      console.error(`GitService: Error stack: ${error.stack}`);
      throw error;
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

  /**
   * Get list of commits on the current branch since the given commit hash
   * 
   * @param sinceCommitHash The starting commit hash to get commits since 
   * @param maxEntries Maximum number of commits to return (default is 50)
   * @returns Array of Commit objects, or error message if operation fails
   */
  public static async getCommitsSince(sinceCommitHash: string, maxEntries: number = 50): Promise<any[]> {
    try {
      console.log(`GitService: Getting commits since ${sinceCommitHash}`);
      
      const gitData = this.getGitRepo();
      if (!gitData) {
        console.log(`GitService: Git extension not available`);
        throw new Error("Git extension not available");
      }
      
      // Format the range as "hash..HEAD" to get all commits since the given hash up to HEAD
      const range = `${sinceCommitHash}..HEAD`;
      
      // Use the log method with a range option
      const commits = await gitData.repo.log({
        maxEntries: maxEntries,
        range: range
      });
      
      console.log(`GitService: Found ${commits.length} commits since ${sinceCommitHash}`);
      
      return commits;
    } catch (error: any) {
      console.error(`GitService: Error getting commits: ${error.message}`);
      console.error(`GitService: Error stack: ${error.stack}`);
      throw error;
    }
  }
} 