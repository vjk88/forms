// App State
let appState = {
  rootPath: '',
  treeData: null,
  activeFilePath: null,
  activeNode: null, // Stores currently active file node object
  rawContent: '', // Stores raw file text
  isEditing: false, // Tracks editing mode
  favorites: [], // Bookmarked folder paths
  expandedFolders: new Set(), // Store expanded paths
  fontSize: 16 // Default font size in px
};

// DOM Elements
const bodyEl = document.documentElement;
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const folderPathInput = document.getElementById('folder-path-input');
const scanBtn = document.getElementById('scan-btn');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const treeContainer = document.getElementById('tree-container');
const fileCountEl = document.getElementById('file-count');
const breadcrumbsEl = document.getElementById('breadcrumbs');
const fileMetaContainer = document.getElementById('file-meta-container');
const readTimeText = document.getElementById('read-time-text');
const fileSizeText = document.getElementById('file-size-text');
const decreaseFontBtn = document.getElementById('decrease-font');
const increaseFontBtn = document.getElementById('increase-font');
const welcomeView = document.getElementById('welcome-view');
const viewerView = document.getElementById('viewer-view');
const markdownBody = document.getElementById('markdown-body');
const outlineSidebar = document.getElementById('outline-sidebar');
const tocContainer = document.getElementById('toc-container');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const appContainer = document.querySelector('.app-container');

// Editing DOM Elements
const editBtn = document.getElementById('edit-btn');
const editorView = document.getElementById('editor-view');
const editorTextarea = document.getElementById('editor-textarea');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const browseBtn = document.getElementById('browse-btn');

// Favorites DOM Elements
const favoriteBtn = document.getElementById('favorite-btn');
const favoritesSection = document.getElementById('favorites-section');
const favoritesList = document.getElementById('favorites-list');




// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadSavedState();
  loadFavorites();
  setupEventListeners();
  
  // Set initial font size
  updateFontSize();
});

// --- Theme Management ---
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    bodyEl.setAttribute('data-theme', savedTheme);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    bodyEl.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
  lucide.createIcons();
}

function toggleTheme() {
  const currentTheme = bodyEl.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  bodyEl.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

// --- Font Size Management ---
function updateFontSize() {
  markdownBody.style.setProperty('--md-font-size', `${appState.fontSize}px`);
}

// --- State Caching ---
function saveAppState() {
  localStorage.setItem('rootPath', appState.rootPath);
  localStorage.setItem('activeFilePath', appState.activeFilePath || '');
  localStorage.setItem('expandedFolders', JSON.stringify([...appState.expandedFolders]));
}

function loadSavedState() {
  const savedRoot = localStorage.getItem('rootPath');
  const savedActive = localStorage.getItem('activeFilePath');
  const savedExpanded = localStorage.getItem('expandedFolders');

  if (savedExpanded) {
    try {
      appState.expandedFolders = new Set(JSON.parse(savedExpanded));
    } catch (e) {
      appState.expandedFolders = new Set();
    }
  }

  if (savedRoot) {
    appState.rootPath = savedRoot;
    folderPathInput.value = savedRoot;
    scanFolder(savedRoot, savedActive);
  }
}

// --- Event Listeners ---
function setupEventListeners() {
  themeToggleBtn.addEventListener('click', toggleTheme);
  
  scanBtn.addEventListener('click', () => {
    const path = folderPathInput.value.trim();
    if (path) scanFolder(path);
  });
  
  folderPathInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const path = folderPathInput.value.trim();
      if (path) scanFolder(path);
    }
  });

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    filterTree(query);
    if (query) {
      clearSearchBtn.style.display = 'block';
    } else {
      clearSearchBtn.style.display = 'none';
    }
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    filterTree('');
    clearSearchBtn.style.display = 'none';
    searchInput.focus();
  });

  toggleSidebarBtn.addEventListener('click', () => {
    appContainer.classList.toggle('sidebar-collapsed');
  });

  decreaseFontBtn.addEventListener('click', () => {
    if (appState.fontSize > 12) {
      appState.fontSize -= 2;
      updateFontSize();
    }
  });

  increaseFontBtn.addEventListener('click', () => {
    if (appState.fontSize < 28) {
      appState.fontSize += 2;
      updateFontSize();
    }
  });

  editBtn.addEventListener('click', toggleEditMode);
  saveBtn.addEventListener('click', saveFileChanges);
  cancelBtn.addEventListener('click', cancelEditing);
  browseBtn.addEventListener('click', selectFolderDialog);
  
  favoriteBtn.addEventListener('click', toggleFavoriteCurrentPath);
  folderPathInput.addEventListener('input', updateFavoriteBtnState);
}



