import type { Template, Expression } from "./parse.ts";

interface Context {
  [name: string]: any;
}

interface Functions {
  [name: string]: (...args: any[]) => any;
}

// Called when a property read resolves to a missing value, with the object the
// read was attempted on and the property name.
type OnMissing = (obj: any, property: string) => void;

type EvaluateOptions = {
  context: Context;
  functions?: Functions;
  onMissing?: OnMissing;
}

type EvaluateAsyncOptions = EvaluateOptions & {
  fetchRemote: (name: string) => Promise<any>;
}

const defaultOnMissing: OnMissing = (obj, prop) => {
  throw new Error(`Missing property ${String(prop)} on ${JSON.stringify(obj)}`);
};

export function evaluateSync(
  template: Template,
  { context, functions = {}, onMissing = defaultOnMissing }: EvaluateOptions,
) {
  const res = templateEvaluatorWithContext(
    template,
    context,
    functions,
    onMissing,
  ).next();
  if (!res.done) {
    throw new Error("Template requires remote values, use evaluateAsync instead");
  }
  return res.value;
}

export async function evaluateAsync(
  template: Template,
  { fetchRemote, context, functions = {}, onMissing = defaultOnMissing }: EvaluateAsyncOptions,
) {
  const evaluator = templateEvaluatorWithContext(
    template,
    context,
    functions,
    onMissing,
  );

  let res = evaluator.next();
  while (!res.done) {
    res = evaluator.next(await fetchRemote(res.value));
  }

  return res.value;
}

type ValueRequest =
  | { type: "reference"; name: string }
  | { type: "function"; name: string }
  | { type: "remote"; name: string };

function* templateEvaluatorWithContext(
  template: Template,
  context: Context,
  functions: Functions,
  onMissing: OnMissing,
): Generator<string, string, any> {
  const tEval = templateEvaluator(template, onMissing);

  let res = tEval.next();
  while (!res.done) {
    const { type, name } = res.value;
    switch (type) {
      case "remote": {
        res = tEval.next(yield name);
        break;
      }
      case "reference": {
        if (!Object.hasOwn(context, name)) {
          throw new Error(`Undefined reference: ${name}`);
        }
        res = tEval.next(context[name]);
        break;
      }
      case "function": {
        if (!Object.hasOwn(functions, name)) {
          throw new Error(`Undefined function: ${name}`);
        }
        res = tEval.next(functions[name]);
        break;
      }
    }
  }

  return res.value;
}

function* templateEvaluator(
  template: Template,
  onMissing: OnMissing,
): Generator<ValueRequest, string, any> {
  const { parts, expressions } = template;

  let result = parts[0];
  for (let i = 0; i < expressions.length; i++) {
    const value = yield* expressionEvaluator(expressions[i], onMissing);
    result += String(value) + parts[i + 1];
  }

  return result;
}

function* expressionEvaluator(
  expr: Expression,
  onMissing: OnMissing,
): Generator<ValueRequest, any, any> {
  switch (expr.type) {
    case "reference": {
      return yield { type: "reference", name: expr.name };
    }
    case "property": {
      const base = yield* expressionEvaluator(expr.base, onMissing);
      return getPath(base, expr.path, onMissing);
    }
    case "call": {
      const arg = yield* expressionEvaluator(expr.callee, onMissing);
      const fn = yield { type: "function", name: expr.function };
      return fn(arg);
    }
    case "remote": {
      const base = yield* expressionEvaluator(expr.base, onMissing);
      const remoteBase = yield { type: "remote", name: base };
      return getPath(remoteBase, expr.path, onMissing);
    }
  }
}

function getPath(obj: any, path: string[], onMissing: OnMissing) {
  for (const prop of path) {
    if (typeof obj !== "object" || obj === null || !Object.hasOwn(obj, prop)) {
      return onMissing(obj, prop);
    }
    obj = obj[prop];
  }
  return obj;
}
