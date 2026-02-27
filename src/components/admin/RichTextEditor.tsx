import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { PlaceholderNode } from "@/lib/tiptap-placeholder-extension";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Link as LinkIcon, Image as ImageIcon, Heading1, Heading2, Heading3,
  Palette, Code, Undo, Redo, Type, Braces,
} from "lucide-react";
import { useState, useEffect } from "react";

interface PlaceholderOption {
  key: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholders?: PlaceholderOption[];
}

export function RichTextEditor({ value, onChange, placeholders }: Props) {
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const extensions = [
    StarterKit,
    Underline,
    TextStyle,
    Color,
    Link.configure({ openOnClick: false }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Image,
    ...(placeholders ? [PlaceholderNode] : []),
  ];

  const editor = useEditor({
    extensions,
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  const ToolBtn = ({
    onClick, active, children, title,
  }: {
    onClick: () => void;
    active?: boolean;
    children: React.ReactNode;
    title?: string;
  }) => (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      size="icon"
      className="h-7 w-7"
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );

  const addLink = () => {
    if (linkUrl) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
      setLinkUrl("");
    }
  };

  const addImage = () => {
    if (imageUrl) {
      editor.chain().focus().setImage({ src: imageUrl }).run();
      setImageUrl("");
    }
  };

  const insertPlaceholder = (key: string) => {
    editor.chain().focus().insertContent({
      type: "placeholderNode",
      attrs: { key },
    }).run();
  };

  const COLORS = ["#000000", "#dc2626", "#2563eb", "#16a34a", "#ca8a04", "#9333ea", "#e11d48", "#6b7280"];

  return (
    <div className="border rounded-md overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 p-1.5 border-b bg-muted/30">
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrita">
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Cursiva">
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Subrayado">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Tachado">
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-7 bg-border mx-0.5" />

        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Título 1">
          <Heading1 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Título 2">
          <Heading2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Título 3">
          <Heading3 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive("paragraph")} title="Párrafo">
          <Type className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-7 bg-border mx-0.5" />

        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Lista">
          <List className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Lista numerada">
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-7 bg-border mx-0.5" />

        <ToolBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Alinear izquierda">
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Centrar">
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Alinear derecha">
          <AlignRight className="h-3.5 w-3.5" />
        </ToolBtn>

        <div className="w-px h-7 bg-border mx-0.5" />

        {/* Color picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Color de texto">
              <Palette className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="flex gap-1">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="w-6 h-6 rounded border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => editor.chain().focus().setColor(color).run()}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Link */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant={editor.isActive("link") ? "default" : "ghost"} size="icon" className="h-7 w-7" title="Enlace">
              <LinkIcon className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2">
            <div className="flex gap-1">
              <Input placeholder="https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="h-7 text-xs" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLink())} />
              <Button type="button" size="sm" className="h-7 text-xs" onClick={addLink}>OK</Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Image */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Imagen">
              <ImageIcon className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-2">
            <div className="flex gap-1">
              <Input placeholder="URL de imagen..." value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="h-7 text-xs" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addImage())} />
              <Button type="button" size="sm" className="h-7 text-xs" onClick={addImage}>OK</Button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-7 bg-border mx-0.5" />

        <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Código">
          <Code className="h-3.5 w-3.5" />
        </ToolBtn>

        {/* Placeholder inserter */}
        {placeholders && placeholders.length > 0 && (
          <>
            <div className="w-px h-7 bg-border mx-0.5" />
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Insertar Placeholder">
                  <Braces className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1">
                <div className="space-y-0.5">
                  {placeholders.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors"
                      onClick={() => insertPlaceholder(p.key)}
                    >
                      <span className="font-mono text-xs text-primary">{`{{${p.key}}}`}</span>
                      <span className="ml-2 text-muted-foreground text-xs">{p.label}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}

        <div className="w-px h-7 bg-border mx-0.5" />

        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Deshacer">
          <Undo className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Rehacer">
          <Redo className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-3 min-h-[200px] max-h-[350px] overflow-y-auto focus-within:outline-none
          [&_.tiptap]:outline-none [&_.tiptap]:min-h-[180px]
          [&_.tiptap_p]:my-1 [&_.tiptap_h1]:my-2 [&_.tiptap_h2]:my-2 [&_.tiptap_h3]:my-1.5
          [&_.tiptap_ul]:my-1 [&_.tiptap_ol]:my-1 [&_.tiptap_li]:my-0.5
          [&_.tiptap_a]:text-primary [&_.tiptap_a]:underline
          [&_.tiptap_img]:max-w-full [&_.tiptap_img]:rounded"
      />
    </div>
  );
}
