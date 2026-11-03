export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

const MAX_EXPR = 120;

type Tok =
  | { t: "n"; v: number }
  | { t: "op"; v: "+" | "-" | "*" | "/" }
  | { t: "u-" }
  | { t: "(" }
  | { t: ")" };

export function isCalculatorToggle(
  e: {
    key: string;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    repeat?: boolean;
  },
  opts?: { requireMod?: boolean }
): boolean {
  if (e.repeat) return false;
  if (e.key.toLowerCase() !== "c") return false;
  if (!e.altKey || e.shiftKey) return false;
  if (opts?.requireMod) return e.ctrlKey || e.metaKey;
  return true;
}

export function calculatorShortcutLabel(platform = ""): string {
  return /Mac|iPhone|iPad/i.test(platform) ? "⌃⌥C" : "Alt+C";
}

export function seedFromFocusedField(): string {
  const el = typeof document === "undefined" ? null : document.activeElement;
  if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) {
    return "";
  }
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const raw = (start !== end ? el.value.slice(start, end) : el.value).replace(/,/g, "").trim();
  return /^[-+]?\d*\.?\d+$/.test(raw) ? raw : "";
}

export function formatCalcNumber(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  const rounded = Math.round(value * 1e8) / 1e8;
  if (Object.is(rounded, -0)) return "0";
  const abs = Math.abs(rounded);
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-8)) {
    return rounded.toExponential(6).replace(/\.?0+e/, "e");
  }
  const text = abs >= 1 ? rounded.toFixed(6) : rounded.toFixed(8);
  return text.replace(/\.?0+$/, "");
}

export function applyGst(value: number, rate = 18): CalcResult {
  if (!Number.isFinite(value)) return { ok: false, error: "Invalid calculation" };
  if (!Number.isFinite(rate) || rate < 0) return { ok: false, error: "Invalid GST rate" };
  return { ok: true, value: value * (1 + rate / 100) };
}

export function removeGst(value: number, rate = 18): CalcResult {
  if (!Number.isFinite(value)) return { ok: false, error: "Invalid calculation" };
  if (!Number.isFinite(rate) || rate <= -100) return { ok: false, error: "Invalid GST rate" };
  return { ok: true, value: value / (1 + rate / 100) };
}

export function evaluateExpression(raw: string): CalcResult {
  const expr = normalizeExpression(raw);
  if (!expr) return { ok: false, error: "Enter a calculation" };
  if (expr.length > MAX_EXPR) return { ok: false, error: "Too long" };
  try {
    const tokens = tokenize(expr);
    const rpn = toRpn(tokens);
    const value = evalRpn(rpn);
    if (!Number.isFinite(value)) return { ok: false, error: "Invalid calculation" };
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid calculation",
    };
  }
}

function normalizeExpression(raw: string): string {
  return raw
    .replace(/,/g, "")
    .replace(/[×xX]/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/\s+/g, "");
}

function tokenize(expr: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;

  const last = () => tokens[tokens.length - 1];
  const canUnary = () => {
    const prev = last();
    return !prev || prev.t === "op" || prev.t === "u-" || prev.t === "(";
  };

  while (i < expr.length) {
    const ch = expr[i];

    if (ch === "%") {
      const prev = last();
      if (!prev || (prev.t !== "n" && prev.t !== ")")) {
        throw new Error("Invalid calculation");
      }
      tokens.push({ t: "op", v: "/" }, { t: "n", v: 100 });
      i += 1;
      continue;
    }

    if (ch === "(") {
      tokens.push({ t: "(" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ t: ")" });
      i += 1;
      continue;
    }

    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      if (ch === "-" && canUnary()) {
        tokens.push({ t: "u-" });
      } else if (ch === "+" && canUnary()) {
        // unary plus is a no-op
      } else {
        const prev = last();
        if (!prev || prev.t === "op" || prev.t === "u-" || prev.t === "(") {
          throw new Error("Invalid calculation");
        }
        tokens.push({ t: "op", v: ch });
      }
      i += 1;
      continue;
    }

    if (ch === "." || (ch >= "0" && ch <= "9")) {
      let seenDot = ch === ".";
      let j = i + 1;
      while (j < expr.length) {
        const next = expr[j];
        if (next === ".") {
          if (seenDot) throw new Error("Invalid calculation");
          seenDot = true;
          j += 1;
          continue;
        }
        if (next >= "0" && next <= "9") {
          j += 1;
          continue;
        }
        break;
      }
      const slice = expr.slice(i, j);
      if (slice === ".") throw new Error("Invalid calculation");
      const value = Number(slice);
      if (!Number.isFinite(value)) throw new Error("Invalid calculation");
      const prev = last();
      if (prev && (prev.t === "n" || prev.t === ")")) {
        throw new Error("Invalid calculation");
      }
      tokens.push({ t: "n", v: value });
      i = j;
      continue;
    }

    throw new Error("Invalid calculation");
  }

  return tokens;
}

function toRpn(tokens: Tok[]): Tok[] {
  const out: Tok[] = [];
  const ops: Tok[] = [];
  const prec = (tok: Tok) => {
    if (tok.t === "u-") return 4;
    if (tok.t === "op") return tok.v === "*" || tok.v === "/" ? 3 : 2;
    return 0;
  };

  for (const tok of tokens) {
    if (tok.t === "n") {
      out.push(tok);
      continue;
    }
    if (tok.t === "u-") {
      ops.push(tok);
      continue;
    }
    if (tok.t === "op") {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === "u-" || (top.t === "op" && prec(top) >= prec(tok))) {
          out.push(ops.pop()!);
          continue;
        }
        break;
      }
      ops.push(tok);
      continue;
    }
    if (tok.t === "(") {
      ops.push(tok);
      continue;
    }
    while (ops.length && ops[ops.length - 1].t !== "(") {
      out.push(ops.pop()!);
    }
    if (!ops.length || ops[ops.length - 1].t !== "(") {
      throw new Error("Unbalanced parentheses");
    }
    ops.pop();
  }

  while (ops.length) {
    const top = ops.pop()!;
    if (top.t === "(" || top.t === ")") throw new Error("Unbalanced parentheses");
    out.push(top);
  }
  return out;
}

function evalRpn(rpn: Tok[]): number {
  const stack: number[] = [];
  for (const tok of rpn) {
    if (tok.t === "n") {
      stack.push(tok.v);
      continue;
    }
    if (tok.t === "u-") {
      if (!stack.length) throw new Error("Invalid calculation");
      stack.push(-stack.pop()!);
      continue;
    }
    if (tok.t !== "op") throw new Error("Invalid calculation");
    if (stack.length < 2) throw new Error("Invalid calculation");
    const b = stack.pop()!;
    const a = stack.pop()!;
    if (tok.v === "/" && b === 0) throw new Error("Cannot divide by zero");
    const next = tok.v === "+" ? a + b : tok.v === "-" ? a - b : tok.v === "*" ? a * b : a / b;
    stack.push(next);
  }
  if (stack.length !== 1) throw new Error("Invalid calculation");
  return stack[0];
}
