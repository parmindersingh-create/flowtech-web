import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Loader2, User, Camera, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const Settings = () => {
  const { user, setUserData } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUpdateName = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const { data } = await axios.put(`${API_URL}/api/auth/update-name`, { name: name.trim() });
      setUserData({ ...user, name: name.trim() });
      toast.success('Name updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update name');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5MB');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await axios.post(`${API_URL}/api/users/profile-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (data.image_url || data.picture) {
        setUserData({ ...user, picture: data.image_url || data.picture });
      }
      toast.success('Profile picture updated');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl" data-testid="settings-page">
      <h1 className="text-3xl font-extrabold tracking-tight">Settings</h1>

      {/* Profile Card */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-6">
            <div className="relative">
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="w-20 h-20 rounded-full object-cover border-2 border-border" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center border-2 border-border">
                  <User className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <label className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors">
                {uploading ? (
                  <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-primary-foreground" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploading}
                  data-testid="profile-image-upload"
                />
              </label>
            </div>
            <div>
              <p className="font-semibold text-lg">{user?.name || 'User'}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <p className="text-xs text-primary capitalize mt-1">{user?.role || 'User'}</p>
            </div>
          </div>

          {/* Update Name */}
          <form onSubmit={handleUpdateName} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name</Label>
              <Input
                id="display-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your display name"
                data-testid="name-input"
              />
            </div>
            <Button type="submit" disabled={saving || !name.trim() || name === user?.name} data-testid="save-name-btn">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Account Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{user?.email || '-'}</p>
              </div>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">Role</p>
                <p className="text-sm text-muted-foreground capitalize">{user?.role || 'User'}</p>
              </div>
            </div>
            <div className="flex justify-between items-center py-3">
              <div>
                <p className="text-sm font-medium">Authentication</p>
                <p className="text-sm text-muted-foreground">Google OAuth</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* App Preferences */}
      <Card className="border border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">App Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">System Default</p>
              </div>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">TV Auto-refresh</p>
                <p className="text-sm text-muted-foreground">Every 10 seconds</p>
              </div>
            </div>
            <div className="flex justify-between items-center py-3">
              <div>
                <p className="text-sm font-medium">Items per page</p>
                <p className="text-sm text-muted-foreground">20 items</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
