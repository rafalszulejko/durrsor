import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Run git diff command from the specified directory and return its output.
 * 
 * @param directory The directory to run git diff from (default: "code")
 * @returns The output of the git diff command as a string
 */
export async function diff(directory: string = "code"): Promise<string> {
  try {
    const { stdout } = await execAsync('git diff', { cwd: directory });
    return stdout;
  } catch (error) {
    console.error('Error running git diff:', error);
    return `Error running git diff: ${error.message}`;
  }
}

/**
 * Add all files and commit them with the provided message.
 * 
 * @param commitMessage The message to use for the commit
 * @param directory The directory to run git commands from (default: "code")
 * @returns The commit hash of the new commit if successful, or an error message if failed
 */
export async function addAllAndCommit(commitMessage: string, directory: string = "code"): Promise<string> {
  try {
    // Add all files
    await execAsync('git add .', { cwd: directory });
    
    // Commit with the provided message
    const { stdout, stderr } = await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { 
      cwd: directory 
    });
    
    if (stdout) {
      // Get the commit hash
      const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', { cwd: directory });
      return hashOutput.trim();
    } else {
      return `Commit failed: ${stderr}`;
    }
  } catch (error) {
    console.error('Error in git operation:', error);
    return `Error in git operation: ${error.message}`;
  }
}

/**
 * Check if the git working tree is clean (no uncommitted changes, untracked files, or staged changes).
 * 
 * @param directory The directory to run git commands from (default: "code")
 * @returns True if working tree is clean, False otherwise
 */
export async function isWorkingTreeClean(directory: string = "code"): Promise<boolean> {
  try {
    // Check for any changes in working directory and staging area
    const { stdout } = await execAsync('git status --porcelain', { cwd: directory });
    
    // If output is empty, working tree is clean
    return stdout.trim().length === 0;
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
 * @param directory The directory to run git commands from (default: "code")
 * @returns Success or error message from the git command
 */
export async function createAndCheckoutBranch(branchName: string, directory: string = "code"): Promise<string> {
  try {
    const { stdout } = await execAsync(`git checkout -b durrsor-${branchName}`, { cwd: directory });
    return stdout.trim();
  } catch (error) {
    console.error('Error creating branch:', error);
    return `Error creating branch: ${error.message}`;
  }
}

/**
 * Get the name of the current git branch.
 * 
 * @param directory The directory to run git commands from (default: "code")
 * @returns The name of the current branch as a string, or error message if failed
 */
export async function getCurrentBranch(directory: string = "code"): Promise<string> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: directory });
    return stdout.trim();
  } catch (error) {
    console.error('Error getting current branch:', error);
    return `Error getting current branch: ${error.message}`;
  }
}

/**
 * Squash all commits from the current branch and merge them into the target branch.
 * 
 * @param targetBranch The branch to merge into
 * @param commitMessage Optional custom commit message for the squashed commit
 * @param directory The directory to run git commands from (default: "code")
 * @returns Success or error message from the git operation
 */
export async function squashAndMergeToBranch(
  targetBranch: string, 
  commitMessage?: string, 
  directory: string = "code"
): Promise<string> {
  try {
    // First ensure working tree is clean
    const isClean = await isWorkingTreeClean(directory);
    if (!isClean) {
      return "Error: Working tree is not clean. Please commit or stash changes first.";
    }
    
    // Get current branch name
    const currentBranch = await getCurrentBranch(directory);
    if (currentBranch.startsWith("Error")) {
      return currentBranch;
    }
    
    // If no commit message provided, create a default one
    if (!commitMessage) {
      commitMessage = `Squashed commits from ${currentBranch} into ${targetBranch}`;
    }
    
    // Checkout target branch and ensure it's up to date
    await execAsync(`git checkout ${targetBranch}`, { cwd: directory });
    
    // Perform the squash merge
    await execAsync(`git merge --squash ${currentBranch}`, { cwd: directory });
    
    // Commit the squashed changes
    await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, { cwd: directory });
    
    // Return success message with commit hash
    const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', { cwd: directory });
    
    return `Successfully squashed and merged ${currentBranch} into ${targetBranch}\nCommit: ${hashOutput.trim()}`;
  } catch (error) {
    // Attempt to abort merge if it failed
    try {
      await execAsync('git merge --abort', { cwd: directory });
    } catch {
      // Ignore errors from abort attempt
    }
    console.error('Error during squash merge:', error);
    return `Error during squash merge: ${error.message}`;
  }
} 