// --- Directory Scanning API Calls ---
async function selectFolderDialog() {
  browseBtn.disabled = true;
  const originalContent = browseBtn.innerHTML;
  browseBtn.innerHTML = '<div class="spinner" style="width: 14px; height: 14px; border-width: 2px; border-top-color: var(--accent);"></div>';
  
  try {
    const response = await fetch('/api/select-folder', {
      method: 'POST'
    });
    const data = await response.json();
    
    if (response.ok) {
      if (data.folderPath) {
        folderPathInput.value = data.folderPath;
        scanFolder(data.folderPath);
      }
    } else {
      alert(data.error || 'Failed to open folder picker.');
    }
  } catch (error) {
    console.error('Error selecting folder:', error);
    alert('Failed to connect to folder picker.');
  } finally {
    browseBtn.disabled = false;
    browseBtn.innerHTML = originalContent;
    lucide.createIcons();
  }
}

async function scanFolder(path, autoOpenFile = null) {

  scanBtn.disabled = true;
  scanBtn.innerHTML = '<div class="spinner"></div>';
  
  try {
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: path })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      appState.rootPath = data.rootPath;
      appState.treeData = data.tree;
      
      saveAppState();
      renderTree();
      updateFavoriteBtnState();
      
      // Calculate total files count
      const fileCount = countFiles(data.tree);
      fileCountEl.textContent = `${fileCount} file${fileCount !== 1 ? 's' : ''}`;
      
      if (autoOpenFile) {
        // Find the node in the tree and load it
        const node = findNodeByPath(data.tree, autoOpenFile);
        if (node) {
          loadFile(node);
        } else {
          showWelcome();
        }
      } else {
        showWelcome();
      }
    } else {
      alert(data.error || 'Failed to scan folder.');
      showWelcome();
    }
  } catch (error) {
    console.error('Error scanning folder:', error);
    alert('Server communication error. Make sure the Node server is running.');
    showWelcome();
  } finally {
    scanBtn.disabled = false;
    scanBtn.innerHTML = '<i data-lucide="arrow-right"></i>';
    lucide.createIcons();
  }
}

// --- Helper Functions ---
function countFiles(node) {
  if (!node) return 0;
  if (!node.isDirectory) return 1;
  let count = 0;
  for (const child of node.children) {
    count += countFiles(child);
  }
  return count;
}

function findNodeByPath(node, absPath) {
  if (!node) return null;
  if (node.absPath === absPath) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByPath(child, absPath);
      if (found) return found;
    }
  }
  return null;
}

function showWelcome() {
  welcomeView.style.display = 'flex';
  viewerView.style.display = 'none';
  editorView.style.display = 'none';
  editBtn.style.display = 'none';
  outlineSidebar.style.display = 'none';
  fileMetaContainer.style.display = 'none';
  appContainer.classList.remove('has-outline');
  breadcrumbsEl.innerHTML = '<span class="breadcrumb-item active">Select a file from the explorer</span>';
  appState.activeFilePath = null;
  appState.activeNode = null;
  appState.rawContent = '';
  appState.isEditing = false;
  saveAppState();
}

// --- Tree UI Rendering ---
function renderTree() {
  if (!appState.treeData) return;
  treeContainer.innerHTML = '';
  const rootUl = document.createElement('ul');
  rootUl.className = 'tree-root';
  
  // If it's a folder, render children directly so we don't have a single top root node
  if (appState.treeData.isDirectory) {
    for (const child of appState.treeData.children) {
      rootUl.appendChild(createTreeNodeElement(child));
    }
  } else {
    rootUl.appendChild(createTreeNodeElement(appState.treeData));
  }
  
  treeContainer.appendChild(rootUl);
  lucide.createIcons();
}

