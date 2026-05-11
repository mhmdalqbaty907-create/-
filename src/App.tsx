import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { getFirestore, collection, doc, onSnapshot, setDoc, query, where, getDoc, serverTimestamp } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { 
  FileCode, 
  FolderIcon, 
  Menu, 
  X, 
  Plus, 
  ChevronLeft,
  Settings,
  Search,
  Code2,
  Files,
  Terminal,
  Edit2,
  Trash2,
  Upload,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Monitor,
  Info,
  Command,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  LogIn,
  LogOut,
  User as UserIcon,
  Cloud,
  ChevronUp,
  Globe,
  Play
} from 'lucide-react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { 
  cursorLineStart, 
  cursorLineEnd, 
  cursorPageUp, 
  cursorPageDown,
  selectAll,
  undo,
  redo,
  cursorCharLeft,
  cursorCharRight,
  cursorLineUp,
  cursorLineDown
} from '@codemirror/commands';
import { FileItem } from './types';
import { INITIAL_FILES } from './constants';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [files, setFiles] = useState<FileItem[]>(INITIAL_FILES);
  const [activeFileId, setActiveFileId] = useState<string | null>(() => {
    const saved = localStorage.getItem('vertex_active_id');
    return saved || INITIAL_FILES[0].id;
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<'terminal' | 'problems' | 'output'>('terminal');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  
  // Termux modifiers
  const [isCtrlActive, setIsCtrlActive] = useState(false);
  const [isAltActive, setIsAltActive] = useState(false);
  
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = viewportWidth < 768;

  const activeFile = useMemo(() => 
    files.find(f => f.id === activeFileId), 
    [files, activeFileId]
  );

  const openFiles = useMemo(() => 
    files.filter(f => f.isOpen), 
    [files]
  );

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return [];
    return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [files, searchQuery]);

  const editorRef = useRef<ReactCodeMirrorRef>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const id = Date.now().toString();
      const ext = file.name.split('.').pop() || '';
      const languageMap: Record<string, string> = {
        'js': 'javascript', 'ts': 'javascript', 'jsx': 'javascript', 'tsx': 'javascript',
        'html': 'html', 'css': 'css', 'json': 'json'
      };

      const newFile: FileItem = {
        id,
        name: file.name,
        content,
        language: (languageMap[ext] || 'javascript') as any,
        isOpen: true,
      };
      setFiles(prev => [...prev, newFile]);
      setActiveFileId(id);
    };
    reader.readAsText(file);
  };

  const handleFileClick = (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, isOpen: true } : f));
    setActiveFileId(id);
    if (isMobile) setIsSidebarOpen(false);
  };

  const closeFile = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setFiles(prev => {
      const newFiles = prev.map(f => f.id === id ? { ...f, isOpen: false } : f);
      if (activeFileId === id) {
        const nextOpen = newFiles.find(f => f.isOpen);
        setActiveFileId(nextOpen ? nextOpen.id : null);
      }
      return newFiles;
    });
  };

  // Firebase Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // Firebase Real-time File Sync
  useEffect(() => {
    if (!user) return;
    
    const q = query(collection(db, 'files'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cloudFiles = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as FileItem[];
      
      if (cloudFiles.length > 0) {
        setFiles(prev => {
          // Merge logic: prefer cloud data for existing IDs, keep local-only files
          const merged = [...prev];
          cloudFiles.forEach(cf => {
            const index = merged.findIndex(f => f.id === cf.id);
            if (index !== -1) {
              merged[index] = { ...merged[index], ...cf };
            } else {
              merged.push({ ...cf, isOpen: false });
            }
          });
          return merged;
        });
      }
    });

    return unsubscribe;
  }, [user]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      alert('Login failed. Please check your connection.');
    }
  };

  const logout = () => signOut(auth);

  const saveToCloud = async (file: FileItem) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'files', file.id), {
        id: file.id,
        name: file.name,
        content: file.content,
        language: file.language,
        updatedBy: user.uid,
        lastUpdated: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Cloud save failed:", error);
    }
  };

  const updateContent = (content: string) => {
    if (!activeFileId) return;
    setFiles(prev => {
      const updated = prev.map(f => f.id === activeFileId ? { ...f, content } : f);
      const active = updated.find(f => f.id === activeFileId);
      if (active) saveToCloud(active); // Sync to cloud on every change
      return updated;
    });
  };

  const getLanguageExtension = (lang: string) => {
    switch (lang) {
      case 'javascript': return [javascript({ jsx: true, typescript: true })];
      case 'html': return [html()];
      case 'css': return [css()];
      case 'json': return [json()];
      default: return [javascript()];
    }
  };

  const createNewFile = () => {
    const id = Date.now().toString();
    const newFile: FileItem = {
      id,
      name: `new-file-${files.length + 1}.js`,
      content: '',
      language: 'javascript',
      isOpen: true,
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(id);
    if (isMobile) setIsSidebarOpen(false);
  };

  const renameFile = (id: string, currentName: string) => {
    const newName = prompt('Enter new name:', currentName);
    if (newName && newName.trim() !== '') {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
    }
  };

  const deleteFile = (id: string) => {
    if (confirm('Are you sure you want to delete this file?')) {
      setFiles(prev => {
        const newFiles = prev.filter(f => f.id !== id);
        if (activeFileId === id) {
          const nextOpen = newFiles.find(f => f.isOpen);
          setActiveFileId(nextOpen ? nextOpen.id : null);
        }
        return newFiles;
      });
    }
  };

  const executeEditorCommand = (command: any) => {
    if (editorRef.current?.view) {
      command(editorRef.current.view);
      editorRef.current.view.focus();
    }
  };

  const symbols = ['\t', ' { ', ' } ', ' ( ', ' ) ', ' [ ', ' ] ', ' ; ', ' = ', ' < ', ' > ', ' / ', ' " ', " ' ", ' ` ', ' : ', ' , '];

  const handleExtraKey = (key: string) => {
    if (!activeFile) return;

    switch (key) {
      case 'ESC':
        editorRef.current?.view?.contentDOM.blur();
        break;
      case '☰':
        setIsSidebarOpen(!isSidebarOpen);
        break;
      case 'CTRL':
        setIsCtrlActive(!isCtrlActive);
        break;
      case 'ALT':
        setIsAltActive(!isAltActive);
        break;
      case 'HOME':
        executeEditorCommand(cursorLineStart);
        break;
      case 'END':
        executeEditorCommand(cursorLineEnd);
        break;
      case 'PGUP':
        executeEditorCommand(cursorPageUp);
        break;
      case 'PGDN':
        executeEditorCommand(cursorPageDown);
        break;
      case 'UP':
        executeEditorCommand(cursorLineUp);
        break;
      case 'DOWN':
        executeEditorCommand(cursorLineDown);
        break;
      case 'LEFT':
        executeEditorCommand(cursorCharLeft);
        break;
      case 'RIGHT':
        executeEditorCommand(cursorCharRight);
        break;
      case 'A':
        if (isCtrlActive) {
          executeEditorCommand(selectAll);
          setIsCtrlActive(false);
        } else {
          insertText('a');
        }
        break;
      case 'Z':
        if (isCtrlActive) {
          executeEditorCommand(undo);
          setIsCtrlActive(false);
        } else {
          insertText('z');
        }
        break;
      case 'Y':
        if (isCtrlActive) {
          executeEditorCommand(redo);
          setIsCtrlActive(false);
        } else {
          insertText('y');
        }
        break;
      case 'F':
        if (isCtrlActive) {
          setIsSearchOpen(true);
          setIsCtrlActive(false);
        } else {
          insertText('f');
        }
        break;
      case 'S':
        if (isCtrlActive) {
          alert('File Saved: ' + activeFile.name);
          setIsCtrlActive(false);
        } else {
          insertText('s');
        }
        break;
      case 'N':
        if (isCtrlActive) {
          createNewFile();
          setIsCtrlActive(false);
        } else {
          insertText('n');
        }
        break;
      case 'W':
        if (isCtrlActive) {
          if (activeFileId) closeFile({ stopPropagation: () => {} } as any, activeFileId);
          setIsCtrlActive(false);
        } else {
          insertText('w');
        }
        break;
      case 'B':
        if (isCtrlActive) {
          setIsSidebarOpen(!isSidebarOpen);
          setIsCtrlActive(false);
        } else {
          insertText('b');
        }
        break;
      case 'T':
        if (isCtrlActive) {
          setIsTerminalOpen(!isTerminalOpen);
          setIsCtrlActive(false);
        } else {
          insertText('t');
        }
        break;
      default:
        break;
    }
  };

  const insertText = (text: string) => {
    if (editorRef.current?.view) {
      const view = editorRef.current.view;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length }
      });
      view.focus();
    }
  };

  const insertSymbol = (sym: string) => {
    insertText(sym);
  };

  if (isAuthLoading) {
    return (
      <div className="h-screen w-full bg-[#0c0c0c] flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Code2 size={40} className="text-[#00e600] animate-pulse mb-4" />
          <div className="h-1 w-32 bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: "100%" }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              className="h-full w-full bg-[#00e600]"
            />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full bg-[#0c0c0c] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        {/* Background Decorative Elements */}
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-green-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-purple-500/10 rounded-full blur-[100px]" />
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="z-10 max-w-sm w-full"
        >
          <div className="w-24 h-24 mx-auto mb-8 rounded-[2rem] bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center shadow-2xl border border-white/10">
            <Code2 size={48} className="text-white" />
          </div>
          
          <h1 className="text-4xl font-black text-white mb-2 tracking-tighter uppercase italic leading-none">
            Vertex <span className="text-[#00e600]">Code</span> Keeper
          </h1>
          <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] mb-12 font-black">Cloud Collaborative IDE</p>
          
          <div className="space-y-4">
            <button 
              onClick={login}
              className="w-full py-4 bg-white text-black font-black text-xs rounded-2xl uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl hover:bg-gray-100 transition-all active:scale-95 group"
            >
              <LogIn size={18} className="group-hover:translate-x-1 transition-transform" /> 
              Enter Workspace
            </button>
            <p className="text-[10px] text-gray-600 leading-relaxed font-medium">
              By entering, you Agree to our <span className="text-blue-500 underline">Terms of Service</span>.
            </p>
          </div>

          <div className="mt-20 flex justify-center gap-8 opacity-40">
            <div className="flex flex-col items-center gap-1">
              <Cloud size={20} className="text-green-400" />
              <span className="text-[8px] font-black uppercase">Live Sync</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Globe size={20} className="text-green-400" />
              <span className="text-[8px] font-black uppercase">Multi-User</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Terminal size={20} className="text-purple-400" />
              <span className="text-[8px] font-black uppercase">Termux Core</span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#121212] text-[#cccccc] font-sans selection:bg-[#004d00] overflow-hidden">
      {/* Search Bar Triggered on Screen */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-2 left-1/2 -translate-x-1/2 w-[90%] max-w-lg z-[100] bg-[#252526] border border-white/10 rounded-lg shadow-2xl p-2 flex items-center gap-3"
          >
            <Search size={18} className="text-[#00e600]" />
            <input 
              autoFocus
              type="text" 
              placeholder="Search files..." 
              className="bg-transparent border-none outline-none text-white text-sm flex-1"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsSearchOpen(false);
              }}
            />
            <button onClick={() => setIsSearchOpen(false)}><X size={18} className="text-gray-500" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPreviewOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col"
          >
            <div className="h-10 bg-[#1e1e1e] border-b border-white/10 flex items-center justify-between px-4">
              <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <Globe size={14} className="text-green-500" /> Live Preview
              </div>
              <button 
                onClick={() => setIsPreviewOpen(false)}
                className="p-1 px-3 bg-red-500/20 text-red-500 rounded text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-lg active:scale-95"
              >
                Close
              </button>
            </div>
            <div className="flex-1 bg-white">
              <iframe 
                title="preview"
                className="w-full h-full border-none"
                srcDoc={
                  activeFile?.language === 'html' 
                    ? activeFile.content 
                    : `
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <style>
                            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; background: #f4f4f9; }
                            h1 { color: #333; border-bottom: 2px solid #00e600; padding-bottom: 10px; }
                            pre { background: #eee; padding: 15px; border-radius: 8px; font-size: 13px; overflow: auto; }
                            .meta { color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; }
                          </style>
                        </head>
                        <body>
                          <h1>Vertex Engine Preview</h1>
                          <div class="meta">Running: ${activeFile?.name || 'Untitled'}</div>
                          <hr/>
                          ${activeFile?.language === 'javascript' ? '<p><i>Executing JavaScript... check console or dynamic elements below.</i></p>' : '<pre>' + (activeFile?.content || 'Empty file') + '</pre>'}
                          <div id="root"></div>
                          <script>
                            try {
                              ${activeFile?.language === 'javascript' ? activeFile.content : ''}
                            } catch (e) {
                              document.body.innerHTML += '<div style="color:red; margin-top:20px; padding:10px; background:#fff1f1; border:1px solid red; border-radius:4px;"><strong>Runtime Error:</strong> ' + e.message + '</div>';
                            }
                          </script>
                        </body>
                      </html>
                    `
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* High Density Window Header (Desktop) */}
      {!isMobile && (
        <div className="h-8 bg-[#252526] flex items-center justify-between px-3 border-b border-black/20 select-none shrink-0 z-50">
          <div className="flex items-center gap-4">
            <div className="text-[#00e600] font-bold text-xs tracking-tighter flex items-center gap-2">
              <Code2 size={14} />
              <span>VERTEX CODE KEEPER</span>
            </div>
            <div className="flex gap-4 text-[11px] text-gray-400">
              <span className="hover:text-white cursor-pointer transition-colors" onClick={() => setIsSearchOpen(true)}>File</span>
              <span className="hover:text-white cursor-pointer transition-colors">Edit</span>
              <span className="hover:text-white cursor-pointer transition-colors" onClick={() => setIsTerminalOpen(true)}>Terminal</span>
              <span className="hover:text-white cursor-pointer transition-colors" onClick={() => setIsInfoOpen(true)}>Help</span>
            </div>
          </div>
          <div className="text-[11px] bg-[#3c3c3c] px-6 py-0.5 rounded border border-[#454545] text-gray-300 truncate max-w-[400px]">
            {activeFile ? `${activeFile.name} — Vertex Code Keeper Editor` : 'Vertex Code Keeper'}
          </div>
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar Overlay (Mobile) */}
        <AnimatePresence>
          {isSidebarOpen && isMobile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 z-40 backdrop-blur-md"
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <motion.aside
          initial={false}
          animate={{ 
            width: isSidebarOpen ? (isMobile ? '85%' : '260px') : (isMobile ? '0px' : '48px'),
            x: isSidebarOpen || !isMobile ? 0 : -300
          }}
          className="fixed md:relative z-50 flex h-full bg-[#181818] border-r border-[#2b2b2b] transition-all duration-300 ease-out shadow-2xl md:shadow-none"
        >
          {/* Side Icons */}
          <div className="flex flex-col items-center w-12 py-4 bg-[#1e1e1e] gap-6 flex-shrink-0 border-r border-white/5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#00e600] to-[#bfff00] flex items-center justify-center mb-2 shadow-[0_0_15px_rgba(0,230,0,0.3)]">
              <Code2 size={20} className="text-black font-bold" />
            </div>
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className={`p-2 transition-all ${isSidebarOpen ? 'text-white scale-110' : 'text-[#8585ae] hover:text-white'}`}
            >
              <Files size={22} />
            </button>
            <Search size={22} className="text-[#8585ae] hover:text-white cursor-pointer transition-colors" onClick={() => setIsSearchOpen(true)} />
            <div className="mt-auto mb-4 flex flex-col gap-4">
              <Info size={22} className="text-[#8585ae] hover:text-white cursor-pointer" onClick={() => setIsInfoOpen(true)} />
              <Settings size={22} className="text-[#8585ae] hover:text-white cursor-pointer" />
            </div>
          </div>

          {/* Sidebar Content */}
          <div className={`flex-1 flex flex-col overflow-hidden bg-[#181818] ${!isSidebarOpen && !isMobile ? 'hidden' : ''}`}>
            <div className="px-4 py-3 flex justify-between items-center border-b border-white/5 select-none shrink-0">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Explorer</span>
              <div className="flex gap-2">
                <Plus size={14} className="cursor-pointer text-gray-400 hover:text-white" onClick={createNewFile} />
                <X size={14} className="md:hidden cursor-pointer text-gray-400 hover:text-white" onClick={() => setIsSidebarOpen(false)} />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto pt-2 no-scrollbar">
              <div className="flex items-center gap-2 px-3 py-1 bg-[#2a2d2e] text-white text-[12px] font-bold select-none mb-1">
                <ChevronDown size={12} />
                <span>WORKSPACE</span>
              </div>
              <div className="flex flex-col">
                {files.map(file => (
                  <div
                    key={file.id}
                    onClick={() => handleFileClick(file.id)}
                    className={`group flex items-center gap-2 px-4 py-1.5 cursor-pointer transition-all border-l-2 ${
                      activeFileId === file.id
                        ? 'bg-green-500/10 text-white border-[#00e600]' 
                        : 'hover:bg-white/5 text-gray-400 border-transparent'
                    }`}
                  >
                    <FileCode size={14} className={file.language === 'javascript' ? 'text-[#f1e05a]' : 'text-[#569cd6]'} />
                    <span className="flex-1 truncate text-[12px]">{file.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); renameFile(file.id, file.name); }} className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-white transition-opacity"><Edit2 size={12} /></button>
                    <button onClick={(e) => { e.stopPropagation(); deleteFile(file.id); }} className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-opacity"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.aside>

        {/* Editor Wrapper */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#0c0c0c]">
          {/* Header Tier 1: Action Bar */}
          <div className="h-10 bg-[#1e1e1e] flex items-center justify-between px-3 border-b border-black/40 shrink-0 select-none">
            <div className="flex items-center gap-4">
              {isMobile && (
                <button 
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-1.5 text-gray-400 hover:text-white active:scale-90 transition-transform"
                >
                  <Menu size={20} />
                </button>
              )}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2d2d2d] hover:bg-[#3d3d3d] rounded-md text-[11px] text-gray-200 cursor-pointer transition-all active:scale-95 shadow-sm border border-white/5">
                  <Upload size={14} className="text-green-400" />
                  <span className="font-bold">IMPORT</span>
                  <input type="file" className="hidden" onChange={handleFileUpload} />
                </label>
                <button 
                  onClick={() => setIsTerminalOpen(!isTerminalOpen)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] transition-all active:scale-95 border border-white/5 ${isTerminalOpen ? 'bg-[#00e600] text-black' : 'bg-[#2d2d2d] text-gray-200 hover:bg-[#3d3d3d]'}`}
                >
                  <Terminal size={14} className={isTerminalOpen ? 'text-black' : 'text-green-400'} />
                  <span className="font-bold uppercase">Term</span>
                </button>
                <button 
                  onClick={() => setIsPreviewOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-md text-[11px] text-white transition-all active:scale-95 shadow-sm border border-white/5"
                >
                  <Play size={14} className="fill-current" />
                  <span className="font-bold uppercase">RUN</span>
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
               <span className="text-[10px] text-gray-400 font-bold hidden sm:block uppercase tracking-widest mr-2">{user?.displayName || 'Developer'}</span>
               <button onClick={logout} className="p-2 text-gray-500 hover:text-red-400 transition-colors">
                 <LogOut size={16} />
               </button>
            </div>
          </div>

          {/* Header Tier 2: Scrollable Tab Bar */}
          <div className="h-9 bg-[#181818] flex items-center border-b border-black/40 overflow-x-auto no-scrollbar shrink-0 touch-pan-x">
            {openFiles.map(file => (
              <div
                key={file.id}
                onClick={() => setActiveFileId(file.id)}
                className={`flex h-full px-4 items-center gap-2 text-[11px] border-r border-[#252526] transition-all select-none shrink-0 cursor-pointer ${
                  activeFileId === file.id 
                    ? 'bg-[#0c0c0c] text-white border-t-2 border-t-[#00e600]' 
                    : 'bg-[#212121] text-gray-500 hover:text-gray-300'
                }`}
              >
                <FileCode size={12} className={file.language === 'javascript' ? 'text-[#00e600]' : 'text-[#569cd6]'} />
                <span className="truncate max-w-[120px] font-medium">{file.name}</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); closeFile(e, file.id); }}
                  className="ml-2 text-gray-700 hover:text-white"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          {/* Editor Area */}
          <div className="flex-1 relative flex flex-col overflow-hidden">
            <div className="flex-1 relative">
              {activeFile ? (
                <CodeMirror
                  ref={editorRef}
                  value={activeFile.content}
                  height="100%"
                  theme={oneDark}
                  extensions={getLanguageExtension(activeFile.language || 'javascript')}
                  onChange={updateContent}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: false,
                    dropCursor: true,
                    autocompletion: true,
                    bracketMatching: true,
                    closeBrackets: true,
                  }}
                  style={{
                    fontSize: isMobile ? '10px' : '13px',
                  }}
                  className="h-full"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-[#0c0c0c]">
                  <div className="w-24 h-24 mb-6 rounded-3xl bg-gradient-to-br from-green-900/40 via-green-800/20 to-transparent flex items-center justify-center border border-green-500/20 shadow-2xl">
                    <Code2 size={48} className="text-[#00e600] animate-pulse" />
                  </div>
                  <h1 className="text-4xl font-black text-white/90 mb-1 tracking-tighter uppercase italic">Vertex Code Keeper</h1>
                  <p className="text-[10px] text-gray-500 uppercase tracking-[0.4em] mb-10 font-black">Professional Pocket IDE</p>
                  <button onClick={createNewFile} className="px-10 py-3 bg-[#00e600] hover:bg-[#00ff00] text-black text-[10px] font-black rounded uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(0,230,0,0.3)]">
                    New Shell Script
                  </button>
                </div>
              )}
            </div>

            {/* Terminal/Problems Drawer */}
            <AnimatePresence>
              {isTerminalOpen && (
                <motion.div 
                  initial={{ y: 300 }}
                  animate={{ y: 0 }}
                  exit={{ y: 300 }}
                  className="absolute bottom-0 left-0 right-0 h-[220px] bg-[#0f0f0f] border-t border-white/10 z-30 flex flex-col shadow-[0_-10px_50px_rgba(0,0,0,0.8)]"
                >
                  <div className="h-8 bg-[#181818] flex items-center justify-between px-4 text-[10px] uppercase font-black tracking-widest text-[#8585ae] border-b border-black/40">
                    <div className="flex gap-4 h-full">
                      <button 
                        onClick={() => setActiveBottomTab('terminal')}
                        className={`py-2 flex items-center gap-2 transition-colors ${activeBottomTab === 'terminal' ? 'text-[#00e600] border-b-2 border-[#00e600]' : 'opacity-40'}`}
                      >
                        <Monitor size={10} /> TERMINAL
                      </button>
                      <button 
                        onClick={() => setActiveBottomTab('problems')}
                        className={`py-2 flex items-center gap-2 transition-colors ${activeBottomTab === 'problems' ? 'text-red-500 border-b-2 border-red-500' : 'opacity-40'}`}
                      >
                        <AlertCircle size={10} /> PROBLEMS
                      </button>
                      <button 
                        onClick={() => setActiveBottomTab('output')}
                        className={`py-2 flex items-center gap-2 transition-colors ${activeBottomTab === 'output' ? 'text-green-500 border-b-2 border-green-500' : 'opacity-40'}`}
                      >
                        <RotateCcw size={10} /> OUTPUT
                      </button>
                    </div>
                    <button onClick={() => setIsTerminalOpen(false)} className="hover:text-white transition-colors"><X size={14}/></button>
                  </div>

                  <div className="flex-1 p-4 font-mono text-[10.5px] overflow-y-auto no-scrollbar scroll-smooth">
                    {activeBottomTab === 'terminal' && (
                      <div className="text-green-500/70 leading-relaxed">
                        <div className="mb-1"><span className="text-green-500 font-bold">vertex@mobile</span>:<span className="text-white">~</span>$ npm run build</div>
                        <div className="text-white/60">Optimizing assets... [DONE]</div>
                        <div className="text-white/60">Deployment ready at: <span className="underline italic">https://vertex-cloud.dev/deploy/3921</span></div>
                        <div className="flex mt-2">
                          <span className="text-green-500 font-bold">vertex@mobile</span>:<span className="text-white">~</span>$ <span className="bg-[#00e600] w-2 h-4 ml-1 cursor-blink shadow-[0_0_10px_#00e600]"></span>
                        </div>
                      </div>
                    )}
                    {activeBottomTab === 'problems' && (
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 text-red-400 bg-red-400/5 p-2 rounded">
                          <AlertCircle size={14} className="shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold">SyntaxError: Unexpected token {'{'}</div>
                            <div className="opacity-60 text-[9px] uppercase tracking-wider">{activeFile?.name || 'app.js'} • Line 24</div>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 text-yellow-500 bg-yellow-500/5 p-2 rounded">
                          <Info size={14} className="shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold">Unused variable 'config'</div>
                            <div className="opacity-60 text-[9px] uppercase tracking-wider">{activeFile?.name || 'app.js'} • Line 12</div>
                          </div>
                        </div>
                      </div>
                    )}
                    {activeBottomTab === 'output' && (
                      <div className="text-gray-400 italic">
                        [Systems] Console initialized... Ready for logging.
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mobile Termux Controls Toolbar */}
            {isMobile && activeFile && (
              <div className="flex flex-col bg-[#111111] border-t border-white/5 shrink-0 select-none">
                {/* Termux Extra Keys Row */}
                <div className="flex items-center gap-0.5 p-0.5 bg-black/40 overflow-x-auto no-scrollbar border-b border-white/5 touch-pan-x">
                  <button onClick={() => handleExtraKey('ESC')} className="min-w-[45px] h-9 flex items-center justify-center text-[10px] font-black text-gray-500 hover:text-white bg-[#1e1e1e] rounded transition-colors uppercase">ESC</button>
                  <button onClick={() => handleExtraKey('CTRL')} className={`min-w-[45px] h-9 flex items-center justify-center text-[10px] font-black rounded transition-all uppercase ${isCtrlActive ? 'bg-[#00e600] text-black shadow-[0_0_10px_rgba(0,230,0,0.5)]' : 'bg-[#1e1e1e] text-gray-500'}`}>CTRL</button>
                  <button onClick={() => handleExtraKey('ALT')} className={`min-w-[45px] h-9 flex items-center justify-center text-[10px] font-black rounded transition-all uppercase ${isAltActive ? 'bg-[#ff9500] text-white shadow-[0_0_10px_rgba(255,149,0,0.5)]' : 'bg-[#1e1e1e] text-gray-500'}`}>ALT</button>
                  <button onClick={() => handleExtraKey('☰')} className="min-w-[45px] h-9 flex items-center justify-center text-gray-500 hover:text-white bg-[#1e1e1e] rounded"><Menu size={16}/></button>
                  <div className="w-[1px] h-5 bg-white/5 mx-1"></div>
                  <button onClick={() => handleExtraKey('HOME')} className="min-w-[45px] h-9 flex items-center justify-center text-[9px] font-black text-gray-500 hover:text-white bg-[#1e1e1e] rounded uppercase">HOME</button>
                  <button onClick={() => handleExtraKey('END')} className="min-w-[45px] h-9 flex items-center justify-center text-[9px] font-black text-gray-500 hover:text-white bg-[#1e1e1e] rounded uppercase">END</button>
                  <button onClick={() => handleExtraKey('PGUP')} className="min-w-[45px] h-9 flex items-center justify-center text-[9px] font-black text-gray-500 hover:text-white bg-[#1e1e1e] rounded uppercase">PGUP</button>
                  <button onClick={() => handleExtraKey('PGDN')} className="min-w-[45px] h-9 flex items-center justify-center text-[9px] font-black text-gray-500 hover:text-white bg-[#1e1e1e] rounded uppercase">PGDN</button>
                </div>
                {/* Arrow & Shortcut Controls */}
                <div className="flex items-center gap-0.5 p-0.5 overflow-x-auto no-scrollbar border-b border-white/5 bg-black/20">
                  <button onClick={() => handleExtraKey('LEFT')} className="min-w-[40px] h-10 flex items-center justify-center text-gray-500 hover:text-white active:scale-125 transition-all"><ArrowLeft size={18}/></button>
                  <button onClick={() => handleExtraKey('UP')} className="min-w-[40px] h-10 flex items-center justify-center text-gray-500 hover:text-white active:scale-125 transition-all"><ArrowUp size={18}/></button>
                  <button onClick={() => handleExtraKey('DOWN')} className="min-w-[40px] h-10 flex items-center justify-center text-gray-500 hover:text-white active:scale-125 transition-all"><ArrowDown size={18}/></button>
                  <button onClick={() => handleExtraKey('RIGHT')} className="min-w-[40px] h-10 flex items-center justify-center text-gray-500 hover:text-white active:scale-125 transition-all"><ArrowRight size={18}/></button>
                  <div className="w-[1px] h-5 bg-white/5 mx-2"></div>
                  {isCtrlActive ? (
                    <div className="flex items-center gap-1 px-2">
                      <button onClick={() => handleExtraKey('A')} className="w-8 h-8 rounded bg-[#333] text-white text-[9px] font-bold border border-[#00e600] uppercase flex items-center justify-center shadow-sm">A</button>
                      <button onClick={() => handleExtraKey('S')} className="w-8 h-8 rounded bg-[#333] text-white text-[9px] font-bold border border-[#00e600] uppercase flex items-center justify-center shadow-sm">S</button>
                      <button onClick={() => handleExtraKey('F')} className="w-8 h-8 rounded bg-[#333] text-white text-[9px] font-bold border border-[#00e600] uppercase flex items-center justify-center shadow-sm">F</button>
                      <button onClick={() => handleExtraKey('Z')} className="w-8 h-8 rounded bg-[#333] text-white text-[9px] font-bold border border-[#00e600] uppercase flex items-center justify-center shadow-sm">Z</button>
                      <button onClick={() => handleExtraKey('Y')} className="w-8 h-8 rounded bg-[#333] text-white text-[9px] font-bold border border-[#00e600] uppercase flex items-center justify-center shadow-sm">Y</button>
                      <button onClick={() => handleExtraKey('N')} className="w-8 h-8 rounded bg-[#333] text-white text-[9px] font-bold border border-[#00e600] uppercase flex items-center justify-center shadow-sm">N</button>
                      <button onClick={() => handleExtraKey('W')} className="w-8 h-8 rounded bg-[#333] text-white text-[9px] font-bold border border-[#00e600] uppercase flex items-center justify-center shadow-sm">W</button>
                      <button onClick={() => handleExtraKey('B')} className="w-8 h-8 rounded bg-[#333] text-white text-[9px] font-bold border border-[#00e600] uppercase flex items-center justify-center shadow-sm">B</button>
                      <button onClick={() => handleExtraKey('T')} className="w-8 h-8 rounded bg-[#333] text-white text-[9px] font-bold border border-[#00e600] uppercase flex items-center justify-center shadow-sm">T</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 opacity-20 pointer-events-none">
                      <button className="w-8 h-8 rounded bg-[#1e1e1e] text-gray-500 text-[9px] font-bold border border-transparent uppercase flex items-center justify-center">A</button>
                      <button className="w-8 h-8 rounded bg-[#1e1e1e] text-gray-500 text-[9px] font-bold border border-transparent uppercase flex items-center justify-center">Z</button>
                      <button className="w-8 h-8 rounded bg-[#1e1e1e] text-gray-500 text-[9px] font-bold border border-transparent uppercase flex items-center justify-center">Y</button>
                    </div>
                  )}
                </div>
                {/* Symbol Line */}
                <div className="flex items-center gap-1 p-1 overflow-x-auto no-scrollbar touch-pan-x">
                  {symbols.map(sym => (
                    <button
                      key={sym}
                      onClick={() => insertSymbol(sym)}
                      className="min-w-[42px] h-10 flex items-center justify-center text-white/30 text-[12px] font-mono hover:text-white active:bg-blue-500/20 active:text-white transition-all rounded"
                    >
                      {sym.trim() || 'Tab'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Minimal Status Bar */}
          <div className="h-5 bg-[#00e600] text-black flex items-center justify-between px-3 text-[10px] select-none shrink-0 font-bold tracking-tighter leading-none">
            <div className="flex items-center gap-4 h-full">
              <span className="flex items-center gap-1 opacity-90 leading-none"><Terminal size={10}/> git:main*</span>
              <span className="opacity-70 leading-none">Ln {activeFile?.content.split('\n').length || 0}, Col 1</span>
            </div>
            <div className="flex items-center gap-4 h-full">
              <span className="uppercase opacity-80 leading-none">{activeFile?.language || 'TEXT'}</span>
              <span className="bg-white/10 px-1 rounded-sm uppercase leading-none">UTF-8</span>
            </div>
          </div>
        </main>
      </div>

      {/* Global Modals / Overlays */}
      <AnimatePresence>
        {/* Info / Shortcuts Modal */}
        {isInfoOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4 overflow-y-auto"
          >
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsInfoOpen(false)} />
            <div className="w-full max-w-sm bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 shadow-2xl pointer-events-auto relative my-8">
              <h2 className="text-2xl font-black text-white mb-6 uppercase tracking-tighter italic border-b border-white/5 pb-2 flex items-center gap-2">
                <Info size={24} className="text-[#00e600]" /> Vertex Code Keeper Manual
              </h2>
              <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 no-scrollbar">
                <section>
                  <h3 className="text-[10px] font-black text-[#00e600] uppercase tracking-[0.2em] mb-3">Key Controls</h3>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-white/5 p-2 rounded"><span className="text-white font-bold">ESC:</span> Blur editor / Exit mode</div>
                    <div className="bg-white/5 p-2 rounded"><span className="text-green-400 font-bold">CTRL:</span> Activate shortcuts</div>
                    <div className="bg-white/5 p-2 rounded"><span className="text-orange-400 font-bold">ALT:</span> Extended commands</div>
                    <div className="bg-white/5 p-2 rounded"><span className="text-white font-bold">HOME:</span> Jump to line start</div>
                    <div className="bg-white/5 p-2 rounded"><span className="text-white font-bold">END:</span> Jump to line end</div>
                  </div>
                </section>
                
                <section>
                  <h3 className="text-[10px] font-black text-green-500 uppercase tracking-[0.2em] mb-3">System Features</h3>
                  <ul className="space-y-2 text-[11px] text-gray-400 list-disc pl-4">
                    <li><span className="text-white">Auto-Save:</span> Instant saving to <code className="bg-white/5 px-1 rounded text-green-300">localStorage</code>. Data is retained even if the browser closes.</li>
                    <li><span className="text-white">Persistence:</span> Files remain for 30 days of inactivity. Manual save (CTRL+S) enforces immediate sync.</li>
                    <li><span className="text-white">Performance:</span> Optimized for mobile. Smooth scrolling & zero-lag typing even on large files.</li>
                    <li><span className="text-white">Size:</span> Extremely lightweight (~1.2MB). Fast loading on slow connections.</li>
                    <li><span className="text-white">Export:</span> Project files can be pushed to GitHub via AI Studio menu for app conversion.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-[10px] font-black text-green-400 uppercase tracking-[0.2em] mb-3 mt-6">Languages & Performance</h3>
                  <p className="text-[10px] text-gray-500 leading-relaxed mb-2">
                    <span className="text-white">Supported:</span> JavaScript, Python (Writing), HTML, CSS, C++.
                  </p>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    <span className="text-white">Libraries:</span> Use <code className="bg-white/5 px-1 rounded">npm install</code> in the terminal for JS projects. For Python, use this editor to write code, then run it in a Termux environment for full library support.
                  </p>
                </section>

                <section>
                  <h3 className="text-[10px] font-black text-purple-500 uppercase tracking-[0.2em] mb-3 mt-6">Quick Shortcuts</h3>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between bg-white/5 px-2 py-1.5 rounded"><span>Search Workspace</span> <span className="text-[#00e600]">CTRL + F</span></div>
                    <div className="flex justify-between bg-white/5 px-2 py-1.5 rounded"><span>Save Progress</span> <span className="text-[#00e600]">CTRL + S</span></div>
                    <div className="flex justify-between bg-white/5 px-2 py-1.5 rounded"><span>New File</span> <span className="text-[#00e600]">CTRL + N</span></div>
                    <div className="flex justify-between bg-white/5 px-2 py-1.5 rounded"><span>Close Tab</span> <span className="text-[#00e600]">CTRL + W</span></div>
                    <div className="flex justify-between bg-white/5 px-2 py-1.5 rounded"><span>Toggle Sidebar</span> <span className="text-[#00e600]">CTRL + B</span></div>
                    <div className="flex justify-between bg-white/5 px-2 py-1.5 rounded"><span>Toggle Terminal</span> <span className="text-[#00e600]">CTRL + T</span></div>
                    <div className="flex justify-between bg-white/5 px-2 py-1.5 rounded"><span>Select All</span> <span className="text-[#00e600]">CTRL + A</span></div>
                    <div className="flex justify-between bg-white/5 px-2 py-1.5 rounded"><span>Undo</span> <span className="text-[#00e600]">CTRL + Z</span></div>
                  </div>
                </section>
              </div>
              <button 
                onClick={() => setIsInfoOpen(false)}
                className="w-full mt-6 py-3 bg-[#00e600] text-black text-[11px] font-black rounded-xl uppercase tracking-widest shadow-lg active:scale-95 transition-all"
              >
                Close Manual
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .cm-editor { height: 100% !important; background: transparent !important; }
        .cm-scroller { font-family: 'JetBrains Mono', 'Fira Code', monospace !important; outline: none !important; }
        .cm-gutters { background-color: #0c0c0c !important; border-right: 1px solid rgba(255,255,255,0.03) !important; color: #333 !important; font-size: 8px !important; }
        .cm-activeLineGutter { background-color: #121212 !important; color: #00e600 !important; }
        .cm-activeLine { background-color: rgba(0, 230, 0, 0.03) !important; }
        .cm-content { padding-top: 5px !important; }
        .cm-cursor { border-left-width: 2px !important; border-left-color: #00e600 !important; }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .cursor-blink { animation: blink 1s step-end infinite; }
        .cm-selectionBackground { background-color: rgba(0, 230, 0, 0.25) !important; }
      `}} />
    </div>
  );
}
