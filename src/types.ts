export interface FileItem {
  id: string;
  name: string;
  content: string;
  language: 'javascript' | 'html' | 'css' | 'json' | 'markdown';
  isOpen: boolean;
}

export interface AppState {
  files: FileItem[];
  activeFileId: string | null;
  isSidebarOpen: boolean;
}