function createTreeNodeElement(node) {
  const li = document.createElement('li');
  li.className = 'tree-node';
  li.dataset.path = node.absPath;
  
  const itemDiv = document.createElement('div');
  itemDiv.className = 'tree-node-item';
  if (appState.activeFilePath === node.absPath) {
    itemDiv.classList.add('active');
  }

  // Icons
  let chevronHtml = '';
  let iconName = 'file';
  let iconClass = 'file-icon other';

  if (node.isDirectory) {
    const isExpanded = appState.expandedFolders.has(node.absPath);
    chevronHtml = `<i data-lucide="chevron-right" class="chevron-icon ${isExpanded ? 'expanded' : ''}"></i>`;
    iconName = 'folder';
    iconClass = 'file-icon folder';
  } else if (node.ext === '.md') {
    iconName = 'file-text';
    iconClass = 'file-icon markdown';
  }

  itemDiv.innerHTML = `
    ${chevronHtml}
    <i data-lucide="${iconName}" class="${iconClass}"></i>
    <span class="node-name">${node.name}</span>
  `;

  li.appendChild(itemDiv);

  if (node.isDirectory) {
    const childrenUl = document.createElement('ul');
    childrenUl.className = 'tree-node-children';
    
    const isExpanded = appState.expandedFolders.has(node.absPath);
    childrenUl.style.display = isExpanded ? 'block' : 'none';
    
    for (const child of node.children) {
      childrenUl.appendChild(createTreeNodeElement(child));
    }
    
    li.appendChild(childrenUl);

    // Expand/Collapse click handler
    itemDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextExpanded = !appState.expandedFolders.has(node.absPath);
      
      const chevron = itemDiv.querySelector('.chevron-icon');
      if (nextExpanded) {
        appState.expandedFolders.add(node.absPath);
        childrenUl.style.display = 'block';
        if (chevron) chevron.classList.add('expanded');
      } else {
        appState.expandedFolders.delete(node.absPath);
        childrenUl.style.display = 'none';
        if (chevron) chevron.classList.remove('expanded');
      }
      
      saveAppState();
    });
  } else {
    // File click handler
    itemDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      // Remove active from previously active items
      document.querySelectorAll('.tree-node-item.active').forEach(el => el.classList.remove('active'));
      itemDiv.classList.add('active');
      loadFile(node);
    });
  }

  return li;
}

// --- Search Filter Logic ---
function filterTree(query) {
  if (!appState.treeData) return;

  const treeNodes = treeContainer.querySelectorAll('.tree-node');
  
  if (!query) {
    // Restore all items
    treeNodes.forEach(node => {
      node.querySelector('.tree-node-item').classList.remove('filtered-out');
      const children = node.querySelector('.tree-node-children');
      if (children) {
        const absPath = node.dataset.path;
        children.style.display = appState.expandedFolders.has(absPath) ? 'block' : 'none';
        const chevron = node.querySelector('.chevron-icon');
        if (chevron) {
          if (appState.expandedFolders.has(absPath)) {
            chevron.classList.add('expanded');
          } else {
            chevron.classList.remove('expanded');
          }
        }
      }
    });
    return;
  }

  // Helper function to check if a node or any of its children match the query
  function matchNode(node, q) {
    const matchesSelf = node.name.toLowerCase().includes(q);
    
    if (!node.isDirectory) {
      return matchesSelf;
    }
    
    let matchesChild = false;
    for (const child of node.children) {
      if (matchNode(child, q)) {
        matchesChild = true;
      }
    }
    
    return matchesSelf || matchesChild;
  }

  // Traverse DOM tree items and hide/show based on matching criteria
  function applyDOMFilter(node, q) {
    const path = node.dataset.path;
    const treeNodeData = findNodeByPath(appState.treeData, path);
    if (!treeNodeData) return false;

    const isMatch = matchNode(treeNodeData, q);
    const itemEl = node.querySelector('.tree-node-item');
    const childrenContainer = node.querySelector('.tree-node-children');

    if (isMatch) {
      itemEl.classList.remove('filtered-out');
      if (childrenContainer) {
        childrenContainer.style.display = 'block'; // Auto expand directories that match or contain matches
        const chevron = node.querySelector('.chevron-icon');
        if (chevron) chevron.classList.add('expanded');
        
        // Filter the child li elements
        let hasVisibleChildren = false;
        const childLis = childrenContainer.children;
        for (const childLi of childLis) {
          const childMatch = applyDOMFilter(childLi, q);
          if (childMatch) hasVisibleChildren = true;
        }
      }
    } else {
      itemEl.classList.add('filtered-out');
      if (childrenContainer) {
        childrenContainer.style.display = 'none';
      }
    }

    return isMatch;
  }

  const rootLis = treeContainer.querySelector('.tree-root').children;
  for (const rootLi of rootLis) {
    applyDOMFilter(rootLi, query);
  }
}

