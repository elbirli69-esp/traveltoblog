import { marked } from "marked";

interface JournalMarkdownProps {
  markdown: string;
}

export default function JournalMarkdown({ markdown }: JournalMarkdownProps) {
  const html = marked.parse(markdown, { async: false }) as string;

  return (
    <article
      className="journal-prose prose prose-slate mb-10 max-w-none prose-headings:font-semibold prose-a:text-teal-600 prose-img:rounded-xl"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
