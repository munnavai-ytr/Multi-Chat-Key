export interface DocBlock {
  type: 'heading' | 'paragraph' | 'bullets' | 'numbered' | 'table' | 'pagebreak';
  level?: 1 | 2 | 3;
  text?: string;
  items?: string[];
  header?: string[];
  rows?: (string | number)[][];
}

export interface DocSheet {
  name?: string;
  columns?: ({ header: string; key?: string; width?: number } | string)[];
  rows?: (any[] | Record<string, any>)[];
}

export interface DocSlide {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  notes?: string;
}

export interface BuildDocParams {
  format: 'docx' | 'pdf' | 'xlsx' | 'pptx' | 'md' | 'txt' | 'csv' | string;
  filename: string;
  title?: string;
  blocks?: DocBlock[];
  sheets?: DocSheet[];
  slides?: DocSlide[];
  raw?: string;
}

export interface BuildDocResult {
  data: ArrayBuffer;
  mime: string;
  name: string;
  size: number;
  format: string;
}

function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function buildDocument(params: BuildDocParams): Promise<BuildDocResult> {
  const format = (params.format || 'txt').toLowerCase();
  const cleanFilename = (params.filename || 'document').replace(/\.[a-zA-Z0-9]+$/, '');
  const fullName = `${cleanFilename}.${format}`;

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
      } = await import('docx');

      const children: any[] = [];

      if (params.title) {
        children.push(
          new Paragraph({
            text: params.title,
            heading: HeadingLevel.TITLE,
            spacing: { after: 300 },
          })
        );
      }

      const blocks = params.blocks || [];
      if (blocks.length === 0 && params.raw) {
        params.raw.split('\n\n').forEach((para) => {
          if (para.trim()) {
            children.push(new Paragraph({ text: para.trim(), spacing: { after: 150 } }));
          }
        });
      }

      for (const b of blocks) {
        if (b.type === 'heading') {
          const hLevel =
            b.level === 1
              ? HeadingLevel.HEADING_1
              : b.level === 2
              ? HeadingLevel.HEADING_2
              : HeadingLevel.HEADING_3;
          children.push(
            new Paragraph({
              text: b.text || '',
              heading: hLevel,
              spacing: { before: 240, after: 120 },
            })
          );
        } else if (b.type === 'paragraph') {
          children.push(
            new Paragraph({
              text: b.text || '',
              spacing: { after: 140 },
            })
          );
        } else if (b.type === 'bullets' && b.items) {
          b.items.forEach((item) => {
            children.push(
              new Paragraph({
                text: item,
                bullet: { level: 0 },
                spacing: { after: 80 },
              })
            );
          });
        } else if (b.type === 'numbered' && b.items) {
          b.items.forEach((item, idx) => {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: `${idx + 1}. ` }), new TextRun({ text: item })],
                spacing: { after: 80 },
              })
            );
          });
        } else if (b.type === 'pagebreak') {
          children.push(new Paragraph({ pageBreakBefore: true }));
        } else if (b.type === 'table') {
          const rows: any[] = [];
          if (b.header && b.header.length > 0) {
            rows.push(
              new TableRow({
                children: b.header.map(
                  (h) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [new TextRun({ text: String(h), bold: true })],
                        }),
                      ],
                    })
                ),
              })
            );
          }
          if (b.rows && b.rows.length > 0) {
            b.rows.forEach((r) => {
              rows.push(
                new TableRow({
                  children: (Array.isArray(r) ? r : []).map(
                    (c) =>
                      new TableCell({
                        children: [new Paragraph({ text: String(c ?? '') })],
                      })
                  ),
                })
              );
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
        sections: [
          {
            properties: {},
            children: children.length > 0 ? children : [new Paragraph({ text: ' ' })],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const data = await blob.arrayBuffer();
      const mime =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      return {
        data,
        mime,
        name: fullName,
        size: data.byteLength,
        format: 'docx',
      };
    }

    case 'xlsx': {
      const ExcelJS = await import('exceljs');
      const Workbook =
        (ExcelJS as any).Workbook ||
        (ExcelJS as any).default?.Workbook ||
        (ExcelJS as any).default;
      const wb = new Workbook();

      if (params.sheets && params.sheets.length > 0) {
        params.sheets.forEach((s, i) => {
          const ws = wb.addWorksheet(s.name || `Sheet${i + 1}`);
          if (s.columns && Array.isArray(s.columns)) {
            ws.columns = s.columns.map((c) => ({
              header: typeof c === 'string' ? c : c.header || '',
              key: typeof c === 'string' ? c : c.key || c.header || '',
              width: typeof c === 'object' && c.width ? c.width : 16,
            }));
          }
          if (s.rows && Array.isArray(s.rows)) {
            s.rows.forEach((r) => {
              ws.addRow(r);
            });
          }
        });
      } else if (params.blocks && params.blocks.some((b) => b.type === 'table')) {
        const tableBlocks = params.blocks.filter((b) => b.type === 'table');
        tableBlocks.forEach((tb, i) => {
          const ws = wb.addWorksheet(`Table${i + 1}`);
          if (tb.header) {
            ws.columns = tb.header.map((h) => ({ header: h, key: h, width: 16 }));
          }
          if (tb.rows) {
            tb.rows.forEach((r) => ws.addRow(r));
          }
        });
      } else if (params.raw) {
        const ws = wb.addWorksheet('Data');
        const lines = params.raw.trim().split(/\r?\n/);
        lines.forEach((line) => {
          ws.addRow(line.split(',').map((c) => c.trim().replace(/^"|"$/g, '')));
        });
      } else {
        const ws = wb.addWorksheet('Sheet1');
        ws.addRow(['Title', params.title || 'Data']);
      }

      const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
      const mime =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      return {
        data: buffer,
        mime,
        name: fullName,
        size: buffer.byteLength,
        format: 'xlsx',
      };
    }

    case 'pptx': {
      const pptxModule = await import('pptxgenjs');
      const PptxGenJS = (pptxModule as any).default || pptxModule;
      const pres = new PptxGenJS();

      if (params.slides && params.slides.length > 0) {
        params.slides.forEach((sl) => {
          const s = pres.addSlide();
          if (sl.title) {
            s.addText(sl.title, {
              x: 0.8,
              y: 0.6,
              w: '85%',
              fontSize: 24,
              bold: true,
              color: '1E293B',
            });
          }
          if (sl.subtitle) {
            s.addText(sl.subtitle, {
              x: 0.8,
              y: 1.4,
              w: '85%',
              fontSize: 16,
              color: '64748B',
            });
          }
          if (sl.bullets && Array.isArray(sl.bullets) && sl.bullets.length > 0) {
            const bulletItems = sl.bullets.map((b) => ({
              text: b,
              options: { bullet: true, fontSize: 14, color: '334155', breakLine: true },
            }));
            s.addText(bulletItems, {
              x: 0.8,
              y: sl.subtitle ? 2.2 : 1.6,
              w: '85%',
              h: 4.5,
            });
          }
          if (sl.notes) {
            s.addNotes(sl.notes);
          }
        });
      } else {
        const s1 = pres.addSlide();
        s1.addText(params.title || cleanFilename, {
          x: 1,
          y: 2,
          w: '80%',
          fontSize: 32,
          bold: true,
          color: '1E293B',
        });

        if (params.blocks && params.blocks.length > 0) {
          let currentSlide = pres.addSlide();
          let currentBullets: string[] = [];

          for (const b of params.blocks) {
            if (b.type === 'heading') {
              if (currentBullets.length > 0) {
                currentSlide = pres.addSlide();
                currentBullets = [];
              }
              currentSlide.addText(b.text || '', {
                x: 0.8,
                y: 0.8,
                w: '85%',
                fontSize: 22,
                bold: true,
                color: '1E293B',
              });
            } else if (b.type === 'paragraph' && b.text) {
              currentBullets.push(b.text);
            } else if (b.type === 'bullets' && b.items) {
              currentBullets.push(...b.items);
            } else if (b.type === 'pagebreak') {
              currentSlide = pres.addSlide();
              currentBullets = [];
            }
          }

          if (currentBullets.length > 0) {
            const items = currentBullets.map((t) => ({
              text: t,
              options: { bullet: true, fontSize: 14, breakLine: true },
            }));
            currentSlide.addText(items, { x: 0.8, y: 1.8, w: '85%', h: 4.5 });
          }
        }
      }

      const output = (await pres.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
      const mime =
        'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      return {
        data: output,
        mime,
        name: fullName,
        size: output.byteLength,
        format: 'pptx',
      };
    }

    case 'pdf': {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const margin = 15;
      const usableWidth = 180;
      const pageHeight = 285;
      let y = 20;

      const checkPageBreak = (neededHeight: number) => {
        if (y + neededHeight > pageHeight) {
          doc.addPage();
          y = margin;
        }
      };

      if (params.title) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.text(params.title, margin, y);
        y += 12;
      }

      const blocks = params.blocks || [];
      if (blocks.length === 0 && params.raw) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const lines = doc.splitTextToSize(params.raw, usableWidth);
        for (const line of lines) {
          checkPageBreak(6);
          doc.text(line, margin, y);
          y += 5.5;
        }
      }

      for (const b of blocks) {
        if (b.type === 'heading') {
          const size = b.level === 1 ? 16 : b.level === 2 ? 13 : 11;
          checkPageBreak(size / 2 + 6);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(size);
          doc.text(b.text || '', margin, y);
          y += size / 2 + 5;
        } else if (b.type === 'paragraph') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          const lines = doc.splitTextToSize(b.text || '', usableWidth);
          for (const line of lines) {
            checkPageBreak(5.5);
            doc.text(line, margin, y);
            y += 5;
          }
          y += 3;
        } else if (b.type === 'bullets' && b.items) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          for (const it of b.items) {
            const lines = doc.splitTextToSize(`•  ${it}`, usableWidth - 5);
            for (const l of lines) {
              checkPageBreak(5.5);
              doc.text(l, margin + 4, y);
              y += 5;
            }
          }
          y += 2;
        } else if (b.type === 'numbered' && b.items) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          for (let i = 0; i < b.items.length; i++) {
            const lines = doc.splitTextToSize(`${i + 1}.  ${b.items[i]}`, usableWidth - 5);
            for (const l of lines) {
              checkPageBreak(5.5);
              doc.text(l, margin + 4, y);
              y += 5;
            }
          }
          y += 2;
        } else if (b.type === 'pagebreak') {
          doc.addPage();
          y = margin;
        } else if (b.type === 'table') {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          if (b.header && b.header.length > 0) {
            checkPageBreak(8);
            const colWidth = usableWidth / b.header.length;
            b.header.forEach((h, idx) => {
              doc.text(String(h).slice(0, 20), margin + idx * colWidth, y);
            });
            y += 5;
            doc.line(margin, y, margin + usableWidth, y);
            y += 4;
          }
          doc.setFont('helvetica', 'normal');
          if (b.rows && b.rows.length > 0) {
            for (const r of b.rows) {
              checkPageBreak(6);
              const colWidth = usableWidth / Math.max(1, r.length);
              r.forEach((c, idx) => {
                doc.text(String(c ?? '').slice(0, 20), margin + idx * colWidth, y);
              });
              y += 5.5;
            }
            y += 3;
          }
        }
      }

      const buffer = doc.output('arraybuffer');
      return {
        data: buffer,
        mime: 'application/pdf',
        name: fullName,
        size: buffer.byteLength,
        format: 'pdf',
      };
    }

    case 'md': {
      let content = '';
      if (params.title) {
        content += `# ${params.title}\n\n`;
      }
      if (params.blocks && params.blocks.length > 0) {
        for (const b of params.blocks) {
          if (b.type === 'heading') {
            const prefix = '#'.repeat(b.level || 1);
            content += `${prefix} ${b.text}\n\n`;
          } else if (b.type === 'paragraph') {
            content += `${b.text}\n\n`;
          } else if (b.type === 'bullets' && b.items) {
            content += b.items.map((i) => `- ${i}`).join('\n') + '\n\n';
          } else if (b.type === 'numbered' && b.items) {
            content += b.items.map((it, idx) => `${idx + 1}. ${it}`).join('\n') + '\n\n';
          } else if (b.type === 'pagebreak') {
            content += '---\n\n';
          } else if (b.type === 'table') {
            if (b.header && b.header.length > 0) {
              content += '| ' + b.header.join(' | ') + ' |\n';
              content += '| ' + b.header.map(() => '---').join(' | ') + ' |\n';
            }
            if (b.rows && b.rows.length > 0) {
              for (const r of b.rows) {
                content += '| ' + (Array.isArray(r) ? r : []).join(' | ') + ' |\n';
              }
            }
            content += '\n';
          }
        }
      } else if (params.raw) {
        content += params.raw;
      }

      const encoded = new TextEncoder().encode(content);
      return {
        data: encoded.buffer as ArrayBuffer,
        mime: 'text/markdown;charset=utf-8',
        name: fullName,
        size: encoded.byteLength,
        format: 'md',
      };
    }

    case 'csv': {
      let content = '';
      if (params.raw) {
        content = params.raw;
      } else if (params.sheets && params.sheets.length > 0) {
        const s = params.sheets[0];
        if (s.columns) {
          const headers = s.columns.map((c) =>
            typeof c === 'string' ? c : c.header || c.key || ''
          );
          content += headers.map(escapeCsvCell).join(',') + '\n';
        }
        if (s.rows) {
          s.rows.forEach((r) => {
            if (Array.isArray(r)) {
              content += r.map(escapeCsvCell).join(',') + '\n';
            } else if (typeof r === 'object' && r !== null) {
              content += Object.values(r).map(escapeCsvCell).join(',') + '\n';
            }
          });
        }
      } else if (params.blocks) {
        const tb = params.blocks.find((b) => b.type === 'table');
        if (tb) {
          if (tb.header) {
            content += tb.header.map(escapeCsvCell).join(',') + '\n';
          }
          if (tb.rows) {
            tb.rows.forEach((r) => {
              content += (Array.isArray(r) ? r : []).map(escapeCsvCell).join(',') + '\n';
            });
          }
        }
      }

      const encoded = new TextEncoder().encode(content);
      return {
        data: encoded.buffer as ArrayBuffer,
        mime: 'text/csv;charset=utf-8',
        name: fullName,
        size: encoded.byteLength,
        format: 'csv',
      };
    }

    case 'txt':
    default: {
      let content = '';
      if (params.title) {
        content += `${params.title}\n${'='.repeat(params.title.length)}\n\n`;
      }
      if (params.blocks && params.blocks.length > 0) {
        for (const b of params.blocks) {
          if (b.type === 'heading') {
            content += `\n${b.text}\n${'-'.repeat((b.text || '').length)}\n`;
          } else if (b.type === 'paragraph') {
            content += `${b.text}\n\n`;
          } else if (b.type === 'bullets' && b.items) {
            content += b.items.map((i) => `• ${i}`).join('\n') + '\n\n';
          } else if (b.type === 'numbered' && b.items) {
            content += b.items.map((it, idx) => `${idx + 1}. ${it}`).join('\n') + '\n\n';
          } else if (b.type === 'pagebreak') {
            content += '\n----------------------------------------\n\n';
          } else if (b.type === 'table') {
            if (b.header) {
              content += b.header.join('\t') + '\n';
            }
            if (b.rows) {
              for (const r of b.rows) {
                content += (Array.isArray(r) ? r : []).join('\t') + '\n';
              }
            }
            content += '\n';
          }
        }
      } else if (params.raw) {
        content += params.raw;
      }

      const encoded = new TextEncoder().encode(content);
      return {
        data: encoded.buffer as ArrayBuffer,
        mime: 'text/plain;charset=utf-8',
        name: fullName,
        size: encoded.byteLength,
        format: 'txt',
      };
    }
  }
}