// --- File Loading & Reading ---
async function loadFile(node) {
  if (node.isDirectory) return;

  appState.activeFilePath = node.absPath;
  appState.activeNode = node;
  appState.isEditing = false;
  saveAppState();

  // Reset editor views
  editorView.style.display = 'none';
  editBtn.style.display = 'none';

  // Set breadcrumbs
  renderBreadcrumbs(node.relPath);

  // Reset reader
  markdownBody.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading file...</p></div>';
  welcomeView.style.display = 'none';
  viewerView.style.display = 'block';
  fileMetaContainer.style.display = 'flex';
  
  try {
    const response = await fetch('/api/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rootPath: appState.rootPath,
        filePath: node.absPath
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Store raw content
      appState.rawContent = data.content;
      editBtn.style.display = 'block';

      // Set metadata badges
      fileSizeText.textContent = formatBytes(node.size);
      
      if (node.ext === '.md') {
        renderMarkdown(data.content, node);
      } else {
        renderPlainCode(data.content, node.name, node.ext);
      }
    } else {
      markdownBody.innerHTML = `<div class="error-state"><i data-lucide="alert-circle"></i><p>${data.error || 'Unknown server error.'}</p></div>`;
      fileMetaContainer.style.display = 'none';
      outlineSidebar.style.display = 'none';
      appContainer.classList.remove('has-outline');
    }
  } catch (error) {
    console.error('Error reading file:', error);
    markdownBody.innerHTML = `<div class="error-state">
      <i data-lucide="alert-circle"></i>
      <p>Error rendering file contents: ${error.message}</p>
      <pre style="font-family: monospace; font-size: var(--fs-xs); background: rgba(0,0,0,0.1); padding: 10px; margin-top: 10px; border-radius: 4px; overflow-x: auto; max-width: 100%; text-align: left; color: var(--text-secondary);">${error.stack}</pre>
    </div>`;
    fileMetaContainer.style.display = 'none';
    outlineSidebar.style.display = 'none';
    appContainer.classList.remove('has-outline');
  } finally {
    lucide.createIcons();
  }
}



// --- Render Breadcrumbs ---
function renderBreadcrumbs(relPath) {
  const parts = relPath.split(/[\\/]/);
  breadcrumbsEl.innerHTML = '';
  
  parts.forEach((part, index) => {
    const span = document.createElement('span');
    span.className = 'breadcrumb-item';
    if (index === parts.length - 1) {
      span.classList.add('active');
    }
    span.textContent = part;
    breadcrumbsEl.appendChild(span);
  });
}

// --- Render Non-Markdown Code Files ---
function renderPlainCode(content, filename, extension) {
  // Hide Table of Contents outline since it's a code file
  outlineSidebar.style.display = 'none';
  appContainer.classList.remove('has-outline');
  readTimeText.textContent = 'Code';

  // Map extension to Prism language
  let lang = 'clike';
  const ext = extension.substring(1).toLowerCase();
  if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) lang = 'javascript';
  else if (['html', 'xml', 'svg'].includes(ext)) lang = 'markup';
  else if (ext === 'css') lang = 'css';
  else if (ext === 'json') lang = 'json';
  else if (['sh', 'bash', 'zsh'].includes(ext)) lang = 'bash';
  else if (ext === 'py') lang = 'python';
  else if (ext === 'yml' || ext === 'yaml') lang = 'yaml';
  else if (ext === 'sql') lang = 'sql';

  // Escape content for safety
  const escapedContent = escapeHtml(content);

  markdownBody.innerHTML = `
    <h1>${filename}</h1>
    <pre class="language-${lang}"><code class="language-${lang}">${escapedContent}</code></pre>
  `;

  // Apply highlight
  Prism.highlightAllUnder(markdownBody);
  injectCodeHeaders();
}

