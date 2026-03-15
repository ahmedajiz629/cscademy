import type { TrackModule } from "./types";

const CPP_STARTER = `#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
using namespace std;

int main() {
    
    return 0;
}
`;

const C_STARTER = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main() {
    
    return 0;
}
`;

const JAVA_STARTER = `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        
    }
}
`;

const PYTHON_STARTER = `import sys
input = sys.stdin.readline

`;

const JS_STARTER = `const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const lines = [];
rl.on('line', line => lines.push(line));
rl.on('close', () => {
    
});
`;

const algorithmics: TrackModule = {
  id: "algorithmics",
  name: "Algorithmics",
  description:
    "Algorithmic programming challenges — solve problems using efficient data structures and algorithms.",
  icon: "⚡",
  isActive: true,
  order: 1,

  languages: [
    { id: "1", name: "C++ 17", codemirrorLang: "cpp" },
    { id: "2", name: "C 11", codemirrorLang: "cpp" },
    { id: "3", name: "Java 13", codemirrorLang: "java" },
    { id: "4", name: "Python 3", codemirrorLang: "python" },
    { id: "5", name: "JavaScript (Node.js)", codemirrorLang: "javascript" },
  ],

  runEndpoint: "/api/csacademy/run",
  submitEndpoint: "/api/csacademy/submit",

  problems: [
    {
      id: "sequence-decomposition",
      name: "Sequence Decomposition",
      description: `An ancient ancestral saying states that the number 112012 brings good luck in any form it may appear (that is, as the number 112012, as the sequence {1,1,2,0,1,2}, among others). Moreover, it is said that a sequence of characters consisting only of 0, 1, and 2 is considered fortunate if it can be decomposed into multiple subsequences {1,1,2,0,1,2}.

Miguel has some fortunate sequences, and he will only give them to you if you can find a valid decomposition for each one.

Note: A subsequence of a sequence S is a sequence that can be derived from S by deleting zero or more elements without changing the order of the remaining elements.

Input
The first line contains an integer T, denoting the number of sequences.
Each of the next T lines contains a sequence Si to be decomposed.

Output
For each sequence Si, in the order of input, print |Si|/6 lines, each containing 6 integers in increasing order, representing the indices of a subsequence {1,1,2,0,1,2} such that all of them together decompose the sequence Si. If there are multiple valid answers, you may print any of them.

Constraints
• 1 ≤ T ≤ 2×10⁵
• 1 ≤ |Si| ≤ 6×10⁵
• 1 ≤ Σ|Si| ≤ 3×10⁶
• Si is fortunate for all i`,
      points: 100,
      order: 1,
      sampleInput: `3
112012
111122001122
111121102110112202012212`,
      sampleOutput: `1 2 3 4 5 6
1 2 5 7 9 11
3 4 6 8 10 12
1 2 5 8 13 18
3 4 9 12 14 21
6 7 15 17 20 22
10 11 16 19 23 24`,
      starterCode: {
        "1": CPP_STARTER,
        "2": C_STARTER,
        "3": JAVA_STARTER,
        "4": PYTHON_STARTER,
        "5": JS_STARTER,
      },
      contestTaskId: 51724,
      referer:
        "https://csacademy.com/ieeextreme-practice/task/sequence-decomposition/",
    },
    {
      id: "one-letter",
      name: "One Letter",
      description: `You are given a list of N words. From each word you should keep only one letter and discard all the others. Then you should permute the N chosen letters and build a single word by concatenating them. Find the lexicographically smallest word you can obtain.

Input
The first line contains a single integer value N.
Each of the following N lines contains a single string, representing one of the words.

Output
The output should contain one string of length N.

Constraints
• 1 ≤ N ≤ 10⁵
• The sum of lengths of the strings is ≤ 10⁵
• The strings will contain only lower case letters of the English alphabet.`,
      points: 100,
      order: 2,
      sampleInput: `3
cross
stop
arm`,
      sampleOutput: "aco",
      starterCode: {
        "1": CPP_STARTER,
        "2": C_STARTER,
        "3": JAVA_STARTER,
        "4": PYTHON_STARTER,
        "5": JS_STARTER,
      },
      contestTaskId: 680,
      referer:
        "https://csacademy.com/contest/interview-archive/task/one_letter/",
    },
  ],
};

export default algorithmics;
