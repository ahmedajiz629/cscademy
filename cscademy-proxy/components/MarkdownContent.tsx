"use client";

import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

type MarkdownContentProps = {
  className?: string;
  content: string;
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function MarkdownContent({
  className,
  content,
}: MarkdownContentProps) {
  return (
    <div
      className={joinClasses(
        "text-gray-300 [&_a]:font-medium [&_a]:text-cyan-300 [&_a]:underline [&_a]:decoration-cyan-400/50 [&_a]:underline-offset-4 [&_a]:transition-colors hover:[&_a]:text-cyan-100 [&_blockquote]:border-l-2 [&_blockquote]:border-cyan-500/30 [&_blockquote]:pl-4 [&_blockquote]:text-gray-400 [&_code]:rounded-md [&_code]:bg-[#0b1324] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.95em] [&_h1]:mt-8 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-white [&_h2]:mt-7 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-white [&_h4]:mt-5 [&_h4]:text-lg [&_h4]:font-semibold [&_h4]:text-white [&_hr]:my-6 [&_hr]:border-gray-800 [&_li]:leading-7 [&_li]:marker:text-cyan-300/80 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-2 [&_p]:text-sm [&_p]:leading-7 [&_p]:text-gray-300 [&_p:not(:last-child)]:mb-4 [&_pre]:mb-4 [&_pre]:overflow-x-auto [&_pre]:rounded-2xl [&_pre]:border [&_pre]:border-gray-800 [&_pre]:bg-[#0b1324] [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:mb-4 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_td]:border [&_td]:border-gray-800 [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm [&_th]:border [&_th]:border-gray-800 [&_th]:bg-[#0f172a] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold [&_th]:text-white [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          a: ({ href, ...props }) => {
            const isInternal = href?.startsWith("/");

            return (
              <a
                {...props}
                href={href}
                target={isInternal ? undefined : "_blank"}
                rel={isInternal ? undefined : "noreferrer"}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}