// --- Render Markdown File ---
function renderMarkdown(mdContent, fileNode) {
  // Configure Marked custom renderer to capture Headings and Alert Boxes
  const renderer = new marked.Renderer();
  
  // Custom header renderer to inject unique IDs (supporting both positional and object arguments)
  const headingList = [];
  renderer.heading = function(arg1, arg2, arg3) {
    let text, level, raw;
    if (typeof arg1 === 'object' && arg1 !== null) {
      text = arg1.text || '';
      level = arg1.depth || arg1.level || 1;
      raw = arg1.raw || text || '';
    } else {
      text = arg1;
      level = arg2;
      raw = arg3 || text || '';
    }
    const id = raw.toLowerCase().replace(/[^\w]+/g, '-').replace(/(^-|-$)/g, '');
    headingList.push({ text, level, id });
    return `<h${level} id="${id}">${text}</h${level}>`;
  };

  // Custom blockquote renderer for GitHub-style alerts (supporting both positional and object arguments)
  renderer.blockquote = function(arg1) {
    let html;
    if (typeof arg1 === 'object' && arg1 !== null) {
      html = arg1.text || '';
    } else {
      html = arg1;
    }
    
    const alertMatch = html.match(/^<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:<br\s*\/?>)?/i);
    if (alertMatch) {
      const alertType = alertMatch[1].toUpperCase();
      const cleanHtml = html.replace(alertMatch[0], '<p>'); // strip the token
      
      let icon = 'info';
      let alertClass = 'alert-note';
      let label = 'Note';
      
      switch(alertType) {
        case 'NOTE':
          icon = 'info'; alertClass = 'alert-note'; label = 'Note'; break;
        case 'TIP':
          icon = 'lightbulb'; alertClass = 'alert-note'; label = 'Tip'; break;
        case 'IMPORTANT':
          icon = 'alert-circle'; alertClass = 'alert-note'; label = 'Important'; break;
        case 'WARNING':
          icon = 'alert-triangle'; alertClass = 'alert-warning'; label = 'Warning'; break;
        case 'CAUTION':
          icon = 'ban'; alertClass = 'alert-danger'; label = 'Caution'; break;
      }
      
      return `<blockquote class="alert ${alertClass}">
        <div class="alert-title">
          <i data-lucide="${icon}"></i>
          <span>${label}</span>
        </div>
        ${cleanHtml}
      </blockquote>`;
    }
    return `<blockquote>${html}</blockquote>`;
  };

  marked.use({ renderer });


  // Calculate Read Time (avg 200 words/min)
  const wordCount = mdContent.split(/\s+/).length;
  const readTime = Math.max(1, Math.round(wordCount / 200));
  readTimeText.textContent = `${readTime} min read`;

  // Parse HTML
  const parsedHtml = marked.parse(mdContent);
  markdownBody.innerHTML = parsedHtml;

  // Resolve Relative Image Paths
  resolveRelativeImages(markdownBody, fileNode);

  // Apply highlight
  Prism.highlightAllUnder(markdownBody);
  
  // Inject copy buttons and lang labels into pre tags
  injectCodeHeaders();

  // Render Table of Contents (Outline)
  renderOutline(headingList);
}

// --- Resolve Relative Images ---
function resolveRelativeImages(container, fileNode) {
  const imgs = container.querySelectorAll('img');
  imgs.forEach(img => {
    const src = img.getAttribute('src');
    if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
      const absImgPath = resolveRelativePath(fileNode.absPath, src);
      img.src = `/api/raw?rootPath=${encodeURIComponent(appState.rootPath)}&filePath=${encodeURIComponent(absImgPath)}`;
    }
  });
}

