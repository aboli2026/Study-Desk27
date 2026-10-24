import { PDFDocument, degrees, PDFName, PDFHexString, PDFArray } from 'pdf-lib';
import type { DrawingStroke, StickyNoteItem, StudyFile } from '../types';

export interface BakePdfOptions {
  pdfData: ArrayBuffer;
  pageStrokes: Record<number, DrawingStroke[]>;
  stickyNotes: StickyNoteItem[];
}

export interface SaveDirectlyResult {
  success: boolean;
  method: 'disk' | 'download';
  error?: string;
}

/**
 * Parses hex or rgba string into normalized RGB components [0..1]
 */
function parseColorToRgb01(color?: string): [number, number, number] {
  if (!color) return [0.99, 0.94, 0.54]; // default yellow #fef08a
  const s = color.trim().toLowerCase();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
    }
  }
  const rgbMatch = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return [
      parseInt(rgbMatch[1], 10) / 255,
      parseInt(rgbMatch[2], 10) / 255,
      parseInt(rgbMatch[3], 10) / 255,
    ];
  }
  return [0.99, 0.94, 0.54];
}

/**
 * Bakes all highlighters, pens, ruler lines, and sticky notes into the PDF pages.
 * - Sticky notes are rendered as compact, elegant 22px icon pins on the page canvas
 *   so they NEVER cover or obscure the document text.
 * - In addition, native interactive PDF Text Annotations (/Subtype /Text, Open: false)
 *   are embedded into the PDF so that external PDF readers (Adobe Acrobat, Apple Preview,
 *   Microsoft Edge, Foxit, Chrome) allow clicking or hovering to view and edit the full note text.
 */
