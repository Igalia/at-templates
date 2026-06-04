export interface RecordPreview {
  $type: "com.example.record.preview",
  collection: string;
  template: string;
}

export type CollectionHandlers = {
  [collectionName: string]: string;
}

declare const collectionHandlers: CollectionHandlers;
export default collectionHandlers;

declare module "@igalia-experiments/at-record-previews/*.json" {
  const recordPreview: RecordPreview;
  export default recordPreview;
}