function resolveRelativePath(baseFile, relativePath) {
  const base = baseFile.replace(/\\/g, '/');
  const rel = relativePath.replace(/\\/g, '/');
  
  const baseParts = base.split('/');
  baseParts.pop(); // remove file name
  
  const relParts = rel.split('/');
  for (const part of relParts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  
  const separator = baseFile.includes('\\') ? '\\' : '/';
  return baseParts.join(separator);
}

// --- Inject Code Block Headers ---
function injectCodeHeaders() {
  const preElements = markdownBody.querySelectorAll('pre');
  preElements.forEach(pre => {
    // Get language
    let lang = 'code';
    const codeClass = pre.querySelector('code')?.className || '';
    const match = codeClass.match(/language-(\w+)/);
    if (match) {
      lang = match[1];
    }

    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `
      <span class="code-lang-label">${lang}</span>
      <button class="copy-code-btn" title="Copy code">
        <i data-lucide="clipboard"></i>
        <span>Copy</span>
      </button>
    `;

    pre.insertBefore(header, pre.firstChild);

    // Copy event handler
    const copyBtn = header.querySelector('.copy-code-btn');
    copyBtn.addEventListener('click', () => {
      const codeText = pre.querySelector('code').innerText;
      navigator.clipboard.writeText(codeText).then(() => {
        copyBtn.innerHTML = '<i data-lucide="check" style="color:#10b981;"></i><span style="color:#10b981;">Copied!</span>';
        lucide.createIcons();
        setTimeout(() => {
          copyBtn.innerHTML = '<i data-lucide="clipboard"></i><span>Copy</span>';
          lucide.createIcons();
        }, 2000);
      });
    });
  });
}

// --- Render Outline (TOC) ---
function renderOutline(headings) {
  tocContainer.innerHTML = '';
  
  const validHeadings = headings.filter(h => h.level >= 1 && h.level <= 3);
  
  if (validHeadings.length === 0) {
    outlineSidebar.style.display = 'none';
    appContainer.classList.remove('has-outline');
    return;
  }

  outlineSidebar.style.display = 'flex';
  appContainer.classList.add('has-outline');

  validHeadings.forEach(h => {
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.className = `toc-link toc-h${h.level}`;
    a.textContent = h.text;
    
    a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' });
      
      // Update active TOC item
      document.querySelectorAll('.toc-link').forEach(el => el.classList.remove('active'));
      a.classList.add('active');
    });

    tocContainer.appendChild(a);
  });

  // Setup Scrollspy
  setupScrollSpy(validHeadings);
}

function setupScrollSpy(headings) {
  const contentDiv = document.querySelector('.content-container');
  
  contentDiv.addEventListener('scroll', () => {
    let activeId = null;
    const scrollPosition = contentDiv.scrollTop + 100;

    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el && el.offsetTop <= scrollPosition) {
        activeId = h.id;
      }
    }

    if (activeId) {
      document.querySelectorAll('.toc-link').forEach(link => {
        if (link.getAttribute('href') === `#${activeId}`) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
    }
  });
}

// --- Formatting Helpers ---
function formatBytes(bytes, decimals = 1) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Editing Operations ---
function toggleEditMode() {
  if (!appState.activeNode) return;
  appState.isEditing = !appState.isEditing;

  if (appState.isEditing) {
    // Show editor, hide viewer
    viewerView.style.display = 'none';
    editorView.style.display = 'flex';
    outlineSidebar.style.display = 'none';
    appContainer.classList.remove('has-outline');

    // Populate textarea and focus
    editorTextarea.value = appState.rawContent;
    editorTextarea.focus();

    // Update breadcrumbs
    const currentBreadcrumbs = breadcrumbsEl.innerHTML;
    breadcrumbsEl.innerHTML = `<span class="badge" style="background-color: var(--accent); color: white; border-radius: 4px; padding: 2px 6px; font-size: 10px; margin-right: 8px;">EDITING</span>` + currentBreadcrumbs;
    
    // Change edit button appearance
    editBtn.classList.add('active');
  } else {
    // Hide editor, show viewer
    editorView.style.display = 'none';
    viewerView.style.display = 'block';
    
    // Restore breadcrumbs and render file
    renderBreadcrumbs(appState.activeNode.relPath);
    if (appState.activeNode.ext === '.md') {
      renderMarkdown(appState.rawContent, appState.activeNode);
    } else {
      renderPlainCode(appState.rawContent, appState.activeNode.name, appState.activeNode.ext);
    }
    
    editBtn.classList.remove('active');
  }
}

