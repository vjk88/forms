const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON body parsing
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Helper to ignore system/build folders
const IGNORED_FOLDERS = new Set([
  '.git',
  'node_modules',
  '.sf',
  '.sfdx',
  '.vscode',
  'dist',
  'build',
  '.agents',
  '.claude',
  '.codex',
  '.fallow'
]);

// Helper to recursively scan directories
async function buildTree(dirPath, rootPath, currentDepth = 0, maxDepth = 8) {
  const name = path.basename(dirPath) || dirPath;
  let stats;
  
  try {
    stats = await fs.stat(dirPath);
  } catch (err) {
    return null; // File or folder doesn't exist or no permission
  }

  if (!stats.isDirectory()) {
    const ext = path.extname(dirPath).toLowerCase();
    return {
      name,
      relPath: path.relative(rootPath, dirPath),
      absPath: dirPath,
      isDirectory: false,
      size: stats.size,
      ext
    };
  }

  const node = {
    name,
    relPath: path.relative(rootPath, dirPath),
    absPath: dirPath,
    isDirectory: true,
    children: []
  };

  if (currentDepth >= maxDepth) {
    return node;
  }

  try {
    const files = await fs.readdir(dirPath);
    for (const file of files) {
      if (IGNORED_FOLDERS.has(file)) {
        continue;
      }
      const fullPath = path.join(dirPath, file);
      const childNode = await buildTree(fullPath, rootPath, currentDepth + 1, maxDepth);
      if (childNode) {
        node.children.push(childNode);
      }
    }
  } catch (err) {
    // Permission denied or other errors, skip folder children
  }

  // Sort: Directories first, then files alphabetically
  node.children.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  return node;
}

// Endpoint to scan a folder path
app.post('/api/scan', async (req, res) => {
  const { folderPath } = req.body;
  
  if (!folderPath) {
    return res.status(400).json({ error: 'Folder path is required.' });
  }

  try {
    const resolvedPath = path.resolve(folderPath);
    const stats = await fs.stat(resolvedPath);
    
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Provided path is not a directory.' });
    }

    const tree = await buildTree(resolvedPath, resolvedPath);
    res.json({ rootPath: resolvedPath, tree });
  } catch (err) {
    console.error('Scan Error:', err);
    res.status(500).json({ error: `Failed to scan directory: ${err.message}` });
  }
});

// Endpoint to read file contents
app.post('/api/read', async (req, res) => {
  const { rootPath, filePath } = req.body;

  if (!rootPath || !filePath) {
    return res.status(400).json({ error: 'rootPath and filePath are required.' });
  }

  try {
    const resolvedRoot = path.resolve(rootPath);
    const resolvedFile = path.resolve(filePath);

    // Security check: Prevent directory traversal (ensure file is within rootPath)
    const relative = path.relative(resolvedRoot, resolvedFile);
    const isInside = relative && !relative.startsWith('..') && !path.isAbsolute(relative);

    if (!isInside) {
      return res.status(403).json({ error: 'Access denied. File is outside of the workspace directory.' });
    }

    const content = await fs.readFile(resolvedFile, 'utf8');
    res.json({ content });
  } catch (err) {
    console.error('Read Error:', err);
    res.status(500).json({ error: `Failed to read file: ${err.message}` });
  }
});

// Endpoint to serve raw assets (e.g. images) securely
app.get('/api/raw', async (req, res) => {
  const { rootPath, filePath } = req.query;

  if (!rootPath || !filePath) {
    return res.status(400).send('rootPath and filePath parameters are required.');
  }

  try {
    const resolvedRoot = path.resolve(rootPath);
    const resolvedFile = path.resolve(filePath);

    // Security check: Prevent directory traversal
    const relative = path.relative(resolvedRoot, resolvedFile);
    const isInside = relative && !relative.startsWith('..') && !path.isAbsolute(relative);

    if (!isInside) {
      return res.status(403).send('Access denied. File is outside of the workspace directory.');
    }

    res.sendFile(resolvedFile);
  } catch (err) {
    console.error('Raw Serve Error:', err);
    res.status(500).send(`Failed to serve file: ${err.message}`);
  }
});

// Endpoint to write updated content to a file securely
app.post('/api/write', async (req, res) => {
  const { rootPath, filePath, content } = req.body;

  if (!rootPath || !filePath || content === undefined) {
    return res.status(400).json({ error: 'rootPath, filePath, and content are required.' });
  }

  try {
    const resolvedRoot = path.resolve(rootPath);
    const resolvedFile = path.resolve(filePath);

    // Security check: Prevent directory traversal
    const relative = path.relative(resolvedRoot, resolvedFile);
    const isInside = relative && !relative.startsWith('..') && !path.isAbsolute(relative);

    if (!isInside) {
      return res.status(403).json({ error: 'Access denied. File is outside of the workspace directory.' });
    }

    // Write file content
    await fs.writeFile(resolvedFile, content, 'utf8');

    // Get updated file stats
    const stats = await fs.stat(resolvedFile);

    res.json({ success: true, size: stats.size });
  } catch (err) {
    console.error('Write Error:', err);
    res.status(500).json({ error: `Failed to write file: ${err.message}` });
  }
});

// Endpoint to trigger a native Windows folder picker dialog
app.post('/api/select-folder', async (req, res) => {
  if (process.platform !== 'win32') {
    return res.status(500).json({ error: 'Native folder picker is only supported on Windows.' });
  }

  // Single-line PowerShell command to open COM-based BrowseForFolder dialog
  const psCommand = `powershell -NoProfile -Command "$app = New-Object -ComObject Shell.Application; $folder = $app.BrowseForFolder(0, 'Select folder for AeroMD', 80, 0); if ($folder) { Write-Output $folder.Self.Path }"`;

  try {
    const { stdout, stderr } = await execPromise(psCommand);
    const selectedPath = stdout.trim();

    if (!selectedPath) {
      return res.json({ cancelled: true });
    }

    res.json({ folderPath: selectedPath });
  } catch (err) {
    console.error('Folder Picker Error:', err);
    res.status(500).json({ error: `Failed to open folder picker: ${err.message}` });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});


