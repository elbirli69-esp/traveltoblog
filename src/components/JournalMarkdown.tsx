import { marked } from "marked";

interface JournalMarkdownProps {
  markdown: string;
}

export default function JournalMarkdown({ markdown }: JournalMarkdownProps) {
  const html = marked.parse(markdown, { async: false }) as string;

  return (
    <article
      className="journal-prose"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
