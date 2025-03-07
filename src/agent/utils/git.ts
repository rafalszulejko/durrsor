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
      
      // Log repository state and available methods
      console.log(`GitService: Repository state:`, {
        headSHA: gitData.repo.state.HEAD?.commit || 'unknown',
        branch: gitData.repo.state.HEAD?.name || 'unknown',
        repoHasChanges: (gitData.repo.state.workingTreeChanges || []).length > 0,
        indexChanges: (gitData.repo.state.indexChanges || []).length
      });
      
      // Check if repo has the required methods
      console.log(`GitService: Repository methods:`, {
        hasAddMethod: typeof gitData.repo.add === 'function',
        hasCommitMethod: typeof gitData.repo.commit === 'function',
        hasGetCommitMethod: typeof gitData.repo.getCommit === 'function',
        hasDiffWithHEADMethod: typeof gitData.repo.diffWithHEAD === 'function'
      });
      
      // Get all changes using diffWithHEAD
      console.log(`GitService: Getting list of changed files`);
      try {
        // Get all changes from working tree
        const changes: Change[] = await gitData.repo.diffWithHEAD();
        console.log(`GitService: Found ${changes.length} changed files`);
        
        // Extract file paths from changes
        const changedPaths = changes.map(change => change.uri.fsPath);
        console.log(`GitService: Changed paths:`, changedPaths.slice(0, 5)); // Log first 5 for brevity
        
        // Also check for untracked files
        const untrackedChanges: Change[] = gitData.repo.state.untrackedChanges || [];
        console.log(`GitService: Found ${untrackedChanges.length} untracked files`);
        
        // Combine all paths that need to be added
        const allPaths = [
          ...changedPaths,
          ...untrackedChanges.map(change => change.uri.fsPath)
        ];
        
        if (allPaths.length === 0) {
          console.log(`GitService: No changes to add`);
          return "No changes to commit";
        }
        
        // Add all changes
        console.log(`GitService: Attempting to add ${allPaths.length} files`);
        await gitData.repo.add(allPaths);
        console.log(`GitService: Successfully added all changes`);
      } catch (addError: any) {
        console.error(`GitService: Error adding changes: ${addError.message}`, addError);
        console.error(`GitService: Error stack: ${addError.stack}`);
        throw addError;
      }
      
      // Commit with the provided message
      console.log(`GitService: Attempting to commit with message: "${commitMessage}"`);
      try {
        // Use the correct commit method signature from the API definition
        await gitData.repo.commit(commitMessage);
        console.log(`GitService: Successfully committed changes`);
      } catch (commitError: any) {
        console.error(`GitService: Error committing changes: ${commitError.message}`, commitError);
        console.error(`GitService: Error stack: ${commitError.stack}`);
        
        // Try to get more information about the repository state after commit failure
        try {
          // Use the correct status method from the API definition
          await gitData.repo.status();
          console.log(`GitService: Repository status called after commit failure`);
          
          // Log the current state of the repository
          console.log(`GitService: Current repository state:`, {
            workingTreeChanges: gitData.repo.state.workingTreeChanges.length,
            indexChanges: gitData.repo.state.indexChanges.length
          });
        } catch (statusError) {
          console.error(`GitService: Could not get repository status:`, statusError);
        }
        
        throw commitError;
      }
      
      // Get the commit hash
      console.log(`GitService: Attempting to get commit hash`);
      try {
        const head = await gitData.repo.getCommit('HEAD');
        console.log(`GitService: Successfully got commit hash: ${head.hash}`);
        return head.hash;
      } catch (hashError: any) {
        console.error(`GitService: Error getting commit hash: ${hashError.message}`, hashError);
        console.error(`GitService: Error stack: ${hashError.stack}`);
        throw hashError;
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
} 