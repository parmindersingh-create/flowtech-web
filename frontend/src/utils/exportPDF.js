import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

export const exportToPDF = (columns, rows, title, filename) => {
  if (!rows.length) { toast.error('No data to export'); return; }
  const doc = new jsPDF({ orientation: rows[0].length > 5 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Exported: ${new Date().toLocaleString()}`, 14, 25);
  autoTable(doc, {
    startY: 30,
    head: [columns],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: [30, 30, 30], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 14, right: 14 },
  });
  doc.save(filename);
  toast.success(`PDF exported (${rows.length} rows)`);
};
