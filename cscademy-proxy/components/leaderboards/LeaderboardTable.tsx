"use client";

import { ReactNode } from "react";

type BaseEntry = {
  rank: number;
  userName: string;
  userEmail: string;
};

type Column<T> = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render: (entry: T) => ReactNode;
};

export default function LeaderboardTable<T extends BaseEntry>({
  entries,
  columns,
  emptyMessage,
}: {
  entries: T[];
  columns: Array<Column<T>>;
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-800 bg-[#111127] p-8 text-center text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  const alignClassMap = {
    left: "text-left",
    right: "text-right",
    center: "text-center",
  } as const;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#111127]">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-800 bg-[#151530]">
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
              Rank
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
              Participant
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400 ${
                  alignClassMap[column.align ?? "left"]
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.rank}-${entry.userEmail}`} className="border-b border-gray-800/50 last:border-b-0">
              <td className="px-4 py-3 text-sm font-semibold text-white">#{entry.rank}</td>
              <td className="px-4 py-3">
                <div className="text-sm font-medium text-white">{entry.userName}</div>
                <div className="text-xs text-gray-500">{entry.userEmail}</div>
              </td>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-4 py-3 text-sm text-gray-300 ${
                    alignClassMap[column.align ?? "left"]
                  }`}
                >
                  {column.render(entry)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}