type Ja = 1;
type Da = 0;
const ja: Ja = 1;
const da: Da = 0;
type TheirLogic = Ja | Da;
type False = 0;
type True = 1;
type OurLogic = True | False;
type F = 0;
const F: F = 0;
type T = 1;
const T: T = 1;
type R = 2;
const R: R = 2;
type Being = T | F | R;
type JaIsYes = 1 | 0;

type Index = 0 | 1 | 2;
type Answer = [Being, Being, Being];

type Ctx = [Being, Being, Being, Ask];

type Ask = (index: Index, question: () => boolean) => TheirLogic;
type Question = (...ctx: Ctx) => boolean;
type Solution = (
  ask: (index: Index, question: Question) => TheirLogic,
  tuple: (a: Being, b: Being, c: Being) => Answer,
  eq: <T>(x: T, y: T) => boolean,
  ite: <T>(cond: boolean, yes: () => T, no: () => T) => T,
) => Answer;

function* random(): Generator<{ rand: () => boolean; answers: boolean[] }> {
  let answerPrefix: boolean[] = [];
  while (true) {
    const answers: boolean[] = [];
    yield {
      rand: () => {
        const answer = answerPrefix[answers.length] ?? false;
        answers.push(answer);
        return answer;
      },
      answers,
    };
    answerPrefix = [...answers];
    while (answerPrefix.length > 0) {
      const last = answerPrefix.pop()!;
      if (last === false) {
        answerPrefix.push(true);
        break;
      }
    }
    if (answerPrefix.length === 0) return;
  }
}
const handleSolution = (
  solution: Solution,
  beings: Answer,
  jaIsYes: boolean,
  rand: () => boolean,
) => {
  let n = 0;
  const beingAsk: Ask = (index: Index, question: () => boolean): TheirLogic => {
    const being = beings[index];
    if (being === R) {
      return rand() ? ja : da;
    }
    const fact = question();
    const answerInOurLogic = being === T ? fact : !fact;
    return answerInOurLogic == jaIsYes ? ja : da;
  };
  const ask = (index: Index, question: Question): TheirLogic => {
    if (n >= 3) {
      throw new Error("Too many questions asked");
    }
    n++;
    return beingAsk(index, () => question(...beings, beingAsk));
  };
  try {
    const [a, b, c] = solution(
      ask,
      (a, b, c) => [a, b, c],
      (x, y) => x === y,
      (cond, yes, no) => (cond ? yes() : no()),
    );
    const correct = a === beings[0] && b === beings[1] && c === beings[2];
    return { ok: correct };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};
const beings: Being[] = [1, 0, 2];

const checkSolution = (solution: Solution) => {
  for (const a of beings) {
    for (const b of beings) {
      if (b === a) continue;
      const c = beings.find((x) => x !== a && x !== b)!;
      for (const jaIsYes of [false, true]) {
        for (const rand of random()) {
          const result = handleSolution(
            solution,
            [a, b, c],
            jaIsYes,
            rand.rand,
          );
          if (!result.ok) {
            return { ...result, a, b, c, jaIsYes, rand: rand.answers };
          }
        }
      }
    }
  }
  return { ok: true };
};

const checkSolutionString = (str: string) => {
  if (!/^[a-zA-Z0-9_=>(,)]+$/.test(str))
    return { ok: false, error: "Invalid characters in solution" };
  const invalidToken = [...str.matchAll(/\w+/g)].find(
    (w) => !/^([0-9]+|ask|t|eq|ite|[a-z])$|^_vx/.test(w[0]),
  );
  if (invalidToken)
    return {
      ok: false,
      error: `All variables in solution should be either eq, t, ite, ask, a letter, or start with _vx, found ${invalidToken[0]}`,
    };
  const solution: Solution = eval(`(ask,t,eq,ite)=>${str}`);
  return checkSolution(solution);
};

const input = process.argv[2];

if (input) {
  console.log(JSON.stringify(checkSolutionString(input)));
}
