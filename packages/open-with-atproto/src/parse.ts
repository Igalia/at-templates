export interface Template {
  parts: string[];
  expressions: Expression[];
  hasRemote: boolean;
}

export function parse(template: string): Template {
  let index = 0;

  const parts: string[] = [];
  const expressions: Expression[] = [];
  let hasRemote = false;

  while (index < template.length) {
    const exprStart = template.indexOf("{", index);
    if (exprStart === -1) {
      parts.push(template.slice(index));
      break;
    }
    parts.push(template.slice(index, exprStart));

    index = exprStart + 1;
    let exprEnd = template.indexOf("}", index);
    if (exprEnd === -1) {
      throw new Error("Unclosed expression");
    }

    const exprRaw = template.slice(index, exprEnd).trim();

    const parser = new ExpressionParser(exprRaw);
    expressions.push(parser.parseExpression());
    hasRemote ||= parser.hasRemote;
    index = exprEnd + 1;
  }

  if (expressions.length === parts.length) {
    parts.push("");
  }

  return { parts, expressions, hasRemote };
}


export type Expression = ExprReference | ExprProperty | ExprCall | ExprRemote;

// A bare a-zA-Z0-9 identifier
export interface ExprReference {
  type: "reference";
  name: string;
}

// A property access like `<identifier>.bar.baz`
export interface ExprProperty {
  type: "property";
  base: ExprReference;
  path: string[];
}

// A function call like `<expr>|foo`
export interface ExprCall {
  type: "call";
  callee: Expression;
  function: string;
}

// A remote access like `<expr>->foo.bar`
export interface ExprRemote {
  type: "remote";
  base: Expression;
  path: string[];
}

class ExpressionParser {
  #pos = 0;
  #input: string;

  hasRemote = false;

  constructor(input: string) {
    this.#input = input;
  }

  peek() {
    return this.#input[this.#pos];
  }

  parseIdentifierName(): string {
    const re = /[a-zA-Z0-9]+/y;
    re.lastIndex = this.#pos;

    const match = re.exec(this.#input);
    if (!match) {
      throw new Error(`Expected identifier at position ${this.#pos}`);
    }

    this.#pos += match[0].length;
    return match[0];
  }

  parseIdentifier(): ExprReference {
    return { type: "reference", name: this.parseIdentifierName() };
  }

  parseExpression(): Expression {
    let left: Expression = this.parseIdentifier();

    if (this.#pos < this.#input.length && this.#input[this.#pos] === ".") {
      this.#pos++;
      left = { type: "property", base: left, path: this.parsePath() };
    }

    while (this.#pos < this.#input.length) {
      let next = this.#input[this.#pos];
      if (next === "|") {
        this.#pos++;
        const functionName = this.parseIdentifierName();
        left = { type: "call", callee: left, function: functionName };
      } else if (next === "-" && this.#input[this.#pos + 1] === ">") {
        this.#pos += 2;
        left = { type: "remote", base: left, path: this.parsePath() };
        this.hasRemote = true;
      } else {
        throw new Error(
          `Unexpected character '${this.peek()}' at position ${this.#pos}`,
        );
      }
    }

    return left;
  }

  parsePath(): string[] {
    const path = [this.parseIdentifierName()];
    while (this.#input[this.#pos] === ".") {
      this.#pos++;
      path.push(this.parseIdentifierName());
    }
    return path;
  }
}
