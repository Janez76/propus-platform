import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  Link as LinkIcon,
  Undo2,
  Redo2,
} from "lucide-react";
import { cn } from "../../lib/utils";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
};

function ToolbarButton({
  active,
  onClick,
  disabled,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
        active
          ? "bg-[var(--accent)]/20 text-[var(--accent)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-main)]",
        disabled && "pointer-events-none opacity-30",
      )}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, placeholder, className }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-[var(--accent)] underline" } }),
      TextAlign.configure({ types: ["paragraph"] }),
    ],
    content: value || "",
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none px-3 py-2 min-h-[80px] max-h-[200px] overflow-y-auto focus:outline-none text-[var(--text-main)] [&_a]:text-[var(--accent)] [&_a]:underline",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (currentHtml === "<p></p>" && !value) return;
    if (value !== currentHtml) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", prev || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface-raised)] transition-all focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)] focus-within:bg-[var(--surface)]",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border-soft)] px-2 py-1">
        <ToolbarButton
          title="Fett"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Kursiv"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Unterstrichen"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-[var(--border-soft)]" />

        <ToolbarButton
          title="Liste"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Nummerierte Liste"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-[var(--border-soft)]" />

        <ToolbarButton
          title="Links ausrichten"
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Zentrieren"
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-[var(--border-soft)]" />

        <ToolbarButton
          title="Link"
          active={editor.isActive("link")}
          onClick={setLink}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-[var(--border-soft)]" />

        <ToolbarButton
          title="Rückgängig"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Wiederholen"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {!value && !editor.isFocused && editor.isEmpty && placeholder ? (
        <div className="pointer-events-none absolute px-3 py-2 text-sm text-[var(--text-subtle)]">
          {placeholder}
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