export async function bakeAnnotatedPdf({
  pdfData,
  pageStrokes,
  stickyNotes,
}: BakePdfOptions): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfData);
  const pages = pdfDoc.getPages();

  // High DPI rasterization for crisp vector-like rendering in external PDF readers
  const RASTER_SCALE = 2.5;

  for (let i = 0; i < pages.length; i++) {
    const pageNum = i + 1;
    const strokes = pageStrokes[pageNum] || [];
    const notes = stickyNotes.filter((n) => n.pageNumber === pageNum);

    // Skip pages with zero annotations to preserve 100% original page purity and file size
    if (strokes.length === 0 && notes.length === 0) {
      continue;
    }

    const pdfPage = pages[i];
    const { width: pageWidth, height: pageHeight } = pdfPage.getSize();
    const rotation = ((pdfPage.getRotation().angle || 0) % 360 + 360) % 360;

    // Visual dimensions depending on rotation
    const isSideways = rotation === 90 || rotation === 270;
    const visualWidth = isSideways ? pageHeight : pageWidth;
    const visualHeight = isSideways ? pageWidth : pageHeight;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(visualWidth * RASTER_SCALE);
    canvas.height = Math.round(visualHeight * RASTER_SCALE);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.scale(RASTER_SCALE, RASTER_SCALE);

    // 1. Highlighters (semi-transparent fluorescent color over text)
    const highlighters = strokes.filter((s) => s.tool === 'highlighter');
    for (const stroke of highlighters) {
      if (!stroke.points || stroke.points.length === 0) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = stroke.opacity || 0.48;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'bevel';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let p = 1; p < stroke.points.length; p++) {
        ctx.lineTo(stroke.points[p].x, stroke.points[p].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. Pens & Rulers (crisp, solid ink)
    const otherStrokes = strokes.filter((s) => s.tool !== 'highlighter');
    for (const stroke of otherStrokes) {
      if (!stroke.points || stroke.points.length === 0) continue;
      ctx.save();
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let p = 1; p < stroke.points.length; p++) {
        ctx.lineTo(stroke.points[p].x, stroke.points[p].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 3. Sticky Notes - Sleek, compact 22px icon pins (Never covering or blocking reading text!)
    for (const note of notes) {
      ctx.save();
      const pinRadius = 11;
      // Clamp pin position within page bounds
      const cx = Math.max(pinRadius + 2, Math.min(visualWidth - pinRadius - 2, note.x));
      const cy = Math.max(pinRadius + 2, Math.min(visualHeight - pinRadius - 2, note.y));

      // Pin Drop Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.beginPath();
      ctx.arc(cx + 1, cy + 1.5, pinRadius, 0, Math.PI * 2);
      ctx.fill();

      // Pin Body Circle
      ctx.fillStyle = note.color || '#fef08a';
      ctx.beginPath();
      ctx.arc(cx, cy, pinRadius, 0, Math.PI * 2);
      ctx.fill();

      // Pin Border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Mini Folded Sheet Note Icon inside the pin
      ctx.save();
      ctx.translate(cx - 5, cy - 6);
      ctx.fillStyle = note.textColor || '#171717';
      ctx.strokeStyle = note.textColor || '#171717';
      ctx.lineWidth = 0.8;
      // Sheet with folded top-right corner
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(7, 0);
      ctx.lineTo(10, 3);
      ctx.lineTo(10, 12);
      ctx.lineTo(0, 12);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fill();
      ctx.stroke();
      // Fold flap
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(7, 3);
      ctx.lineTo(10, 3);
      ctx.stroke();
      // Line indicators
      ctx.beginPath();
      ctx.moveTo(2.5, 5);
      ctx.lineTo(7.5, 5);
      ctx.moveTo(2.5, 7.5);
      ctx.lineTo(7.5, 7.5);
      ctx.moveTo(2.5, 10);
      ctx.lineTo(5.5, 10);
      ctx.stroke();
      ctx.restore();

      // Red notification indicator dot at top-right
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx + pinRadius - 2.5, cy - pinRadius + 2.5, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.75;
      ctx.stroke();

      ctx.restore();
    }

    // Convert offscreen canvas to PNG binary
    const pngDataUrl = canvas.toDataURL('image/png');
    const base64Data = pngDataUrl.split(',')[1];
    const binaryStr = atob(base64Data);
    const pngBytes = new Uint8Array(binaryStr.length);
    for (let b = 0; b < binaryStr.length; b++) {
      pngBytes[b] = binaryStr.charCodeAt(b);
    }

    // Embed PNG overlay onto the PDF page with proper rotation
    const pngImage = await pdfDoc.embedPng(pngBytes);
    if (rotation === 0) {
      pdfPage.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      });
    } else if (rotation === 90) {
      pdfPage.drawImage(pngImage, {
        x: 0,
        y: pageHeight,
        width: pageHeight,
        height: pageWidth,
        rotate: degrees(-90),
      });
    } else if (rotation === 180) {
      pdfPage.drawImage(pngImage, {
        x: pageWidth,
        y: pageHeight,
        width: pageWidth,
        height: pageHeight,
        rotate: degrees(180),
      });
    } else if (rotation === 270) {
      pdfPage.drawImage(pngImage, {
        x: pageWidth,
        y: 0,
        width: pageHeight,
        height: pageWidth,
        rotate: degrees(90),
      });
    }

    // 4. Native interactive PDF Text Annotations (/Subtype /Text)
    // Allows Adobe Acrobat, Apple Preview, Microsoft Edge, Foxit, and Chrome
    // to open the full note popup on click/hover without blocking page text when closed!
    if (notes.length > 0) {
      try {
        const annotsRef = pdfPage.node.get(PDFName.of('Annots'));
        const rawAnnots = annotsRef ? pdfDoc.context.lookup(annotsRef) : null;
        let annotsArray: PDFArray;
        if (rawAnnots instanceof PDFArray) {
          annotsArray = rawAnnots;
        } else {
          annotsArray = pdfDoc.context.obj([]) as PDFArray;
          pdfPage.node.set(PDFName.of('Annots'), annotsArray);
        }

        for (const note of notes) {
          // Calculate coordinates in PDF point system
          let pdfX = note.x;
          let pdfY = pageHeight - note.y;

          if (rotation === 90) {
            pdfX = pageWidth - note.y;
            pdfY = note.x;
          } else if (rotation === 180) {
            pdfX = pageWidth - note.x;
            pdfY = note.y;
          } else if (rotation === 270) {
            pdfX = note.y;
            pdfY = pageHeight - note.x;
          }

          const rectW = 22;
          const rectH = 22;
          const noteTitle = note.title ? note.title.trim() : 'یادداشت';
          const noteContent = note.content ? note.content.trim() : '';
          const fullContent = noteTitle ? `${noteTitle}\n\n${noteContent}` : noteContent;

          const rgb = parseColorToRgb01(note.color);

          const annotDict = pdfDoc.context.obj({
            Type: 'Annot',
            Subtype: 'Text',
            Rect: [
              Math.round(pdfX - rectW / 2),
              Math.round(pdfY - rectH / 2),
              Math.round(pdfX + rectW / 2),
              Math.round(pdfY + rectH / 2),
            ],
            Contents: PDFHexString.fromText(fullContent),
            T: PDFHexString.fromText(noteTitle),
            C: rgb,
            Open: false, // Collapsed by default - NEVER covers or blocks text!
            Name: 'Comment',
          });

          const annotObjRef = pdfDoc.context.register(annotDict);
          annotsArray.push(annotObjRef);
        }
      } catch (annotErr) {
        console.warn('Failed to embed native PDF annotations, page overlay is preserved:', annotErr);
      }
    }
  }

  // Save the modified PDF
  return await pdfDoc.save();
}

/**
 * Saves the baked PDF directly into the file:
 * 1. If FileSystemFileHandle is available (Chrome/Edge File System Access API),
 *    writes directly into the file on disk (replacing it without creating a new file).
 * 2. Otherwise downloads/saves with the EXACT SAME original file name (no duplicate suffix),
 *    so it replaces the original file directly.
 */
export async function saveDirectlyToFile({
  file,
  bakedPdfBytes,
  fileHandle,
}: {
  file: StudyFile;
  bakedPdfBytes: Uint8Array;
  fileHandle?: any;
}): Promise<SaveDirectlyResult> {
  const handle = fileHandle || file.fileHandle;

  // Method 1: Direct File System Access API write to disk file
  if (handle && typeof handle.createWritable === 'function') {
    try {
      if (typeof handle.queryPermission === 'function') {
        let perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted' && typeof handle.requestPermission === 'function') {
          perm = await handle.requestPermission({ mode: 'readwrite' });
        }
        if (perm !== 'granted') {
          throw new Error('Write permission was not granted by user.');
        }
      }

      const writable = await handle.createWritable();
      await writable.write(bakedPdfBytes);
      await writable.close();
      return { success: true, method: 'disk' };
    } catch (err: any) {
      console.warn('Direct file handle write failed, falling back to download:', err);
    }
  }

  // Method 2: Save directly with the EXACT SAME original file name
  try {
    const blob = new Blob([bakedPdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Exactly the same name as the original file: No "_با_ادیت‌ها" suffix!
    a.download = file.name || 'document.pdf';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1500);

    return { success: true, method: 'download' };
  } catch (err: any) {
    return { success: false, method: 'download', error: err?.message };
  }
}

/**
 * Backwards compatible export function - produces the baked PDF
 * with the exact original filename (not a separate "_با_ادیت‌ها" file).
 */
export async function exportAnnotatedPdf({
  pdfData,
  fileName,
  pageStrokes,
  stickyNotes,
}: {
  pdfData: ArrayBuffer;
  fileName: string;
  pageStrokes: Record<number, DrawingStroke[]>;
  stickyNotes: StickyNoteItem[];
}): Promise<Uint8Array> {
  const bakedBytes = await bakeAnnotatedPdf({
    pdfData,
    pageStrokes,
    stickyNotes,
  });

  const safeName = (fileName || 'document').toLowerCase().endsWith('.pdf')
    ? (fileName || 'document.pdf')
    : `${fileName || 'document'}.pdf`;

  const blob = new Blob([bakedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);

  return bakedBytes;
}
