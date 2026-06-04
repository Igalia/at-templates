export interface AppHandle {
  collection: string;
  label?: string;
  template: string;
}

export interface AppHandlers {
  $type: "com.example.app.handlers";
  createdAt: string;
  name: string;
  targets: Array<AppHandle>;
}

export interface CollectionHandle {
  appName: string;
  label?: string;
  urlTemplate: string;
}

export type CollectionHandlers = {
  [collectionName: string]: Array<CollectionHandle>;
}

declare const collectionHandlers: CollectionHandlers;
export default collectionHandlers;

declare module "@igalia-experiments/at-app-handlers/*.json" {
  const appHandlers: AppHandlers;
  export default appHandlers;
}
