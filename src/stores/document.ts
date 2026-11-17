import { createContext, useContext } from 'solid-js';
import { createDocument } from './documentFactory';
import type { DocState, DocSource, DocumentStore } from './documentFactory';
import { activeStore } from './tabs';

export { createDocument };
export type { DocState, DocSource, DocumentStore };
export type { ParseStatus } from './documentFactory';

/** `fn` of the active tab's store, resolved at call time so that switching tabs switches every consumer. */
const delegate = <K extends keyof DocumentStore>(key: K): DocumentStore[K] =>
  ((...args: unknown[]) => (activeStore()[key] as (...a: unknown[]) => unknown)(...args)) as DocumentStore[K];

/** Reactive view of the active tab's state (reads are tracked through both the tab signal and the store). */
export const doc = new Proxy({} as DocState, {
  get: (_t, prop) => (activeStore().doc as unknown as Record<string | symbol, unknown>)[prop],
  has: (_t, prop) => prop in activeStore().doc,
  ownKeys: () => Reflect.ownKeys(activeStore().doc),
  getOwnPropertyDescriptor: (_t, prop) => ({
    enumerable: true,
    configurable: true,
    value: (activeStore().doc as unknown as Record<string | symbol, unknown>)[prop],
  }),
});

export const setDoc = delegate('setDoc');
export const getModel = delegate('getModel');
export const getDupNodes = delegate('getDupNodes');
export const getRows = delegate('getRows');
export const touchRows = delegate('touchRows');
export const navRequest = delegate('navRequest');
export const setNavRequest = delegate('setNavRequest');
export const selectNode = delegate('selectNode');
export const selectPath = delegate('selectPath');
export const expandedPaths = delegate('expandedPaths');
export const parseNow = delegate('parseNow');
export const saveDraftNow = delegate('saveDraftNow');
export const setText = delegate('setText');
export const loadDocument = delegate('loadDocument');
export const needsReplaceConfirm = delegate('needsReplaceConfirm');
export const clearDocument = delegate('clearDocument');
export const markSaved = delegate('markSaved');
export const transform = delegate('transform');
export const snapshot = delegate('snapshot');
export const confirmLenient = delegate('confirmLenient');
export const ensureParsed = delegate('ensureParsed');
export const getFocus = delegate('getFocus');
export const setFocus = delegate('setFocus');

/** The user's own document: always the active tab. */
export const mainDocument: DocumentStore = {
  get tabId() {
    return activeStore().tabId;
  },
  doc,
  setDoc,
  getModel,
  getDupNodes,
  getRows,
  touchRows,
  navRequest,
  setNavRequest,
  selectNode,
  selectPath,
  expandedPaths,
  parseNow,
  saveDraftNow,
  setText,
  loadDocument,
  needsReplaceConfirm,
  clearDocument,
  markSaved,
  transform,
  snapshot,
  confirmLenient,
  ensureParsed,
  getFocus,
  setFocus,
};

export const DocContext = createContext<DocumentStore>(mainDocument);
/** Document store for the current subtree (the shared-link page provides its own, isolated one). */
export const useDoc = (): DocumentStore => useContext(DocContext);
