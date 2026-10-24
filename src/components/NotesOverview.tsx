import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  StickyNote,
  FileText,
  Search,
  Plus,
  BookOpen,
  Pin,
  Trash2,
  Edit2,
  Copy,
  Check,
  X,
  FolderOpen,
  FolderPlus,
  Folder,
  Upload,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Maximize2,
  ExternalLink,
  Image as ImageIcon,
  Type,
  Eye,
  Sparkles,
} from 'lucide-react';
import { NoteItem, NoteFolder, StudyFile, StickyNoteItem } from '../types';
import { cleanPastedMarkdown, hasMarkdownArtifacts } from '../utils/textCleaner';

export interface FileStickyNoteEntry {
  fileId: string;
  fileName: string;
  file: StudyFile;
  note: StickyNoteItem;
}

interface NotesOverviewProps {
  notes: NoteItem[];
  folders: NoteFolder[];
  studyFiles?: StudyFile[];
  onSelectNoteToEdit: (noteId: string) => void;
  onStartNewNote: () => void;
  onTogglePinNote: (noteId: string, currentPin?: boolean) => void;
  onDeleteNote: (noteId: string) => void;
  onOpenFileAtPage?: (file: StudyFile, pageNumber: number) => void;
  onUpdateStickyNote?: (fileId: string, updatedNote: StickyNoteItem) => void;
  onDeleteStickyNote?: (fileId: string, stickyNoteId: string) => void;
  onSwitchToEditor: () => void;
  onAddFolder?: (folder: Omit<NoteFolder, 'id' | 'createdAt'>) => void;
  onUpdateFolder?: (folderId: string, name: string, color?: string, parentId?: string | null) => void;
  onDeleteFolder?: (folderId: string) => void;
  onTriggerNewFile?: () => void;
}

const PRESET_COLORS = [
  { bg: '#fef08a', text: '#713f12', name: 'زرد کلاسیک' },
  { bg: '#bbf7d0', text: '#14532d', name: 'سبز نعنایی' },
  { bg: '#fed7aa', text: '#7c2d12', name: 'هلویی' },
  { bg: '#bae6fd', text: '#0c4a6e', name: 'آبی آسمانی' },
  { bg: '#e9d5ff', text: '#581c87', name: 'بنفش اسطوخودوس' },
  { bg: '#fecdd3', text: '#881337', name: 'صورتی ملایم' },
  { bg: '#f3f4f6', text: '#1f2937', name: 'خاکستری مینیمال' },
];

