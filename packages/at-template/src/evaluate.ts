import type { Template, Expression } from "./parse.ts";

interface Context {
  [name: string]: any;
}

export interface Transforms {
  [name: string]: (...args: any[]) => any;
}

// Called when a property read resolves to a missing value, with the object the
// read was attempted on and the property name.
type OnMissing = (obj: any, property: string) => void;

type EvaluateOptions = {
  context: Context;
  transforms?: Transforms;
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
  { context, transforms = {}, onMissing = defaultOnMissing }: EvaluateOptions,
) {
  const res = templateEvaluatorWithContext(
    template,
    context,
    transforms,
    onMissing,
  ).next();
  if (!res.done) {
    throw new Error("Template requires remote values, use evaluateAsync instead");
  }
  return res.value;
}

export async function evaluateAsync(
  template: Template,
  { fetchRemote, context, transforms = {}, onMissing = defaultOnMissing }: EvaluateAsyncOptions,
) {
  const evaluator = templateEvaluatorWithContext(
    template,
    context,
    transforms,
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
  | { type: "transform"; name: string }
  | { type: "remote"; base: string };

function* templateEvaluatorWithContext(
  template: Template,
  context: Context,
  transforms: Transforms,
  onMissing: OnMissing,
): Generator<string, string, any> {
  const tEval = templateEvaluator(template, onMissing);

  let res = tEval.next();
  while (!res.done) {
    switch (res.value.type) {
      case "remote": {
        res = tEval.next(yield res.value.base);
        break;
      }
      case "reference":
      case "transform": {
        const { type, name } = res.value;
        const storage = type === "reference" ? context : transforms;
        if (!Object.hasOwn(storage, name)) {
          throw new Error(`Undefined ${type}: ${name}`);
        }
        res = tEval.next(storage[name]);
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
      return yield expr;
    }
    case "property": {
      const base = yield* expressionEvaluator(expr.base, onMissing);
      return getPath(base, expr.path, onMissing);
    }
    case "transform": {
      const arg = yield* expressionEvaluator(expr.base, onMissing);
      const transform = yield expr;
      return transform(arg);
    }
    case "remote": {
      const base = yield* expressionEvaluator(expr.base, onMissing);
      const remoteBase = yield { type: "remote", base: base };
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
