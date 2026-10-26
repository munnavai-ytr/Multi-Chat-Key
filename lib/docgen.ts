/**
 * Document Generation Service for Chatly
 * Builds downloadable documents: Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF (.pdf), Markdown (.md), Text (.txt), CSV (.csv)
 * Lazily imports heavy libraries to keep bundle footprint low.
 */

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'table'; header?: string[]; rows: string[][] }
  | { type: 'pagebreak' };

export interface SheetData {
  name?: string;
  rows?: (string | number | boolean | null)[][];
  columns?: any[];
}

export interface SlideData {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  notes?: string;
}

export interface BuildDocArgs {
  format: 'docx' | 'pdf' | 'xlsx' | 'pptx' | 'md' | 'txt' | 'csv' | string;
  filename: string;
  title?: string;
  blocks?: Block[];
  sheets?: SheetData[];
  slides?: SlideData[];
  csv?: string;
  raw?: string;
}

export interface BuildDocResult {
  blob: Blob;
  name: string;
  mime: string;
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilename(filename: string, format: string): string {
  let base = (filename || 'document').trim();
  // Strip trailing extension if supplied
  base = base.replace(new RegExp(`\\.${format}$`, 'i'), '');
  base = base.replace(/\.[a-zA-Z0-9]+$/, '');
  // Sanitize to [A-Za-z0-9._-\u0980-\u09FF ]
  base = base.replace(/[^A-Za-z0-9._\-\u0980-\u09FF ]/g, '_').trim();
  if (!base) base = 'document';
  return `${base}.${format.toLowerCase()}`;
}

function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function buildDocument(args: BuildDocArgs): Promise<BuildDocResult> {
  const format = (args.format || 'txt').toLowerCase().trim();
  const validFilename = sanitizeFilename(args.filename || 'document', format);

  // Defensive validation and limits
  const blocks: Block[] = Array.isArray(args.blocks) ? args.blocks.slice(0, 200) : [];
  const sheets: SheetData[] = Array.isArray(args.sheets)
    ? args.sheets.slice(0, 20).map((s) => ({
        ...s,
        rows: Array.isArray(s.rows) ? s.rows.slice(0, 5000) : [],
      }))
    : [];
  const slides: SlideData[] = Array.isArray(args.slides) ? args.slides.slice(0, 40) : [];

  // Extract all text to detect Bengali characters
  const textParts: string[] = [
    args.title || '',
    args.csv || '',
    args.raw || '',
    ...blocks.map((b) => {
      if (b.type === 'heading' || b.type === 'paragraph') return b.text || '';
      if (b.type === 'bullets' || b.type === 'numbered') return (b.items || []).join(' ');
      if (b.type === 'table') {
        const h = (b.header || []).join(' ');
        const r = (b.rows || []).map((row) => (Array.isArray(row) ? row.join(' ') : '')).join(' ');
        return `${h} ${r}`;
      }
      return '';
    }),
    ...sheets.flatMap((s) => (s.rows || []).flatMap((r) => (Array.isArray(r) ? r.map(String) : []))),
    ...slides.flatMap((sl) => [sl.title || '', sl.subtitle || '', ...(sl.bullets || []), sl.notes || '']),
  ];
  const allText = textParts.join(' ');
  const hasBengali = /[\u0980-\u09FF]/.test(allText);

  switch (format) {
    case 'docx': {
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        HeadingLevel,
        Table,
        TableRow,
        TableCell,
        WidthType,
        PageBreak,
      } = await import('docx');

      const font = hasBengali ? 'Nirmala UI' : 'Calibri';
      const children: any[] = [];

      if (args.title) {
        children.push(
          new Paragraph({
            text: args.title,
            heading: HeadingLevel.TITLE,
            spacing: { after: 300 },
            style: 'Title',
          })
        );
      }

      // If blocks are empty but raw text was supplied
      if (blocks.length === 0 && (args.raw || args.csv)) {
        const text = args.raw || args.csv || '';
        text.split('\n\n').forEach((para) => {
          if (para.trim()) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: para.trim(), font })],
                spacing: { after: 150 },
              })
            );
          }
        });
      }

      for (const b of blocks) {
        if (!b) continue;
        if (b.type === 'heading') {
          const hLevel =
            b.level === 1
              ? HeadingLevel.HEADING_1
              : b.level === 2
              ? HeadingLevel.HEADING_2
              : HeadingLevel.HEADING_3;
          children.push(
            new Paragraph({
              heading: hLevel,
              children: [new TextRun({ text: b.text || '', font, bold: true })],
              spacing: { before: 240, after: 120 },
            })
          );
        } else if (b.type === 'paragraph') {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: b.text || '', font })],
              spacing: { after: 140 },
            })
          );
        } else if (b.type === 'bullets' && Array.isArray(b.items)) {
          b.items.forEach((item) => {
            children.push(
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: String(item), font })],
                spacing: { after: 80 },
              })
            );
          });
        } else if (b.type === 'numbered' && Array.isArray(b.items)) {
          b.items.forEach((item, idx) => {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({ text: `${idx + 1}. `, font, bold: true }),
                  new TextRun({ text: String(item), font }),
                ],
                spacing: { after: 80 },
              })
            );
          });
        } else if (b.type === 'pagebreak') {
          children.push(new Paragraph({ children: [new PageBreak()] }));
        } else if (b.type === 'table') {
          const rows: any[] = [];
          if (b.header && Array.isArray(b.header) && b.header.length > 0) {
            rows.push(
              new TableRow({
                children: b.header.map(
                  (h) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: String(h), font, bold: true })],
                        }),
                      ],
                    })
                ),
              })
            );
          }
          if (b.rows && Array.isArray(b.rows) && b.rows.length > 0) {
            b.rows.forEach((r) => {
              if (Array.isArray(r)) {
                rows.push(
                  new TableRow({
                    children: r.map(
                      (c) =>
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [new TextRun({ text: String(c ?? ''), font })],
                            }),
                          ],
                        })
                    ),
                  })
                );
              }
            });
          }
          if (rows.length > 0) {
            children.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows,
              })
            );
            children.push(new Paragraph({ text: '', spacing: { after: 150 } }));
          }
        }
      }

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: {
                font,
              },
            },
          },
        },
        sections: [
          {
            properties: {},
            children: children.length > 0 ? children : [new Paragraph({ text: ' ' })],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      return {
        blob,
        name: validFilename,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }

    case 'xlsx': {
      const ExcelJS = await import('exceljs');
      const Workbook =
        (ExcelJS as any).Workbook ||
        (ExcelJS as any).default?.Workbook ||
        (ExcelJS as any).default;
      const wb = new Workbook();

      if (sheets.length > 0) {
        sheets.forEach((s, i) => {
          const sheetName = (s.name || `Sheet${i + 1}`).slice(0, 31);
          const ws = wb.addWorksheet(sheetName);

          if (s.rows && Array.isArray(s.rows)) {
            s.rows.forEach((row) => {
              if (Array.isArray(row)) {
                ws.addRow(
                  row.map((c) =>
                    typeof c === 'string' && c.startsWith('=')
                      ? { formula: c.slice(1) }
                      : c
                  )
                );
              }
            });
          }

          // Style first row bold with light fill
          const firstRow = ws.getRow(1);
          firstRow.font = { bold: true };
          firstRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF1F5F9' },
          };

          // Freeze the first row
          ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

          // Auto column widths capped at 60
          ws.columns.forEach((column: any) => {
            let maxLen = 10;
            if (column.values) {
              column.values.forEach((val: any) => {
                if (val !== null && val !== undefined) {
                  const str =
                    typeof val === 'object' && val.formula
                      ? String(val.formula)
                      : String(val);
                  maxLen = Math.max(maxLen, str.length);
                }
              });
            }
            column.width = Math.min(Math.max(maxLen + 2, 12), 60);
          });
        });
      } else if (blocks.some((b) => b.type === 'table')) {
        // Fallback from table blocks
        const tableBlocks = blocks.filter((b) => b.type === 'table');
        tableBlocks.forEach((tb, i) => {
          const ws = wb.addWorksheet(`Table${i + 1}`);
          if (tb.header && Array.isArray(tb.header)) {
            ws.addRow(tb.header);
            const firstRow = ws.getRow(1);
            firstRow.font = { bold: true };
            firstRow.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF1F5F9' },
            };
            ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
          }
          if (tb.rows && Array.isArray(tb.rows)) {
            tb.rows.forEach((r) => {
              if (Array.isArray(r)) {
                ws.addRow(
                  r.map((c) =>
                    typeof c === 'string' && c.startsWith('=')
                      ? { formula: c.slice(1) }
                      : c
                  )
                );
              }
            });
          }
          ws.columns.forEach((column: any) => {
            column.width = 16;
          });
        });
      } else if (args.csv) {
        const ws = wb.addWorksheet('Data');
        const lines = args.csv.trim().split(/\r?\n/);
        lines.forEach((line) => {
          ws.addRow(line.split(',').map((c) => c.trim().replace(/^"|"$/g, '')));
        });
        const firstRow = ws.getRow(1);
        firstRow.font = { bold: true };
        ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
      } else {
        const ws = wb.addWorksheet('Sheet1');
        ws.addRow(['Title', args.title || 'Data']);
        const firstRow = ws.getRow(1);
        firstRow.font = { bold: true };
        ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
      }

      const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      return {
        blob,
        name: validFilename,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    case 'pptx': {
      const pptxModule = await import('pptxgenjs');
      const PptxGenJS = (pptxModule as any).default || pptxModule;
      const pres = new PptxGenJS();
      pres.layout = 'LAYOUT_WIDE';

      if (slides.length > 0) {
        slides.forEach((sl, idx) => {
          const s = pres.addSlide();

          if (idx === 0) {
            // First slide: dark background (color 1E1B4B) with title 40pt white and subtitle 20pt
            s.background = { color: '1E1B4B' };
            const titleText = sl.title || args.title || 'Presentation';
            s.addText(titleText, {
              x: 1.0,
              y: 2.0,
              w: '85%',
              fontSize: 40,
              bold: true,
              color: 'FFFFFF',
            });
            if (sl.subtitle) {
              s.addText(sl.subtitle, {
                x: 1.0,
                y: 3.6,
                w: '85%',
                fontSize: 20,
                color: 'E0E7FF',
              });
            }
          } else {
            // Subsequent slides: title 30pt bold dark, bullets 20pt
            if (sl.title) {
              s.addText(sl.title, {
                x: 0.8,
                y: 0.6,
                w: '88%',
                fontSize: 30,
                bold: true,
                color: '1E1B4B',
              });
            }
            if (sl.subtitle) {
              s.addText(sl.subtitle, {
                x: 0.8,
                y: 1.4,
                w: '88%',
                fontSize: 16,
                color: '64748B',
              });
            }
            if (sl.bullets && Array.isArray(sl.bullets) && sl.bullets.length > 0) {
              const bulletItems = sl.bullets.map((b) => ({
                text: String(b),
                options: { bullet: true, fontSize: 20, color: '334155', breakLine: true },
              }));
              s.addText(bulletItems, {
                x: 0.8,
                y: sl.subtitle ? 2.1 : 1.6,
                w: '88%',
                h: 4.8,
              });
            }
          }

          if (sl.notes) {
            s.addNotes(sl.notes);
          }
        });
      } else {
        // Fallback title slide
        const s1 = pres.addSlide();
        s1.background = { color: '1E1B4B' };
        s1.addText(args.title || sanitizeFilename(args.filename, 'pptx'), {
          x: 1.0,
          y: 2.5,
          w: '85%',
          fontSize: 40,
          bold: true,
          color: 'FFFFFF',
        });
      }

      const output = await pres.write({ outputType: 'blob' });
      const blob =
        output instanceof Blob
          ? output
          : new Blob([output], {
              type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            });
      return {
        blob,
        name: validFilename,
        mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };
    }

    case 'pdf': {
      // Browser-based rendering of HTML to canvas pages for full font shaping of Bengali conjuncts
      // Note in the code that PDF text is image-based (not selectable) on purpose.
      const html2canvasModule = await import('html2canvas');
      const html2canvas = (html2canvasModule as any).default || html2canvasModule;
      const { jsPDF } = await import('jspdf');

      let offscreenDiv: HTMLDivElement | null = null;
      try {
        offscreenDiv = document.createElement('div');
        offscreenDiv.style.position = 'fixed';
        offscreenDiv.style.left = '-10000px';
        offscreenDiv.style.top = '0';
        offscreenDiv.style.width = '794px';
        offscreenDiv.style.padding = '48px';
        offscreenDiv.style.background = '#fff';
        offscreenDiv.style.color = '#111';
        offscreenDiv.style.font =
          "15px/1.6 'Noto Sans Bengali', 'Noto Sans', system-ui, -apple-system, sans-serif";
        offscreenDiv.style.boxSizing = 'border-box';

        let innerHtml = '';
        if (args.title) {
          innerHtml += `<h1 style="font-size: 26px; font-weight: 700; margin-bottom: 24px; color: #1e1b4b; line-height: 1.25;">${escapeHtml(
            args.title
          )}</h1>`;
        }

        if (blocks.length === 0 && (args.raw || args.csv)) {
          const raw = args.raw || args.csv || '';
          raw.split('\n\n').forEach((p) => {
            if (p.trim()) {
              innerHtml += `<p style="margin-bottom: 14px; font-size: 15px; line-height: 1.6;">${escapeHtml(
                p.trim()
              )}</p>`;
            }
          });
        }

        for (const b of blocks) {
          if (!b) continue;
          if (b.type === 'heading') {
            const hSize = b.level === 1 ? '22px' : b.level === 2 ? '18px' : '16px';
            const hMargin = b.level === 1 ? '24px 0 12px 0' : '18px 0 8px 0';
            innerHtml += `<div style="font-size: ${hSize}; font-weight: 700; color: #1e1b4b; margin: ${hMargin}; line-height: 1.3;">${escapeHtml(
              b.text || ''
            )}</div>`;
          } else if (b.type === 'paragraph') {
            innerHtml += `<p style="margin-bottom: 14px; font-size: 15px; line-height: 1.6; word-break: break-word;">${escapeHtml(
              b.text || ''
            )}</p>`;
          } else if (b.type === 'bullets' && Array.isArray(b.items)) {
            innerHtml += `<ul style="margin: 8px 0 16px 24px; padding: 0; list-style-type: disc;">`;
            b.items.forEach((item) => {
              innerHtml += `<li style="margin-bottom: 6px; font-size: 15px; line-height: 1.5;">${escapeHtml(
                String(item)
              )}</li>`;
            });
            innerHtml += `</ul>`;
          } else if (b.type === 'numbered' && Array.isArray(b.items)) {
            innerHtml += `<ol style="margin: 8px 0 16px 24px; padding: 0; list-style-type: decimal;">`;
            b.items.forEach((item) => {
              innerHtml += `<li style="margin-bottom: 6px; font-size: 15px; line-height: 1.5;">${escapeHtml(
                String(item)
              )}</li>`;
            });
            innerHtml += `</ol>`;
          } else if (b.type === 'pagebreak') {
            innerHtml += `<div style="margin: 32px 0; border-top: 1px dashed #cbd5e1;"></div>`;
          } else if (b.type === 'table') {
            innerHtml += `<table style="width: 100%; border-collapse: collapse; margin: 16px 0 20px 0; font-size: 14px;">`;
            if (b.header && Array.isArray(b.header) && b.header.length > 0) {
              innerHtml += `<thead><tr style="background: #f1f5f9;">`;
              b.header.forEach((h) => {
                innerHtml += `<th style="border: 1px solid #cbd5e1; padding: 10px 12px; text-align: left; font-weight: 600; color: #1e293b;">${escapeHtml(
                  String(h)
                )}</th>`;
              });
              innerHtml += `</tr></thead>`;
            }
            if (b.rows && Array.isArray(b.rows) && b.rows.length > 0) {
              innerHtml += `<tbody>`;
              b.rows.forEach((r, rIdx) => {
                if (Array.isArray(r)) {
                  const bg = rIdx % 2 === 1 ? '#f8fafc' : '#ffffff';
                  innerHtml += `<tr style="background: ${bg};">`;
                  r.forEach((c) => {
                    innerHtml += `<td style="border: 1px solid #cbd5e1; padding: 8px 12px; color: #334155;">${escapeHtml(
                      String(c ?? '')
                    )}</td>`;
                  });
                  innerHtml += `</tr>`;
                }
              });
              innerHtml += `</tbody>`;
            }
            innerHtml += `</table>`;
          }
        }

        offscreenDiv.innerHTML = innerHtml;
        document.body.appendChild(offscreenDiv);

        if ((document as any).fonts?.ready) {
          await (document as any).fonts.ready;
        }

        // Render HTML to canvas
        const canvas = await html2canvas(offscreenDiv, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true,
        });

        const pdf = new jsPDF({
          unit: 'pt',
          format: 'a4',
          orientation: 'portrait',
        });

        // A4 page dimensions in points (pt)
        const pageWidth = 595.28;
        const pageHeight = 841.89;
        const ratio = pageWidth / canvas.width;
        const sliceCanvasHeight = Math.floor(pageHeight / ratio);

        let srcY = 0;
        let pageIndex = 0;

        while (srcY < canvas.height) {
          const currentSliceHeight = Math.min(sliceCanvasHeight, canvas.height - srcY);

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = currentSliceHeight;
          const ctx = tempCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(
              canvas,
              0,
              srcY,
              canvas.width,
              currentSliceHeight,
              0,
              0,
              canvas.width,
              currentSliceHeight
            );
          }

          if (pageIndex > 0) {
            pdf.addPage();
          }

          pdf.addImage(
            tempCanvas.toDataURL('image/jpeg', 0.92),
            'JPEG',
            0,
            0,
            pageWidth,
            currentSliceHeight * ratio
          );

          srcY += currentSliceHeight;
          pageIndex++;
        }

        const blob = pdf.output('blob');
        return {
          blob,
          name: validFilename,
          mime: 'application/pdf',
        };
      } finally {
        if (offscreenDiv && offscreenDiv.parentNode) {
          offscreenDiv.parentNode.removeChild(offscreenDiv);
        }
      }
    }

    case 'md': {
      let content = '';
      if (args.title) {
        content += `# ${args.title}\n\n`;
      }
      if (blocks.length > 0) {
        for (const b of blocks) {
          if (!b) continue;
          if (b.type === 'heading') {
            const prefix = '#'.repeat(b.level || 1);
            content += `${prefix} ${b.text || ''}\n\n`;
          } else if (b.type === 'paragraph') {
            content += `${b.text || ''}\n\n`;
          } else if (b.type === 'bullets' && Array.isArray(b.items)) {
            content += b.items.map((i) => `- ${i}`).join('\n') + '\n\n';
          } else if (b.type === 'numbered' && Array.isArray(b.items)) {
            content += b.items.map((it, idx) => `${idx + 1}. ${it}`).join('\n') + '\n\n';
          } else if (b.type === 'pagebreak') {
            content += '---\n\n';
          } else if (b.type === 'table') {
            if (b.header && Array.isArray(b.header) && b.header.length > 0) {
              content += '| ' + b.header.join(' | ') + ' |\n';
              content += '| ' + b.header.map(() => '---').join(' | ') + ' |\n';
            }
            if (b.rows && Array.isArray(b.rows) && b.rows.length > 0) {
              for (const r of b.rows) {
                if (Array.isArray(r)) {
                  content += '| ' + r.join(' | ') + ' |\n';
                }
              }
            }
            content += '\n';
          }
        }
      } else if (args.raw || args.csv) {
        content += args.raw || args.csv || '';
      }

      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      return {
        blob,
        name: validFilename,
        mime: 'text/markdown;charset=utf-8',
      };
    }

    case 'csv': {
      let content = '';
      if (args.csv) {
        content = args.csv;
      } else if (sheets.length > 0) {
        const s = sheets[0];
        if (s.rows && Array.isArray(s.rows)) {
          s.rows.forEach((r) => {
            if (Array.isArray(r)) {
              content += r.map(escapeCsvCell).join(',') + '\n';
            }
          });
        }
      } else if (blocks.some((b) => b.type === 'table')) {
        const tb = blocks.find((b) => b.type === 'table');
        if (tb) {
          if (tb.header && Array.isArray(tb.header)) {
            content += tb.header.map(escapeCsvCell).join(',') + '\n';
          }
          if (tb.rows && Array.isArray(tb.rows)) {
            tb.rows.forEach((r) => {
              if (Array.isArray(r)) {
                content += r.map(escapeCsvCell).join(',') + '\n';
              }
            });
          }
        }
      } else if (args.raw) {
        content = args.raw;
      }

      // Add a UTF-8 BOM so Excel opens Bengali and Unicode text correctly
      const bomContent = '\uFEFF' + content;
      const blob = new Blob([bomContent], { type: 'text/csv;charset=utf-8' });
      return {
        blob,
        name: validFilename,
        mime: 'text/csv;charset=utf-8',
      };
    }

    case 'txt':
    default: {
      let content = '';
      if (args.title) {
        content += `${args.title}\n${'='.repeat(Math.max(args.title.length, 10))}\n\n`;
      }
      if (blocks.length > 0) {
        for (const b of blocks) {
          if (!b) continue;
          if (b.type === 'heading') {
            content += `\n${b.text || ''}\n${'-'.repeat(Math.max((b.text || '').length, 6))}\n`;
          } else if (b.type === 'paragraph') {
            content += `${b.text || ''}\n\n`;
          } else if (b.type === 'bullets' && Array.isArray(b.items)) {
            content += b.items.map((i) => `• ${i}`).join('\n') + '\n\n';
          } else if (b.type === 'numbered' && Array.isArray(b.items)) {
            content += b.items.map((it, idx) => `${idx + 1}. ${it}`).join('\n') + '\n\n';
          } else if (b.type === 'pagebreak') {
            content += '\n----------------------------------------\n\n';
          } else if (b.type === 'table') {
            if (b.header && Array.isArray(b.header)) {
              content += b.header.join('\t') + '\n';
            }
            if (b.rows && Array.isArray(b.rows)) {
              for (const r of b.rows) {
                if (Array.isArray(r)) {
                  content += r.join('\t') + '\n';
                }
              }
            }
            content += '\n';
          }
        }
      } else if (args.raw || args.csv) {
        content += args.raw || args.csv || '';
      }

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      return {
        blob,
        name: validFilename,
        mime: 'text/plain;charset=utf-8',
      };
    }
  }
}