const FOLDER_COLOR_PALETTE = [
  { name: 'آبی', value: '#2563eb', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  { name: 'زمردی', value: '#059669', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { name: 'کهربایی', value: '#d97706', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  { name: 'بنفش', value: '#7c3aed', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  { name: 'رز', value: '#e11d48', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  { name: 'فیروزه‌ای', value: '#0891b2', bg: 'bg-cyan-50', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  { name: 'نارنجی', value: '#ea580c', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  { name: 'دودی', value: '#4b5563', bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-500' },
];

/**
 * Extracts plain text from HTML content for clean previews
 */
function stripHtml(html: string): string {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

/**
 * Helper to get all descendant folder IDs for a given folder ID
 */
function getFolderAndDescendantIds(folderId: string, allFolders: NoteFolder[]): string[] {
  const result: string[] = [folderId];
  const queue: string[] = [folderId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const children = allFolders.filter((f) => f.parentId === curr);
    children.forEach((c) => {
      result.push(c.id);
      queue.push(c.id);
    });
  }
  return result;
}

interface ActiveViewerItem {
  type: 'sticky' | 'note';
  id: string;
  title: string;
  content: string;
  sourceLabel: string;
  pageNumber?: number;
  color?: string;
  textColor?: string;
  date?: string;
  originalEntry?: FileStickyNoteEntry;
  originalNote?: NoteItem;
  isBold?: boolean;
  imageUrl?: string;
  images?: string[];
}

export const NotesOverview: React.FC<NotesOverviewProps> = ({
  notes,
  folders,
  studyFiles = [],
  onSelectNoteToEdit,
  onStartNewNote,
  onTogglePinNote,
  onDeleteNote,
  onOpenFileAtPage,
  onUpdateStickyNote,
  onDeleteStickyNote,
  onSwitchToEditor,
  onAddFolder,
  onUpdateFolder,
  onDeleteFolder,
  onTriggerNewFile,
}) => {
  // Main Tab State: 'sticky-notes' (استیکی‌نوت‌ها) or 'notes' (یادداشت‌ها)
  const [activeTab, setActiveTab] = useState<'sticky-notes' | 'notes'>('notes');

  // Search input
  const [searchQuery, setSearchQuery] = useState('');

  // Sticky Notes Filter (by file)
  const [selectedFileId, setSelectedFileId] = useState<string>('all');

  // Standalone Notes Filter (by folder)
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');

  // Category Submenu Dropdown Popover Anchor (زیرمجموعه کشویی دسته‌بندی‌ها دقیقاً مانند کتابخانه)
  const [isCategorySubmenuOpen, setIsCategorySubmenuOpen] = useState(false);
  const categorySubmenuRef = useRef<HTMLDivElement | null>(null);

  // File Submenu Dropdown Popover Anchor for Sticky Notes (زیرمجموعه کشویی فیلتر فایل‌ها)
  const [isFileSubmenuOpen, setIsFileSubmenuOpen] = useState(false);
  const fileSubmenuRef = useRef<HTMLDivElement | null>(null);

  // Close category & file submenus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (categorySubmenuRef.current && !categorySubmenuRef.current.contains(e.target as Node)) {
        setIsCategorySubmenuOpen(false);
      }
      if (fileSubmenuRef.current && !fileSubmenuRef.current.contains(e.target as Node)) {
        setIsFileSubmenuOpen(false);
      }
    };
    if (isCategorySubmenuOpen || isFileSubmenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [isCategorySubmenuOpen, isFileSubmenuOpen]);

  // Clean Reader Window Modal State (پنجره تمیز، شارپ و خلوت برای مرور و خواندن کامل)
  const [viewingItem, setViewingItem] = useState<ActiveViewerItem | null>(null);
  const [readerFontSize, setReaderFontSize] = useState<'normal' | 'large' | 'huge'>('large');

  // Inline expanded sticky note cards (امکان مطالعه کامل یادداشت مستقیماً در کارت بدون نیاز به پاپ‌آپ)
  const [expandedStickyIds, setExpandedStickyIds] = useState<Record<string, boolean>>({});

  const toggleExpandSticky = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedStickyIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Sticky Note Quick Edit Modal
  const [editingStickyNote, setEditingStickyNote] = useState<FileStickyNoteEntry | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editColor, setEditColor] = useState('#fef08a');
  const [editTextColor, setEditTextColor] = useState('#713f12');

  // Folder Management Modal State (ایجاد و ویرایش پوشه‌ها هماهنگ با دیزاین سراسری)
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [parentFolderIdInput, setParentFolderIdInput] = useState<string | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [folderColorInput, setFolderColorInput] = useState('#2563eb');
  const [folderToDelete, setFolderToDelete] = useState<NoteFolder | null>(null);

  // Delete Confirmations
  const [deletingStickyNote, setDeletingStickyNote] = useState<FileStickyNoteEntry | null>(null);
  const [deletingNote, setDeletingNote] = useState<NoteItem | null>(null);

  // Copy toast notification
  const [copiedToast, setCopiedToast] = useState<string | null>(null);

  const showCopyToast = (msg: string) => {
    setCopiedToast(msg);
    setTimeout(() => {
      setCopiedToast(null);
    }, 2200);
  };

  // Organize root folders and subcategories map
  const rootFolders = useMemo(() => {
    return folders.filter((f) => !f.parentId || !folders.some((p) => p.id === f.parentId));
  }, [folders]);

  const subfoldersMap = useMemo(() => {
    const map: Record<string, NoteFolder[]> = {};
    folders.forEach((f) => {
      if (f.parentId) {
        if (!map[f.parentId]) map[f.parentId] = [];
        map[f.parentId].push(f);
      }
    });
    return map;
  }, [folders]);

  // Flatten all sticky notes from files
  const allStickyNotes: FileStickyNoteEntry[] = useMemo(() => {
    const list: FileStickyNoteEntry[] = [];
    (studyFiles || []).forEach((file) => {
      (file.stickyNotes || []).forEach((note) => {
        list.push({
          fileId: file.id,
          fileName: file.name,
          file,
          note,
        });
      });
    });
    return list.sort((a, b) => {
      if (a.fileName !== b.fileName) {
        return a.fileName.localeCompare(b.fileName, 'fa');
      }
      return (a.note.pageNumber || 1) - (b.note.pageNumber || 1);
    });
  }, [studyFiles]);

  // Unique files that have sticky notes
  const filesWithStickyNotes = useMemo(() => {
    const fileMap = new Map<string, { id: string; name: string; count: number }>();
    allStickyNotes.forEach((entry) => {
      const existing = fileMap.get(entry.fileId);
      if (existing) {
        existing.count += 1;
      } else {
        fileMap.set(entry.fileId, {
          id: entry.fileId,
          name: entry.fileName,
          count: 1,
        });
      }
    });
    return Array.from(fileMap.values());
  }, [allStickyNotes]);

  // Active selected file info for sticky notes filter button label
  const activeSelectedFile = useMemo(() => {
    if (selectedFileId === 'all') return null;
    return filesWithStickyNotes.find((f) => f.id === selectedFileId) || null;
  }, [selectedFileId, filesWithStickyNotes]);

  // Count notes per folder with hierarchy rollup
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: notes.length,
      uncategorized: notes.filter((n) => !n.folderId).length,
    };
    folders.forEach((f) => {
      const familyIds = getFolderAndDescendantIds(f.id, folders);
      counts[f.id] = notes.filter((n) => n.folderId && familyIds.includes(n.folderId)).length;
      counts[`${f.id}_direct`] = notes.filter((n) => n.folderId === f.id).length;
    });
    return counts;
  }, [notes, folders]);

  // Active selected folder info for breadcrumb display
  const activeSelectedFolder = useMemo(() => {
    if (selectedFolderId === 'all') return null;
    if (selectedFolderId === 'uncategorized') {
      return {
        id: 'uncategorized',
        name: 'عمومی (بدون پوشه)',
        color: '#737373',
        breadcrumb: 'عمومی و بدون پوشه',
        parent: null,
      };
    }
    const curr = folders.find((f) => f.id === selectedFolderId);
    if (!curr) return null;
    const parent = curr.parentId ? folders.find((f) => f.id === curr.parentId) : null;
    return {
      id: curr.id,
      folder: curr,
      parent,
      name: curr.name,
      breadcrumb: parent ? `${parent.name} › ${curr.name}` : curr.name,
      color: curr.color || '#2563eb',
    };
  }, [selectedFolderId, folders]);

  // Filtered Sticky Notes
  const filteredStickyNotes = useMemo(() => {
    return allStickyNotes.filter((entry) => {
      if (selectedFileId !== 'all' && entry.fileId !== selectedFileId) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const titleMatch = (entry.note.title || '').toLowerCase().includes(query);
        const contentMatch = (entry.note.content || '').toLowerCase().includes(query);
        const fileMatch = entry.fileName.toLowerCase().includes(query);
        if (!titleMatch && !contentMatch && !fileMatch) {
          return false;
        }
      }
      return true;
    });
  }, [allStickyNotes, selectedFileId, searchQuery]);

  // Filtered Standalone Notes
  const filteredNotes = useMemo(() => {
    return notes
      .filter((note) => {
        if (selectedFolderId !== 'all') {
          if (selectedFolderId === 'uncategorized') {
            if (note.folderId) return false;
          } else {
            const allowedFolderIds = getFolderAndDescendantIds(selectedFolderId, folders);
            if (!note.folderId || !allowedFolderIds.includes(note.folderId)) {
              return false;
            }
          }
        }
        if (searchQuery.trim()) {
          const query = searchQuery.trim().toLowerCase();
          const titleMatch = (note.title || '').toLowerCase().includes(query);
          const contentMatch = stripHtml(note.content || '').toLowerCase().includes(query);
          if (!titleMatch && !contentMatch) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return 0;
      });
  }, [notes, selectedFolderId, searchQuery, folders]);

  // Open Clean Viewer for a Sticky Note
  const handleOpenStickyViewer = (entry: FileStickyNoteEntry) => {
    setViewingItem({
      type: 'sticky',
      id: entry.note.id,
      title: cleanPastedMarkdown(entry.note.title || `یادداشت صفحه ${entry.note.pageNumber}`),
      content: cleanPastedMarkdown(entry.note.content || ''),
      sourceLabel: entry.fileName,
      pageNumber: entry.note.pageNumber,
      color: entry.note.color,
      textColor: entry.note.textColor,
      date: entry.note.createdAt,
      originalEntry: entry,
      isBold: entry.note.isBold,
      imageUrl: entry.note.imageUrl,
      images: entry.note.images && entry.note.images.length > 0 ? entry.note.images : (entry.note.imageUrl ? [entry.note.imageUrl] : []),
    });
  };

  // Open Clean Viewer for a Standalone Note
  const handleOpenNoteViewer = (note: NoteItem) => {
    const folder = folders.find((f) => f.id === note.folderId);
    setViewingItem({
      type: 'note',
      id: note.id,
      title: note.title || 'بدون عنوان',
      content: stripHtml(note.content || ''),
      sourceLabel: folder ? folder.name : 'عمومی',
      date: note.updatedAt || note.createdAt,
      originalNote: note,
    });
  };

  // Open Edit Modal for Sticky Note
  const handleOpenEditStickyNote = (entry: FileStickyNoteEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingStickyNote(entry);
    setEditTitle(cleanPastedMarkdown(entry.note.title || ''));
    setEditContent(cleanPastedMarkdown(entry.note.content || ''));
    setEditColor(entry.note.color || '#fef08a');
    setEditTextColor(entry.note.textColor || '#713f12');
  };

  // Save Edit Sticky Note
  const handleSaveEditStickyNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStickyNote || !onUpdateStickyNote) return;

    const cleanedTitle = cleanPastedMarkdown(editTitle.trim());
    const cleanedContent = cleanPastedMarkdown(editContent.trim());

    const updated: StickyNoteItem = {
      ...editingStickyNote.note,
      title: cleanedTitle,
      content: cleanedContent,
      color: editColor,
      textColor: editTextColor,
    };
    onUpdateStickyNote(editingStickyNote.fileId, updated);
    setEditingStickyNote(null);
    if (viewingItem && viewingItem.id === updated.id) {
      setViewingItem({
        ...viewingItem,
        title: updated.title,
        content: updated.content,
        color: updated.color,
        textColor: updated.textColor,
      });
    }
    showCopyToast('تغییرات ذخیره شد');
  };

  // Confirm delete sticky note
  const handleConfirmDeleteStickyNote = () => {
    if (!deletingStickyNote || !onDeleteStickyNote) return;
    onDeleteStickyNote(deletingStickyNote.fileId, deletingStickyNote.note.id);
    if (viewingItem?.id === deletingStickyNote.note.id) {
      setViewingItem(null);
    }
    setDeletingStickyNote(null);
    showCopyToast('استیکی‌نوت حذف شد');
  };

  // Confirm delete standalone note
  const handleConfirmDeleteNote = () => {
    if (!deletingNote) return;
    onDeleteNote(deletingNote.id);
    if (viewingItem?.id === deletingNote.id) {
      setViewingItem(null);
    }
    setDeletingNote(null);
    showCopyToast('یادداشت حذف شد');
  };

  // Copy to clipboard helper
  const handleCopyText = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    showCopyToast(`${label} کپی شد`);
  };

  // Folder management handlers
  const handleOpenAddFolder = (initialParentId: string | null = null) => {
    setEditingFolder(null);
    setParentFolderIdInput(initialParentId);
    setFolderNameInput('');
    setFolderColorInput('#2563eb');
    setIsFolderModalOpen(true);
  };

  const handleOpenEditFolder = (f: NoteFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolder(f);
    setParentFolderIdInput(f.parentId || null);
    setFolderNameInput(f.name);
    setFolderColorInput(f.color || '#2563eb');
    setIsFolderModalOpen(true);
  };

  const handleSaveFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const name = folderNameInput.trim();
    if (!name) return;

    if (editingFolder) {
      if (onUpdateFolder) {
        onUpdateFolder(editingFolder.id, name, folderColorInput, parentFolderIdInput);
      }
    } else {
      if (onAddFolder) {
        onAddFolder({
          name,
          color: folderColorInput,
          parentId: parentFolderIdInput,
        });
      }
    }
    setIsFolderModalOpen(false);
  };

  const handleConfirmDeleteFolder = () => {
    if (!folderToDelete) return;
    if (onDeleteFolder) {
      onDeleteFolder(folderToDelete.id);
    }
    if (selectedFolderId === folderToDelete.id) {
      setSelectedFolderId('all');
    }
    setFolderToDelete(null);
    showCopyToast('پوشه حذف شد');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-50/60 overflow-hidden relative select-auto font-sans" dir="rtl">
      {/* 1. Top Header with Tabs & Prominent Actions */}
      <header className="bg-white border-b border-neutral-200/80 px-4 sm:px-8 pt-5 pb-4 shrink-0 shadow-2xs relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Two Tabs with iOS Spring Physics */}
          <div className="flex items-center gap-2 p-1 bg-neutral-100/90 rounded-2xl w-full sm:w-auto">
            {/* Tab 1: یادداشت‌ها */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('notes');
                setIsCategorySubmenuOpen(false);
                setIsFileSubmenuOpen(false);
              }}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ios-spring-btn ${
                activeTab === 'notes'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/50'
              }`}
            >
              <FileText className={`w-4 h-4 ${activeTab === 'notes' ? 'text-sky-600' : 'text-neutral-400'}`} />
              <span>یادداشت‌ها</span>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono rounded-full ${
                  activeTab === 'notes'
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'bg-neutral-200/80 text-neutral-600'
                }`}
              >
                {notes.length}
              </span>
            </button>

            {/* Tab 2: استیکی‌نوت‌ها */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('sticky-notes');
                setIsCategorySubmenuOpen(false);
                setIsFileSubmenuOpen(false);
              }}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ios-spring-btn ${
                activeTab === 'sticky-notes'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/50'
              }`}
            >
              <StickyNote className={`w-4 h-4 ${activeTab === 'sticky-notes' ? 'text-amber-500' : 'text-neutral-400'}`} />
              <span>استیکی‌نوت‌ها</span>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono rounded-full ${
                  activeTab === 'sticky-notes'
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'bg-neutral-200/80 text-neutral-600'
                }`}
              >
                {allStickyNotes.length}
              </span>
            </button>
          </div>

          {/* Header Action: New Note Button (تنها در سربرگ یادداشت‌ها نمایش داده می‌شود و از سربرگ استیکی‌نوت حذف شده است) */}
          {activeTab === 'notes' && (
            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                type="button"
                onClick={onStartNewNote}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl cursor-pointer ios-spring-btn shadow-md"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>یادداشت جدید</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. Unified Search, Folders & File Filters Toolbar (هماهنگ با دیزاین سراسری اپلیکیشن) */}
      <div
        className={`bg-white/95 backdrop-blur-md border-b border-neutral-200/80 px-4 sm:px-8 py-3 shrink-0 shadow-2xs relative transition-all ${
          isCategorySubmenuOpen || isFileSubmenuOpen ? 'z-40' : 'z-20'
        }`}
      >
        <div className="max-w-6xl mx-auto space-y-2.5">
          {/* Upper Row: Search input */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={
                  activeTab === 'notes'
                    ? 'جستجو در عنوان، متن یا پوشه یادداشت‌ها...'
                    : 'جستجو در استیکی‌نوت‌ها و فایل‌ها...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-9 pl-8 py-2 bg-neutral-50/80 hover:bg-neutral-50 focus:bg-white border border-neutral-200/80 focus:border-neutral-400 rounded-xl text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-200 cursor-pointer transition-colors"
                  title="پاک کردن جستجو"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Lower Row: Category Pills & Submenu Filter (دقیقاً مشابه بخش کتابخانه) */}
          {activeTab === 'notes' ? (
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-neutral-100/90 flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap flex-1">
                {/* 1. All Notes (همه یادداشت‌ها) */}
                <button
                  type="button"
                  onClick={() => setSelectedFolderId('all')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ios-spring-btn shrink-0 ${
                    selectedFolderId === 'all'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>همه یادداشت‌ها</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      selectedFolderId === 'all'
                        ? 'bg-neutral-700 text-white'
                        : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {notes.length}
                  </span>
                </button>

                {/* Divider */}
                <div className="w-px h-4 bg-neutral-200 shrink-0 hidden sm:block" />

                {/* 2. Category Submenu Dropdown (زیرمجموعه کشویی دسته‌بندی‌ها دقیقاً مثل کتابخانه) */}
                <div className={`relative shrink-0 ${isCategorySubmenuOpen ? 'z-50' : ''}`} ref={categorySubmenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsCategorySubmenuOpen(!isCategorySubmenuOpen)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ios-spring-btn shrink-0 ${
                      activeSelectedFolder && activeSelectedFolder.id !== 'uncategorized'
                        ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                        : selectedFolderId === 'uncategorized'
                        ? 'bg-neutral-100 text-neutral-900 border-neutral-300'
                        : isCategorySubmenuOpen
                        ? 'bg-neutral-100 text-neutral-900 border-neutral-300'
                        : 'bg-white hover:bg-neutral-50 text-neutral-700 border-neutral-200/90'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5 shrink-0" />
                    {activeSelectedFolder && activeSelectedFolder.id !== 'uncategorized' ? (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: activeSelectedFolder.color || '#2563eb' }}
                        />
                        <span>دسته: {activeSelectedFolder.name}</span>
                      </span>
                    ) : selectedFolderId === 'uncategorized' ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-neutral-400 shrink-0" />
                        <span>عمومی (بدون پوشه)</span>
                      </span>
                    ) : (
                      <span>دسته‌بندی‌ها</span>
                    )}
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-200 opacity-60 ${
                        isCategorySubmenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {/* Submenu Dropdown Popover with global iOS jelly animation */}
                  {isCategorySubmenuOpen && (
                    <div
                      className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-white rounded-2xl shadow-2xl p-2 z-50 animate-ios-jelly origin-top-right select-none border border-neutral-200/80 ring-1 ring-black/5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between pb-2 px-2 border-b border-neutral-100 mb-1">
                        <span className="text-[11px] font-bold text-neutral-500">
                          انتخاب دسته‌بندی
                        </span>
                        {onAddFolder && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsCategorySubmenuOpen(false);
                              handleOpenAddFolder(null);
                            }}
                            className="text-[11px] font-bold text-neutral-800 hover:text-black flex items-center gap-1 bg-neutral-100 hover:bg-neutral-200 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>دسته جدید</span>
                          </button>
                        )}
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1 py-1">
                        {/* Option to clear category filter */}
                        {selectedFolderId !== 'all' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFolderId('all');
                              setIsCategorySubmenuOpen(false);
                            }}
                            className="w-full text-right px-2.5 py-1.5 text-xs font-bold text-rose-600 bg-rose-50/70 hover:bg-rose-100/80 rounded-xl flex items-center justify-between border border-rose-200 transition-colors cursor-pointer mb-1"
                          >
                            <div className="flex items-center gap-1.5">
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              <span>حذف فیلتر دسته‌بندی (نمایش همه)</span>
                            </div>
                            <X className="w-3.5 h-3.5 text-rose-500" />
                          </button>
                        )}

                        {/* All Categories Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFolderId('all');
                            setIsCategorySubmenuOpen(false);
                          }}
                          className={`w-full text-right px-2.5 py-2 rounded-xl text-xs flex items-center justify-between hover:bg-neutral-100 cursor-pointer transition-colors ${
                            selectedFolderId === 'all'
                              ? 'font-bold bg-neutral-100 text-neutral-900'
                              : 'text-neutral-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <FolderOpen className="w-3.5 h-3.5 text-neutral-400" />
                            <span>همه یادداشت‌ها</span>
                          </div>
                          {selectedFolderId === 'all' && (
                            <Check className="w-3.5 h-3.5 text-neutral-800 shrink-0" />
                          )}
                        </button>

                        {/* Categories List (با ساختار درختی و زیرمجموعه‌بندی تمیز) */}
                        {rootFolders.map((f) => {
                          const isCurrent = selectedFolderId === f.id;
                          const count = folderCounts[f.id] || 0;
                          const children = subfoldersMap[f.id] || [];

                          return (
                            <React.Fragment key={f.id}>
                              <div
                                className={`group flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors ${
                                  isCurrent ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedFolderId(f.id);
                                    setIsCategorySubmenuOpen(false);
                                  }}
                                  className="flex items-center gap-2 min-w-0 flex-1 text-right text-xs cursor-pointer py-0.5"
                                >
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: f.color || '#2563eb' }}
                                  />
                                  <span
                                    className={`truncate ${
                                      isCurrent ? 'font-bold text-neutral-900' : 'text-neutral-700'
                                    }`}
                                  >
                                    {f.name}
                                  </span>
                                  {children.length > 0 && (
                                    <span className="text-[10px] text-neutral-400 font-normal">
                                      ({children.length} زیردسته)
                                    </span>
                                  )}
                                </button>

                                <div className="flex items-center gap-1 shrink-0">
                                  <span
                                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                                      isCurrent
                                        ? 'bg-neutral-900 text-white'
                                        : 'bg-neutral-100 text-neutral-600'
                                    }`}
                                  >
                                    {count}
                                  </span>

                                  {/* Quick Add Subcategory */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenAddFolder(f.id);
                                      setIsCategorySubmenuOpen(false);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-neutral-800 rounded cursor-pointer transition-opacity"
                                    title="افزودن زیرمجموعه جدید به این دسته"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>

                                  {/* Edit Trigger */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      handleOpenEditFolder(f, e);
                                      setIsCategorySubmenuOpen(false);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-neutral-700 rounded cursor-pointer transition-opacity"
                                    title="ویرایش دسته‌بندی"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>

                                  {/* Delete Trigger */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFolderToDelete(f);
                                      setIsCategorySubmenuOpen(false);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-rose-600 rounded cursor-pointer transition-opacity"
                                    title="حذف دسته‌بندی"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>

                                  {isCurrent && (
                                    <Check className="w-3.5 h-3.5 text-neutral-800 shrink-0 mr-1" />
                                  )}
                                </div>
                              </div>

                              {/* Children / Subcategories */}
                              {children.map((child) => {
                                const isChildCurrent = selectedFolderId === child.id;
                                const childCount = folderCounts[child.id] || 0;
                                return (
                                  <div
                                    key={child.id}
                                    className={`group flex items-center justify-between rounded-xl pr-6 pl-2.5 py-1 transition-colors ${
                                      isChildCurrent ? 'bg-neutral-100' : 'hover:bg-neutral-50/80'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedFolderId(child.id);
                                        setIsCategorySubmenuOpen(false);
                                      }}
                                      className="flex items-center gap-1.5 min-w-0 flex-1 text-right text-xs cursor-pointer py-0.5"
                                    >
                                      <span className="text-neutral-300 text-xs select-none">↳</span>
                                      <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: child.color || '#2563eb' }}
                                      />
                                      <span
                                        className={`truncate ${
                                          isChildCurrent
                                            ? 'font-bold text-neutral-900'
                                            : 'text-neutral-600 text-[11px]'
                                        }`}
                                      >
                                        {child.name}
                                      </span>
                                    </button>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <span
                                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                                          isChildCurrent
                                            ? 'bg-neutral-900 text-white'
                                            : 'bg-neutral-100 text-neutral-500'
                                        }`}
                                      >
                                        {childCount}
                                      </span>

                                      {/* Edit Child */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          handleOpenEditFolder(child, e);
                                          setIsCategorySubmenuOpen(false);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-neutral-700 rounded cursor-pointer transition-opacity"
                                        title="ویرایش زیرمجموعه"
                                      >
                                        <Edit2 className="w-2.5 h-2.5" />
                                      </button>

                                      {/* Delete Child */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setFolderToDelete(child);
                                          setIsCategorySubmenuOpen(false);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-rose-600 rounded cursor-pointer transition-opacity"
                                        title="حذف زیرمجموعه"
                                      >
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </button>

                                      {isChildCurrent && (
                                        <Check className="w-3 h-3 text-neutral-800 shrink-0 mr-1" />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}

                        {/* Uncategorized Option */}
                        <div
                          className={`group flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors border-t border-neutral-100 mt-1 pt-1.5 ${
                            selectedFolderId === 'uncategorized'
                              ? 'bg-neutral-100'
                              : 'hover:bg-neutral-50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFolderId('uncategorized');
                              setIsCategorySubmenuOpen(false);
                            }}
                            className="flex items-center gap-2 min-w-0 flex-1 text-right text-xs cursor-pointer py-0.5"
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-neutral-400 shrink-0" />
                            <span
                              className={`truncate ${
                                selectedFolderId === 'uncategorized'
                                  ? 'font-bold text-neutral-900'
                                  : 'text-neutral-700'
                              }`}
                            >
                              عمومی (بدون پوشه)
                            </span>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold bg-neutral-100 text-neutral-600">
                              {folderCounts.uncategorized || 0}
                            </span>
                            {selectedFolderId === 'uncategorized' && (
                              <Check className="w-3.5 h-3.5 text-neutral-800 shrink-0 mr-1" />
                            )}
                          </div>
                        </div>

                        {folders.length === 0 && (
                          <div className="p-3 text-center text-xs text-neutral-400">
                            هنوز دسته‌ای ایجاد نکرده‌اید. با زدن «دسته جدید» می‌توانید پوشه بسازید.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Filter Reset Button */}
              {(selectedFolderId !== 'all' || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFolderId('all');
                    setSearchQuery('');
                  }}
                  className="px-2 py-1 text-[11px] font-semibold text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                  title="پاک کردن فیلترها"
                >
                  <X className="w-3 h-3" />
                  <span>پاکسازی فیلتر</span>
                </button>
              )}
            </div>
          ) : (
            /* Sticky Notes File Filter Row (دقیقاً هماهنگ با بخش یادداشت‌ها و کتابخانه با زیرمجموعه کشویی تمیز) */
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-neutral-100/90 flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap flex-1">
                {/* 1. All Files (همه فایل‌ها) */}
                <button
                  type="button"
                  onClick={() => setSelectedFileId('all')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ios-spring-btn shrink-0 ${
                    selectedFileId === 'all'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>همه فایل‌ها</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      selectedFileId === 'all'
                        ? 'bg-neutral-700 text-white'
                        : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {allStickyNotes.length}
                  </span>
                </button>

                {/* Divider */}
                <div className="w-px h-4 bg-neutral-200 shrink-0 hidden sm:block" />

                {/* 2. File Submenu Dropdown (زیرمجموعه کشویی منابع و فایل‌ها دقیقاً مشابه کتابخانه و یادداشت‌ها) */}
                <div className={`relative shrink-0 ${isFileSubmenuOpen ? 'z-50' : ''}`} ref={fileSubmenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsFileSubmenuOpen(!isFileSubmenuOpen)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ios-spring-btn shrink-0 ${
                      activeSelectedFile
                        ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                        : isFileSubmenuOpen
                        ? 'bg-neutral-100 text-neutral-900 border-neutral-300'
                        : 'bg-white hover:bg-neutral-50 text-neutral-700 border-neutral-200/90'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    {activeSelectedFile ? (
                      <span className="flex items-center gap-1.5 max-w-[180px] sm:max-w-[220px]">
                        <span className="truncate">فایل: {activeSelectedFile.name}</span>
                      </span>
                    ) : (
                      <span>فایل‌ها و منابع</span>
                    )}
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-200 opacity-60 ${
                        isFileSubmenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {/* Submenu Dropdown Popover with global iOS jelly animation */}
                  {isFileSubmenuOpen && (
                    <div
                      className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-white rounded-2xl shadow-2xl p-2 z-50 animate-ios-jelly origin-top-right select-none border border-neutral-200/80 ring-1 ring-black/5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between pb-2 px-2 border-b border-neutral-100 mb-1">
                        <span className="text-[11px] font-bold text-neutral-500">
                          انتخاب منبع و فایل
                        </span>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {filesWithStickyNotes.length} منبع
                        </span>
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1 py-1">
                        {/* Option to clear file filter */}
                        {selectedFileId !== 'all' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFileId('all');
                              setIsFileSubmenuOpen(false);
                            }}
                            className="w-full text-right px-2.5 py-1.5 text-xs font-bold text-rose-600 bg-rose-50/70 hover:bg-rose-100/80 rounded-xl flex items-center justify-between border border-rose-200 transition-colors cursor-pointer mb-1"
                          >
                            <div className="flex items-center gap-1.5">
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              <span>حذف فیلتر (نمایش همه فایل‌ها)</span>
                            </div>
                            <X className="w-3.5 h-3.5 text-rose-500" />
                          </button>
                        )}

                        {/* All Files Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFileId('all');
                            setIsFileSubmenuOpen(false);
                          }}
                          className={`w-full text-right px-2.5 py-2 rounded-xl text-xs flex items-center justify-between hover:bg-neutral-100 cursor-pointer transition-colors ${
                            selectedFileId === 'all'
                              ? 'font-bold bg-neutral-100 text-neutral-900'
                              : 'text-neutral-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5 text-neutral-400" />
                            <span>همه فایل‌ها و استیکی‌نوت‌ها</span>
                          </div>
                          {selectedFileId === 'all' && (
                            <Check className="w-3.5 h-3.5 text-neutral-800 shrink-0" />
                          )}
                        </button>

                        {/* Files List */}
                        {filesWithStickyNotes.map((f) => {
                          const isCurrent = selectedFileId === f.id;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => {
                                setSelectedFileId(f.id);
                                setIsFileSubmenuOpen(false);
                              }}
                              className={`w-full text-right px-2.5 py-2 rounded-xl text-xs flex items-center justify-between hover:bg-neutral-100 cursor-pointer transition-colors group ${
                                isCurrent
                                  ? 'font-bold bg-neutral-100 text-neutral-900'
                                  : 'text-neutral-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <FileText className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 shrink-0" />
                                <span className="truncate">{f.name}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 mr-1.5">
                                <span
                                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                                    isCurrent
                                      ? 'bg-neutral-900 text-white'
                                      : 'bg-neutral-100 text-neutral-600'
                                  }`}
                                >
                                  {f.count}
                                </span>
                                {isCurrent && (
                                  <Check className="w-3.5 h-3.5 text-neutral-800 shrink-0 mr-1" />
                                )}
                              </div>
                            </button>
                          );
                        })}

                        {filesWithStickyNotes.length === 0 && (
                          <div className="p-3 text-center text-xs text-neutral-400">
                            هنوز استیکی‌نوتی در هیچ فایلی ثبت نشده است.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Filter Reset Button */}
              {(selectedFileId !== 'all' || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFileId('all');
                    setSearchQuery('');
                  }}
                  className="px-2 py-1 text-[11px] font-semibold text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                  title="پاک کردن فیلترها"
                >
                  <X className="w-3 h-3" />
                  <span>پاکسازی فیلتر</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. Main List: کلیک روی هر کارت پنجره تمیز و خلوت را با فیزیک ژله‌ای باز می‌کند */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 relative z-0">
        <div className="max-w-6xl mx-auto">
          {activeTab === 'sticky-notes' ? (
            /* =========================================================
               TAB: لیست استیکی‌نوت‌ها با انیمیشن فنری کارت‌ها
               ========================================================= */
            <div>
              {filteredStickyNotes.length === 0 ? (
                <div className="bg-white border border-dashed border-neutral-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shadow-2xs">
                    <StickyNote className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-neutral-800">
                    {searchQuery || selectedFileId !== 'all'
                      ? 'هیچ استیکی‌نوتی با این فیلتر یافت نشد'
                      : 'هنوز هیچ استیکی‌نوتی در فایل‌ها ثبت نشده است'}
                  </h3>
                  <p className="text-xs text-neutral-400 max-w-sm leading-relaxed">
                    هنگام مطالعه کتاب‌ها و جزوه‌ها، از ابزار یادداشت چسبان روی صفحات استفاده کنید یا فایل دلخواه خود را اضافه فرمایید.
                  </p>
                  {onTriggerNewFile && (
                    <button
                      type="button"
                      onClick={onTriggerNewFile}
                      className="mt-2 px-4 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl shadow-xs cursor-pointer ios-spring-btn flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>افزودن فایل دلخواه</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
                  {filteredStickyNotes.map((entry) => {
                    const rawContent = cleanPastedMarkdown(entry.note.content || '');
                    const displayTitle = cleanPastedMarkdown(entry.note.title || `یادداشت صفحه ${entry.note.pageNumber}`);
                    const isExpanded = Boolean(expandedStickyIds[entry.note.id]);
                    const isLongContent = rawContent.length > 130 || rawContent.includes('\n');
                    const noteBg = entry.note.color || '#fef08a';

                    return (
                      <article
                        key={`${entry.fileId}-${entry.note.id}`}
                        onClick={() => handleOpenStickyViewer(entry)}
                        className="rounded-2xl bg-white border border-neutral-200/90 hover:border-neutral-400 hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer overflow-hidden relative"
                        style={{ borderTop: `4px solid ${noteBg}` }}
                        title="برای باز کردن پنجره اختصاصی کلیک کنید"
                      >
                        <div className="p-4 sm:p-5 pb-3">
                          {/* Top Row: File Name + Page Badge */}
                          <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <BookOpen className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                              <span
                                className="text-xs font-bold text-neutral-700 truncate max-w-[160px]"
                                title={entry.fileName}
                              >
                                {entry.fileName}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className="px-2 py-0.5 rounded-md text-[11px] font-black font-mono border border-black/10 shadow-2xs"
                                style={{
                                  backgroundColor: noteBg,
                                  color: entry.note.textColor || '#713f12',
                                }}
                              >
                                ص {entry.note.pageNumber}
                              </span>
                            </div>
                          </div>

                          {/* Title */}
                          <h3 className="text-sm sm:text-[15px] font-extrabold text-neutral-950 group-hover:text-black line-clamp-1 mb-2 tracking-tight">
                            {displayTitle}
                          </h3>

                          {/* Attached Images Preview if present */}
                          {(((entry.note.images && entry.note.images.length > 0) || entry.note.imageUrl)) && (
                            <div className="mb-2.5">
                              {(!entry.note.images || entry.note.images.length <= 1) ? (
                                <div className="rounded-xl overflow-hidden border border-black/10 max-h-40 bg-white/60 flex items-center justify-center">
                                  <img
                                    src={entry.note.images?.[0] || entry.note.imageUrl}
                                    alt="پیوست استیکی‌نوت"
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-1.5">
                                  {entry.note.images.slice(0, 2).map((img, idx) => (
                                    <div key={idx} className="relative rounded-lg overflow-hidden border border-black/10 h-24 bg-white/60 shadow-2xs">
                                      <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                                      {idx === 1 && entry.note.images!.length > 2 && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs font-bold font-mono">
                                          +{entry.note.images!.length - 2}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Content with high contrast and sharp typography */}
                          <div
                            className={`text-[13.5px] sm:text-[14px] text-neutral-900 leading-[1.8] select-text font-sans ${
                              entry.note.isBold ? 'font-bold' : 'font-medium'
                            } ${!isExpanded && isLongContent ? 'line-clamp-3' : 'whitespace-pre-wrap'}`}
                          >
                            {rawContent || (
                              <span className="text-neutral-400 italic font-normal text-xs">بدون متن...</span>
                            )}
                          </div>

                          {/* Inline expand/collapse toggle for quick in-place review */}
                          {isLongContent && (
                            <button
                              type="button"
                              onClick={(e) => toggleExpandSticky(entry.note.id, e)}
                              className="mt-2 text-xs font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1 cursor-pointer py-1 select-none"
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="w-3.5 h-3.5" />
                                  <span>بستن و خلاصه‌سازی</span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3.5 h-3.5" />
                                  <span>مطالعه کامل همین یادداشت</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Bottom Row Actions */}
                        <div className="px-4 sm:px-5 py-3 bg-neutral-50/70 border-t border-neutral-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] text-neutral-400 font-mono truncate">
                              {entry.note.createdAt || 'ثبت شده'}
                            </span>

                            {/* Direct Jump to PDF page button */}
                            {onOpenFileAtPage && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenFileAtPage(entry.file, entry.note.pageNumber);
                                }}
                                className="px-2 py-1 text-[11px] font-bold text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-200/90 rounded-lg cursor-pointer flex items-center gap-1 shadow-2xs"
                                title="رفتن به این صفحه در کتاب"
                              >
                                <ExternalLink className="w-3 h-3 text-neutral-500" />
                                <span className="hidden sm:inline">مشاهده در فایل</span>
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Open Clean Reader Modal */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenStickyViewer(entry);
                              }}
                              className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-lg cursor-pointer"
                              title="مرور در پنجره اختصاصی خواندن"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Copy button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyText(entry.note.content, 'متن یادداشت');
                              }}
                              className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-lg cursor-pointer"
                              title="کپی متن"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>

                            {/* Edit button */}
                            <button
                              type="button"
                              onClick={(e) => handleOpenEditStickyNote(entry, e)}
                              className="p-1.5 text-neutral-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg cursor-pointer"
                              title="ویرایش سریع"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingStickyNote(entry);
                              }}
                              className="p-1.5 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* =========================================================
               TAB: لیست یادداشت‌های اختصاصی با انیمیشن فنری کارت‌ها
               ========================================================= */
            <div>
              {filteredNotes.length === 0 ? (
                <div className="bg-white border border-dashed border-neutral-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-2xs">
                    <FileText className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-neutral-800">
                    {searchQuery || selectedFolderId !== 'all'
                      ? 'هیچ یادداشتی با این فیلتر یافت نشد'
                      : 'هنوز یادداشتی ثبت نشده است'}
                  </h3>
                  <p className="text-xs text-neutral-400 max-w-sm leading-relaxed">
                    می‌توانید برای یادداشت‌برداری و خلاصه‌نویسی نکات درسی، یک یادداشت جدید ایجاد کرده یا فایلی را بارگذاری کنید.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={onStartNewNote}
                      className="px-4 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl shadow-xs cursor-pointer ios-spring-btn flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>ایجاد یادداشت جدید</span>
                    </button>
                    {onTriggerNewFile && (
                      <button
                        type="button"
                        onClick={onTriggerNewFile}
                        className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer ios-spring-btn flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>افزودن فایل دلخواه</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredNotes.map((note) => {
                    const noteFolder = folders.find((f) => f.id === note.folderId);
                    const preview = stripHtml(note.content || '');

                    return (
                      <article
                        key={note.id}
                        onClick={() => handleOpenNoteViewer(note)}
                        className={`rounded-2xl p-4 sm:p-5 bg-white ios-spring-card flex flex-col justify-between group cursor-pointer border transition-all ${
                          note.isPinned
                            ? 'border-amber-300/80 bg-gradient-to-b from-amber-50/20 to-white shadow-xs'
                            : 'border-neutral-200/75 hover:border-neutral-300 hover:shadow-md'
                        }`}
                        title="برای مشاهده متن کامل کلیک کنید"
                      >
                        <div>
                          {/* Top Row: File icon + Quiet Folder Label (Zero-Pill discipline) + Date & Pin */}
                          <div className="flex items-center justify-between gap-2 mb-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-neutral-100 group-hover:bg-neutral-900 group-hover:text-white text-neutral-600 flex items-center justify-center shrink-0 transition-colors shadow-2xs">
                                <FileText className="w-3.5 h-3.5" />
                              </div>

                              {noteFolder ? (
                                <div className="flex items-center gap-1.5 min-w-0 text-xs text-neutral-500 font-medium">
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: noteFolder.color || '#2563eb' }}
                                  />
                                  <span className="truncate max-w-[120px]">{noteFolder.name}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-neutral-400">عمومی</span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[11px] text-neutral-400 font-mono tabular-nums">
                                {note.createdAt}
                              </span>
                              {note.isPinned && (
                                <span className="p-0.5 text-amber-500" title="سنجاق‌شده">
                                  <Pin className="w-3.5 h-3.5 fill-amber-500" />
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Title */}
                          <h3 className="text-sm font-bold text-neutral-900 group-hover:text-black line-clamp-1 mb-1.5">
                            {note.title || 'بدون عنوان'}
                          </h3>

                          {/* Snippet Preview */}
                          <p className="text-xs text-neutral-600 line-clamp-3 leading-relaxed">
                            {preview || 'بدون متن'}
                          </p>
                        </div>

                        {/* Bottom Row Actions */}
                        <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between">
                          <span className="text-[11px] text-neutral-400 font-mono">
                            {note.updatedAt ? `ویرایش ${note.updatedAt}` : note.createdAt}
                          </span>

                          <div className="flex items-center gap-1">
                            {/* Pin button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTogglePinNote(note.id, note.isPinned);
                              }}
                              className={`p-1.5 rounded-lg cursor-pointer ios-spring-tool ${
                                note.isPinned
                                  ? 'text-amber-500 hover:text-amber-600'
                                  : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
                              }`}
                              title={note.isPinned ? 'برداشتن سنجاق' : 'سنجاق کردن'}
                            >
                              <Pin className={`w-3.5 h-3.5 ${note.isPinned ? 'fill-amber-500' : ''}`} />
                            </button>

                            {/* Copy button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyText(stripHtml(note.content), 'متن یادداشت');
                              }}
                              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg cursor-pointer ios-spring-tool"
                              title="کپی متن"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>

                            {/* Edit button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectNoteToEdit(note.id);
                              }}
                              className="p-1.5 text-neutral-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg cursor-pointer ios-spring-tool"
                              title="ویرایش در ویرایشگر پیشرفته"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingNote(note);
                              }}
                              className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer ios-spring-tool"
                              title="حذف"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ========================================================
          POPUP MODALS & DIALOGS
          ======================================================== */}

      {/* Clean Reader Modal (پنجره خلوت، کاملاً شارپ و با وضوح بالا برای خواندن استیکی‌نوت یا یادداشت) */}
      {viewingItem && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150"
          onClick={() => setViewingItem(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-7 shadow-2xl border border-neutral-200/90 space-y-4 animate-ios-modal flex flex-col max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-neutral-100 shrink-0 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                  style={{ backgroundColor: viewingItem.color || '#2563eb' }}
                />
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs sm:text-sm font-bold text-neutral-800 truncate">
                    {viewingItem.sourceLabel}
                  </span>
                  {viewingItem.pageNumber && (
                    <span
                      className="px-2 py-0.5 rounded-md text-[11px] font-black font-mono border border-black/10 shrink-0 shadow-2xs"
                      style={{
                        backgroundColor: viewingItem.color || '#fef08a',
                        color: viewingItem.textColor || '#713f12',
                      }}
                    >
                      صفحه {viewingItem.pageNumber}
                    </span>
                  )}
                </div>
              </div>

              {/* Font Size Adjusters & Close */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-0.5 bg-neutral-100 p-1 rounded-xl border border-neutral-200/80 text-xs font-bold text-neutral-600">
                  <button
                    type="button"
                    onClick={() => setReaderFontSize('normal')}
                    className={`px-2 py-1 rounded-lg transition-colors cursor-pointer text-xs ${
                      readerFontSize === 'normal'
                        ? 'bg-white text-neutral-900 shadow-2xs font-extrabold'
                        : 'hover:text-neutral-900'
                    }`}
                    title="اندازه فونت استاندارد"
                  >
                    A
                  </button>
                  <button
                    type="button"
                    onClick={() => setReaderFontSize('large')}
                    className={`px-2 py-1 rounded-lg transition-colors cursor-pointer text-[13px] ${
                      readerFontSize === 'large'
                        ? 'bg-white text-neutral-900 shadow-2xs font-extrabold'
                        : 'hover:text-neutral-900'
                    }`}
                    title="اندازه فونت بزرگ (پیشنهادی)"
                  >
                    A+
                  </button>
                  <button
                    type="button"
                    onClick={() => setReaderFontSize('huge')}
                    className={`px-2 py-1 rounded-lg transition-colors cursor-pointer text-[14px] ${
                      readerFontSize === 'huge'
                        ? 'bg-white text-neutral-900 shadow-2xs font-extrabold'
                        : 'hover:text-neutral-900'
                    }`}
                    title="اندازه فونت بسیار بزرگ"
                  >
                    A++
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setViewingItem(null)}
                  className="w-9 h-9 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center cursor-pointer shadow-md shadow-rose-500/25 transition-transform shrink-0"
                  title="بستن پنجره"
                  aria-label="بستن پنجره"
                >
                  <X className="w-4.5 h-4.5 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Modal Title & Content */}
            <div className="overflow-y-auto flex-1 space-y-3.5 pl-1 pr-0.5">
              <h2 className="text-base sm:text-lg font-black text-neutral-950 leading-snug tracking-tight">
                {viewingItem.title}
              </h2>

              {viewingItem.type === 'sticky' ? (
                /* Styled Sticky Note Card Box with authentic paper look & high contrast */
                <div
                  className="p-5 sm:p-6 rounded-2xl border border-black/10 select-text transition-all shadow-xs"
                  style={{
                    backgroundColor: viewingItem.color || '#fef08a',
                    color: viewingItem.textColor || '#171717',
                  }}
                >
                  <div
                    className={`whitespace-pre-wrap font-sans ${
                      viewingItem.isBold ? 'font-bold' : 'font-medium'
                    } ${
                      readerFontSize === 'normal'
                        ? 'text-[14px] sm:text-[15px] leading-[2.0]'
                        : readerFontSize === 'large'
                        ? 'text-[16px] sm:text-[17px] leading-[2.2]'
                        : 'text-[18px] sm:text-[20px] leading-[2.4]'
                    }`}
                  >
                    {viewingItem.content || (
                      <span className="opacity-50 italic">بدون متن</span>
                    )}
                  </div>

                  {((viewingItem.images && viewingItem.images.length > 0) || viewingItem.imageUrl) && (
                    <div className="mt-4 pt-3.5 border-t border-black/10">
                      <div className="text-xs font-bold mb-2 opacity-80 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>تصاویر ضمیمه ({viewingItem.images?.length || 1}):</span>
                        </span>
                      </div>
                      <div className={`grid gap-2.5 ${
                        (viewingItem.images?.length || 1) === 1
                          ? 'grid-cols-1'
                          : (viewingItem.images?.length || 1) === 2
                          ? 'grid-cols-2'
                          : 'grid-cols-2 sm:grid-cols-3'
                      }`}>
                        {(viewingItem.images && viewingItem.images.length > 0 ? viewingItem.images : [viewingItem.imageUrl!]).map((img, idx) => (
                          <div key={idx} className="rounded-xl overflow-hidden border border-black/10 bg-white/70 shadow-2xs aspect-4/3 flex items-center justify-center">
                            <img
                              src={img}
                              alt={`تصویر ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Regular Note Clean Reader */
                <div
                  className={`text-neutral-950 leading-relaxed whitespace-pre-wrap font-sans select-text ${
                    readerFontSize === 'normal'
                      ? 'text-[14px] sm:text-[15px] leading-[2.0]'
                      : readerFontSize === 'large'
                      ? 'text-[16px] sm:text-[17px] leading-[2.2]'
                      : 'text-[18px] sm:text-[20px] leading-[2.4]'
                  }`}
                >
                  {viewingItem.content || (
                    <span className="text-neutral-400 italic">بدون متن</span>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="pt-3.5 border-t border-neutral-100 flex items-center justify-between shrink-0 gap-2">
              <span className="text-[11px] text-neutral-400 font-mono">
                {viewingItem.date || ''}
              </span>

              <div className="flex items-center gap-2">
                {/* Direct Jump to PDF page button if reading a sticky note */}
                {viewingItem.type === 'sticky' && viewingItem.originalEntry && onOpenFileAtPage && (
                  <button
                    type="button"
                    onClick={() => {
                      const entry = viewingItem.originalEntry!;
                      setViewingItem(null);
                      onOpenFileAtPage(entry.file, entry.note.pageNumber);
                    }}
                    className="px-3.5 py-1.5 text-xs font-bold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-xl cursor-pointer flex items-center gap-1.5"
                    title="رفتن به این صفحه در کتاب"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-neutral-600" />
                    <span>مشاهده در کتاب</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleCopyText(viewingItem.content, 'متن')}
                  className="px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>کپی</span>
                </button>

                {viewingItem.type === 'sticky' && viewingItem.originalEntry && (
                  <button
                    type="button"
                    onClick={() => {
                      const entry = viewingItem.originalEntry!;
                      setViewingItem(null);
                      setEditingStickyNote(entry);
                      setEditTitle(entry.note.title || '');
                      setEditContent(entry.note.content || '');
                      setEditColor(entry.note.color || '#fef08a');
                      setEditTextColor(entry.note.textColor || '#713f12');
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>ویرایش</span>
                  </button>
                )}

                {viewingItem.type === 'note' && viewingItem.originalNote && (
                  <button
                    type="button"
                    onClick={() => {
                      const noteId = viewingItem.originalNote!.id;
                      setViewingItem(null);
                      onSelectNoteToEdit(noteId);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer flex items-center gap-1.5"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>ویرایش</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setViewingItem(null)}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl cursor-pointer shadow-xs"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Folder Creation / Edit Modal (هماهنگ با سبک دیزاین سراسری) */}
      {isFolderModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setIsFolderModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-ios-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-xs">
                  <FolderPlus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-neutral-900">
                  {editingFolder ? 'ویرایش پوشه' : 'ایجاد پوشه جدید'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFolderModalOpen(false)}
                className="w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center cursor-pointer ios-spring-tool"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFolder} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1.5">
                  نام دسته‌بندی:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="مثلاً: نکات کنکور، فیزیک پایه، خلاصه‌ها..."
                  value={folderNameInput}
                  onChange={(e) => setFolderNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1.5">
                  دسته‌بندی والد (اختیاری - برای زیرمجموعه‌سازی):
                </label>
                <select
                  value={parentFolderIdInput || ''}
                  onChange={(e) => setParentFolderIdInput(e.target.value ? e.target.value : null)}
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs sm:text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:bg-white cursor-pointer"
                >
                  <option value="">بدون والد (دسته‌بندی اصلی)</option>
                  {folders
                    .filter((f) => !f.parentId && (!editingFolder || f.id !== editingFolder.id))
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-neutral-400 mt-1">
                  با انتخاب والد، این دسته‌بندی در زیرمجموعه قرار می‌گیرد تا نوار اصلی همیشه خلوت و مرتب بماند.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-2">
                  رنگ برچسب:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {FOLDER_COLOR_PALETTE.map((pal) => {
                    const isSelected = folderColorInput === pal.value;
                    return (
                      <button
                        key={pal.value}
                        type="button"
                        onClick={() => setFolderColorInput(pal.value)}
                        className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ios-spring-tool transition-all ${
                          pal.bg
                        } ${pal.text} ${
                          isSelected
                            ? 'ring-2 ring-neutral-900 border-neutral-400 shadow-xs'
                            : 'border-transparent hover:opacity-85'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${pal.dot}`} />
                        <span className="text-[11px] truncate">{pal.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFolderModalOpen(false)}
                  className="flex-1 py-2.5 text-xs font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer ios-spring-btn"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl cursor-pointer shadow-xs ios-spring-btn"
                >
                  {editingFolder ? 'ذخیره تغییرات' : 'ایجاد پوشه'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Folder Confirmation Dialog */}
      {folderToDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setFolderToDelete(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-ios-modal text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <Folder className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900">
                حذف پوشه «{folderToDelete.name}»
              </h3>
              <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
                با حذف این پوشه، یادداشت‌های داخل آن حذف نخواهند شد و به وضعیت «عمومی و بدون پوشه» منتقل می‌شوند.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setFolderToDelete(null)}
                className="flex-1 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer ios-spring-btn"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteFolder}
                className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md cursor-pointer ios-spring-btn"
              >
                حذف پوشه
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Note Quick Edit Modal */}
      {editingStickyNote && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setEditingStickyNote(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-ios-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="text-sm font-bold text-neutral-900">
                ویرایش سریع استیکی‌نوت
              </h3>
              <button
                type="button"
                onClick={() => setEditingStickyNote(null)}
                className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg cursor-pointer ios-spring-tool"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditStickyNote} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1">
                  عنوان:
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData('text/plain');
                    if (pasted) {
                      e.preventDefault();
                      setEditTitle(cleanPastedMarkdown(pasted).replace(/\n/g, ' ').trim());
                    }
                  }}
                  placeholder="عنوان یا کلیدواژه یادداشت..."
                  className="w-full px-3.5 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1">
                  متن برگه چسبان:
                </label>
                <textarea
                  rows={4}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData('text/plain');
                    if (pasted) {
                      e.preventDefault();
                      setEditContent(cleanPastedMarkdown(pasted));
                    }
                  }}
                  placeholder="متن یادداشت..."
                  className="w-full px-3.5 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900 leading-relaxed font-sans placeholder:text-neutral-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1.5">
                  رنگ برگه:
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.bg}
                      type="button"
                      onClick={() => {
                        setEditColor(c.bg);
                        setEditTextColor(c.text);
                      }}
                      style={{ backgroundColor: c.bg }}
                      className={`w-7 h-7 rounded-full border transition-transform cursor-pointer ios-spring-tool ${
                        editColor === c.bg
                          ? 'ring-2 ring-neutral-900 scale-110 shadow-xs'
                          : 'border-black/10 hover:scale-105'
                      }`}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStickyNote(null)}
                  className="flex-1 py-2 text-xs font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer ios-spring-btn"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl cursor-pointer shadow-xs ios-spring-btn"
                >
                  ذخیره تغییرات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Sticky Note Dialog */}
      {deletingStickyNote && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setDeletingStickyNote(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-ios-modal text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900">
                حذف استیکی‌نوت
              </h3>
              <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
                آیا از حذف این یادداشت چسبان اطمینان دارید؟
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setDeletingStickyNote(null)}
                className="flex-1 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer ios-spring-btn"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteStickyNote}
                className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md cursor-pointer ios-spring-btn"
              >
                بله، حذف شود
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Standalone Note Dialog */}
      {deletingNote && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setDeletingNote(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-ios-modal text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900">
                حذف یادداشت
              </h3>
              <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
                آیا از حذف یادداشت «{deletingNote.title || 'بدون عنوان'}» اطمینان دارید؟ این عملیات قابل بازگشت نیست.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setDeletingNote(null)}
                className="flex-1 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer ios-spring-btn"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteNote}
                className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md cursor-pointer ios-spring-btn"
              >
                بله، حذف شود
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Copied Toast Notification with Jelly Physics */}
      {copiedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-ios-jelly">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{copiedToast}</span>
        </div>
      )}
    </div>
  );
};
