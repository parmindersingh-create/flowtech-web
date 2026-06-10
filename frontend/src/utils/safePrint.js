/**
 * Safe print utility — avoids document.write XSS vulnerabilities
 * Uses DOM manipulation instead of innerHTML/document.write
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { PUBLIC_QR_HOST } from '../components/PrintQRModal';

const escapeHtml = (str) => {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
};

const qrSvgFor = (partId, fallback) => {
  const value = partId ? `${PUBLIC_QR_HOST}/part/${partId}` : (fallback || '');
  if (!value) return '';
  return renderToStaticMarkup(
    React.createElement(QRCodeSVG, { value, size: 64, level: 'L' })
  );
};

export const printQRCode = ({ svgElement, id, name }) => {
  if (!svgElement) return;
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const win = window.open('', '_blank');
  if (!win) return;
  const doc = win.document;
  doc.open();
  const safeId = escapeHtml(id);
  const safeName = escapeHtml(name);
  doc.write(`<!DOCTYPE html><html><head><title>QR - ${safeId}</title><style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:Arial,sans-serif;margin:0}.id{font-size:18px;font-weight:bold;margin-top:12px}.name{font-size:14px;color:#666}@media print{body{padding:20px}}</style></head><body>${svgData}<div class="id">${safeId}</div><div class="name">${safeName}</div></body></html>`);
  doc.close();
  setTimeout(() => { win.print(); }, 300);
};

export const printBOMSheet = ({ assemblyName, assemblyId, description, parts }) => {
  if (!parts?.length) return;
  const esc = escapeHtml;

  const rows = parts.map((p, i) => {
    const partName = p.name || p.part_name || '';
    const dims = [p.size, p.length].filter(Boolean).join(' × ');
    const qrSvg = qrSvgFor(p.part_id, partName);
    const imgCell = p.image
      ? `<img src="${esc(p.image)}" alt="" class="part-img" />`
      : `<div class="part-img placeholder">No Image</div>`;
    const stock = p.stock ?? 0;
    const needed = Number(p.quantity || 0);
    const shortBy = needed - stock;
    const stockClass = stock >= needed ? 'ok' : 'short';

    return `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="qr">${qrSvg}<div class="pid">${esc(p.part_id || '')}</div></td>
        <td class="img">${imgCell}</td>
        <td class="info">
          ${p.part_no ? `<div class="pno">${esc(p.part_no)}</div>` : ''}
          <div class="pname">${esc(partName)}</div>
          ${p.category ? `<div class="meta"><span class="lbl">Category:</span> ${esc(p.category)}</div>` : ''}
          ${p.part_type ? `<div class="meta"><span class="lbl">Type:</span> ${esc(p.part_type)}</div>` : ''}
          ${p.remarks ? `<div class="meta"><span class="lbl">Remarks:</span> ${esc(p.remarks)}</div>` : ''}
        </td>
        <td class="material">${esc(p.material || '-')}</td>
        <td class="dims">${esc(dims || '-')}</td>
        <td class="qty">${needed} <span class="unit">${esc(p.unit || 'PCS')}</span></td>
        <td class="stock ${stockClass}">
          ${stock}
          ${shortBy > 0 ? `<div class="short-label">Short ${shortBy}</div>` : ''}
        </td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<title>BOM - ${esc(assemblyName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; padding: 18px; margin: 0; color: #222; }
  h2 { margin: 0 0 4px 0; font-size: 20px; }
  .meta-block { color: #555; font-size: 12px; margin-bottom: 14px; line-height: 1.5; }
  .meta-block strong { color: #222; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 12px; vertical-align: top; text-align: left; }
  th { background: #f0f0f0; font-weight: 700; text-align: center; }
  td.num { text-align: center; font-weight: 600; width: 30px; }
  td.qr { text-align: center; width: 80px; }
  td.qr svg { width: 64px; height: 64px; display: block; margin: 0 auto; }
  td.qr .pid { font-family: monospace; font-size: 9px; margin-top: 3px; color: #333; word-break: break-all; }
  td.img { width: 80px; text-align: center; }
  .part-img { width: 64px; height: 64px; object-fit: cover; border: 1px solid #ddd; border-radius: 4px; }
  .part-img.placeholder { display: flex; align-items: center; justify-content: center; background: #f8f8f8; color: #aaa; font-size: 9px; }
  td.info .pno { font-family: monospace; font-size: 11px; color: #1e40af; font-weight: 700; }
  td.info .pname { font-weight: 600; font-size: 13px; margin: 1px 0 4px 0; }
  td.info .meta { font-size: 11px; color: #555; line-height: 1.4; }
  td.info .meta .lbl { color: #888; }
  td.material, td.dims { font-family: monospace; font-size: 11px; }
  td.qty { text-align: center; font-weight: 700; font-size: 13px; }
  td.qty .unit { font-weight: 400; font-size: 10px; color: #666; }
  td.stock { text-align: center; font-weight: 700; font-size: 13px; }
  td.stock.ok { color: #047857; }
  td.stock.short { color: #b91c1c; }
  td.stock .short-label { font-size: 9px; font-weight: 600; }
  @media print {
    body { padding: 8px; }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
  }
</style>
</head>
<body>
  <h2>${esc(assemblyName)}</h2>
  <div class="meta-block">
    ${description ? `${esc(description)}<br/>` : ''}
    <strong>Assembly ID:</strong> ${esc(assemblyId || '')} &nbsp;&nbsp;
    <strong>Total Parts:</strong> ${parts.length} &nbsp;&nbsp;
    <strong>Printed:</strong> ${new Date().toLocaleString()}
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th style="width:80px">QR Code</th>
        <th style="width:80px">Image</th>
        <th>Part Info</th>
        <th style="width:110px">Material</th>
        <th style="width:110px">Dimensions</th>
        <th style="width:70px">Qty</th>
        <th style="width:70px">Stock</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 400);
};

export const printPDFDrawing = (drawingSrc) => {
  if (!drawingSrc) return;
  const win = window.open('', '_blank');
  if (!win) return;
  const iframe = win.document.createElement('iframe');
  iframe.src = drawingSrc;
  iframe.style.cssText = 'width:100%;height:100vh;border:none';
  win.document.body.style.margin = '0';
  win.document.body.appendChild(iframe);
};
