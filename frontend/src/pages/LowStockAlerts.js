import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import {
  Search,
  Loader2,
  AlertTriangle,
  Package,
  Wrench,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const ITEMS_PER_PAGE = 20;

const LowStockAlerts = () => {
  const [inventoryItems, setInventoryItems] = useState([]);
  const [toolsCount, setToolsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invRes, toolsRes] = await Promise.all([
        axios.get(`${API_URL}/api/inventory/low-stock`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/tools-inserts/low-stock-count`).catch(() => ({ data: { count: 0 } })),
      ]);
      setInventoryItems(Array.isArray(invRes.data) ? invRes.data : []);
      setToolsCount(toolsRes.data?.count || toolsRes.data?.low_stock_count || 0);
    } catch (err) {
      console.error('Error fetching low stock:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = inventoryItems.filter(item => {
    const s = search.toLowerCase();
    return (
      (item.name || item.item_name || item.material_name || '').toLowerCase().includes(s) ||
      (item.category || item.type || '').toLowerCase().includes(s)
    );
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="low-stock-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Low Stock Alerts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {inventoryItems.length} items need restocking
          </p>
        </div>
        <Button variant="outline" onClick={fetchData} data-testid="refresh-btn">
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border border-amber-300 bg-amber-50/50" data-testid="inventory-low-stock-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Inventory Low Stock
            </CardTitle>
            <Package className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-amber-600">{inventoryItems.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Items below threshold</p>
          </CardContent>
        </Card>
        <Card className="border border-amber-300 bg-amber-50/50" data-testid="tools-low-stock-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tools & Inserts Low Stock
            </CardTitle>
            <Wrench className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-amber-600">{toolsCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Tools below threshold</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search low stock items..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          className="pl-10"
          data-testid="low-stock-search"
        />
      </div>

      {/* Items Table */}
      <Card className="border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Item</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Category</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Current Qty</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Min Level</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  {inventoryItems.length === 0 ? (
                    <div>
                      <AlertTriangle className="w-12 h-12 mx-auto text-emerald-500 mb-2" />
                      <p className="text-muted-foreground font-medium">All stock levels are healthy!</p>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No matching items</p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((item, i) => {
                const qty = item.quantity || item.current_quantity || 0;
                const minLevel = item.min_quantity || item.min_level || item.threshold || 0;
                const isCritical = qty === 0;
                return (
                  <TableRow key={i} className="table-row-hover" data-testid={`low-stock-row-${i}`}>
                    <TableCell className="font-medium">{item.name || item.item_name || item.material_name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{item.category || item.type || '-'}</TableCell>
                    <TableCell>
                      <span className={`font-bold ${isCritical ? 'text-red-600' : 'text-amber-600'}`}>{qty}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">{minLevel || '-'}</TableCell>
                    <TableCell>
                      <Badge className={`border-none ${isCritical ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isCritical ? 'Out of Stock' : 'Low Stock'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="flex items-center gap-4 px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default LowStockAlerts;
