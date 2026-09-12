"use client";

import * as React from "react";
import { ImageUp, Loader2, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, type WhatsAppProfile } from "@/lib/api";

/**
 * Edits the WhatsApp business profile — the card a customer sees when they tap
 * the business name in a chat, including its display picture.
 *
 * This is Meta's data, not ours: every field is read from and written to the
 * Graph API rather than mirrored in our database, so what is shown here is
 * always what customers actually see. Nothing is stored by Abiz, including the
 * photo, which is streamed straight through to Meta.
 */
export function WhatsAppProfileCard({ connected }: { connected: boolean }) {
  const [profile, setProfile] = React.useState<WhatsAppProfile | null>(null);
  // Nothing is fetched when no number is connected, so there is nothing to
  // wait for either. Deriving the initial value keeps the effect free of a
  // synchronous setState; the parent keys this component on `connected` so a
  // number connected while the page is open remounts it with a fresh state.
  const [loading, setLoading] = React.useState(connected);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!connected) return;

    let cancelled = false;
    (async () => {
      try {
        const { profile: loaded } = await api.whatsappProfile();
        if (!cancelled) setProfile(loaded);
      } catch (error) {
        // 409 just means no number is connected yet — the card explains that
        // itself rather than shouting about it.
        if (!cancelled && !(error instanceof ApiError && error.status === 409)) {
          toast.error(
            error instanceof ApiError
              ? error.message
              : "Could not load the WhatsApp profile",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setSaving(true);
    try {
      const { profile: updated } = await api.saveWhatsAppProfile({
        about: String(form.get("about") ?? ""),
        description: String(form.get("description") ?? ""),
        address: String(form.get("address") ?? ""),
        email: String(form.get("email") ?? ""),
        website: String(form.get("website") ?? ""),
      });
      setProfile(updated);
      toast.success("WhatsApp profile updated");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not save the profile",
      );
    } finally {
      setSaving(false);
    }
  };

  const changePhoto = async (file: File) => {
    setUploading(true);
    try {
      const { profile: updated } = await api.uploadWhatsAppPhoto(file);
      setProfile(updated);
      toast.success("Display picture updated");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not upload the photo",
      );
    } finally {
      setUploading(false);
      // Let the same file be picked again after a failure.
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  if (!connected) return null;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>WhatsApp profile</CardTitle>
        <p className="text-sm text-muted-foreground">
          What your customers see when they tap your business name in a chat.
        </p>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !profile ? (
          <p className="text-sm text-muted-foreground">
            Connect a WhatsApp number to edit its profile.
          </p>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-shell">
                {profile.profilePictureUrl ? (
                  // Meta-hosted and signed; next/image would need this domain
                  // allow-listed and cannot optimise a static export anyway.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.profilePictureUrl}
                    alt="WhatsApp display picture"
                    className="size-full object-cover"
                  />
                ) : (
                  <User className="size-8 text-muted-foreground" />
                )}
              </div>

              <div className="space-y-1">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void changePhoto(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImageUp className="size-4" />
                  )}
                  {uploading ? "Uploading…" : "Change photo"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  JPG or PNG, square, up to 5 MB.
                </p>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="wa-about">About</Label>
              <Input
                id="wa-about"
                name="about"
                maxLength={139}
                defaultValue={profile.about}
                placeholder="Open 9am – 8pm, all days"
              />
              <p className="text-xs text-muted-foreground">
                The one line under your name. Up to 139 characters.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="wa-description">Description</Label>
              <Textarea
                id="wa-description"
                name="description"
                maxLength={512}
                rows={3}
                defaultValue={profile.description}
                placeholder="What your business does."
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="wa-address">Address</Label>
              <Input
                id="wa-address"
                name="address"
                maxLength={256}
                defaultValue={profile.address}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="wa-email">Email</Label>
                <Input
                  id="wa-email"
                  name="email"
                  type="email"
                  maxLength={128}
                  defaultValue={profile.email}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="wa-website">Website</Label>
                <Input
                  id="wa-website"
                  name="website"
                  type="url"
                  maxLength={256}
                  defaultValue={profile.websites[0] ?? ""}
                  placeholder="https://anantio.com"
                />
              </div>
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
