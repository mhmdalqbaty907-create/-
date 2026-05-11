import { FileItem } from './types';

export const INITIAL_FILES: FileItem[] = [
  {
    id: '1',
    name: 'App.tsx',
    content: `export default function App() {\n  return (\n    <div className="flex items-center justify-center h-screen bg-slate-900 text-white">\n      <h1 className="text-4xl font-bold">Vertex Code</h1>\n      <p className="mt-4 text-slate-400">Mobile coding perfected.</p>\n    </div>\n  );\n}`,
    language: 'javascript',
    isOpen: true,
  },
  {
    id: '2',
    name: 'index.css',
    content: `@import "tailwindcss";\n\nbody {\n  margin: 0;\n  background: #0f172a;\n  color: white;\n}`,
    language: 'css',
    isOpen: true,
  },
  {
    id: '3',
    name: 'data.json',
    content: `{\n  "name": "Vertex Code",\n  "version": "1.0.0",\n  "description": "Mobile code editor"\n}`,
    language: 'json',
    isOpen: false,
  }
];