async function saveFileChanges() {
  if (!appState.activeNode) return;
  
  const updatedContent = editorTextarea.value;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<div class="spinner" style="width: 14px; height: 14px; border-width: 2px; margin-right: 4px; border-top-color: white;"></div> Saving...';

  try {
    const response = await fetch('/api/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rootPath: appState.rootPath,
        filePath: appState.activeNode.absPath,
        content: updatedContent
      })
    });

    const data = await response.json();

    if (response.ok) {
      // Save raw content and node size
      appState.rawContent = updatedContent;
      appState.activeNode.size = data.size;

      // Update badge
      fileSizeText.textContent = formatBytes(data.size);
      
      // Go back to read mode
      toggleEditMode();
    } else {
      alert(data.error || 'Failed to save changes.');
    }
  } catch (error) {
    console.error('Error saving file:', error);
    alert('Server communication error. Make sure the Node server is running.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i data-lucide="check"></i> Save';
    lucide.createIcons();
  }
}

function cancelEditing() {
  if (editorTextarea.value !== appState.rawContent) {
    if (!confirm('Discard unsaved changes?')) {
      return;
    }
  }
  toggleEditMode();
}

// --- Favorites Operations ---
function loadFavorites() {
  const savedFavorites = localStorage.getItem('favorites');
  if (savedFavorites) {
    try {
      appState.favorites = JSON.parse(savedFavorites);
    } catch (e) {
      appState.favorites = [];
    }
  }
  renderFavorites();
}

function saveFavorites() {
  localStorage.setItem('favorites', JSON.stringify(appState.favorites));
}

function renderFavorites() {
  favoritesList.innerHTML = '';
  
  if (appState.favorites.length === 0) {
    favoritesSection.style.display = 'none';
    return;
  }
  
  favoritesSection.style.display = 'block';
  
  appState.favorites.forEach((fav, index) => {
    const item = document.createElement('div');
    item.className = 'favorite-item';
    
    // Determine folder name from path
    const name = fav.split(/[\\/]/).pop() || fav;
    
    item.innerHTML = `
      <div class="favorite-info">
        <i data-lucide="folder" class="folder-icon"></i>
        <div class="favorite-details">
          <span class="favorite-name">${name}</span>
          <span class="favorite-path" title="${fav}">${fav}</span>
        </div>
      </div>
      <button class="favorite-remove-btn" title="Remove Favorite" data-index="${index}">
        <i data-lucide="trash-2"></i>
      </button>
    `;
    
    // Click on info: scan the folder
    item.querySelector('.favorite-info').addEventListener('click', () => {
      folderPathInput.value = fav;
      scanFolder(fav);
    });
    
    // Click on remove: remove it
    item.querySelector('.favorite-remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      appState.favorites.splice(index, 1);
      saveFavorites();
      renderFavorites();
      updateFavoriteBtnState();
    });
    
    favoritesList.appendChild(item);
  });
  
  lucide.createIcons();
}

function toggleFavoriteCurrentPath() {
  const currentPath = folderPathInput.value.trim();
  if (!currentPath) return;

  const index = appState.favorites.indexOf(currentPath);

  if (index > -1) {
    // Already in favorites, remove it
    appState.favorites.splice(index, 1);
  } else {
    // Add to favorites
    appState.favorites.push(currentPath);
  }

  saveFavorites();
  renderFavorites();
  updateFavoriteBtnState();
}

function updateFavoriteBtnState() {
  const currentPath = folderPathInput.value.trim();
  if (!currentPath) {
    favoriteBtn.classList.remove('active');
    return;
  }

  const isFav = appState.favorites.includes(currentPath);
  if (isFav) {
    favoriteBtn.classList.add('active');
  } else {
    favoriteBtn.classList.remove('active');
  }
}


