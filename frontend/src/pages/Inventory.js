import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const ITEMS_PER_PAGE = 20;

const Inventory = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/storage`);
      setItems(Array.isArray(data) ? data : data.items || []);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter items
  const filteredItems = items.filter(item => {
    const searchLower = search.toLowerCase();
    const matchesSearch = (
      (item.name || item.item_name || '').toLowerCase().includes(searchLower) ||
      (item.sku || item.code || '').toLowerCase().includes(searchLower) ||
      (item.category || item.type || '').toLowerCase().includes(searchLower)
    );
    
    if (showLowStock) {
      const qty = item.quantity || item.current_quantity || 0;
      const minStock = item.min_stock_level || item.min_quantity || 10;
      return matchesSearch && qty <= minStock;
    }
    
    return matchesSearch;
  });

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const isLowStock = (item) => {
    const qty = item.quantity || item.current_quantity || 0;
    const minStock = item.min_stock_level || item.min_quantity || 10;
    return qty <= minStock;
  };

  return (
    <div className="space-y-6" data-testid="inventory-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Inventory</h1>
      </div>

      {/* Filters */}
      <Card className="border border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, SKU, or category..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="pl-10"
                data-testid="search-input"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="lowStock"
                checked={showLowStock}
                onCheckedChange={(checked) => { setShowLowStock(checked); setCurrentPage(1); }}
                data-testid="low-stock-filter"
              />
              <Label htmlFor="lowStock" className="text-sm cursor-pointer flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" /> Low Stock Only
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card className="border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Item</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">SKU/Code</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Category</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Quantity</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Unit</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell">Location</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <p className="text-muted-foreground">No items found</p>
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((item, index) => (
                <TableRow 
                  key={item.id || item._id || index} 
                  className={`table-row-hover ${isLowStock(item) ? 'bg-amber-50/50' : ''}`}
                  data-testid={`inventory-row-${index}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {isLowStock(item) && (
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      )}
                      <span className="font-medium">{item.name || item.item_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell font-mono text-sm text-muted-foreground">
                    {item.sku || item.code || '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground capitalize">
                    {item.category || item.type || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={isLowStock(item) ? 'text-amber-600 font-semibold' : ''}>
                        {item.quantity || item.current_quantity || 0}
                      </span>
                      {isLowStock(item) && (
                        <Badge className="bg-amber-100 text-amber-700 border-none text-xs">Low</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {item.unit || '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {item.location || item.rack || '-'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-4 px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Showing {startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, filteredItems.length)} of {filteredItems.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                data-testid="prev-page-btn"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium px-2">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="next-page-btn"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Inventory;
