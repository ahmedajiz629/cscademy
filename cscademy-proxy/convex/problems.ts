import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("problems").collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("problems")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if already seeded
    const existing = await ctx.db.query("problems").first();
    if (existing) return "Already seeded";

    const problems = [
      {
        slug: "addition",
        name: "Addition",
        contestTaskId: 38,
        description:
          "Given two integers a and b, output their sum.\n\nInput: Two integers a and b on a single line.\nOutput: Their sum.",
        referer: "https://csacademy.com/contest/archive/task/addition/",
        starterCode: `#include <iostream>

using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b;
    return 0;
}`,
        sampleInput: "1 2",
        sampleOutput: "3",
      },
      {
        slug: "one_letter",
        name: "One Letter",
        contestTaskId: 680,
        description: `You are given a list of N words. From each word you should keep only one letter and discard all the others. Then you should permute the N chosen letters and build a single word by concatenating them. Find the lexicographically smallest word you can obtain.

Input: The first line contains a single integer value N. Each of the following N lines contains a single string, representing one of the words.

Output: The output should contain one string of length N.

Constraints:
- 1 ≤ N ≤ 10^5
- The sum of lengths of the strings is ≤ 10^5
- The strings will contain only lower case letters of the English alphabet.`,
        referer:
          "https://csacademy.com/contest/interview-archive/task/one_letter/",
        starterCode: `#include <iostream>
#include <string>
#include <vector>
#include <algorithm>

using namespace std;

int main() {
    int n;
    cin >> n;
    
    vector<string> words(n);
    for (int i = 0; i < n; i++) {
        cin >> words[i];
    }
    
    // Your solution here
    
    return 0;
}`,
        sampleInput: `3
cross
stop
arm`,
        sampleOutput: "aco",
      },
    ];

    for (const problem of problems) {
      await ctx.db.insert("problems", problem);
    }

    return "Seeded " + problems.length + " problems";
  },
});

export const upsert = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    contestTaskId: v.number(),
    referer: v.string(),
    starterCode: v.string(),
    sampleInput: v.string(),
    sampleOutput: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("problems")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    } else {
      return await ctx.db.insert("problems", args);
    }
  },
});
