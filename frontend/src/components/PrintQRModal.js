import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Button } from './ui/button';
import { Printer } from 'lucide-react';

// Public host that serves the `/part/{id}` and `/assembly/{id}` web pages.
// QR codes encode this URL so any phone camera can scan and open the page.
// This must match what the APK encodes — keep in sync with the canonical public-facing host.
export const PUBLIC_QR_HOST = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';

const PrintQRModal = ({ open, onClose, value, qrValue, title, subtitle }) => {
  const qrRef = useRef(null);
  // qrValue (URL) is what's encoded in the QR; value is the human-readable ID shown below for manual entry
  const encoded = qrValue || value || '';
  const display = value || '';

  const handlePrint = () => {
    // For print, regenerate an SVG that encodes the URL so the printed QR still scans to the page
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const safeTitle = (title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeSub = (subtitle || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeVal = display.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>QR - ${safeVal}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:Arial,sans-serif;padding:20px}svg{width:200px!important;height:200px!important}.id{font-size:18px;font-weight:bold;margin-top:16px;font-family:monospace;letter-spacing:1px}.name{font-size:14px;color:#666;margin-top:4px}@media print{body{padding:10mm}svg{width:50mm!important;height:50mm!important}}</style></head><body>${svgData}<div class="id">${safeVal}</div>${safeSub ? `<div class="name">${safeSub}</div>` : ''}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>{title || 'Print QR Code'}</DialogTitle></DialogHeader>
        <div className="flex flex-col items-center py-4 space-y-3" ref={qrRef}>
          <div className="p-3 bg-white rounded-lg">
            <QRCodeSVG value={encoded} size={200} level="H" />
          </div>
          <p className="font-mono font-bold text-lg">{display}</p>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          {qrValue && <p className="text-[10px] text-muted-foreground break-all px-2 text-center">📷 Scan to open details</p>}
        </div>
        <DialogFooter>
          <Button onClick={handlePrint} className="w-full" data-testid="print-qr-btn">
            <Printer className="w-4 h-4 mr-2" /> Print QR Code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PrintQRModal;
