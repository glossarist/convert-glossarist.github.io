import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fileSave } from 'browser-fs-access';

import type { Convertor } from 'common';

import styles from './app.module.css';
import { convertors, parse } from './convertors.js';


type Upload = (FileSystemFileEntry | FileSystemDirectoryEntry)[];

const encoder = new TextEncoder();


const App: React.FC<Record<never, never>> = function () {
  const [convertorName, ] =
    useState<keyof typeof convertors>(Object.keys(convertors)[0]);

  async function handleDrop(upload: Upload) {
    if (upload) {
      const results = [];
      for await (const concept of parse(convertorName, upload)) {
        results.push(concept);
      }
      fileSave(new Blob(
        [encoder.encode(JSON.stringify(results))],
        { type: 'application/json' },
      ), {
        fileName: `glossarist-${convertorName}-conversion-result.json`,
      });
    }
  }

  return (
    <div className={styles.app}>
      <div className={styles.instructions}>
        Select the desired convertor and drop files below.
        Download will be initiated when conversion is complete.
      </div>
      <div
          className={styles.convertorSelector}>
        <p>Selected convertor:</p>
        {convertors[convertorName]
          ? <Convertor convertor={convertors[convertorName]} />
          : "No convertor is available."}
        
      </div>
      <DropReceiver onDrop={handleDrop} />
    </div>
  );
};


const Convertor: React.FC<{
  convertor: Convertor<any, any>;
}> = function({ convertor }) {
  return (
    <div className={styles.convertor}>
      <strong>{convertor.label}</strong>
      &ensp;
      <span>Please provide: {convertor.inputDescription ?? '(no description)'}</span>
    </div>
  );
}


const DropReceiver: React.FC<{
  onDrop: (input: Upload) => void;
}> = function ({ onDrop }) {
  function handleDragOver(evt: React.DragEvent) {
    evt.preventDefault();
  }
  function handleDrop(evt: React.DragEvent) {
    evt.preventDefault();
    const uploads = [...evt.dataTransfer.items].
      map(i => i.webkitGetAsEntry()).
      filter(e => e !== null && (e.isFile || e.isDirectory)) as Upload;
    onDrop(uploads);
  }
  return (
    <div
        className={styles.drop}
        onDragOver={handleDragOver}
        onDrop={handleDrop}>
      Drop stuff here…
    </div>
  );
};


export function renderApp(el: Element) {
  return createRoot(el).render(<App />);
}
