"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { EmbedForm } from "./embed-form";
import { MediaUploader } from "./media-uploader";

/** "Add media" for the library page: multi-file upload or a YouTube / Vimeo link, into the current folder. */
export function MediaAddButton({ folderId }: { folderId: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const done = () => {
    setOpen(false);
    router.refresh();
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={setOpen}
      size="lg"
      trigger={
        <Button>
          <Upload aria-hidden />
          Add media
        </Button>
      }
      title="Add media"
      description={folderId ? "Items are added to the folder you are viewing." : "Items are added unfiled. Open a folder first to add them there."}
    >
      <Tabs defaultValue="upload">
        <TabsList className="mb-4">
          <TabsTrigger value="upload">Upload files</TabsTrigger>
          <TabsTrigger value="embed">Video link</TabsTrigger>
        </TabsList>
        <TabsContent value="upload">
          <MediaUploader multiple folderId={folderId} onCreated={done} />
        </TabsContent>
        <TabsContent value="embed">
          <EmbedForm folderId={folderId} onCreated={done} />
        </TabsContent>
      </Tabs>
    </ResponsiveDialog>
  );
}
