declare module "logic-solver" {
  type Formula = object;
  type Bits = object;
  type Operand = string | Formula | Operand[];

  interface Solution {
    getTrueVars(): string[];
    getFormula(): Formula;
  }

  class Solver {
    require(...formulas: Operand[]): void;
    forbid(...formulas: Operand[]): void;
    solve(): Solution | null;
    solveAssuming(formula: Operand): Solution | null;
  }

  const Logic: {
    Solver: typeof Solver;
    or(...operands: Operand[]): Formula;
    exactlyOne(...operands: Operand[]): Formula;
    atMostOne(...operands: Operand[]): Formula;
    sum(...operands: Operand[]): Bits;
    constantBits(value: number): Bits;
    equalBits(a: Bits, b: Bits): Formula;
  };

  export default Logic;
}
